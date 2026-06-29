const { randomToken, pkceChallenge } = require('./oauthUtils');

const YANDEX_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const YANDEX_TOKEN_URL = 'https://oauth.yandex.ru/token';
const YANDEX_INFO_URL = 'https://login.yandex.ru/info?format=json';
const YANDEX_SCOPE = process.env.YANDEX_SCOPE || 'login:email login:info login:birthday login:avatar';

function isConfigured() {
  return Boolean(process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET && process.env.YANDEX_REDIRECT_URI);
}

function buildAuthorizeUrl({ state, codeChallenge }) {
  const url = new URL(YANDEX_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.YANDEX_CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.YANDEX_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', YANDEX_SCOPE);
  return url.toString();
}

function createStartParams() {
  const state = randomToken(32);
  const codeVerifier = randomToken(64);
  return { state, codeVerifier, codeChallenge: pkceChallenge(codeVerifier) };
}

async function exchangeCodeForToken({ code, codeVerifier }) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: codeVerifier });
  const basic = Buffer.from(`${process.env.YANDEX_CLIENT_ID}:${process.env.YANDEX_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(YANDEX_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error('yandex_token_exchange_failed');
  return data;
}

async function fetchProfile(accessToken) {
  const res = await fetch(YANDEX_INFO_URL, { headers: { Authorization: `OAuth ${accessToken}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('yandex_profile_failed');
  return data;
}

function normalizeProfile(raw) {
  const firstName = raw.first_name || null;
  const lastName = raw.last_name || null;
  return {
    provider: 'yandex',
    providerUserId: String(raw.psuid || raw.id || ''),
    email: raw.default_email || raw.emails?.[0] || null,
    phone: raw.default_phone?.number || null,
    fullName: raw.real_name || raw.display_name || [firstName, lastName].filter(Boolean).join(' ') || null,
    firstName,
    lastName,
    birthDate: raw.birthday || null,
    rawProfile: raw,
  };
}

module.exports = { isConfigured, createStartParams, buildAuthorizeUrl, exchangeCodeForToken, fetchProfile, normalizeProfile };
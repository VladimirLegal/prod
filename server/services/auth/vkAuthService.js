const { randomToken, pkceChallenge } = require('./oauthUtils');

const VK_TOKEN_URL = 'https://id.vk.ru/oauth2/auth';
const VK_USER_INFO_URL = 'https://id.vk.ru/oauth2/user_info';
const VK_AUTHORIZE_URL = 'https://id.vk.ru/authorize';
const VK_SCOPE = process.env.VK_SCOPE || 'vkid.personal_info email';

function isConfigured() {
  return Boolean(process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET && process.env.VK_SERVICE_TOKEN && process.env.VK_REDIRECT_URI);
}

function createConfig() {
  return { state: randomToken(32), scope: VK_SCOPE };
}

function createStartParams() {
  const state = randomToken(32);
  const codeVerifier = randomToken(64);

  return {
    state,
    codeVerifier,
    codeChallenge: pkceChallenge(codeVerifier),
    scope: VK_SCOPE,
  };
}

function buildAuthorizeUrl({ state, codeChallenge }) {
  const url = new URL(VK_AUTHORIZE_URL);

  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.VK_CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.VK_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', VK_SCOPE);

  return url.toString();
}

async function exchangeCodeForToken({ code, codeVerifier, deviceId }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    device_id: deviceId,
    client_id: process.env.VK_CLIENT_ID,
    redirect_uri: process.env.VK_REDIRECT_URI,
    service_token: process.env.VK_SERVICE_TOKEN,
  });
  const res = await fetch(VK_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error || 'vk_token_exchange_failed');
  return data;
}

async function fetchProfile(accessToken) {
  const body = new URLSearchParams({ access_token: accessToken, client_id: process.env.VK_CLIENT_ID });
  const res = await fetch(VK_USER_INFO_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'vk_profile_failed');
  return data.user || data;
}

function normalizeProfile(raw) {
  const firstName = raw.first_name || raw.firstName || null;
  const lastName = raw.last_name || raw.lastName || null;
  return {
    provider: 'vk',
    providerUserId: String(raw.user_id || raw.id || raw.sub || ''),
    email: raw.email || null,
    phone: raw.phone || raw.phone_number || null,
    fullName: [firstName, lastName].filter(Boolean).join(' ') || raw.name || null,
    firstName,
    lastName,
    birthDate: raw.birthdate || raw.birth_date || null,
    rawProfile: raw,
  };
}

module.exports = {
  VK_TOKEN_URL,
  VK_USER_INFO_URL,
  VK_AUTHORIZE_URL,
  isConfigured,
  createConfig,
  createStartParams,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchProfile,
  normalizeProfile,
};

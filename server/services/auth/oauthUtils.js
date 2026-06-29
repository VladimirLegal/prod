const crypto = require('crypto');

function base64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(bytes = 32) {
  return base64Url(crypto.randomBytes(bytes));
}

function pkceChallenge(verifier) {
  return base64Url(crypto.createHash('sha256').update(verifier).digest());
}

function isSafeReturnTo(value) {
  if (!value || typeof value !== 'string') return false;
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('://');
}

function getPublicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || '').replace(/\/+$/, '');
}

function toFrontendUrl(pathOrUrl) {
  const value = String(pathOrUrl || '');

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const path = value.startsWith('/') ? value : `/${value}`;
  const origin = getPublicAppUrl();

  return origin ? `${origin}${path}` : path;
}

function successRedirect(req) {
  const fromSession = req.session?.externalAuthReturnTo;
  const fallback = process.env.AUTH_SUCCESS_REDIRECT || '/cabinet';

  if (req.session) {
    delete req.session.externalAuthReturnTo;
  }

  const target = isSafeReturnTo(fromSession) ? fromSession : fallback;
  return toFrontendUrl(target);
}

function failureRedirect(error, provider) {
  const base = toFrontendUrl(process.env.AUTH_FAILURE_REDIRECT || '/login');
  const params = new URLSearchParams({ auth_error: error });

  if (provider) {
    params.set('provider', provider);
  }

  return `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;
}

module.exports = { randomToken, pkceChallenge, isSafeReturnTo, successRedirect, failureRedirect };

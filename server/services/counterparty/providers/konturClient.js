function buildBaseUrl() {
  const env = process.env.KONTUR_REALTY_ENV || 'test';
  const version = process.env.KONTUR_REALTY_VERIFICATION_VERSION || 'v1';
  const testBase = process.env.KONTUR_REALTY_API_BASE_URL_TEST || '';
  const prodBase = process.env.KONTUR_REALTY_API_BASE_URL_PROD || '';
  return env === 'prod'
    ? `${prodBase}/verification/${version}`
    : `${testBase}/verification/${version}`;
}

function buildHeaders() {
  const apiKey = process.env.KONTUR_REALTY_API_KEY;
  const orgId = process.env.KONTUR_REALTY_ORG_ID;
  return {
    'Content-Type': 'application/json',
    Authorization: `ReestroAuth apiKey=${apiKey}&portal.orgid=${orgId}`,
  };
}

async function safeRequest(path, options = {}) {
  const baseUrl = buildBaseUrl();
  if (!baseUrl || !process.env.KONTUR_REALTY_API_KEY) {
    return { status: 'error', error: 'kontur_not_configured' };
  }
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: { ...buildHeaders(), ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) return { status: 'error', error: `http_${res.status}` };
    const json = await res.json().catch(() => null);
    if (!json) return { status: 'error', error: 'invalid_json' };
    return json;
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

async function createSubject(personData) {
  return safeRequest('/subjects', { method: 'POST', body: personData });
}

async function createCheck(subjectId, modules) {
  return safeRequest('/checks', { method: 'POST', body: { subjectId, modules } });
}

async function getCheck(checkId) {
  return safeRequest(`/checks/${encodeURIComponent(checkId)}`);
}

async function getEvents(params = {}) {
  return safeRequest(`/events?${new URLSearchParams(params).toString()}`);
}

async function requestAnalytics(body) {
  return safeRequest('/analytics', { method: 'POST', body });
}

module.exports = {
  createSubject,
  createCheck,
  getCheck,
  getEvents,
  requestAnalytics,
};
const { URLSearchParams } = require('url');

async function request(resource, params = {}) {
  const baseUrl = process.env.APICLOUD_BASE_URL || '';
  const token = process.env.APICLOUD_API_TOKEN;
  if (!baseUrl || !token) {
    return { status: 'error', error: 'apicloud_not_configured' };
  }

  const searchParams = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') searchParams.append(k, v);
  });
  searchParams.append('token', token);

  const url = `${baseUrl.replace(/\/$/, '')}/${resource}?${searchParams.toString()}`;

  const timeoutMs = Number(process.env.APICLOUD_TIMEOUT_MS || 10000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      return { status: 'error', error: `http_${res.status}` };
    }
    const json = await res.json().catch(() => null);
    if (!json) return { status: 'error', error: 'invalid_json' };
    return json;
  } catch (err) {
    clearTimeout(timeout);
    return { status: 'error', error: err && err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

module.exports = {
  request,
};
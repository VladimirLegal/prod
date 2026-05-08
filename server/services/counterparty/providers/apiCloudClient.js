const { URLSearchParams } = require('url');

const APICLOUD_MAX_CONCURRENT = Math.max(
  1,
  Number(process.env.APICLOUD_MAX_CONCURRENT || 16)
);

const APICLOUD_MIN_INTERVAL_MS = Math.max(
  0,
  Number(process.env.APICLOUD_MIN_INTERVAL_MS || 0)
);

let activeApiCloudRequests = 0;
let lastApiCloudRequestStartedAt = 0;
let apiCloudDrainTimer = null;

const apiCloudRequestQueue = [];

function drainApiCloudQueue() {
  if (!apiCloudRequestQueue.length) {
    return;
  }

  if (activeApiCloudRequests >= APICLOUD_MAX_CONCURRENT) {
    return;
  }

  if (apiCloudDrainTimer) {
    return;
  }

  const now = Date.now();
  const waitMs = Math.max(
    0,
    lastApiCloudRequestStartedAt + APICLOUD_MIN_INTERVAL_MS - now
  );

  if (waitMs > 0) {
    apiCloudDrainTimer = setTimeout(() => {
      apiCloudDrainTimer = null;
      drainApiCloudQueue();
    }, waitMs);

    return;
  }

  const resolve = apiCloudRequestQueue.shift();

  activeApiCloudRequests += 1;
  lastApiCloudRequestStartedAt = Date.now();

  resolve(() => {
    activeApiCloudRequests = Math.max(0, activeApiCloudRequests - 1);
    drainApiCloudQueue();
  });

  drainApiCloudQueue();
}

function acquireApiCloudSlot() {
  return new Promise((resolve) => {
    apiCloudRequestQueue.push(resolve);
    drainApiCloudQueue();
  });
}

async function request(resource, params = {}, requestOptions = {}) {
  const baseUrl = process.env.APICLOUD_BASE_URL || '';
  const token = process.env.APICLOUD_API_TOKEN;

  if (!baseUrl || !token) {
    return { status: 'error', error: 'apicloud_not_configured' };
  }

  const searchParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      searchParams.append(k, v);
    }
  });

  searchParams.append('token', token);

  const url = `${baseUrl.replace(/\/$/, '')}/${resource}?${searchParams.toString()}`;

  const timeoutMs = Number(
    requestOptions.timeoutMs ||
    process.env.APICLOUD_TIMEOUT_MS ||
    10000
  );

  const queuedAt = Date.now();

  let releaseApiCloudSlot = null;
  let timeout = null;

  try {
    releaseApiCloudSlot = await acquireApiCloudSlot();

    const queueWaitMs = Date.now() - queuedAt;

    console.log('[APICLOUD REQUEST]', {
      resource,
      queueWaitMs,
      activeApiCloudRequests,
      apiCloudQueueSize: apiCloudRequestQueue.length,
      maxConcurrent: APICLOUD_MAX_CONCURRENT,
      minIntervalMs: APICLOUD_MIN_INTERVAL_MS,
    });

    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        status: 'error',
        error: `http_${res.status}`,
        httpStatus: res.status,
      };
    }

    const json = await res.json().catch(() => null);

    if (!json) {
      return {
        status: 'error',
        error: 'invalid_json',
      };
    }

    return json;
  } catch (err) {
    return {
      status: 'error',
      error: err?.name === 'AbortError' ? 'timeout' : err?.message || 'network_error',
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }

    if (typeof releaseApiCloudSlot === 'function') {
      releaseApiCloudSlot();
    }
  }
}

module.exports = {
  request,
};
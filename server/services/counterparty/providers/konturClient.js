const KONTUR_MAX_CONCURRENT = Math.max(
  1,
  Number(process.env.KONTUR_MAX_CONCURRENT || 4)
);

const KONTUR_MIN_INTERVAL_MS = Math.max(
  0,
  Number(process.env.KONTUR_MIN_INTERVAL_MS || 120)
);

let activeKonturRequests = 0;
let lastKonturRequestStartedAt = 0;
let konturDrainTimer = null;

const konturRequestQueue = [];

function drainKonturQueue() {
  if (!konturRequestQueue.length) {
    return;
  }

  if (activeKonturRequests >= KONTUR_MAX_CONCURRENT) {
    return;
  }

  if (konturDrainTimer) {
    return;
  }

  const now = Date.now();
  const waitMs = Math.max(
    0,
    lastKonturRequestStartedAt + KONTUR_MIN_INTERVAL_MS - now
  );

  if (waitMs > 0) {
    konturDrainTimer = setTimeout(() => {
      konturDrainTimer = null;
      drainKonturQueue();
    }, waitMs);

    return;
  }

  const resolve = konturRequestQueue.shift();

  activeKonturRequests += 1;
  lastKonturRequestStartedAt = Date.now();

  resolve(() => {
    activeKonturRequests = Math.max(0, activeKonturRequests - 1);
    drainKonturQueue();
  });

  drainKonturQueue();
}

function acquireKonturSlot() {
  return new Promise((resolve) => {
    konturRequestQueue.push(resolve);
    drainKonturQueue();
  });
}

function getBaseUrl() {
  const env = String(process.env.KONTUR_REALTY_ENV || 'test').toLowerCase();
  const version = process.env.KONTUR_REALTY_VERIFICATION_VERSION || 'v2.1';

  const root =
    env === 'prod'
      ? process.env.KONTUR_REALTY_API_BASE_URL_PROD
      : process.env.KONTUR_REALTY_API_BASE_URL_TEST;

  if (!root) {
    throw new Error('KONTUR_REALTY_API_BASE_URL is not configured');
  }

  return `${root.replace(/\/$/, '')}/assessment/v2.1`;
}

function buildHeaders(extra = {}) {
  const apiKey = process.env.KONTUR_REALTY_API_KEY;
  const orgId = process.env.KONTUR_REALTY_ORG_ID;

  if (!apiKey || !orgId) {
    throw new Error('KONTUR_REALTY_API_KEY or KONTUR_REALTY_ORG_ID is not configured');
  }

  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `ReestroAuth apiKey=${apiKey}&portal.orgid=${orgId}`,
    ...extra,
  };
}

async function safeRequest(path, options = {}) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const timeoutMs = Number(process.env.KONTUR_REALTY_TIMEOUT_MS || 90000);

  const queuedAt = Date.now();

  let releaseKonturSlot = null;
  let timer = null;

  try {
    releaseKonturSlot = await acquireKonturSlot();

    const queueWaitMs = Date.now() - queuedAt;

    console.log('[KONTUR REQUEST]', {
      env: process.env.KONTUR_REALTY_ENV,
      baseUrl,
      url,
      queueWaitMs,
      activeKonturRequests,
      konturQueueSize: konturRequestQueue.length,
      maxConcurrent: KONTUR_MAX_CONCURRENT,
      minIntervalMs: KONTUR_MIN_INTERVAL_MS,
    });

    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: buildHeaders(options.headers || {}),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const etag = res.headers.get('etag') || res.headers.get('ETag') || null;

    if (res.status === 304) {
      return {
        ok: true,
        httpStatus: 304,
        notModified: true,
        etag,
      };
    }

    const text = await res.text();
    let json = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      return {
        ok: false,
        status: 'error',
        error: `http_${res.status}`,
        httpStatus: res.status,
        etag,
        message:
          json?.message ||
          json?.error?.message ||
          `HTTP ${res.status}`,
        errors: Array.isArray(json?.errors) ? json.errors : [],
        raw: json ?? text,
      };
    }

    return {
      ok: true,
      httpStatus: res.status,
      etag,
      ...(json || {}),
    };
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';
    const causeMessage = err?.cause?.message ? `: ${err.cause.message}` : '';

    return {
      ok: false,
      status: 'error',
      error: isTimeout ? 'timeout_error' : 'network_error',
      message: isTimeout
        ? `Таймаут при обращении к Контур API (${timeoutMs} мс)`
        : `${err.message || 'Ошибка сети при обращении к Контур API'}${causeMessage}`,
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }

    if (typeof releaseKonturSlot === 'function') {
      releaseKonturSlot();
    }
  }
}

async function createSubject(subjectBody) {
  return safeRequest('/subjects', {
    method: 'POST',
    body: subjectBody,
  });
}

async function createCheck(checkBody) {
  return safeRequest('/checks', {
    method: 'POST',
    body: checkBody,
  });
}

async function getCheck(checkId, options = {}) {
  const headers = {};

  if (options.etag) {
    headers['If-None-Match'] = options.etag;
  }

  return safeRequest(`/checks/${encodeURIComponent(checkId)}`, {
    method: 'GET',
    headers,
  });
}

async function getEvents(params = {}) {
  const query = new URLSearchParams(params).toString();
  const path = query ? `/events?${query}` : '/events';

  return safeRequest(path, { method: 'GET' });
}

module.exports = {
  createSubject,
  createCheck,
  getCheck,
  getEvents,
};
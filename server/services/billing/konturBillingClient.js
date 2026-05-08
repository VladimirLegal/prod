const { URLSearchParams } = require('url');

function getRootUrl() {
  const env = String(process.env.KONTUR_REALTY_ENV || 'test').toLowerCase();

  const root =
    env === 'prod'
      ? process.env.KONTUR_REALTY_API_BASE_URL_PROD
      : process.env.KONTUR_REALTY_API_BASE_URL_TEST;

  if (!root) {
    throw new Error('KONTUR_REALTY_API_BASE_URL is not configured');
  }

  return root.replace(/\/$/, '');
}

function getBillingBaseUrl() {
  if (process.env.KONTUR_REALTY_BILLING_BASE_URL) {
    return process.env.KONTUR_REALTY_BILLING_BASE_URL.replace(/\/$/, '');
  }

  return `${getRootUrl()}/billing/v1`;
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

function isIsoDateOnly(value = '') {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function toKonturDateTime(value = '', { endOfDay = false } = {}) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '';
  }

  if (isIsoDateOnly(raw)) {
    return endOfDay
      ? `${raw}T23:59:59.999Z`
      : `${raw}T00:00:00.000Z`;
  }

  const parsed = new Date(raw);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return raw;
}

function buildUrl(path, params = {}) {
  const baseUrl = getBillingBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  const searchParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, value);
    }
  });

  const query = searchParams.toString();

  return `${baseUrl}${cleanPath}${query ? `?${query}` : ''}`;
}

async function safeRequest(path, { params = {}, method = 'GET' } = {}) {
  const url = buildUrl(path, params);
  const timeoutMs = Number(process.env.KONTUR_BILLING_TIMEOUT_MS || 90000);

  let timer = null;

  try {
    console.log('[KONTUR BILLING REQUEST]', {
      env: process.env.KONTUR_REALTY_ENV,
      baseUrl: getBillingBaseUrl(),
      path,
      hasParams: Object.keys(params || {}).length > 0,
    });

    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method,
      headers: buildHeaders(),
      signal: controller.signal,
    });

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
        httpStatus: res.status,
        error: `http_${res.status}`,
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
      ...(json || {}),
    };
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';

    return {
      ok: false,
      httpStatus: 0,
      error: isTimeout ? 'timeout_error' : 'network_error',
      message: isTimeout
        ? `Таймаут при обращении к Контур Billing API (${timeoutMs} мс)`
        : err?.message || 'Ошибка сети при обращении к Контур Billing API',
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function normalizeMeasurement(value = {}) {
  if (!value || typeof value !== 'object') {
    return {
      value: '',
      unit: '',
      unitClass: '',
    };
  }

  return {
    value: value.value ?? '',
    unit: value.unit ?? value.unitClass ?? '',
    unitClass: value.unitClass ?? value.unit ?? '',
  };
}

function normalizeService(item = {}) {
  const balance = normalizeMeasurement(item.balance);

  return {
    id: item.id || '',
    startDate: item.startDate || '',
    endDate: item.endDate || '',
    balance,
    overdraft: item.overdraft ?? null,
    typeCode: item.type?.code || '',
    typeDescription: item.type?.description || '',
    productCode: item.type?.productCode || '',
    tariffType: item.tariffType || '',
    raw: item,
  };
}

function normalizeOperation(item = {}) {
  const amount = normalizeMeasurement(item.amount);

  return {
    operationId: item.operationId || '',
    amount,
    createdAt: item.createdAt || '',
    operationType: item.operationType || '',
    serviceId: item.serviceId || '',
    raw: item,
  };
}

function assertKonturOk(raw = {}) {
  if (raw?.ok) {
    return;
  }

  const error = new Error(raw?.message || raw?.error || 'kontur_billing_error');
  error.raw = raw;
  throw error;
}

async function getBalance() {
  const raw = await safeRequest('/balance');

  assertKonturOk(raw);

  const items = Array.isArray(raw.items) ? raw.items : [];

  return {
    provider: 'kontur',
    items: items.map(normalizeService),
    raw,
  };
}

async function getOperations({ serviceId, from, to, token, count } = {}) {
  if (!serviceId) {
    throw new Error('serviceId_required');
  }

  const params = {
    serviceId,
    from: toKonturDateTime(from, { endOfDay: false }),
    to: toKonturDateTime(to, { endOfDay: true }),
    token,
    count,
  };

  const raw = await safeRequest('/balance/operations', { params });

  assertKonturOk(raw);

  const operations = Array.isArray(raw.operations) ? raw.operations : [];

  return {
    provider: 'kontur',
    serviceId,
    token: raw.token || null,
    operations: operations.map(normalizeOperation),
    raw,
  };
}

module.exports = {
  getBalance,
  getOperations,
};
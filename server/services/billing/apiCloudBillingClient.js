const { request } = require('../counterparty/providers/apiCloudClient');

function isIsoDate(value = '') {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function isoToRuDate(value = '') {
  const raw = String(value || '').trim();

  if (!isIsoDate(raw)) {
    return '';
  }

  const [yyyy, mm, dd] = raw.split('-');
  return `${dd}.${mm}.${yyyy}`;
}

function buildPeriod({ from, to } = {}) {
  const fromRu = isoToRuDate(from);
  const toRu = isoToRuDate(to);

  if (!fromRu || !toRu) {
    throw new Error('invalid_period');
  }

  return fromRu === toRu ? fromRu : `${fromRu}-${toRu}`;
}

function getFieldValue(row = {}, key) {
  const value = row?.[key];

  if (value && typeof value === 'object' && 'value' in value) {
    return value.value;
  }

  return value ?? '';
}

function normalizeOperationRow(row = {}) {
  return {
    api: getFieldValue(row, 'api'),
    count: Number(getFieldValue(row, 'count') || 0),
    sumPay: Number(getFieldValue(row, 'sumPay') || 0),
    sumBack: Number(getFieldValue(row, 'sumBack') || 0),
    itogo: Number(getFieldValue(row, 'itogo') || 0),
    avgTarif: Number(getFieldValue(row, 'avgTarif') || 0),
    raw: row,
  };
}

function assertApiCloudOk(raw = {}) {
  if (String(raw?.status) === '200' || raw?.status === 200) {
    return;
  }

  const error = new Error(raw?.message || raw?.errormsg || raw?.error || 'apicloud_billing_error');
  error.raw = raw;
  throw error;
}

async function getBalance() {
  const raw = await request(
    'apilk.php',
    {
      type: 'balance',
      mgpInfo: 1,
    },
    {
      timeoutMs: Number(process.env.APICLOUD_BILLING_TIMEOUT_MS || 30000),
    }
  );

  assertApiCloudOk(raw);

  return {
    provider: 'apicloud',
    status: raw.status,
    balance: raw.balance ?? null,
    credit: raw.credit ?? null,
    mgp: raw.mgp || null,
    raw,
  };
}

async function getOperations({ from, to } = {}) {
  const period = buildPeriod({ from, to });

  const raw = await request(
    'apilk.php',
    {
      type: 'reportOperations',
      period,
    },
    {
      timeoutMs: Number(process.env.APICLOUD_BILLING_TIMEOUT_MS || 30000),
    }
  );

  assertApiCloudOk(raw);

  const result = Array.isArray(raw.result) ? raw.result : [];

  return {
    provider: 'apicloud',
    status: raw.status,
    period,
    dateStart: raw.date_st || raw.dateStart || null,
    dateStop: raw.date_st_stop || raw.dateStop || null,
    items: result.map(normalizeOperationRow),
    raw,
  };
}

module.exports = {
  getBalance,
  getOperations,
};
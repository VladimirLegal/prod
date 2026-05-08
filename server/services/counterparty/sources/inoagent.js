const { request } = require('../providers/apiCloudClient');

function toDigits(value = '') {
  return String(value || '').replace(/\D+/g, '');
}

function normalizeText(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}.${iso[2]}.${iso[1]}`;
  }

  const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) {
    return raw;
  }

  return raw || null;
}

function buildSearchValue(person = {}) {
  const inn = toDigits(person?.inn || '');
  const snils = toDigits(person?.snils || '');
  const fullName = normalizeText(person?.fullName || '');

  if (inn) return inn;
  if (snils) return snils;
  return fullName;
}

function normalizeRecord(record = {}) {
  const exclusionDate =
    record?.date_exception ||
    record?.dateException ||
    null;

  const inclusionDate =
    record?.date_inclusion ||
    record?.date_start ||
    record?.dateStart ||
    null;

  const publishDate =
    record?.date_publish ||
    record?.datePublish ||
    null;

  const decisionDate =
    record?.date_decision ||
    record?.dateDecision ||
    null;

  const updateDate =
    record?.date_update ||
    record?.dateUpdate ||
    null;

  const grounds = Array.isArray(record?.osnovanie)
    ? record.osnovanie.filter(Boolean)
    : Array.isArray(record?.reason)
    ? record.reason.filter(Boolean)
    : Array.isArray(record?.grounds)
    ? record.grounds.filter(Boolean)
    : record?.osnovanie
    ? [record.osnovanie]
    : record?.reason
    ? [record.reason]
    : record?.grounds
    ? [record.grounds]
    : [];

  const fullName =
    record?.name ||
    record?.fio ||
    record?.fullName ||
    null;

  const recordType =
    record?.type ||
    record?.recordType ||
    null;

  return {
    kind: 'inoagent_record',

    fullName,
    recordType,
    birthDate: normalizeDate(
        record?.birth ||
        record?.birthdate ||
        record?.birthDate ||
        null
    ),
    inn: record?.inn || null,
    snils: record?.snils || null,
    ogrn: record?.ogrn || null,
    regnum: record?.regnum || null,
    address: record?.address || null,

    domains: Array.isArray(record?.domen) ? record.domen.filter(Boolean) : [],
    participants: Array.isArray(record?.fioUchastnikov) ? record.fioUchastnikov.filter(Boolean) : [],

    inclusionDate: normalizeDate(inclusionDate),
    publishDate: normalizeDate(publishDate),
    decisionDate: normalizeDate(decisionDate),
    exclusionDate: normalizeDate(exclusionDate),
    updateDate: normalizeDate(updateDate),

    grounds,
    isExcluded: !!exclusionDate,
    statusText: exclusionDate ? 'Исключён из реестра' : 'Состоит в реестре',

    rawRecord: record,
  };
}

function buildEmptySummary() {
  return {
    totalCount: 0,
    activeCount: 0,
    excludedCount: 0,
    hasMatches: false,
    hasActiveMatches: false,
    hasExcludedMatches: false,
    dateUpdate: null,
  };
}

function buildSummary(records = [], response = {}) {
  const activeCount = records.filter((item) => !item.isExcluded).length;
  const excludedCount = records.filter((item) => item.isExcluded).length;

  return {
    totalCount: records.length,
    activeCount,
    excludedCount,
    hasMatches: records.length > 0,
    hasActiveMatches: activeCount > 0,
    hasExcludedMatches: excludedCount > 0,
    dateUpdate:
      normalizeDate(response?.date_update || response?.dateUpdate || null),
  };
}

async function checkInoagent(person, options = {}) {
  const search = buildSearchValue(person);

  let response = null;

  if (process.env.APICLOUD_API_TOKEN && search) {
    response = await request(
        'inoagent.php',
        {
            type: 'search',
            string: search,
        },
        {
            timeoutMs: Number(process.env.APICLOUD_INOAGENT_TIMEOUT_MS || 120000),
        }
    );
  }

  let result = {
    status: 'empty',
    provider: 'apicloud',
    items: [],
    summary: buildEmptySummary(),
    raw: response || null,
  };

  if (!response) {
    return result;
  }

  if (response?.error) {
    result.status = 'error';
    result.items = [
      {
        kind: 'inoagent_lookup',
        isFound: null,
        foundCount: null,
        resultState: response.status || null,
        resultStateText: 'Ошибка проверки',
        message:
          response.message ||
          `Ошибка API реестра иноагентов (error=${response.error})`,
        records: [],
        rawRecord: response,
      },
    ];
    return result;
  }

  if (typeof response.status !== 'number' || response.status !== 200) {
    result.status = 'error';
    result.items = [
      {
        kind: 'inoagent_lookup',
        isFound: null,
        foundCount: null,
        resultState: response.status || null,
        resultStateText: 'Ошибка проверки',
        message:
          response.message ||
          'Неизвестный ответ от API реестра иноагентов',
        records: [],
        rawRecord: response,
      },
    ];
    return result;
  }

  const rawRecords = Array.isArray(response.result)
    ? response.result
    : Array.isArray(response.records)
    ? response.records
    : [];

  const records = rawRecords.map(normalizeRecord);
  const summary = buildSummary(records, response);

  result.summary = summary;

  if (!records.length) {
    result.status = 'empty';
    result.items = [
      {
        kind: 'inoagent_lookup',
        isFound: false,
        foundCount: 0,
        resultState: 'Данные получены',
        resultStateText: 'Сведения в реестре иноагентов не найдены',
        message: 'Сведения в реестре иноагентов не найдены',
        records: [],
        rawRecord: response,
      },
    ];
    return result;
  }

  result.status = 'ok';
  result.items = [
    {
      kind: 'inoagent_lookup',
      isFound: true,
      foundCount: records.length,
      resultState: 'Данные получены',
      resultStateText: 'Найдены совпадения в реестре иноагентов',
      message: 'Найдены совпадения в реестре иноагентов',
      records,
      rawRecord: response,
    },
  ];

  return result;
}

module.exports = checkInoagent;
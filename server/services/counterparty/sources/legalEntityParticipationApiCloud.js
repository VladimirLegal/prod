const { request } = require('../providers/apiCloudClient');

const ROLE_DIRECTOR = 'director';
const ROLE_FOUNDER = 'founder';

function cleanText(value) {
  return String(value ?? '').trim();
}

function toDigits(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

function normalizeNameKey(value) {
  return cleanText(value)
    .toLocaleLowerCase('ru-RU')
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getOrganizationKey(record = {}, bucket = '', index = 0) {
  const inn = toDigits(record?.inn);
  const ogrn = toDigits(record?.ogrn);
  const name = normalizeNameKey(record?.namep || record?.namec);

  if (inn) return `inn:${inn}`;
  if (ogrn) return `ogrn:${ogrn}`;
  if (name) return `name:${name}`;

  return `unknown:${bucket}:${index}`;
}

function parseDataReliability(invalidValue) {
  const value = cleanText(invalidValue);

  if (value === '0') return true;
  if (value === '1') return false;

  return null;
}

function mergeDataReliability(currentValue, nextValue) {
  if (currentValue === false || nextValue === false) {
    return false;
  }

  if (currentValue === true || nextValue === true) {
    return true;
  }

  return null;
}

function resolveActiveStatus(statusText) {
  const value = cleanText(statusText).toLocaleLowerCase('ru-RU');

  if (!value) return null;

  if (
    value.includes('недейств') ||
    value.includes('ликвид') ||
    value.includes('прекращ') ||
    value.includes('исключен') ||
    value.includes('исключён')
  ) {
    return false;
  }

  if (value.includes('действующ')) {
    return true;
  }

  return null;
}

function getRolesText(roles = []) {
  const roleSet = new Set(Array.isArray(roles) ? roles : []);

  if (roleSet.has(ROLE_DIRECTOR) && roleSet.has(ROLE_FOUNDER)) {
    return 'Руководитель и учредитель';
  }

  if (roleSet.has(ROLE_DIRECTOR)) {
    return 'Руководитель';
  }

  if (roleSet.has(ROLE_FOUNDER)) {
    return 'Учредитель';
  }

  return 'Роль не указана';
}

function buildEmptySummary() {
  return {
    totalCount: 0,

    directorCount: 0,
    founderCount: 0,

    directorOnlyCount: 0,
    founderOnlyCount: 0,
    directorAndFounderCount: 0,

    activeCount: 0,
    inactiveCount: 0,
    unknownStatusCount: 0,

    reliableCount: 0,
    unreliableCount: 0,
    unknownReliabilityCount: 0,

    hasOrganizations: false,
  };
}

function buildSummary(items = []) {
  const safeItems = Array.isArray(items) ? items : [];

  const hasRole = (item, role) =>
    Array.isArray(item?.roles) && item.roles.includes(role);

  const directorCount = safeItems.filter((item) =>
    hasRole(item, ROLE_DIRECTOR)
  ).length;

  const founderCount = safeItems.filter((item) =>
    hasRole(item, ROLE_FOUNDER)
  ).length;

  const directorAndFounderCount = safeItems.filter(
    (item) =>
      hasRole(item, ROLE_DIRECTOR) &&
      hasRole(item, ROLE_FOUNDER)
  ).length;

  const directorOnlyCount = safeItems.filter(
    (item) =>
      hasRole(item, ROLE_DIRECTOR) &&
      !hasRole(item, ROLE_FOUNDER)
  ).length;

  const founderOnlyCount = safeItems.filter(
    (item) =>
      hasRole(item, ROLE_FOUNDER) &&
      !hasRole(item, ROLE_DIRECTOR)
  ).length;

  const activeCount = safeItems.filter(
    (item) => item?.isActive === true
  ).length;

  const inactiveCount = safeItems.filter(
    (item) => item?.isActive === false
  ).length;

  const reliableCount = safeItems.filter(
    (item) => item?.isDataReliable === true
  ).length;

  const unreliableCount = safeItems.filter(
    (item) => item?.isDataReliable === false
  ).length;

  return {
    totalCount: safeItems.length,

    directorCount,
    founderCount,

    directorOnlyCount,
    founderOnlyCount,
    directorAndFounderCount,

    activeCount,
    inactiveCount,
    unknownStatusCount:
      safeItems.length - activeCount - inactiveCount,

    reliableCount,
    unreliableCount,
    unknownReliabilityCount:
      safeItems.length - reliableCount - unreliableCount,

    hasOrganizations: safeItems.length > 0,
  };
}

function mergeOrganizationRecord(
  organizationsMap,
  record,
  role,
  bucket,
  index
) {
  if (!record || typeof record !== 'object') {
    return;
  }

  const organizationKey = getOrganizationKey(record, bucket, index);

  const current =
    organizationsMap.get(organizationKey) || {
      kind: 'legal_entity_participation',
      organizationKey,

      shortName: null,
      fullName: null,

      companyInn: null,
      companyOgrn: null,

      region: null,
      registrationDate: null,

      okved: null,
      okvedName: null,

      statusText: null,
      isActive: null,

      isDataReliable: null,
      dataReliabilityText: 'Достоверность не указана',

      roles: [],
      rolesText: 'Роль не указана',

      boUrl: null,

      rawRecords: {
        upr: [],
        uchr: [],
      },
    };

  current.shortName =
    current.shortName ||
    cleanText(record?.namec) ||
    cleanText(record?.namep) ||
    null;

  current.fullName =
    current.fullName ||
    cleanText(record?.namep) ||
    cleanText(record?.namec) ||
    null;

  current.companyInn =
    current.companyInn ||
    toDigits(record?.inn) ||
    null;

  current.companyOgrn =
    current.companyOgrn ||
    toDigits(record?.ogrn) ||
    null;

  current.region =
    current.region ||
    cleanText(record?.regionname) ||
    null;

  current.registrationDate =
    current.registrationDate ||
    cleanText(record?.reg) ||
    null;

  current.okved =
    current.okved ||
    cleanText(record?.okved) ||
    null;

  current.okvedName =
    current.okvedName ||
    cleanText(record?.okvedname) ||
    null;

  current.statusText =
    current.statusText ||
    cleanText(record?.sulst_name_ex) ||
    null;

  current.boUrl =
    current.boUrl ||
    cleanText(record?.bourl) ||
    null;

  current.isDataReliable = mergeDataReliability(
    current.isDataReliable,
    parseDataReliability(record?.invalid)
  );

  current.roles = [
    ...new Set([
      ...(Array.isArray(current.roles) ? current.roles : []),
      role,
    ]),
  ];

  if (!current.rawRecords[bucket]) {
    current.rawRecords[bucket] = [];
  }

  current.rawRecords[bucket].push(record);

  organizationsMap.set(organizationKey, current);
}

function finalizeOrganization(item = {}) {
  const roles = [ROLE_DIRECTOR, ROLE_FOUNDER].filter((role) =>
    Array.isArray(item?.roles) && item.roles.includes(role)
  );

  const isDataReliable =
    item?.isDataReliable === true
      ? true
      : item?.isDataReliable === false
      ? false
      : null;

  return {
    ...item,

    roles,
    rolesText: getRolesText(roles),

    isActive: resolveActiveStatus(item?.statusText),

    isDataReliable,
    dataReliabilityText:
      isDataReliable === true
        ? 'Сведения достоверны'
        : isDataReliable === false
        ? 'Сведения недостоверны'
        : 'Достоверность не указана',
  };
}

async function checkLegalEntityParticipationApiCloud(person) {
  const inn = toDigits(person?.inn);

  if (!inn) {
    return {
      status: 'skipped',
      provider: 'apicloud',
      affectsRisk: false,
      message:
        'Проверка не запускалась: не указан ИНН физического лица.',
      items: [],
      summary: buildEmptySummary(),
      raw: {
        step: 'skipped',
        missing: ['inn'],
      },
    };
  }

  if (inn.length !== 12) {
    return {
      status: 'skipped',
      provider: 'apicloud',
      affectsRisk: false,
      message:
        'Проверка не запускалась: для поиска участия в юридических лицах нужен 12-значный ИНН физического лица.',
      items: [],
      summary: buildEmptySummary(),
      raw: {
        step: 'skipped',
        reason: 'physical_inn_required',
        innLength: inn.length,
      },
    };
  }

  const response = await request('pb_nalog.php', {
    type: 'search_upr_uchr',
    inn,
  });

  if (Number(response?.status) !== 200) {
    return {
      status: 'error',
      provider: 'apicloud',
      affectsRisk: false,
      error:
        response?.error ||
        'legal_entity_participation_failed',
      message:
        response?.message ||
        'Не удалось получить сведения об участии в юридических лицах.',
      items: [],
      summary: buildEmptySummary(),
      raw: response,
    };
  }

  const directorRecords = Array.isArray(
    response?.data?.upr?.result
  )
    ? response.data.upr.result
    : [];

  const founderRecords = Array.isArray(
    response?.data?.uchr?.result
  )
    ? response.data.uchr.result
    : [];

  const organizationsMap = new Map();

  directorRecords.forEach((record, index) => {
    mergeOrganizationRecord(
      organizationsMap,
      record,
      ROLE_DIRECTOR,
      'upr',
      index
    );
  });

  founderRecords.forEach((record, index) => {
    mergeOrganizationRecord(
      organizationsMap,
      record,
      ROLE_FOUNDER,
      'uchr',
      index
    );
  });

  const items = Array.from(organizationsMap.values())
    .map(finalizeOrganization)
    .sort((a, b) =>
      String(a?.shortName || a?.fullName || '').localeCompare(
        String(b?.shortName || b?.fullName || ''),
        'ru'
      )
    );

  const summary = buildSummary(items);

  return {
    status: items.length ? 'ok' : 'empty',
    provider: 'apicloud',
    affectsRisk: false,

    message: items.length
      ? `Найдены сведения об участии проверяемого в ${items.length} юридических лицах.`
      : 'Сведения об участии проверяемого в юридических лицах не найдены.',

    items,
    summary,
    raw: response,
  };
}

module.exports = checkLegalEntityParticipationApiCloud;
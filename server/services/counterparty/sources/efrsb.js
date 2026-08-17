const { request } = require('../providers/apiCloudClient');

function toDigits(value = '') {
  return String(value || '').replace(/\D+/g, '');
}

function normalizeIsoDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) {
    return `${ru[3]}-${ru[2]}-${ru[1]}`;
  }

  return '';
}

function normalizeName(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function buildBankruptcyStatusText(isActive, status, description) {
  if (isActive === true) {
    return status || description || 'Активная процедура банкротства';
  }

  if (isActive === false) {
    return status || description || 'Процедура завершена';
  }

  return status || description || 'Статус не определён';
}

function buildMatchData(person = {}, record = {}) {
  const personFullName = normalizeName(person?.fullName || '');
  const recordFullName = normalizeName(record?.fullName || '');

  const personBirthDate = normalizeIsoDate(person?.birthDate || '');
  const recordBirthDate = normalizeIsoDate(record?.birthDate || '');

  const personInn = toDigits(person?.inn || '');
  const recordInn = toDigits(record?.inn || '');

  const personSnils = toDigits(person?.snils || '');
  const recordSnils = toDigits(record?.snils || '');

  const matchedBy = [];

  const fioMatched =
    !!personFullName &&
    !!recordFullName &&
    personFullName === recordFullName;

  const birthDateMatched =
    !!personBirthDate &&
    !!recordBirthDate &&
    personBirthDate === recordBirthDate;

  const innMatched =
    !!personInn &&
    !!recordInn &&
    personInn === recordInn;

  const snilsMatched =
    !!personSnils &&
    !!recordSnils &&
    personSnils === recordSnils;

  if (fioMatched) matchedBy.push('ФИО');
  if (birthDateMatched) matchedBy.push('Дата рождения');
  if (innMatched) matchedBy.push('ИНН');
  if (snilsMatched) matchedBy.push('СНИЛС');

  let matchType = 'WeakMatch';
  let matchText = 'Совпадение только по ФИО';

  if (innMatched || snilsMatched || (fioMatched && birthDateMatched && (innMatched || snilsMatched))) {
    matchType = 'FullMatch';
    matchText = matchedBy.length
      ? `Совпадение по ${matchedBy.join(', ')}`
      : 'Полное совпадение';
  } else if (fioMatched && birthDateMatched) {
    matchType = 'PartialMatch';
    matchText = 'Совпадение по ФИО и дате рождения';
  } else if (fioMatched && innMatched) {
    matchType = 'PartialMatch';
    matchText = 'Совпадение по ФИО и ИНН';
  } else if (fioMatched) {
    matchType = 'WeakMatch';
    matchText = 'Совпадение только по ФИО';
  } else {
    matchType = 'NotMatch';
    matchText = 'Совпадение не подтверждено';
  }

  return {
    matchType,
    matchText,
    matchedBy,
    fioMatched,
    birthDateMatched,
    innMatched,
    snilsMatched,
    isStrongMatch: matchType === 'FullMatch',
    isRelevantMatch: matchType === 'FullMatch' || matchType === 'PartialMatch',
  };
}

function buildEmptySummary() {
  return {
    totalCount: 0,
    activeCount: 0,
    finishedCount: 0,
    unknownCount: 0,
    hasActiveBankruptcy: false,
    hasFinishedBankruptcy: false,
    activeItems: [],
    finishedItems: [],
  };
}

function buildSummary(items = [], organizationMode = false) {
  const activeItems = items.filter((item) => organizationMode
    ? item.procedureState === 'active'
    : item.isActive === true);
  const finishedItems = items.filter((item) => organizationMode
    ? item.procedureState === 'finished'
    : item.isActive === false);
  const unknownItems = organizationMode
    ? items.filter((item) => item.procedureState === 'unknown')
    : [];

  return {
    totalCount: items.length,
    activeCount: activeItems.length,
    finishedCount: finishedItems.length,
    unknownCount: unknownItems.length,
    hasActiveBankruptcy: activeItems.length > 0,
    hasFinishedBankruptcy: finishedItems.length > 0,
    activeItems,
    finishedItems,
  };
}

function resolveProcedureState(item = {}) {
  const statusCode = String(item.statusCode || '').trim();
  const statusText = [item.status, item.description]
    .filter(Boolean)
    .join(' ');

  const hasFinishedStatus =
    /^(ProceedingsFinished|ProceedingsStopped)$/iu.test(statusCode) ||
    /(завершен[оа]?|прекращен[оа]?)/iu.test(statusText);

  if (hasFinishedStatus) return 'finished';
  if (item.isActive === true) return 'active';
  if (item.isActive === false) return 'finished';

  return 'unknown';
}
/**
 * Проверка банкротства по Федресурсу (bankrot.fedresurs.ru) через api-cloud
 * Документация: https://api-cloud.ru/bankrot
 *
 * Используем метод: type=searchString
 *  - string: ИНН или ФИО
 *  - legalStatus: fiz (физлицо)
 */
async function checkEfrsb(person, options = {}) {
  const organizationMode = options.organizationMode === true;
  const organizationInn = String(person?.inn || '').trim();
  const queryString = organizationMode ? organizationInn : (person?.inn || person?.fullName || '').trim();

  if (organizationMode && !/^\d{10}$/.test(organizationInn)) {
    return {
      status: 'skipped', provider: 'apicloud', items: [], summary: buildEmptySummary(), raw: null,
      message: 'Проверка ЕФРСБ пропущена: отсутствует корректный 10-значный ИНН организации.',
    };
  }

  let response = null;

  if (process.env.APICLOUD_API_TOKEN && queryString) {
    const params = {
      type: 'searchString',
      string: queryString,
      legalStatus: organizationMode ? 'legal' : 'fiz',
      ...(organizationMode ? {} : { dopInfo: 1 }),
    };
    const requestOptions = options.timeoutMs == null ? undefined : { timeoutMs: options.timeoutMs };
    response = await request('bankrot.php', params, requestOptions);
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

  // Ошибка api-cloud (формат {"error":"...", "message":"..."})
  if (response.error) {
    const errorMessage =
      response.message ||
      `Ошибка API Федресурс (error=${response.error})`;

    result.status = 'error';
    result.error = response.error;
    result.message = errorMessage;
    result.items.push({
      kind: 'bankruptcy_lookup',
      message: errorMessage,
      rawRecord: response,
    });

    return wrapFallback(result, response, options);
  }

  // Ненормальный status
  if (typeof response.status !== 'number' || response.status !== 200) {
    const errorMessage =
      response.message ||
      'Неизвестный ответ от API Федресурс';

    result.status = 'error';
    result.error =
      response.error ||
      `status_${response.status ?? 'unknown'}`;
    result.message = errorMessage;
    result.items.push({
      kind: 'bankruptcy_lookup',
      message: errorMessage,
      rawRecord: response,
    });

    return wrapFallback(result, response, options);
  }

  // Когда нет данных
  const records = Array.isArray(response.rez) ? response.rez : [];
  if (!records.length) {
    result.status = 'empty';
    result.summary = buildEmptySummary();
    result.items.push({
      kind: 'bankruptcy_lookup',
      message: response.message || 'Информация о процедурах банкротства не найдена',
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  // Нормальные найденные дела
  result.status = 'ok';
  result.items = records.map((rec) => {
    const item = {
      kind: 'bankruptcy_case',

      guid: rec.guid?.value || null,

      fullName: rec.fio?.value || null,
      birthDate: rec['dopInfo-birthdateBankruptcy']?.value || null,
      birthPlace: rec['dopInfo-birthplaceBankruptcy']?.value || null,

      inn: rec.inn?.value || null,
      snils: rec.snils?.value || null,

      category: rec.category?.value || null,
      region: rec.region?.value || null,
      address: rec.address?.value || null,

      manager: rec.arbitrManagerFio?.value || null,

      caseNumber: rec.lastLegalCasenNumber?.value || null,

      status: rec.status?.value || null,
      statusCode: rec.statusCode?.value || null,
      statusEgrul: rec.statusEGRUL?.value ?? rec.statusEGRUL ?? null,
      description: rec.description?.value || null,
      updateDate: rec.updateDate?.value || null,

      isActive:
        typeof rec.isActive?.value === 'boolean'
          ? rec.isActive.value
          : rec.isActive?.value === 'true'
          ? true
          : rec.isActive?.value === 'false'
          ? false
          : null,

      rawRecord: rec,
    };

    item.procedureState = resolveProcedureState(item);
    const match = buildMatchData(person, item);

    return {
      ...item,

      statusText: buildBankruptcyStatusText(item.isActive, item.status, item.description),

      matchType: match.matchType,
      matchText: match.matchText,
      matchedBy: match.matchedBy,

      fioMatched: match.fioMatched,
      birthDateMatched: match.birthDateMatched,
      innMatched: match.innMatched,
      snilsMatched: match.snilsMatched,

      isStrongMatch: match.isStrongMatch,
      isRelevantMatch: match.isRelevantMatch,
    };
  }).filter((item) => !organizationMode || toDigits(item.inn) === toDigits(organizationInn));

  if (organizationMode && result.items.length === 0) result.status = 'empty';

  result.summary = buildSummary(result.items, organizationMode);
  return wrapFallback(result, response, options);
}

function wrapFallback(result, response, options) {
  if ((result.status === 'error' || result.items.length === 0) && options.enableFallback) {
    return {
      ...result,
      provider: 'apicloud',
      raw: {
        apicloud: response,
        kontur: 'fallback_not_implemented',
      },
    };
  }
  return result;
}

module.exports = checkEfrsb;

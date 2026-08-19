// server/services/counterparty/sources/fssp.js

const { request } = require('../providers/apiCloudClient');

function formatBirthDateForApi(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}.${iso[2]}.${iso[1]}`;
  }

  return raw;
}

function normalizeMoney(value) {
  if (value === undefined || value === null || value === '') return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const match = raw
    .replace(/\s+/g, '')
    .replace(',', '.')
    .match(/-?\d+(?:\.\d+)?/);

  if (!match) return null;

  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

function normalizeSubjectItems(values) {
  if (!Array.isArray(values)) return [];

  return values.map((item) => ({
    title: item?.title || null,
    sum: normalizeMoney(item?.sum),
    rawRecord: item,
  }));
}

function normalizeSubjectTitle(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateProceedingAmount(record = {}, subjectItems = []) {
  const remainingDebtTitle = 'остаток долга по исполнительному документу';
  const enforcementFeeTitle = 'исполнительский сбор';
  const remainingDebtItem = subjectItems.find((item) =>
    normalizeSubjectTitle(item?.title) === remainingDebtTitle && Number.isFinite(item?.sum)
  );

  if (!remainingDebtItem) {
    return normalizeMoney(record.sum) ?? normalizeMoney(record.debt_sum);
  }

  const enforcementFees = subjectItems.reduce((sum, item) =>
    normalizeSubjectTitle(item?.title) === enforcementFeeTitle && Number.isFinite(item?.sum)
      ? sum + item.sum
      : sum, 0);

  return roundMoney(remainingDebtItem.sum + enforcementFees);
}

function normalizePhones(values) {
  if (!Array.isArray(values)) return [];

  return values
    .flatMap((group) => (Array.isArray(group) ? group : [group]))
    .map((phone) => String(phone || '').replace(/^[*\\]+/, '').trim())
    .filter(Boolean);
}

function buildRegionLabel(record = {}) {
  return (
    record?.department_title ||
    record?.department_address ||
    record?.document_organization ||
    'Регион не определён'
  );
}

function buildRegionKey(label = '') {
  return String(label || '')
    .trim()
    .toLowerCase();
}

function buildSummary(items = []) {
  const totalCount = items.length;
  let activeCount = 0;
  let closedCount = 0;
  let activeAmount = 0;
  let closedAmount = 0;

  for (const item of items) {
    const amount = Number.isFinite(item?.amount) ? item.amount : 0;
    if (item?.stopInfo) {
      closedCount += 1;
      closedAmount += amount;
    } else {
      activeCount += 1;
      activeAmount += amount;
    }
  }

  activeAmount = roundMoney(activeAmount);
  closedAmount = roundMoney(closedAmount);
  const totalAmount = roundMoney(activeAmount + closedAmount);

  const groupsMap = new Map();

  for (const item of items) {
    const regionKey = item?.regionKey || 'unknown';
    const regionLabel = item?.regionLabel || 'Регион не определён';

    if (!groupsMap.has(regionKey)) {
      groupsMap.set(regionKey, {
        regionKey,
        regionLabel,
        totalCount: 0,
        totalAmount: 0,
        activeAmount: 0,
        closedAmount: 0,
        items: [],
      });
    }

    const group = groupsMap.get(regionKey);
    group.totalCount += 1;
    const amount = Number.isFinite(item?.amount) ? item.amount : 0;
    if (item?.stopInfo) {
      group.closedAmount += amount;
    } else {
      group.activeAmount += amount;
    }
    group.activeAmount = roundMoney(group.activeAmount);
    group.closedAmount = roundMoney(group.closedAmount);
    group.totalAmount = roundMoney(group.activeAmount + group.closedAmount);
    group.items.push(item);
  }

  const regionGroups = Array.from(groupsMap.values()).sort((a, b) => {
    if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
    return b.totalCount - a.totalCount;
  });

  return {
    totalCount,
    totalAmount,
    activeAmount,
    closedAmount,
    activeCount,
    closedCount,
    regionsCount: regionGroups.length,
    bankruptcyRisk: activeAmount >= 500000,
    regionGroups,
  };
}

/**
 * Проверка ФССП через api-cloud (тип physical).
 * person: нормализованный объект из normalizePersonInput
 *   - fullName: строка "Фамилия Имя Отчество"
 *   - birthDate: строка даты (желательно дд.мм.гггг)
 *   - region: номер региона (строка/число, либо "-1" для всех)
 */
async function checkFssp(person, options = {}) {
  const organizationMode = options.organizationMode === true;
  // Базовый "пустой" результат
  let result = {
    status: 'empty',
    provider: 'apicloud',
    items: [],
    summary: {
      totalCount: 0,
      totalAmount: 0,
      activeAmount: 0,
      closedAmount: 0,
      activeCount: 0,
      closedCount: 0,
      regionsCount: 0,
      bankruptcyRisk: false,
      regionGroups: [],
    },
    raw: null,
  };

  if (organizationMode && !/^\d{10}$/.test(String(person?.inn || ''))) {
    return {
      ...result,
      status: 'skipped',
      message: 'Проверка ФССП пропущена: отсутствует корректный 10-значный ИНН организации.',
    };
  }

  // Если нет токена или ФИО — даже не пытаемся ходить в API
  if (!process.env.APICLOUD_API_TOKEN || (!organizationMode && !person?.fullName)) {
    return result;
  }

  // Разбираем ФИО на части для api-cloud (lastname / firstname / secondname)
  const parts = (person?.fullName || '').trim().split(/\s+/);
  const lastname = parts[0] || '';
  const firstname = parts[1] || '';
  const secondname = parts.slice(2).join(' ') || '';

  // Если нет фамилии или имени — смысла дергать API нет
  if (!organizationMode && (!lastname || !firstname)) {
    return result;
  }

  // Дата рождения: api-cloud ждёт дд.мм.гггг
  const birthdate = formatBirthDateForApi(person.birthDate || '');

  // Регион: если не указан, можно передавать -1 (все регионы),
  // но лучше использовать нормализованный person.region, если он есть
  const regionParam = '-1';

  // Запрос к api-cloud
  const params = organizationMode
    ? { type: 'inn', inn: person.inn, region: regionParam, onlyActual: 0 }
    : {
        type: 'physical', lastname, firstname,
        secondname: secondname || undefined,
        birthdate: birthdate || undefined,
        region: regionParam, onlyActual: 0,
      };
  const requestOptions = options.timeoutMs == null ? undefined : { timeoutMs: options.timeoutMs };
  const response = await request('fssp.php', params, requestOptions);

  // Сохраняем "сырую" часть ответа, чтобы потом можно было посмотреть в loadRaw
  result.raw = response;

  // Если сам клиент вернул ошибку
  if (!response || typeof response !== 'object') {
    return {
      ...result,
      status: 'error',
      items: [],
    };
  }

  // Если api-cloud сообщает об ошибке статусом != 200
  if (typeof response.status === 'number' && response.status !== 200) {
    return {
      ...result,
      status: 'error',
      error: response.error || response.message || `status_${response.status}`,
      items: [],
    };
  }

  // Приводим записи
  const records = Array.isArray(response.records) ? response.records : [];
  const count = typeof response.count === 'number' ? response.count : records.length;

  // Если ничего не нашли
  if (!count || records.length === 0) {
    return {
      ...result,
      status: 'empty',
      items: [],
      summary: {
        totalCount: 0,
        totalAmount: 0,
        activeAmount: 0,
        closedAmount: 0,
        activeCount: 0,
        closedCount: 0,
        regionsCount: 0,
        bankruptcyRisk: false,
        regionGroups: [],
      },
      message: response.message || 'В базе ФССП отсутствует',
    };
  }

  // Есть записи — маппим в наш внутренний формат
  const items = records.map((rec) => {
    const subjectItems = normalizeSubjectItems(rec.subjectArray);
    const officerPhones = normalizePhones(rec.officer_phones);
    const regionLabel = buildRegionLabel(rec);
    const regionKey = buildRegionKey(regionLabel);

    const recIspDocDetail = Array.isArray(rec.recIspDocDetail)
      ? rec.recIspDocDetail
      : [];

    const recIspDocDetailObject =
      rec.recIspDocDetail &&
      !Array.isArray(rec.recIspDocDetail) &&
      typeof rec.recIspDocDetail === 'object'
        ? rec.recIspDocDetail
        : null;

    return {
      kind: 'fssp_proceeding',

      debtorName: rec.debtor_name || null,
      debtorDob: organizationMode ? null : rec.debtor_dob || null,
      debtorInn: organizationMode ? rec.debtor_dob || null : null,
      debtorAddress: rec.debtor_address || null,

      processNumber: rec.process_title || null,
      processDate: rec.process_date || null,
      processTotal: rec.process_total || null,

      amount: calculateProceedingAmount(rec, subjectItems),

      subject: rec.subject || null,
      subjectItems,

      stopInfo: rec.stopIP || null,
      stopDate: rec.stopIPDate || null,
      stopReason: rec.stopIPReason || null,

      documentType: rec.document_type || null,
      documentText: rec.recIspDoc || null,

      documentDetails: {
        organization:
          recIspDocDetailObject?.doc_organization ||
          recIspDocDetail[0] ||
          null,
        claimerInn:
          recIspDocDetailObject?.doc_claimer_inn ||
          recIspDocDetail[1] ||
          null,
        docType:
          recIspDocDetailObject?.doc_type ||
          recIspDocDetail[2] ||
          null,
        docDate:
          recIspDocDetailObject?.doc_date ||
          recIspDocDetail[3] ||
          null,
        documentNumber:
          recIspDocDetailObject?.document_num ||
          recIspDocDetail[4] ||
          null,
      },

      departmentRaw: rec.document_organization || null,
      departmentName: rec.department_title || null,
      departmentAddress: rec.department_address || null,

      officerName: rec.officer_name || null,
      officerPhones,

      regionKey,
      regionLabel,

      rawRecord: rec,
    };
  });

  const summary = buildSummary(items);

  return {
    status: 'ok',
    provider: 'apicloud',
    items,
    summary,
    raw: response,
  };
}

module.exports = checkFssp;

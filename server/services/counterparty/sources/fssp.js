// server/services/counterparty/sources/fssp.js

const { request } = require('../providers/apiCloudClient');

/**
 * Проверка ФССП через api-cloud (тип physical).
 * person: нормализованный объект из normalizePersonInput
 *   - fullName: строка "Фамилия Имя Отчество"
 *   - birthDate: строка даты (желательно дд.мм.гггг)
 *   - region: номер региона (строка/число, либо "-1" для всех)
 */
async function checkFssp(person, options = {}) {
  // Базовый "пустой" результат
  let result = {
    status: 'empty',
    provider: 'apicloud',
    items: [],
    raw: null,
  };

  // Если нет токена или ФИО — даже не пытаемся ходить в API
  if (!process.env.APICLOUD_API_TOKEN || !person?.fullName) {
    return result;
  }

  // Разбираем ФИО на части для api-cloud (lastname / firstname / secondname)
  const parts = (person.fullName || '').trim().split(/\s+/);
  const lastname = parts[0] || '';
  const firstname = parts[1] || '';
  const secondname = parts.slice(2).join(' ') || '';

  // Если нет фамилии или имени — смысла дергать API нет
  if (!lastname || !firstname) {
    return result;
  }

  // Дата рождения: api-cloud ждёт дд.мм.гггг
  let birthdate = person.birthDate || '';
  if (birthdate && birthdate.includes('-')) {
    // очень грубая конверсия из формата YYYY-MM-DD в DD.MM.YYYY, если вдруг так пришло
    const [y, m, d] = birthdate.split('-');
    if (y && m && d) {
      birthdate = `${d}.${m}.${y}`;
    }
  }

  // Регион: если не указан, можно передавать -1 (все регионы),
  // но лучше использовать нормализованный person.region, если он есть
  const regionParam = person.region != null && person.region !== ''
    ? String(person.region)
    : '-1';

  // Запрос к api-cloud
  const response = await request('fssp.php', {
    type: 'physical',
    lastname,
    firstname,
    secondname: secondname || undefined,
    birthdate: birthdate || undefined,
    region: regionParam,
    onlyActual: 1,
  });

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
      message: response.message || 'В базе ФССП отсутствует',
    };
  }

  // Есть записи — маппим в наш внутренний формат
  const items = records.map((rec) => ({
    debtorName: rec.debtor_name || null,
    debtorDob: rec.debtor_dob || null,
    debtorAddress: rec.debtor_address || null,
    processNumber: rec.process_title || null,
    processDate: rec.process_date || null,
    documentType: rec.document_type || null,
    // Если api-cloud вернёт сумму долга отдельным полем — добавим его
    amount: rec.sum || rec.debt_sum || null,
    rawRecord: rec,
  }));

  return {
    status: 'ok',
    provider: 'apicloud',
    items,
    raw: response,
  };
}

module.exports = checkFssp;

// server/services/counterparty/innLookup.js
const { request } = require('./providers/apiCloudClient');

/**
 * Преобразуем дату из формата "YYYY-MM-DD" (input type="date")
 * в формат "DD.MM.YYYY", как требует api-cloud (birthdate).
 */
function formatDateToRu(birthDate) {
  if (!birthDate) return undefined;
  const [year, month, day] = birthDate.split('-');
  if (!year || !month || !day) return undefined;
  return `${day}.${month}.${year}`;
}

/**
 * Склеиваем серию и номер паспорта и убираем всё, кроме букв и цифр
 * (api-cloud ждёт serianomer без пробелов).
 */
function buildSerianomer(series, number) {
  const raw = `${series || ''}${number || ''}`;
  return raw.replace(/[^0-9A-Za-zА-ЯЁа-яё]/g, '');
}

/**
 * Поиск ИНН физлица по ФИО + дате рождения + паспорту через api-cloud -> nalog.php?type=inn
 * Документация: https://api-cloud.ru/nalog (type=inn)
 */
async function innLookup(person) {
  const {
    lastName,
    firstName,
    middleName,
    birthDate,
    passportSeries,
    passportNumber,
  } = person || {};

  const birthdate = formatDateToRu(birthDate);
  const serianomer = buildSerianomer(passportSeries, passportNumber);

  if (!lastName || !firstName || !birthdate || !serianomer) {
    return {
      status: 'error',
      payload: {
        kind: 'inn_lookup',
        found: false,
        inn: null,
        message: 'Не хватает данных для поиска ИНН (ФИО, дата рождения, серия и номер паспорта).',
        rawRecord: null,
      },
    };
  }

  const params = {
    type: 'inn',
    lastname: lastName,
    firstname: firstName,
    birthdate,
    serianomer,
  };

  if (middleName) {
    params.secondname = middleName;
  }

  // api-cloud уже оборачивается в apiCloudClient: добавляет token, базовый URL и timeout
  const raw = await request('nalog.php', params);

  // Если источник вернул не status=200 — считаем это ошибкой
  if (raw.status !== 200) {
    return {
      status: 'error',
      payload: {
        kind: 'inn_lookup',
        found: false,
        inn: null,
        message: raw.message || 'Ошибка при запросе ИНН',
        rawRecord: raw,
      },
    };
  }

  // Нормальный ответ
  const found = !!raw.found;
  const inn = raw.inn || null;

  const basePayload = {
    kind: 'inn_lookup',
    found,
    inn,
    message: raw.message || null,
    rawRecord: raw,
  };

  if (!found) {
    return {
      status: 'empty',
      payload: basePayload,
    };
  }

  return {
    status: 'ok',
    payload: basePayload,
  };
}

module.exports = { innLookup };

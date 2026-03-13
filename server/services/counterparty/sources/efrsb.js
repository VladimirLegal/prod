const { request } = require('../providers/apiCloudClient');

/**
 * Проверка банкротства по Федресурсу (bankrot.fedresurs.ru) через api-cloud
 * Документация: https://api-cloud.ru/bankrot :contentReference[oaicite:7]{index=7}
 *
 * Используем метод: type=searchString
 *  - string: ИНН или ФИО
 *  - legalStatus: fiz (физлицо)
 */
async function checkEfrsb(person, options = {}) {
  const queryString = (person?.inn || person?.fullName || '').trim();

  let response = null;

  if (process.env.APICLOUD_API_TOKEN && queryString) {
    response = await request('bankrot.php', {
      type: 'searchString',
      string: queryString,
      legalStatus: 'fiz',
      dopInfo: 1, // чтобы в ответе были дата/место рождения и др. доп. сведения
    });
  }

  let result = {
    status: 'empty',
    provider: 'apicloud',
    items: [],
    raw: response || null,
  };

  if (!response) {
    return result;
  }

  // Ошибка api-cloud (формат {"error":"...", "message":"..."})
  if (response.error) {
    result.status = 'error';
    result.items.push({
      kind: 'bankruptcy_lookup',
      message: response.message || `Ошибка API Федресурс (error=${response.error})`,
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  // Ненормальный status
  if (typeof response.status !== 'number' || response.status !== 200) {
    result.status = 'error';
    result.items.push({
      kind: 'bankruptcy_lookup',
      message: response.message || 'Неизвестный ответ от API Федресурс',
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  // Когда нет данных
  const records = Array.isArray(response.rez) ? response.rez : [];
  if (!records.length) {
    result.status = 'empty';
    result.items.push({
      kind: 'bankruptcy_lookup',
      message: response.message || 'Информация о банкротстве не найдена',
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  // Нормальные найденные дела
  result.status = 'ok';
  result.items = records.map((rec) => ({
    kind: 'bankruptcy_case',
    guid: rec.guid?.value || null,
    fullName: rec.fio?.value || null,
    inn: rec.inn?.value || null,
    snils: rec.snils?.value || null,
    status: rec.status?.value || null,
    statusCode: rec.statusCode?.value || null,
    lastCaseNumber: rec.lastLegalCasenNumber?.value || null,
    region: rec.region?.value || null,
    address: rec.address?.value || null,
    isActive: rec.isActive?.value ?? null,
    rawRecord: rec,
  }));

  return wrapFallback(result, response, options);
}

function wrapFallback(result, response, options) {
  if ((result.status === 'error' || result.items.length === 0) && options.enableFallback) {
    return {
      status: result.status === 'error' ? 'error' : 'empty',
      provider: 'kontur',
      items: result.items.length
        ? result.items
        : [{ note: 'Контур: банкротство (fallback)' }],
      raw: { apicloud: response, kontur: 'fallback_not_implemented' },
    };
  }
  return result;
}

module.exports = checkEfrsb;

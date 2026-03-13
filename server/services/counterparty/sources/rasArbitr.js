const { request } = require('../providers/apiCloudClient');

/**
 * Проверка по банку решений ras.arbitr через api-cloud
 * Документация: https://api-cloud.ru/ras_arbitr :contentReference[oaicite:10]{index=10}
 *
 * type=search
 * participant = ИНН или ФИО
 */
async function checkRasArbitr(person, options = {}) {
  const participant = (person?.inn || person?.fullName || '').trim();

  let response = null;

  if (process.env.APICLOUD_API_TOKEN && participant) {
    response = await request('ras_arbitr.php', {
      type: 'search',
      participant,
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

  if (response.error) {
    result.status = 'error';
    result.items.push({
      kind: 'ras_arbitr_lookup',
      message: response.message || `Ошибка API ras.arbitr (error=${response.error})`,
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  if (typeof response.status !== 'number' || response.status !== 200) {
    result.status = 'error';
    result.items.push({
      kind: 'ras_arbitr_lookup',
      message: response.message || 'Неизвестный ответ от API ras.arbitr',
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  const records =
    Array.isArray(response.result) ? response.result :
    Array.isArray(response.Result) ? response.Result :
    [];

  if (!records.length) {
    result.status = 'empty';
    result.items.push({
      kind: 'ras_arbitr_lookup',
      message: 'Решения по участнику не найдены',
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  result.status = 'ok';
  result.items = records.map((rec) => ({
    kind: 'ras_arbitr_case',
    caseNumber: rec.CaseNumber || rec.caseNumber || null,
    court: rec.Court || rec.court || null,
    docType: rec.DocType || rec.docType || null,
    docName: rec.DocName || rec.docName || null,
    docDate: rec.DocDate || rec.docDate || null,
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
        : [{ note: 'Контур: решения арбитража (fallback)' }],
      raw: { apicloud: response, kontur: 'fallback_not_implemented' },
    };
  }
  return result;
}

module.exports = checkRasArbitr;

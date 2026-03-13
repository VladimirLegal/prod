const { request } = require('../providers/apiCloudClient');

/**
 * Проверка по КАД (arbitr.ru) через api-cloud
 * Документация: https://api-cloud.ru/kad_arbitr :contentReference[oaicite:9]{index=9}
 *
 * type=search
 * participant = ИНН или ФИО
 */
async function checkKad(person, options = {}) {
  const participant = (person?.inn || person?.fullName || '').trim();

  let response = null;

  if (process.env.APICLOUD_API_TOKEN && participant) {
    response = await request('kad_arbitr.php', {
      type: 'search',
      participant,
      participantType: -1, // любой участник (истец/ответчик/третье лицо)
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
      kind: 'kad_lookup',
      message: response.message || `Ошибка API kad.arbitr (error=${response.error})`,
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  if (typeof response.status !== 'number' || response.status !== 200) {
    result.status = 'error';
    result.items.push({
      kind: 'kad_lookup',
      message: response.message || 'Неизвестный ответ от API kad.arbitr',
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
      kind: 'kad_lookup',
      message: 'Дела в КАД не найдены',
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  result.status = 'ok';
  result.items = records.map((rec) => ({
    kind: 'kad_case',
    caseNumber: rec.CaseNumber || rec.caseNumber || null,
    caseId: rec.CaseId || rec.caseId || null,
    court: rec.Court || rec.court || null,
    plaintiff: rec.Plaintiff || rec.plaintiff || null,
    defendant: rec.Defendant || rec.defendant || null,
    status: rec.Status || rec.status || null,
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
        : [{ note: 'Контур: КАД Арбитр (fallback)' }],
      raw: { apicloud: response, kontur: 'fallback_not_implemented' },
    };
  }
  return result;
}

module.exports = checkKad;

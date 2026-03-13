const { request } = require('../providers/apiCloudClient');

/**
 * Проверка по списку Росфинмониторинга через api-cloud (fedsfm.php)
 * Документация: https://api-cloud.ru/fedsfm :contentReference[oaicite:8]{index=8}
 *
 * type=terextr
 * search = ФИО или ИНН
 */
async function checkRosfin(person, options = {}) {
  const search = (person?.inn || person?.fullName || '').trim();

  let response = null;

  if (process.env.APICLOUD_API_TOKEN && search) {
    response = await request('fedsfm.php', {
      type: 'terextr',
      search,
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
      kind: 'rosfin_lookup',
      message: response.message || `Ошибка API Росфинмониторинг (error=${response.error})`,
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  if (typeof response.status !== 'number' || response.status !== 200) {
    result.status = 'error';
    result.items.push({
      kind: 'rosfin_lookup',
      message: response.message || 'Неизвестный ответ от API Росфинмониторинг',
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  const records = Array.isArray(response.result) ? response.result : [];

  if (!records.length || response.found === false) {
    result.status = 'empty';
    result.items.push({
      kind: 'rosfin_lookup',
      message: 'Сведений в списке Росфинмониторинга не найдено',
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  result.status = 'ok';
  result.items = records.map((rec) => ({
    kind: 'rosfin_hit',
    subjectType: rec.type || null, // fiz / ur
    name: rec.name || null,        // ФИО / наименование организации
    inn: rec.inn || null,
    ogrn: rec.ogrn || null,
    birth: rec.birth || null,
    place: rec.place || null,
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
        : [{ note: 'Контур: Росфинмониторинг (fallback)' }],
      raw: { apicloud: response, kontur: 'fallback_not_implemented' },
    };
  }
  return result;
}

module.exports = checkRosfin;

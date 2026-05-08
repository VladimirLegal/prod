const { request } = require('../providers/apiCloudClient');


function translateRosfinSubjectType(value) {
  const raw = String(value || '').trim().toLowerCase();

  if (raw === 'fiz') return 'Физическое лицо';
  if (raw === 'ur') return 'Юридическое лицо';

  return value || null;
}
/**
 * Проверка по списку Росфинмониторинга через api-cloud (fedsfm.php)

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
      isFound: null,
      foundCount: null,
      resultState: response.status || null,
      resultStateText: 'Ошибка проверки',
      message: response.message || `Ошибка API Росфинмониторинг (error=${response.error})`,
      records: [],
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  if (typeof response.status !== 'number' || response.status !== 200) {
    result.status = 'error';
    result.items.push({
      kind: 'rosfin_lookup',
      isFound: null,
      foundCount: null,
      resultState: response.status || null,
      resultStateText: 'Ошибка проверки',
      message: response.message || 'Неизвестный ответ от API Росфинмониторинг',
      records: [],
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  const found = response.found === true;
  const foundCount = Number(response.count || 0) || 0;
  const rawRecords = Array.isArray(response.result) ? response.result : [];

  const records = rawRecords.map((rec) => ({
    recordId: rec?.id || null,
    recordType: rec?.type || null,
    recordTypeText: translateRosfinSubjectType(rec?.type || null),
    fullName: rec?.name || null,
    birthDate: rec?.birth || null,
    birthPlace: rec?.place || null,
    inn: rec?.inn || null,
    ogrn: rec?.ogrn || null,
    matchReasonText: 'Совпадение найдено по поисковому запросу сервиса',
    rawRecord: rec,
  }));

  if (!found || !records.length) {
    result.status = 'empty';
    result.items.push({
      kind: 'rosfin_lookup',
      isFound: false,
      foundCount: 0,
      resultState: 'Данные получены',
      resultStateText: 'Сведений в списках Росфинмониторинга не найдено',
      message: 'Сведений в списках Росфинмониторинга не найдено',
      records: [],
      rawRecord: response,
    });
    return wrapFallback(result, response, options);
  }

  result.status = 'ok';
  result.items.push({
    kind: 'rosfin_lookup',
    isFound: true,
    foundCount: records.length,
    resultState: 'Данные получены',
    resultStateText: 'Найдены совпадения в списках Росфинмониторинга',
    message: 'Найдены совпадения в списках Росфинмониторинга',
    records,
    rawRecord: response,
  });

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

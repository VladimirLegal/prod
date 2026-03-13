const { request } = require('../providers/apiCloudClient');

/**
 * Проверка "Действующие приостановления операций по счетам"
 * через api-cloud -> mvd.php?type=stopOperRS&inn=...
 *
 * Ожидаемый ответ api-cloud:
 * {
 *   "status": 200,
 *   "found": true | false,
 *   "count": 0 | N,
 *   "result": [ { ... }, ... ],
 *   "inquiry": { ... }
 * }
 */
async function checkStopOperRS(person, options = {}) {
  const innRaw = person?.inn ? String(person.inn).trim() : '';

  // Если нет ИНН или токена — просто возвращаем "пусто", без запроса
  if (!process.env.APICLOUD_API_TOKEN || !innRaw) {
    return {
      status: 'empty',
      provider: 'apicloud',
      items: [],
      raw: {
        error: 'no_inn_or_token',
        inn: innRaw || null,
      },
    };
  }

  // Запрос к api-cloud: mvd.php?type=stopOperRS&inn=...
  const response = await request('mvd.php', {
    type: 'stopOperRS',
    inn: innRaw,
  });

  const apiStatus = response?.status;
  const found = !!response?.found;
  const resultArray = Array.isArray(response?.result) ? response.result : [];

  let status;

  if (apiStatus === 200) {
    status = found && resultArray.length > 0 ? 'ok' : 'empty';
  } else if (apiStatus === 404 && response?.error === 'TIME_MAX_CONNECT') {
    status = 'error';
  } else if (apiStatus && apiStatus !== 200) {
    status = 'error';
  } else if (response?.error) {
    status = 'error';
  } else {
    status = 'empty';
  }

  const items = resultArray.map((r) => ({
    inn: r.inn,
    name: r.name,
    codeFns: r.code_fns,
    date: r.date,
    bik: r.bik,
    number: r.number,
    dateAddInfo: r.date_add_info,
    reasonCode: r.code_osnov,
    reasonText: r.code_detail,
    saldoEns: r.saldo_ens,
    rawRecord: r,
  }));

  return {
    status,
    provider: 'apicloud',
    items,
    raw: response,
  };
}

module.exports = checkStopOperRS;

const { request } = require('../providers/apiCloudClient');

/**
 * Проверка паспорта РФ через API МВД (api-cloud -> mvd.php, type=chekpassportv2)
 *
 * person.passport.series  - серия паспорта (4 цифры)
 * person.passport.number  - номер паспорта (6 цифр)
 * person.fullName         - ФИО (используем для фамилии/имени)
 */
async function checkMvdPassport(person, options = {}) {
  const hasPassport = person?.passport?.series && person?.passport?.number;
  let response = null;
    const passportSeries = String(person?.passport?.series || '').replace(/\D/g, '').slice(0, 4);
    const passportNumber = String(person?.passport?.number || '').replace(/\D/g, '').slice(0, 6);
    const passportIssueDate =
      person?.passport?.issueDate ||
      person?.passportIssueDate ||
      '';
    const passportIssuerCode =
      person?.passport?.issuerCode ||
      person?.passportIssuerCode ||
      '';

  if (hasPassport && process.env.APICLOUD_API_TOKEN) {
    const seria = String(person.passport.series).replace(/\D/g, '').slice(0, 4);
    const nomer = String(person.passport.number).replace(/\D/g, '').slice(0, 6);

    // Берём ФИО, из него вытаскиваем фамилию и имя
    const fullName = (person.fullName || '').trim();
    const [lastname = '', firstname = ''] = fullName.split(/\s+/, 3); // отчество не требуется

    response = await request('mvd.php', {
      type: 'chekpassportv2', // из доки МВД-api-cloud :contentReference[oaicite:5]{index=5}
      seria,
      nomer,
      lastname,
      firstname,
    });
  }

  // Базовый объект результата
  let result = {
    status: 'empty',
    provider: 'apicloud',
    items: [],
    raw: response || null,
  };

  // Если вообще ничего не запросили (нет паспорта или токена) — возвращаем пусто
  if (!response) {
    return result;
  }

  // 1) Ошибки api-cloud (структура: {error: "...", message: "..."})
  if (response.error) {
    result.status = 'error';
    result.items.push({
      kind: 'passport_check',
      isValid: null,

      verification: {
        series: passportSeries || null,
        number: passportNumber || null,
        issueDate: passportIssueDate || null,
        issuerCode: passportIssuerCode || null,
      },

      resultState: response.result || response.verdict || response.statusText || null,
      resultStateText: 'Ошибка проверки',

      message: response.message || `Ошибка API МВД (error=${response.error})`,
      rawRecord: response,
    });
    return wrapWithFallbackIfNeeded(result, response, options);
  }

  // 2) Нестандартный статус или 404 от источника
  if (typeof response.status !== 'number' || (response.status !== 200 && response.status !== 404)) {
    result.status = 'error';
    result.items.push({
      kind: 'passport_check',
      isValid: null,
      verification: {
        series: passportSeries || null,
        number: passportNumber || null,
        issueDate: passportIssueDate || null,
        issuerCode: passportIssuerCode || null,
      },
      resultState: response.result || response.verdict || response.statusText || null,
      resultStateText: 'Ошибка проверки',
      message: response.message || response.description || `Неожиданный статус ответа от МВД: ${response.status}`,
      rawRecord: response,
    });
    return wrapWithFallbackIfNeeded(result, response, options);
  }

  // 3) Нормальный успешный ответ
  // В доке указано, что метод chekpassportv2 возвращает статусы:
  // VALID / NOT_VALID / NOT_FOUND (формат в реальном ответе может быть слегка другим,
  // поэтому дополнительно смотрим на поля result / valid / isValid)
  const verdict =
    response.result ||
    response.verdict ||
    response.statusText ||
    null;

  let isValid = null;
  let message = null;

  const normalizedVerdict = typeof verdict === 'string' ? verdict.toUpperCase() : '';

  let resultState = normalizedVerdict || null;
  let resultStateText = null;

  

  if (normalizedVerdict === 'VALID') {
    isValid = true;
    resultState = 'VALID';
    resultStateText = 'Паспорт действителен';
    message = response.description || 'Паспорт действителен';
  } else if (normalizedVerdict === 'NOT_VALID') {
    isValid = false;
    resultState = 'NOT_VALID';
    resultStateText = 'Паспорт недействителен';
    message = response.description || 'Паспорт недействителен';
  } else if (normalizedVerdict === 'NOT_FOUND') {
    isValid = false;
    resultState = 'NOT_FOUND';
    resultStateText = 'Паспорт не найден';
    message = response.description || 'Сведения о паспорте не найдены в базе МВД';
  } else if (typeof response.isValid === 'boolean') {
    isValid = response.isValid;
    resultState = response.isValid ? 'VALID' : 'NOT_VALID';
    resultStateText = response.isValid ? 'Паспорт действителен' : 'Паспорт недействителен';
    message = response.message || response.description || resultStateText;
  } else if (response.status === 404) {
    // Для chekpassportv2 404 тоже считается "получен результат" (по доке МВД),
    // но это явно не "паспорт ок", поэтому трактуем как ошибка источника
    result.status = 'error';
    result.items.push({
      kind: 'passport_check',
      isValid: null,
      verification: {
        series: passportSeries || null,
        number: passportNumber || null,
        issueDate: passportIssueDate || null,
        issuerCode: passportIssuerCode || null,
      },
      resultState: response.result || response.verdict || response.statusText || 'HTTP_404',
      resultStateText: 'Ошибка проверки',
      message: response.message || response.description || `Не удалось получить сведения о паспорте (HTTP 404): ${response.status}`,
      rawRecord: response,
    });
    return wrapWithFallbackIfNeeded(result, response, options);
  }

  // Если так и не смогли определить isValid — считаем это ошибкой
  if (isValid === null) {
    result.status = 'error';
    result.items.push({
      kind: 'passport_check',
      isValid: null,
      verification: {
        series: passportSeries || null,
        number: passportNumber || null,
        issueDate: passportIssueDate || null,
        issuerCode: passportIssuerCode || null,
      },
      resultState: response.result || response.verdict || response.statusText || 'HTTP_404',
      resultStateText: 'Ошибка проверки',
      message: response.message || response.description || `Не удалось интерпретировать ответ МВД: ${response.status}`,
      rawRecord: response,

    });
    return wrapWithFallbackIfNeeded(result, response, options);
  }

  // Успешно разобранный ответ
  result.status = 'ok';
  result.items.push({
    kind: 'passport_check',
    isValid,

    verification: {
      series: passportSeries || null,
      number: passportNumber || null,
      issueDate: passportIssueDate || null,
      issuerCode: passportIssuerCode || null,
    },

    resultState,
    resultStateText: resultStateText || message || 'Статус не определён',

    message,
    rawRecord: response,
  });

  return wrapWithFallbackIfNeeded(result, response, options);
}

function wrapWithFallbackIfNeeded(result, response, options) {
  if ((result.status === 'error' || result.items.length === 0) && options.enableFallback) {
    return {
      status: result.status === 'error' ? 'error' : 'empty',
      provider: 'kontur',
      items: result.items,
      raw: { apicloud: response, kontur: 'fallback_not_implemented' },
    };
  }
  return result;
}

module.exports = checkMvdPassport;

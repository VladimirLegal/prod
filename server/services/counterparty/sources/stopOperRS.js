const { request } = require('../providers/apiCloudClient');

let bankDirectory = {};

try {
  bankDirectory = require('../../../data/bankDirectory.json');
} catch (err) {
  bankDirectory = {};
}

function normalizeBik(value) {
  const digits = String(value || '').replace(/\D+/g, '');

  if (!digits) return '';

  if (digits.length <= 9) {
    return digits.padStart(9, '0');
  }

  return digits;
}

function getBankByBik(value) {
  const bik = normalizeBik(value);

  if (!bik) {
    return {
      bik: '',
      bankName: '',
      bankKs: '',
      bankDisplayName: 'БИК не указан',
    };
  }

  const bank = bankDirectory?.[bik] || null;
  const bankName = String(bank?.name || '').trim();
  const bankKs = String(bank?.ks || '').trim();

  return {
    bik,
    bankName,
    bankKs,
    bankDisplayName: bankName
      ? `${bankName}, БИК ${bik}`
      : `Банк не найден в справочнике, БИК ${bik}`,
  };
}

function normalizeMoney(value) {
  if (value === undefined || value === null || value === '') return null;

  const raw = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

function buildStopOperEmptySummary() {
  return {
    totalCount: 0,
    banksCount: 0,
    decisionsCount: 0,
    negativeBalance: null,
    hasRestrictions: false,
  };
}

function buildStopOperSummary(items = []) {
  const uniqueBiks = new Set(
    items.map((item) => String(item?.bik || '').trim()).filter(Boolean)
  );

  const uniqueNumbers = new Set(
    items.map((item) => String(item?.number || '').trim()).filter(Boolean)
  );

  const getDateTimestamp = (value) => {
    if (!value) return null;

    const text = String(value).trim();
    const localizedMatch = text.match(
      /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (localizedMatch) {
      const [, day, month, year, hours = '0', minutes = '0', seconds = '0'] = localizedMatch;
      const timestamp = Date.UTC(
        Number(year), Number(month) - 1, Number(day),
        Number(hours), Number(minutes), Number(seconds)
      );
      const parsed = new Date(timestamp);
      const isValid =
        parsed.getUTCFullYear() === Number(year) &&
        parsed.getUTCMonth() === Number(month) - 1 &&
        parsed.getUTCDate() === Number(day) &&
        parsed.getUTCHours() === Number(hours) &&
        parsed.getUTCMinutes() === Number(minutes) &&
        parsed.getUTCSeconds() === Number(seconds);

      return isValid ? timestamp : null;
    }

    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? timestamp : null;
  };

  const latestBalanceItem = items
    .filter((item) => Number.isFinite(item?.saldoEns))
    .reduce((latest, item) => {
      const itemTimestamp = getDateTimestamp(item?.dateAddInfo) ?? getDateTimestamp(item?.date);
      const latestTimestamp = latest
        ? getDateTimestamp(latest.dateAddInfo) ?? getDateTimestamp(latest.date)
        : null;

      return !latest || (itemTimestamp !== null &&
        (latestTimestamp === null || itemTimestamp > latestTimestamp)) ? item : latest;
    }, null);

  return {
    totalCount: items.length,
    banksCount: uniqueBiks.size,
    decisionsCount: uniqueNumbers.size,
    negativeBalance: latestBalanceItem?.saldoEns ?? null,
    hasRestrictions: items.length > 0,
  };
}
async function checkStopOperRS(person, options = {}) {
  const innRaw = person?.inn ? String(person.inn).trim() : '';

  if (!innRaw) {
    return {
      status: 'skipped',
      provider: 'apicloud',
      message: 'Проверка StopOperRS пропущена: отсутствует ИНН.',
      items: [],
      summary: buildStopOperEmptySummary(),
      raw: {
        error: 'no_inn',
        inn: null,
      },
    };
  }

  if (!process.env.APICLOUD_API_TOKEN) {
    return {
      status: 'skipped',
      provider: 'apicloud',
      message: 'Проверка StopOperRS пропущена: API-cloud не настроен.',
      items: [],
      summary: buildStopOperEmptySummary(),
      raw: {
        error: 'no_api_token',
        inn: innRaw,
      },
    };
  }

  let response;
  try {
    response = await request(
      'mvd.php',
      {
        type: 'stopOperRS',
        inn: innRaw,
      },
      {
        timeoutMs: options.timeoutMs,
      }
    );
  } catch (error) {
    const errorCode = error?.code || error?.message || 'STOP_OPER_RS_REQUEST_FAILED';
    const message = error?.details || error?.errormsg || error?.message ||
      'Ошибка источника при проверке приостановлений операций по счетам.';
    return {
      status: 'error', provider: 'apicloud', error: errorCode, message,
      items: [{
        kind: 'stop_oper_rs_lookup', isFound: null, resultState: 'Ошибка проверки',
        resultStateText: 'Ошибка проверки', foundCount: null, message, records: [], rawRecord: error,
      }],
      summary: buildStopOperEmptySummary(), raw: error,
    };
  }

  const apiStatus = response?.status;
  const rawRecords = Array.isArray(response?.result) ? response.result : [];
  const found = response?.found === true || response?.found === 'true';
  const explicitlyEmpty =
    (response?.found === false || response?.found === 'false') &&
    Number(response?.count) === 0 &&
    rawRecords.length === 0;

  if (!response || typeof response !== 'object') {
    const message = 'Не удалось получить ответ от источника';
    return {
      status: 'error',
      provider: 'apicloud',
      error: 'STOP_OPER_RS_INVALID_RESPONSE',
      message,
      items: [
        {
          kind: 'stop_oper_rs_lookup',
          isFound: null,
          resultState: 'Ошибка проверки',
          resultStateText: 'Ошибка проверки',
          foundCount: null,
          message,
          records: [],
          rawRecord: response,
        },
      ],
      summary: buildStopOperEmptySummary(),
      raw: response || null,
    };
  }

  if (Number(apiStatus) !== 200 || response?.error || (!explicitlyEmpty && !(found && rawRecords.length))) {
    const errorCode = response?.message || response?.error || 'STOP_OPER_RS_REQUEST_FAILED';
    const message = response?.details || response?.errormsg || response?.message ||
      'Ошибка источника при проверке приостановлений операций по счетам.';
    return {
      status: 'error',
      provider: 'apicloud',
      error: errorCode,
      message,
      items: [
        {
          kind: 'stop_oper_rs_lookup',
          isFound: null,
          resultState: 'Ошибка проверки',
          resultStateText: 'Ошибка проверки',
          foundCount: null,
          message,
          records: [],
          rawRecord: response,
        },
      ],
      summary: buildStopOperEmptySummary(),
      raw: response,
    };
  }

  const records = rawRecords.map((r) => {
    const bankInfo = getBankByBik(r?.bik);

    return {
      kind: 'stop_oper_rs_record',
      inn: r?.inn || null,
      name: r?.name || null,
      codeFns: r?.code_fns || null,
      date: r?.date || null,

      bik: bankInfo.bik || r?.bik || null,
      bankName: bankInfo.bankName || null,
      bankKs: bankInfo.bankKs || null,
      bankDisplayName: bankInfo.bankDisplayName,

      number: r?.number || null,
      dateAddInfo: r?.date_add_info || null,
      reasonCode: r?.code_osnov || null,
      reasonText: r?.code_detail || null,
      saldoEns: normalizeMoney(r?.saldo_ens),
      rawRecord: r,
    };
  });

  if (!found || records.length === 0) {
    const message = 'Действующие приостановления операций по счетам не найдены';
    return {
      status: 'empty',
      provider: 'apicloud',
      message,
      items: [
        {
          kind: 'stop_oper_rs_lookup',
          isFound: false,
          resultState: 'Данные получены',
          resultStateText: 'Действующие приостановления операций по счетам не найдены',
          foundCount: 0,
          message,
          records: [],
          rawRecord: response,
        },
      ],
      summary: buildStopOperEmptySummary(),
      raw: response,
    };
  }

  const message = 'Найдены действующие приостановления операций по счетам';
  return {
    status: 'ok',
    provider: 'apicloud',
    message,
    items: [
      {
        kind: 'stop_oper_rs_lookup',
        isFound: true,
        resultState: 'Данные получены',
        resultStateText: 'Найдены действующие приостановления операций по счетам',
        foundCount: records.length,
        message,
        records,
        rawRecord: response,
      },
    ],
    summary: buildStopOperSummary(records),
    raw: response,
  };
}

module.exports = checkStopOperRS;

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

  const firstBalance =
    items.find((item) => item?.saldoEns !== null && item?.saldoEns !== undefined)?.saldoEns ?? null;

  return {
    totalCount: items.length,
    banksCount: uniqueBiks.size,
    decisionsCount: uniqueNumbers.size,
    negativeBalance: firstBalance,
    hasRestrictions: items.length > 0,
  };
}
async function checkStopOperRS(person, options = {}) {
  const innRaw = person?.inn ? String(person.inn).trim() : '';

  if (!process.env.APICLOUD_API_TOKEN || !innRaw) {
    return {
      status: 'empty',
      provider: 'apicloud',
      items: [],
      summary: buildStopOperEmptySummary(),
      raw: {
        error: 'no_inn_or_token',
        inn: innRaw || null,
      },
    };
  }

  const response = await request('mvd.php', {
    type: 'stopOperRS',
    inn: innRaw,
  });

  const apiStatus = response?.status;
  const rawRecords = Array.isArray(response?.result) ? response.result : [];
  const found =
    response?.found === true ||
    response?.found === 'true' ||
    Number(response?.count || 0) > 0 ||
    rawRecords.length > 0;

  if (!response || typeof response !== 'object') {
    return {
      status: 'error',
      provider: 'apicloud',
      items: [
        {
          kind: 'stop_oper_rs_lookup',
          isFound: null,
          resultState: 'Ошибка проверки',
          resultStateText: 'Ошибка проверки',
          foundCount: null,
          message: 'Не удалось получить ответ от источника',
          records: [],
          rawRecord: response,
        },
      ],
      summary: buildStopOperEmptySummary(),
      raw: response || null,
    };
  }

  if (response?.error || (apiStatus && apiStatus !== 200 && apiStatus !== 404)) {
    return {
      status: 'error',
      provider: 'apicloud',
      items: [
        {
          kind: 'stop_oper_rs_lookup',
          isFound: null,
          resultState: 'Ошибка проверки',
          resultStateText: 'Ошибка проверки',
          foundCount: null,
          message:
            response?.message ||
            `Ошибка источника при проверке приостановлений операций по счетам`,
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
    return {
      status: 'empty',
      provider: 'apicloud',
      items: [
        {
          kind: 'stop_oper_rs_lookup',
          isFound: false,
          resultState: 'Данные получены',
          resultStateText: 'Действующие приостановления операций по счетам не найдены',
          foundCount: 0,
          message: 'Действующие приостановления операций по счетам не найдены',
          records: [],
          rawRecord: response,
        },
      ],
      summary: buildStopOperEmptySummary(),
      raw: response,
    };
  }

  return {
    status: 'ok',
    provider: 'apicloud',
    items: [
      {
        kind: 'stop_oper_rs_lookup',
        isFound: true,
        resultState: 'Данные получены',
        resultStateText: 'Найдены действующие приостановления операций по счетам',
        foundCount: records.length,
        message: 'Найдены действующие приостановления операций по счетам',
        records,
        rawRecord: response,
      },
    ],
    summary: buildStopOperSummary(records),
    raw: response,
  };
}

module.exports = checkStopOperRS;

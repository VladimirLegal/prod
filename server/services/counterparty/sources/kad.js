const { request } = require('../providers/apiCloudClient');

function translateKadCaseType(value, title) {
  const raw = String(value || '').trim().toLowerCase();

  if (raw === 'bankruptcy') {
    return { code: 'bankruptcy', text: title || 'Банкротное дело' };
  }

  if (raw === 'civil' || raw === 'civil_simple') {
    return { code: 'civil', text: title || 'Гражданское дело' };
  }

  if (raw === 'administrative') {
    return { code: 'administrative', text: title || 'Административное дело' };
  }

  return {
    code: 'other',
    text: title || value || 'Прочее арбитражное дело',
  };
}

function normalizeKadParty(values = [], role) {
  if (!Array.isArray(values)) return [];

  const roleText = role === 'plaintiff' ? 'Истец' : 'Ответчик';

  return values.map((item) => ({
    name: item?.name || null,
    address: item?.adress || item?.address || null,
    inn: item?.inn ? String(item.inn).trim() : null,
    role,
    roleText,
    rawRecord: item,
  }));
}

function buildKadEmptySummary() {
  return {
    totalCount: 0,
    bankruptcyCount: 0,
    civilCount: 0,
    administrativeCount: 0,
    otherCount: 0,
    hasBankruptcyCases: false,
  };
}

function buildKadSummary(items = []) {
  const bankruptcyCount = items.filter((item) => item.caseType === 'bankruptcy').length;
  const civilCount = items.filter((item) => item.caseType === 'civil').length;
  const administrativeCount = items.filter((item) => item.caseType === 'administrative').length;
  const otherCount = items.filter((item) => item.caseType === 'other').length;

  return {
    totalCount: items.length,
    bankruptcyCount,
    civilCount,
    administrativeCount,
    otherCount,
    hasBankruptcyCases: bankruptcyCount > 0,
  };
}

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
    summary: buildKadEmptySummary(),
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
      resultState: 'Данные получены',
      resultStateText: 'Арбитражные дела в КАД не найдены',
      foundCount: 0,
      message: 'Арбитражные дела в КАД не найдены',
      records: [],
      rawRecord: response,
    });
    result.summary = buildKadEmptySummary();
    return wrapFallback(result, response, options);
  }

  result.status = 'ok';
  result.items = records.map((rec) => {
    const rawType = rec?.Type || rec?.type || null;
    const rawTypeTitle = rec?.TypeTitle || rec?.typeTitle || null;
    const normalizedType = translateKadCaseType(rawType, rawTypeTitle);

    const plaintiffs = normalizeKadParty(rec?.Plaintiff || rec?.plaintiff || [], 'plaintiff');
    const respondents = normalizeKadParty(rec?.Respondent || rec?.respondent || [], 'respondent');
    const participants = [...plaintiffs, ...respondents];

    return {
      kind: 'kad_case',
      caseId: rec?.CaseId || rec?.caseId || null,
      caseNumber: rec?.CaseNumber || rec?.caseNumber || null,
      caseDate: rec?.RegistrationDate || rec?.registrationDate || rec?.date || null,

      caseType: normalizedType.code,
      caseTypeText: normalizedType.text,

      court: rec?.Court || rec?.court || rec?.instance || null,
      judge: rec?.Judge || rec?.judge || null,
      url: rec?.CaseUrl || rec?.caseUrl || rec?.url || null,

      plaintiffs,
      respondents,
      participants,

      rawRecord: rec,
    };
  });

  result.summary = buildKadSummary(result.items);

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
      summary: result.summary || buildKadEmptySummary(),
      raw: { apicloud: response, kontur: 'fallback_not_implemented' },
    };
  }
  return result;
}

module.exports = checkKad;

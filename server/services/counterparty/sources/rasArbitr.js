const { request } = require('../providers/apiCloudClient');

function translateRasDocumentType(value) {
  const raw = String(value || '').trim().toLowerCase();

  if (raw === 'решение') {
    return { code: 'decision', text: 'Решение' };
  }

  if (raw === 'определение') {
    return { code: 'ruling', text: 'Определение' };
  }

  if (raw === 'постановление апелляционной инстанции') {
    return { code: 'appeal_resolution', text: 'Постановление апелляционной инстанции' };
  }

  return {
    code: 'other',
    text: value || 'Иной судебный акт',
  };
}

function translateRasInstanceLevel(value) {
  const raw = Number(value);

  if (raw === 1) {
    return 'Первая инстанция';
  }

  if (raw === 2) {
    return 'Апелляционная инстанция';
  }

  if (raw === 3) {
    return 'Кассационная инстанция';
  }

  return 'Иная инстанция';
}

function normalizeRasContentTypes(values = []) {
  if (!Array.isArray(values)) return [];

  return values
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function buildRasEmptySummary() {
  return {
    totalCount: 0,
    decisionCount: 0,
    rulingCount: 0,
    appealCount: 0,
    otherCount: 0,
    firstInstanceCount: 0,
    appealInstanceCount: 0,
    otherInstanceCount: 0,
    hasDocuments: false,
  };
}

function buildRasSummary(items = []) {
  const decisionCount = items.filter((item) => item.documentType === 'decision').length;
  const rulingCount = items.filter((item) => item.documentType === 'ruling').length;
  const appealCount = items.filter((item) => item.documentType === 'appeal_resolution').length;
  const otherCount = items.filter((item) => item.documentType === 'other').length;

  const firstInstanceCount = items.filter((item) => item.instanceLevel === 1).length;
  const appealInstanceCount = items.filter((item) => item.instanceLevel === 2).length;
  const otherInstanceCount = items.filter(
    (item) => item.instanceLevel !== 1 && item.instanceLevel !== 2
  ).length;

  return {
    totalCount: items.length,
    decisionCount,
    rulingCount,
    appealCount,
    otherCount,
    firstInstanceCount,
    appealInstanceCount,
    otherInstanceCount,
    hasDocuments: items.length > 0,
  };
}

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
    summary: buildRasEmptySummary(),
    raw: response || null,
  };

  if (!response) {
    return result;
  }

  if (response.error) {
    result.status = 'error';
    result.items.push({
      kind: 'ras_arbitr_lookup',
      resultState: 'Ошибка API',
      resultStateText: 'Ошибка API ras.arbitr',
      foundCount: null,
      message: response.message || `Ошибка API ras.arbitr (error=${response.error})`,
      rawRecord: response,
    });
    result.summary = buildRasEmptySummary();
    return wrapFallback(result, response, options);
  }

  if (typeof response.status !== 'number' || response.status !== 200) {
    result.status = 'error';
    result.items.push({
      kind: 'ras_arbitr_lookup',
      resultState: 'Ошибка проверки',
      resultStateText: 'Ошибка проверки',
      foundCount: null,
      message: response.message || 'Неизвестный ответ от API ras.arbitr',
      records: [],
      rawRecord: response,
    });
    result.summary = buildRasEmptySummary();
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
      resultState: 'Данные получены',
      resultStateText: 'Судебные акты арбитражных судов не найдены',
      foundCount: 0,
      message: 'Судебные акты арбитражных судов не найдены',
      records: [],
      rawRecord: response,
    });
    result.summary = buildRasEmptySummary();
    return wrapFallback(result, response, options);
  }

  result.status = 'ok';
  result.items = records.map((rec) => {
    const rawType = rec?.Type || rec?.type || null;
    const normalizedType = translateRasDocumentType(rawType);
    const instanceLevelRaw = Number(rec?.InstanceLevel ?? rec?.instanceLevel ?? null);

    const contentTypes = normalizeRasContentTypes(
      rec?.ContentTypes || rec?.contentTypes || []
    );

    return {
      kind: 'ras_arbitr_document',
      caseId: rec?.CaseId || rec?.caseId || null,
      caseNumber: rec?.CaseNumber || rec?.caseNumber || null,
      caseUrl: rec?.CaseUrl || rec?.caseUrl || null,

      registrationDate: rec?.RegistrationDate || rec?.registrationDate || null,
      instanceNumber: rec?.InstanceNumber || rec?.instanceNumber || null,

      instanceLevel: Number.isFinite(instanceLevelRaw) ? instanceLevelRaw : null,
      instanceLevelText: translateRasInstanceLevel(instanceLevelRaw),

      court: rec?.Court || rec?.court || null,

      documentType: normalizedType.code,
      documentTypeText: normalizedType.text,

      fileName: rec?.FileName || rec?.fileName || null,
      fileUrl: rec?.FileUrl || rec?.fileUrl || null,

      contentTypes,
      primaryContentText: contentTypes[0] || null,

      rawRecord: rec,
    };
  });

  result.summary = buildRasSummary(result.items);

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
      summary: result.summary || buildRasEmptySummary(),
      raw: { apicloud: response, kontur: 'fallback_not_implemented' },
    };
  }
  return result;
}

module.exports = checkRasArbitr;

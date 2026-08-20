const apiCloudClient = require('../providers/apiCloudClient');

const CASE_INFO_TIMEOUT_MS = 120000;

function array(value) {
  return Array.isArray(value) ? value : [];
}

function value(object, ...names) {
  for (const name of names) {
    if (object?.[name] !== undefined && object?.[name] !== null) return object[name];
  }
  return null;
}

function boolean(valueToNormalize) {
  if (typeof valueToNormalize === 'boolean') return valueToNormalize;
  if (typeof valueToNormalize === 'number') return valueToNormalize !== 0;
  const normalized = String(valueToNormalize ?? '').trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no', ''].includes(normalized)) return false;
  return Boolean(valueToNormalize);
}

function participant(item = {}, role) {
  return {
    name: value(item, 'Name', 'name'),
    address: value(item, 'Address', 'address', 'Adress', 'adress'),
    inn: value(item, 'Inn', 'INN', 'inn') == null ? null : String(value(item, 'Inn', 'INN', 'inn')).trim(),
    birthDate: value(item, 'BirthDate', 'birthDate'),
    role,
  };
}

function participants(source = {}) {
  const groups = [
    ['Plaintiffs', 'plaintiff'], ['Respondents', 'respondent'], ['Thirds', 'third'], ['Others', 'other'],
  ];
  return Object.fromEntries(groups.map(([name, role]) => [
    name,
    array(value(source, name, name.toLowerCase())).map((item) => participant(item, role)),
  ]));
}

function positiveNumber(input) {
  if (input === null || input === undefined || input === '') return null;
  const normalized = typeof input === 'string' ? input.replace(/\s/g, '').replace(',', '.') : input;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeEvent(event = {}, instanceId) {
  return {
    eventTypeId: value(event, 'EventTypeId', 'eventTypeId', 'Id', 'id'),
    eventTypeName: value(event, 'EventTypeName', 'eventTypeName'),
    additionalInfo: value(event, 'AdditionalInfo', 'additionalInfo'),
    contentTypes: value(event, 'ContentTypes', 'contentTypes'),
    date: value(event, 'Date', 'date'),
    publishDate: value(event, 'PublishDate', 'publishDate'),
    file: value(event, 'File', 'file'),
    declarers: value(event, 'Declarers', 'declarers'),
    declarerInn: value(event, 'DeclarerInn', 'declarerInn'),
    comment: value(event, 'Comment', 'comment'),
    claimSum: positiveNumber(value(event, 'ClaimSum', 'claimSum')),
    instanceId,
  };
}

function document(event) {
  return {
    documentType: event.eventTypeId || null,
    documentTypeText: event.eventTypeName || null,
    eventDate: event.date || null,
    publishDate: event.publishDate || null,
    contentTypes: event.contentTypes || null,
    url: event.file,
  };
}

function normalizeInstance(instance = {}) {
  const id = value(instance, 'Id', 'id');
  const instanceEvents = array(value(instance, 'InstanceEvents', 'instanceEvents'))
    .map((event) => normalizeEvent(event, id));
  return {
    id,
    instanceNumber: value(instance, 'InstanceNumber', 'instanceNumber'),
    instanceLevel: value(instance, 'InstanceLevel', 'instanceLevel'),
    nextInstanceEvent: value(instance, 'NextInstanceEvent', 'nextInstanceEvent'),
    court: value(instance, 'Court', 'court'),
    judges: value(instance, 'Judges', 'judges'),
    instanceEvents,
    courtHearings: array(value(instance, 'CourtHearings', 'courtHearings')),
    documents: instanceEvents.filter((event) => event.file).map(document),
  };
}

function eventKey(event) {
  return [event.instanceId, event.eventTypeId, event.date, event.publishDate,
    event.file, event.declarerInn, event.claimSum].map((item) => item ?? '').join('|');
}

function eventTime(event) {
  const parsed = Date.parse(event.date || event.publishDate || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeResult(result = {}) {
  const rawCaseInfo = value(result, 'CaseInfo', 'caseInfo') || {};
  const normalizedParticipants = participants(value(result, 'Participants', 'participants') || {});
  const instances = array(value(result, 'CaseInstances', 'caseInstances')).map(normalizeInstance);
  const uniqueEvents = new Map();
  instances.flatMap((instance) => instance.instanceEvents).forEach((event) => {
    if (event.claimSum !== null && !uniqueEvents.has(eventKey(event))) uniqueEvents.set(eventKey(event), event);
  });
  const claimSumEvents = Array.from(uniqueEvents.values()).sort((a, b) => eventTime(a) - eventTime(b));
  return {
    caseInfo: {
      caseId: value(rawCaseInfo, 'CaseId', 'caseId'),
      caseNumber: value(rawCaseInfo, 'CaseNumber', 'caseNumber'),
      startDate: value(rawCaseInfo, 'StartDate', 'startDate'),
      finish: boolean(value(rawCaseInfo, 'Finish', 'finish')),
      state: value(rawCaseInfo, 'State', 'state'),
      typeCode: value(rawCaseInfo, 'TypeCode', 'typeCode', 'Type', 'type'),
      typeTitle: value(rawCaseInfo, 'TypeTitle', 'typeTitle'),
    },
    participants: normalizedParticipants,
    instances,
    claimSumEvents,
    latestClaimSum: claimSumEvents.at(-1)?.claimSum ?? null,
    maxClaimSum: claimSumEvents.length ? Math.max(...claimSumEvents.map((event) => event.claimSum)) : null,
    claimSumEventsCount: claimSumEvents.length,
  };
}

async function checkKadCaseInfo({ caseId, caseNumber } = {}, options = {}) {
  if (!caseId && !caseNumber) {
    return { status: 'skipped', provider: 'apicloud', items: [], summary: {}, error: null,
      message: 'caseId и caseNumber отсутствуют.', raw: null };
  }
  const params = { type: 'caseInfo' };
  if (caseId) params.CaseId = caseId;
  else params.CaseNumber = caseNumber;
  const response = await (options.request || apiCloudClient.request)(
    'kad_arbitr.php', params, { timeoutMs: CASE_INFO_TIMEOUT_MS }
  );
  if (response?.error || Number(response?.status) !== 200) {
    return { status: 'error', provider: 'apicloud', items: [], summary: {},
      error: response?.error || 'invalid_response', message: response?.message || 'Ошибка загрузки KAD caseInfo.', raw: response || null };
  }
  if (response.found !== true || !response.Result) {
    return { status: 'empty', provider: 'apicloud', items: [], summary: { totalCount: 0 },
      error: null, message: 'Сведения KAD caseInfo не найдены.', raw: response };
  }
  const item = normalizeResult(response.Result);
  return { status: 'ok', provider: 'apicloud', items: [item],
    summary: { totalCount: 1, claimSumEventsCount: item.claimSumEventsCount }, error: null, message: null, raw: response };
}

module.exports = checkKadCaseInfo;
module.exports.normalizeResult = normalizeResult;

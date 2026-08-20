const assert = require('assert');
const path = require('path');
const kadCaseInfoSource = require('./kadCaseInfo');
const { normalizeResult } = kadCaseInfoSource;

const sourceDirectory = __dirname;
function stub(name, implementation) {
  const filename = require.resolve(path.join(sourceDirectory, name));
  require.cache[filename] = { id: filename, filename, loaded: true, exports: implementation };
}

const casesByInn = {
  '7700000001': [
    { caseId: 'respondent', caseNumber: 'A1', caseType: 'civil', role: 'respondent' },
    { caseId: 'plaintiff', caseNumber: 'A2', caseType: 'civil', role: 'plaintiff' },
    { caseId: 'bankruptcy', caseNumber: 'A3', caseType: 'bankruptcy', role: 'plaintiff' },
    { caseId: 'mixed', caseNumber: 'A4', caseType: 'civil', role: 'mixed' },
    { caseId: 'duplicate', caseNumber: 'A5', caseType: 'civil', role: 'respondent' },
    { caseId: null, caseNumber: ' A 6 ', caseType: 'civil', role: 'respondent' },
    { caseId: 'empty', caseNumber: 'A7', caseType: 'civil', role: 'respondent' },
    { caseId: 'error', caseNumber: 'A8', caseType: 'civil', role: 'respondent' },
  ],
  '7700000002': [
    { caseId: 'duplicate', caseNumber: 'A5', caseType: 'civil', role: 'respondent' },
  ],
};

function party(inn, role) {
  return { name: `ООО ${inn}`, inn, role, roleText: role };
}

stub('./kad', async ({ inn }) => ({
  status: 'ok', items: (casesByInn[inn] || []).map((item) => {
    const organizationParty = party(inn, item.role === 'mixed' ? 'plaintiff' : item.role);
    const plaintiffs = ['plaintiff', 'mixed'].includes(item.role) ? [organizationParty] : [];
    const respondents = ['respondent', 'mixed'].includes(item.role) ? [party(inn, 'respondent')] : [];
    return { kind: 'kad_case', ...item, caseTypeText: item.caseType, plaintiffs, respondents,
      participants: [...plaintiffs, ...respondents] };
  }), summary: {},
}));
const emptySource = async () => ({ status: 'empty', items: [], summary: {} });
stub('./fssp', emptySource);
stub('./efrsb', emptySource);
stub('./stopOperRS', emptySource);
delete require.cache[require.resolve('./commercialActivityApiCloud')];
const commercialActivityApiCloud = require('./commercialActivityApiCloud');

function response(id, finish = 'false') {
  const noiseEvents = Array.from({ length: 200 }, (_, index) => ({
    EventTypeId: `noise-${index}`,
    EventTypeName: `NON_PUBLIC_EVENT_MARKER_${index}`,
    AdditionalInfo: 'raw-secret',
    Date: '2025-01-01',
  }));
  return normalizeResult({
    CaseInfo: { CaseId: id, CaseNumber: id, Finish: finish, State: 'В производстве' },
    Participants: {},
    CaseInstances: [{ Id: 'instance-1', InstanceEvents: [
      { EventTypeId: 'decision', EventTypeName: 'Решение', Date: '2026-01-01', PublishDate: '2026-01-02', File: 'https://file', DeclarerInn: '1', ClaimSum: '100' },
      { EventTypeId: 'decision', EventTypeName: 'Решение', Date: '2026-01-01', PublishDate: '2026-01-02', File: 'https://file', DeclarerInn: '1', ClaimSum: '100' },
      { EventTypeId: 'ruling', EventTypeName: 'Определение', Date: '2026-02-01', ClaimSum: '75' },
      ...noiseEvents,
    ] }],
  });
}

async function main() {
  const apiCloudClient = require('../providers/apiCloudClient');
  const sourceCalls = [];
  apiCloudClient.request = async (resource, params, options) => {
    sourceCalls.push({ resource, params, options });
    if (params.CaseId === 'missing') return { status: 200, found: false };
    if (params.CaseId === 'failed') return { status: 'error', error: 'paid_source_failed' };
    return { status: 200, found: true, Result: { CaseInfo: { CaseNumber: params.CaseNumber }, Participants: {}, CaseInstances: [] } };
  };
  assert.equal((await kadCaseInfoSource({ caseNumber: 'A-CASE-NUMBER' })).status, 'ok');
  assert.equal(sourceCalls[0].params.CaseNumber, 'A-CASE-NUMBER');
  assert.equal(sourceCalls[0].params.CaseId, undefined);
  assert.equal(sourceCalls[0].options.timeoutMs, 120000);
  assert.equal((await kadCaseInfoSource({ caseId: 'missing' })).status, 'empty');
  assert.equal((await kadCaseInfoSource({ caseId: 'failed' })).status, 'error');

  const calls = [];
  const fullDetails = new Map();
  const result = await commercialActivityApiCloud({}, {
    participationSource: { status: 'ok', items: [
      { companyInn: '7700000001', fullName: 'ООО 7700000001' },
      { companyInn: '7700000002', fullName: 'ООО 7700000002' },
    ] },
    caseInfoSource: async (input) => {
      calls.push(input);
      if (input.caseId === 'empty') return { status: 'empty', items: [] };
      if (input.caseId === 'error') return { status: 'error', error: 'mock_failure', message: 'mock failure', items: [] };
      const detail = response(input.caseId || input.caseNumber, input.caseId === 'bankruptcy' ? 'true' : 'false');
      fullDetails.set(input.caseId || input.caseNumber, detail);
      return { status: 'ok', items: [detail] };
    },
  });
  const first = result.items[0];
  const byId = Object.fromEntries(first.arbitrationProceedings.map((item) => [item.caseId || item.number.trim(), item]));
  assert.equal(byId.respondent.caseInfoStatus, 'ok');
  assert.equal(byId.plaintiff.caseInfoStatus, 'skipped');
  assert.equal(byId.bankruptcy.caseInfoStatus, 'ok');
  assert.equal(byId.mixed.caseInfoStatus, 'ok');
  assert.equal(calls.filter((call) => call.caseId === 'duplicate').length, 1);
  assert(calls.some((call) => !call.caseId && call.caseNumber === ' A 6 '));
  assert.equal(byId.empty.caseInfoStatus, 'empty');
  assert.equal(byId.error.caseInfoStatus, 'error');
  assert.equal(first.arbitrationDiagnostics.status, 'partial');
  assert.equal(byId.respondent.claimSumEventsCount, 2);
  assert.equal(byId.respondent.latestClaimSum, 75);
  assert.equal(byId.respondent.maxClaimSum, 100);
  assert.deepEqual(byId.respondent.latestClaimSumEvent, {
    claimSum: 75, date: '2026-02-01', publishDate: null,
    eventTypeName: 'Определение', file: null, instanceId: 'instance-1',
  });
  assert.deepEqual(byId.respondent.maxClaimSumEvent, {
    claimSum: 100, date: '2026-01-01', publishDate: '2026-01-02',
    eventTypeName: 'Решение', file: 'https://file', instanceId: 'instance-1',
  });
  assert.equal(byId.respondent.sum, null);
  assert.equal(Object.hasOwn(byId.respondent, 'claimSumEvents'), false);
  assert.equal(byId.respondent.isFinished, false);
  assert.equal(byId.bankruptcy.isFinished, true);
  assert.equal(Object.hasOwn(byId.respondent.instances[0], 'instanceEvents'), false);
  assert.equal(byId.respondent.instances[0].documents.length, 1);
  assert.deepEqual(Object.keys(byId.respondent.instances[0].documents[0]).sort(), [
    'contentTypes', 'documentType', 'documentTypeText', 'eventDate', 'publishDate', 'url',
  ]);
  assert.equal(byId.respondent.instances[0].documentsCount, 1);
  assert.equal(byId.respondent.instancesCount, 1);
  assert.equal(byId.respondent.documentsCount, 1);
  assert.equal(result.summary.organizationsWithDocumentsCount, 2);
  assert(result.items.every((item) => item.arbitrationDiagnostics.ras.status === 'skipped'));
  const compactJson = JSON.stringify(result);
  assert(!compactJson.includes('raw-secret'));
  assert(!compactJson.includes('NON_PUBLIC_EVENT_MARKER'));
  assert(!compactJson.includes('instanceEvents'));
  assert(!compactJson.includes('claimSumEvents\"'));
  assert(!compactJson.includes('\"raw\":'));
  assert(!compactJson.includes('rawRecord'));
  assert.equal(byId.plaintiff.instancesCount, 0);
  assert.equal(byId.plaintiff.documentsCount, 0);
  assert.equal(byId.empty.instancesCount, 0);
  assert.equal(byId.empty.documentsCount, 0);
  assert.equal(byId.error.instancesCount, 0);
  assert.equal(byId.error.documentsCount, 0);

  const inflatedResult = structuredClone(result);
  for (const organization of inflatedResult.items) {
    for (const proceeding of organization.arbitrationProceedings) {
      const detail = fullDetails.get(proceeding.caseId || proceeding.number);
      if (!detail) continue;
      proceeding.claimSumEvents = detail.claimSumEvents;
      proceeding.instances = detail.instances;
    }
  }
  const inflatedBytes = Buffer.byteLength(JSON.stringify(inflatedResult));
  const compactBytes = Buffer.byteLength(compactJson);
  assert(compactBytes < inflatedBytes);

  let limitedCalls = 0;
  const limited = await commercialActivityApiCloud({}, {
    participationSource: { status: 'ok', items: [{ companyInn: '7700000001', fullName: 'ООО 7700000001' }] },
    maxCaseInfoCases: 2,
    caseInfoSource: async (input) => { limitedCalls += 1; return { status: 'ok', items: [response(input.caseId)] }; },
  });
  assert.equal(limitedCalls, 2);
  assert.equal(limited.summary.kadCaseInfoSkippedByLimitCases, 5);
  assert.equal(limited.items[0].arbitrationDiagnostics.caseInfo.skippedByLimitCount, 5);
  const limitedProceedings = limited.items[0].arbitrationProceedings;
  assert(limitedProceedings.filter((item) => item.caseInfoStatus === 'skipped_limit')
    .every((item) => item.instancesCount === 0 && item.documentsCount === 0));

  console.info(`mocked caseInfo calls: ${sourceCalls.length + calls.length + limitedCalls} (${sourceCalls.length} source + ${calls.length} main + ${limitedCalls} limit)`);
  console.info(`mocked result size: ${inflatedBytes} bytes before, ${compactBytes} bytes after (${((1 - compactBytes / inflatedBytes) * 100).toFixed(1)}% smaller)`);
  console.info('commercialActivityApiCloud caseInfo scenarios A-L: passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

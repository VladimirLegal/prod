const assert = require('assert');
const buildAnalysis = require('./buildCommercialActivityApiCloudAnalysis');

const participant = (name, inn, role, address = null) => ({ name, inn, role, address });
const proceeding = (caseId, number, role, category, amount, participants, extra = {}) => ({
  caseId, number, role, proceedingCategory: category, proceedingStartDate: '2025-01-02',
  caseInfoStatus: 'ok', latestClaimSum: amount, maxClaimSum: amount, isFinished: false,
  participants, instances: [], ...extra,
});

const creditorInn = '7711111111';
const sharedAddress = 'г. Москва, ул. Общая, д. 1';
const organizations = [
  {
    inn: '7700000001', name: 'ООО «Одинаковое имя»', fullName: 'ООО «Одинаковое имя»', status: 'Active',
    roles: ['director'], activityCode: '62.01', registrationDate: '2020-01-01',
    arbitrationProceedings: [
      proceeding(null, 'А 40-1 / 2025', 'respondent', 'civil', 100000,
        [participant('Кредитор Первый', creditorInn, 'plaintiff'), participant('Компания 1', '7700000001', 'respondent', sharedAddress)],
        { nextHearing: '15.09.2026 10:30 зал №5', instances: [{ documents: [{ documentTypeText: 'Иск удовлетворен', contentTypes: [] }] }] }),
      proceeding('claim-2', 'A40-2/2025', 'respondent', 'civil', 100000,
        [participant('КРЕДИТОР  ПЕРВЫЙ', creditorInn, 'plaintiff'), participant('Компания 1', '7700000001', 'respondent')]),
      proceeding('bank-debtor', 'А40-3/2025', 'respondent', 'bankruptcy', null,
        [participant('Кредитор Первый', creditorInn, 'plaintiff'), participant('Компания 1', '7700000001', 'respondent')]),
      proceeding('internal', 'A40-4/2025', 'plaintiff', 'civil', null,
        [participant('Компания 1', '7700000001', 'plaintiff'), participant('Компания 2', '7700000002', 'respondent', sharedAddress)],
        { caseInfoStatus: 'skipped', isFinished: null }),
    ],
    arbitrationDiagnostics: { caseInfo: { errors: [] } },
    enforcementProceedings: [
      { amount: 2500, stopInfo: null, subject: 'Задолженность', documentDetails: { claimerInn: creditorInn } },
      { amount: 0, stopInfo: null, subject: 'Требование неимущественного характера', documentDetails: { claimerInn: creditorInn } },
      { amount: 500, stopInfo: 'окончено', subject: 'Задолженность', documentDetails: { claimerInn: creditorInn } },
    ],
    fsspDiagnostics: { status: 'ok' }, efrsbDiagnostics: { status: 'ok' }, stopOperRsDiagnostics: { status: 'ok' },
    bankruptcyRecordsCount: 1, activeBankruptcyCount: 1, finishedBankruptcyCount: 0, unknownBankruptcyCount: 0,
    accountRestrictionsCount: 1, accountRestrictionBanksCount: 1, accountRestrictionDecisionsCount: 1, negativeEnsBalance: 300,
  },
  {
    inn: '7700000002', name: 'ООО “Одинаковое имя”', fullName: 'ООО “Одинаковое имя”', status: 'Bankrupting',
    roles: ['founder'], activityCode: '62.01', registrationDate: '2020-01-01',
    arbitrationProceedings: [
      proceeding(null, 'A40-1/2025', 'plaintiff', 'civil', 100000,
        [participant('Компания 2', '7700000002', 'plaintiff', sharedAddress), participant('Компания 1', '7700000001', 'respondent', sharedAddress)]),
      proceeding('bank-creditor', 'A40-5/2025', 'plaintiff', 'bankruptcy', 200000,
        [participant('Компания 2', '7700000002', 'plaintiff'), participant('Должник', '7722222222', 'respondent')]),
      proceeding('other-creditor', 'A40-6/2025', 'respondent', 'civil', 100000,
        [participant('Другой кредитор', '7733333333', 'plaintiff'), participant('Компания 2', '7700000002', 'respondent')],
        { caseInfoStatus: 'error', isFinished: null }),
    ],
    arbitrationDiagnostics: { caseInfo: { errors: [{ caseId: 'other-creditor', caseNumber: 'A40-6/2025', error: 'mock', message: 'mock error' }] } },
    enforcementProceedings: [], fsspDiagnostics: { status: 'error' }, efrsbDiagnostics: { status: 'error' }, stopOperRsDiagnostics: { status: 'error' },
    bankruptcyRecordsCount: 0, activeBankruptcyCount: 0, finishedBankruptcyCount: 0, unknownBankruptcyCount: 0,
    accountRestrictionsCount: 0, accountRestrictionBanksCount: 0, accountRestrictionDecisionsCount: 0, negativeEnsBalance: null,
  },
];

const before = JSON.stringify(organizations);
const analysis = buildAnalysis(organizations);
assert.equal(JSON.stringify(organizations), before, 'input must not be mutated');
assert.equal(analysis.patterns.repeatedCases.length, 1);
assert.equal(analysis.patterns.recurringCreditors.find((item) => item.creditorInn === creditorInn).caseCount, 3);
assert.equal(analysis.patterns.repeatedClaimSeries.length, 1);
assert.equal(analysis.patterns.repeatedClaimSeries[0].creditorInn, creditorInn);
assert(!analysis.patterns.repeatedClaimSeries.some((item) => item.creditorInn === '7733333333'));
assert.equal(analysis.patterns.repeatedClaimSeries[0].caseCount, 2);
assert(analysis.patterns.repeatedAmounts.some((item) => item.amount === 100000 && item.caseCount >= 3));
assert.equal(analysis.bankruptcy.asDebtor.casesCount, 1);
assert.equal(analysis.bankruptcy.asCreditor.casesCount, 1);
assert.equal(analysis.patterns.internalGroupCases.length, 2);
assert.equal(analysis.coverage.organizationsCount, 2, 'same names must remain separate organizations');
assert.equal(analysis.organizationOverview.duplicateNames[0].organizationCount, 2);
assert.equal(analysis.patterns.sharedCourtAddresses[0].mayBeHistorical, true);
assert.equal(analysis.patterns.sharedCourtAddresses[0].source, 'kad_participants');
assert.deepEqual(analysis.enforcement.summary, { totalCount: 3, activeCount: 2, closedCount: 1,
  activeMonetaryCount: 1, activeNonMonetaryCount: 1, activeZeroOrUnknownAmountCount: 0,
  activeAmount: 2500, closedAmount: 500 });
assert.equal(analysis.enforcement.creditorMatches.length, 1);
assert.equal(analysis.enforcement.creditorMatches[0].creditorInn, creditorInn);
assert.equal(analysis.enforcement.summary.activeAmount, 2500, 'KAD amounts must not enter FSSP amount');
assert.equal(analysis.coverage.caseInfo.error, 1);
assert.equal(analysis.coverage.caseInfo.skipped, 1);
assert.equal(analysis.coverage.sourceErrors.kadCaseInfoCases[0].error, 'mock');
assert.equal(analysis.litigation.declaredClaims.isDebt, false);
assert.equal(analysis.litigation.activeCases.every((item) => !Object.hasOwn(item, 'participants')), true);
assert.equal(analysis.litigation.upcomingHearings[0].parsed, true);
assert.equal(analysis.outcomeSignals.satisfied, 1);
const json = JSON.stringify(analysis);
for (const forbidden of ['"raw"', '"documents"', '"instances"', '"participants"', '"claimSumEvents"', '"instanceEvents"', '"subjectItems"']) {
  assert(!json.includes(forbidden), `analysis leaked ${forbidden}`);
}
const empty = buildAnalysis([]);
assert.equal(empty.version, 1);
assert.equal(empty.coverage.organizationsCount, 0);
assert.deepEqual(empty.patterns.repeatedCases, []);
assert.deepEqual(empty.enforcement.summary, { totalCount: 0, activeCount: 0, closedCount: 0,
  activeMonetaryCount: 0, activeNonMonetaryCount: 0, activeZeroOrUnknownAmountCount: 0, activeAmount: 0, closedAmount: 0 });

const example = { coverage: analysis.coverage, litigation: { summary: analysis.litigation.summary,
  declaredClaims: analysis.litigation.declaredClaims, activeCases: analysis.litigation.activeCases },
patterns: { repeatedCases: analysis.patterns.repeatedCases, repeatedClaimSeries: analysis.patterns.repeatedClaimSeries },
  enforcement: analysis.enforcement };
console.info('compact analysis example:', JSON.stringify(example, null, 2));
console.info(`analysis JSON size: ${Buffer.byteLength(json)} bytes`);
console.info('buildCommercialActivityApiCloudAnalysis scenarios 1-16: passed');

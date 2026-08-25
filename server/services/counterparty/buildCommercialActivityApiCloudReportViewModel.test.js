const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const buildReport = require('./buildCommercialActivityApiCloudReportViewModel');

const source = { status: 'ok', provider: 'apicloud', summary: { inactiveCount: 0 }, items: [{
  name: 'ООО <Альфа>', inn: '7700000001', roles: ['director', 'founder'], status: 'Active', isDataReliable: false,
  arbitrationProceedings: [
    { caseId: 'active', number: 'А-1/2026', isFinished: false, proceedingStartDate: '01.02.2026', proceedingCategoryText: 'гражданское', caseState: 'первая инстанция', latestClaimSum: 125.5 },
    { caseId: 'finished', number: 'А-2/2025', isFinished: true, latestClaimSum: 50 },
    { number: ' A-3/2025 ', latestClaimSum: 25 },
    { caseId: 'plaintiff', number: 'А-4/2026', isFinished: false, latestClaimSum: 999 },
  ],
  enforcementProceedings: [
    { processNumber: '11/26/78001-ИП', processDate: '15.03.2026', processTotal: '270000/00/54007-СД', documentText: 'fallback must not render', amount: 50, documentDetails: { claimerInn: '7700000002', docType: 'Исполнительный лист', docDate: '23.07.2021', documentNumber: 'ФС 039022227', organization: 'Арбитражный суд' } },
    { number: '12/26', amount: null, documentDetails: {} }, { number: 'closed', amount: 100, stopInfo: 'closed' },
  ], bankruptcyRecords: [],
}], analysis: {
  coverage: { organizationsCount: 1, uniqueCasesCount: 4, caseInfo: { eligibleCasesCount: 3, requestedCasesCount: 3, loadedCasesCount: 2, failedCasesCount: 1, notSelectedCasesCount: 1, skippedByLimitCasesCount: 0 } }, organizationOverview: { activeCount: 1 },
  litigation: { summary: { active: 2 }, activeCases: [
    { caseId: 'active', caseNumber: 'А-1/2026', organizationInn: '7700000001', organizationName: 'ООО <Альфа>', role: 'respondent', latestClaimSum: 125.5, nextHearing: '15.09.2026' },
    { caseId: 'active', caseNumber: 'А-1/2026', organizationInn: '7700000001', organizationName: 'ООО <Альфа>', role: 'respondent', latestClaimSum: 125.5 },
    { caseId: 'plaintiff', caseNumber: 'А-4/2026', organizationInn: '7700000001', organizationName: 'ООО <Альфа>', role: 'plaintiff', latestClaimSum: 999 },
  ], declaredClaims: { exposure: { active: { casesCount: 1, latestClaimsTotal: 125.5 } } } },
  enforcement: { summary: { activeCount: 2, activeAmount: 50 }, creditorMatches: [{ organizationInn: '7700000001', creditorInn: '7700000002', creditorName: 'ООО «Кредитор»', kadCasesCount: 2, kadCaseRefs: [{ caseId: 'active' }, { caseId: 'finished' }] }] },
  accountRestrictions: { organizations: [] }, bankruptcy: { asDebtor: {} }, insolvency: {},
  patterns: {
    recurringCreditors: [{ creditorName: 'ООО «Кредитор»', creditorInn: '7700000002', creditorIdentityType: 'inn', caseRefs: [{ caseId: 'active' }, { caseId: 'active' }, { caseId: 'finished' }, { caseNumber: 'А-3/2025' }] }],
    recurringDefendants: [{ defendantName: 'Ответчик', caseRefs: [{ caseId: 'finished' }] }], repeatedAmounts: [], repeatedClaimSeries: [], repeatedCases: [], internalGroupCases: [], sharedCourtAddresses: [{ address: 'Адрес', organizationCount: 2, organizations: [] }], duplicateOrganizationNames: [],
  },
} };
const snapshot = JSON.stringify(source); const report = buildReport(source); const organization = report.priorityOrganizations[0];
assert.equal(report.activeCases.length, 2, 'active cases deduplicate by caseId');
assert.equal(organization.relationshipText, 'руководитель и учредитель'); assert.equal(organization.statusText, 'действующая');
assert.equal(organization.respondentCases.length, 1); assert.equal(organization.plaintiffCases.length, 1); assert.equal(organization.respondentClaimsTotal, 125.5, 'plaintiff claim excluded');
assert.equal(organization.respondentCases[0].url, 'https://kad.arbitr.ru/Card/active');
assert.equal(organization.respondentCases[0].proceedingStartDate, '01.02.2026'); assert.equal(organization.respondentCases[0].category, 'гражданское'); assert.equal(organization.respondentCases[0].caseState, 'первая инстанция'); assert.equal(organization.respondentCases[0].nextHearing, '15.09.2026');
assert.equal(report.activeEnforcementProceedings.length, 2);
const enforcement = report.activeEnforcementProceedings[0]; assert.equal(enforcement.processNumber, '11/26/78001-ИП'); assert.equal(enforcement.processTotal, '270000/00/54007-СД'); assert.equal(enforcement.documentNumber, 'ФС 039022227'); assert.equal(enforcement.documentType, 'Исполнительный лист'); assert.equal(enforcement.documentDate, '23.07.2021'); assert.equal(enforcement.documentText, null, 'structured document details take priority');
assert.equal(enforcement.creditorDisplayName, 'ООО «Кредитор»'); assert.equal(enforcement.creditorInn, '7700000002'); assert.equal(enforcement.kadMatch, true); assert.equal(enforcement.kadCases.length, 2); assert(enforcement.kadCases[0].url.includes('/active'));
assert.equal(report.activeEnforcementProceedings[1].creditorDisplayName, null); assert.equal(report.activeEnforcementProceedings[1].kadMatch, false);
const creditor = report.recurringCreditorRows[0]; assert.deepEqual([creditor.activeCount, creditor.finishedCount, creditor.unknownCount], [1, 1, 1]); assert.equal(creditor.buckets.active[0].url, 'https://kad.arbitr.ru/Card/active');
assert.equal(report.recurringRespondentRows[0].noActiveText, 'Только завершённые дела'); assert.equal(report.organizationalMatchRows[0].label, 'Общие судебные адреса'); assert.equal(report.organizationalMatchRows[0].value, 1); assert(!Object.hasOwn(report.organizationalMatchRows[0], 'activeCount'));
assert.equal(creditor.finishedExamples.length, 1); assert.equal(creditor.totalAmount, 200.5); assert.equal(creditor.activeUnknownAmountCount, 0);
assert.equal(JSON.stringify(source), snapshot, 'input is not mutated');
for (const partial of [undefined, {}, { status: 'empty' }, { status: 'error', items: null }, { status: 'ok', analysis: {}, items: [] }]) assert.doesNotThrow(() => buildReport(partial));
const template = fs.readFileSync(path.join(__dirname, '../../templates/counterpartyReport.html'), 'utf8');
const section = template.slice(template.indexOf('commercial-api-cloud-report-section'), template.indexOf('{{#if sources.rosfin}}'));
assert(template.includes('Участие в юридических лицах — аналитическая таблица'));
assert(!section.includes('Приложение. Все связанные организации')); assert(!section.includes('>Активные судебные дела<')); assert(!section.includes('>Связь и статус<'));
assert(section.includes('Связь: {{relationshipText}}')); assert(section.includes('Статус: {{statusText}}')); assert(section.includes('Наименование не определено'));
assert(section.includes('Исполнительное производство и документ')); assert(section.includes('Совпадения с делами KAD')); assert(section.includes('Номер ИП и исполнительного документа не указан источником'));
assert(!section.includes('<h5>Общие адреса</h5>')); assert.equal(report.organizationalMatchRows[0].label, 'Общие судебные адреса');
assert(section.indexOf('Информация из картотеки арбитражных дел') < section.indexOf('Организации с текущими факторами')); assert(report.coverageRows.some((row) => row.label === 'Не загружено подробных сведений по делам, в которых связанные компании выступают только истцами'));
assert(section.includes('Судебные закономерности')); assert(section.includes('Организационные совпадения')); assert(section.includes('Активных дел:')); assert(section.includes('Завершённых дел:')); assert(section.includes('Статус не подтверждён:'));
Handlebars.registerHelper('eq', (a, b) => a === b); Handlebars.registerHelper('formatMoneyRu', (value) => String(value));
const escaped = Handlebars.compile('{{organizationName}}')({ organizationName: 'ООО <Альфа>' }); assert.equal(escaped, 'ООО &lt;Альфа&gt;');
console.info('buildCommercialActivityApiCloudReportViewModel tests passed');

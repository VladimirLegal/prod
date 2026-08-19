const checkLegalEntityParticipationApiCloud = require('./legalEntityParticipationApiCloud');
const checkKad = require('./kad');
const checkFssp = require('./fssp');
const checkEfrsb = require('./efrsb');
const buildArbitrationApiCloudCombined = require('../buildArbitrationApiCloudCombined');

const ARBITRATION_TIMEOUT_MS = 120000;
const FSSP_TIMEOUT_MS = 400000;
const EFRSB_TIMEOUT_MS = 120000;

function buildEmptySummary() {
  return {
    totalCount: 0, activeCount: 0, inactiveCount: 0, unknownStatusCount: 0,
    withArbitrationCount: 0, totalArbitrationCases: 0,
    plaintiffOrganizationsCount: 0, respondentOrganizationsCount: 0,
    mixedRoleOrganizationsCount: 0, bankruptcyCaseOrganizationsCount: 0,
    totalBankruptcyCases: 0, organizationsWithDocumentsCount: 0,
    rasCheckedOrganizationsCount: 0, rasSkippedOrganizationsCount: 0,
    arbitrationErrorOrganizationsCount: 0,
    withEnforcementProceedingsCount: 0, totalEnforcementProceedings: 0,
    activeEnforcementProceedings: 0, closedEnforcementProceedings: 0,
    enforcementProceedingsTotalAmount: 0, fsspErrorOrganizationsCount: 0,
    fsspPartialOrganizationsCount: 0, withBankruptcyRecordsCount: 0,
    totalBankruptcyRecords: 0, activeBankruptcyRecords: 0,
    finishedBankruptcyRecords: 0, unknownBankruptcyRecords: 0,
    efrsbErrorOrganizationsCount: 0, efrsbPartialOrganizationsCount: 0,
  };
}

function resolveStatus(statusText) {
  const value = String(statusText || '').trim().toLocaleLowerCase('ru-RU');
  if (value.includes('реорганизац')) return 'Reorganizing';
  if (value.includes('банкрот')) return 'Bankrupting';
  if (value.includes('в процессе ликвидац') || value.includes('в стадии ликвидац') || value.includes('ликвидац')) return 'Dissolving';
  if (value.includes('ликвидирован') || value.includes('прекращен') ||
      value.includes('прекращён') || value.includes('недействующ')) return 'Dissolved';
  if (value.includes('действующ')) return 'Active';
  return 'Unknown';
}

function buildRelationship(roles = []) {
  const relationshipType = [];
  const relationshipTypeText = [];
  if (roles.includes('director')) {
    relationshipType.push('Director'); relationshipTypeText.push('Руководитель');
  }
  if (roles.includes('founder')) {
    relationshipType.push('Founder'); relationshipTypeText.push('Учредитель');
  }
  return { relationshipType, relationshipTypeText };
}

function groupDocuments(documents = []) {
  const groups = new Map();
  for (const document of documents) {
    const key = [document.instanceLevel ?? '', document.instanceNumber || '', document.court || ''].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        instanceLevel: document.instanceLevel ?? null,
        instanceNumber: document.instanceNumber || null,
        court: document.court || null,
        documents: [],
      });
    }
    groups.get(key).documents.push({
      documentType: document.documentType || null,
      documentTypeText: document.documentTypeText || null,
      publishDate: document.registrationDate || null,
      url: document.fileUrl || null,
    });
  }
  return Array.from(groups.values());
}

function buildProceedings(cases = []) {
  return cases.map((item) => ({
    number: item.caseNumber || null,
    proceedingType: item.caseType || 'other',
    proceedingCategory: item.caseType || 'other',
    proceedingCategoryText: item.caseTypeText || null,
    proceedingStartDate: item.caseDate || null,
    sum: null,
    url: item.url || null,
    role: item.role || 'unknown',
    roleText: item.roleText || null,
    participants: (Array.isArray(item.participants) ? item.participants : []).map((participant) => ({
      name: participant.name || null, inn: participant.inn || null,
      role: participant.role || null, roleText: participant.roleText || null,
      address: participant.address || null,
    })),
    instances: groupDocuments(item.documents),
  }));
}

function buildCategoryGroups(cases = []) {
  const counts = new Map();
  for (const item of cases) {
    const name = item.caseType || 'other';
    const current = counts.get(name) || { name, nameText: item.caseTypeText || null, count: 0, sum: null };
    current.count += 1;
    counts.set(name, current);
  }
  return Array.from(counts.values());
}

function compactSource(source = {}) {
  return {
    status: source.status || 'empty',
    error: source.error || null,
    message: source.message || source.items?.find((item) => item?.message)?.message || null,
    pagination: source.pagination || null,
  };
}

function buildSkippedRasSource() {
  return {
    status: 'skipped',
    error: null,
    message: 'Судебные акты RAS не загружались в рамках проверки связанных организаций.',
    items: [],
    pagination: null,
  };
}

function baseOrganization(organization = {}) {
  const roles = Array.isArray(organization.roles) ? organization.roles : [];
  return {
    kind: 'commercial_activity_org',
    name: organization.fullName || organization.shortName || null,
    shortName: organization.shortName || null,
    fullName: organization.fullName || null,
    inn: organization.companyInn || null,
    ogrn: organization.companyOgrn || null,
    status: resolveStatus(organization.statusText),
    statusText: organization.statusText || null,
    registrationDate: organization.registrationDate || null,
    activityCode: organization.okved || null,
    activityName: organization.okvedName || null,
    ...buildRelationship(roles), roles, rolesText: organization.rolesText || null,
    isActive: organization.isActive ?? null,
    isDataReliable: organization.isDataReliable ?? null,
    arbitrationCount: 0, arbitrationSum: null,
    arbitrationGroupByResult: [], arbitrationGroupByCategory: [], arbitrationProceedings: [],
    enforcementProceedingsCount: 0, activeEnforcementProceedingsCount: 0,
    closedEnforcementProceedingsCount: 0, enforcementProceedingsAmount: 0,
    enforcementProceedings: [], fsspDiagnostics: emptyFsspDiagnostics(),
    bankruptcyRecordsCount: 0, activeBankruptcyCount: 0,
    finishedBankruptcyCount: 0, unknownBankruptcyCount: 0,
    bankruptcyRecords: [], efrsbDiagnostics: emptyEfrsbDiagnostics(),
  };
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function emptyFsspDiagnostics(status = 'empty', message = null) {
  return { status, error: null, message, partial: false, countAll: null, pagesAll: null, totalLoadedPage: null };
}

function emptyEfrsbDiagnostics(status = 'empty', message = null) {
  return { status, error: null, message, partial: false, totalCount: null, loadCount: null, allCountPages: null };
}

function compactFsspItem(item = {}) {
  return {
    processNumber: item.processNumber || null, processDate: item.processDate || null,
    processTotal: item.processTotal || null, amount: numberOrNull(item.amount), subject: item.subject || null,
    subjectItems: (Array.isArray(item.subjectItems) ? item.subjectItems : []).map(({ title, sum }) => ({ title: title || null, sum: numberOrNull(sum) })),
    stopInfo: item.stopInfo || null, stopDate: item.stopDate || null, stopReason: item.stopReason || null,
    documentType: item.documentType || null, documentText: item.documentText || null,
    documentDetails: item.documentDetails || null, departmentName: item.departmentName || null,
    departmentAddress: item.departmentAddress || null, officerName: item.officerName || null,
    officerPhones: Array.isArray(item.officerPhones) ? item.officerPhones : [], debtorName: item.debtorName || null,
    debtorInn: item.debtorInn || null, debtorAddress: item.debtorAddress || null,
  };
}

function compactBankruptcyItem(item = {}) {
  const fields = ['guid', 'fullName', 'inn', 'category', 'region', 'address', 'manager', 'caseNumber',
    'status', 'statusCode', 'statusText', 'statusEgrul', 'description', 'updateDate', 'isActive', 'procedureState'];
  return Object.fromEntries(fields.map((field) => [field, item[field] ?? null]));
}

async function enrichOrganization(organization) {
  const item = baseOrganization(organization);
  if (!/^\d{10}$/.test(String(organization?.companyInn || ''))) {
    const invalidInnMessage =
      'Проверка KAD пропущена: отсутствует корректный 10-значный ИНН организации.';

    item.arbitrationDiagnostics = {
      status: 'skipped',
      exception: false,
      message: invalidInnMessage,
      kad: {
        status: 'skipped',
        error: null,
        message: invalidInnMessage,
        pagination: null,
      },
      ras: compactSource(buildSkippedRasSource()),
    };
    item.fsspDiagnostics = emptyFsspDiagnostics('skipped', 'Проверка ФССП пропущена: отсутствует корректный 10-значный ИНН организации.');
    item.efrsbDiagnostics = emptyEfrsbDiagnostics('skipped', 'Проверка ЕФРСБ пропущена: отсутствует корректный 10-значный ИНН организации.');
    return item;
  }

  const target = { inn: organization.companyInn, fullName: organization.fullName || organization.shortName };
  try {
    const [kadResult, fsspResult, efrsbResult] = await Promise.allSettled([
      checkKad(target, { loadAllPages: true, timeoutMs: ARBITRATION_TIMEOUT_MS }),
      checkFssp(target, { organizationMode: true, timeoutMs: FSSP_TIMEOUT_MS }),
      checkEfrsb(target, { organizationMode: true, timeoutMs: EFRSB_TIMEOUT_MS }),
    ]);
    const makeErrorSource = (result, sourceName) => result.status === 'fulfilled'
      ? result.value
      : {
          status: 'error',
          error: result.reason?.message || `${sourceName}_unexpected_error`,
          message: result.reason?.message || `Неожиданная ошибка источника ${sourceName}.`,
          items: [],
        };
    const kadSource = makeErrorSource(kadResult, 'KAD');
    const rasSource = buildSkippedRasSource();
    const combined = buildArbitrationApiCloudCombined(target, kadSource, rasSource);
    const cases = Array.isArray(combined.cases) ? combined.cases : [];
    item.arbitrationCount = cases.length;
    item.arbitrationGroupByCategory = buildCategoryGroups(cases);
    item.arbitrationProceedings = buildProceedings(cases);
    item.arbitrationDiagnostics = {
      status: kadSource.status === 'error' ? 'error' : 'ok',
      exception: false, kad: compactSource(kadSource), ras: compactSource(rasSource),
    };
    const fsspSource = makeErrorSource(fsspResult, 'FSSP');
    const fsspItems = Array.isArray(fsspSource.items) ? fsspSource.items : [];
    item.enforcementProceedings = fsspItems.map(compactFsspItem);
    item.enforcementProceedingsCount = item.enforcementProceedings.length;
    item.activeEnforcementProceedingsCount = Number(fsspSource.summary?.activeCount) || 0;
    item.closedEnforcementProceedingsCount = Number(fsspSource.summary?.closedCount) || 0;
    item.enforcementProceedingsAmount = Number(fsspSource.summary?.totalAmount) || 0;
    const countAll = numberOrNull(fsspSource.raw?.countAll);
    const pagesAll = numberOrNull(fsspSource.raw?.pagesAll);
    const totalLoadedPage = numberOrNull(fsspSource.raw?.totalLoadedPage);
    item.fsspDiagnostics = {
      ...emptyFsspDiagnostics(fsspSource.status || 'empty', fsspSource.message || null),
      error: fsspSource.error || null, countAll, pagesAll, totalLoadedPage,
      partial: pagesAll !== null && totalLoadedPage !== null && pagesAll > totalLoadedPage,
    };
    const efrsbSource = makeErrorSource(efrsbResult, 'EFRSB');
    const efrsbItems = Array.isArray(efrsbSource.items)
      ? efrsbSource.items.filter((record) => record?.kind === 'bankruptcy_case') : [];
    item.bankruptcyRecords = efrsbItems.map(compactBankruptcyItem);
    item.bankruptcyRecordsCount = item.bankruptcyRecords.length;
    item.activeBankruptcyCount = Number(efrsbSource.summary?.activeCount) || 0;
    item.finishedBankruptcyCount = Number(efrsbSource.summary?.finishedCount) || 0;
    item.unknownBankruptcyCount = Number(efrsbSource.summary?.unknownCount) || 0;
    const totalCount = numberOrNull(efrsbSource.raw?.totalCount);
    const loadCount = numberOrNull(efrsbSource.raw?.LoadCount);
    const allCountPages = numberOrNull(efrsbSource.raw?.AllCountPages);
    item.efrsbDiagnostics = {
      ...emptyEfrsbDiagnostics(efrsbSource.status || 'empty', efrsbSource.message || null),
      error: efrsbSource.error || null, totalCount, loadCount, allCountPages,
      partial: totalCount !== null && loadCount !== null && totalCount > loadCount,
    };
    return item;
  } catch (error) {
    item.arbitrationDiagnostics = {
      status: 'error', exception: true,
      message: error?.message || 'Неожиданная ошибка арбитражного обогащения организации.',
    };
    return item;
  }
}

function hasPaginationErrors(diagnostics = {}) {
  return diagnostics?.kad?.pagination?.failedPages?.length > 0;
}

function buildSummary(items = []) {
  const summary = buildEmptySummary();
  summary.totalCount = items.length;
  summary.activeCount = items.filter((item) => item.isActive === true).length;
  summary.inactiveCount = items.filter((item) => item.isActive === false).length;
  summary.unknownStatusCount = items.filter(
    (item) => item.isActive !== true && item.isActive !== false
  ).length;
  summary.withArbitrationCount = items.filter((item) => item.arbitrationCount > 0).length;
  summary.totalArbitrationCases = items.reduce((sum, item) => sum + item.arbitrationCount, 0);
  summary.plaintiffOrganizationsCount = items.filter((item) => item.arbitrationProceedings.some((p) => p.role === 'plaintiff' || p.role === 'mixed')).length;
  summary.respondentOrganizationsCount = items.filter((item) => item.arbitrationProceedings.some((p) => p.role === 'respondent' || p.role === 'mixed')).length;
  summary.mixedRoleOrganizationsCount = items.filter((item) => {
    const roles = new Set(item.arbitrationProceedings.map((p) => p.role));
    return roles.has('mixed') || (roles.has('plaintiff') && roles.has('respondent'));
  }).length;
  summary.bankruptcyCaseOrganizationsCount = items.filter((item) => item.arbitrationProceedings.some((p) => p.proceedingCategory === 'bankruptcy')).length;
  summary.totalBankruptcyCases = items.reduce((sum, item) => sum + item.arbitrationProceedings.filter((p) => p.proceedingCategory === 'bankruptcy').length, 0);
  summary.organizationsWithDocumentsCount = items.filter((item) => item.arbitrationProceedings.some((p) => p.instances.some((i) => i.documents.length))).length;
  summary.rasCheckedOrganizationsCount = items.filter((item) =>
    ['ok', 'empty'].includes(item.arbitrationDiagnostics?.ras?.status)
  ).length;

  summary.rasSkippedOrganizationsCount = items.filter(
    (item) => item.arbitrationDiagnostics?.ras?.status === 'skipped'
  ).length;
  summary.arbitrationErrorOrganizationsCount = items.filter((item) => item.arbitrationDiagnostics?.status === 'error' || hasPaginationErrors(item.arbitrationDiagnostics)).length;
  summary.withEnforcementProceedingsCount = items.filter((item) => item.enforcementProceedingsCount > 0).length;
  summary.totalEnforcementProceedings = items.reduce((sum, item) => sum + item.enforcementProceedingsCount, 0);
  summary.activeEnforcementProceedings = items.reduce((sum, item) => sum + item.activeEnforcementProceedingsCount, 0);
  summary.closedEnforcementProceedings = items.reduce((sum, item) => sum + item.closedEnforcementProceedingsCount, 0);
  summary.enforcementProceedingsTotalAmount = items.reduce((sum, item) => sum + item.enforcementProceedingsAmount, 0);
  summary.fsspErrorOrganizationsCount = items.filter((item) => item.fsspDiagnostics?.status === 'error').length;
  summary.fsspPartialOrganizationsCount = items.filter((item) => item.fsspDiagnostics?.partial === true).length;
  summary.withBankruptcyRecordsCount = items.filter((item) => item.bankruptcyRecordsCount > 0).length;
  summary.totalBankruptcyRecords = items.reduce((sum, item) => sum + item.bankruptcyRecordsCount, 0);
  summary.activeBankruptcyRecords = items.reduce((sum, item) => sum + item.activeBankruptcyCount, 0);
  summary.finishedBankruptcyRecords = items.reduce((sum, item) => sum + item.finishedBankruptcyCount, 0);
  summary.unknownBankruptcyRecords = items.reduce((sum, item) => sum + item.unknownBankruptcyCount, 0);
  summary.efrsbErrorOrganizationsCount = items.filter((item) => item.efrsbDiagnostics?.status === 'error').length;
  summary.efrsbPartialOrganizationsCount = items.filter((item) => item.efrsbDiagnostics?.partial === true).length;
  return summary;
}

async function commercialActivityApiCloud(person, options = {}) {
  const participation = options.participationSource || await checkLegalEntityParticipationApiCloud(person);
  const common = { provider: 'apicloud', affectsRisk: false, items: [], summary: buildEmptySummary() };
  if (participation?.status === 'error') return { ...common, status: 'error', error: participation.error || 'participation_failed', message: participation.message || null };
  if (participation?.status === 'skipped') return { ...common, status: 'skipped', message: participation.message || null };
  const organizations = Array.isArray(participation?.items) ? participation.items : [];
  if (!organizations.length) return { ...common, status: 'empty', message: 'Связанные юридические лица не найдены.' };
  const items = await Promise.all(organizations.map(enrichOrganization));
  return { ...common, status: 'ok', items, summary: buildSummary(items), message: `Проверены связанные юридические лица: ${items.length}.` };
}

module.exports = commercialActivityApiCloud;

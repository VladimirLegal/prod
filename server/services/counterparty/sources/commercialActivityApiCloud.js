const checkLegalEntityParticipationApiCloud = require('./legalEntityParticipationApiCloud');
const checkKad = require('./kad');
const checkRasArbitr = require('./rasArbitr');
const buildArbitrationApiCloudCombined = require('../buildArbitrationApiCloudCombined');

const ARBITRATION_TIMEOUT_MS = 120000;

function buildEmptySummary() {
  return {
    totalCount: 0, activeCount: 0, inactiveCount: 0, unknownStatusCount: 0,
    withArbitrationCount: 0, totalArbitrationCases: 0,
    plaintiffOrganizationsCount: 0, respondentOrganizationsCount: 0,
    mixedRoleOrganizationsCount: 0, bankruptcyCaseOrganizationsCount: 0,
    totalBankruptcyCases: 0, organizationsWithDocumentsCount: 0,
    arbitrationErrorOrganizationsCount: 0,
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
  };
}

async function enrichOrganization(organization) {
  const item = baseOrganization(organization);
  if (!/^\d{10}$/.test(String(organization?.companyInn || ''))) {
    item.arbitrationDiagnostics = {
      status: 'skipped', exception: false,
      message: 'Проверка KAD/RAS пропущена: отсутствует корректный 10-значный ИНН организации.',
    };
    return item;
  }

  const target = { inn: organization.companyInn, fullName: organization.fullName || organization.shortName };
  try {
    const [kadResult, rasResult] = await Promise.allSettled([
      checkKad(target, { loadAllPages: true, timeoutMs: ARBITRATION_TIMEOUT_MS }),
      checkRasArbitr(target, { loadAllPages: true, timeoutMs: ARBITRATION_TIMEOUT_MS }),
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
    const rasSource = makeErrorSource(rasResult, 'RAS');
    const combined = buildArbitrationApiCloudCombined(target, kadSource, rasSource);
    const cases = Array.isArray(combined.cases) ? combined.cases : [];
    item.arbitrationCount = cases.length;
    item.arbitrationGroupByCategory = buildCategoryGroups(cases);
    item.arbitrationProceedings = buildProceedings(cases);
    item.arbitrationDiagnostics = {
      status: kadSource.status === 'error' || rasSource.status === 'error' ? 'error' : 'ok',
      exception: false, kad: compactSource(kadSource), ras: compactSource(rasSource),
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
  return ['kad', 'ras'].some((key) => diagnostics?.[key]?.pagination?.failedPages?.length > 0);
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
  summary.arbitrationErrorOrganizationsCount = items.filter((item) => item.arbitrationDiagnostics?.status === 'error' || hasPaginationErrors(item.arbitrationDiagnostics)).length;
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

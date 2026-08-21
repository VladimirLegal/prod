const CLAIM_MESSAGE = 'Суммы KAD являются заявленными требованиями и не относятся к подтверждённой текущей задолженности.';

const array = (value) => Array.isArray(value) ? value : [];
const digits = (value) => String(value || '').replace(/\D/g, '');
const text = (value) => String(value || '').trim().toLowerCase().replace(/ё/g, 'е')
  .replace(/[«»„“”‟❝❞"']/g, '').replace(/\s+/g, ' ');
const number = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
  ? null : Number(value);
const kopecks = (value) => { const parsed = number(value); return parsed === null ? null : Math.round(parsed * 100); };
const caseNumber = (value) => String(value || '').replace(/\s+/g, '').toUpperCase().replace(/A/g, 'А');
const caseKey = (item) => item.caseId ? `id:${String(item.caseId).trim()}` : `number:${caseNumber(item.number || item.caseNumber)}`;
const caseRef = (record) => ({ caseId: record.proceeding.caseId || null,
  caseNumber: record.proceeding.number || null, organizationInn: record.organization.inn || null });
const unique = (values) => Array.from(new Set(values));
const countBy = (values) => Object.fromEntries(Array.from(values.reduce((map, value) =>
  map.set(value || 'unknown', (map.get(value || 'unknown') || 0) + 1), new Map())).sort());

function parseHearing(value) {
  const original = typeof value === 'string' ? value : value == null ? null : JSON.stringify(value);
  if (!original) return { parsed: false, date: null, time: null, courtroom: null, original };
  const dateMatch = original.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})/);
  const timeMatch = original.match(/(?:^|\s)(\d{1,2}:\d{2})(?:\s|$)/);
  const roomMatch = original.match(/(?:зал|каб(?:инет)?)[\s№#:]*(\w[\w/-]*)/i);
  return { parsed: Boolean(dateMatch), date: dateMatch?.[1] || null, time: timeMatch?.[1] || null,
    courtroom: roomMatch?.[1] || null, original };
}

function emptyAnalysis() {
  return {
    version: 1,
    coverage: { organizationsCount: 0, caseOccurrencesCount: 0, uniqueCasesCount: 0,
      caseInfo: { ok: 0, empty: 0, error: 0, skipped: 0, skippedLimit: 0 },
      claimAmounts: { known: 0, unknown: 0, respondentKnown: 0, respondentUnknown: 0,
        plaintiffKnown: 0, plaintiffUnknown: 0 },
      sourceErrors: { kadCaseInfoCases: [], fsspOrganizations: 0, efrsbOrganizations: 0, stopOperRsOrganizations: 0 } },
    organizationOverview: { activeCount: 0, bankruptcyProcessCount: 0, exclusionProcessCount: 0,
      byRelationshipRole: {}, byMainActivity: {}, duplicateNames: [], duplicateRegistrationDates: [] },
    litigation: { summary: { respondent: 0, plaintiff: 0, mixed: 0, civil: 0, administrative: 0,
      bankruptcy: 0, other: 0, finished: 0, active: 0, unknownState: 0 }, byRole: {}, byCategory: {}, byYear: [],
      declaredClaims: { respondent: { casesWithAmount: 0, casesWithoutAmount: 0, latestClaimsTotal: 0 },
        plaintiff: { casesWithAmount: 0, casesWithoutAmount: 0, latestClaimsTotal: 0 },
        ranges: ['up_to_100k', '100k_to_1m', '1m_to_10m', 'over_10m', 'unknown'].map((code) => ({ code, count: 0 })),
        changedClaimsCount: 0, isDebt: false, message: CLAIM_MESSAGE }, activeCases: [], upcomingHearings: [] },
    bankruptcy: { asDebtor: { casesCount: 0, organizationsCount: 0, activeCasesCount: 0, caseRefs: [] },
      asCreditor: { casesCount: 0, organizationsCount: 0, activeCasesCount: 0, caseRefs: [] } },
    patterns: { repeatedCases: [], recurringCreditors: [], recurringDefendants: [], repeatedClaimSeries: [],
      repeatedAmounts: [], internalGroupCases: [], duplicateOrganizationNames: [], sharedCourtAddresses: [] },
    enforcement: { summary: { totalCount: 0, activeCount: 0, closedCount: 0, activeMonetaryCount: 0,
      activeNonMonetaryCount: 0, activeZeroOrUnknownAmountCount: 0, activeAmount: 0, closedAmount: 0 }, creditorMatches: [] },
    insolvency: { organizationsWithRecords: 0, activeRecords: 0, finishedRecords: 0, unknownRecords: 0, organizations: [] },
    accountRestrictions: { organizationsCount: 0, restrictionsCount: 0, banksCount: 0, decisionsCount: 0,
      organizationsWithNegativeEns: 0, negativeEnsTotal: 0, errorsCount: 0, organizations: [] },
    outcomeSignals: { satisfied: 0, denied: 0, courtOrderIssued: 0, terminated: 0, settlement: 0,
      leftWithoutConsideration: 0, appeal: 0, cassation: 0, unknown: 0 },
    priorityOrganizations: [],
  };
}

function participantGroups(records, participantRole, outputNames) {
  const groups = new Map();
  for (const record of records) {
    for (const participant of array(record.proceeding.participants).filter((item) => item.role === participantRole)) {
      const inn = digits(participant.inn);
      const nameKey = text(participant.name);
      const key = inn ? `inn:${inn}` : nameKey ? `name:${nameKey}` : null;
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { inn: inn || null, name: participant.name || null, cases: new Map(), organizations: new Set() });
      const group = groups.get(key);
      group.cases.set(record.key, record);
      group.organizations.add(record.organization.inn);
      if (!group.name && participant.name) group.name = participant.name;
    }
  }
  return Array.from(groups.values()).filter((group) => group.cases.size >= 2).map((group) => {
    const caseRecords = Array.from(group.cases.values());
    return { [outputNames.inn]: group.inn, [outputNames.name]: group.name, caseCount: caseRecords.length,
      organizationCount: group.organizations.size, organizationInns: Array.from(group.organizations).sort(),
      caseRefs: caseRecords.map(caseRef), latestClaimsTotal: caseRecords.reduce((sum, item) => sum + (number(item.proceeding.latestClaimSum) || 0), 0),
      creditorType: group.inn ? 'inn' : 'name', classificationReason: group.inn ? 'exact_inn' : 'normalized_name',
      isCrossOrganization: group.organizations.size >= 2 };
  }).sort((a, b) => String(a[outputNames.inn] || a[outputNames.name]).localeCompare(String(b[outputNames.inn] || b[outputNames.name])));
}

function outcomeSignals(records) {
  const result = emptyAnalysis().outcomeSignals;
  const patterns = { satisfied: /удовлетвор|взыск/i, denied: /отказ/i, courtOrderIssued: /судебн.*приказ/i,
    terminated: /прекращ/i, settlement: /миров.*соглаш/i, leftWithoutConsideration: /без рассмотрения/i,
    appeal: /апелляц/i, cassation: /кассац/i };
  for (const cases of groupRecords(records).values()) {
    const signals = new Set();
    for (const record of cases) for (const instance of array(record.proceeding.instances)) for (const document of array(instance.documents)) {
      const source = `${document.documentTypeText || ''} ${Array.isArray(document.contentTypes) ? document.contentTypes.join(' ') : document.contentTypes || ''}`;
      for (const [code, pattern] of Object.entries(patterns)) if (pattern.test(source)) signals.add(code);
    }
    if (!signals.size) result.unknown += 1;
    else signals.forEach((signal) => { result[signal] += 1; });
  }
  return result;
}

function groupRecords(records) {
  const groups = new Map();
  for (const record of records) { if (!groups.has(record.key)) groups.set(record.key, []); groups.get(record.key).push(record); }
  return groups;
}

function buildCommercialActivityApiCloudAnalysis(organizations = []) {
  const result = emptyAnalysis();
  const source = array(organizations);
  result.coverage.organizationsCount = source.length;
  const orgMap = new Map(source.map((organization) => [digits(organization.inn), organization]).filter(([inn]) => inn));
  const records = source.flatMap((organization) => array(organization.arbitrationProceedings)
    .map((proceeding) => ({ organization, proceeding, key: caseKey(proceeding) })));
  const groupedCases = groupRecords(records);
  result.coverage.caseOccurrencesCount = records.length;
  result.coverage.uniqueCasesCount = groupedCases.size;

  for (const record of records) {
    const { proceeding, organization } = record;
    const status = proceeding.caseInfoStatus === 'skipped_limit' ? 'skippedLimit' : proceeding.caseInfoStatus || 'skipped';
    if (Object.hasOwn(result.coverage.caseInfo, status)) result.coverage.caseInfo[status] += 1;
    const amount = number(proceeding.latestClaimSum);
    const known = amount !== null && amount > 0;
    result.coverage.claimAmounts[known ? 'known' : 'unknown'] += 1;
    if (proceeding.role === 'respondent') result.coverage.claimAmounts[known ? 'respondentKnown' : 'respondentUnknown'] += 1;
    if (proceeding.role === 'plaintiff') result.coverage.claimAmounts[known ? 'plaintiffKnown' : 'plaintiffUnknown'] += 1;
    if (proceeding.caseInfoStatus === 'error') {
      const error = array(organization.arbitrationDiagnostics?.caseInfo?.errors)
        .find((item) => (item.caseId && item.caseId === proceeding.caseId) || item.caseNumber === proceeding.number) || {};
      result.coverage.sourceErrors.kadCaseInfoCases.push({ caseId: proceeding.caseId || null, caseNumber: proceeding.number || null,
        organizationInn: organization.inn || null, status: 'error', error: error.error || null, message: error.message || null });
    }
  }
  result.coverage.sourceErrors.fsspOrganizations = source.filter((item) => item.fsspDiagnostics?.status === 'error').length;
  result.coverage.sourceErrors.efrsbOrganizations = source.filter((item) => item.efrsbDiagnostics?.status === 'error').length;
  result.coverage.sourceErrors.stopOperRsOrganizations = source.filter((item) => item.stopOperRsDiagnostics?.status === 'error').length;

  result.organizationOverview.activeCount = source.filter((item) => item.status === 'Active' || item.isActive === true).length;
  result.organizationOverview.bankruptcyProcessCount = source.filter((item) => item.status === 'Bankrupting').length;
  result.organizationOverview.exclusionProcessCount = source.filter((item) => /исключ|предстоящ/i.test(item.statusText || '')).length;
  result.organizationOverview.byRelationshipRole = countBy(source.flatMap((item) => array(item.roles)));
  result.organizationOverview.byMainActivity = countBy(source.map((item) => item.activityCode || 'unknown'));
  const nameGroups = new Map(); const dateGroups = new Map();
  for (const organization of source) {
    const name = text(organization.fullName || organization.name); const date = organization.registrationDate;
    if (name) { if (!nameGroups.has(name)) nameGroups.set(name, []); nameGroups.get(name).push(organization); }
    if (date) { if (!dateGroups.has(date)) dateGroups.set(date, []); dateGroups.get(date).push(organization); }
  }
  result.organizationOverview.duplicateNames = Array.from(nameGroups).filter(([, items]) => unique(items.map((item) => item.inn)).length > 1)
    .map(([normalizedName, items]) => ({ normalizedName, organizationCount: items.length,
      organizations: items.map((item) => ({ inn: item.inn || null, name: item.name || item.fullName || null, status: item.status || null })) }));
  result.organizationOverview.duplicateRegistrationDates = Array.from(dateGroups).filter(([, items]) => items.length > 1)
    .map(([registrationDate, items]) => ({ registrationDate, organizationCount: items.length,
      organizations: items.map((item) => ({ inn: item.inn || null, name: item.name || item.fullName || null })) }));
  result.patterns.duplicateOrganizationNames = result.organizationOverview.duplicateNames;

  const roles = records.map((item) => item.proceeding.role || 'unknown');
  const categories = records.map((item) => item.proceeding.proceedingCategory || 'other');
  result.litigation.byRole = countBy(roles); result.litigation.byCategory = countBy(categories);
  for (const code of ['respondent', 'plaintiff', 'mixed']) result.litigation.summary[code] = roles.filter((value) => value === code).length;
  for (const code of ['civil', 'administrative', 'bankruptcy', 'other']) result.litigation.summary[code] = categories.filter((value) => value === code).length;
  result.litigation.summary.finished = records.filter((item) => item.proceeding.isFinished === true).length;
  result.litigation.summary.active = records.filter((item) => item.proceeding.isFinished === false).length;
  result.litigation.summary.unknownState = records.filter((item) => typeof item.proceeding.isFinished !== 'boolean').length;
  const years = records.map((item) => String(item.proceeding.proceedingStartDate || '').match(/(?:^|\D)(20\d{2})(?:\D|$)/)?.[1]).filter(Boolean);
  result.litigation.byYear = Object.entries(countBy(years)).map(([year, count]) => ({ year: Number(year), count })).sort((a, b) => a.year - b.year);

  const ranges = result.litigation.declaredClaims.ranges;
  for (const record of records) {
    const amount = number(record.proceeding.latestClaimSum);
    const side = record.proceeding.role === 'respondent' ? 'respondent' : record.proceeding.role === 'plaintiff' ? 'plaintiff' : null;
    if (side) { result.litigation.declaredClaims[side][amount > 0 ? 'casesWithAmount' : 'casesWithoutAmount'] += 1;
      if (amount > 0) result.litigation.declaredClaims[side].latestClaimsTotal += amount; }
    const code = !(amount > 0) ? 'unknown' : amount <= 100000 ? 'up_to_100k' : amount <= 1000000 ? '100k_to_1m' : amount <= 10000000 ? '1m_to_10m' : 'over_10m';
    ranges.find((range) => range.code === code).count += 1;
    if (amount > 0 && number(record.proceeding.maxClaimSum) !== amount) result.litigation.declaredClaims.changedClaimsCount += 1;
    if (record.proceeding.isFinished === false) {
      const active = { caseId: record.proceeding.caseId || null, caseNumber: record.proceeding.number || null,
        organizationInn: record.organization.inn || null, organizationName: record.organization.name || record.organization.fullName || null,
        role: record.proceeding.role || null, category: record.proceeding.proceedingCategory || null,
        caseState: record.proceeding.caseState || null, latestClaimSum: amount, maxClaimSum: number(record.proceeding.maxClaimSum),
        nextHearing: record.proceeding.nextHearing || null };
      result.litigation.activeCases.push(active);
      if (active.nextHearing) result.litigation.upcomingHearings.push({ ...caseRef(record), ...parseHearing(active.nextHearing) });
    }
  }

  for (const [side, role] of [['asDebtor', 'respondent'], ['asCreditor', 'plaintiff']]) {
    const matches = records.filter((item) => item.proceeding.proceedingCategory === 'bankruptcy' && item.proceeding.role === role);
    result.bankruptcy[side] = { casesCount: matches.length, organizationsCount: unique(matches.map((item) => item.organization.inn)).length,
      activeCasesCount: matches.filter((item) => item.proceeding.isFinished === false).length, caseRefs: matches.map(caseRef) };
  }

  result.patterns.repeatedCases = Array.from(groupedCases.values()).filter((items) => unique(items.map((item) => item.organization.inn)).length >= 2)
    .map((items) => ({ caseId: items[0].proceeding.caseId || null, caseNumber: items[0].proceeding.number || null,
      organizationCount: unique(items.map((item) => item.organization.inn)).length,
      organizations: items.map((item) => ({ inn: item.organization.inn || null, name: item.organization.name || null, role: item.proceeding.role || null })) }));
  result.patterns.recurringCreditors = participantGroups(records.filter((item) => item.proceeding.role === 'respondent'), 'plaintiff', { inn: 'creditorInn', name: 'creditorName' });
  result.patterns.recurringDefendants = participantGroups(records.filter((item) => item.proceeding.role === 'plaintiff'), 'respondent', { inn: 'defendantInn', name: 'defendantName' });

  const amountGroups = new Map(); const seriesGroups = new Map();
  for (const record of records.filter((item) => number(item.proceeding.latestClaimSum) > 0)) {
    const cents = kopecks(record.proceeding.latestClaimSum);
    if (!amountGroups.has(cents)) amountGroups.set(cents, new Map()); amountGroups.get(cents).set(record.key, record);
    if (record.proceeding.role !== 'respondent') continue;
    for (const participant of array(record.proceeding.participants).filter((item) => item.role === 'plaintiff')) {
      const inn = digits(participant.inn); const normalizedName = text(participant.name); const participantKey = inn ? `inn:${inn}` : `name:${normalizedName}`;
      const key = `${participantKey}|${cents}`;
      if (!seriesGroups.has(key)) seriesGroups.set(key, { inn: inn || null, name: participant.name || null, cents, cases: new Map(), organizations: new Set() });
      seriesGroups.get(key).cases.set(record.key, record); seriesGroups.get(key).organizations.add(record.organization.inn);
    }
  }
  result.patterns.repeatedAmounts = Array.from(amountGroups).filter(([, cases]) => cases.size >= 2)
    .map(([cents, cases]) => ({ amount: cents / 100, caseCount: cases.size, caseRefs: Array.from(cases.values()).map(caseRef) }));
  result.patterns.repeatedClaimSeries = Array.from(seriesGroups.values()).filter((group) => group.cases.size >= 2).map((group) => ({
    creditorInn: group.inn, creditorName: group.name, amount: group.cents / 100, caseCount: group.cases.size,
    organizationCount: group.organizations.size, organizationInns: Array.from(group.organizations).sort(),
    caseRefs: Array.from(group.cases.values()).map(caseRef), isCrossOrganization: group.organizations.size >= 2 }));

  for (const items of groupedCases.values()) {
    const parties = new Map();
    for (const item of items) for (const participant of array(item.proceeding.participants)) {
      const inn = digits(participant.inn); if (!orgMap.has(inn)) continue;
      parties.set(`${inn}:${participant.role}`, { organizationInn: inn,
        organizationName: orgMap.get(inn).name || orgMap.get(inn).fullName || participant.name || null, role: participant.role || null });
    }
    const values = Array.from(parties.values());
    if (unique(values.map((item) => item.organizationInn)).length >= 2 && values.some((item) => item.role === 'plaintiff') && values.some((item) => item.role === 'respondent'))
      result.patterns.internalGroupCases.push({ caseId: items[0].proceeding.caseId || null, caseNumber: items[0].proceeding.number || null, parties: values });
  }
  const addresses = new Map();
  for (const record of records) for (const participant of array(record.proceeding.participants)) {
    const inn = digits(participant.inn); const address = text(participant.address);
    if (!address || !orgMap.has(inn)) continue;
    if (!addresses.has(address)) addresses.set(address, { display: participant.address, organizations: new Map() });
    addresses.get(address).organizations.set(inn, { inn, name: orgMap.get(inn).name || orgMap.get(inn).fullName || participant.name || null });
  }
  result.patterns.sharedCourtAddresses = Array.from(addresses.values()).filter((group) => group.organizations.size >= 2)
    .map((group) => ({ address: group.display, organizationCount: group.organizations.size,
      organizations: Array.from(group.organizations.values()), source: 'kad_participants', mayBeHistorical: true }));

  const enforcementByCreditor = new Map();
  for (const organization of source) for (const proceeding of array(organization.enforcementProceedings)) {
    const closed = Boolean(proceeding.stopInfo); const amount = number(proceeding.amount) || 0;
    const nonMonetary = /неимуществен/i.test(`${proceeding.subject || ''} ${proceeding.processTotal || ''}`);
    result.enforcement.summary.totalCount += 1;
    if (closed) { result.enforcement.summary.closedCount += 1; result.enforcement.summary.closedAmount += amount; }
    else { result.enforcement.summary.activeCount += 1; result.enforcement.summary.activeAmount += amount;
      if (amount > 0) result.enforcement.summary.activeMonetaryCount += 1;
      if (nonMonetary) result.enforcement.summary.activeNonMonetaryCount += 1;
      if (!(amount > 0) && !nonMonetary) result.enforcement.summary.activeZeroOrUnknownAmountCount += 1; }
    const creditorInn = digits(proceeding.documentDetails?.claimerInn);
    if (creditorInn) { const key = `${organization.inn}|${creditorInn}`;
      if (!enforcementByCreditor.has(key)) enforcementByCreditor.set(key, { organization, creditorInn, active: [], closed: [] });
      enforcementByCreditor.get(key)[closed ? 'closed' : 'active'].push(proceeding); }
  }
  for (const group of enforcementByCreditor.values()) {
    const kad = records.filter((item) => item.organization.inn === group.organization.inn &&
      array(item.proceeding.participants).some((party) => party.role === 'plaintiff' && digits(party.inn) === group.creditorInn));
    if (!kad.length) continue;
    const creditor = array(kad[0].proceeding.participants).find((party) => party.role === 'plaintiff' && digits(party.inn) === group.creditorInn);
    result.enforcement.creditorMatches.push({ organizationInn: group.organization.inn, organizationName: group.organization.name || null,
      creditorInn: group.creditorInn, creditorName: creditor?.name || null, kadCasesCount: unique(kad.map((item) => item.key)).length,
      kadCaseRefs: kad.map(caseRef), activeEnforcementCount: group.active.length,
      activeEnforcementAmount: group.active.reduce((sum, item) => sum + (number(item.amount) || 0), 0),
      closedEnforcementCount: group.closed.length, closedEnforcementAmount: group.closed.reduce((sum, item) => sum + (number(item.amount) || 0), 0) });
  }

  result.insolvency.organizations = source.filter((item) => item.bankruptcyRecordsCount > 0).map((item) => ({ organizationInn: item.inn,
    organizationName: item.name, recordsCount: item.bankruptcyRecordsCount, activeRecords: item.activeBankruptcyCount,
    finishedRecords: item.finishedBankruptcyCount, unknownRecords: item.unknownBankruptcyCount }));
  result.insolvency.organizationsWithRecords = result.insolvency.organizations.length;
  result.insolvency.activeRecords = source.reduce((sum, item) => sum + (item.activeBankruptcyCount || 0), 0);
  result.insolvency.finishedRecords = source.reduce((sum, item) => sum + (item.finishedBankruptcyCount || 0), 0);
  result.insolvency.unknownRecords = source.reduce((sum, item) => sum + (item.unknownBankruptcyCount || 0), 0);
  result.accountRestrictions.organizations = source.filter((item) => item.accountRestrictionsCount > 0 || number(item.negativeEnsBalance) > 0)
    .map((item) => ({ organizationInn: item.inn, organizationName: item.name, restrictionsCount: item.accountRestrictionsCount || 0,
      banksCount: item.accountRestrictionBanksCount || 0, decisionsCount: item.accountRestrictionDecisionsCount || 0,
      negativeEns: number(item.negativeEnsBalance) || 0 }));
  result.accountRestrictions.organizationsCount = source.filter((item) => item.accountRestrictionsCount > 0).length;
  result.accountRestrictions.restrictionsCount = source.reduce((sum, item) => sum + (item.accountRestrictionsCount || 0), 0);
  result.accountRestrictions.banksCount = source.reduce((sum, item) => sum + (item.accountRestrictionBanksCount || 0), 0);
  result.accountRestrictions.decisionsCount = source.reduce((sum, item) => sum + (item.accountRestrictionDecisionsCount || 0), 0);
  result.accountRestrictions.organizationsWithNegativeEns = source.filter((item) => number(item.negativeEnsBalance) > 0).length;
  result.accountRestrictions.negativeEnsTotal = source.reduce((sum, item) => sum + Math.max(0, number(item.negativeEnsBalance) || 0), 0);
  result.accountRestrictions.errorsCount = result.coverage.sourceErrors.stopOperRsOrganizations;
  result.outcomeSignals = outcomeSignals(records);

  for (const organization of source) {
    const own = records.filter((item) => item.organization === organization); const signals = [];
    const add = (code, count, amount = null) => { if (count) signals.push({ code, count, amount }); };
    add('egrul_bankruptcy', organization.status === 'Bankrupting' ? 1 : 0);
    add('egrul_exclusion', /исключ|предстоящ/i.test(organization.statusText || '') ? 1 : 0);
    add('active_efrsb', organization.activeBankruptcyCount || 0);
    const activeFssp = array(organization.enforcementProceedings).filter((item) => !item.stopInfo);
    add('active_fssp_monetary', activeFssp.filter((item) => number(item.amount) > 0).length, activeFssp.reduce((sum, item) => sum + (number(item.amount) || 0), 0));
    add('active_fssp_non_monetary', activeFssp.filter((item) => /неимуществен/i.test(`${item.subject || ''} ${item.processTotal || ''}`)).length);
    add('account_restrictions', organization.accountRestrictionsCount || 0);
    add('negative_ens', number(organization.negativeEnsBalance) > 0 ? 1 : 0, Math.max(0, number(organization.negativeEnsBalance) || 0));
    const debtorBankruptcy = own.filter((item) => item.proceeding.proceedingCategory === 'bankruptcy' && item.proceeding.role === 'respondent');
    add('open_bankruptcy_as_debtor', debtorBankruptcy.filter((item) => item.proceeding.isFinished === false).length);
    add('bankruptcy_history_as_debtor', debtorBankruptcy.length);
    add('open_respondent_cases', own.filter((item) => item.proceeding.role === 'respondent' && item.proceeding.isFinished === false).length);
    add('recurring_creditor_pressure', result.patterns.recurringCreditors.filter((group) => group.organizationInns.includes(organization.inn)).length);
    if (signals.length) result.priorityOrganizations.push({ organizationInn: organization.inn || null,
      organizationName: organization.name || organization.fullName || null, status: organization.status || null, signals });
  }
  result.priorityOrganizations.sort((a, b) => String(a.organizationInn).localeCompare(String(b.organizationInn)));
  return result;
}

module.exports = buildCommercialActivityApiCloudAnalysis;

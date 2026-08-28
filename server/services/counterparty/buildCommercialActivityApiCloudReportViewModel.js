const array = (value) => (Array.isArray(value) ? value : []);
const number = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const caseNumberKey = (value) => String(value || '').replace(/\s+/g, '').toUpperCase().replace(/A/g, 'А');
const caseKey = (item = {}) => item.caseId ? `id:${String(item.caseId).trim()}` : `number:${caseNumberKey(item.caseNumber || item.number)}`;
const caseStatus = (item = {}) => item.isFinished === false ? 'active' : item.isFinished === true ? 'finished' : 'unknown';
const organizationName = (item = {}) => item.organizationName || item.name || item.shortName || item.fullName || null;
const roleText = (role) => ({ respondent: 'Ответчик', plaintiff: 'Истец', mixed: 'Истец и ответчик' })[role] || 'Роль не определена';
const relationshipText = (roles) => {
  const values = array(roles).map((item) => String(item).toLowerCase());
  const director = values.some((item) => /director|руковод/.test(item));
  const founder = values.some((item) => /founder|учред/.test(item));
  return director && founder ? 'руководитель и учредитель' : director ? 'руководитель' : founder ? 'учредитель' : null;
};
const statusText = (item) => item.statusText || ({ Active: 'действующая', Bankrupting: 'в процессе банкротства' })[item.status] || (item.isActive === false ? 'недействующая' : null);
const addMoney = (left, right) => (Math.round((left || 0) * 100) + Math.round((right || 0) * 100)) / 100;
const dateValue = (value) => {
  const match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const parsed = match ? Date.parse(`${match[3]}-${match[2]}-${match[1]}`) : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function buildCaseIndex(items) {
  const index = new Map();
  for (const organization of items) for (const proceeding of array(organization.arbitrationProceedings)) {
    const key = caseKey(proceeding);
    if (key.endsWith(':')) continue;
    const existing = index.get(key);
    if (!existing || existing.isFinished === undefined) index.set(key, { ...proceeding,
      caseNumber: proceeding.caseNumber || proceeding.number || null,
      organizationInn: organization.inn || null,
      organizationName: organizationName(organization),
      url: proceeding.url || (proceeding.caseId ? `https://kad.arbitr.ru/Card/${proceeding.caseId}` : null) });
  }
  return index;
}

function caseRefs(group) {
  if (Array.isArray(group.caseRefs)) return group.caseRefs;
  if (group.caseId || group.caseNumber) return [group];
  return array(group.cases);
}

function classifyGroup(group, caseIndex, organizationsByInn) {
  const unique = new Map();
  for (const ref of caseRefs(group)) {
    const key = caseKey(ref);
    if (key.endsWith(':') || unique.has(key)) continue;
    const proceeding = caseIndex.get(key) || {};
    const organizationInn = ref.organizationInn || proceeding.organizationInn || null;
    unique.set(key, { ...proceeding, ...ref, caseNumber: ref.caseNumber || proceeding.caseNumber || proceeding.number || null,
      url: ref.url || proceeding.url || ((ref.caseId || proceeding.caseId) ? `https://kad.arbitr.ru/Card/${ref.caseId || proceeding.caseId}` : null),
      organizationInn, organizationName: ref.organizationName || proceeding.organizationName || organizationsByInn.get(organizationInn)?.name || null,
      role: ref.role || proceeding.role || null, roleText: roleText(ref.role || proceeding.role), proceedingStartDate: ref.proceedingStartDate || proceeding.proceedingStartDate || null,
      latestClaimSum: number(ref.latestClaimSum ?? proceeding.latestClaimSum), isFinished: ref.isFinished ?? proceeding.isFinished });
  }
  const cases = [...unique.values()];
  const buckets = { active: [], finished: [], unknown: [] };
  for (const item of cases) buckets[caseStatus(item)].push(item);
  const knownCounts = Object.fromEntries(Object.entries(buckets).map(([key, rows]) => [key, rows.filter((item) => item.latestClaimSum !== null).length]));
  const totals = Object.fromEntries(Object.entries(buckets).map(([key, rows]) => [key, knownCounts[key]
    ? rows.reduce((sum, item) => addMoney(sum, item.latestClaimSum), 0) : null]));
  const sorted = (rows, limit) => rows.slice().sort((a, b) => (dateValue(b.proceedingStartDate) || 0) - (dateValue(a.proceedingStartDate) || 0)).slice(0, limit);
  const dates = cases.map((item) => ({ text: item.proceedingStartDate, value: dateValue(item.proceedingStartDate) })).filter((item) => item.value).sort((a, b) => a.value - b.value);
  const organizationMap = new Map(cases.filter((item) => item.organizationInn || item.organizationName).map((item) => [item.organizationInn || item.organizationName,
    { organizationInn: item.organizationInn, organizationName: item.organizationName }]));
  return { cases, buckets, totals, activeCount: buckets.active.length, finishedCount: buckets.finished.length,
    unknownCount: buckets.unknown.length, activeExamples: sorted(buckets.active, 5), finishedExamples: sorted(buckets.finished, 3), unknownExamples: sorted(buckets.unknown, 3),
    remainingFinishedCount: Math.max(0, buckets.finished.length - 3), remainingUnknownCount: Math.max(0, buckets.unknown.length - 3),
    activeUnknownAmountCount: buckets.active.length - knownCounts.active, finishedUnknownAmountCount: buckets.finished.length - knownCounts.finished,
    unknownUnknownAmountCount: buckets.unknown.length - knownCounts.unknown,
    totalAmount: Object.values(totals).filter((item) => item !== null).reduce(addMoney, 0), totalKnownAmountCount: Object.values(knownCounts).reduce((sum, item) => sum + item, 0),
    periodStart: dates[0]?.text || null, periodEnd: dates.at(-1)?.text || null, organizations: [...organizationMap.values()], organizationCount: organizationMap.size,
    noActiveText: buckets.active.length ? null : buckets.unknown.length ? 'Активных дел не выявлено' : 'Только завершённые дела' };
}

function patternRows(groups, caseIndex, organizationsByInn, mapper) {
  const all = array(groups).map((group) => ({ ...mapper(group), ...classifyGroup(group, caseIndex, organizationsByInn) }))
    .sort((a, b) => Number(b.activeCount > 0) - Number(a.activeCount > 0)
      || Number(b.unknownCount > 0) - Number(a.unknownCount > 0)
      || b.activeCount - a.activeCount || (b.totals.active || 0) - (a.totals.active || 0)
      || b.cases.length - a.cases.length || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  return { rows: all.slice(0, 10), total: all.length, truncated: all.length > 10 };
}

function summarizePatterns(label, groups, caseIndex, organizationsByInn) {
  const unique = new Map();
  for (const group of array(groups)) for (const item of classifyGroup(group, caseIndex, organizationsByInn).cases) unique.set(caseKey(item), item);
  const buckets = { active: [], finished: [], unknown: [] };
  for (const item of unique.values()) buckets[caseStatus(item)].push(item);
  const amount = (rows) => {
    const known = rows.filter((item) => item.latestClaimSum !== null);
    return known.length ? known.reduce((sum, item) => addMoney(sum, item.latestClaimSum), 0) : null;
  };
  return { label, groupsCount: array(groups).length,
    activeCount: buckets.active.length, finishedCount: buckets.finished.length, unknownCount: buckets.unknown.length,
    activeAmount: amount(buckets.active), finishedAmount: amount(buckets.finished), unknownAmount: amount(buckets.unknown) };
}

function buildCommercialActivityApiCloudReportViewModel(source) {
  if (!source) return { visible: false };
  const items = array(source.items); const analysis = source.analysis || {}; const litigation = analysis.litigation || {};
  const enforcement = analysis.enforcement || {}; const restrictions = analysis.accountRestrictions || {}; const patterns = analysis.patterns || {};
  const coverage = analysis.coverage || {}; const caseInfo = coverage.caseInfo || {}; const caseIndex = buildCaseIndex(items);
  const organizationsByInn = new Map(items.filter((item) => item.inn).map((item) => [item.inn, item]));
  const activeMap = new Map();
  for (const item of array(litigation.activeCases)) {
    const key = caseKey(item); if (key.endsWith(':')) continue;
    const proceeding = caseIndex.get(key) || {}; const current = activeMap.get(key) || { ...proceeding, ...item, organizations: [] };
    if (!current.organizations.some((org) => org.organizationInn === item.organizationInn)) current.organizations.push({ organizationName: item.organizationName || null, organizationInn: item.organizationInn || null });
    current.caseNumber = item.caseNumber || proceeding.caseNumber || proceeding.number || null;
    current.url = proceeding.url || (item.caseId ? `https://kad.arbitr.ru/Card/${item.caseId}` : null);
    current.proceedingStartDate = proceeding.proceedingStartDate || null; current.category = proceeding.proceedingCategoryText || item.category || null;
    current.caseState = item.caseState || proceeding.caseState || proceeding.instanceName || null; current.latestClaimSum = number(item.latestClaimSum);
    current.roleText = roleText(item.role); activeMap.set(key, current);
  }
  const activeCases = [...activeMap.values()];
  const summaryRows = [
    ['Найдено связанных организаций', coverage.organizationsCount], ['Действующих организаций', analysis.organizationOverview?.activeCount],
    ['Недействующих организаций', source.summary?.inactiveCount], ['Организаций с недостоверными сведениями', items.filter((item) => item.isDataReliable === false).length],
    ['Активных судебных дел', litigation.summary?.active], ['В том числе с участием связанного лица в качестве ответчика', litigation.declaredClaims?.exposure?.active?.casesCount],
    ['В том числе с участием связанного лица только в качестве истца', activeCases.filter((item) => item.role === 'plaintiff').length],
    ['Заявленные требования по активным делам связанных лиц', litigation.declaredClaims?.exposure?.active?.latestClaimsTotal, true],
    ['Активных исполнительных производств', enforcement.summary?.activeCount], ['Сумма по активным исполнительным производствам', enforcement.summary?.activeAmount, true],
    ['Организаций с ограничениями по счетам', restrictions.organizationsCount], ['Действующих решений о приостановлении операций', restrictions.decisionsCount],
    ['Организаций с отрицательным ЕНС', restrictions.organizationsWithNegativeEns], ['Общая сумма отрицательного сальдо ЕНС', restrictions.negativeEnsTotal, true],
    ['Активных банкротных дел связанных лиц как должников', analysis.bankruptcy?.asDebtor?.activeCasesCount], ['Действующих записей ЕФРСБ', analysis.insolvency?.activeRecords],
  ].map(([label, rowValue, money]) => ({ label, value: rowValue ?? null, money: Boolean(money), missing: rowValue === undefined || rowValue === null }));
  const matchMap = new Map(array(enforcement.creditorMatches).map((item) => [`${item.organizationInn}|${item.creditorInn}`, item]));
  const kadCreditorsByInn = new Map();
  for (const proceeding of caseIndex.values()) for (const participant of array(proceeding.participants)) {
    const inn = String(participant.inn || '').replace(/\D/g, '');
    if (inn && participant.role === 'plaintiff' && participant.name) kadCreditorsByInn.set(inn, participant.name);
  }
  const activeEnforcementProceedings = items.flatMap((organization) => array(organization.enforcementProceedings).filter((item) => !item.stopInfo).map((item) => {
    const amount = number(item.amount); const nonMonetary = /неимуществен/i.test(`${item.subject || ''} ${item.processTotal || ''}`);
    const creditorInn = String(item.documentDetails?.claimerInn || '').replace(/\D/g, ''); const match = matchMap.get(`${organization.inn}|${creditorInn}`);
    const creditorName = item.documentDetails?.claimerName || item.documentDetails?.creditorName || match?.creditorName || kadCreditorsByInn.get(creditorInn) || null;
    const details = item.documentDetails || {}; const hasStructuredDocument = Boolean(details.docType || details.docDate || details.documentNumber || details.organization);
    const matchedCases = match ? classifyGroup({ caseRefs: match.kadCaseRefs }, caseIndex, organizationsByInn) : null;
    const kadCases = matchedCases ? [...matchedCases.activeExamples, ...matchedCases.finishedExamples, ...matchedCases.unknownExamples] : [];
    return { organizationName: organizationName(organization), organizationInn: organization.inn || null,
      processNumber: item.processNumber || item.number || item.proceedingNumber || null, processDate: item.processDate || null, processTotal: item.processTotal || null,
      documentType: details.docType || null, documentDate: details.docDate || null, documentNumber: details.documentNumber || null,
      documentOrganization: details.organization || null, documentText: hasStructuredDocument ? null : item.documentText || null,
      missingProcessAndDocumentNumber: !(item.processNumber || item.number || item.proceedingNumber || details.documentNumber),
      kind: amount > 0 ? 'Денежное' : nonMonetary ? 'Неденежное' : 'Сумма не определена', amount: amount > 0 ? amount : null,
      amountText: nonMonetary ? 'Не применяется' : 'Сумма не определена', creditorName, creditorInn: creditorInn || null,
      creditorDisplayName: creditorName || (creditorInn ? 'Наименование не определено' : null), kadMatch: Boolean(match), kadCases,
      kadCasesCount: matchedCases?.cases.length || match?.kadCasesCount || 0,
      remainingKadCasesCount: Math.max(0, (matchedCases?.cases.length || match?.kadCasesCount || 0) - kadCases.length) };
  }));
  const accountRestrictionRows = array(restrictions.organizations).map((item) => ({ ...item, negativeEns: number(item.negativeEns) }));
  const bankruptcyRows = items.flatMap((organization) => array(organization.bankruptcyRecords).filter((item) => item.isFinished === false || item.isActive === true)
    .map((record) => ({ organizationName: organizationName(organization), organizationInn: organization.inn || null, source: 'ЕФРСБ', kind: record.type || record.messageType || 'Запись ЕФРСБ', currentFact: 'Действующая запись', reference: record.number || record.id || 'Нет данных' })));
  const recurring = patternRows(patterns.recurringCreditors, caseIndex, organizationsByInn, (item) => ({ name: item.creditorName, creditorName: item.creditorName || null, creditorInn: item.creditorInn || null, identityText: item.creditorIdentityType === 'inn' ? 'По точному ИНН' : item.creditorIdentityType === 'normalized_name' ? 'По нормализованному наименованию' : 'Нет данных' }));
  const respondents = patternRows(patterns.recurringDefendants, caseIndex, organizationsByInn, (item) => ({ name: item.defendantName, defendantName: item.defendantName || null, defendantInn: item.defendantInn || null }));
  const repeated = patternRows(patterns.repeatedAmounts, caseIndex, organizationsByInn, (item) => ({ name: String(item.amount ?? ''), amount: number(item.amount), caseCount: item.caseCount || 0 }));
  const series = patternRows(patterns.repeatedClaimSeries, caseIndex, organizationsByInn, (item) => ({ name: item.creditorName, creditorName: item.creditorName || null, creditorInn: item.creditorInn || null, amount: number(item.amount), caseCount: item.caseCount || 0, organizationCount: item.organizationCount || 0 }));
  const judicialPatternRows = [
    summarizePatterns('Повторяющиеся кредиторы', patterns.recurringCreditors, caseIndex, organizationsByInn), summarizePatterns('Повторяющиеся ответчики', patterns.recurringDefendants, caseIndex, organizationsByInn),
    summarizePatterns('Одинаковые суммы требований', patterns.repeatedAmounts, caseIndex, organizationsByInn), summarizePatterns('Серии «кредитор + сумма»', patterns.repeatedClaimSeries, caseIndex, organizationsByInn),
    summarizePatterns('Повторяющиеся дела', patterns.repeatedCases, caseIndex, organizationsByInn), summarizePatterns('Дела между связанными организациями', patterns.internalGroupCases, caseIndex, organizationsByInn),
  ];
  const organizationalMatchRows = [{ label: 'Общие судебные адреса', value: array(patterns.sharedCourtAddresses).length },
    { label: 'Одинаковые наименования организаций', value: array(patterns.duplicateOrganizationNames).length }];
  const duplicateNameRows = array(patterns.duplicateOrganizationNames).slice(0, 10).map((item) => ({ normalizedName: item.normalizedName || null, organizationCount: item.organizationCount || 0, organizationInns: array(item.organizations).map((org) => org.inn).filter(Boolean) }));
  const coverageRows = [['Всего найдено уникальных дел', coverage.uniqueCasesCount], ['Отобрано для загрузки подробных сведений: дела ответчиков, дела со смешанной ролью и дела о банкротстве', caseInfo.eligibleCasesCount], ['Фактически запрошено подробных сведений', caseInfo.requestedCasesCount], ['Подробные сведения загружены', caseInfo.loadedCasesCount], ['Ошибка загрузки подробных сведений', caseInfo.failedCasesCount], ['Не загружено подробных сведений по делам, в которых связанные компании выступают только истцами', caseInfo.notSelectedCasesCount], ['Не загружено из-за лимита', caseInfo.skippedByLimitCasesCount]].map(([label, value]) => ({ label, value: value ?? null }));
  const priorityOrganizations = items.map((organization) => {
    const ownCases = activeCases.filter((item) => item.organizations.some((org) => org.organizationInn === organization.inn));
    const respondentCases = ownCases.filter((item) => ['respondent', 'mixed'].includes(item.role)).map((item, index) => ({ ...item, displayIndex: index + 1 }));
    const plaintiffCases = ownCases.filter((item) => item.role === 'plaintiff').map((item, index) => ({ ...item, displayIndex: index + 1 }));
    const fssp = activeEnforcementProceedings.filter((item) => item.organizationInn === organization.inn); const restriction = accountRestrictionRows.find((item) => item.organizationInn === organization.inn);
    const activeEfrsbCount = bankruptcyRows.filter((item) => item.organizationInn === organization.inn).length;
    const currentStatus = organization.status === 'Bankrupting' || /исключ|предстоя/i.test(organization.statusText || '');
    return { organizationName: organizationName(organization), organizationInn: organization.inn || null, relationshipText: relationshipText(organization.roles), statusText: statusText(organization), reliabilityText: organization.isDataReliable === false ? 'имеются недостоверные сведения' : organization.isDataReliable === true ? 'недостоверные сведения не выявлены' : null,
      respondentCases, plaintiffCases, respondentCasesCount: respondentCases.length, plaintiffCasesCount: plaintiffCases.length,
      respondentClaimsTotal: respondentCases.reduce((sum, item) => addMoney(sum, number(item.latestClaimSum)), 0), monetaryEnforcementCount: fssp.filter((item) => item.kind === 'Денежное').length,
      nonMonetaryEnforcementCount: fssp.filter((item) => item.kind === 'Неденежное').length, unknownEnforcementCount: fssp.filter((item) => item.kind === 'Сумма не определена').length,
      enforcementAmount: fssp.reduce((sum, item) => addMoney(sum, item.amount), 0), restrictionsCount: restriction?.decisionsCount || 0, banksCount: restriction?.banksCount || 0,
      negativeEns: restriction?.negativeEns || 0, activeEfrsbCount, current: respondentCases.length || plaintiffCases.length || fssp.length || restriction || activeEfrsbCount || currentStatus,
      sort: [activeEfrsbCount || organization.status === 'Bankrupting', Boolean(restriction), fssp.length > 0, respondentCases.length > 0] };
  }).filter((item) => item.current).sort((a, b) => { for (let index = 0; index < 4; index += 1) if (a.sort[index] !== b.sort[index]) return Number(b.sort[index]) - Number(a.sort[index]); return String(a.organizationName).localeCompare(String(b.organizationName), 'ru'); });
  return { visible: true, status: source.status || 'error', provider: source.provider || 'apicloud', full: source.status === 'ok',
    message: source.status === 'empty' ? 'Связанные организации не найдены' : source.status === 'error' ? 'Не удалось получить сведения о связанных организациях' : source.status === 'skipped' ? (source.message || 'Источник не запрашивался') : null,
    summaryRows, priorityOrganizations, activeCases, activeEnforcementProceedings, accountRestrictionRows, bankruptcyRows, judicialPatternRows,
    recurringCreditorRows: recurring.rows, recurringCreditorMeta: recurring, recurringRespondentRows: respondents.rows, recurringRespondentMeta: respondents,
    repeatedAmountRows: repeated.rows, repeatedAmountMeta: repeated, repeatedClaimSeriesRows: series.rows, repeatedClaimSeriesMeta: series,
    organizationalMatchRows, duplicateNameRows, coverageRows };
}

const arbitrationActivityLabels = [
  ['totalCases', 'Всего уникальных арбитражных дел'],
  ['innMatchedCases', 'Надёжных совпадений по ИНН'],
  ['plaintiffCases', 'Проверяемый выступает истцом'],
  ['respondentCases', 'Проверяемый выступает ответчиком'],
  ['mixedRoleCases', 'Истец и ответчик одновременно'],
  ['bankruptcyCases', 'Банкротных дел'],
  ['civilCases', 'Гражданских дел'],
  ['administrativeCases', 'Административных дел'],
  ['casesWithDocuments', 'Дел с найденными судебными актами'],
  ['totalDocuments', 'Всего судебных актов'],
  ['decisionDocuments', 'Решений'],
  ['rulingDocuments', 'Определений'],
];

const countForm = (value, one, few, many) => {
  const count = Number(value) || 0;
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const word = remainder100 >= 11 && remainder100 <= 14 ? many : remainder10 === 1 ? one : remainder10 >= 2 && remainder10 <= 4 ? few : many;
  return `${count} ${word}`;
};

function buildCheckedPersonArbitrationActivity(arbitrationSource, fnsSource) {
  if (!arbitrationSource) return { state: 'absent', message: 'Сведения об арбитражной активности отсутствуют.' };
  if (arbitrationSource.status === 'skipped') return { state: 'skipped', message: 'Источник арбитражных данных не запускался в рамках этой проверки.' };
  if (arbitrationSource.status === 'error') return { state: 'error', message: 'Не удалось получить сведения об арбитражной активности.' };
  if (!arbitrationSource.summary || !['ok', 'empty'].includes(arbitrationSource.status)) return { state: 'absent', message: 'Сведения об арбитражной активности отсутствуют.' };

  const summary = arbitrationSource.summary;
  const rows = arbitrationActivityLabels.map(([field, label]) => ({ field, label, value: summary[field] }));
  if (rows.some((row) => !Number.isFinite(Number(row.value)))) return { state: 'absent', message: 'Сведения об арбитражной активности отсутствуют.' };

  let ipText = 'Сведения о регистрации проверяемого в качестве индивидуального предпринимателя отсутствуют.';
  if (fnsSource?.status === 'ok' || fnsSource?.status === 'empty') {
    if (fnsSource.summary?.hasActiveIp) ipText = 'Проверяемый зарегистрирован в качестве действующего индивидуального предпринимателя.';
    else if (fnsSource.summary?.hasClosedIp) ipText = 'Найдены сведения о прекращённой деятельности проверяемого в качестве индивидуального предпринимателя.';
    else ipText = 'Сведения о регистрации проверяемого в качестве индивидуального предпринимателя не найдены.';
  }

  const totalCases = Number(summary.totalCases);
  const narrative = totalCases
    ? `${ipText} Найдено ${countForm(summary.innMatchedCases, 'арбитражное дело', 'арбитражных дела', 'арбитражных дел')} с подтверждённым совпадением по ИНН: в ${countForm(summary.plaintiffCases, 'деле', 'делах', 'делах')} проверяемый выступает истцом, в ${countForm(summary.respondentCases, 'деле', 'делах', 'делах')} — ответчиком${Number(summary.mixedRoleCases) ? `, в ${countForm(summary.mixedRoleCases, 'деле', 'делах', 'делах')} — одновременно истцом и ответчиком` : ''}. ${Number(summary.bankruptcyCases) ? `Найдено ${countForm(summary.bankruptcyCases, 'банкротное дело', 'банкротных дела', 'банкротных дел')}.` : 'Банкротных дел не выявлено.'}`
    : `${ipText} Арбитражные дела не найдены.`;

  return { state: totalCases ? 'found' : 'empty', dataReceived: true, rows, narrative };
}

module.exports = buildCommercialActivityApiCloudReportViewModel;
module.exports.buildCheckedPersonArbitrationActivity = buildCheckedPersonArbitrationActivity;

const PRIVACY_FULL = 'full';
const PRIVACY_MASKED = 'masked';

const SOURCE_KEYS = new Set([
  'mvdPassport',
  'mvdWanted',
  'fssp',
  'fns',
  'stopOperRS',
  'rosfin',
  'inoagent',
  'efrsb',
  'arbitrationApiCloudCombined',
  'passportKontur',
  'snilsKontur',
  'fsspKontur',
  'courtsCommon',
  'arbitrationKontur',
  'commercialActivityKontur',
  'wantedKontur',
  'bankruptcyKontur',
  'rosfinKontur',
]);

const URL_LIKE_KEYS = new Set([
  'href',
  'url',
  'link',
  'cardUrl',
  'documentUrl',
  'imageUrl',
  'kadUrl',
  'rasUrl',
  'actUrl',
  'tableUrl',
  'sourceUrl',
  'caseUrl',
  'decisionUrl',
]);

const ALWAYS_MASK_KEYS = new Set([
  'fullName',
  'fio',
  'lastName',
  'firstName',
  'middleName',
  'surname',
  'birthDate',
  'dateOfBirth',
  'birthday',
  'series',
  'passportSeries',
  'number',
  'passportNumber',
  'issueDate',
  'dateIssue',
  'issuedAt',
  'issuerCode',
  'divisionCode',
  'subdivisionCode',
  'departmentCode',
  'inn',
  'personInn',
  'physicalInn',
  'individualInn',
  'snils',
  'ogrnip',
]);

const NEVER_MASK_KEYS = new Set([
  'caseNumber',
  'claimNumber',
  'proceedingNumber',
  'ipNumber',
  'fsspNumber',
  'documentNumber',
  'bik',
  'bankName',
  'companyName',
  'organizationName',
  'oppositeParty',
  'companyInn',
  'organizationInn',
  'companyOgrn',
  'organizationOgrn',
  'ogrn',
  'courtName',
  'courtRegion',
  'article',
  'status',
  'statusText',
  'amount',
  'sum',
  'result',
]);

// Real keys observed in payload builders/templates. Keep these lists explicit so new
// provider fields are reviewed before masking broad generic fields such as `name`,
// `number` or `inn`.
const PAYLOAD_KEY_ALLOWLIST = {
  passport: ['series', 'number', 'issueDate', 'issuerCode', 'divisionCode', 'subdivisionCode', 'departmentCode'],
  person: ['fullName', 'fio', 'lastName', 'firstName', 'middleName', 'surname', 'birthDate', 'dateOfBirth', 'birthday'],
  personalIds: ['inn', 'personInn', 'physicalInn', 'individualInn', 'snils', 'ogrnip'],
};

const SOURCE_POLICIES = {
  mvdPassport: { structural: 'passport', text: 'tokens' },
  passportKontur: { structural: 'passport', text: 'tokens' },
  mvdWanted: { structural: 'wanted', text: 'tokens' },
  wantedKontur: { structural: 'wanted', text: 'tokens' },
  snilsKontur: { structural: 'person', text: 'tokens' },
  fns: { structural: 'alwaysIp', text: 'tokens' },
  commercialActivityKontur: { structural: 'targetOnly', text: 'tokens' },
  arbitrationApiCloudCombined: { structural: 'targetOnly', text: 'tokens' },
  arbitrationKontur: { structural: 'targetOnly', text: 'tokens' },
  bankruptcyKontur: { structural: 'targetOnly', text: 'tokens' },
  efrsb: { structural: 'targetOnly', text: 'tokens' },
  rosfin: { structural: 'targetOnly', text: 'tokens' },
  rosfinKontur: { structural: 'targetOnly', text: 'tokens' },
  inoagent: { structural: 'targetOnly', text: 'tokens' },
  stopOperRS: { structural: 'none', text: 'tokens' },
  fssp: { structural: 'none', text: 'none' },
  fsspKontur: { structural: 'none', text: 'none' },
  courtsCommon: { structural: 'none', text: 'none' },
};

function resolvePrivacyMode(raw) {
  return raw === PRIVACY_MASKED ? PRIVACY_MASKED : PRIVACY_FULL;
}

function maskFioToInitials(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const [lastName, firstName, middleName] = parts;
  const firstInitial = firstName ? `${firstName[0]}.` : '';
  const middleInitial = middleName ? `${middleName[0]}.` : '';
  return [lastName, firstInitial, middleInitial].filter(Boolean).join(' ');
}

function maskBirthDate(dateValue) {
  const value = String(dateValue || '').trim();
  if (!value) return '';

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}.${iso[2]}.****`;

  const ru = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) return `${ru[1]}.${ru[2]}.****`;

  return value;
}

function maskPassportSeries(series) {
  const raw = String(series || '');
  const value = raw.replace(/\D/g, '');
  if (!value) return '';
  if (raw.includes('*')) return raw;
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(value.length - 2, 2))}`;
}

function maskPassportNumber(number) {
  const raw = String(number || '');
  const value = raw.replace(/\D/g, '');
  if (!value) return '';
  if (raw.includes('*')) return raw;
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(value.length - 2, 4))}`;
}

function maskPassportIssueDate(value) {
  if (value === undefined || value === null || value === '') return '';
  if (String(value).includes('*')) return String(value);
  return '**.**.****';
}

function maskPassportDivisionCode(value) {
  if (value === undefined || value === null || value === '') return '';
  if (String(value).includes('*')) return String(value);
  return '***-***';
}

function maskPersonalInn(inn) {
  const raw = String(inn || '');
  const value = raw.replace(/\D/g, '');
  if (!value) return '';
  if (raw.includes('*')) return raw;
  if (value.length < 8) return raw;
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(value.length - 8, 4))}${value.slice(-4)}`;
}

function maskSnils(snils) {
  const value = String(snils || '').trim();
  if (!value) return '';
  if (value.includes('*')) return value;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 3) return value;
  return `${digits.slice(0, 3)}-***-*** **`;
}

function maskOgrnip(ogrnip) {
  const raw = String(ogrnip || '');
  const value = raw.replace(/\D/g, '');
  if (!value) return '';
  if (raw.includes('*')) return raw;
  if (value.length < 8) return raw;
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(value.length - 8, 4))}${value.slice(-4)}`;
}

function maskNamePart(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[А-ЯA-ZЁ]\.$/.test(raw)) return raw;
  return raw[0] ? `${raw[0]}.` : raw;
}

function createTokenStore() {
  return {
    fio: new Map(),
    dob: new Map(),
    inn: new Map(),
    snils: new Map(),
    ogrnip: new Map(),
    passportSeries: new Map(),
    passportNumber: new Map(),
    passportCombined: new Map(),
    passportIssueDate: new Map(),
    passportDivisionCode: new Map(),
  };
}

function addToken(tokens, bucket, raw, masked) {
  const key = String(raw || '').trim();
  const value = String(masked || '').trim();
  if (!key || !value || key === value || key.includes('*')) return;
  tokens[bucket].set(key.toLocaleLowerCase('ru-RU'), { raw: key, masked: value });
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

function toDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildTargetProfile(subject = {}) {
  const passport = subject.passport || {};
  return {
    fullName: normalizeText(subject.fullName),
    inn: toDigits(subject.inn),
    snils: toDigits(subject.snils),
    ogrnip: toDigits(subject.ogrnip),
    birthDate: normalizeText(maskBirthDate(subject.birthDate)).replace('****', ''),
    passportSeries: toDigits(passport.series ?? subject.passportSeries),
    passportNumber: toDigits(passport.number ?? subject.passportNumber),
  };
}

function collectFromSubject(subject = {}, tokens) {
  addToken(tokens, 'fio', subject.fullName, maskFioToInitials(subject.fullName));
  addToken(tokens, 'dob', subject.birthDate, maskBirthDate(subject.birthDate));
  addToken(tokens, 'inn', subject.inn, maskPersonalInn(subject.inn));
  addToken(tokens, 'snils', subject.snils, maskSnils(subject.snils));
  addToken(tokens, 'ogrnip', subject.ogrnip, maskOgrnip(subject.ogrnip));

  const passport = subject.passport || {};
  addPassportTokens(tokens, passport);
}

function addPassportTokens(tokens, passport = {}) {
  const series = passport.series ?? passport.passportSeries;
  const number = passport.number ?? passport.passportNumber;
  const issueDate = passport.issueDate ?? passport.dateIssue ?? passport.issuedAt;
  const divisionCode = passport.divisionCode ?? passport.issuerCode ?? passport.subdivisionCode ?? passport.departmentCode;

  addToken(tokens, 'passportSeries', series, maskPassportSeries(series));
  addToken(tokens, 'passportNumber', number, maskPassportNumber(number));
  addToken(tokens, 'passportIssueDate', issueDate, maskPassportIssueDate(issueDate));
  addToken(tokens, 'passportDivisionCode', divisionCode, maskPassportDivisionCode(divisionCode));

  const s = String(series || '').trim();
  const n = String(number || '').trim();
  if (s && n) {
    addToken(tokens, 'passportCombined', `${s} ${n}`, `${maskPassportSeries(s)} ${maskPassportNumber(n)}`);
    addToken(tokens, 'passportCombined', `${s}${n}`, `${maskPassportSeries(s)} ${maskPassportNumber(n)}`);
  }
}

function collectFromKnownSourcePaths(sources = {}, tokens, target = {}) {
  if (!sources || typeof sources !== 'object') return;

  const visited = new WeakSet();
  const walk = (node, sourceKey = null, path = []) => {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, sourceKey, [...path, index]));
      return;
    }

    const source = SOURCE_KEYS.has(path[path.length - 1]) ? path[path.length - 1] : sourceKey;
    const policy = SOURCE_POLICIES[source];
    if (policy && shouldCollectPersonalObject(policy.structural, node, target)) {
      collectPersonalObject(node, tokens);
    }

    for (const [key, value] of Object.entries(node)) {
      walk(value, SOURCE_KEYS.has(key) ? key : source, [...path, key]);
    }
  };

  walk(sources, null, ['sources']);
}

function shouldCollectPersonalObject(policyName, parent, target) {
  if (policyName === 'passport' || policyName === 'wanted' || policyName === 'person' || policyName === 'alwaysIp') return true;
  if (policyName === 'targetOnly') return isTargetRecord({ parent, target });
  return false;
}

function collectPersonalObject(parent, tokens) {
  const fio = parent.fullName ?? parent.fio ?? parent.name;
  const lastName = parent.lastName ?? parent.lastname ?? parent.surname;
  const firstName = parent.firstName ?? parent.firstname;
  const middleName = parent.middleName ?? parent.middlename ?? parent.patronymic;
  const fullName = fio || [lastName, firstName, middleName].filter(Boolean).join(' ');

  addToken(tokens, 'fio', fullName, maskFioToInitials(fullName));
  addToken(tokens, 'dob', parent.birthDate ?? parent.dateOfBirth ?? parent.birthday, maskBirthDate(parent.birthDate ?? parent.dateOfBirth ?? parent.birthday));
  addToken(tokens, 'inn', parent.inn ?? parent.personInn ?? parent.physicalInn, maskPersonalInn(parent.inn ?? parent.personInn ?? parent.physicalInn));
  addToken(tokens, 'snils', parent.snils, maskSnils(parent.snils));
  addToken(tokens, 'ogrnip', parent.ogrnip, maskOgrnip(parent.ogrnip));
  addPassportTokens(tokens, parent.passport || parent);
}

function collectSensitiveTokens(reportData) {
  const tokens = createTokenStore();
  const target = buildTargetProfile(reportData?.subject || {});
  collectFromSubject(reportData?.subject, tokens);
  collectFromKnownSourcePaths(reportData?.sources, tokens, target);
  return tokens;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceSensitiveTokensInString(value, tokens) {
  let result = String(value || '');
  if (!result) return result;

  const allTokens = [
    ...tokens.passportCombined.values(),
    ...tokens.fio.values(),
    ...tokens.dob.values(),
    ...tokens.inn.values(),
    ...tokens.snils.values(),
    ...tokens.ogrnip.values(),
    ...tokens.passportIssueDate.values(),
    ...tokens.passportDivisionCode.values(),
    ...tokens.passportSeries.values(),
    ...tokens.passportNumber.values(),
  ].sort((a, b) => b.raw.length - a.raw.length);

  for (const { raw, masked } of allTokens) {
    result = result.replace(new RegExp(escapeRegExp(raw), 'giu'), masked);
  }

  return result;
}

function normalizeKey(key) {
  return String(key || '').trim();
}

function keyLower(key) {
  return normalizeKey(key).toLowerCase();
}

function detectSourceKey(path = [], node) {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const part = path[i];
    if (SOURCE_KEYS.has(part)) return part;
  }

  const key = node && typeof node === 'object' ? node.sourceKey || node.key : null;
  return SOURCE_KEYS.has(key) ? key : null;
}

function isPassportSeriesKey(key, path = []) {
  const lower = keyLower(key);
  return lower === 'series' || lower === 'passportseries' || (lower.includes('series') && path.map(String).join('.').toLowerCase().includes('passport'));
}

function isPassportNumberKey(key, path = []) {
  const lower = keyLower(key);
  return lower === 'passportnumber' || (lower === 'number' && path.map(String).join('.').toLowerCase().includes('passport')) || (lower.includes('number') && path.map(String).join('.').toLowerCase().includes('passport'));
}

function isPassportIssueDateKey(key) {
  const lower = keyLower(key);
  return ['issuedate', 'dateissue', 'issuedat'].includes(lower) || (lower.includes('issue') && lower.includes('date'));
}

function isPassportDivisionCodeKey(key) {
  const lower = keyLower(key);
  return ['issuercode', 'divisioncode', 'subdivisioncode', 'departmentcode', 'kodpodrazdeleniya'].includes(lower) || (lower.includes('division') && lower.includes('code'));
}

function isPersonFullNameKey(key) {
  const lower = keyLower(key);
  return ['fullname', 'fio'].includes(lower) || lower.includes('personname');
}

function isBirthDateKey(key) {
  const lower = keyLower(key);
  return ['birthdate', 'dateofbirth', 'birthday'].includes(lower) || (lower.includes('birth') && lower.includes('date'));
}

function isSnilsKey(key) {
  return keyLower(key).includes('snils');
}

function isOgrnipKey(key) {
  return keyLower(key).includes('ogrnip');
}

function isInnKey(key) {
  const lower = keyLower(key);
  return ['inn', 'personinn', 'physicalinn', 'individualinn'].includes(lower);
}

function isLastNameKey(key) {
  return ['lastname', 'surname'].includes(keyLower(key));
}

function isFirstNameKey(key) {
  return keyLower(key) === 'firstname';
}

function isMiddleNameKey(key) {
  return ['middlename', 'patronymic'].includes(keyLower(key));
}

function getRecordFullName(parent = {}) {
  const direct = parent.fullName ?? parent.fio ?? parent.name;
  if (direct) return normalizeText(direct);
  return normalizeText([
    parent.lastName ?? parent.lastname ?? parent.surname,
    parent.firstName ?? parent.firstname,
    parent.middleName ?? parent.middlename ?? parent.patronymic,
  ].filter(Boolean).join(' '));
}

function isTargetRecord({ parent = {}, target = {} }) {
  if (!parent || typeof parent !== 'object') return false;
  if (parent.isSelf === true || parent.isSubject === true || parent.subjectMatch === true || parent.targetPerson === true) return true;

  const parentInn = toDigits(parent.inn ?? parent.personInn ?? parent.physicalInn ?? parent.individualInn);
  if (target.inn && parentInn && parentInn === target.inn) return true;

  const parentSnils = toDigits(parent.snils);
  if (target.snils && parentSnils && parentSnils === target.snils) return true;

  const parentOgrnip = toDigits(parent.ogrnip);
  if (target.ogrnip && parentOgrnip && parentOgrnip === target.ogrnip) return true;

  const fullName = getRecordFullName(parent);
  if (target.fullName && fullName && fullName === target.fullName) return true;

  return false;
}

function detectRuleByKey(key, path) {
  if (isPassportSeriesKey(key, path)) return 'passportSeries';
  if (isPassportNumberKey(key, path)) return 'passportNumber';
  if (isPassportIssueDateKey(key, path)) return 'passportIssueDate';
  if (isPassportDivisionCodeKey(key, path)) return 'passportDivisionCode';
  if (isPersonFullNameKey(key, path)) return 'fio';
  if (isLastNameKey(key)) return 'lastName';
  if (isFirstNameKey(key)) return 'firstName';
  if (isMiddleNameKey(key)) return 'middleName';
  if (isBirthDateKey(key, path)) return 'birthDate';
  if (isInnKey(key, path)) return 'inn';
  if (isSnilsKey(key, path)) return 'snils';
  if (isOgrnipKey(key, path)) return 'ogrnip';
  return null;
}

function getFieldRule({ sourceKey, key, path, parent, target }) {
  if (NEVER_MASK_KEYS.has(key) || URL_LIKE_KEYS.has(key)) return null;
  const policy = SOURCE_POLICIES[sourceKey];
  if (!policy || policy.structural === 'none') return null;

  if (policy.structural === 'passport') {
    return detectRuleByKey(key, path);
  }

  if (policy.structural === 'wanted') {
    if (isLastNameKey(key)) return 'lastName';
    if (isFirstNameKey(key)) return 'firstName';
    if (isMiddleNameKey(key)) return 'middleName';
    if (isPersonFullNameKey(key, path)) return 'fio';
    if (isBirthDateKey(key, path)) return 'birthDate';
    if (isInnKey(key, path)) return 'inn';
    if (isSnilsKey(key, path)) return 'snils';
    return null;
  }

  if (policy.structural === 'person') {
    return detectRuleByKey(key, path);
  }

  if (policy.structural === 'alwaysIp') {
    if (isPersonFullNameKey(key, path)) return 'fio';
    if (isLastNameKey(key)) return 'lastName';
    if (isFirstNameKey(key)) return 'firstName';
    if (isMiddleNameKey(key)) return 'middleName';
    if (isInnKey(key, path)) return 'inn';
    if (isOgrnipKey(key, path)) return 'ogrnip';
    if (isBirthDateKey(key, path)) return 'birthDate';
    return null;
  }

  if (policy.structural === 'targetOnly' && isTargetRecord({ parent, target })) {
    return detectRuleByKey(key, path);
  }

  return null;
}

function applyMaskRule(rule, value, ctx) {
  if (value == null) return value;

  if (Array.isArray(value)) return value.map((item, index) => applyMaskRule(rule, item, { ...ctx, path: [...ctx.path, index] }));
  if (typeof value === 'object') return sanitizeNode(value, ctx);

  switch (rule) {
    case 'fio':
      return maskFioToInitials(value);
    case 'lastName':
      return value;
    case 'firstName':
    case 'middleName':
      return maskNamePart(value);
    case 'birthDate':
      return maskBirthDate(value);
    case 'passportSeries':
      return maskPassportSeries(value);
    case 'passportNumber':
      return maskPassportNumber(value);
    case 'passportIssueDate':
      return maskPassportIssueDate(value);
    case 'passportDivisionCode':
      return maskPassportDivisionCode(value);
    case 'inn':
      return maskPersonalInn(value);
    case 'snils':
      return maskSnils(value);
    case 'ogrnip':
      return maskOgrnip(value);
    default:
      return value;
  }
}

function shouldSkipStringReplacement(ctx = {}) {
  const key = ctx.path[ctx.path.length - 1];
  if (URL_LIKE_KEYS.has(key) || NEVER_MASK_KEYS.has(key)) return true;
  const policy = SOURCE_POLICIES[ctx.sourceKey];
  return policy?.text === 'none';
}

function sanitizeNode(node, ctx) {
  if (node == null) return node;

  if (typeof node === 'string') {
    return shouldSkipStringReplacement(ctx) ? node : replaceSensitiveTokensInString(node, ctx.tokens);
  }

  if (typeof node !== 'object') return node;

  if (ctx.visited.has(node)) return ctx.visited.get(node);

  if (Array.isArray(node)) {
    const arr = [];
    ctx.visited.set(node, arr);
    node.forEach((item, index) => {
      arr[index] = sanitizeNode(item, { ...ctx, path: [...ctx.path, index] });
    });
    return arr;
  }

  const out = {};
  ctx.visited.set(node, out);

  const effectiveSourceKey = detectSourceKey(ctx.path, node) || ctx.sourceKey;

  for (const [key, value] of Object.entries(node)) {
    const fieldCtx = { ...ctx, sourceKey: effectiveSourceKey, path: [...ctx.path, key] };
    const rule = getFieldRule({ sourceKey: effectiveSourceKey, key, path: fieldCtx.path, parent: node, value, target: ctx.target });
    out[key] = rule ? applyMaskRule(rule, value, fieldCtx) : sanitizeNode(value, fieldCtx);
  }

  return out;
}

function sanitizeCounterpartyReport(reportData, options = {}) {
  const target = buildTargetProfile(reportData?.subject || {});
  const tokens = collectSensitiveTokens(reportData || {});
  const visited = new WeakMap();
  return sanitizeNode(reportData, {
    path: [],
    sourceKey: null,
    tokens,
    target,
    isPdf: !!options.isPdf,
    visited,
  });
}

module.exports = {
  PRIVACY_FULL,
  PRIVACY_MASKED,
  SOURCE_POLICIES,
  PAYLOAD_KEY_ALLOWLIST,
  ALWAYS_MASK_KEYS,
  NEVER_MASK_KEYS,
  resolvePrivacyMode,
  sanitizeCounterpartyReport,
  collectSensitiveTokens,
  replaceSensitiveTokensInString,
  maskFioToInitials,
  maskBirthDate,
  maskPassportSeries,
  maskPassportNumber,
  maskPassportIssueDate,
  maskPassportDivisionCode,
  maskPersonalInn,
  maskSnils,
  maskOgrnip,
};
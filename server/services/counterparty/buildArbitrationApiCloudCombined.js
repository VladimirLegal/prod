function normalizeText(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function toDigits(value = '') {
  return String(value || '').replace(/\D+/g, '');
}

function toSortableTime(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return 0;

  const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) {
    return Date.UTC(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]));
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildEmptySummary() {
  return {
    totalCases: 0,
    innMatchedCases: 0,
    fioOnlyMatchedCases: 0,

    plaintiffCases: 0,
    respondentCases: 0,
    mixedRoleCases: 0,
    unknownRoleCases: 0,

    bankruptcyCases: 0,
    civilCases: 0,
    administrativeCases: 0,
    otherCases: 0,

    casesWithDocuments: 0,
    totalDocuments: 0,
    decisionDocuments: 0,
    rulingDocuments: 0,
    appealDocuments: 0,
    otherDocuments: 0,

    hasBankruptcyCase: false,
    hasAnyCases: false,
    hasAnyDocuments: false,
  };
}

function buildEmptyGroups() {
  return {
    innMatch: {
      plaintiff: [],
      respondent: [],
      mixed: [],
      unknownRole: [],
    },
    fioOnly: {
      plaintiff: [],
      respondent: [],
      mixed: [],
      unknownRole: [],
    },
  };
}

function detectParticipantMatch(person, participant = {}) {
  const personInn = toDigits(person?.inn || '');
  const participantInn = toDigits(participant?.inn || '');

  const personName = normalizeText(person?.fullName || '');
  const participantName = normalizeText(participant?.name || '');

  const innMatched = !!personInn && !!participantInn && personInn === participantInn;
  const fioMatched = !!personName && !!participantName && personName === participantName;

  let matchGroup = null;
  let matchText = null;

  if (innMatched && fioMatched) {
    matchGroup = 'innMatch';
    matchText = 'Совпадение по ФИО и ИНН';
  } else if (innMatched) {
    matchGroup = 'innMatch';
    matchText = 'Совпадение по ИНН';
  } else if (fioMatched) {
    matchGroup = 'fioOnly';
    matchText = 'Совпадение только по ФИО';
  }

  return {
    innMatched,
    fioMatched,
    matchGroup,
    matchText,
    isMatched: !!matchGroup,
  };
}

function detectCaseMatch(person, kadCase = {}) {
  const participants = Array.isArray(kadCase?.participants) ? kadCase.participants : [];

  const matchedParticipants = participants
    .map((participant) => {
      const match = detectParticipantMatch(person, participant);
      return {
        participant,
        ...match,
      };
    })
    .filter((item) => item.isMatched);

  if (!matchedParticipants.length) {
    return {
      matchGroup: null,
      matchText: null,
      matchFlags: {
        innMatched: false,
        fioMatched: false,
      },
      matchedParticipants: [],
    };
  }

  const hasInnMatch = matchedParticipants.some((item) => item.matchGroup === 'innMatch');
  const hasFioOnly = matchedParticipants.some((item) => item.matchGroup === 'fioOnly');
  const hasFioAndInn = matchedParticipants.some((item) => item.innMatched && item.fioMatched);

  let matchGroup = 'fioOnly';
  let matchText = 'Совпадение только по ФИО';

  if (hasInnMatch) {
    matchGroup = 'innMatch';
    matchText = hasFioAndInn ? 'Совпадение по ФИО и ИНН' : 'Совпадение по ИНН';
  } else if (hasFioOnly) {
    matchGroup = 'fioOnly';
    matchText = 'Совпадение только по ФИО';
  }

  return {
    matchGroup,
    matchText,
    matchFlags: {
      innMatched: hasInnMatch,
      fioMatched: matchedParticipants.some((item) => item.fioMatched),
    },
    matchedParticipants,
  };
}

function detectCaseRole(matchGroup, kadCase = {}) {
  const plaintiffs = Array.isArray(kadCase?.plaintiffs) ? kadCase.plaintiffs : [];
  const respondents = Array.isArray(kadCase?.respondents) ? kadCase.respondents : [];

  const plaintiffMatched = plaintiffs.some((participant) => {
    const match = detectParticipantMatch(
      { inn: '', fullName: '' },
      {}
    );
    return false;
  });

  return null;
}

function isParticipantMatchedByGroup(person, participant = {}, targetGroup = null) {
  const match = detectParticipantMatch(person, participant);
  return match.matchGroup === targetGroup;
}

function resolveRole(person, kadCase = {}, targetGroup = null) {
  const plaintiffs = Array.isArray(kadCase?.plaintiffs) ? kadCase.plaintiffs : [];
  const respondents = Array.isArray(kadCase?.respondents) ? kadCase.respondents : [];

  const inPlaintiffs = plaintiffs.some((participant) =>
    isParticipantMatchedByGroup(person, participant, targetGroup)
  );

  const inRespondents = respondents.some((participant) =>
    isParticipantMatchedByGroup(person, participant, targetGroup)
  );

  if (inPlaintiffs && inRespondents) {
    return { role: 'mixed', roleText: 'Истец и ответчик' };
  }

  if (inPlaintiffs) {
    return { role: 'plaintiff', roleText: 'Истец' };
  }

  if (inRespondents) {
    return { role: 'respondent', roleText: 'Ответчик' };
  }

  return { role: 'unknown', roleText: 'Роль не определена' };
}

function buildDocumentsSummary(documents = []) {
  const decisionDocuments = documents.filter((doc) => doc.documentType === 'decision').length;
  const rulingDocuments = documents.filter((doc) => doc.documentType === 'ruling').length;
  const appealDocuments = documents.filter((doc) => doc.documentType === 'appeal_resolution').length;
  const otherDocuments = documents.filter((doc) => doc.documentType === 'other').length;

  const sortedByDate = [...documents].sort((a, b) => {
    const aTime = toSortableTime(a?.registrationDate || '');
    const bTime = toSortableTime(b?.registrationDate || '');
    return bTime - aTime;
  });

  const lastDocument = sortedByDate[0] || null;

  return {
    totalDocuments: documents.length,
    decisionDocuments,
    rulingDocuments,
    appealDocuments,
    otherDocuments,
    lastDocumentDate: lastDocument?.registrationDate || null,
    lastDocumentTypeText: lastDocument?.documentTypeText || null,
  };
}

function groupRasDocumentsByCase(rasItems = []) {
  const map = new Map();

  for (const doc of rasItems) {
    const caseIdKey = doc?.caseId ? `id:${doc.caseId}` : null;
    const caseNumberKey = doc?.caseNumber ? `num:${doc.caseNumber}` : null;

    if (caseIdKey) {
      if (!map.has(caseIdKey)) map.set(caseIdKey, []);
      map.get(caseIdKey).push(doc);
    }

    if (caseNumberKey) {
      if (!map.has(caseNumberKey)) map.set(caseNumberKey, []);
      map.get(caseNumberKey).push(doc);
    }
  }

  return map;
}

function getCaseDocuments(rasMap, kadCase = {}) {
  const caseIdKey = kadCase?.caseId ? `id:${kadCase.caseId}` : null;
  const caseNumberKey = kadCase?.caseNumber ? `num:${kadCase.caseNumber}` : null;

  const byId = caseIdKey ? rasMap.get(caseIdKey) || [] : [];
  const byNumber = caseNumberKey ? rasMap.get(caseNumberKey) || [] : [];

  const merged = [...byId, ...byNumber];
  const unique = new Map();

  for (const doc of merged) {
    const key = [
      doc?.caseId || '',
      doc?.caseNumber || '',
      doc?.fileUrl || '',
      doc?.registrationDate || '',
      doc?.instanceNumber || '',
      doc?.documentType || '',
    ].join('|');

    if (!unique.has(key)) {
      unique.set(key, doc);
    }
  }

  return Array.from(unique.values()).sort((a, b) => {
    const aTime = toSortableTime(a?.registrationDate || '');
    const bTime = toSortableTime(b?.registrationDate || '');
    return bTime - aTime;
  });
}

function buildStatus(kadSource, cases = []) {
  if (kadSource?.status === 'error') {
    return 'error';
  }

  if (cases.length > 0) {
    return 'ok';
  }

  return 'empty';
}

function buildSummary(cases = []) {
  const summary = buildEmptySummary();

  summary.totalCases = cases.length;
  summary.innMatchedCases = cases.filter((item) => item.matchGroup === 'innMatch').length;
  summary.fioOnlyMatchedCases = cases.filter((item) => item.matchGroup === 'fioOnly').length;

  summary.plaintiffCases = cases.filter((item) => item.role === 'plaintiff').length;
  summary.respondentCases = cases.filter((item) => item.role === 'respondent').length;
  summary.mixedRoleCases = cases.filter((item) => item.role === 'mixed').length;
  summary.unknownRoleCases = cases.filter((item) => item.role === 'unknown').length;

  summary.bankruptcyCases = cases.filter((item) => item.caseType === 'bankruptcy').length;
  summary.civilCases = cases.filter((item) => item.caseType === 'civil').length;
  summary.administrativeCases = cases.filter((item) => item.caseType === 'administrative').length;
  summary.otherCases = cases.filter((item) => item.caseType === 'other').length;

  summary.casesWithDocuments = cases.filter((item) => item.hasDocuments).length;
  summary.totalDocuments = cases.reduce((acc, item) => acc + (item.documentsSummary?.totalDocuments || 0), 0);
  summary.decisionDocuments = cases.reduce((acc, item) => acc + (item.documentsSummary?.decisionDocuments || 0), 0);
  summary.rulingDocuments = cases.reduce((acc, item) => acc + (item.documentsSummary?.rulingDocuments || 0), 0);
  summary.appealDocuments = cases.reduce((acc, item) => acc + (item.documentsSummary?.appealDocuments || 0), 0);
  summary.otherDocuments = cases.reduce((acc, item) => acc + (item.documentsSummary?.otherDocuments || 0), 0);

  summary.hasBankruptcyCase = summary.bankruptcyCases > 0;
  summary.hasAnyCases = summary.totalCases > 0;
  summary.hasAnyDocuments = summary.totalDocuments > 0;

  return summary;
}

function buildGroups(cases = []) {
  const groups = buildEmptyGroups();

  for (const item of cases) {
    const topKey = item.matchGroup === 'innMatch' ? 'innMatch' : item.matchGroup === 'fioOnly' ? 'fioOnly' : null;
    const roleKey =
      item.role === 'plaintiff'
        ? 'plaintiff'
        : item.role === 'respondent'
        ? 'respondent'
        : item.role === 'mixed'
        ? 'mixed'
        : 'unknownRole';

    if (topKey && groups[topKey] && groups[topKey][roleKey]) {
      groups[topKey][roleKey].push(item);
    }
  }

  return groups;
}

function buildArbitrationApiCloudCombined(person = {}, kadSource = {}, rasSource = {}) {
  const kadItems = Array.isArray(kadSource?.items)
    ? kadSource.items.filter((item) => item?.kind === 'kad_case')
    : [];

  const rasItems = Array.isArray(rasSource?.items)
    ? rasSource.items.filter((item) => item?.kind === 'ras_arbitr_document')
    : [];

  const rasMap = groupRasDocumentsByCase(rasItems);

  const combinedCases = kadItems
    .map((kadCase) => {
      const match = detectCaseMatch(person, kadCase);

      if (!match.matchGroup) {
        return null;
      }

      const role = resolveRole(person, kadCase, match.matchGroup);
      const documents = getCaseDocuments(rasMap, kadCase);
      const documentsSummary = buildDocumentsSummary(documents);

      return {
        caseId: kadCase.caseId || null,
        caseNumber: kadCase.caseNumber || null,
        caseDate: kadCase.caseDate || null,
        caseType: kadCase.caseType || 'other',
        caseTypeText: kadCase.caseTypeText || 'Прочее арбитражное дело',
        court: kadCase.court || null,
        judge: kadCase.judge || null,
        url: kadCase.url || null,

        matchGroup: match.matchGroup,
        matchText: match.matchText,
        matchFlags: match.matchFlags,

        role: role.role,
        roleText: role.roleText,

        plaintiffs: Array.isArray(kadCase.plaintiffs) ? kadCase.plaintiffs : [],
        respondents: Array.isArray(kadCase.respondents) ? kadCase.respondents : [],
        participants: Array.isArray(kadCase.participants) ? kadCase.participants : [],

        hasDocuments: documents.length > 0,
        documentsSummary,
        documents,

        rawKad: kadCase.rawRecord || null,
        rawDocuments: documents.map((doc) => doc.rawRecord).filter(Boolean),
      };
    })
    .filter(Boolean);

  const summary = buildSummary(combinedCases);
  const groups = buildGroups(combinedCases);
  const status = buildStatus(kadSource, combinedCases);

  return {
    status,
    provider: 'apicloud',
    summary,
    groups,
    cases: combinedCases,
    raw: {
      kad: kadSource?.raw || null,
      rasArbitr: rasSource?.raw || null,
    },
  };
}

module.exports = buildArbitrationApiCloudCombined;
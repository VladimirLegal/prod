const {
  createSubject,
  createCheck,
  getCheck,
} = require('../providers/konturClient');

function buildValidationMessage(response, fallbackMessage) {
  const parts = [];

  if (response?.message) {
    parts.push(response.message);
  }

  if (Array.isArray(response?.errors) && response.errors.length) {
    for (const err of response.errors) {
      const code = err?.code ? `[${err.code}] ` : '';
      const msg = err?.message || 'Неизвестная ошибка валидации';
      parts.push(`${code}${msg}`);
    }
  }

  return parts.join('; ') || fallbackMessage;
}

function buildKonturMeta(existingKontur, checkKey, subjectId, checkId, checkState) {
  const existingCheckMeta = existingKontur?.checks?.[checkKey] || {};
  const resolvedSubjectId =
    subjectId ||
    existingCheckMeta?.subjectId ||
    existingKontur?.subjectId ||
    null;

  return {
    subjectId: resolvedSubjectId,
    checks: {
      ...(existingKontur?.checks || {}),
      [checkKey]: {
        ...(existingCheckMeta || {}),
        subjectId: resolvedSubjectId,
        checkId: checkId || existingCheckMeta?.checkId || null,
        checkState: checkState || existingCheckMeta?.checkState || null,
      },
    },
  };
}

function logKonturCheck(stage, payload) {
  try {
    console.log('[kontur][wanted]', stage, JSON.stringify(payload, null, 2));
  } catch (e) {
    console.log('[kontur][wanted]', stage, payload);
  }
}

function normalizeKonturCheckState(response) {
  const state =
    response?.checkState ||
    response?.state ||
    'unknown';

  if (state === 'Processed') {
    return { state, phase: 'done' };
  }

  if (state === 'Created' || state === 'Queued' || state === 'Processing') {
    return { state, phase: 'processing' };
  }

  if (state === 'Error' || state === 'Failed') {
    return { state, phase: 'error' };
  }

  return { state, phase: 'unknown' };
}

function translateWantedObject(value) {
  const map = {
    OrganizationProperty: 'Имущество организации',
    DebtorProperty: 'Имущество должника',
    Vehicle: 'Транспортное средство',
    Child: 'Ребёнок',
    Defendant: 'Ответчик',
    Person: 'Физическое лицо',
  };

  return map[value] || value || null;
}

function translateWantedSourceType(value) {
  const map = {
    fsin: 'ФСИН',
    fsspSuspect: 'ФССП — розыск по подозрению',
    fsspEnforce: 'ФССП — исполнительный розыск',
  };

  return map[value] || value || null;
}

function translateWantedMatchType(value) {
  const map = {
    FullMatch: 'Полное совпадение',
    PartialMatch: 'Частичное совпадение',
  };

  return map[value] || value || null;
}

function translateWantedCriterion(value) {
  const map = {
    Fio: 'ФИО',
    BirthDate: 'Дата рождения',
    SurnameAndInitials: 'Фамилия и инициалы',
    Inn: 'ИНН',
    Snils: 'СНИЛС',
    Passport: 'Паспорт',
  };

  return map[value] || value || null;
}

function buildWantedCriterionText(criteria) {
  if (!Array.isArray(criteria) || !criteria.length) return null;
  return criteria.map(translateWantedCriterion).filter(Boolean).join(', ');
}

function extractWantedItems(checkResponse) {
  const wantedBlock = checkResponse?.wanted || {};
  const resultBlock =
    wantedBlock?.result ||
    checkResponse?.result ||
    {};

  const fsin = Array.isArray(resultBlock?.fsin) ? resultBlock.fsin : [];
  const fsspSuspect = Array.isArray(resultBlock?.fsspSuspect) ? resultBlock.fsspSuspect : [];
  const fsspEnforce = Array.isArray(resultBlock?.fsspEnforce) ? resultBlock.fsspEnforce : [];

  const items = [];

  for (const item of fsin) {
    const criterion = Array.isArray(item.criterion) ? item.criterion : [];
    const matchType = item.matchType || null;

    items.push({
      kind: 'wanted_person',
      sourceType: 'fsin',
      sourceTypeText: translateWantedSourceType('fsin'),

      fullName: item.fio || item.fullName || item.name || null,
      shortName: null,

      matchType,
      matchTypeText: translateWantedMatchType(matchType),

      criterion,
      criterionText: buildWantedCriterionText(criterion),

      category: 'ФСИН',

      initiator: item.territorialAuth || null,
      executor: null,

      article: null,

      region: item.birthPlace || null,
      birthPlace: item.birthPlace || null,

      description: item.description || null,
      measure: null,
      measureCode: null,

      wantedNumber: null,
      wantedDate: null,

      proceedingNumber: null,
      proceedingDate: null,

      departmentName: null,
      departmentContacts: null,

      sourceUrl: item.url || null,

      rawRecord: item,
    });
  }

  for (const item of fsspSuspect) {
    const criterion = Array.isArray(item.criterion) ? item.criterion : [];
    const matchType = item.matchType || null;
    const fio = item.fio || item.fullName || item.name || null;

    items.push({
      kind: 'wanted_person',
      sourceType: 'fsspSuspect',
      sourceTypeText: translateWantedSourceType('fsspSuspect'),

      fullName: fio,
      shortName: fio,

      matchType,
      matchTypeText: translateWantedMatchType(matchType),

      criterion,
      criterionText: buildWantedCriterionText(criterion),

      category: 'ФССП / подозрение в преступлении',

      initiator: item.initiator || null,
      executor: item.executor || null,

      article: item.article || null,

      region: item.birthPlace || null,
      birthPlace: item.birthPlace || null,

      description: null,
      measure: null,
      measureCode: null,

      wantedNumber: null,
      wantedDate: null,

      proceedingNumber: null,
      proceedingDate: null,

      departmentName: null,
      departmentContacts: null,

      sourceUrl: null,

      rawRecord: item,
    });
  }

  for (const item of fsspEnforce) {
    const criterion = Array.isArray(item.criterion) ? item.criterion : [];
    const matchType = item.matchType || null;

    items.push({
      kind: 'wanted_person',
      sourceType: 'fsspEnforce',
      sourceTypeText: translateWantedSourceType('fsspEnforce'),

      fullName: item.fio || item.fullName || item.name || null,
      shortName: null,

      matchType,
      matchTypeText: translateWantedMatchType(matchType),

      criterion,
      criterionText: buildWantedCriterionText(criterion),

      category: 'ФССП / исполнительный розыск',

      initiator: item.departmentName || null,
      executor: null,

      article: null,

      region: item.departmentContacts || null,
      birthPlace: null,

      description: null,
      measure: translateWantedObject(item.wantedObject),
      measureCode: item.wantedObject || null,

      wantedNumber: item.wantedNumber || null,
      wantedDate: item.wantedDate || null,

      proceedingNumber: item.proceedingNumber || null,
      proceedingDate: item.proceedingDate || null,

      departmentName: item.departmentName || null,
      departmentContacts: item.departmentContacts || null,

      sourceUrl: null,

      rawRecord: item,
    });
  }

  return items;
}

function buildCachedSourcePayload(source) {
  return {
    status: source?.status || null,
    provider: source?.provider || 'kontur',
    error: source?.error || null,
    message: source?.message || null,
    items: Array.isArray(source?.items) ? source.items : [],
    summary: source?.summary || null,
    raw: source?.raw || null,
  };
}

function attachScenarioCache(metaWrapper, scenarioKey, extra = {}) {
  if (!metaWrapper?._kontur?.checks?.[scenarioKey]) return metaWrapper;

  metaWrapper._kontur.checks[scenarioKey] = {
    ...metaWrapper._kontur.checks[scenarioKey],
    ...extra,
  };

  return metaWrapper;
}

async function wantedKontur(person) {
  const existingKontur = person?._kontur || {};
  const existingSubjectId =
    existingKontur.checks?.wanted?.subjectId ||
    existingKontur.subjectId ||
    null;
  const existingCheckId = existingKontur.checks?.wanted?.checkId || null;
  const existingScenarioMeta = existingKontur.checks?.wanted || {};
  const existingEtag = existingScenarioMeta.etag || null;
  const cachedSource = existingScenarioMeta.cachedSource || null;

  if (existingCheckId) {
    const finalResponse = await getCheck(
      existingCheckId,
      existingEtag ? { etag: existingEtag } : {}
    );
    logKonturCheck('getCheck_existing_response', {
      existingSubjectId,
      existingCheckId,
      response: finalResponse,
    });

    if (finalResponse?.notModified) {
      if (cachedSource && typeof cachedSource === 'object') {
        const restored = {
          ...cachedSource,
          meta: attachScenarioCache(
            {
              _kontur: buildKonturMeta(
                existingKontur,
                'wanted',
                existingSubjectId,
                existingCheckId,
                existingScenarioMeta.checkState || 'Processing'
              ),
            },
            'wanted',
            {
              etag: existingEtag,
              cachedSource,
            }
          ),
        };

        return restored;
      }

      return {
        status: 'processing',
        provider: 'kontur',
        error: 'Проверка на розыск в Контуре ещё выполняется',
        items: [],
        meta: attachScenarioCache(
          {
            _kontur: buildKonturMeta(
              existingKontur,
              'wanted',
              existingSubjectId,
              existingCheckId,
              existingScenarioMeta.checkState || 'Processing'
            ),
          },
          'wanted',
          {
            etag: existingEtag,
            cachedSource: null,
          }
        ),
        raw: {
          step: 'getCheck_existing_not_modified',
          checkId: existingCheckId,
          etag: existingEtag,
        },
      };
    }

    if (finalResponse?.status === 'error') {
      return {
        status: 'error',
        provider: 'kontur',
        error: buildValidationMessage(
          finalResponse,
          'Ошибка при получении результата проверки wanted'
        ),
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'wanted',
            existingSubjectId,
            existingCheckId,
            finalResponse?.checkState || finalResponse?.state || 'Error'
          ),
        },
        raw: {
          step: 'getCheck_existing_error',
          response: finalResponse,
        },
      };
    }

    const { state: currentState, phase } = normalizeKonturCheckState(finalResponse);

    if (phase === 'processing') {
      const result = {
        status: 'processing',
        provider: 'kontur',
        error: 'Проверка на розыск в Контуре ещё выполняется',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'wanted',
            existingSubjectId,
            existingCheckId,
            currentState
          ),
        },
        raw: {
          step: 'getCheck_existing_processing',
          checkId: existingCheckId,
          checkState: currentState,
          checkType: finalResponse?.checkType || null,
          creationDate: finalResponse?.creationDate || null,
          wanted: finalResponse?.wanted || null,
          result: finalResponse?.result || null,
          fullResponse: finalResponse,
        },
      };

      result.meta = attachScenarioCache(result.meta, 'wanted', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    if (phase === 'error') {
      const result = {
        status: 'error',
        provider: 'kontur',
        error:
          finalResponse?.error?.message ||
          finalResponse?.message ||
          'Контур завершил проверку wanted с ошибкой',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'wanted',
            existingSubjectId,
            existingCheckId,
            currentState
          ),
        },
        raw: {
          step: 'getCheck_existing_failed',
          response: finalResponse,
        },
      };

      result.meta = attachScenarioCache(result.meta, 'wanted', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    if (phase !== 'done') {
      const result = {
        status: 'processing',
        provider: 'kontur',
        error: `Проверка wanted вернула нестандартный статус: ${currentState}`,
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'wanted',
            existingSubjectId,
            existingCheckId,
            currentState
          ),
        },
        raw: {
          step: 'getCheck_existing_unknown_state',
          checkId: existingCheckId,
          checkState: currentState,
          fullResponse: finalResponse,
        },
      };

      result.meta = attachScenarioCache(result.meta, 'wanted', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    const items = extractWantedItems(finalResponse);

    const result = {
      status: items.length ? 'ok' : 'empty',
      provider: 'kontur',
      items,
      summary: {
        totalCount: items.length,
        hasMatches: items.length > 0,
      },
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'wanted',
          existingSubjectId,
          existingCheckId,
          currentState
        ),
      },
      raw: {
        step: 'getCheck_existing_done',
        checkId: existingCheckId,
        checkState: currentState,
        checkType: finalResponse?.checkType || null,
        creationDate: finalResponse?.creationDate || null,
        wanted: finalResponse?.wanted || null,
        result: finalResponse?.result || null,
        fullResponse: finalResponse,
      },
    };

    result.meta = attachScenarioCache(result.meta, 'wanted', {
      etag: finalResponse?.etag || existingEtag || null,
      cachedSource: buildCachedSourcePayload(result),
    });

    return result;
  }

  let subjectId = existingSubjectId;

  if (!subjectId) {
    const subjectBody = {
      person: {
        surname: person.lastName,
        name: person.firstName,
        patronymic: person.middleName,
        birthDate: person.birthDate,
      },
    };

    const subjectResponse = await createSubject(subjectBody);
    logKonturCheck('createSubject_response', {
      request: subjectBody,
      response: subjectResponse,
    });

    if (!subjectResponse?.ok || !subjectResponse?.subjectId) {
      return {
        status: 'error',
        provider: 'kontur',
        error: buildValidationMessage(
          subjectResponse,
          'Не удалось создать субъекта в Контур для проверки розыска'
        ),
        items: [],
        raw: {
          step: 'createSubject',
          request: subjectBody,
          response: subjectResponse,
        },
      };
    }

    subjectId = subjectResponse.subjectId;
  }

  const checkBody = {
    wanted: {
      subjectId,
    },
  };

  const checkResponse = await createCheck(checkBody);
  logKonturCheck('createCheck_response', {
    request: checkBody,
    response: checkResponse,
  });

  if (!checkResponse?.ok || !checkResponse?.checkId) {
    const isTimeout = checkResponse?.error === 'timeout_error';

    return {
      status: isTimeout ? 'processing' : 'error',
      provider: 'kontur',
      error: buildValidationMessage(
        checkResponse,
        isTimeout
          ? 'Создание проверки wanted в Контуре заняло слишком много времени, попробуем дочитать позже'
          : 'Не удалось создать проверку wanted в Контур'
      ),
      items: [],
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'wanted',
          subjectId,
          null,
          isTimeout ? 'Processing' : 'Error'
        ),
      },
      raw: {
        step: 'createCheck',
        subjectId,
        request: checkBody,
        response: checkResponse,
      },
    };
  }

  return {
    status: 'processing',
    provider: 'kontur',
    error: 'Проверка розыска в Контуре ещё выполняется',
    items: [],
    meta: {
      _kontur: buildKonturMeta(
        existingKontur,
        'wanted',
        subjectId,
        checkResponse.checkId,
        checkResponse?.checkState || checkResponse?.state || 'Processing'
      ),
    },
    raw: {
      step: 'createCheck_processing',
      subjectId,
      check: checkResponse,
    },
  };
}

module.exports = wantedKontur;
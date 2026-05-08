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
    console.log('[kontur][rosfinmonitoring]', stage, JSON.stringify(payload, null, 2));
  } catch (e) {
    console.log('[kontur][rosfinmonitoring]', stage, payload);
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

function translateRosfinState(value) {
  const map = {
    Active: 'Действующая запись',
    Included: 'Включён',
    Excluded: 'Исключён',
    NotFound: 'Не найден',
  };

  return map[value] || value || null;
}

function translateRosfinFoundBy(value) {
  const map = {
    Fio: 'ФИО',
    FioAndDateBirth: 'ФИО и дата рождения',
  };

  return map[value] || value || null;
}

function getRosfinSeverity(state) {
  if (state === 'Active' || state === 'Included') return 'danger';
  if (state === 'Excluded') return 'warning';
  if (state === 'NotFound') return 'success';
  return 'neutral';
}

function extractRosfinItems(checkResponse, person = {}) {
  const rosfinBlock = checkResponse?.rosfinmonitoring || {};
  const resultBlock =
    rosfinBlock?.result ||
    checkResponse?.result ||
    {};

  const personResult = resultBlock?.person || resultBlock?.personResult || {};
  const terrorist = personResult?.terrorist || {};
  const distributorsWMD = personResult?.distributorsWMD || {};

  const items = [];

  const terroristFoundItems = Array.isArray(terrorist?.foundItems)
    ? terrorist.foundItems
    : [];

  for (const item of terroristFoundItems) {
    const state = item?.terroristState || 'Active';
    const foundBy = item?.foundBy || null;

    items.push({
      kind: 'rosfin_person_record',
      listType: 'terrorist',
      listTypeText: 'Перечень террористов и экстремистов',

      fullName:
        item?.fio ||
        [person?.lastName, person?.firstName, person?.middleName].filter(Boolean).join(' ') ||
        null,
      birthDate: item?.birthDate || person?.birthDate || null,
      birthPlace: item?.birthPlace || null,

      state,
      stateText: translateRosfinState(state),

      foundBy,
      foundByText: translateRosfinFoundBy(foundBy),

      message: 'Найдена запись в перечне террористов и экстремистов',
      severity: getRosfinSeverity(state),
      isPositiveMatch: true,

      rawRecord: item,
    });
  }

  if (distributorsWMD?.found === true) {
    items.push({
      kind: 'rosfin_person_record',
      listType: 'distributorsWMD',
      listTypeText: 'Список распространителей оружия массового уничтожения',

      fullName: [person?.lastName, person?.firstName, person?.middleName].filter(Boolean).join(' ') || null,
      birthDate: person?.birthDate || null,
      birthPlace: null,

      state: 'Included',
      stateText: 'Найден в списке',

      foundBy: 'FioAndDateBirth',
      foundByText: 'ФИО и дата рождения',

      message: 'Найдена запись в списке распространителей оружия массового уничтожения',
      severity: 'danger',
      isPositiveMatch: true,
      rawRecord: distributorsWMD,
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

async function rosfinKontur(person) {
  const existingKontur = person?._kontur || {};
  const existingSubjectId =
    existingKontur.checks?.rosfinmonitoring?.subjectId ||
    existingKontur.subjectId ||
    null;
  const existingCheckId =
    existingKontur.checks?.rosfinmonitoring?.checkId || null;
  const existingScenarioMeta = existingKontur.checks?.rosfinmonitoring || {};
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
                'rosfinmonitoring',
                existingSubjectId,
                existingCheckId,
                existingScenarioMeta.checkState || 'Processing'
              ),
            },
            'rosfinmonitoring',
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
        error: 'Проверка Росфинмониторинга в Контуре ещё выполняется',
        items: [],
        meta: attachScenarioCache(
          {
            _kontur: buildKonturMeta(
              existingKontur,
              'rosfinmonitoring',
              existingSubjectId,
              existingCheckId,
              existingScenarioMeta.checkState || 'Processing'
            ),
          },
          'rosfinmonitoring',
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
          'Ошибка при получении результата проверки rosfinmonitoring'
        ),
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'rosfinmonitoring',
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
        error: 'Проверка Росфинмониторинга в Контуре ещё выполняется',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'rosfinmonitoring',
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
          rosfinmonitoring: finalResponse?.rosfinmonitoring || null,
          result: finalResponse?.result || null,
          fullResponse: finalResponse,
        },
      };

      result.meta = attachScenarioCache(result.meta, 'rosfinmonitoring', {
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
          'Контур завершил проверку rosfinmonitoring с ошибкой',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'rosfinmonitoring',
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

      result.meta = attachScenarioCache(result.meta, 'rosfinmonitoring', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    if (phase !== 'done') {
      const result = {
        status: 'processing',
        provider: 'kontur',
        error: `Проверка rosfinmonitoring вернула нестандартный статус: ${currentState}`,
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'rosfinmonitoring',
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

      result.meta = attachScenarioCache(result.meta, 'rosfinmonitoring', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    const items = extractRosfinItems(finalResponse, person);

    const result = {
      status: items.length ? 'ok' : 'empty',
      provider: 'kontur',
      items,
      summary: {
        totalCount: items.length,
        hasMatches: items.length > 0,
        hasTerroristMatches: items.some((item) => item.listType === 'terrorist'),
        hasWmdMatches: items.some((item) => item.listType === 'distributorsWMD'),
      },
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'rosfinmonitoring',
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
        rosfinmonitoring: finalResponse?.rosfinmonitoring || null,
        result: finalResponse?.result || null,
        fullResponse: finalResponse,
      },
    };

    result.meta = attachScenarioCache(result.meta, 'rosfinmonitoring', {
      etag: finalResponse?.etag || existingEtag || null,
      cachedSource: buildCachedSourcePayload(result),
    });

    return result;
  }

  const subjectPayload = {
    person: {
      surname: person.lastName,
      name: person.firstName,
      patronymic: person.middleName,
      birthDate: person.birthDate,
    },
  };

  const subjectResponse = await createSubject(subjectPayload);
  logKonturCheck('createSubject_response', {
    request: subjectPayload,
    response: subjectResponse,
  });

  if (!subjectResponse?.ok || !subjectResponse?.subjectId) {
    return {
      status: 'error',
      provider: 'kontur',
      error: buildValidationMessage(
        subjectResponse,
        'Не удалось создать субъект для проверки Росфинмониторинга'
      ),
      items: [],
      raw: {
        step: 'createSubject_error',
        request: subjectPayload,
        response: subjectResponse,
      },
    };
  }

  const subjectId = subjectResponse.subjectId;

  const checkPayload = {
    rosfinmonitoring: {
      subjectId,
    },
  };

  const checkResponse = await createCheck(checkPayload);
  logKonturCheck('createCheck_response', {
    request: checkPayload,
    response: checkResponse,
  });

  if (!checkResponse?.ok || !checkResponse?.checkId) {
    return {
      status: 'error',
      provider: 'kontur',
      error: buildValidationMessage(
        checkResponse,
        'Не удалось создать проверку Росфинмониторинга'
      ),
      items: [],
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'rosfinmonitoring',
          subjectId,
          null,
          checkResponse?.checkState || checkResponse?.state || 'Error'
        ),
      },
      raw: {
        step: 'createCheck_error',
        request: checkPayload,
        response: checkResponse,
      },
    };
  }

  const { state: currentState, phase } = normalizeKonturCheckState(checkResponse);
  const createdCheckId = checkResponse.checkId;

  if (phase === 'processing' || phase === 'unknown') {
    return {
      status: 'processing',
      provider: 'kontur',
      error: 'Проверка Росфинмониторинга в Контуре ещё выполняется',
      items: [],
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'rosfinmonitoring',
          subjectId,
          createdCheckId,
          currentState
        ),
      },
      raw: {
        step: 'createCheck_processing',
        subjectResponse,
        checkResponse,
      },
    };
  }

  if (phase === 'error') {
    return {
      status: 'error',
      provider: 'kontur',
      error:
        checkResponse?.error?.message ||
        checkResponse?.message ||
        'Контур завершил проверку rosfinmonitoring с ошибкой',
      items: [],
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'rosfinmonitoring',
          subjectId,
          createdCheckId,
          currentState
        ),
      },
      raw: {
        step: 'createCheck_failed',
        subjectResponse,
        checkResponse,
      },
    };
  }

  const items = extractRosfinItems(checkResponse, person);

  return {
    status: items.length ? 'ok' : 'empty',
    provider: 'kontur',
    items: items.length
      ? items
      : [
          {
            kind: 'rosfin_lookup',
            message: 'Совпадений в перечнях Росфинмониторинга не найдено',
            severity: 'success',
            isPositiveMatch: false,
            rawRecord: checkResponse,
          },
        ],
    meta: {
      _kontur: buildKonturMeta(
        existingKontur,
        'rosfinmonitoring',
        subjectId,
        createdCheckId,
        currentState
      ),
    },
    raw: {
      step: 'createCheck_done',
      subjectResponse,
      checkResponse,
    },
  };
}

module.exports = rosfinKontur;
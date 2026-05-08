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
    console.log(
      '[kontur][snils]',
      stage,
      JSON.stringify(payload, null, 2)
    );
  } catch (e) {
    console.log('[kontur][snils]', stage, payload);
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

  if (
    state === 'Created' ||
    state === 'Queued' ||
    state === 'Processing'
  ) {
    return { state, phase: 'processing' };
  }

  if (
    state === 'Error' ||
    state === 'Failed'
  ) {
    return { state, phase: 'error' };
  }

  return { state, phase: 'unknown' };
}

function translateSnilsState(state) {
  const map = {
    Valid: 'СНИЛС подтвержден',
    Invalid: 'СНИЛС не соответствует данным',
    NotFound: 'По указанному СНИЛС нет данных в ПФР',
    IncorrectSnilsSum: 'Неверная контрольная сумма СНИЛС',
  };

  return map[state] || state || 'Статус не определён';
}

function getSnilsSeverity(state) {
  if (state === 'Valid') return 'success';
  if (state === 'NotFound') return 'warning';
  if (!state) return 'neutral';
  return 'danger';
}

function isSnilsStateValid(state) {
  return state === 'Valid';
}

function extractSnilsItems(checkResponse, person = {}) {
  const snilsBlock = checkResponse?.snils || {};
  const resultBlock =
    snilsBlock?.result ||
    checkResponse?.result ||
    {};

  const rawState =
    resultBlock?.state ||
    resultBlock?.status ||
    snilsBlock?.state ||
    null;

  const severity = getSnilsSeverity(rawState);
  const stateText = translateSnilsState(rawState);

  return [
    {
      kind: 'snils_lookup',
      state: rawState,
      stateText,
      severity,
      isValid: isSnilsStateValid(rawState),
      message: stateText,
      snils:
        snilsBlock?.snils ||
        resultBlock?.snils ||
        person?.snils ||
        null,
      rawRecord: checkResponse,
    },
  ];
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

async function snilsKontur(person) {
  const existingKontur = person?._kontur || {};
  const existingSubjectId =
    existingKontur.checks?.snils?.subjectId ||
    existingKontur.subjectId ||
    null;
  const existingCheckId = existingKontur.checks?.snils?.checkId || null;

  const existingScenarioMeta = existingKontur.checks?.snils || {};
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
                'snils',
                existingSubjectId,
                existingCheckId,
                existingScenarioMeta.checkState || 'Processing'
              ),
            },
            'snils',
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
        error: 'Проверка СНИЛС в Контуре ещё выполняется',
        items: [],
        meta: attachScenarioCache(
          {
            _kontur: buildKonturMeta(
              existingKontur,
              'snils',
              existingSubjectId,
              existingCheckId,
              existingScenarioMeta.checkState || 'Processing'
            ),
          },
          'snils',
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
          'Ошибка при получении результата проверки snils'
        ),
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'snils',
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
        error: 'Проверка СНИЛС в Контуре ещё выполняется',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'snils',
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
          snils: finalResponse?.snils || null,
          result: finalResponse?.result || null,
          fullResponse: finalResponse,
        },
      };

      result.meta = attachScenarioCache(result.meta, 'snils', {
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
          'Контур завершил проверку snils с ошибкой',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'snils',
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

      result.meta = attachScenarioCache(result.meta, 'snils', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    if (phase !== 'done') {
      const result = {
        status: 'processing',
        provider: 'kontur',
        error: `Проверка snils вернула нестандартный статус: ${currentState}`,
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'snils',
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

      result.meta = attachScenarioCache(result.meta, 'snils', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    const items = extractSnilsItems(finalResponse, person);

    const result = {
      status: items.some((item) => item?.isValid === true) ? 'ok' : 'empty',
      provider: 'kontur',
      items,
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'snils',
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
        snils: finalResponse?.snils || null,
        result: finalResponse?.result || null,
        fullResponse: finalResponse,
      },
    };

    result.meta = attachScenarioCache(result.meta, 'snils', {
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
        snils: person.snils,
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
          'Не удалось создать субъекта в Контур для проверки СНИЛС'
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
    snils: {
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
          ? 'Создание проверки snils в Контуре заняло слишком много времени, попробуем дочитать позже'
          : 'Не удалось создать проверку snils в Контур'
      ),
      items: [],
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'snils',
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
    error: 'Проверка СНИЛС в Контуре ещё выполняется',
    items: [],
    meta: {
      _kontur: buildKonturMeta(
        existingKontur,
        'snils',
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

module.exports = snilsKontur;
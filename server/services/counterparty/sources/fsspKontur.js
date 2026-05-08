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
      '[kontur][fssp]',
      stage,
      JSON.stringify(payload, null, 2)
    );
  } catch (e) {
    console.log('[kontur][fssp]', stage, payload);
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

function normalizeKonturRegionCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^0[1-9]$/.test(raw)) {
    return String(Number(raw));
  }

  if (/^\d{1,2}$/.test(raw)) {
    return raw;
  }

  return '';
}

function normalizeKonturRegions(values) {
  if (!Array.isArray(values)) return [];

  return [...new Set(
    values
      .map(normalizeKonturRegionCode)
      .filter(Boolean)
  )];
}

function extractFsspItems(checkResponse) {
  const fsspBlock = checkResponse?.fssp || {};
  const resultBlock =
    fsspBlock?.result ||
    checkResponse?.result ||
    {};

  const proceedings = Array.isArray(resultBlock?.proceedings)
    ? resultBlock.proceedings
    : [];

  return proceedings.map((item) => ({
    kind: 'fssp_proceeding',
    number: item.number || null,
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    endReason: item.endReason || null,
    subject: item.subject || null,
    region: item.region || null,
    enforcement: item.enforcement || null,
    sum: item.sum || null,
    document: item.document || null,
    department: item.department || null,
    rawRecord: item,
  }));
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

async function fsspKontur(person) {
  const existingKontur = person?._kontur || {};
  const existingSubjectId =
    existingKontur.checks?.fssp?.subjectId ||
    existingKontur.subjectId ||
    null;
  const existingCheckId = existingKontur.checks?.fssp?.checkId || null;

  const existingScenarioMeta = existingKontur.checks?.fssp || {};
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
                'fssp',
                existingSubjectId,
                existingCheckId,
                existingScenarioMeta.checkState || 'Processing'
              ),
            },
            'fssp',
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
        error: 'Проверка ФССП в Контуре ещё выполняется',
        items: [],
        meta: attachScenarioCache(
          {
            _kontur: buildKonturMeta(
              existingKontur,
              'fssp',
              existingSubjectId,
              existingCheckId,
              existingScenarioMeta.checkState || 'Processing'
            ),
          },
          'fssp',
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
          'Ошибка при получении результата проверки fssp'
        ),
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'fssp',
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
        error: 'Проверка ФССП в Контуре ещё выполняется',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'fssp',
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
          fssp: finalResponse?.fssp || null,
          result: finalResponse?.result || null,
          fullResponse: finalResponse,
        },
      };

      result.meta = attachScenarioCache(result.meta, 'fssp', {
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
          'Контур завершил проверку fssp с ошибкой',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'fssp',
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

      result.meta = attachScenarioCache(result.meta, 'fssp', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    if (phase !== 'done') {
      const result = {
        status: 'processing',
        provider: 'kontur',
        error: `Проверка fssp вернула нестандартный статус: ${currentState}`,
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'fssp',
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

      result.meta = attachScenarioCache(result.meta, 'fssp', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    const items = extractFsspItems(finalResponse);
    const hasProceedings = items.length > 0;

    const result = {
      status: hasProceedings ? 'ok' : 'empty',
      provider: 'kontur',
      items,
      summary: {
        totalCount: items.length,
        totalAmount: items.reduce((sum, item) => sum + Number(item?.sum || 0), 0),
        hasProceedings,
      },
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'fssp',
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
        fssp: finalResponse?.fssp || null,
        result: finalResponse?.result || null,
        fullResponse: finalResponse,
      },
    };

    result.meta = attachScenarioCache(result.meta, 'fssp', {
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
          'Не удалось создать субъекта в Контур для проверки ФССП'
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

  const regionCodes = normalizeKonturRegions(person?.regions);

  const checkBody = {
    fssp: {
      subjectId,
      ...(regionCodes ? { regions: regionCodes } : {}),
    },
  };

  const checkResponse = await createCheck(checkBody);
  logKonturCheck('createCheck_response', {
    request: checkBody,
    response: checkResponse,
  });

  if (!checkResponse?.ok || !checkResponse?.checkId) {
    return {
      status: 'error',
      provider: 'kontur',
      error: buildValidationMessage(
        checkResponse,
        'Не удалось создать проверку fssp в Контур'
      ),
      items: [],
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'fssp',
          subjectId,
          null,
          'Error'
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
    error: 'Проверка ФССП в Контуре ещё выполняется',
    items: [],
    meta: {
      _kontur: buildKonturMeta(
        existingKontur,
        'fssp',
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

module.exports = fsspKontur;
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
    console.log('[kontur][bankruptcy]', stage, JSON.stringify(payload, null, 2));
  } catch (e) {
    console.log('[kontur][bankruptcy]', stage, payload);
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

function translateBankruptcyStage(stage) {
  const map = {
    Observation: 'Наблюдение',
    FinancialRecovery: 'Финансовое оздоровление',
    ExternalManagement: 'Внешнее управление',
    PropertyDisposal: 'Реализация имущества',
    AmicableAgreement: 'Мировое соглашение',
    DebtRestructuring: 'Реструктуризация долгов',
    SaleOfProperty: 'Реализация имущества',
    Completed: 'Процедура завершена',
  };

  return map[stage] || stage || null;
}

function translateBankruptcyMatchType(value) {
  const map = {
    FullMatch: 'Полное совпадение',
    PartialMatch: 'Частичное совпадение',
  };

  return map[value] || value || null;
}

function translateBankruptcyCriterion(value) {
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

function buildBankruptcyCriterionText(criteria) {
  if (!Array.isArray(criteria) || !criteria.length) return null;
  return criteria
    .map(translateBankruptcyCriterion)
    .filter(Boolean)
    .join(', ');
}

function extractBankruptcyItems(checkResponse) {
  const bankruptcyBlock = checkResponse?.bankruptcy || {};
  const resultBlock =
    bankruptcyBlock?.result ||
    checkResponse?.result ||
    {};

  const procedures = Array.isArray(resultBlock?.procedures)
  ? resultBlock.procedures
  : Array.isArray(resultBlock?.proceedings)
  ? resultBlock.proceedings
  : Array.isArray(resultBlock?.bankruptcyProcedures)
  ? resultBlock.bankruptcyProcedures
  : [];
      

  if (!procedures.length) {
    return [];
  }

  return procedures.map((item) => {
    const rawStage =
      item.stage ||
      item.state ||
      item.status ||
      null;

    const matchType =
      item.matchType ||
      item.bankruptDetails?.matchType ||
      null;

    const criterion = Array.isArray(item.criterion)
      ? item.criterion
      : Array.isArray(item.bankruptDetails?.criterion)
      ? item.bankruptDetails.criterion
      : [];

    return {
      kind: 'bankruptcy_procedure',
      procedureType:
        item.procedureType ||
        item.type ||
        item.procedure ||
        'Процедура банкротства',

      stage: translateBankruptcyStage(rawStage),
      stageCode: rawStage,

      matchType,
      matchTypeText: translateBankruptcyMatchType(matchType),

      criterion,
      criterionText: buildBankruptcyCriterionText(criterion),

      startDate:
        item.startDate ||
        item.date ||
        null,
      endDate:
        item.endDate ||
        item.lastMessageDate ||
        null,

      court:
        item.court ||
        item.bankruptDetails?.court ||
        null,
      caseNumber:
        item.caseNumber ||
        item.number ||
        null,
      manager:
        item.manager ||
        item.arbitrationManager ||
        item.bankruptDetails?.manager ||
        null,

      debtorName:
        item.bankruptDetails?.name || null,
      debtorInn:
        item.bankruptDetails?.inn || null,
      debtorSnils:
        item.bankruptDetails?.snils || null,
      debtorBirthDate:
        item.bankruptDetails?.dateBirth || null,

      sourceUrl:
        item.url || null,

      rawRecord: item,
    };
  });
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

async function bankruptcyKontur(person) {
  const existingKontur = person?._kontur || {};
  const existingSubjectId =
    existingKontur.checks?.bankruptcy?.subjectId ||
    existingKontur.subjectId ||
    null;
  const existingCheckId = existingKontur.checks?.bankruptcy?.checkId || null;
  const existingScenarioMeta = existingKontur.checks?.bankruptcy || {};
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
                'bankruptcy',
                existingSubjectId,
                existingCheckId,
                existingScenarioMeta.checkState || 'Processing'
              ),
            },
            'bankruptcy',
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
        error: 'Проверка банкротства в Контуре ещё выполняется',
        items: [],
        meta: attachScenarioCache(
          {
            _kontur: buildKonturMeta(
              existingKontur,
              'bankruptcy',
              existingSubjectId,
              existingCheckId,
              existingScenarioMeta.checkState || 'Processing'
            ),
          },
          'bankruptcy',
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
          'Ошибка при получении результата проверки bankruptcy'
        ),
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'bankruptcy',
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
        error: 'Проверка банкротства в Контуре ещё выполняется',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'bankruptcy',
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
          bankruptcy: finalResponse?.bankruptcy || null,
          result: finalResponse?.result || null,
          fullResponse: finalResponse,
        },
      };

      result.meta = attachScenarioCache(result.meta, 'bankruptcy', {
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
          'Контур завершил проверку bankruptcy с ошибкой',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'bankruptcy',
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

      result.meta = attachScenarioCache(result.meta, 'bankruptcy', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    if (phase !== 'done') {
      const result = {
        status: 'processing',
        provider: 'kontur',
        error: `Проверка bankruptcy вернула нестандартный статус: ${currentState}`,
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'bankruptcy',
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

      result.meta = attachScenarioCache(result.meta, 'bankruptcy', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    const items = extractBankruptcyItems(finalResponse);

    const result = {
      status: items.length ? 'ok' : 'empty',
      provider: 'kontur',
      items,
      summary: {
        totalCount: items.length,
        activeCount: items.filter((item) => !item.endDate).length,
        finishedCount: items.filter((item) => !!item.endDate).length,
        hasActiveBankruptcy: items.some((item) => !item.endDate),
      },
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'bankruptcy',
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
        bankruptcy: finalResponse?.bankruptcy || null,
        result: finalResponse?.result || null,
        fullResponse: finalResponse,
      },
    };

    result.meta = attachScenarioCache(result.meta, 'bankruptcy', {
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
        inn: person.inn,
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
          'Не удалось создать субъекта в Контур для проверки банкротства'
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
    bankruptcy: {
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
          ? 'Создание проверки bankruptcy в Контуре заняло слишком много времени, попробуем дочитать позже'
          : 'Не удалось создать проверку bankruptcy в Контур'
      ),
      items: [],
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'bankruptcy',
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
    error: 'Проверка банкротства в Контуре ещё выполняется',
    items: [],
    meta: {
      _kontur: buildKonturMeta(
        existingKontur,
        'bankruptcy',
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

module.exports = bankruptcyKontur;
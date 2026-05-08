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
      '[kontur][commercialActivity]',
      stage,
      JSON.stringify(payload, null, 2)
    );
  } catch (e) {
    console.log('[kontur][commercialActivity]', stage, payload);
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

function translateCommercialActivityStatus(value) {
  const map = {
    Active: 'Действующая',
    Reorganizing: 'В процессе реорганизации',
    Bankrupting: 'В процессе банкротства / банкрот',
    Dissolving: 'В стадии ликвидации',
    Dissolved: 'Недействующая',
  };

  return map[value] || value || null;
}

function translateCommercialBankruptcyIndicator(value) {
  const map = {
    ArbitrationFound: 'Найдены арбитражные дела',
    MessagesFound: 'Найдены сообщения по банкротству',
    DeclarationFound: 'Найдена декларация / заявление',
    FinishedBankruptcyFound: 'Найдена завершённая процедура банкротства',
  };

  return map[value] || value || null;
}

function translateCommercialAffiliationName(value) {
  const map = {
    EnforcementProceeding: 'Исполнительные производства у связанных организаций',
    Bankruptcy: 'Связанные компании ликвидированы через банкротство',
  };

  return map[value] || value || null;
}

function translateArbitrationParticipantRole(value) {
  const map = {
    Plaintiff: 'Истец',
    Defendant: 'Ответчик',
    ThirdParty: 'Третье лицо',
    Debtor: 'Должник',
    Creditor: 'Кредитор',
  };

  return map[value] || value || null;
}

function translateArbitrationInstanceType(value) {
  const map = {
    FirstInstance: 'Первая инстанция',
    Appeal: 'Апелляция',
    Cassation: 'Кассация',
    Supervision: 'Надзор',
  };

  return map[value] || value || null;
}

function translateArbitrationDocumentType(value) {
  const map = {
    Decision: 'Решение',
    Ruling: 'Определение',
    Resolution: 'Постановление',
    Writ: 'Исполнительный лист',
  };

  return map[value] || value || null;
}

function normalizeCommercialIndicators(values = []) {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => ({
      code: value || null,
      text: translateCommercialBankruptcyIndicator(value),
    }))
    .filter((item) => item.code || item.text);
}

function normalizeCommercialAffiliation(values = []) {
  if (!Array.isArray(values)) return [];

  return values.map((item) => ({
    name: item?.name || null,
    nameText: translateCommercialAffiliationName(item?.name || null),
    count: item?.count ?? null,
    sum: item?.sum ?? null,
    rawRecord: item,
  }));
}

function normalizeCommercialArbitrationAnalytics(values = [], translator) {
  if (!Array.isArray(values)) return [];

  return values.map((item) => ({
    name: item?.name || null,
    nameText: translator(item?.name || null),
    count: item?.count ?? null,
    sum: item?.sum ?? null,
    rawRecord: item,
  }));
}

function normalizeCommercialArbitrationProceedings(values = []) {
  if (!Array.isArray(values)) return [];

  return values.map((item) => ({
    number: item?.number || null,
    proceedingType: item?.proceedingType || null,
    proceedingCategory: item?.proceedingCategory || null,
    proceedingCategoryText: translateArbitrationCategory(item?.proceedingCategory || null),
    proceedingStartDate: item?.proceedingStartDate || null,
    sum: item?.sum ?? null,

    proceedingResult: item?.proceedingResult || null,
    proceedingResultText: translateArbitrationResult(item?.proceedingResult || null),

    url: item?.url || null,

    participants: Array.isArray(item?.participants)
      ? item.participants.map((participant) => ({
          name: participant?.name || null,
          inn: participant?.inn || null,
          ogrn: participant?.ogrn || null,
          role: participant?.role || null,
          roleText: translateArbitrationParticipantRole(participant?.role || null),
          rawRecord: participant,
        }))
      : [],

    instances: Array.isArray(item?.instances)
      ? item.instances.map((instance) => ({
          documentType: instance?.documentType || null,
          documentTypeText: translateArbitrationDocumentType(instance?.documentType || null),
          instanceType: instance?.instanceType || null,
          instanceTypeText: translateArbitrationInstanceType(instance?.instanceType || null),
          receivedInstanceDate: instance?.receivedInstanceDate || null,

          documents: Array.isArray(instance?.documents)
            ? instance.documents.map((document) => ({
                documentType: document?.documentType || null,
                documentTypeText: translateArbitrationDocumentType(document?.documentType || null),
                publishDate: document?.publishDate || null,
                url: document?.url || null,
                rawRecord: document,
              }))
            : [],

          rawRecord: instance,
        }))
      : [],

    rawRecord: item,
  }));
}

function translateArbitrationResult(value) {
  const map = {
    Lost: 'Проиграно',
    Won: 'Выиграно',
    PartiallyWon: 'Частично выиграно',
    PartiallyLost: 'Частично проиграно',
    Settled: 'Мировое соглашение',
    InProgress: 'В процессе',
    BlindSpot: 'Результат не определён',
  };

  return map[value] || value || null;
}

function translateArbitrationCategory(value) {
  const map = {
    Bankruptcy: 'Банкротство',
    Loan: 'Займы / кредиты',
    ServicesAgreement: 'Договоры оказания услуг',
    SupplyAgreement: 'Договоры поставки',
    Taxes: 'Налоги',
  };

  return map[value] || value || null;
}

function translateCommercialActivityRelationship(value) {
  const map = {
    Director: 'Руководитель',
    Founder: 'Учредитель',
    IndividualEntrepreneur: 'ИП',
  };

  return map[value] || value || null;
}

function extractCommercialActivityItems(checkResponse) {
  const commercialBlock = checkResponse?.commercialActivity || {};
  const resultBlock =
    commercialBlock?.result ||
    checkResponse?.result ||
    {};

  const involvedOrganizations = Array.isArray(resultBlock?.involvedOrganizations)
    ? resultBlock.involvedOrganizations
    : [];

  return involvedOrganizations.map((item) => {
    const analytics = item?.analytics || {};
    const arbitration = item?.arbitration || {};

    const normalizedBankruptcyIndicators = normalizeCommercialIndicators(
      analytics?.bankruptcyIndicators
    );

    const normalizedAffiliation = normalizeCommercialAffiliation(
      analytics?.affiliation
    );

    const normalizedGroupByResult = normalizeCommercialArbitrationAnalytics(
      arbitration?.groupByResult,
      translateArbitrationResult
    );

    const normalizedGroupByCategory = normalizeCommercialArbitrationAnalytics(
      arbitration?.groupByCategory,
      translateArbitrationCategory
    );

    const normalizedProceedings = normalizeCommercialArbitrationProceedings(
      arbitration?.proceedings
    );

    return {
      kind: 'commercial_activity_org',

      name: item?.name || null,
      ogrn: item?.ogrn || null,
      inn: item?.inn || null,
      kpp: item?.kpp || null,

      status: item?.status || null,
      statusText: translateCommercialActivityStatus(item?.status),
      statusDate: item?.statusDate || null,

      relationshipType: Array.isArray(item?.relationshipType)
        ? item.relationshipType
        : [],
      relationshipTypeText: Array.isArray(item?.relationshipType)
        ? item.relationshipType
            .map(translateCommercialActivityRelationship)
            .filter(Boolean)
        : [],

      activityCode: item?.activity?.code || null,
      activityName: item?.activity?.name || null,

      registrationDate: item?.registrationDate || null,
      liquidationDate: item?.liquidationDate || null,

      generalIndicators: Array.isArray(analytics?.generalIndicators)
        ? analytics.generalIndicators
        : [],

      bankruptcyIndicators: normalizedBankruptcyIndicators,
      affiliation: normalizedAffiliation,

      arbitrationCount: arbitration?.count ?? null,
      arbitrationSum: arbitration?.sum ?? null,
      arbitrationGroupByResult: normalizedGroupByResult,
      arbitrationGroupByCategory: normalizedGroupByCategory,
      arbitrationProceedings: normalizedProceedings,

      rawRecord: {
        ...item,
        analytics: {
          ...analytics,
          bankruptcyIndicators: normalizedBankruptcyIndicators,
          affiliation: normalizedAffiliation,
        },
        arbitration: {
          ...arbitration,
          groupByResult: normalizedGroupByResult,
          groupByCategory: normalizedGroupByCategory,
          proceedings: normalizedProceedings,
        },
      },
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

async function commercialActivityKontur(person) {
  const existingKontur = person?._kontur || {};
  const existingSubjectId =
    existingKontur.checks?.commercialActivity?.subjectId ||
    existingKontur.subjectId ||
    null;
  const existingCheckId =
    existingKontur.checks?.commercialActivity?.checkId || null;
  const existingScenarioMeta = existingKontur.checks?.commercialActivity || {};
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
                'commercialActivity',
                existingSubjectId,
                existingCheckId,
                existingScenarioMeta.checkState || 'Processing'
              ),
            },
            'commercialActivity',
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
        error: 'Проверка коммерческой деятельности в Контуре ещё выполняется',
        items: [],
        meta: attachScenarioCache(
          {
            _kontur: buildKonturMeta(
              existingKontur,
              'commercialActivity',
              existingSubjectId,
              existingCheckId,
              existingScenarioMeta.checkState || 'Processing'
            ),
          },
          'commercialActivity',
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
          'Ошибка при получении результата проверки commercialActivity'
        ),
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'commercialActivity',
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

    const { state: currentState, phase } =
      normalizeKonturCheckState(finalResponse);

    if (phase === 'processing') {
      const result = {
        status: 'processing',
        provider: 'kontur',
        error: 'Проверка коммерческой деятельности в Контуре ещё выполняется',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'commercialActivity',
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
          commercialActivity: finalResponse?.commercialActivity || null,
          result: finalResponse?.result || null,
          fullResponse: finalResponse,
        },
      };

      result.meta = attachScenarioCache(result.meta, 'commercialActivity', {
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
          'Контур завершил проверку commercialActivity с ошибкой',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'commercialActivity',
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

      result.meta = attachScenarioCache(result.meta, 'commercialActivity', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    if (phase !== 'done') {
      const result = {
        status: 'processing',
        provider: 'kontur',
        error: `Проверка commercialActivity вернула нестандартный статус: ${currentState}`,
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'commercialActivity',
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

      result.meta = attachScenarioCache(result.meta, 'commercialActivity', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    const items = extractCommercialActivityItems(finalResponse, person);

    const result = {
      status: items.length ? 'ok' : 'empty',
      provider: 'kontur',
      items,
      summary: {
        totalCount: items.length,
        activeCompaniesCount: items.filter((item) => item.statusCode === 'Active').length,
        bankruptCompaniesCount: items.filter((item) => item.hasBankruptcy === true).length,
        hasActiveCompanies: items.some((item) => item.statusCode === 'Active'),
        hasBankruptcyCompanies: items.some((item) => item.hasBankruptcy === true),
      },
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'commercialActivity',
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
        commercialActivity: finalResponse?.commercialActivity || null,
        result: finalResponse?.result || null,
        fullResponse: finalResponse,
      },
    };

    result.meta = attachScenarioCache(result.meta, 'commercialActivity', {
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
          'Не удалось создать субъекта в Контур для проверки коммерческой деятельности'
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
    commercialActivity: {
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
          ? 'Создание проверки commercialActivity в Контуре заняло слишком много времени, попробуем дочитать позже'
          : 'Не удалось создать проверку commercialActivity в Контур'
      ),
      items: [],
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'commercialActivity',
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
    error: 'Проверка коммерческой деятельности в Контуре ещё выполняется',
    items: [],
    meta: {
      _kontur: buildKonturMeta(
        existingKontur,
        'commercialActivity',
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

module.exports = commercialActivityKontur;
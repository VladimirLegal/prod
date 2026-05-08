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
      '[kontur][arbitration]',
      stage,
      JSON.stringify(payload, null, 2)
    );
  } catch (e) {
    console.log('[kontur][arbitration]', stage, payload);
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

function translateArbitrationRole(value) {
  const map = {
    Plaintiff: 'Истец',
    Defendant: 'Ответчик',
    ThirdParty: 'Третье лицо',
    Creditor: 'Кредитор',
    Debtor: 'Должник',
  };

  return map[value] || value || null;
}

function translateArbitrationSubjectRole(value) {
  const map = {
    Plaintiff: 'Истец',
    Defendant: 'Ответчик',
    ThirdParty: 'Третье лицо',
    Creditor: 'Кредитор',
    Debtor: 'Должник',
  };

  return map[value] || value || null;
}

function translateArbitrationMatchType(value) {
  const map = {
    FullMatch: 'Полное совпадение',
    PartialMatch: 'Частичное совпадение',
    NotMatch: 'Совпадение не подтверждено',
  };

  return map[value] || value || null;
}

function translateArbitrationCriterion(value) {
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

function buildArbitrationCriterionText(criteria) {
  if (!Array.isArray(criteria) || !criteria.length) return null;

  return criteria
    .map(translateArbitrationCriterion)
    .filter(Boolean)
    .join(', ');
}

function translateArbitrationResult(value) {
  const map = {
    Lost: 'Проиграно',
    PartiallyLost: 'Частично проиграно',
    NotLost: 'Не проиграно',
    InProgress: 'В процессе рассмотрения',
    BlindSpot: 'Не удалось определить результат дела',
    ResultUnknown: 'Результат не определён',
    Won: 'Выиграно',
    PartiallyWon: 'Частично выиграно',
    Settled: 'Мировое соглашение',
  };

  return map[value] || value || null;
}

function translateArbitrationCategory(value) {
  const map = {
    Bankruptcy: 'Банкротство',
    Loan: 'Займы / кредиты',
    Taxes: 'Налоги',
    ServicesAgreement: 'Договоры оказания услуг',
    SupplyAgreement: 'Договоры поставки',
  };

  return map[value] || value || null;
}

function translateArbitrationInstanceType(value) {
  const map = {
    FirstInstance: 'Первая инстанция',
    Initial: 'Первая инстанция',
    Appeal: 'Апелляция',
    Cassation: 'Кассация',
    Supervision: 'Надзор',
  };

  return map[value] || value || null;
}

function normalizeArbitrationAnalytics(values = [], translator) {
  if (!Array.isArray(values)) return [];

  return values.map((item) => ({
    name: item?.name || null,
    nameText: translator(item?.name || null),
    count: item?.count ?? null,
    sum: item?.sum ?? null,
    rawRecord: item,
  }));
}

function normalizeArbitrationParticipants(values = []) {
  if (!Array.isArray(values)) return [];

  return values.map((item) => {
    const criterion = Array.isArray(item?.criterion) ? item.criterion : [];
    const matchType = item?.matchType || null;
    const normalizedRole = normalizeArbitrationRole(item?.role || null);

    return {
      name: item?.name || null,
      inn: item?.inn || null,
      ogrn: item?.ogrn || null,

      role: normalizedRole,
      roleText: translateArbitrationRole(normalizedRole) || item?.role || null,
      rawRole: item?.role || null,

      criterion,
      criterionText: buildArbitrationCriterionText(criterion),

      matchType,
      matchTypeText: translateArbitrationMatchType(matchType),

      isTarget: matchType === 'FullMatch' || matchType === 'PartialMatch',

      rawRecord: item,
    };
  });
}

function normalizeArbitrationInstances(values = []) {
  if (!Array.isArray(values)) return [];

  return values.map((item) => ({
    receivedInstanceDate: item?.receivedInstanceDate || null,

    instanceType: item?.instanceType || null,
    instanceTypeText: translateArbitrationInstanceType(item?.instanceType || null),

    documentType: item?.documentType || null,

    documents: Array.isArray(item?.documents)
      ? item.documents.map((document) => ({
          documentType: document?.documentType || null,
          issueDate: document?.issueDate || null,
          publishDate: document?.publishDate || null,
          url: document?.url || null,
          rawRecord: document,
        }))
      : [],

    rawRecord: item,
  }));
}

function normalizeArbitrationRole(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase();

  const map = {
    defendant: 'Defendant',
    'ответчик': 'Defendant',

    plaintiff: 'Plaintiff',
    'истец': 'Plaintiff',
    'истец (заявитель)': 'Plaintiff',
    'заявитель': 'Plaintiff',

    thirdparty: 'ThirdParty',
    'третье лицо': 'ThirdParty',

    otherparty: 'OtherParty',
    'иное лицо': 'OtherParty',
  };

  return map[normalized] || raw;
}

function buildArbitrationGroupKey(role, matchType) {
  if (!role || !matchType) return null;

  const normalizedRole = normalizeArbitrationRole(role);

  const roleMap = {
    Defendant: 'defendant',
    Plaintiff: 'plaintiff',
    ThirdParty: 'thirdParty',
    OtherParty: 'otherParty',
  };

  const matchMap = {
    FullMatch: 'full',
    PartialMatch: 'partial',
  };

  const rolePart = roleMap[normalizedRole];
  const matchPart = matchMap[matchType];

  if (!rolePart || !matchPart) return null;

  return `${rolePart}_${matchPart}`;
}

function translateArbitrationGroupLabel(groupKey) {
  const map = {
    selfCases: 'Дела, где проверяемый одновременно истец и ответчик',
    defendant_full: 'Ответчик — полное совпадение',
    defendant_partial: 'Ответчик — частичное совпадение',
    plaintiff_full: 'Истец — полное совпадение',
    plaintiff_partial: 'Истец — частичное совпадение',
    thirdParty_full: 'Третье лицо — полное совпадение',
    thirdParty_partial: 'Третье лицо — частичное совпадение',
    otherParty_full: 'Иное лицо — полное совпадение',
    otherParty_partial: 'Иное лицо — частичное совпадение',
  };

  return map[groupKey] || groupKey || null;
}

function extractArbitrationSummary(checkResponse, items = []) {
  const arbitrationBlock = checkResponse?.arbitration || {};
  const resultBlock =
    arbitrationBlock?.result ||
    checkResponse?.result ||
    {};

  const roles = Array.isArray(arbitrationBlock?.roles)
    ? arbitrationBlock.roles
    : [];

  const grouped = buildArbitrationGroupedSections(items);

  return {
    totalCount: resultBlock?.count ?? 0,
    totalSum: resultBlock?.sum ?? 0,

    subjectRoles: roles,
    subjectRolesText: roles
      .map(translateArbitrationSubjectRole)
      .filter(Boolean),

    groupByResult: normalizeArbitrationAnalytics(
      resultBlock?.groupByResult,
      translateArbitrationResult
    ),

    groupByCategory: normalizeArbitrationAnalytics(
      resultBlock?.groupByCategory,
      translateArbitrationCategory
    ),

    groupedSections: grouped.sections,
    rawGroupedSections: grouped.rawGroups,

    rawRecord: resultBlock,
  };
}

function extractArbitrationItems(checkResponse) {
  const arbitrationBlock = checkResponse?.arbitration || {};
  const resultBlock =
    arbitrationBlock?.result ||
    checkResponse?.result ||
    {};

  const proceedings = Array.isArray(resultBlock?.proceedings)
    ? resultBlock.proceedings
    : [];

  return proceedings.map((item) => ({
    kind: 'arbitration_case',

    number: item?.number || null,
    proceedingType: item?.proceedingType || null,

    proceedingCategory: item?.proceedingCategory || null,
    proceedingCategoryText: translateArbitrationCategory(item?.proceedingCategory || null),

    proceedingStartDate: item?.proceedingStartDate || null,

    sum: item?.sum ?? null,

    proceedingResult: item?.proceedingResult || null,
    proceedingResultText: translateArbitrationResult(item?.proceedingResult || null),

    url: item?.url || null,

    participants: normalizeArbitrationParticipants(item?.participants),
    instances: normalizeArbitrationInstances(item?.instances),

    rawRecord: item,
  }));
}

function buildArbitrationGroupedSections(items = []) {
  const groups = {
    selfCases: [],
    defendant_full: [],
    defendant_partial: [],
    plaintiff_full: [],
    plaintiff_partial: [],
    thirdParty_full: [],
    thirdParty_partial: [],
    otherParty_full: [],
    otherParty_partial: [],
  };

  for (const item of items) {
    const targetParticipants = Array.isArray(item?.participants)
      ? item.participants.filter((participant) => participant?.isTarget)
      : [];

    if (!targetParticipants.length) {
      continue;
    }

    const hasPlaintiff = targetParticipants.some(
      (participant) => normalizeArbitrationRole(participant?.role) === 'Plaintiff'
    );

    const hasDefendant = targetParticipants.some(
      (participant) => normalizeArbitrationRole(participant?.role) === 'Defendant'
    );

    if (hasPlaintiff && hasDefendant) {
      groups.selfCases.push(item);
      continue;
    }

    const addedGroupKeys = new Set();

    for (const participant of targetParticipants) {
      const groupKey = buildArbitrationGroupKey(
        participant?.role || null,
        participant?.matchType || null
      );

      if (!groupKey || addedGroupKeys.has(groupKey)) {
        continue;
      }

      if (Array.isArray(groups[groupKey])) {
        groups[groupKey].push(item);
        addedGroupKeys.add(groupKey);
      }
    }
  }

  const sections = Object.entries(groups)
    .map(([key, sectionItems]) => {
      const totalCount = sectionItems.length;
      const totalSum = sectionItems.reduce((acc, item) => {
        const value = Number(item?.sum || 0);
        return Number.isFinite(value) ? acc + value : acc;
      }, 0);

      return {
        key,
        title: translateArbitrationGroupLabel(key),
        totalCount,
        totalSum,
        items: sectionItems,
      };
    })
    .filter((section) => section.totalCount > 0);

  return {
    sections,
    rawGroups: groups,
  };
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

async function arbitrationKontur(person) {
  const existingKontur = person?._kontur || {};
  const existingSubjectId =
    existingKontur.checks?.arbitration?.subjectId ||
    existingKontur.subjectId ||
    null;
  const existingCheckId = existingKontur.checks?.arbitration?.checkId || null;

  const existingScenarioMeta = existingKontur.checks?.arbitration || {};
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
                'arbitration',
                existingSubjectId,
                existingCheckId,
                existingScenarioMeta.checkState || 'Processing'
              ),
            },
            'arbitration',
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
        error: 'Проверка арбитража в Контуре ещё выполняется',
        items: [],
        meta: attachScenarioCache(
          {
            _kontur: buildKonturMeta(
              existingKontur,
              'arbitration',
              existingSubjectId,
              existingCheckId,
              existingScenarioMeta.checkState || 'Processing'
            ),
          },
          'arbitration',
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
          'Ошибка при получении результата проверки arbitration'
        ),
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'arbitration',
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
        error: 'Проверка арбитража в Контуре ещё выполняется',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'arbitration',
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
          arbitration: finalResponse?.arbitration || null,
          result: finalResponse?.result || null,
          fullResponse: finalResponse,
        },
      };

      result.meta = attachScenarioCache(result.meta, 'arbitration', {
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
          'Контур завершил проверку arbitration с ошибкой',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'arbitration',
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

      result.meta = attachScenarioCache(result.meta, 'arbitration', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    if (phase !== 'done') {
      const result = {
        status: 'processing',
        provider: 'kontur',
        error: `Проверка arbitration вернула нестандартный статус: ${currentState}`,
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'arbitration',
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

      result.meta = attachScenarioCache(result.meta, 'arbitration', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    const items = extractArbitrationItems(finalResponse);
    const summary = extractArbitrationSummary(finalResponse, items);

    const result = {
      status: items.length ? 'ok' : 'empty',
      provider: 'kontur',
      items: items.length
        ? 'Найдены арбитражные дела'
        : 'По арбитражным делам данные не найдены',
      summary,
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'arbitration',
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
        arbitration: finalResponse?.arbitration || null,
        result: finalResponse?.result || null,
        summary,
        fullResponse: finalResponse,
      },
    };

    result.meta = attachScenarioCache(result.meta, 'arbitration', {
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
          'Не удалось создать субъекта в Контур для проверки арбитража'
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
    arbitration: {
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
          ? 'Создание проверки arbitration в Контуре заняло слишком много времени, попробуем дочитать позже'
          : 'Не удалось создать проверку arbitration в Контур'
      ),
      items: [],
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'arbitration',
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
    error: 'Проверка арбитража в Контуре ещё выполняется',
    items: [],
    meta: {
      _kontur: buildKonturMeta(
        existingKontur,
        'arbitration',
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

module.exports = arbitrationKontur;
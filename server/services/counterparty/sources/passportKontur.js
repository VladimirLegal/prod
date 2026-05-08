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
      '[kontur][passport]',
      stage,
      JSON.stringify(payload, null, 2)
    );
  } catch (e) {
    console.log('[kontur][passport]', stage, payload);
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

function translatePassportState(state) {
  const map = {
    Valid: 'Паспорт действителен',
    NotFound: 'Сведения в базе МВД не найдены',
    Expired: 'Истёк срок действия паспорта',
    Replaced: 'Паспорт заменён',
    IssuedWithViolation: 'Паспорт выдан с нарушением',
    WantedByLaw: 'Паспорт числится в розыске',
    Destroyed: 'Паспорт изъят или уничтожен',
    OwnerDied: 'Паспорт недействителен в связи со смертью владельца',
    Defected: 'Паспорт признан бракованным',
    Lost: 'Паспорт утрачен',
    CivilTermination: 'Прекращено гражданство РФ',
  };

  return map[state] || state || 'Статус не определён';
}

function getPassportSeverity(state) {
  if (state === 'Valid') return 'success';
  if (state === 'NotFound') return 'warning';
  if (!state) return 'neutral';
  return 'danger';
}

function isPassportStateValid(state) {
  return state === 'Valid';
}

function buildIdentityDocument(person) {
  const hasAnyPassportField =
    person?.passportSeries ||
    person?.passportNumber ||
    person?.passportIssueDate ||
    person?.passportIssuerCode;

  if (!hasAnyPassportField) {
    return null;
  }

  return {
    series: person?.passportSeries || undefined,
    number: person?.passportNumber || undefined,
    issueDate: person?.passportIssueDate || undefined,
    issuer: {
      issuerCode: person?.passportIssuerCode || undefined,
    },
  };
}

function extractPassportItems(checkResponse, person = {}) {
  const passportBlock = checkResponse?.passport || {};
  const resultBlock =
    passportBlock?.result ||
    checkResponse?.result ||
    {};

  const rawState =
    resultBlock?.state ||
    resultBlock?.status ||
    passportBlock?.state ||
    null;

  const severity = getPassportSeverity(rawState);
  const stateText = translatePassportState(rawState);

  return [
    {
      kind: 'passport_lookup',
      state: rawState,
      stateText,
      severity,
      isValid: isPassportStateValid(rawState),
      message: stateText,
      series:
        passportBlock?.series ||
        resultBlock?.series ||
        person?.passportSeries ||
        person?.passport?.series ||
        null,
      number:
        passportBlock?.number ||
        resultBlock?.number ||
        person?.passportNumber ||
        person?.passport?.number ||
        null,
      issueDate:
        passportBlock?.issueDate ||
        resultBlock?.issueDate ||
        person?.passportIssueDate ||
        person?.passport?.issueDate ||
        null,
      issuerCode:
        passportBlock?.issuer?.issuerCode ||
        resultBlock?.issuer?.issuerCode ||
        person?.passportIssuerCode ||
        person?.passport?.issuerCode ||
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

async function passportKontur(person) {
    
  const existingKontur = person?._kontur || {};
  const existingSubjectId =
    existingKontur.checks?.passport?.subjectId ||
    existingKontur.subjectId ||
    null;
  const existingCheckId = existingKontur.checks?.passport?.checkId || null;
  const existingScenarioMeta = existingKontur.checks?.passport || {};
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
                'passport',
                existingSubjectId,
                existingCheckId,
                existingScenarioMeta.checkState || 'Processing'
              ),
            },
            'passport',
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
        error: 'Проверка паспорта в Контуре ещё выполняется',
        items: [],
        meta: attachScenarioCache(
          {
            _kontur: buildKonturMeta(
              existingKontur,
              'passport',
              existingSubjectId,
              existingCheckId,
              existingScenarioMeta.checkState || 'Processing'
            ),
          },
          'passport',
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
          'Ошибка при получении результата проверки passport'
        ),
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'passport',
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
        error: 'Проверка паспорта в Контуре ещё выполняется',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'passport',
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
          passport: finalResponse?.passport || null,
          result: finalResponse?.result || null,
          fullResponse: finalResponse,
        },
      };

      result.meta = attachScenarioCache(result.meta, 'passport', {
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
          'Контур завершил проверку passport с ошибкой',
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'passport',
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

      result.meta = attachScenarioCache(result.meta, 'passport', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    if (phase !== 'done') {
      const result = {
        status: 'processing',
        provider: 'kontur',
        error: `Проверка passport вернула нестандартный статус: ${currentState}`,
        items: [],
        meta: {
          _kontur: buildKonturMeta(
            existingKontur,
            'passport',
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

      result.meta = attachScenarioCache(result.meta, 'passport', {
        etag: finalResponse?.etag || existingEtag || null,
        cachedSource: buildCachedSourcePayload(result),
      });

      return result;
    }

    
    const items = extractPassportItems(finalResponse, person);

    const result = {
      status: items.some((item) => item?.isValid === true) ? 'ok' : 'empty',
      provider: 'kontur',
      items,
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'passport',
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
        passport: finalResponse?.passport || null,
        result: finalResponse?.result || null,
        fullResponse: finalResponse,
      },
    };

    result.meta = attachScenarioCache(result.meta, 'passport', {
      etag: finalResponse?.etag || existingEtag || null,
      cachedSource: buildCachedSourcePayload(result),
    });

    return result;
  }

  let subjectId = existingSubjectId;
  const identityDocument = buildIdentityDocument(person);

  if (!identityDocument) {
    return {
      status: 'error',
      provider: 'kontur',
      error: 'Для проверки паспорта в Контуре нужны серия, номер, дата выдачи и код подразделения',
      items: [],
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'passport',
          subjectId,
          null,
          'Error'
        ),
      },
      raw: {
        step: 'createCheck_validation',
        subjectId,
        missingIdentityDocument: true,
        person: {
          passportSeries: person?.passportSeries || null,
          passportNumber: person?.passportNumber || null,
          passportIssueDate: person?.passportIssueDate || null,
          passportIssuerCode: person?.passportIssuerCode || null,
        },
      },
    };
  }

  if (!subjectId) {
    const subjectBody = {
      person: {
        surname: person.lastName,
        name: person.firstName,
        patronymic: person.middleName || undefined,
      },
    };

    if (person.birthDate) {
      subjectBody.person.birthDate = person.birthDate;
    }

    const identityDocument = buildIdentityDocument(person);

    if (identityDocument) {
    subjectBody.person.identityDocument = identityDocument;
    }

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
          'Не удалось создать субъекта в Контур'
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
    passport: {
      subjectId,
      identityDocument,
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
        'Не удалось создать проверку passport в Контур. Проверь серию, номер, дату выдачи и код подразделения'
      ),
      items: [],
      meta: {
        _kontur: buildKonturMeta(
          existingKontur,
          'passport',
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
    error: 'Проверка паспорта в Контуре ещё выполняется',
    items: [],
    meta: {
      _kontur: buildKonturMeta(
        existingKontur,
        'passport',
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

module.exports = passportKontur;
const { normalizePersonInput } = require('./normalize');
const { calculateScore } = require('./score');
const { mapAggregatedResult } = require('./mapper');
const checkMvdPassport = require('./sources/mvdPassport');
const checkMvdWanted = require('./sources/mvdWanted');
const checkStopOperRS = require('./sources/stopOperRS');
const checkFssp = require('./sources/fssp');
const checkEfrsb = require('./sources/efrsb');
const checkRosfin = require('./sources/rosfin');
const checkKad = require('./sources/kad');
const checkRasArbitr = require('./sources/rasArbitr');
const buildArbitrationApiCloudCombined = require('./buildArbitrationApiCloudCombined');
const checkFns = require('./sources/fns');
const checkCourtsCommon = require('./sources/courtsCommon');
const passportKontur = require('./sources/passportKontur');
const fsspKontur = require('./sources/fsspKontur');
const snilsKontur = require('./sources/snilsKontur');
const arbitrationKontur = require('./sources/arbitrationKontur');
const commercialActivityKontur = require('./sources/commercialActivityKontur');
const wantedKontur = require('./sources/wantedKontur');
const bankruptcyKontur = require('./sources/bankruptcyKontur');
const rosfinKontur = require('./sources/rosfinKontur');
const checkInoagent = require('./sources/inoagent');

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function getMissingFields(person, fields = []) {
  return fields.filter((field) => !hasValue(person?.[field]));
}

function hasFullName(person) {
  return getMissingFields(person, ['lastName', 'firstName', 'middleName']).length === 0;
}

function hasBirthDate(person) {
  return hasValue(person?.birthDate);
}

function hasInn(person) {
  return hasValue(person?.inn);
}

function hasSnils(person) {
  return hasValue(person?.snils);
}

function hasPassportSet(person) {
  return (
    hasValue(person?.passportSeries) &&
    hasValue(person?.passportNumber) &&
    hasValue(person?.passportIssueDate) &&
    hasValue(person?.passportIssuerCode)
  );
}

function buildSkippedSource(message, missing = [], provider = 'kontur') {
  return {
    status: 'skipped',
    provider,
    message,
    items: [],
    raw: {
      step: 'skipped',
      missing,
    },
  };
}

function buildKonturPlan(person) {
  const availability = {
    courtsCommon: {
      canRun: hasFullName(person),
      missing: getMissingFields(person, ['lastName', 'firstName', 'middleName']),
    },
    passportKontur: {
      canRun: hasFullName(person) && hasBirthDate(person) && hasPassportSet(person),
      missing: [
        ...getMissingFields(person, ['lastName', 'firstName', 'middleName']),
        ...(!hasBirthDate(person) ? ['birthDate'] : []),
        ...getMissingFields(person, [
          'passportSeries',
          'passportNumber',
          'passportIssueDate',
          'passportIssuerCode',
        ]),
      ],
    },
    fsspKontur: {
      canRun: hasFullName(person) && hasBirthDate(person),
      missing: [
        ...getMissingFields(person, ['lastName', 'firstName', 'middleName']),
        ...(!hasBirthDate(person) ? ['birthDate'] : []),
      ],
    },
    snilsKontur: {
      canRun: hasFullName(person) && hasBirthDate(person) && hasSnils(person),
      missing: [
        ...getMissingFields(person, ['lastName', 'firstName', 'middleName']),
        ...(!hasBirthDate(person) ? ['birthDate'] : []),
        ...(!hasSnils(person) ? ['snils'] : []),
      ],
    },
    arbitrationKontur: {
      canRun: hasFullName(person) && hasInn(person),
      missing: [
        ...getMissingFields(person, ['lastName', 'firstName', 'middleName']),
        ...(!hasInn(person) ? ['inn'] : []),
      ],
    },
    commercialActivityKontur: {
      canRun: hasFullName(person) && hasInn(person),
      missing: [
        ...getMissingFields(person, ['lastName', 'firstName', 'middleName']),
        ...(!hasInn(person) ? ['inn'] : []),
      ],
    },
    wantedKontur: {
      canRun: hasFullName(person) && hasBirthDate(person),
      missing: [
        ...getMissingFields(person, ['lastName', 'firstName', 'middleName']),
        ...(!hasBirthDate(person) ? ['birthDate'] : []),
      ],
    },
    rosfinKontur: {
      canRun: hasFullName(person) && hasBirthDate(person),
      missing: [
        ...getMissingFields(person, ['lastName', 'firstName', 'middleName']),
        ...(!hasBirthDate(person) ? ['birthDate'] : []),
      ],
    },
    bankruptcyKontur: {
      canRun: hasFullName(person) && hasBirthDate(person) && hasSnils(person) && hasInn(person),
      missing: [
        ...getMissingFields(person, ['lastName', 'firstName', 'middleName']),
        ...(!hasBirthDate(person) ? ['birthDate'] : []),
        ...(!hasSnils(person) ? ['snils'] : []),
        ...(!hasInn(person) ? ['inn'] : []),
      ],
    },
  };

  const runOrder = [];

  if (availability.courtsCommon.canRun) {
    runOrder.push('courtsCommon');
  }

  if (availability.fsspKontur.canRun) {
    runOrder.push('fsspKontur');
  }

  if (availability.snilsKontur.canRun) {
    runOrder.push('snilsKontur');
  }

  if (availability.arbitrationKontur.canRun) {
    runOrder.push('arbitrationKontur');
  }

  if (availability.commercialActivityKontur.canRun) {
    runOrder.push('commercialActivityKontur');
  }

  if (availability.wantedKontur.canRun) {
    runOrder.push('wantedKontur');
  }

  if (availability.rosfinKontur.canRun) {
    runOrder.push('rosfinKontur');
  }

  if (availability.bankruptcyKontur.canRun) {
    runOrder.push('bankruptcyKontur');
  }

  if (availability.passportKontur.canRun) {
    runOrder.push('passportKontur');
  }

  const skipped = {};

  if (!availability.courtsCommon.canRun) {
    skipped.courtsCommon = buildSkippedSource(
      'Проверка не запускалась: недостаточно данных (нужны фамилия, имя и отчество)',
      availability.courtsCommon.missing
    );
  }

  if (!availability.passportKontur.canRun) {
    skipped.passportKontur = buildSkippedSource(
      'Проверка не запускалась: не указаны дата рождения или паспортные реквизиты',
      availability.passportKontur.missing
    );
  }

  if (!availability.fsspKontur.canRun) {
    skipped.fsspKontur = buildSkippedSource(
      'Проверка не запускалась: не указана дата рождения',
      availability.fsspKontur.missing
    );
  }

  if (!availability.snilsKontur.canRun) {
    skipped.snilsKontur = buildSkippedSource(
      'Проверка не запускалась: не указаны дата рождения или СНИЛС',
      availability.snilsKontur.missing
    );
  }

  if (!availability.arbitrationKontur.canRun) {
    skipped.arbitrationKontur = buildSkippedSource(
      'Проверка не запускалась: не указан ИНН',
      availability.arbitrationKontur.missing
    );
  }

  if (!availability.commercialActivityKontur.canRun) {
    skipped.commercialActivityKontur = buildSkippedSource(
      'Проверка не запускалась: не указан ИНН',
      availability.commercialActivityKontur.missing
    );
  }

  if (!availability.wantedKontur.canRun) {
    skipped.wantedKontur = buildSkippedSource(
      'Проверка не запускалась: не указана дата рождения',
      availability.wantedKontur.missing
    );
  }

  if (!availability.bankruptcyKontur.canRun) {
    skipped.bankruptcyKontur = buildSkippedSource(
      'Проверка не запускалась. Для запуска проверки требуется, чтобы были указаны: дата рождения, СНИЛС и ИНН!',
      availability.bankruptcyKontur.missing
    );
  }

  return {
    availability,
    subjects: {
      basicNeeded: availability.courtsCommon.canRun || availability.arbitrationKontur.canRun || availability.commercialActivityKontur.canRun,
      extendedNeeded:
        availability.passportKontur.canRun ||
        availability.fsspKontur.canRun ||
        availability.snilsKontur.canRun ||
        availability.wantedKontur.canRun ||
        availability.bankruptcyKontur.canRun ||
        availability.rosfinKontur.canRun,
        
    },
    runOrder,
    skipped,
    meta: {
      hasAnyRunnableChecks: runOrder.length > 0,
      hasOnlySkippedChecks: runOrder.length === 0,
    },
  };
}

function buildKonturScenarioInput(person, existingKontur, scenarioKey) {
  const scenarioMeta = existingKontur?.checks?.[scenarioKey] || {};

  return {
    ...person,
    _kontur: {
      ...(existingKontur || {}),
      subjectId:
        scenarioMeta.subjectId ||
        existingKontur?.subjectId ||
        null,
      checks: {
        ...(existingKontur?.checks || {}),
      },
    },
  };
}

function mergeKonturMeta(meta, sourceMeta) {
  if (!sourceMeta || typeof sourceMeta !== 'object') return;

  const { _kontur, ...rest } = sourceMeta;

  Object.assign(meta, rest);

  if (_kontur && typeof _kontur === 'object') {
    const prevKontur = meta._kontur || {};

    meta._kontur = {
      ...prevKontur,
      ..._kontur,
      checks: {
        ...(prevKontur.checks || {}),
        ...(_kontur.checks || {}),
      },
    };
  }
}

function syncKonturMetaCheckStates(meta, sources) {
  if (!meta?._kontur?.checks || !sources || typeof sources !== 'object') return;

  const scenarioMap = [
    ['courtsCommon', 'courts'],
    ['passportKontur', 'passport'],
    ['fsspKontur', 'fssp'],
    ['snilsKontur', 'snils'],
    ['arbitrationKontur', 'arbitration'],
    ['commercialActivityKontur', 'commercialActivity'],
    ['wantedKontur', 'wanted'],
    ['bankruptcyKontur', 'bankruptcy'],
    ['rosfinKontur', 'rosfinmonitoring'],
  ];

  for (const [sourceKey, scenarioKey] of scenarioMap) {
    const source = sources[sourceKey];
    const currentCheck = meta._kontur.checks?.[scenarioKey];

    if (!source || !currentCheck) continue;

    const nextState =
      source?.raw?.checkState ||
      source?.raw?.fullResponse?.checkState ||
      source?.raw?.response?.checkState ||
      source?.meta?._kontur?.checks?.[scenarioKey]?.checkState ||
      (source?.status === 'error'
        ? 'Error'
        : source?.status === 'processing'
        ? 'Processing'
        : source?.status === 'ok' || source?.status === 'empty'
        ? 'Processed'
        : null);

    if (!nextState) continue;

    meta._kontur.checks[scenarioKey] = {
      ...currentCheck,
      checkState: nextState,
    };
  }
}

const APICLOUD_SELECTIVE_SOURCES = [
  'mvdPassport',
  'mvdWanted',
  'stopOperRS',
  'fssp',
  'efrsb',
  'rosfin',
  'arbitrationApiCloudCombined',
  'fns',
  'inoagent',
];

const KONTUR_SELECTIVE_SOURCES = [
  'courtsCommon',
  'passportKontur',
  'fsspKontur',
  'snilsKontur',
  'arbitrationKontur',
  'commercialActivityKontur',
  'wantedKontur',
  'bankruptcyKontur',
  'rosfinKontur',
];

const SELECTIVE_SOURCE_KEYS = [
  ...APICLOUD_SELECTIVE_SOURCES,
  ...KONTUR_SELECTIVE_SOURCES,
];

function normalizeSelectedSourcesForRun(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((item) => String(item || '').trim())
      .filter((item) => SELECTIVE_SOURCE_KEYS.includes(item))
  )];
}

function buildNotSelectedSource(provider) {
  return buildSkippedSource('Источник не запускался: не выбран в выборочной проверке', [], provider);
}

const KONTUR_RUNNERS = {
  courtsCommon: {
    scenarioKey: 'courts',
    run: checkCourtsCommon,
  },
  passportKontur: {
    scenarioKey: 'passport',
    run: passportKontur,
  },
  fsspKontur: {
    scenarioKey: 'fssp',
    run: fsspKontur,
  },
  snilsKontur: {
    scenarioKey: 'snils',
    run: snilsKontur,
  },
  arbitrationKontur: {
    scenarioKey: 'arbitration',
    run: arbitrationKontur,
  },
  commercialActivityKontur: {
    scenarioKey: 'commercialActivity',
    run: commercialActivityKontur,
  },
  wantedKontur: {
    scenarioKey: 'wanted',
    run: wantedKontur,
  },
  bankruptcyKontur: {
    scenarioKey: 'bankruptcy',
    run: bankruptcyKontur,
  },
  rosfinKontur: {
    scenarioKey: 'rosfinmonitoring',
    run: rosfinKontur,
  },
};

function buildKonturTaskErrorSource(sourceKey, scenarioKey, err) {
  return {
    status: 'error',
    provider: 'kontur',
    error: err?.message || 'Ошибка при выполнении проверки Контура',
    items: [],
    raw: {
      step: 'kontur_parallel_task_error',
      sourceKey,
      scenarioKey,
      message: err?.message || null,
      stack: process.env.NODE_ENV === 'development' ? err?.stack || null : null,
    },
  };
}

async function runKonturSourceTask(sourceKey, normalized, existingKontur, sourceOptions = {}) {
  const config = KONTUR_RUNNERS[sourceKey];

  if (!config) {
    return [
      sourceKey,
      buildKonturTaskErrorSource(
        sourceKey,
        null,
        new Error(`Unknown Kontur source: ${sourceKey}`)
      ),
    ];
  }

  try {
    const input = buildKonturScenarioInput(
      normalized,
      existingKontur,
      config.scenarioKey
    );

    const result = await config.run(input, sourceOptions);

    return [sourceKey, result];
  } catch (err) {
    console.error('[kontur][parallel] task error', {
      sourceKey,
      scenarioKey: config.scenarioKey,
      message: err?.message || null,
    });

    return [
      sourceKey,
      buildKonturTaskErrorSource(sourceKey, config.scenarioKey, err),
    ];
  }
}

async function runKonturSourceTasks(sourceKeys = [], normalized, existingKontur, sourceOptions = {}) {
  const safeKeys = Array.isArray(sourceKeys) ? sourceKeys.filter(Boolean) : [];

  const entries = await Promise.all(
    safeKeys.map((sourceKey) =>
      runKonturSourceTask(sourceKey, normalized, existingKontur, sourceOptions)
    )
  );

  return Object.fromEntries(entries);
}

const APICLOUD_RUNNERS = {
  mvdPassport: checkMvdPassport,
  mvdWanted: checkMvdWanted,
  stopOperRS: checkStopOperRS,
  fssp: checkFssp,
  efrsb: checkEfrsb,
  rosfin: checkRosfin,
  inoagent: checkInoagent,
  fns: checkFns,
  kad: checkKad,
  rasArbitr: checkRasArbitr,
};

const APICLOUD_DIRECT_RUN_ORDER = [
  'mvdPassport',
  'mvdWanted',
  'stopOperRS',
  'fssp',
  'efrsb',
  'rosfin',
  'inoagent',
  'kad',
  'rasArbitr',
  'fns',
];

const REUSABLE_SOURCE_STATUSES = new Set([
  'ok',
  'empty',
  'error',
  'skipped',
]);

function getPreviousSources(sourceOptions = {}) {
  if (sourceOptions.previousSources && typeof sourceOptions.previousSources === 'object') {
    return sourceOptions.previousSources;
  }

  if (
    sourceOptions.previousResult?.sources &&
    typeof sourceOptions.previousResult.sources === 'object'
  ) {
    return sourceOptions.previousResult.sources;
  }

  return {};
}

function canReusePreviousSource(source) {
  return (
    source &&
    typeof source === 'object' &&
    REUSABLE_SOURCE_STATUSES.has(source.status)
  );
}

function getReusablePreviousSource(previousSources = {}, sourceKey) {
  const source = previousSources?.[sourceKey];

  if (!canReusePreviousSource(source)) {
    return null;
  }

  return source;
}

function buildApiCloudTaskErrorSource(sourceKey, err) {
  return {
    status: 'error',
    provider: 'apicloud',
    error: err?.message || 'Ошибка при выполнении источника API-cloud',
    items: [],
    raw: {
      step: 'apicloud_parallel_task_error',
      sourceKey,
      message: err?.message || null,
      stack: process.env.NODE_ENV === 'development' ? err?.stack || null : null,
    },
  };
}

async function runApiCloudSourceTask(sourceKey, normalized, sourceOptions = {}) {
  const runner = APICLOUD_RUNNERS[sourceKey];

  if (!runner) {
    return [
      sourceKey,
      buildApiCloudTaskErrorSource(
        sourceKey,
        new Error(`Unknown API-cloud source: ${sourceKey}`)
      ),
    ];
  }

  try {
    const result = await runner(normalized, sourceOptions);
    return [sourceKey, result];
  } catch (err) {
    console.error('[apicloud][parallel] task error', {
      sourceKey,
      message: err?.message || null,
    });

    return [sourceKey, buildApiCloudTaskErrorSource(sourceKey, err)];
  }
}

async function runApiCloudSourceTasks(sourceKeys = [], normalized, sourceOptions = {}) {
  const safeKeys = Array.isArray(sourceKeys) ? sourceKeys.filter(Boolean) : [];

  const entries = await Promise.all(
    safeKeys.map((sourceKey) =>
      runApiCloudSourceTask(sourceKey, normalized, sourceOptions)
    )
  );

  return Object.fromEntries(entries);
}

async function runApiCloudSources(normalized, sourceOptions = {}) {
  const previousSources = getPreviousSources(sourceOptions);
  const apiCloudSources = {};

  for (const sourceKey of APICLOUD_DIRECT_RUN_ORDER) {
    const reusableSource = getReusablePreviousSource(previousSources, sourceKey);

    if (reusableSource) {
      apiCloudSources[sourceKey] = reusableSource;
    }
  }

  const sourceKeysToRun = APICLOUD_DIRECT_RUN_ORDER.filter(
    (sourceKey) => !apiCloudSources[sourceKey]
  );

  const freshSources = await runApiCloudSourceTasks(
    sourceKeysToRun,
    normalized,
    sourceOptions
  );

  Object.assign(apiCloudSources, freshSources);

  const reusableCombined = getReusablePreviousSource(
    previousSources,
    'arbitrationApiCloudCombined'
  );

  if (reusableCombined) {
    apiCloudSources.arbitrationApiCloudCombined = reusableCombined;
  } else if (apiCloudSources.kad || apiCloudSources.rasArbitr) {
    apiCloudSources.arbitrationApiCloudCombined = buildArbitrationApiCloudCombined(
      normalized,
      apiCloudSources.kad || {},
      apiCloudSources.rasArbitr || {}
    );
  }

  return apiCloudSources;
}

async function runSelectedApiCloudSources(normalized, selectedSet, sourceOptions = {}) {
  const previousSources = getPreviousSources(sourceOptions);
  const sources = {};

  for (const key of APICLOUD_SELECTIVE_SOURCES) {
    sources[key] = buildNotSelectedSource('apicloud');
  }

  const directSelectedKeys = APICLOUD_SELECTIVE_SOURCES.filter(
    (key) => selectedSet.has(key) && key !== 'arbitrationApiCloudCombined'
  );

  const directKeysToRun = [];

  for (const sourceKey of directSelectedKeys) {
    const reusableSource = getReusablePreviousSource(previousSources, sourceKey);

    if (reusableSource) {
      sources[sourceKey] = reusableSource;
    } else {
      directKeysToRun.push(sourceKey);
    }
  }

  const finishedDirectSources = await runApiCloudSourceTasks(
    directKeysToRun,
    normalized,
    sourceOptions
  );

  Object.assign(sources, finishedDirectSources);

  if (selectedSet.has('arbitrationApiCloudCombined')) {
    const reusableCombined = getReusablePreviousSource(
      previousSources,
      'arbitrationApiCloudCombined'
    );

    if (reusableCombined) {
      sources.arbitrationApiCloudCombined = reusableCombined;
      return sources;
    }

    const arbitrationParts = {};

    const reusableKad = getReusablePreviousSource(previousSources, 'kad');
    const reusableRas = getReusablePreviousSource(previousSources, 'rasArbitr');

    if (reusableKad) {
      arbitrationParts.kad = reusableKad;
    }

    if (reusableRas) {
      arbitrationParts.rasArbitr = reusableRas;
    }

    const arbitrationKeysToRun = ['kad', 'rasArbitr'].filter(
      (key) => !arbitrationParts[key]
    );

    const freshArbitrationParts = await runApiCloudSourceTasks(
      arbitrationKeysToRun,
      normalized,
      sourceOptions
    );

    Object.assign(arbitrationParts, freshArbitrationParts);

    sources.arbitrationApiCloudCombined = buildArbitrationApiCloudCombined(
      normalized,
      arbitrationParts.kad || {},
      arbitrationParts.rasArbitr || {}
    );
  }

  return sources;
}

async function runKonturSources(normalized, sourceOptions = {}) {
  const existingKontur = normalized?._kontur || {};
  const konturPlan = buildKonturPlan(normalized);

  if (!konturPlan.meta.hasAnyRunnableChecks) {
    return {
      courtsCommon: konturPlan.skipped.courtsCommon,
      passportKontur: konturPlan.skipped.passportKontur,
      fsspKontur: konturPlan.skipped.fsspKontur,
      snilsKontur: konturPlan.skipped.snilsKontur,
      arbitrationKontur: konturPlan.skipped.arbitrationKontur,
      commercialActivityKontur: konturPlan.skipped.commercialActivityKontur,
      wantedKontur: konturPlan.skipped.wantedKontur,
      bankruptcyKontur: konturPlan.skipped.bankruptcyKontur,
      rosfinKontur: konturPlan.skipped.rosfinKontur,
    };
  }

  const konturSources = {
    courtsCommon: konturPlan.skipped.courtsCommon,
    passportKontur: konturPlan.skipped.passportKontur,
    fsspKontur: konturPlan.skipped.fsspKontur,
    snilsKontur: konturPlan.skipped.snilsKontur,
    arbitrationKontur: konturPlan.skipped.arbitrationKontur,
    commercialActivityKontur: konturPlan.skipped.commercialActivityKontur,
    wantedKontur: konturPlan.skipped.wantedKontur,
    bankruptcyKontur: konturPlan.skipped.bankruptcyKontur,
    rosfinKontur: konturPlan.skipped.rosfinKontur,
  };

  const finishedKonturSources = await runKonturSourceTasks(
    konturPlan.runOrder,
    normalized,
    existingKontur,
    sourceOptions
  );

  return {
    ...konturSources,
    ...finishedKonturSources,
  };
}

async function runSelectedKonturSources(normalized, selectedSet, sourceOptions = {}) {
  const existingKontur = normalized?._kontur || {};
  const konturPlan = buildKonturPlan(normalized);

  const konturSources = {};

  for (const key of KONTUR_SELECTIVE_SOURCES) {
    konturSources[key] = selectedSet.has(key)
      ? konturPlan.skipped[key] || buildSkippedSource('Проверка не запускалась: недостаточно данных', [], 'kontur')
      : buildNotSelectedSource('kontur');
  }

  const runnableSelectedKeys = KONTUR_SELECTIVE_SOURCES.filter(
    (key) => selectedSet.has(key) && konturPlan.availability?.[key]?.canRun
  );

  const finishedKonturSources = await runKonturSourceTasks(
    runnableSelectedKeys,
    normalized,
    existingKontur,
    sourceOptions
  );

  return {
    ...konturSources,
    ...finishedKonturSources,
  };
}

async function checkPerson(personInput, options = {}) {
  const normalized = normalizePersonInput(personInput);

  if (personInput && personInput._kontur) {
    normalized._kontur = personInput._kontur;
  }

  const providerMode =
    options.providerMode ||
    options.provider ||
    'apicloud';

  let sources = {};

  if (providerMode === 'selective') {
    const selectedSources = normalizeSelectedSourcesForRun(
      options.selectedSources || personInput?.selectedSources || []
    );

    const selectedSet = new Set(selectedSources);

    const [apiCloudSources, konturSources] = await Promise.all([
      runSelectedApiCloudSources(normalized, selectedSet, {
        enableFallback: false,
        provider: 'apicloud',
        previousResult: options.previousResult,
      }),
      runSelectedKonturSources(normalized, selectedSet, {
        enableFallback: false,
        provider: 'kontur',
      }),
    ]);

    sources = {
      ...apiCloudSources,
      ...konturSources,
    };

  } else if (providerMode === 'kontur') {
    sources = await runKonturSources(normalized, {
      enableFallback: false,
      provider: 'kontur',
    });

  } else if (providerMode === 'both') {
    const [apiCloudSources, konturSources] = await Promise.all([
      runApiCloudSources(normalized, {
        enableFallback: false,
        provider: 'apicloud',
        previousResult: options.previousResult,
      }),
      runKonturSources(normalized, {
        enableFallback: false,
        provider: 'kontur',
      }),
    ]);

    sources = {
      ...apiCloudSources,
      ...konturSources,
    };
  } else {
    sources = await runApiCloudSources(normalized, {
      enableFallback: options.enableFallback,
      provider: 'apicloud',
      previousResult: options.previousResult,
    });
  }
    
  
  const score = calculateScore(sources);
   
  const aggregated = mapAggregatedResult(normalized, sources, score);
  const createdAt = new Date().toISOString();

  const meta = {};

  const konturMetaSources = [
    sources?.courtsCommon?.meta,
    sources?.passportKontur?.meta,
    sources?.fsspKontur?.meta,
    sources?.snilsKontur?.meta,
    sources?.arbitrationKontur?.meta,
    sources?.commercialActivityKontur?.meta,
    sources?.wantedKontur?.meta,
    sources?.bankruptcyKontur?.meta,
    sources?.rosfinKontur?.meta,
  ];

  for (const sourceMeta of konturMetaSources) {
    mergeKonturMeta(meta, sourceMeta);
  }

  syncKonturMetaCheckStates(meta, sources);

  return {
    ...aggregated,
    ...(Object.keys(meta).length ? { meta } : {}),
    createdAt,
  };
}

module.exports = checkPerson;
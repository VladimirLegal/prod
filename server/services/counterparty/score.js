const LEGACY_NEUTRAL_SOURCE_KEYS = new Set([
  'commercialActivityKontur',
  'commercialActivityApiCloud',
  'legalEntityParticipationApiCloud',
]);

function isRiskRelevantSource(sourceKey, source) {
  if (!source || typeof source !== 'object') {
    return false;
  }

  if (source.affectsRisk === false) {
    return false;
  }

  if (LEGACY_NEUTRAL_SOURCE_KEYS.has(sourceKey)) {
    return false;
  }

  return true;
}

function calculateScore(sources = {}) {
  const entries = Object.entries(sources || {})
    .filter(([sourceKey, source]) =>
      isRiskRelevantSource(sourceKey, source)
    )
    .map(([, source]) => source);

  const hasErrors = entries.some(
    (source) => source?.status === 'error'
  );

  const hasFindings = entries.some(
    (source) =>
      Array.isArray(source?.items) &&
      source.items.length > 0
  );

  let riskLevel = 'green';
  let score = 0;
  const reasons = [];

  if (hasErrors) {
    riskLevel = 'yellow';
    reasons.push(
      'Часть источников, влияющих на оценку риска, недоступна. Требуется перепроверка.'
    );
  }

  if (hasFindings) {
    riskLevel = hasErrors ? 'red' : 'yellow';
    score = 60;
    reasons.push(
      'Есть записи в источниках, влияющих на оценку риска.'
    );
  }

  if (!hasFindings && !hasErrors) {
    score = 10;
    reasons.push(
      'Негативных сведений в источниках, влияющих на оценку риска, не найдено.'
    );
  }

  return {
    riskLevel,
    score,
    reasons,
  };
}

module.exports = {
  calculateScore,
};
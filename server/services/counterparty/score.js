function calculateScore(sources = {}) {
  const entries = Object.values(sources || {});
  const hasErrors = entries.some((s) => s && s.status === 'error');
  const hasFindings = entries.some((s) => Array.isArray(s?.items) && s.items.length > 0);

  let riskLevel = 'green';
  let score = 0;
  const reasons = [];

  if (hasErrors) {
    riskLevel = 'yellow';
    reasons.push('Часть источников недоступна, требуется перепроверка.');
  }
  if (hasFindings) {
    riskLevel = hasErrors ? 'red' : 'yellow';
    score = 60;
    reasons.push('Есть записи в подключенных источниках.');
  }
  if (!hasFindings && !hasErrors) {
    score = 10;
    reasons.push('Совпадений в подключенных источниках не найдено.');
  }

  return { riskLevel, score, reasons };
}

module.exports = { calculateScore };
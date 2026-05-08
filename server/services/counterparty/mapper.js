function translateSourceStatus(status) {
  const map = {
    ok: 'данные получены',
    empty: 'записей по базе нет',
    error: 'ошибка при запросе',
    processing: 'проверка выполняется',
    skipped: 'не запускалась',
  };

  return map[status] || status || '—';
}

function enrichSourcesWithStatusText(sources = {}) {
  return Object.fromEntries(
    Object.entries(sources || {}).map(([key, value]) => {
      if (!value || typeof value !== 'object') {
        return [key, value];
      }

      return [
        key,
        {
          ...value,
          statusText: translateSourceStatus(value.status),
        },
      ];
    })
  );
}

function mapAggregatedResult(person, sources, score) {
  const enrichedSources = enrichSourcesWithStatusText(sources);

  const providerSummary = Object.values(enrichedSources || {}).reduce(
    (acc, s) => {
      if (!s) return acc;
      const provider = s.provider || 'unknown';
      acc[provider] = (acc[provider] || 0) + 1;
      return acc;
    },
    {}
  );

  return {
    subject: person,
    score,
    sources: enrichedSources,
    providerSummary,
  };
}

module.exports = { mapAggregatedResult };
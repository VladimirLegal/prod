function mapAggregatedResult(person, sources, score) {
  const providerSummary = Object.values(sources || {}).reduce(
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
    sources,
    providerSummary,
  };
}

module.exports = { mapAggregatedResult };
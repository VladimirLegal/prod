import { SELECTIVE_SOURCE_GROUPS, toggleSelectedSources } from './CounterpartyCheckPage';

describe('commercial activity API-cloud selection', () => {
  const apiCloud = SELECTIVE_SOURCE_GROUPS.find((group) => group.title === 'API-cloud').sources;

  test('is offered after participation, unselected by default, with a paid-request hint', () => {
    const participation = apiCloud.findIndex((source) => source.key === 'legalEntityParticipationApiCloud');
    expect(apiCloud[participation + 1]).toEqual(expect.objectContaining({
      key: 'commercialActivityApiCloud',
      label: 'Коммерческая деятельность связанных организаций (API-cloud)',
      hint: expect.stringContaining('платные запросы KAD'),
    }));
    expect([]).not.toContain('commercialActivityApiCloud');
  });

  test('selects its prerequisite, preserves order and never duplicates sources', () => {
    const selected = toggleSelectedSources([], 'commercialActivityApiCloud');
    expect(selected).toEqual(['legalEntityParticipationApiCloud', 'commercialActivityApiCloud']);
    expect(new Set(selected).size).toBe(selected.length);
    expect(toggleSelectedSources(selected, 'legalEntityParticipationApiCloud')).toEqual([]);
  });

  test('participation alone does not enable commercial activity', () => {
    expect(toggleSelectedSources([], 'legalEntityParticipationApiCloud'))
      .toEqual(['legalEntityParticipationApiCloud']);
  });

  test('API-cloud and both modes include every configured API-cloud source', () => {
    const keys = apiCloud.map((source) => source.key);
    expect(keys).toContain('commercialActivityApiCloud');
    expect(keys.filter((key) => key === 'commercialActivityApiCloud')).toHaveLength(1);
  });
});

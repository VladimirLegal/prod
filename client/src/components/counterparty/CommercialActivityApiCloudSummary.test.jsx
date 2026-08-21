import React from 'react';
import { render, screen } from '@testing-library/react';
import CommercialActivityApiCloudSummary from './CommercialActivityApiCloudSummary';

const makeSource = () => ({
  summary: { kadCaseInfoErrorCases: 0 },
  analysis: {
    version: 1,
    coverage: { uniqueCasesCount: 188, caseInfo: { failedCasesCount: 0 } },
    litigation: {
      summary: { respondent: 157, plaintiff: 31, active: 8, finished: 151, unknownState: 29, bankruptcy: 14 },
      declaredClaims: {
        respondent: { latestClaimsTotal: 730850872.42, casesWithAmount: 100, casesWithoutAmount: 57 },
        plaintiff: { latestClaimsTotal: 0, casesWithAmount: 20, casesWithoutAmount: 11 },
        message: 'Суммы KAD — заявленные требования, а не задолженность.',
      },
    },
    enforcement: { summary: { activeCount: 4, activeAmount: 999999 }, creditorMatches: [{}, {}, {}] },
    accountRestrictions: { organizationsCount: 2, decisionsCount: 4, organizationsWithNegativeEns: 1, negativeEnsTotal: 1200 },
    insolvency: { organizationsWithRecords: 2, activeRecords: 1 },
    patterns: {
      summary: { recurringCreditorsCount: 28, recurringRespondentsCount: 9, repeatedCasesCount: 7, internalGroupCasesCount: 2 },
      repeatedClaimSeries: [{ raw: 'raw' }], repeatedAmounts: [{ documents: [] }], sharedCourtAddresses: [{}],
    },
  },
  items: [{ raw: 'raw', documents: [], instances: [], participants: [], claimSumEvents: [], instanceEvents: [], subjectItems: [] }],
});

describe('CommercialActivityApiCloudSummary', () => {
  test('shows the concise analysis without organization duplicates or technical details', () => {
    const source = makeSource();
    const active = source.analysis.litigation.summary.active;
    const finished = source.analysis.litigation.summary.finished;
    const unknown = source.analysis.litigation.summary.unknownState;
    expect(active + finished + unknown).toBe(source.analysis.coverage.uniqueCasesCount);

    render(<CommercialActivityApiCloudSummary source={source} />);

    expect(screen.getByText('188')).toBeInTheDocument();
    expect(screen.getByText('157')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.getByText(/8 активных/)).toBeInTheDocument();
    expect(screen.getByText(/151 завершённое/)).toBeInTheDocument();
    expect(screen.getByText(/29 с неопределённым статусом/)).toBeInTheDocument();
    expect(screen.getByText(/730\s850\s872,42 ₽/)).toBeInTheDocument();
    expect(screen.getByText('0,00 ₽')).toBeInTheDocument();
    expect(screen.getByText(/заявленные требования, а не задолженность/)).toBeInTheDocument();
    expect(screen.getByText('Активных производств ФССП')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('Совпадения кредитора KAD и взыскателя ФССП')).toBeInTheDocument();

    ['Количество связанных организаций', 'Количество действующих организаций', 'Текущая задолженность ФССП',
      'Серии «кредитор + сумма»', 'Группы одинаковых сумм', 'Совпадающие судебные адреса',
      'eligibleCasesCount', 'requestedCasesCount', 'loadedCasesCount', 'raw', 'documents', 'instances',
      'participants', 'claimSumEvents', 'instanceEvents', 'subjectItems'].forEach((text) => {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    });
  });

  test('uses pattern arrays when patterns.summary is absent', () => {
    const source = makeSource();
    delete source.analysis.patterns.summary;
    source.analysis.patterns.recurringCreditors = [{}, {}];
    source.analysis.patterns.recurringDefendants = [{}];
    source.analysis.patterns.repeatedCases = [{}, {}, {}];
    source.analysis.patterns.internalGroupCases = [{}, {}, {}, {}];
    render(<CommercialActivityApiCloudSummary source={source} />);
    expect(screen.getByText('Повторяющиеся кредиторы').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Повторяющиеся дела').nextSibling).toHaveTextContent('3');
    expect(screen.getByText('Дела между связанными организациями').nextSibling).toHaveTextContent('4');
  });

  test('renders the legacy summary when analysis is absent', () => {
    render(<CommercialActivityApiCloudSummary source={{ summary: {
      totalArbitrationCases: 12, totalBankruptcyCases: 2, activeEnforcementProceedings: 3,
      totalAccountRestrictions: 4, withNegativeEnsBalanceCount: 5,
    } }} />);
    expect(screen.getByText(/Расширенная аналитика недоступна/)).toBeInTheDocument();
    expect(screen.getByText('Всего арбитражных дел')).toBeInTheDocument();
    expect(screen.getByText('Активных производств ФССП')).toBeInTheDocument();
  });

  test('handles an empty contract', () => {
    expect(() => render(<CommercialActivityApiCloudSummary />)).not.toThrow();
    expect(screen.getByText(/Расширенная аналитика недоступна/)).toBeInTheDocument();
  });

  test('shows only a generic caseInfo warning and does not fetch or mutate source', () => {
    const source = makeSource();
    source.analysis.coverage.caseInfo.failedCasesCount = 6;
    const snapshot = JSON.parse(JSON.stringify(source));
    const fetchSpy = jest.spyOn(global, 'fetch');
    render(<CommercialActivityApiCloudSummary source={source} />);
    expect(screen.getByText(/По части дел подробные сведения KAD недоступны/)).toBeInTheDocument();
    expect(screen.queryByText('6')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(source).toEqual(snapshot);
    fetchSpy.mockRestore();
  });
});

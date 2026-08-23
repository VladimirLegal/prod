import React from 'react';
import { render, screen } from '@testing-library/react';
import CommercialActivityApiCloudSummary from './CommercialActivityApiCloudSummary';

const group = (casesCount, latestClaimsTotal) => ({ casesCount, casesWithAmount: casesCount,
  casesWithoutAmount: 0, latestClaimsTotal });
const makeSource = () => ({ summary: { kadCaseInfoErrorCases: 0 }, analysis: {
  coverage: { caseInfo: { failedCasesCount: 0, skippedByLimitCasesCount: 0 } },
  litigation: { summary: { active: 8, finished: 151, unknownState: 29 }, declaredClaims: {
    respondent: { latestClaimsTotal: 730850872.42 }, plaintiff: { latestClaimsTotal: 92733051.86 },
    exposure: { active: group(5, 100.1), unknownState: group(3, 200.2), finished: group(99, 999999),
      bankruptcy: { active: group(1, 50), unknownState: group(2, 60), finished: group(5, 700) } },
  } },
  enforcement: { summary: { activeCount: 4, activeMonetaryCount: 2, activeNonMonetaryCount: 2,
    activeAmount: 2749354.26, closedCount: 8, closedAmount: 888888 } },
  accountRestrictions: { organizationsCount: 2, decisionsCount: 4, organizationsWithNegativeEns: 1, negativeEnsTotal: 1200 },
  insolvency: { organizationsWithRecords: 9, activeRecords: 1, finishedRecords: 8 },
  patterns: { summary: { recurringCreditorsCount: 28 } },
} });

describe('CommercialActivityApiCloudSummary', () => {
  test('shows only compact current risks with status-specific KAD and FSSP values', () => {
    render(<CommercialActivityApiCloudSummary source={makeSource()} />);
    expect(screen.getByText(/8 активных · 151 завершённых · 29 со статусом/)).toBeInTheDocument();
    expect(screen.getByText('Заявленные требования по активным делам').nextSibling).toHaveTextContent(/100,10 ₽/);
    expect(screen.getByText('Заявленные требования по делам с неопределённым статусом').nextSibling).toHaveTextContent(/200,20 ₽/);
    expect(screen.getByText('Активные банкротные дела должников').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Активные исполнительные производства').nextSibling).toHaveTextContent('4');
    expect(screen.getByText('Денежные исполнительные производства').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Сумма по активным денежным производствам ФССП').nextSibling)
      .toHaveTextContent(/2\s210\s747,30 ₽/);
    expect(screen.getByText('Неденежные исполнительные производства').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Производства без определённой суммы').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Действующие решения о приостановлении операций').nextSibling).toHaveTextContent('4');
    expect(screen.getByText('Общая сумма отрицательного сальдо ЕНС').nextSibling).toHaveTextContent(/1\s200,00 ₽/);
    expect(screen.getByText('Действующие записи ЕФРСБ').nextSibling).toHaveTextContent('1');
    ['730 850 872,42 ₽', '92 733 051,86 ₽', '999 999 ₽', '888 888 ₽',
      'Выявленные связи и повторяемость', 'Дел с суммой / без суммы', 'Детали KAD загружены',
      'Организаций со сведениями ЕФРСБ'].forEach((value) => expect(screen.queryByText(value)).not.toBeInTheDocument());
  });

  test('renders every metric as one vertical table row with its value in the right cell', () => {
    const { container } = render(<CommercialActivityApiCloudSummary source={makeSource()} />);
    const sectionsWrapper = screen.getByText('Судебные дела').closest('section').parentElement;
    expect(sectionsWrapper).toHaveClass('space-y-3');
    expect(sectionsWrapper).not.toHaveClass('md:grid-cols-2', 'lg:grid-cols-2');

    const label = screen.getByText('Активные исполнительные производства');
    const row = label.closest('tr');
    expect(row).toBeInTheDocument();
    expect(row.querySelectorAll('th, td')).toHaveLength(2);
    expect(row.querySelector('th')).toHaveTextContent('Активные исполнительные производства');
    expect(row.querySelector('td')).toHaveTextContent('4');
    expect(row.querySelector('td')).toHaveClass('text-right', 'whitespace-nowrap');
    expect(container.querySelectorAll('dl.grid, table.grid')).toHaveLength(0);
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(18);

    const monetary = Number(screen.getByText('Денежные исполнительные производства').nextSibling.textContent);
    const nonMonetary = Number(screen.getByText('Неденежные исполнительные производства').nextSibling.textContent);
    const unknownAmount = Number(screen.getByText('Производства без определённой суммы').nextSibling.textContent);
    expect(monetary + nonMonetary + unknownAmount).toBe(4);
  });

  test('does not use a legacy aggregate as active KAD exposure and tolerates missing fields', () => {
    const source = { analysis: { litigation: { declaredClaims: { respondent: { latestClaimsTotal: 123456 } } } } };
    expect(() => render(<CommercialActivityApiCloudSummary source={source} />)).not.toThrow();
    expect(screen.getByText('Заявленные требования по активным делам').nextSibling).toHaveTextContent('—');
    expect(screen.queryByText(/123\s456/)).not.toBeInTheDocument()
  });

  test('preserves known zero and works without analysis', () => {
    const source = makeSource(); source.analysis.litigation.declaredClaims.exposure.active = group(0, 0);
    render(<CommercialActivityApiCloudSummary source={source} />);
    expect(screen.getByText('Заявленные требования по активным делам').nextSibling).toHaveTextContent('0,00 ₽');
    expect(() => render(<CommercialActivityApiCloudSummary />)).not.toThrow();
  });

  test('shows a user-facing warning only for errors or limits and does not fetch or mutate', () => {
    const source = makeSource(); source.analysis.coverage.caseInfo.failedCasesCount = 1;
    const snapshot = JSON.parse(JSON.stringify(source));
    const fetchSpy = jest.spyOn(global, 'fetch');
    render(<CommercialActivityApiCloudSummary source={source} />);
    expect(screen.getByText('По части дел статус или подробные сведения KAD не подтверждены.')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled(); expect(source).toEqual(snapshot); fetchSpy.mockRestore();
  });
});

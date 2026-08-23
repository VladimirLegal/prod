import React from 'react';

const display = (value) => value === null || value === undefined || value === '' ? '—' : value;
const money = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return `${parsed.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`;
};

function Metrics({ rows }) {
  return <table className="w-full table-auto text-xs">
    <tbody className="divide-y divide-gray-200">
      {rows.map(([label, value]) => <tr key={label}>
        <th scope="row" className="py-1.5 pr-3 text-left font-normal text-gray-600">{label}</th>
        <td className="whitespace-nowrap py-1.5 text-right font-semibold text-gray-900">{display(value)}</td>
      </tr>)}
    </tbody>
  </table>;
}

const positive = (value) => Number(value) > 0;

export default function CommercialActivityApiCloudSummary({ source = {} }) {
  const analysis = source?.analysis || {};
  const summary = source?.summary || {};
  const litigation = analysis.litigation || {};
  const states = litigation.summary || {};
  const exposure = litigation.declaredClaims?.exposure;
  const active = exposure?.active || {};
  const unknown = exposure?.unknownState || {};
  const bankruptcyActive = exposure?.bankruptcy?.active || {};
  const bankruptcyUnknown = exposure?.bankruptcy?.unknownState || {};
  const enforcement = analysis.enforcement?.summary || {};
  const restrictions = analysis.accountRestrictions || {};
  const insolvency = analysis.insolvency || {};
  const incompleteKad = positive(analysis.coverage?.caseInfo?.failedCasesCount) ||
    positive(analysis.coverage?.caseInfo?.skippedByLimitCasesCount) || positive(summary.kadCaseInfoErrorCases);
  const badges = [
    [positive(states.active), 'Есть активные судебные дела'],
    [positive(enforcement.activeCount), 'Есть активные исполнительные производства'],
    [positive(restrictions.organizationsCount), 'Есть ограничения по счетам'],
    [positive(restrictions.organizationsWithNegativeEns), 'Выявлено отрицательное сальдо ЕНС'],
    [positive(bankruptcyActive.casesCount) || positive(insolvency.activeRecords), 'Есть действующие сведения о банкротстве'],
    [incompleteKad, 'Сведения KAD частично не подтверждены'],
  ].filter(([shown]) => shown);

  return <div className="space-y-3">
    {badges.length > 0 && <div className="flex flex-wrap gap-2">{badges.map(([, label]) =>
      <span key={label} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">{label}</span>)}</div>}
    <div className="space-y-3">
      <section className="rounded-xl bg-slate-50 p-3">
        <h4 className="text-sm font-semibold text-gray-900">Судебные дела</h4>
        <p className="my-2 text-xs text-gray-700">{display(states.active)} активных · {display(states.finished)} завершённых · {display(states.unknownState)} со статусом, который не удалось определить</p>
        <Metrics rows={[
          ['Всего активных судебных дел', states.active],
          ['Активные дела ответчиков', exposure ? active.casesCount : null],
          ['Заявленные требования по активным делам', exposure ? money(active.latestClaimsTotal) : null],
          ['Дела ответчиков с неопределённым статусом', exposure ? unknown.casesCount : null],
          ['Заявленные требования по делам с неопределённым статусом', exposure ? money(unknown.latestClaimsTotal) : null],
          ['Активные банкротные дела должников', exposure ? bankruptcyActive.casesCount : null],
          ['Требования по активным банкротным делам', exposure ? money(bankruptcyActive.latestClaimsTotal) : null],
          ['Банкротные дела должников с неопределённым статусом', exposure ? bankruptcyUnknown.casesCount : null],
          ['Требования по банкротным делам с неопределённым статусом', exposure ? money(bankruptcyUnknown.latestClaimsTotal) : null],
        ]} />
        <p className="mt-2 text-xs text-gray-600">Суммы KAD отражают заявленные требования и не являются подтверждённой задолженностью.</p>
        {incompleteKad && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">По части дел статус или подробные сведения KAD не подтверждены.</p>}
      </section>
      <section className="rounded-xl bg-slate-50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Текущие обязательства и ограничения</h4>
        <Metrics rows={[
          ['Активные исполнительные производства', enforcement.activeCount],
          ['Денежные исполнительные производства', enforcement.activeMonetaryCount],
          ['Сумма по активным денежным производствам ФССП', money(enforcement.activeAmount)],
          ['Неденежные исполнительные производства', enforcement.activeNonMonetaryCount],
          ['Производства без определённой суммы', enforcement.activeZeroOrUnknownAmountCount],
          ['Организации с действующими ограничениями', restrictions.organizationsCount],
          ['Действующие решения о приостановлении операций', restrictions.decisionsCount],
          ['Организации с отрицательным ЕНС', restrictions.organizationsWithNegativeEns],
          ['Общая сумма отрицательного сальдо ЕНС', money(restrictions.negativeEnsTotal)],
          ['Действующие записи ЕФРСБ', insolvency.activeRecords],
        ]} />
      </section>
    </div>
  </div>;
}

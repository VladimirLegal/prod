import React from 'react';

const CLAIMS_FALLBACK =
  'Суммы KAD являются заявленными требованиями и не относятся к подтверждённой текущей задолженности.';

const display = (value) =>
  value === null || value === undefined || value === '' ? '—' : value;

const money = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`;
};

const length = (value) => (Array.isArray(value) ? value.length : 0);

function Metrics({ rows }) {
  return (
    <dl className="divide-y divide-gray-200 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-3 py-1.5">
          <dt className="text-gray-600">{label}</dt>
          <dd className="shrink-0 font-semibold text-gray-900">{display(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children, className = '' }) {
  return (
    <section className={`rounded-xl bg-slate-50 p-3 ${className}`}>
      <h4 className="mb-2 text-sm font-semibold text-gray-900">{title}</h4>
      {children}
    </section>
  );
}

function LegacySummary({ summary }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        Расширенная аналитика недоступна для этой ранее сохранённой проверки.
      </div>
      <Section title="Краткая сводка">
        <Metrics rows={[
          ['Всего арбитражных дел', summary.totalArbitrationCases],
          ['Банкротных дел', summary.totalBankruptcyCases],
          ['Активных производств ФССП', summary.activeEnforcementProceedings],
          ['Ограничений по счетам', summary.totalAccountRestrictions],
          ['Организаций с отрицательным ЕНС', summary.withNegativeEnsBalanceCount],
        ]} />
      </Section>
      {Number(summary.kadCaseInfoErrorCases) > 0 && <KadWarning />}
    </div>
  );
}

function KadWarning() {
  return (
    <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
      По части дел подробные сведения KAD недоступны. Основные результаты поиска дел сохранены.
    </div>
  );
}

export default function CommercialActivityApiCloudSummary({ source = {} }) {
  const analysis = source?.analysis;
  const legacySummary = source?.summary || {};
  if (!analysis) return <LegacySummary summary={legacySummary} />;

  const litigation = analysis.litigation || {};
  const litigationSummary = litigation.summary || {};
  const claims = litigation.declaredClaims || {};
  const respondentClaims = claims.respondent || {};
  const plaintiffClaims = claims.plaintiff || {};
  const enforcement = analysis.enforcement || {};
  const enforcementSummary = enforcement.summary || {};
  const restrictions = analysis.accountRestrictions || {};
  const insolvency = analysis.insolvency || {};
  const patterns = analysis.patterns || {};
  const patternSummary = patterns.summary;
  const caseInfoUnavailable = Number(analysis.coverage?.caseInfo?.failedCasesCount) > 0 ||
    Number(legacySummary.kadCaseInfoErrorCases) > 0;

  const activeFacts = [
    [Number(enforcementSummary.activeCount) > 0, 'Есть активные исполнительные производства'],
    [Number(restrictions.organizationsCount) > 0, 'Есть ограничения по счетам'],
    [Number(restrictions.organizationsWithNegativeEns) > 0, 'Выявлено отрицательное сальдо ЕНС'],
    [Number(insolvency.activeRecords) > 0, 'Есть действующая процедура банкротства'],
    [caseInfoUnavailable, 'Часть подробных сведений KAD недоступна'],
  ].filter(([present]) => present);

  const patternCount = (summaryKey, arrayKey) =>
    patternSummary?.[summaryKey] ?? length(patterns[arrayKey]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {activeFacts.length ? activeFacts.map(([, text]) => (
          <span key={text} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
            {text}
          </span>
        )) : (
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
            По доступным источникам активные обязательства и ограничения не выявлены
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section title="Арбитражные дела">
          <div className="mb-2 flex flex-wrap gap-2 text-xs text-gray-700">
            <span>{display(litigationSummary.active)} активных</span>
            <span>{display(litigationSummary.finished)} завершённое</span>
            <span>{display(litigationSummary.unknownState)} с неопределённым статусом</span>
          </div>
          <Metrics rows={[
            ['Уникальных дел', analysis.coverage?.uniqueCasesCount],
            ['Связанные организации — ответчики', litigationSummary.respondent],
            ['Связанные организации — истцы', litigationSummary.plaintiff],
            ['Активных дел', litigationSummary.active],
            ['Завершённых дел', litigationSummary.finished],
            ['Статус завершения не определён', litigationSummary.unknownState],
            ['Банкротных дел', litigationSummary.bankruptcy],
          ]} />
        </Section>

        <Section title="Заявленные требования KAD">
          <Metrics rows={[
            ['Требования к связанным организациям', money(respondentClaims.latestClaimsTotal)],
            ['Дел с суммой / без суммы', `${display(respondentClaims.casesWithAmount)} / ${display(respondentClaims.casesWithoutAmount)}`],
            ['Требования, заявленные связанными организациями', money(plaintiffClaims.latestClaimsTotal)],
            ['Дел с суммой / без суммы ', `${display(plaintiffClaims.casesWithAmount)} / ${display(plaintiffClaims.casesWithoutAmount)}`],
          ]} />
          <p className="mt-2 text-xs leading-relaxed text-gray-600">{claims.message || CLAIMS_FALLBACK}</p>
        </Section>

        <Section title="Обязательства и ограничения">
          <Metrics rows={[
            ['Активных производств ФССП', enforcementSummary.activeCount],
            ['Организаций с ограничениями по счетам', restrictions.organizationsCount],
            ['Решений о приостановлении', restrictions.decisionsCount],
            ['Организаций с отрицательным ЕНС', restrictions.organizationsWithNegativeEns],
            ['Отрицательное сальдо ЕНС', money(restrictions.negativeEnsTotal)],
            ['Организаций со сведениями ЕФРСБ', insolvency.organizationsWithRecords],
            ['Действующих записей ЕФРСБ', insolvency.activeRecords],
          ]} />
        </Section>

        <Section title="Выявленные связи и повторяемость">
          <Metrics rows={[
            ['Повторяющиеся кредиторы', patternCount('recurringCreditorsCount', 'recurringCreditors')],
            ['Повторяющиеся ответчики', patternCount('recurringRespondentsCount', 'recurringDefendants')],
            ['Повторяющиеся дела', patternCount('repeatedCasesCount', 'repeatedCases')],
            ['Дела между связанными организациями', patternCount('internalGroupCasesCount', 'internalGroupCases')],
            ['Совпадения кредитора KAD и взыскателя ФССП', length(enforcement.creditorMatches)],
          ]} />
          <p className="mt-2 text-xs leading-relaxed text-gray-600">
            Показатели отражают повторяемость участников и дел, но сами по себе не подтверждают задолженность или недобросовестность.
          </p>
        </Section>
      </div>

      {caseInfoUnavailable && <KadWarning />}
    </div>
  );
}

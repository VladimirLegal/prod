import React from 'react';
import { Users as UsersIcon, FileText, Download, MessageSquare } from './icons';

import AdminAPI from '../../api/admin';
import MetricCard from './components/MetricCard';
import Timeline from './components/Timeline';
import Loader from './components/Loader';
import SimpleLineChart from './components/SimpleLineChart';
import SimplePieChart from './components/SimplePieChart';
import { startOfDay, subtractDays, isSameDay, isAfter, formatDay } from '../../utils/date';

function buildDailySeries(items, key) {
  const today = startOfDay();
  return Array.from({ length: 7 }).map((_, idx) => {
    const day = subtractDays(today, 6 - idx);
    const count = items.filter((item) => isSameDay(item[key], day)).length;
    return { label: formatDay(day), value: count };
  });
}

function Dashboard() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [data, setData] = React.useState({
    users: [],
    documents: [],
    feedback: [],
    audit: [],
    roles: { roles: [], statuses: [] },
  });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [users, documents, feedback, audit, roles] = await Promise.all([
          AdminAPI.listUsers({ limit: 200, sort: 'created_at.desc' }),
          AdminAPI.listDocuments({ limit: 200 }),
          AdminAPI.listFeedback({ limit: 50 }),
          AdminAPI.listAudit({ limit: 10 }),
          AdminAPI.getRolesSummary(),
        ]);
        if (!cancelled) {
          setData({
            users: users.items || [],
            documents: documents.items || [],
            feedback: feedback.items || [],
            audit: audit.items || [],
            roles: roles,
          });
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Не удалось загрузить данные');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <Loader message="Собираем статистику…" />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        Ошибка загрузки дашборда: {error}
      </div>
    );
  }

  const now = new Date();
  const users7 = data.users.filter((user) => isAfter(user.created_at, subtractDays(now, 7))).length;
  const users30 = data.users.filter((user) => isAfter(user.created_at, subtractDays(now, 30))).length;
  const exports7 = data.audit.filter(
    (item) => ['doc.export.pdf', 'doc.export.docx'].includes(item.action) && isAfter(item.ts, subtractDays(now, 7))
  ).length;
  const exports30 = data.audit.filter(
    (item) => ['doc.export.pdf', 'doc.export.docx'].includes(item.action) && isAfter(item.ts, subtractDays(now, 30))
  ).length;
  const newFeedback = data.feedback.filter((item) => item.status === 'new').length;

  const usersSeries = buildDailySeries(data.users, 'created_at');
  const exportsSeries = buildDailySeries(
    data.audit.filter((item) => ['doc.export.pdf', 'doc.export.docx'].includes(item.action)),
    'ts'
  );

  const pieData = data.roles.roles.map((entry, idx) => ({
    name: entry.role,
    value: Number(entry.count),
    color: ['#3b82f6', '#10b981', '#6366f1'][idx % 3],
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Новые пользователи (7 дней)" value={users7} trend={`за 30 дней: ${users30}`} icon={UsersIcon} />
        <MetricCard title="Документы" value={data.documents.length} trend="Всего за период" icon={FileText} accent="bg-emerald-100 text-emerald-600" />
        <MetricCard
          title="Экспортов (7 дней)"
          value={exports7}
          trend={`за 30 дней: ${exports30}`}
          icon={Download}
          accent="bg-indigo-100 text-indigo-600"
        />
        <MetricCard
          title="Новые обращения"
          value={newFeedback}
          trend={`Всего: ${data.feedback.length}`}
          icon={MessageSquare}
          accent="bg-amber-100 text-amber-600"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-gray-600">Регистрация пользователей (7 дней)</h3>
          <SimpleLineChart data={usersSeries} labelKey="label" valueKey="value" color="#3b82f6" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-600">Распределение ролей</h3>
          <SimplePieChart data={pieData} size={200} strokeWidth={28} centerSubLabel="Всего" centerLabel={
            pieData.reduce((acc, item) => acc + item.value, 0)
          }
          />
          {pieData.length > 0 && (
            <ul className="mt-4 space-y-2 text-xs text-gray-600">
              {pieData.map((entry) => (
                <li key={entry.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.name}
                  </span>
                  <span className="font-semibold text-gray-800">{entry.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-600">Экспорты документов (7 дней)</h3>
          <SimpleLineChart data={exportsSeries} labelKey="label" valueKey="value" color="#10b981" />
        </div>
        <Timeline items={data.audit.slice(0, 5)} />
      </div>
    </div>
  );
}

export default Dashboard;
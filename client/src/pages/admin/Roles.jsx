import React from 'react';

import AdminAPI from '../../api/admin';
import Loader from './components/Loader';
import SimplePieChart from './components/SimplePieChart';

const COLORS = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b'];

function Roles() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [data, setData] = React.useState({ roles: [], statuses: [] });

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const response = await AdminAPI.getRolesSummary();
        setData(response);
        setLoading(false);
      } catch (err) {
        setError(err.message || 'Не удалось загрузить статистику');
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <Loader />;
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>;
  }

  const roleChart = data.roles.map((item, index) => ({
    name: item.role,
    value: Number(item.count),
    color: COLORS[index % COLORS.length],
  }));
  const statusChart = data.statuses.map((item, index) => ({
    name: item.status,
    value: Number(item.count),
    color: COLORS[index % COLORS.length],
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Роли и статусы</h1>
        <p className="text-sm text-gray-500">Распределение пользователей по ролям и состояниям</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-600">Роли пользователей</h3>
          <SimplePieChart
            data={roleChart}
            size={220}
            strokeWidth={28}
            centerSubLabel="Всего"
            centerLabel={roleChart.reduce((acc, item) => acc + item.value, 0)}
          />
          {roleChart.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              {roleChart.map((entry) => (
                <li key={entry.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.name}
                  </span>
                  <span className="font-medium text-gray-800">{entry.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-600">Статусы пользователей</h3>
          <SimplePieChart
            data={statusChart}
            size={220}
            strokeWidth={28}
            centerSubLabel="Всего"
            centerLabel={statusChart.reduce((acc, item) => acc + item.value, 0)}
          />
          {statusChart.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              {statusChart.map((entry) => (
                <li key={entry.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.name}
                  </span>
                  <span className="font-medium text-gray-800">{entry.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default Roles;
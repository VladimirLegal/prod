import React from 'react';
import { Filter } from './icons';

import AdminAPI from '../../api/admin';
import DataTable from './components/DataTable';
import FiltersBar from './components/FiltersBar';
import Pagination from './components/Pagination';
import Loader from './components/Loader';
import { formatDateTimeWithSeconds } from '../../utils/date';

function useAudit(filters) {
  const [state, setState] = React.useState({ loading: true, error: null, items: [], total: 0 });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const response = await AdminAPI.listAudit(filters);
        if (!cancelled) {
          setState({ loading: false, error: null, items: response.items || [], total: response.total || 0 });
        }
      } catch (err) {
        if (!cancelled) {
          setState({ loading: false, error: err.message || 'Ошибка загрузки', items: [], total: 0 });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.actor_id, filters.action, filters.entity_type, filters.entity_id, filters.from, filters.to, filters.limit, filters.offset]);

  return state;
}

function Audit() {
  const [filters, setFilters] = React.useState({
    actor_id: '',
    action: '',
    entity_type: '',
    entity_id: '',
    from: '',
    to: '',
    limit: 50,
    offset: 0,
  });

  const { items, total, loading, error } = useAudit(filters);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Журнал действий</h1>
        <p className="text-sm text-gray-500">Поиск по событиям аудита</p>
      </div>

      <FiltersBar>
        <Filter className="h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="actor_id"
          value={filters.actor_id}
          onChange={(e) => setFilters((prev) => ({ ...prev, actor_id: e.target.value, offset: 0 }))}
          className="w-40 rounded-lg border border-gray-300 px-3 py-2"
        />
        <input
          type="text"
          placeholder="action"
          value={filters.action}
          onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value, offset: 0 }))}
          className="w-40 rounded-lg border border-gray-300 px-3 py-2"
        />
        <input
          type="text"
          placeholder="entity_type"
          value={filters.entity_type}
          onChange={(e) => setFilters((prev) => ({ ...prev, entity_type: e.target.value, offset: 0 }))}
          className="w-32 rounded-lg border border-gray-300 px-3 py-2"
        />
        <input
          type="text"
          placeholder="entity_id"
          value={filters.entity_id}
          onChange={(e) => setFilters((prev) => ({ ...prev, entity_id: e.target.value, offset: 0 }))}
          className="w-40 rounded-lg border border-gray-300 px-3 py-2"
        />
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value, offset: 0 }))}
          className="rounded-lg border border-gray-300 px-3 py-2"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value, offset: 0 }))}
          className="rounded-lg border border-gray-300 px-3 py-2"
        />
      </FiltersBar>

      {loading ? (
        <Loader />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: 'ts',
                label: 'Время',
                sortable: true,
                render: (item) => formatDateTimeWithSeconds(item.ts),
              },
              { key: 'actor_id', label: 'Actor', sortable: true, render: (item) => item.actor_id || 'system' },
              { key: 'actor_role', label: 'Роль', sortable: true, render: (item) => item.actor_role || '—' },
              { key: 'action', label: 'Действие', sortable: true },
              { key: 'entity_type', label: 'Тип', sortable: true, render: (item) => item.entity_type || '—' },
              { key: 'entity_id', label: 'ID', sortable: true, render: (item) => item.entity_id || '—' },
              {
                key: 'meta',
                label: 'Метаданные',
                render: (item) => (
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-600">
                    {item.meta ? JSON.stringify(item.meta, null, 2) : '—'}
                  </pre>
                ),
              },
            ]}
            data={items}
            sortKey="ts"
            sortDirection="desc"
            onSort={() => {}}
            renderEmpty="Нет записей"
          />
          <Pagination
            total={total}
            limit={filters.limit}
            offset={filters.offset}
            onChange={(nextOffset) => setFilters((prev) => ({ ...prev, offset: nextOffset }))}
          />
        </>
      )}
    </div>
  );
}

export default Audit;
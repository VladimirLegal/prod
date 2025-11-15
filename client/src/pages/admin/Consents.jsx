import React from 'react';
import { Search } from './icons';

import AdminAPI from '../../api/admin';
import DataTable from './components/DataTable';
import FiltersBar from './components/FiltersBar';
import Pagination from './components/Pagination';
import Loader from './components/Loader';
import { formatDateTime } from '../../utils/date';

function useConsents(filters) {
  const [state, setState] = React.useState({ loading: true, error: null, items: [], total: 0 });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const response = await AdminAPI.listConsents(filters);
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
  }, [filters.user_id, filters.version, filters.from, filters.to, filters.limit, filters.offset]);

  return state;
}

function ConsentDetails({ consent, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Детали согласия</h2>
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <span className="block text-xs uppercase text-gray-400">ID согласия</span>
            <span className="font-mono text-xs">{consent.id}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className="block text-xs uppercase text-gray-400">Пользователь</span>
              <span>{consent.user_id || 'Гость'}</span>
            </div>
            <div>
              <span className="block text-xs uppercase text-gray-400">Версия</span>
              <span>{consent.doc_version}</span>
            </div>
            <div>
              <span className="block text-xs uppercase text-gray-400">Дата</span>
              <span>{formatDateTime(consent.created_at)}</span>
            </div>
            <div>
              <span className="block text-xs uppercase text-gray-400">Отозвано</span>
              <span>{consent.revoked_at ? formatDateTime(consent.revoked_at) : 'Нет'}</span>
            </div>
          </div>
          {consent.consent_text && (
            <div>
              <span className="block text-xs uppercase text-gray-400">Текст согласия</span>
              <div className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
                {consent.consent_text}
              </div>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-gray-600 hover:bg-gray-50"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

function Consents() {
  const [filters, setFilters] = React.useState({
    user_id: '',
    version: '',
    from: '',
    to: '',
    limit: 20,
    offset: 0,
  });
  const [selected, setSelected] = React.useState(null);
  const { items, total, loading, error } = useConsents(filters);

  const openDetails = async (id) => {
    try {
      const response = await AdminAPI.getConsent(id);
      setSelected(response.consent);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message || 'Не удалось загрузить согласие');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Согласия ПД</h1>
        <p className="text-sm text-gray-500">История подписанных версий и фильтрация</p>
      </div>

      <FiltersBar>
        <input
          type="text"
          placeholder="ID пользователя"
          value={filters.user_id}
          onChange={(e) => setFilters((prev) => ({ ...prev, user_id: e.target.value, offset: 0 }))}
          className="w-48 rounded-lg border border-gray-300 px-3 py-2"
        />
        <input
          type="text"
          placeholder="Версия"
          value={filters.version}
          onChange={(e) => setFilters((prev) => ({ ...prev, version: e.target.value, offset: 0 }))}
          className="w-32 rounded-lg border border-gray-300 px-3 py-2"
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
              { key: 'id', label: 'ID', sortable: false },
              { key: 'user_id', label: 'Пользователь', sortable: false, render: (item) => item.user_id || 'Гость' },
              { key: 'agreement_version', label: 'Версия', sortable: true },
              {
                key: 'created_at',
                label: 'Подписано',
                sortable: true,
                render: (item) => formatDateTime(item.created_at),
              },
              {
                key: 'actions',
                label: '',
                render: (item) => (
                  <button
                    type="button"
                    onClick={() => openDetails(item.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Детали
                  </button>
                ),
              },
            ]}
            data={items}
            sortKey="created_at"
            sortDirection="desc"
            onSort={() => {}}
          />
          <Pagination
            total={total}
            limit={filters.limit}
            offset={filters.offset}
            onChange={(nextOffset) => setFilters((prev) => ({ ...prev, offset: nextOffset }))}
          />
        </>
      )}

      {selected && <ConsentDetails consent={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

export default Consents;
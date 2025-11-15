import React from 'react';
import { FileDown, Trash2, FileText } from './icons';

import AdminAPI from '../../api/admin';
import DataTable from './components/DataTable';
import FiltersBar from './components/FiltersBar';
import Pagination from './components/Pagination';
import StatusPill from './components/StatusPill';
import Loader from './components/Loader';
import { AdminSessionContext } from './AdminApp';
import { formatDateTime } from '../../utils/date';

const STATUS_OPTIONS = [
  { value: '', label: 'Все' },
  { value: 'draft', label: 'Черновик' },
  { value: 'ready', label: 'Готов' },
  { value: 'deleted', label: 'Удалён' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'Все типы' },
  { value: 'lease', label: 'Аренда' },
  { value: 'agreement', label: 'Соглашение' },
];

function useDocuments(filters) {
  const [state, setState] = React.useState({ loading: true, error: null, items: [], total: 0 });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const response = await AdminAPI.listDocuments(filters);
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
  }, [filters.user_id, filters.type, filters.status, filters.q, filters.limit, filters.offset, filters.sort]);

  return state;
}

function Documents() {
  const { user: sessionUser } = React.useContext(AdminSessionContext);
  const isAdmin = sessionUser?.role === 'admin';

  const [filters, setFilters] = React.useState({
    user_id: '',
    type: '',
    status: '',
    q: '',
    limit: 20,
    offset: 0,
    sort: 'updated_at.desc',
  });

  const { items, total, loading, error } = useDocuments(filters);

  const sortKey = filters.sort.split('.')[0];
  const sortDirection = filters.sort.split('.')[1] || 'desc';

  const handleSort = (key) => {
    setFilters((prev) => {
      if (prev.sort.startsWith(key)) {
        const nextDir = prev.sort.endsWith('.desc') ? 'asc' : 'desc';
        return { ...prev, sort: `${key}.${nextDir}`, offset: 0 };
      }
      return { ...prev, sort: `${key}.desc`, offset: 0 };
    });
  };

  const refresh = React.useCallback(() => {
    setFilters((prev) => ({ ...prev }));
  }, []);

  const handleDelete = async (id) => {
    if (!isAdmin) return;
    if (!window.confirm('Пометить документ удалённым?')) return;
    try {
      await AdminAPI.deleteDocument(id);
      refresh();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message || 'Не удалось удалить документ');
    }
  };

  const handleExport = async (doc, format) => {
    try {
      const response = await AdminAPI.exportDocument(doc.id, format);
      const buffer = Uint8Array.from(atob(response.data), (char) => char.charCodeAt(0));
      const blob = new Blob([buffer], {
        type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${doc.title || 'document'}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message || 'Не удалось экспортировать документ');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Документы</h1>
        <p className="text-sm text-gray-500">Управление документами пользователей</p>
      </div>

      <FiltersBar>
        <input
          type="search"
          placeholder="Поиск по названию"
          value={filters.q}
          onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value, offset: 0 }))}
          className="w-64 rounded-lg border border-gray-300 px-3 py-2"
        />
        <input
          type="text"
          placeholder="ID пользователя"
          value={filters.user_id}
          onChange={(e) => setFilters((prev) => ({ ...prev, user_id: e.target.value, offset: 0 }))}
          className="w-48 rounded-lg border border-gray-300 px-3 py-2"
        />
        <select
          value={filters.type}
          onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value, offset: 0 }))}
          className="rounded-lg border border-gray-300 px-3 py-2"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value, offset: 0 }))}
          className="rounded-lg border border-gray-300 px-3 py-2"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FiltersBar>

      {loading ? (
        <Loader />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'title', label: 'Название', sortable: true },
              { key: 'type', label: 'Тип', sortable: true, render: (doc) => doc.type || '—' },
              {
                key: 'status',
                label: 'Статус',
                sortable: true,
                render: (doc) => <StatusPill value={doc.status} kind="status" />, 
              },
              {
                key: 'user_id',
                label: 'Пользователь',
                sortable: true,
                render: (doc) => doc.user_id || '—',
              },
              {
                key: 'updated_at',
                label: 'Изменён',
                sortable: true,
                render: (doc) => formatDateTime(doc.updated_at),
              },
              {
                key: 'actions',
                label: '',
                render: (doc) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleExport(doc, 'pdf')}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport(doc, 'docx')}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      <FileText className="h-3.5 w-3.5" /> DOCX
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Удалить
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
            data={items}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
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

export default Documents;
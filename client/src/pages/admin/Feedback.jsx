import React from 'react';
import { MessageSquarePlus, NotebookPen } from './icons';

import AdminAPI from '../../api/admin';
import DataTable from './components/DataTable';
import FiltersBar from './components/FiltersBar';
import Pagination from './components/Pagination';
import StatusPill from './components/StatusPill';
import Loader from './components/Loader';
import { formatDateTime } from '../../utils/date';

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'new', label: 'Новая' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Закрыта' },
];

function useFeedback(filters) {
  const [state, setState] = React.useState({ loading: true, error: null, items: [], total: 0 });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const response = await AdminAPI.listFeedback(filters);
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
  }, [filters.status, filters.q, filters.limit, filters.offset]);

  return state;
}

function NotesModal({ feedbackId, onClose }) {
  const [notes, setNotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [text, setText] = React.useState('');

  const fetchNotes = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await AdminAPI.listFeedbackNotes(feedbackId);
      setNotes(response.items || []);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      // eslint-disable-next-line no-alert
      alert(err.message || 'Не удалось загрузить заметки');
    }
  }, [feedbackId]);

  React.useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleAdd = async () => {
    if (!text.trim()) return;
    try {
      await AdminAPI.addFeedbackNote(feedbackId, text.trim());
      setText('');
      fetchNotes();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message || 'Не удалось сохранить заметку');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Заметки по обращению</h2>
        <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          {loading ? (
            <p className="text-gray-500">Загрузка…</p>
          ) : notes.length === 0 ? (
            <p className="text-gray-500">Заметок пока нет</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((note) => (
                <li key={note.id} className="rounded border border-gray-200 bg-white p-2">
                  <p className="text-xs text-gray-500">
                    {formatDateTime(note.created_at)} · {note.author_id}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">{note.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-4 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Новая заметка"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            rows={3}
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-gray-600 hover:bg-gray-50"
            >
              Закрыть
            </button>
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              <NotebookPen className="h-4 w-4" />
              Добавить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feedback() {
  const [filters, setFilters] = React.useState({ status: '', q: '', limit: 20, offset: 0 });
  const [notesFor, setNotesFor] = React.useState(null);
  const { items, total, loading, error } = useFeedback(filters);

  const refresh = React.useCallback(() => {
    setFilters((prev) => ({ ...prev }));
  }, []);

  const handleStatusChange = async (feedbackId, status) => {
    try {
      await AdminAPI.updateFeedbackStatus(feedbackId, status);
      refresh();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message || 'Не удалось обновить статус');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Обратная связь</h1>
        <p className="text-sm text-gray-500">Обработка обращений пользователей</p>
      </div>

      <FiltersBar>
        <input
          type="search"
          placeholder="Поиск по теме или тексту"
          value={filters.q}
          onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value, offset: 0 }))}
          className="w-64 rounded-lg border border-gray-300 px-3 py-2"
        />
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
              { key: 'topic', label: 'Тема', sortable: true, render: (item) => item.topic || 'Без темы' },
              { key: 'source', label: 'Источник', sortable: true, render: (item) => item.source || '—' },
              {
                key: 'status',
                label: 'Статус',
                sortable: true,
                render: (item) => <StatusPill value={item.status} kind="feedback" />, 
              },
              {
                key: 'created_at',
                label: 'Создано',
                sortable: true,
                render: (item) => formatDateTime(item.created_at),
              },
              {
                key: 'actions',
                label: '',
                render: (item) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value)}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                    >
                      {STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setNotesFor(item.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      Заметки
                    </button>
                  </div>
                ),
              },
            ]}
            data={items}
            sortKey="created_at"
            sortDirection="desc"
            onSort={() => {}}
            renderEmpty="Нет обращений"
          />
          <Pagination
            total={total}
            limit={filters.limit}
            offset={filters.offset}
            onChange={(nextOffset) => setFilters((prev) => ({ ...prev, offset: nextOffset }))}
          />
        </>
      )}

      {notesFor && <NotesModal feedbackId={notesFor} onClose={() => setNotesFor(null)} />}
    </div>
  );
}

export default Feedback;
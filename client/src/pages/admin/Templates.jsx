import React from 'react';
import { Pencil } from './icons';

import AdminAPI from '../../api/admin';
import DataTable from './components/DataTable';
import Loader from './components/Loader';
import { AdminSessionContext } from './AdminApp';
import { formatDateTime } from '../../utils/date';

function TemplateModal({ template, onClose, onSave, editable }) {
  const [form, setForm] = React.useState({
    title: template.title,
    body: template.body,
    version: template.version,
  });
  const [saving, setSaving] = React.useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editable) return onClose();
    try {
      setSaving(true);
      await onSave(form);
      onClose();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message || 'Не удалось обновить шаблон');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-800">Шаблон {template.code}</h2>
            <p className="text-xs text-gray-500">Обновлён {formatDateTime(template.updated_at)}</p>
          </div>
          <div className="flex-1 space-y-4 overflow-auto px-6 py-4 text-sm">
            <div>
              <label className="mb-1 block text-gray-600">Заголовок</label>
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                disabled={!editable}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-gray-600">Версия</label>
              <input
                name="version"
                value={form.version}
                onChange={handleChange}
                disabled={!editable}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-gray-600">Тело шаблона</label>
              <textarea
                name="body"
                value={form.body}
                onChange={handleChange}
                disabled={!editable}
                className="h-64 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-gray-600 hover:bg-gray-50"
            >
              Закрыть
            </button>
            {editable && (
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Сохранить
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Templates() {
  const { user: sessionUser } = React.useContext(AdminSessionContext);
  const isAdmin = sessionUser?.role === 'admin';

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [selected, setSelected] = React.useState(null);

  const fetchTemplates = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await AdminAPI.listTemplates();
      setItems(response.items || []);
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить шаблоны');
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openTemplate = async (id) => {
    try {
      const response = await AdminAPI.getTemplate(id);
      setSelected(response.template);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message || 'Не удалось загрузить шаблон');
    }
  };

  const handleSave = async (payload) => {
    if (!selected) return;
    await AdminAPI.updateTemplate(selected.id, payload);
    await fetchTemplates();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Шаблоны</h1>
        <p className="text-sm text-gray-500">Редактирование документов и версий</p>
      </div>

      {loading ? (
        <Loader />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
      ) : (
        <DataTable
          columns={[
            { key: 'code', label: 'Код', sortable: false },
            { key: 'title', label: 'Название', sortable: false },
            {
              key: 'version',
              label: 'Версия',
              sortable: false,
            },
            {
              key: 'updated_at',
              label: 'Обновлён',
              sortable: false,
              render: (tpl) => formatDateTime(tpl.updated_at),
            },
            {
              key: 'actions',
              label: '',
              render: (tpl) => (
                <button
                  type="button"
                  onClick={() => openTemplate(tpl.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Открыть
                </button>
              ),
            },
          ]}
          data={items}
          sortKey="code"
          sortDirection="asc"
          onSort={() => {}}
        />
      )}

      {selected && (
        <TemplateModal
          template={selected}
          onClose={() => setSelected(null)}
          onSave={handleSave}
          editable={isAdmin}
        />
      )}
    </div>
  );
}

export default Templates;
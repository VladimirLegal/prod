import React from 'react';
import AdminAPI from '../../api/admin';
import Loader from './components/Loader';
import { AdminSessionContext } from './AdminApp';

function Settings() {
  const { user: sessionUser } = React.useContext(AdminSessionContext);
  const isAdmin = sessionUser?.role === 'admin';

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [settings, setSettings] = React.useState({});
  const [drafts, setDrafts] = React.useState({});
  const [saving, setSaving] = React.useState(false);

  const fetchSettings = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await AdminAPI.getSettings();
      setSettings(response.settings || {});
      setDrafts(response.settings || {});
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить настройки');
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleChange = (key, value) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {};
      Object.entries(drafts).forEach(([key, value]) => {
        try {
          payload[key] = typeof value === 'string' ? JSON.parse(value) : value;
        } catch (err) {
          throw new Error(`Ошибка парсинга JSON для ключа ${key}`);
        }
      });
      await AdminAPI.updateSettings(payload);
      fetchSettings();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message || 'Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loader />;
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Настройки</h1>
        <p className="text-sm text-gray-500">Базовые конфигурации проекта</p>
      </div>

      <div className="space-y-4">
        {Object.keys(settings).length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-500">Настройки не найдены</div>
        )}
        {Object.entries(settings).map(([key, value]) => {
          const draftValue = drafts[key];
          const formatted = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
          const displayDraft = typeof draftValue === 'string' ? draftValue : JSON.stringify(draftValue, null, 2);
          return (
            <div key={key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-gray-800">{key}</span>
                <span className="text-xs text-gray-400">Текущее значение</span>
              </div>
              <pre className="rounded border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">{formatted}</pre>
              {isAdmin && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs uppercase text-gray-400">Новое значение (JSON)</label>
                  <textarea
                    value={displayDraft}
                    onChange={(e) => handleChange(key, e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Сохранить изменения
          </button>
        </div>
      )}
    </div>
  );
}

export default Settings;
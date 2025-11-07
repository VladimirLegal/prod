import React from 'react';

export default function PassportImportModal({
  open,
  onClose,
  data,
  onApply,
  title = 'Распознанные данные паспорта',
}) {
  // Хуки ВСЕГДА сверху
  const [form, setForm] = React.useState(() => ({ ...(data || {}) }));

  React.useEffect(() => {
    setForm({ ...(data || {}) });
  }, [data]);

  // Ранний выход — после хуков
  if (!open) return null;

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm">ФИО
            <input className="w-full p-2 border rounded" value={form.fullName || ''} onChange={set('fullName')} />
          </label>
          <label className="text-sm">Пол (male/female)
            <input className="w-full p-2 border rounded" value={form.gender || ''} onChange={set('gender')} />
          </label>
          <label className="text-sm">Дата рождения
            <input className="w-full p-2 border rounded" value={form.birthDate || ''} onChange={set('birthDate')} />
          </label>
          <label className="text-sm">Место рождения
            <input className="w-full p-2 border rounded" value={form.birthPlace || ''} onChange={set('birthPlace')} />
          </label>
          <label className="text-sm">Паспорт (серия номер)
            <input className="w-full p-2 border rounded" value={form.passport || ''} onChange={set('passport')} />
          </label>
          <label className="text-sm">Кем выдан
            <input className="w-full p-2 border rounded" value={form.passportIssued || ''} onChange={set('passportIssued')} />
          </label>
          <label className="text-sm">Дата выдачи
            <input className="w-full p-2 border rounded" value={form.issueDate || ''} onChange={set('issueDate')} />
          </label>
          <label className="text-sm">Код подразделения
            <input className="w-full p-2 border rounded" value={form.departmentCode || ''} onChange={set('departmentCode')} />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="px-4 py-2 rounded bg-gray-200" onClick={onClose}>Отмена</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={() => onApply(form)}>
            Применить
          </button>
        </div>

        {data?.rawText && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-600">Показать распознанный текст</summary>
            <pre className="mt-2 p-2 bg-gray-50 rounded max-h-40 overflow-auto text-xs whitespace-pre-wrap">
              {data.rawText}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

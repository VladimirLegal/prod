import React from 'react';

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

const OwnershipBasisDocumentsSection = ({ basisGroups = [], onChange }) => {
  const updateGroup = (groupIndex, patch) => {
    const next = [...basisGroups];
    next[groupIndex] = { ...next[groupIndex], ...patch };
    onChange(next);
  };

  const addGroup = () => {
    onChange([...basisGroups, { regNumber: '', regDate: '', basisDocuments: [{ title: '', docDate: '' }] }]);
  };

  const removeGroup = (groupIndex) => {
    onChange(basisGroups.filter((_, index) => index !== groupIndex));
  };

  const addDoc = (groupIndex) => {
    const group = basisGroups[groupIndex] || { basisDocuments: [] };
    updateGroup(groupIndex, { basisDocuments: [...(group.basisDocuments || []), { title: '', docDate: '' }] });
  };

  const removeDoc = (groupIndex, docIndex) => {
    const group = basisGroups[groupIndex] || { basisDocuments: [] };
    updateGroup(groupIndex, { basisDocuments: (group.basisDocuments || []).filter((_, index) => index !== docIndex) });
  };

  const updateDoc = (groupIndex, docIndex, patch) => {
    const group = basisGroups[groupIndex] || { basisDocuments: [] };
    const docs = [...(group.basisDocuments || [])];
    docs[docIndex] = { ...docs[docIndex], ...patch };
    updateGroup(groupIndex, { basisDocuments: docs });
  };

  return (
    <div className="md:col-span-2 space-y-3">
      {basisGroups.map((group, groupIndex) => (
        <div key={`group-${groupIndex}`} className="border border-gray-200 rounded-lg p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-2">Основания права собственности</p>
            <div className="space-y-3">
              {(group.basisDocuments || []).map((doc, docIndex) => (
                <div key={`doc-${groupIndex}-${docIndex}`} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className={labelClass}>Название документа</span>
                    <input
                      className={inputClass}
                      value={doc.title || ''}
                      onChange={(event) => updateDoc(groupIndex, docIndex, { title: event.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Дата документа</span>
                    <input
                      className={inputClass}
                      value={doc.docDate || ''}
                      onChange={(event) => updateDoc(groupIndex, docIndex, { docDate: event.target.value })}
                      placeholder="ДД.ММ.ГГГГ"
                    />
                  </label>
                  <div className="md:col-span-2 flex justify-end">
                    <button type="button" className="text-sm text-red-600 hover:text-red-700" onClick={() => removeDoc(groupIndex, docIndex)}>
                      Удалить документ основания
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="mt-3 text-sm text-blue-600 hover:text-blue-700" onClick={() => addDoc(groupIndex)}>
              + Добавить документ основания
            </button>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900 mb-2">Государственная регистрация</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>Номер регистрации</span>
                <input className={inputClass} value={group.regNumber || ''} onChange={(event) => updateGroup(groupIndex, { regNumber: event.target.value })} />
              </label>
              <label className="block">
                <span className={labelClass}>Дата регистрации</span>
                <input className={inputClass} value={group.regDate || ''} onChange={(event) => updateGroup(groupIndex, { regDate: event.target.value })} placeholder="ДД.ММ.ГГГГ" />
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" className="text-sm text-red-600 hover:text-red-700" onClick={() => removeGroup(groupIndex)}>
              Удалить группу регистрации
            </button>
          </div>
        </div>
      ))}

      <button type="button" className="text-sm text-blue-600 hover:text-blue-700" onClick={addGroup}>
        + Добавить регистрацию/группу
      </button>
    </div>
  );
};

export default OwnershipBasisDocumentsSection;
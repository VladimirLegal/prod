import React from 'react';
import { extractEGRNDataFromPdf } from '../../utils/extractEGRNDataFromPdf';
import { extractEGRNFromZip } from '../../utils/extractEGRNFromZip';
import { normalizeEgrnForMaternityShares } from '../../utils/maternityCapitalShares/normalizeEgrnForMaternityShares';
import OwnershipBasisDocumentsSection from './OwnershipBasisDocumentsSection';

const FEATURE_MATCAP_EGRN_UPLOAD = process.env.REACT_APP_FEATURE_MATCAP_EGRN_UPLOAD !== 'false';

const cardClass = 'bg-white rounded-xl shadow-md p-6';
const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const btnBase = 'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors';
const acquisitionOptions = [
  { value: 'apartment', label: 'Квартира' },
  { value: 'apartment_share', label: 'Доля в квартире' },
  { value: 'communal_room_share', label: 'Комната в коммунальной квартире' },
  { value: 'separate_room', label: 'Отдельная комната с кадастровым номером' },
  { value: 'house_with_land', label: 'Дом с земельным участком' },
  { value: 'house_with_land_share', label: 'Доля в доме с земельным участком' },
];

const Field = ({ label, value, onChange, placeholder = '', type = 'text' }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    <input
      type={type}
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />
  </label>
);

const TextAreaField = ({ label, value, onChange, placeholder = '' }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    <textarea
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={3}
      className={inputClass}
    />
  </label>
);

const SummaryRow = ({ label, value }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-2 border-b border-gray-100 last:border-0">
    <dt className="text-sm font-medium text-gray-500">{label}</dt>
    <dd className="sm:col-span-2 text-sm text-gray-900">{value || '—'}</dd>
  </div>
);

const getSourceLabel = (mode) => (mode === 'egrn' ? 'Загрузить выписку ЕГРН' : 'Заполнить вручную');
const getEncumbranceDisplayValue = (encumbrance = {}) => {
  if (!encumbrance) return '';

  if (encumbrance.type === 'mortgage') {
    return encumbrance.subtype || encumbrance.description || 'Ипотека';
  }

  if (encumbrance.type === 'none') {
    return 'Не зарегистрировано';
  }

  if (encumbrance.type === 'arrest') {
    return encumbrance.subtype || 'Арест';
  }

  if (encumbrance.type === 'registration_ban') {
    return encumbrance.subtype || 'Запрет регистрационных действий';
  }

  return encumbrance.subtype || encumbrance.description || encumbrance.type || '';
};

const MaternityObjectRightsSection = ({
  formData,
  setFormData,
  parsedEgrn,
  setParsedEgrn,
  onApplyEgrn,
  onRejectEgrn,
}) => {
  const updateSection = (section, key, value) => {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const updateSourceMode = (sourceMode) => {
    setFormData((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        sourceMode,
        parseStatus: sourceMode === 'manual' ? 'idle' : prev.ui.parseStatus,
      },
    }));
  };

  const updateAcquisitionType = (type) => {
    setFormData((prev) => ({
      ...prev,
      acquisition: {
        ...prev.acquisition,
        type,
        confirmedByUser: true,
      },
      distributionBase: {
        ...prev.distributionBase,
        type:
          type === 'apartment'
            ? 'whole_object'
            : type === 'apartment_share'
              ? 'share_in_apartment'
              : type === 'house_with_land' || type === 'house_with_land_share'
                ? 'stub_house'
                : type,
        calculationWarning:
          type === 'house_with_land' || type === 'house_with_land_share'
            ? 'Дом с участком и доля в доме с участком будут поддержаны после добавления второй выписки на земельный участок.'
            : '',
        source: 'manual',
      },
    }));
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    setFormData((prev) => ({
      ...prev,
      ui: { ...prev.ui, parseStatus: 'parsing', parseWarnings: [] },
      egrn: {
        ...prev.egrn,
        fileName: file.name,
        fileType: file.type,
        source: lowerName.endsWith('.zip') ? 'zip' : lowerName.endsWith('.pdf') ? 'pdf' : '',
      },
    }));

    try {
      let parsed;
      if (lowerName.endsWith('.zip')) {
        parsed = await extractEGRNFromZip(file);
      } else if (lowerName.endsWith('.pdf')) {
        parsed = await extractEGRNDataFromPdf(file);
      } else {
        throw new Error('Поддерживаются только файлы .zip и .pdf');
      }

      const normalized = normalizeEgrnForMaternityShares(parsed);
      setParsedEgrn(normalized);
      setFormData((prev) => ({
        ...prev,
        ui: { ...prev.ui, parseStatus: 'parsed', parseWarnings: parsed?.warnings || [] },
        egrn: { ...prev.egrn, raw: parsed, parsed: normalized, applied: false },
      }));
    } catch (error) {
      setParsedEgrn(null);
      setFormData((prev) => ({
        ...prev,
        ui: {
          ...prev.ui,
          parseStatus: 'error',
          parseWarnings: [error?.message || 'Не удалось разобрать файл ЕГРН.'],
        },
      }));
    } finally {
      event.target.value = '';
    }
  };

  const showForm = formData.ui.sourceMode === 'manual' || formData.egrn.applied;
  const selectedHouseStub = ['house_with_land', 'house_with_land_share'].includes(formData.acquisition.type);
  const isShareLike = formData.acquisition.type === 'apartment_share' || formData.acquisition.type === 'communal_room_share';

  const basisGroups = formData.rights.basisDocuments || [];

  const fallbackOwnerBlocks = [
    {
      id: 'legacy-owner-rights',
      blockType: 'legacy',
      title: 'Право собственности',
      ownerIndex: null,
      owners: formData.rights.owners || [],
      fullName: (formData.rights.owners || []).map((owner) => owner.fullName).filter(Boolean).join('\n'),
      ownershipType: formData.rights.ownershipType || '',
      share: formData.rights.existingShare || '',
      shareDisplayText: formData.rights.existingShareDisplayText || formData.rights.existingShare || '',
      registrationNumber: formData.rights.registrationNumber || '',
      registrationDate: formData.rights.registrationDate || '',
      registrationGroups: basisGroups,
      encumbrance: formData.encumbrance,
    },
  ];

  const ownerBlocks =
    Array.isArray(formData.rights.ownerBlocks) && formData.rights.ownerBlocks.length
      ? formData.rights.ownerBlocks
      : fallbackOwnerBlocks;

  const syncLegacyRightsFromOwnerBlocks = (blocks) => {
    const allGroups = blocks.flatMap((block) => block.registrationGroups || []);
    const firstBlock = blocks[0] || {};
    const firstGroup = allGroups[0] || {};

    return {
      ownerBlocks: blocks,
      basisDocuments: allGroups,
      ownershipType: firstBlock.ownershipType || formData.rights.ownershipType,
      existingShare: firstBlock.share || formData.rights.existingShare,
      existingShareDisplayText: firstBlock.shareDisplayText || formData.rights.existingShareDisplayText,
      registrationNumber: firstBlock.registrationNumber || firstGroup.regNumber || formData.rights.registrationNumber,
      registrationDate: firstBlock.registrationDate || firstGroup.regDate || formData.rights.registrationDate,
    };
  };

  const updateOwnerBlocks = (nextBlocks) => {
    setFormData((prev) => ({
      ...prev,
      rights: {
        ...prev.rights,
        ...syncLegacyRightsFromOwnerBlocks(nextBlocks),
      },
      encumbrance:
        nextBlocks.length === 1
          ? { ...prev.encumbrance, ...(nextBlocks[0].encumbrance || {}) }
          : prev.encumbrance,
    }));
  };

  const updateOwnerBlock = (blockIndex, patch) => {
    const nextBlocks = ownerBlocks.map((block, index) =>
      index === blockIndex ? { ...block, ...patch } : block
    );
    updateOwnerBlocks(nextBlocks);
  };

  const updateOwnerBlockRegistrationGroups = (blockIndex, nextGroups) => {
    updateOwnerBlock(blockIndex, { registrationGroups: nextGroups });
  };

  const updateOwnerBlockEncumbrance = (blockIndex, key, value) => {
    const block = ownerBlocks[blockIndex] || {};
    updateOwnerBlock(blockIndex, {
      encumbrance: {
        ...(block.encumbrance || {}),
        [key]: value,
      },
    });
  };

  const updateOwnerBlockOwnersText = (blockIndex, value) => {
    const owners = value
      .split('\n')
      .map((fullName) => ({ fullName: fullName.trim() }))
      .filter((owner) => owner.fullName);

    updateOwnerBlock(blockIndex, {
      fullName: value,
      owners,
    });
  };

  return (
    <div className="space-y-6">
      <section className={cardClass}>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Объект, право собственности и ЕГРН</h2>
        <p className="text-gray-600 mb-6">
          Выберите источник данных. ЕГРН можно применить только после просмотра найденных сведений, все поля останутся редактируемыми.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURE_MATCAP_EGRN_UPLOAD && (
            <button
              type="button"
              onClick={() => updateSourceMode('egrn')}
              className={`text-left rounded-xl border p-5 transition-colors ${
                formData.ui.sourceMode === 'egrn' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <span className="block text-lg font-semibold text-gray-900">Загрузить выписку ЕГРН</span>
              <span className="block text-sm text-gray-600 mt-2">PDF или ZIP с XML/PDF. Данные сначала будут показаны для проверки.</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => updateSourceMode('manual')}
            className={`text-left rounded-xl border p-5 transition-colors ${
              formData.ui.sourceMode === 'manual' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <span className="block text-lg font-semibold text-gray-900">Заполнить вручную</span>
            <span className="block text-sm text-gray-600 mt-2">Откроет пустую форму без применения данных из выписки.</span>
          </button>
        </div>

        {formData.ui.sourceMode && (
          <p className="mt-4 text-sm text-gray-500">Выбран источник: {getSourceLabel(formData.ui.sourceMode)}</p>
        )}
      </section>

      {FEATURE_MATCAP_EGRN_UPLOAD && formData.ui.sourceMode === 'egrn' && !formData.egrn.applied && (
        <section className={cardClass}>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Загрузка выписки ЕГРН</h3>
          <label className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer">
            <input type="file" accept=".pdf,.zip,application/pdf,application/zip" onChange={handleFileChange} className="hidden" />
            <span className="block text-gray-900 font-medium">Выберите PDF или ZIP-файл</span>
            <span className="block text-sm text-gray-500 mt-2">Данные не будут применены автоматически.</span>
          </label>
          {formData.ui.parseStatus === 'parsing' && <p className="mt-4 text-blue-600">Разбираем выписку…</p>}
          {formData.ui.parseStatus === 'error' && (
            <div className="mt-4 rounded-lg bg-red-50 text-red-700 p-4">
              {formData.ui.parseWarnings.join(' ') || 'Не удалось разобрать файл.'}
            </div>
          )}
        </section>
      )}

      {parsedEgrn && formData.ui.parseStatus === 'parsed' && !formData.egrn.applied && (
        <section className={cardClass}>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Найдены данные из ЕГРН</h3>
          <dl className="mb-6">
            <SummaryRow label="Адрес" value={parsedEgrn.object.address} />
            <SummaryRow label="Кадастровый номер" value={parsedEgrn.object.cadastralNumber} />
            <SummaryRow label="Площадь" value={parsedEgrn.object.area} />
            <SummaryRow label="Этаж" value={parsedEgrn.object.floor} />
            <SummaryRow label="Вид объекта" value={parsedEgrn.object.objectKindFromEgrn} />
            <SummaryRow label="Вид жилого помещения" value={parsedEgrn.object.residentialKind} />
            <SummaryRow label="Правообладатели" value={parsedEgrn.rights.owners.map((owner) => owner.fullName).filter(Boolean).join(', ')} />
            <SummaryRow label="Вид права" value={parsedEgrn.rights.ownershipType} />
            <SummaryRow label="Доля" value={parsedEgrn.rights.existingShare} />
            <SummaryRow label="Регистрация" value={[parsedEgrn.rights.registrationNumber, parsedEgrn.rights.registrationDate].filter(Boolean).join(' от ')} />
            <SummaryRow label="Документы-основания" value={parsedEgrn.rights.basisDocuments.flatMap((group) => group.basisDocuments.map((doc) => `${doc.title}${doc.docDate ? `, от ${doc.docDate}` : ""}`)).join('\n')} />
            <SummaryRow label="Обременения" value={getEncumbranceDisplayValue(parsedEgrn.encumbrance)} />
            {parsedEgrn.encumbrance.type === 'mortgage' && (
              <>
                <SummaryRow
                  label="Регистрация обременения"
                  value={[parsedEgrn.encumbrance.registrationNumber, parsedEgrn.encumbrance.registrationDate]
                    .filter(Boolean)
                    .join(' от ')}
                />
                <SummaryRow
                  label="Залогодержатель"
                  value={parsedEgrn.encumbrance.mortgagee || parsedEgrn.encumbrance.beneficiary}
                />
                <SummaryRow
                  label="Срок обременения"
                  value={parsedEgrn.encumbrance.term}
                />
                <SummaryRow
                  label="Основания обременения"
                  value={(parsedEgrn.encumbrance.basisDocuments || [])
                    .map((doc) => `${doc.title}${doc.docDate ? `, от ${doc.docDate}` : ''}`)
                    .join('\n')}
                />
              </>
            )}
            <SummaryRow label="Статус записи" value={parsedEgrn.object.recordStatus} />
            <SummaryRow label="Дата актуальности" value={parsedEgrn.object.egrnActualDate} />
          </dl>

          {parsedEgrn.recipientOwnerMatch.matched && (
            <div className="mb-4 rounded-lg bg-green-50 text-green-800 p-4">
              {parsedEgrn.rights.ownershipType === 'Собственность'
                ? `Получатель выписки найден среди правообладателей. Объект принадлежит ему полностью — ${parsedEgrn.rights.existingShare || '1/1'}.`
                : parsedEgrn.rights.ownershipType === 'Общая совместная собственность'
                  ? 'Получатель выписки найден среди правообладателей. Объект находится в общей совместной собственности, индивидуальные доли в ЕГРН не определены.'
                  : `Получатель выписки найден среди правообладателей. За ним указана доля ${parsedEgrn.recipientOwnerMatch.share || parsedEgrn.rights.existingShare || '—'}.`}
            </div>
          )}
          {!parsedEgrn.recipientOwnerMatch.matched && parsedEgrn.recipientOwnerMatch.recipientName && (
            <div className="mb-4 rounded-lg bg-yellow-50 text-yellow-800 p-4">
              Получатель выписки не был однозначно найден среди правообладателей. Проверьте данные вручную.
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={onApplyEgrn} className={`${btnBase} bg-blue-600 text-white hover:bg-blue-700`}>
              Применить данные ЕГРН
            </button>
            <button type="button" onClick={onRejectEgrn} className={`${btnBase} bg-gray-100 text-gray-900 hover:bg-gray-200`}>
              Не применять — заполнить вручную
            </button>
          </div>
        </section>
      )}

      {showForm && (
        <>
          <section className={cardClass}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Данные соглашения</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Место составления" value={formData.agreement.place} onChange={(value) => updateSection('agreement', 'place', value)} placeholder="г. Санкт-Петербург" />
              <Field label="Дата соглашения" type="date" value={formData.agreement.date} onChange={(value) => updateSection('agreement', 'date', value)} />
            </div>
          </section>

          <section className={cardClass}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Объект и тип приобретения</h3>
            {formData.acquisition.reason && (
              <div className={`mb-4 rounded-lg p-4 ${formData.acquisition.confidence === 'manual_required' ? 'bg-yellow-50 text-yellow-800' : 'bg-blue-50 text-blue-800'}`}>
                {formData.acquisition.reason}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextAreaField label="Адрес" value={formData.object.address} onChange={(value) => updateSection('object', 'address', value)} />
              <Field label="Кадастровый номер" value={formData.object.cadastralNumber} onChange={(value) => updateSection('object', 'cadastralNumber', value)} />
              <Field label="Площадь, кв. м" value={formData.object.area} onChange={(value) => updateSection('object', 'area', value)} />
              <Field label="Этаж" value={formData.object.floor} onChange={(value) => updateSection('object', 'floor', value)} />
              <Field label="Вид объекта из ЕГРН" value={formData.object.objectKindFromEgrn} onChange={(value) => updateSection('object', 'objectKindFromEgrn', value)} />
              <Field label="Вид жилого помещения" value={formData.object.residentialKind} onChange={(value) => updateSection('object', 'residentialKind', value)} />
              <label className="block md:col-span-2">
                <span className={labelClass}>Что приобреталось с использованием материнского капитала?</span>
                <select value={formData.acquisition.type || ''} onChange={(event) => updateAcquisitionType(event.target.value)} className={inputClass}>
                  <option value="">Выберите вариант</option>
                  {acquisitionOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <Field label="Цена покупки" value={formData.object.purchasePrice} onChange={(value) => updateSection('object', 'purchasePrice', value)} />
              {isShareLike && (<>
                <Field label="Доля объекта, приобретённая с использованием материнского капитала" value={formData.object.purchasedShare} onChange={(value) => updateSection('object', 'purchasedShare', value)} />
                <Field label="Номер комнаты" value={formData.object.roomNumber} onChange={(value) => updateSection('object', 'roomNumber', value)} />
                <Field label="Фактическая площадь комнаты" value={formData.object.roomArea} onChange={(value) => updateSection('object', 'roomArea', value)} />
                <Field label="Жилая площадь квартиры" value={formData.object.livingArea} onChange={(value) => updateSection('object', 'livingArea', value)} />
                <Field label="Юридическая доля" value={formData.object.legalShare} onChange={(value) => updateSection('object', 'legalShare', value)} />
                <p className="md:col-span-2 text-sm text-gray-500">ЕГРН показывает текущее зарегистрированное право. Если с использованием материнского капитала приобреталась не вся квартира, укажите вручную, какая именно доля приобреталась.</p>
              </>)}
            </div>
            {selectedHouseStub && (
              <div className="mt-4 rounded-lg bg-yellow-50 text-yellow-800 p-4">
                Дом с участком и доля в доме с участком пока недоступны: на следующем этапе потребуется отдельная выписка на земельный участок.
              </div>
            )}
          </section>

          <section className={cardClass}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Основание права собственности</h3>

            <div className="space-y-5">
              {ownerBlocks.map((block, blockIndex) => {
                const blockEncumbrance = block.encumbrance || formData.encumbrance || {};

                return (
                  <div key={block.id || `owner-block-${blockIndex}`} className="border border-gray-200 rounded-xl p-4 space-y-4">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-gray-500">
                        {block.blockType === 'joint'
                          ? 'Правообладатели'
                          : `Правообладатель ${blockIndex + 1}`}
                      </p>
                      <p className="text-base font-semibold text-gray-900 whitespace-pre-line">
                        {block.fullName || (block.owners || []).map((owner) => owner.fullName).filter(Boolean).join('\n') || 'Правообладатель не указан'}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field
                        label="Тип права"
                        value={block.ownershipType}
                        onChange={(value) => updateOwnerBlock(blockIndex, { ownershipType: value })}
                      />

                      <Field
                        label="Текущая доля из ЕГРН"
                        value={block.shareDisplayText || block.share}
                        onChange={(value) => updateOwnerBlock(blockIndex, { shareDisplayText: value })}
                      />

                      <TextAreaField
                        label={block.blockType === 'joint' ? 'Правообладатели' : 'ФИО правообладателя'}
                        value={(block.owners || []).map((owner) => owner.fullName).filter(Boolean).join('\n') || block.fullName}
                        onChange={(value) => updateOwnerBlockOwnersText(blockIndex, value)}
                      />

                      <div className="hidden md:block" />
                    </div>

                    <OwnershipBasisDocumentsSection
                      basisGroups={block.registrationGroups || []}
                      onChange={(nextGroups) => updateOwnerBlockRegistrationGroups(blockIndex, nextGroups)}
                    />

                    <div className="border-t border-gray-100 pt-4">
                      <h4 className="text-md font-semibold text-gray-900 mb-3">
                        Ограничения и обременения
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field
                          label="Вид обременения"
                          value={getEncumbranceDisplayValue(blockEncumbrance)}
                          onChange={(value) => {
                            updateOwnerBlockEncumbrance(blockIndex, 'subtype', value);
                            if (blockEncumbrance.type === 'mortgage') {
                              updateOwnerBlockEncumbrance(blockIndex, 'description', value);
                            }
                          }}
                        />

                        <Field
                          label="Номер регистрации обременения"
                          value={blockEncumbrance.registrationNumber}
                          onChange={(value) => updateOwnerBlockEncumbrance(blockIndex, 'registrationNumber', value)}
                        />

                        <Field
                          label="Дата регистрации обременения"
                          value={blockEncumbrance.registrationDate}
                          onChange={(value) => updateOwnerBlockEncumbrance(blockIndex, 'registrationDate', value)}
                        />

                        <Field
                          label="Залогодержатель"
                          value={blockEncumbrance.mortgagee || blockEncumbrance.beneficiary}
                          onChange={(value) => {
                            updateOwnerBlockEncumbrance(blockIndex, 'mortgagee', value);
                            updateOwnerBlockEncumbrance(blockIndex, 'beneficiary', value);
                          }}
                        />

                        <TextAreaField
                          label="Срок обременения"
                          value={blockEncumbrance.term}
                          onChange={(value) => updateOwnerBlockEncumbrance(blockIndex, 'term', value)}
                        />

                        {blockEncumbrance.type !== 'mortgage' && blockEncumbrance.type !== 'none' && (
                          <TextAreaField
                            label="Описание обременения"
                            value={blockEncumbrance.description || ''}
                            onChange={(value) => updateOwnerBlockEncumbrance(blockIndex, 'description', value)}
                          />
                        )}
                      </div>

                      {Array.isArray(blockEncumbrance.basisDocuments) && blockEncumbrance.basisDocuments.length > 0 && (
                        <div className="mt-4 rounded-lg border border-gray-200 p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-2">Основания регистрации обременения</p>
                          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                            {blockEncumbrance.basisDocuments.map((doc, docIndex) => (
                              <li key={`enc-doc-${blockIndex}-${docIndex}`}>
                                {doc.title || 'Документ'}{doc.docDate ? `, от ${doc.docDate}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default MaternityObjectRightsSection;
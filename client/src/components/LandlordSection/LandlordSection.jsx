import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserTie,
  faPlus,
  faTimes,
  faTrash,
  faExclamationCircle,
} from '@fortawesome/free-solid-svg-icons';

import ErrorMessage from '../ErrorMessage';
import {
  formatPassportText,
  formatPhone,
  formatDateToText,
} from '../../utils/formatters';
import {
  formatDateInput,
  formatPassportInput,
  formatDepartmentCodeInput,
} from '../../utils/inputMasks';
// ↓ компонент модалки (default export)
import FreeTextImportModal from '../common/FreeTextImportModal';
// ↓ парсер (named export)
import { parseFreeTextPerson } from '../../utils/freeTextParser';
import { declineGenitive } from '../../utils/personNameRu';

// Единые пресеты для кнопок
const BTN = {
  base: "h-9 px-4 text-sm rounded inline-flex items-center justify-center gap-2 transition-colors",
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  success: "bg-green-600 text-white hover:bg-green-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  outline: "border border-gray-300 text-gray-700 hover:bg-gray-50",
  subtle: "bg-green-100 text-gray-700 hover:bg-gray-200",
  link: "text-blue-600 hover:underline px-0 h-auto",
  pillWrap: "flex items-center rounded-lg overflow-hidden",
  pillOn: "bg-blue-500 text-white",
  pillOff: "bg-gray-200 text-gray-700 hover:bg-gray-300",
};

const PILL = {
  base: "inline-flex items-center justify-center rounded-full border font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-1 px-4 py-2 text-sm",
  primary: "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 focus:ring-blue-200",
  danger:  "bg-white text-red-700 border-red-300 hover:bg-red-50 focus:ring-red-200",
  subtle:  "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 focus:ring-gray-200",
  disabled:"bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed",
  warn:    "bg-amber-500 text-white border-amber-500 hover:bg-amber-600 focus:ring-amber-200",
};


const LandlordSection = ({
  landlords,
  setLandlords,
  currentLandlordIndex,
  setCurrentLandlordIndex,
  errors = {},
  addLandlord,
  removeLandlord,
  handleLandlordRegistrationTypeChange,
  handleLandlordAttorneyRegistrationTypeChange,
  sharesMismatch, // мягкое предупреждение "Проверьте сумму долей"
}) => {
  // Текущий арендодатель (может быть undefined при удалении)
  const landlord = Array.isArray(landlords)
    ? landlords[currentLandlordIndex] || landlords[0]
    : undefined;
  
  const sectionRef = React.useRef(null);

  const focusRequest = errors?.landlordsFocus;

  const landlordErrorsMap = React.useMemo(() => {
    if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
      if (errors.landlords && typeof errors.landlords === 'object') {
        return errors.landlords;
      }
    }

    return {};
  }, [errors]);

  const currentErrors = landlordErrorsMap[currentLandlordIndex] || {};

  const focusFieldByKey = React.useCallback((fieldKey) => {
    if (!sectionRef.current || !fieldKey) return false;

    const target = sectionRef.current.querySelector(
      `[data-error-key="${fieldKey}"]`
    );

    if (target && typeof target.focus === 'function') {
      target.focus({ preventScroll: false });
      if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return true;
    }

    return false;
  }, []);

  React.useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.landlordIndex !== currentLandlordIndex) return;
    if (!focusRequest.fieldKey) return;

    focusFieldByKey(focusRequest.fieldKey);
  }, [focusRequest, currentLandlordIndex, focusFieldByKey]);

  const currentErrorKeys = React.useMemo(
    () => Object.keys(currentErrors || {}),
    [currentErrors]
  );

  const errorKeysSignature = currentErrorKeys.join('|');
  const nextErrorIndexRef = React.useRef(0);

  React.useEffect(() => {
    nextErrorIndexRef.current = 0;
  }, [currentLandlordIndex, errorKeysSignature]);

  const focusNextError = React.useCallback(() => {
    if (!currentErrorKeys.length) return;

    const total = currentErrorKeys.length;
    const start = nextErrorIndexRef.current % total;

    for (let offset = 0; offset < total; offset += 1) {
      const key = currentErrorKeys[(start + offset) % total];
      if (focusFieldByKey(key)) {
        nextErrorIndexRef.current = (start + offset + 1) % total;
        break;
      }
    }
  }, [currentErrorKeys, focusFieldByKey]);

  // refs / state — ВСЕ ХУКИ СТРОГО ВВЕРХУ
  const fullNameInputRef = React.useRef(null);
  const [genitiveCaseNotice, setGenitiveCaseNotice] = React.useState(false);

  // Держим индекс в допустимых границах при удалениях/добавлениях
  React.useEffect(() => {
    const len = Array.isArray(landlords) ? landlords.length : 0;
    if (len === 0) return;
    if (currentLandlordIndex > len - 1) {
      setCurrentLandlordIndex(len - 1);
    } else if (currentLandlordIndex < 0) {
      setCurrentLandlordIndex(0);
    }
  }, [landlords?.length, currentLandlordIndex, setCurrentLandlordIndex]);
  
  const [freeTextOpen, setFreeTextOpen] = React.useState(false);
  const [freeTextTarget, setFreeTextTarget] = React.useState('landlord'); // 'landlord' | 'representative'
  // === COPY REPRESENTATIVE: state & helpers ===
  const [copyOpen, setCopyOpen] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState([]);

  // Список остальных арендодателей (кроме текущего)
  const otherLandlords = useMemo(() => {
    return (landlords || [])
      .map((l, i) => ({
        index: i,
        label: (l?.fullName?.trim() || `Арендодатель ${i + 1}`)
      }))
      .filter(item => item.index !== currentLandlordIndex);
  }, [landlords, currentLandlordIndex]);

  // Есть ли хоть какие-то данные у представителя
  const representativeHasData = (rep = {}) =>
    Object.values(rep).some(v => (v ?? '').toString().trim() !== '');

  const openCopyModal = () => {
    setSelectedTargets([]);
    setCopyOpen(true);
  };

  const toggleTarget = useCallback((idx) => {
    setSelectedTargets(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  }, []);

  const applyCopyToTargets = () => {
    const source = landlords?.[currentLandlordIndex];
    if (!source || !representativeHasData(source.representative)) return;

    setLandlords(prev => {
      const next = prev.map((l, i) => {
        if (selectedTargets.includes(i)) {
          // глубокая копия, чтобы не схватить ссылку
          const clone = JSON.parse(JSON.stringify(source.representative || {}));
          const safeTargetRep = { ...(l.representative || {}) };
          return {
            ...l,
            hasRepresentative: true,
            representative: { ...safeTargetRep, ...clone }
          };
        }
        return l;
      });
      return next;
    });

    setCopyOpen(false);
  };
  // При включении представителя — показать подсказку про родительный падеж ФИО
  React.useEffect(() => {
    if (landlord?.hasRepresentative) setGenitiveCaseNotice(true);
  }, [landlord?.hasRepresentative]);

  // ====== безопасные сеттеры ======
  const updateCurrentLandlord = (updater) => {
    const arr = Array.isArray(landlords) ? [...landlords] : [];
    const idx =
      currentLandlordIndex >= 0 && currentLandlordIndex < arr.length
        ? currentLandlordIndex
        : 0;
    const cur = { ...(arr[idx] || {}) };
    updater(cur, idx, arr);
    arr[idx] = cur;
    setLandlords(arr);
  };

  const ensureRepresentativeObject = (obj) => {
    if (!obj.representative) {
      obj.representative = {
        fullName: '',
        gender: '',
        birthDate: '',
        birthPlace: '',
        passport: '',
        passportIssued: '',
        issueDate: '',
        departmentCode: '',
        registration: '',
        registrationType: '',
        attorneyNumber: '',
        attorneyDate: '',
        attorneyIssuedBy: '',
      };
    }
  };
  // ====== handlers: арендодатель ======
  const handleLandlordFieldChange = (field, value) => {
    updateCurrentLandlord((cur) => {
      cur[field] = value;
    });
  };

  // ====== handlers: представитель ======
  const handleRepresentativeFieldChange = (field, value) => {
    updateCurrentLandlord((cur, idx, arr) => {
      ensureRepresentativeObject(cur);
      cur.representative[field] = value;
     
    });
  };


  const handleAttorneyDateChange = (e, field) => {
    handleRepresentativeFieldChange(field, formatDateInput(e.target.value));
  };

  // ====== handlers: документы-основания ======
  const addDocument = () => {
    updateCurrentLandlord((cur) => {
      if (!Array.isArray(cur.documents)) cur.documents = [];
      cur.documents.push({
        // группа — для гос. регистрации + список «оснований»
        basisDocuments: [
          {
            title: '',
            docDate: '',
          },
        ],
        regNumber: '',
        regDate: '',
      });
    });
  };

  const removeLastDocument = () => {
    updateCurrentLandlord((cur) => {
      if (Array.isArray(cur.documents) && cur.documents.length > 0) {
        cur.documents = cur.documents.slice(0, cur.documents.length - 1);
      }
    });
  };

  const handleChangeLandlordDocField = (docIndex, field, value) => {
    updateCurrentLandlord((cur) => {
      if (!Array.isArray(cur.documents)) cur.documents = [];
      if (!cur.documents[docIndex]) {
        cur.documents[docIndex] = { basisDocuments: [], regNumber: '', regDate: '' };
      }
      cur.documents[docIndex][field] = value;
    });
  };

  const handleChangeLandlordBasisDocField = (docGroupIndex, basisIndex, field, value) => {
    updateCurrentLandlord((cur) => {
      if (!Array.isArray(cur.documents)) cur.documents = [];
      if (!cur.documents[docGroupIndex]) {
        cur.documents[docGroupIndex] = { basisDocuments: [], regNumber: '', regDate: '' };
      }
      const group = cur.documents[docGroupIndex];
      if (!Array.isArray(group.basisDocuments)) group.basisDocuments = [];
      if (!group.basisDocuments[basisIndex]) {
        group.basisDocuments[basisIndex] = { title: '', docDate: '' };
      }
      group.basisDocuments[basisIndex][field] = value;
    });
  };

  const handleAddBasisDocument = (docGroupIndex) => {
    updateCurrentLandlord((cur) => {
      if (!Array.isArray(cur.documents)) cur.documents = [];
      if (!cur.documents[docGroupIndex]) {
        cur.documents[docGroupIndex] = { basisDocuments: [], regNumber: '', regDate: '' };
      }
      const group = cur.documents[docGroupIndex];
      if (!Array.isArray(group.basisDocuments)) group.basisDocuments = [];
      group.basisDocuments.push({ title: '', docDate: '' });
    });
  };

  const handleRemoveBasisDocument = (groupIndex, basisIndex) => {
    updateCurrentLandlord((cur) => {
      if (!Array.isArray(cur.documents)) return;
      const group = cur.documents[groupIndex];
      if (!group || !Array.isArray(group.basisDocuments)) return;
      group.basisDocuments.splice(basisIndex, 1);
    });
  };

  // Кнопка «Исправить сейчас» — фокус на поле ФИО и скрыть подсказку
  const handleFixNow = () => {
    if (fullNameInputRef.current) fullNameInputRef.current.focus();
    setGenitiveCaseNotice(false);
  };
  
  // ---- Верхние поля арендодателя (представителя не трогаем) ----
  const LANDLORD_TOP_FIELDS = [
    'fullName','gender','birthDate','birthPlace',
    'passport','passportIssued','issueDate','departmentCode',
    'registration','registrationType','phone','email'
  ];

  const clearLandlordTopFields = (obj) => {
    LANDLORD_TOP_FIELDS.forEach(k => { obj[k] = ''; });
  };

  // на всякий случай гарантируем объект представителя
  const ensureLandlordRepresentativeObject = (o) => {
    o.representative ||= {
      fullName:'', gender:'', birthDate:'', birthPlace:'',
      passport:'', passportIssued:'', issueDate:'', departmentCode:'',
      registration:'', registrationType:'',
      attorneyNumber:'', attorneyDate:'', attorneyIssuedBy:''
    };
  };

  // 👉 Применить текст к ТЕКУЩЕМУ АРЕНДОДАТЕЛЮ (представителя не трогаем)
  const applyFreeTextToLandlord = (rawText, { mode = 'replace-landlord-only' } = {}) => {
    const parsed = parseFreeTextPerson(rawText || '');

    setLandlords(prev => {
      const arr = [...(prev || [])];
      const idx = Math.min(Math.max(currentLandlordIndex, 0), Math.max(arr.length - 1, 0));
      const cur = { ...(arr[idx] || {}) };

      if (mode === 'replace-landlord-only') {
        clearLandlordTopFields(cur); // ← очищаем ТОЛЬКО верхние поля арендодателя
      }

      // переносим только непустые значения
      const map = {
        fullName: 'fullName',
        gender: 'gender',
        birthDate: 'birthDate',
        birthPlace: 'birthPlace',
        passport: 'passport',
        passportIssued: 'passportIssued',
        issueDate: 'issueDate',
        departmentCode: 'departmentCode',
        registration: 'registration',
        phone: 'phone',
        email: 'email'
      };
      Object.entries(map).forEach(([from, to]) => {
        if (parsed[from]) cur[to] = parsed[from];
      });

      // ВАЖНО: НЕ трогаем cur.hasRepresentative / cur.representative
      arr[idx] = cur;

      // (опционально) лог изменений в консоль — удобно при отладке
      // eslint-disable-next-line no-console
      console.table({ scope: 'Landlord', ...map }, ['scope']);

      return arr;
    });
  };

  // 👉 Применить текст к ПРЕДСТАВИТЕЛЮ текущего арендодателя (верхние поля не трогаем)
  const applyFreeTextToLandlordRepresentative = (rawText, { mode = 'replace-rep-only' } = {}) => {
    const parsed = parseFreeTextPerson(rawText || '');

    setLandlords(prev => {
      const arr = [...(prev || [])];
      const idx = Math.min(Math.max(currentLandlordIndex, 0), Math.max(arr.length - 1, 0));
      const cur = { ...(arr[idx] || {}) };

      ensureLandlordRepresentativeObject(cur);
      cur.hasRepresentative = true; // UX: включим флаг

      if (mode === 'replace-rep-only') {
        cur.representative = {
          fullName:'', gender:'', birthDate:'', birthPlace:'',
          passport:'', passportIssued:'', issueDate:'', departmentCode:'',
          registration:'', registrationType:'',
          attorneyNumber:'', attorneyDate:'', attorneyIssuedBy:''
        };
      }

      const mapRep = {
        fullName: 'fullName',
        gender: 'gender',
        birthDate: 'birthDate',
        birthPlace: 'birthPlace',
        passport: 'passport',
        passportIssued: 'passportIssued',
        issueDate: 'issueDate',
        departmentCode: 'departmentCode',
        registration: 'registration'
      };
      Object.entries(mapRep).forEach(([from, to]) => {
        if (parsed[from]) cur.representative[to] = parsed[from];
      });

      arr[idx] = cur;

      // (опционально) лог изменений
      // eslint-disable-next-line no-console
      console.debug('Applied to landlord.representative:', cur.representative);

      return arr;
    });
  };
  const docsCount = (landlord.documents || []).length;
  const isMaxDocs = docsCount >= 5;
  const hasDocs   = docsCount > 0;


  // ====== РЕНДЕР, если арендодателей нет вообще ======
  if (!landlord) {
    return (
      <div ref={sectionRef} className="space-y-6">
      {/* МОДАЛКА «Вставить паспортные данные текстом» — доступна всегда */}
      <FreeTextImportModal
          open={freeTextOpen}
          onClose={() => setFreeTextOpen(false)}
          title={freeTextTarget === 'landlord'
              ? 'Вставьте текст с данными арендодателя'
              : 'Вставьте текст с данными представителя арендодателя'}
          onApply={(raw) => {
              try {
                  if (freeTextTarget === 'landlord') {
              applyFreeTextToLandlord(raw, { mode: 'replace-landlord-only' });
            } else {
              applyFreeTextToLandlordRepresentative(raw, { mode: 'replace-rep-only' });
            }
          } finally {
            setFreeTextOpen(false);
          }
        }}
      />
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            <FontAwesomeIcon icon={faUserTie} className="mr-2 text-blue-600" />
            Данные арендодателя
          </h2>
          <button
            onClick={addLandlord}
            className="px-3 py-1 rounded-lg flex items-center bg-green-500 text-white hover:bg-green-600"
          >
            <FontAwesomeIcon icon={faPlus} className="mr-1" />
            Добавить арендодателя
          </button>
        </div>
        <p className="text-gray-600">Добавьте первого арендодателя.</p>
      </div>
    );
  }

  // ====== ОСНОВНОЙ РЕНДЕР ======
  return (
    <div ref={sectionRef} className="space-y-6">
    {/* МОДАЛКА «Вставить паспортные данные текстом» — доступна всегда */}
    <FreeTextImportModal
      open={freeTextOpen}
      onClose={() => setFreeTextOpen(false)}
      title={freeTextTarget === 'landlord'
        ? 'Вставьте текст с данными арендодателя'
        : 'Вставьте текст с данными представителя арендодателя'}
      onApply={(raw) => {
        try {
          if (freeTextTarget === 'landlord') {
            applyFreeTextToLandlord(raw, { mode: 'replace-landlord-only' });
          } else {
            applyFreeTextToLandlordRepresentative(raw, { mode: 'replace-rep-only' });
          }
        } finally {
          setFreeTextOpen(false);
        }
      }}
    />

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">
          <FontAwesomeIcon icon={faUserTie} className="mr-2 text-blue-600" />
          Данные арендодателя
        </h2>

        {sharesMismatch && (
          <div className="ml-3 px-2 py-1 rounded bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm inline-flex items-center">
            <FontAwesomeIcon icon={faExclamationCircle} className="mr-1" />
            Проверьте сумму долей
          </div>
        )}
      </div>

      {/* Табы арендодателей + кнопка добавления в одном ряду */}
      <div className="flex flex-wrap items-stretch gap-2">
        {Array.isArray(landlords) && landlords.map((landlord, idx) => {
          const isActive = currentLandlordIndex === idx;
          const tabErrors = landlordErrorsMap?.[idx] || {};
          const tabHasErrors = Object.keys(tabErrors).length > 0;

          return (
            <div
              key={idx}
              className={`flex items-stretch overflow-hidden rounded-full border ${
                isActive
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : tabHasErrors
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-gray-300 bg-white text-gray-700'
              }`}
            >
              
              <button
                onClick={() => setCurrentLandlordIndex(idx)}
                className="px-4 py-2 text-sm flex items-center gap-2"
              >
                <span>Арендодатель {idx + 1}</span>
                {tabHasErrors && (
                  <FontAwesomeIcon
                    icon={faExclamationCircle}
                    className="text-red-500"
                    title="Есть незаполненные поля"
                  />
                )}
              </button>

              {landlords.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLandlord(idx)}
                  className="px-2 text-sm hover:bg-red-500 hover:text-white transition-colors"
                  title="Удалить карточку"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              )}
            </div>
          );
        })}
            

        {/* Кнопка добавления — того же размера/стиля, что и таб */}
        <button
          type="button"
          onClick={addLandlord}
          disabled={landlords.length >= 10}
          className={`px-4 py-2 text-sm rounded-full border
                      ${landlords.length >= 10
                        ? 'border-gray-300 text-gray-400 cursor-not-allowed bg-gray-100'
                        : 'border-green-300 text-green-700 bg-white hover:bg-green-50'}
                    `}
          title="Добавить арендодателя"
        >
          <FontAwesomeIcon icon={faPlus} className="mr-1" />
          Добавить
        </button>
      </div>
      {currentErrorKeys.length > 0 && (
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={focusNextError}
            className={`${BTN.base} ${BTN.outline}`}
          >
            Следующее незаполненное поле
          </button>
        </div>
      )}


      
      {/* Анкета арендодателя */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label className="block text-gray-700 mb-2">
            <b>{landlord.hasRepresentative ? 'ФИО арендодателя (в родительном падеже)*' : 'ФИО*'}</b>
          </label>
          <input
            ref={fullNameInputRef}
            type="text"
            data-error-key="landlordFullName"
            className={`w-full p-3 border rounded-lg ${
              currentErrors.landlordFullName ? 'border-red-500' : 'border-gray-300'
            }`}
            value={landlord.fullName}
            onChange={(e) => handleLandlordFieldChange('fullName', e.target.value)}
            placeholder={landlord.hasRepresentative ? 'Фамилию Имя Отчество (в род. падеже)' : 'Фамилия Имя Отчество'}
          />
          <ErrorMessage error={currentErrors.landlordFullName} />
          {landlord.hasRepresentative && landlord.fullName && (
            <div className="text-sm text-red-500 mt-1">
              В договоре это ФИО будет указано так:
              <span className="ml-1 font-medium">
                {declineGenitive(landlord.fullName, landlord.gender)}
              </span>
            </div>
          )}

          {/* КНОПКА для АРЕНДОДАТЕЛЯ */}
	        <button
            type="button"
            onClick={() => { setFreeTextTarget('landlord'); setFreeTextOpen(true); }}
            className={`${BTN.base} ${BTN.subtle} mt-2`}
          >
            Вставить паспортные данные текстом
          </button>

        </div>

        <div>
          <label className="block text-gray-700 mb-2"><b>Пол*</b></label>
          <div className="flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio"
                data-error-key="landlordGender"
                name={`gender-${currentLandlordIndex}`}
                value="male"
                checked={landlord.gender === 'male'}
                onChange={() => handleLandlordFieldChange('gender', 'male')}
              />
              <span className="ml-2">Мужской</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                data-error-key="landlordGender"
                className="form-radio"
                name={`gender-${currentLandlordIndex}`}
                value="female"
                checked={landlord.gender === 'female'}
                onChange={() => handleLandlordFieldChange('gender', 'female')}
              />
              <span className="ml-2">Женский</span>
            </label>
          </div>
          <ErrorMessage error={currentErrors.landlordGender} />
        </div>

        <div>
          <label className="block text-gray-700 mb-2"><b>Дата рождения*</b></label>
          <input
            type="text"
            data-error-key="landlordBirthDate"
            className="w-full p-3 border border-gray-300 rounded-lg"
            value={landlord.birthDate}
            onChange={(e) => handleLandlordFieldChange('birthDate', formatDateInput(e.target.value))}
            placeholder="дд.мм.гггг"
          />
          <div className="text-sm text-gray-500 mt-1">
            {landlord.birthDate && `${formatDateToText(landlord.birthDate)} рождения`}
          </div>
          <ErrorMessage error={currentErrors.landlordBirthDate} />
        </div>

        <div>
          <label className="block text-gray-700 mb-2"><b>Место рождения*</b></label>
          <input
            type="text"
            data-error-key="landlordBirthPlace"
            className="w-full p-3 border border-gray-300 rounded-lg"
            value={landlord.birthPlace || ''}
            onChange={(e) => handleLandlordFieldChange('birthPlace', e.target.value)}
            placeholder="Город, село и т.д."
          />
          <ErrorMessage error={currentErrors.landlordBirthPlace} />
        </div>

        <div>
          <label className="block text-gray-700 mb-2"><b>Паспорт*</b></label>
          <input
            type="text"
            data-error-key="landlordPassport"
            className="w-full p-3 border border-gray-300 rounded-lg"
            value={landlord.passport || ''}
            onChange={(e) => handleLandlordFieldChange('passport', formatPassportInput(e.target.value))}
            placeholder="Серия и номер"
          />
          <div className="text-sm text-gray-500 mt-1">
            {landlord.passport && formatPassportText(landlord.passport)}
          </div>
          <ErrorMessage error={currentErrors.landlordPassport} />
         
        </div>

        <div>
          <label className="block text-gray-700 mb-2"><b>Кем выдан*</b></label>
          <input
            type="text"
            data-error-key="landlordPassportIssued"
            className="w-full p-3 border border-gray-300 rounded-lg"
            value={landlord.passportIssued || ''}
            onChange={(e) => handleLandlordFieldChange('passportIssued', e.target.value)}
            placeholder="Кем выдан паспорт"
          />
          <ErrorMessage error={currentErrors.landlordPassportIssued} />
        </div>

        <div>
          <label className="block text-gray-700 mb-2"><b>Дата выдачи*</b></label>
          <input
            type="text"
            data-error-key="landlordIssueDate"
            className="w-full p-3 border border-gray-300 rounded-lg"
            value={landlord.issueDate || ''}
            onChange={(e) => handleLandlordFieldChange('issueDate', formatDateInput(e.target.value))}
            placeholder="дд.мм.гггг"
          />
          <div className="text-sm text-gray-500 mt-1">
            {landlord.issueDate && formatDateToText(landlord.issueDate)}
          </div>
          <ErrorMessage error={currentErrors.landlordIssueDate} />
        </div>

        <div>
          <label className="block text-gray-700 mb-2"><b>Код подразделения*</b></label>
          <input
            type="text"
            data-error-key="landlordDepartmentCode"
            className="w-full p-3 border border-gray-300 rounded-lg"
            value={landlord.departmentCode || ''}
            onChange={(e) => handleLandlordFieldChange('departmentCode', formatDepartmentCodeInput(e.target.value))}
            placeholder="000-000"
          />
          <ErrorMessage error={currentErrors.landlordDepartmentCode} />
        </div>

        {/* Адрес регистрации — скрываем при 'none' */}
        {landlord.registrationType !== 'none' && (
          <div className="md:col-span-2">
            <label className="block text-gray-700 mb-2"><b>Адрес регистрации*</b></label>
            <input
              type="text"
              data-error-key="landlordRegistration"
              className={`w-full p-3 border rounded-lg ${
                currentErrors.landlordRegistration ? 'border-red-500' : 'border-gray-300'
              }`}
              value={landlord.registration || ''}
              onChange={(e) => handleLandlordFieldChange('registration', e.target.value)}
              placeholder="Полный адрес регистрации"
            />
            <ErrorMessage error={currentErrors.landlordRegistration} />
          </div>
        )}

        <div className="md:col-span-2">
          <label className="block text-gray-700 mb-2"><b>Тип регистрации</b></label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={landlord.registrationType === 'previous'}
                onChange={() =>
                  handleLandlordRegistrationTypeChange(
                    landlord.registrationType === 'previous' ? '' : 'previous'
                  )
                }
              />
              <span className="ml-2">Ранее</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={landlord.registrationType === 'temporary'}
                onChange={() =>
                  handleLandlordRegistrationTypeChange(
                    landlord.registrationType === 'temporary' ? '' : 'temporary'
                  )
                }
              />
              <span className="ml-2">Временная</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={landlord.registrationType === 'none'}
                onChange={() =>
                  handleLandlordRegistrationTypeChange(
                    landlord.registrationType === 'none' ? '' : 'none'
                  )
                }
              />
              <span className="ml-2">Без регистрации</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-gray-700 mb-2"><b>Телефон*</b></label>
          <input
            type="text"
            data-error-key="landlordPhone"
            className="w-full p-3 border border-gray-300 rounded-lg"
            value={landlord.phone || ''}
            onChange={(e) => handleLandlordFieldChange('phone', formatPhone(e.target.value))}
            placeholder="+7 (999) 999-99-99"
          />
          <ErrorMessage error={currentErrors.landlordPhone} />
        </div>

        <div>
          <label className="block text-gray-700 mb-2">Email</label>
          <input
            type="email"
            className="w-full p-3 border border-gray-300 rounded-lg"
            value={landlord.email || ''}
            onChange={(e) => handleLandlordFieldChange('email', e.target.value)}
            placeholder="email@example.com"
          />
          <ErrorMessage error={errors.landlordEmail} />
        </div>
      </div>

      {/* Основание права собственности */}
      <div className="mt-8 border-t pt-8">
        <h3 className="text-lg font-semibold mb-4">Основание права собственности</h3>

        {Array.isArray(landlord.documents) &&
          landlord.documents.map((docGroup, groupIndex) => (
            <div key={groupIndex} className="border p-3 mb-3 rounded shadow-sm">
              <h4 className="font-bold mb-2">Основания права собственности</h4>

              <ErrorMessage error={errors[`basisMissing_${groupIndex}`]} />

              {Array.isArray(docGroup.basisDocuments) &&
                docGroup.basisDocuments.map((basis, basisIndex) => (
                  <div key={basisIndex} className="pl-4 mb-2">
                    <label className="block text-sm font-medium">Название документа</label>
                    <input
                      type="text"
                      data-error-key={`basisTitle_${groupIndex}_${basisIndex}`}
                      className="border p-1 w-full"
                      value={basis.title}
                      onChange={(e) =>
                        handleChangeLandlordBasisDocField(groupIndex, basisIndex, 'title', e.target.value)
                      }
                    />
                    <ErrorMessage error={currentErrors[`basisTitle_${groupIndex}_${basisIndex}`]} />
                    <label className="block text-sm font-medium mt-2">Дата документа</label>
                    <input
                      type="text"
                      data-error-key={`basisDate_${groupIndex}_${basisIndex}`}
                      className="border p-1 w-full"
                      value={basis.docDate}
                      onChange={(e) =>
                        handleChangeLandlordBasisDocField(
                          groupIndex,
                          basisIndex,
                          'docDate',
                          formatDateInput(e.target.value)
                        )
                      }
                    />
                    <ErrorMessage error={currentErrors[`basisDate_${groupIndex}_${basisIndex}`]} />
                    <button
                      type="button"
                      className={`${BTN.link} text-red-600`}
                      onClick={() => handleRemoveBasisDocument(groupIndex, basisIndex)}
                    >
                      🗑 Удалить документы основания
                    </button>

                  </div>
                ))}

              <button
                type="button"
                className={`${BTN.link} mb-3`}
                data-error-key={`basisMissing_${groupIndex}`}
                onClick={() => handleAddBasisDocument(groupIndex)}
              >
                ➕ Добавить документы основания
              </button>


              <h5 className="font-semibold mt-4">Государственная регистрация</h5>

              <label className="block text-sm font-medium">Номер регистрации</label>
              <input
                type="text"
                data-error-key={`regNumber_${groupIndex}`}
                className="border p-1 w-full"
                value={docGroup.regNumber}
                onChange={(e) =>
                  handleChangeLandlordDocField(groupIndex, 'regNumber', e.target.value)
                }
              />
              <ErrorMessage error={currentErrors[`regNumber_${groupIndex}`]} />
              
              <label className="block text-sm font-medium mt-2">Дата регистрации</label>
              <input
                type="text"
                data-error-key={`regDate_${groupIndex}`}
                className="border p-1 w-full"
                value={docGroup.regDate}
                onChange={(e) =>
                  handleChangeLandlordDocField(
                    groupIndex,
                    'regDate',
                    formatDateInput(e.target.value)
                  )
                }
              />
              <ErrorMessage error={currentErrors[`regDate_${groupIndex}`]} />
            </div>
          ))}

        <div className="flex flex-col sm:flex-row justify-start gap-2 mt-4">
          <button
            type="button"
            onClick={addDocument}
            disabled={isMaxDocs}
            className={`${PILL.base} ${isMaxDocs ? PILL.disabled : PILL.primary} w-full sm:w-auto`}
          >
            <span className="whitespace-nowrap">Добавить документ о собственности</span>
          </button>

          <button
            type="button"
            onClick={removeLastDocument}
            disabled={!hasDocs}
            className={`${PILL.base} ${!hasDocs ? PILL.disabled : PILL.danger} w-full sm:w-auto`}
          >
            <span className="whitespace-nowrap">Удалить документ о собственности</span>
          </button>
        </div>

      </div>

      {/* Представитель */}
      <div className="mt-8 border-t pt-8">
        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            className="form-checkbox h-5 w-5 text-blue-600"
            checked={!!landlord.hasRepresentative}
            onChange={(e) => {
              const isOn = e.target.checked;
              updateCurrentLandlord((cur) => {
                cur.hasRepresentative = isOn;
                if (isOn) ensureRepresentativeObject(cur);
              });
            }}
          />
          <span className="ml-2 text-lg font-medium">Действует через представителя</span>
        </div>

        {landlord.hasRepresentative && (
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Данные представителя</h3>

            {genitiveCaseNotice && (
              <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex justify-between items-start">
                  <div className="flex items-start">
                    <FontAwesomeIcon
                      icon={faExclamationCircle}
                      className="mr-2 text-yellow-500 mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <p className="text-yellow-700">
                        При наличии представителя укажите ФИО арендодателя в родительном падеже (кого? чего?)
                      </p>
                      <div className="mt-2 flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={handleFixNow}
                          className={`${PILL.base} ${PILL.warn} w-full sm:w-auto`}
                        >
                          Исправить сейчас
                        </button>

                        <button
                          type="button"
                          onClick={() => setGenitiveCaseNotice(false)}
                          className={`${PILL.base} ${PILL.subtle} w-full sm:w-auto`}
                        >
                          Скрыть
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Кнопка одноразового копирования представителя */}
            <div className="mt-2">
              <button
                type="button"
                className={`${BTN.base} ${BTN.outline}`}
                onClick={openCopyModal}
                disabled={!representativeHasData(landlord?.representative) || otherLandlords.length === 0}
                title={
                  otherLandlords.length === 0
                    ? 'Нет других карточек'
                    : (!representativeHasData(landlord?.representative)
                      ? 'Сначала заполните представителя у текущего'
                      : '')
                }
              >
                Скопировать этого представителя другим…
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-gray-700 mb-2"><b>ФИО представителя*</b></label>
                <input
                  type="text"
                  data-error-key="landlordAttorneyFullName"
                  className={`w-full p-3 border rounded-lg ${
                    currentErrors.landlordAttorneyFullName ? 'border-red-500' : 'border-gray-300'
                  }`}
                  value={landlord.representative.fullName}
                  onChange={(e) => handleRepresentativeFieldChange('fullName', e.target.value)}
                  placeholder="Фамилия Имя Отчество"
                />
                <ErrorMessage error={currentErrors.landlordAttorneyFullName} />
                {/* КНОПКА для Представителя АРЕНДОДАТЕЛЯ */}
	              <button
                  type="button"
                  onClick={() => { setFreeTextTarget('representative'); setFreeTextOpen(true); }}
                  className={`${BTN.base} ${BTN.subtle} mt-2`}
                >
                  Вставить паспортные данные текстом
                </button>

              </div>

              <div>
                <label className="block text-gray-700 mb-2"><b>Пол*</b></label>
                <div className="flex space-x-4">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      data-error-key="landlordAttorneyGender"
                      className="form-radio"
                      name={`attorney-gender-${currentLandlordIndex}`}
                      value="male"
                      checked={landlord.representative.gender === 'male'}
                      onChange={() => handleRepresentativeFieldChange('gender', 'male')}
                    />
                    <span className="ml-2">Мужской</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      data-error-key="landlordAttorneyGender"
                      className="form-radio"
                      name={`attorney-gender-${currentLandlordIndex}`}
                      value="female"
                      checked={landlord.representative.gender === 'female'}
                      onChange={() => handleRepresentativeFieldChange('gender', 'female')}
                    />
                    <span className="ml-2">Женский</span>
                  </label>
                </div>
                <ErrorMessage error={currentErrors.landlordAttorneyGender} />
              </div>

              <div>
                <label className="block text-gray-700 mb-2"><b>Дата рождения*</b></label>
                <input
                  type="text"
                  data-error-key="landlordAttorneyBirthDate"
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  value={landlord.representative.birthDate}
                  onChange={(e) =>
                    handleRepresentativeFieldChange('birthDate', formatDateInput(e.target.value))
                  }
                  placeholder="дд.мм.гггг"
                />
                <div className="text-sm text-gray-500 mt-1">
                  {landlord.representative.birthDate &&
                    `${formatDateToText(landlord.representative.birthDate)}`}
                </div>
                <ErrorMessage error={currentErrors.landlordAttorneyBirthDate} />
              </div>

              <div>
                <label className="block text-gray-700 mb-2"><b>Место рождения*</b></label>
                <input
                  type="text"
                  data-error-key="landlordAttorneyBirthPlace"
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  value={landlord.representative.birthPlace}
                  onChange={(e) => handleRepresentativeFieldChange('birthPlace', e.target.value)}
                  placeholder="Город, село и т.д."
                />
                <ErrorMessage error={currentErrors.landlordAttorneyBirthPlace} />
              </div>

              <div>
                <label className="block text-gray-700 mb-2"><b>Паспорт*</b></label>
                <input
                  type="text"
                  data-error-key="landlordAttorneyPassport"
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  value={landlord.representative.passport}
                  onChange={(e) =>
                    handleRepresentativeFieldChange('passport', formatPassportInput(e.target.value))
                  }
                  placeholder="Серия и номер"
                />
                <div className="text-sm text-gray-500 mt-1">
                  {landlord.representative.passport &&
                    formatPassportText(landlord.representative.passport)}
                </div>
                <ErrorMessage error={currentErrors.landlordAttorneyPassport} />
		            
              </div>

              <div>
                <label className="block text-gray-700 mb-2"><b>Кем выдан*</b></label>
                <input
                  type="text"
                  data-error-key="landlordAttorneyPassportIssued"
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  value={landlord.representative.passportIssued}
                  onChange={(e) => handleRepresentativeFieldChange('passportIssued', e.target.value)}
                  placeholder="Кем выдан паспорт"
                />
                <ErrorMessage error={currentErrors.landlordAttorneyPassportIssued} />
              </div>

              <div>
                <label className="block text-gray-700 mb-2"><b>Дата выдачи*</b></label>
                <input
                  type="text"
                  data-error-key="landlordAttorneyIssueDate"
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  value={landlord.representative.issueDate}
                  onChange={(e) => handleRepresentativeFieldChange('issueDate', formatDateInput(e.target.value))}
                  placeholder="дд.мм.гггг"
                />
                <div className="text-sm text-gray-500 mt-1">
                  {landlord.representative.issueDate &&
                    formatDateToText(landlord.representative.issueDate)}
                </div>
                <ErrorMessage error={currentErrors.landlordAttorneyIssueDate} />
              </div>

              <div>
                <label className="block text-gray-700 mb-2"><b>Код подразделения*</b></label>
                <input
                  type="text"
                  data-error-key="landlordAttorneyDepartmentCode"
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  value={landlord.representative.departmentCode}
                  onChange={(e) =>
                    handleRepresentativeFieldChange(
                      'departmentCode',
                      formatDepartmentCodeInput(e.target.value)
                    )
                  }
                  placeholder="000-000"
                />
                <ErrorMessage error={currentErrors.landlordAttorneyDepartmentCode} />
              </div>

              <div className="md:col-span-2">
                <label className="block text-gray-700 mb-2"><b>Адрес регистрации*</b></label>
                <input
                  type="text"
                  data-error-key="landlordAttorneyRegistration"
                  className={`w-full p-3 border rounded-lg ${
                    currentErrors.landlordAttorneyRegistration ? 'border-red-500' : 'border-gray-300'
                  }`}
                  value={landlord.representative.registration}
                  onChange={(e) => handleRepresentativeFieldChange('registration', e.target.value)}
                  placeholder="Полный адрес регистрации"
                />
                <ErrorMessage error={currentErrors.landlordAttorneyRegistration} />
              </div>

              <div className="md:col-span-2">
                <label className="block text-gray-700 mb-2"><b>Тип регистрации представителя</b></label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      checked={landlord.representative.registrationType === 'previous'}
                      onChange={() =>
                        handleLandlordAttorneyRegistrationTypeChange(
                          landlord.representative.registrationType === 'previous' ? '' : 'previous'
                        )
                      }
                    />
                    <span className="ml-2">Ранее</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      checked={landlord.representative.registrationType === 'temporary'}
                      onChange={() =>
                        handleLandlordAttorneyRegistrationTypeChange(
                          landlord.representative.registrationType === 'temporary' ? '' : 'temporary'
                        )
                      }
                    />
                    <span className="ml-2">Временная</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      checked={landlord.representative.registrationType === 'none'}
                      onChange={() =>
                        handleLandlordAttorneyRegistrationTypeChange(
                          landlord.representative.registrationType === 'none' ? '' : 'none'
                        )
                      }
                    />
                    <span className="ml-2">Без регистрации</span>
                  </label>
                </div>
              </div>

              <div className="md:col-span-2 border-t pt-4 mt-4">
                <h4 className="text-md font-semibold mb-4">Данные доверенности</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-gray-700 mb-2">Дата доверенности*</label>
                    <input
                      type="text"
                      data-error-key="landlordAttorneyDate"
                      className="w-full p-3 border border-gray-300 rounded-lg"
                      value={landlord.representative.attorneyDate}
                      onChange={(e) => handleAttorneyDateChange(e, 'attorneyDate')}
                      placeholder="дд.мм.гггг"
                    />
                    <div className="text-sm text-gray-500 mt-1">
                      {landlord.representative.attorneyDate &&
                        formatDateToText(landlord.representative.attorneyDate)}
                    </div>
                    <ErrorMessage error={currentErrors.landlordAttorneyDate} />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-2">Реестровый номер*</label>
                    <input
                      type="text"
                      data-error-key="landlordAttorneyNumber"
                      className="w-full p-3 border border-gray-300 rounded-lg"
                      value={landlord.representative.attorneyNumber}
                      onChange={(e) => handleRepresentativeFieldChange('attorneyNumber', e.target.value)}
                      placeholder="Номер доверенности"
                    />
                    <ErrorMessage error={currentErrors.landlordAttorneyNumber} />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-2">Кем удостоверена*</label>
                    <input
                      type="text"
                      data-error-key="landlordAttorneyIssuedBy"
                      className="w-full p-3 border border-gray-300 rounded-lg"
                      value={landlord.representative.attorneyIssuedBy}
                      onChange={(e) => handleRepresentativeFieldChange('attorneyIssuedBy', e.target.value)}
                      placeholder="Орган, выдавший доверенность"
                    />
                    <ErrorMessage error={currentErrors.landlordAttorneyIssuedBy} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* === MODAL: Скопировать представителя другим === */}
      {copyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white p-4 rounded shadow max-w-md w-full">
            <h3 className="text-lg font-semibold mb-3">Скопировать этого представителя другим…</h3>

            {otherLandlords.length === 0 ? (
              <p className="text-sm text-gray-600">Нет других карточек арендодателей.</p>
            ) : (
              <div className="max-h-64 overflow-auto border rounded p-2 space-y-2">
                {otherLandlords.map(({ index, label }) => (
                  <label key={index} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedTargets.includes(index)}
                      onChange={() => toggleTarget(index)}
                   />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 rounded border"
                onClick={() => setCopyOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded border"
                onClick={applyCopyToTargets}
                disabled={
                  !representativeHasData(landlord?.representative) ||
                  selectedTargets.length === 0
                }
                title={
                  !representativeHasData(landlord?.representative)
                    ? 'Сначала заполните представителя у текущего'
                    : (selectedTargets.length === 0 ? 'Выберите хотя бы одну карточку' : '')
                }
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandlordSection;
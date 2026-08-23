import React, { useCallback, useEffect, useRef, useState } from 'react';
import FreeTextImportModal from '../components/common/FreeTextImportModal';
import { parseFreeTextPerson } from '../utils/freeTextParser';
import { REGIONS } from '../constants/regions';
import CommercialActivityApiCloudSummary from '../components/counterparty/CommercialActivityApiCloudSummary';

const initialForm = {
  lastName: '',
  firstName: '',
  middleName: '',
  birthDate: '',
  regions: [],
  passportSeries: '',
  passportNumber: '',
  passportIssueDate: '',
  snils: '',
  passportIssuerCode: '',
  inn: '',
  };

export const SELECTIVE_SOURCE_GROUPS = [
  {
    title: 'API-cloud',
    sources: [
      { key: 'mvdPassport', label: 'Паспорт МВД' },
      { key: 'mvdWanted', label: 'Розыск МВД' },
      { key: 'stopOperRS', label: 'Приостановления операций по счетам' },
      { key: 'fssp', label: 'ФССП' },
      { key: 'efrsb', label: 'ЕФРСБ / Банкротство' },
      { key: 'rosfin', label: 'Росфинмониторинг' },
      { key: 'arbitrationApiCloudCombined', label: 'Арбитражные дела и судебные акты' },
      { key: 'fns', label: 'ФНС' },
      {
        key: 'legalEntityParticipationApiCloud',
        label: 'Участие в юридических лицах',
      },
      {
        key: 'commercialActivityApiCloud',
        label: 'Коммерческая деятельность связанных организаций (API-cloud)',
        hint: 'Включает дополнительные платные запросы KAD по найденным делам.',
      },
      { key: 'inoagent', label: 'Иноагенты' },
    ],
  },
  {
    title: 'Контур',
    sources: [
      { key: 'courtsCommon', label: 'Суды общей юрисдикции' },
      { key: 'passportKontur', label: 'Паспорт МВД / Контур' },
      { key: 'fsspKontur', label: 'ФССП / Контур' },
      { key: 'snilsKontur', label: 'СНИЛС / Контур' },
      { key: 'arbitrationKontur', label: 'Арбитраж / Контур' },
      { key: 'commercialActivityKontur', label: 'Коммерческая деятельность / Контур' },
      { key: 'wantedKontur', label: 'Розыск / Контур' },
      { key: 'bankruptcyKontur', label: 'Банкротство / Контур' },
      { key: 'rosfinKontur', label: 'Росфинмониторинг / Контур' },
    ],
  },
];

const SELECTIVE_SOURCE_KEYS = SELECTIVE_SOURCE_GROUPS
  .flatMap((group) => group.sources)
  .map((source) => source.key);

export const toggleSelectedSources = (sources, sourceKey) => {
  const selected = new Set(sources);
  if (selected.has(sourceKey)) {
    selected.delete(sourceKey);
    if (sourceKey === 'legalEntityParticipationApiCloud') selected.delete('commercialActivityApiCloud');
  } else {
    selected.add(sourceKey);
    if (sourceKey === 'commercialActivityApiCloud') selected.add('legalEntityParticipationApiCloud');
  }
  return SELECTIVE_SOURCE_KEYS.filter((key) => selected.has(key));
};

const SHORT_SOURCE_LABELS = {
  // API-cloud
  mvdPassport: 'Пас',
  mvdWanted: 'Роз',
  stopOperRS: 'Приост',
  fssp: 'ФССП',
  efrsb: 'ЕФРСБ',
  rosfin: 'РФМ',
  arbitrationApiCloudCombined: 'Арб',
  fns: 'ФНС',
  legalEntityParticipationApiCloud: 'Участ.ЮЛ',
  commercialActivityApiCloud: 'Ком.деят.ЮЛ',
  inoagent: 'Иноаг',

  // Контур
  courtsCommon: 'Суд',
  passportKontur: 'Пас',
  fsspKontur: 'ФССП',
  snilsKontur: 'СНИЛС',
  arbitrationKontur: 'Арб',
  commercialActivityKontur: 'Ком.деят',
  wantedKontur: 'Роз',
  bankruptcyKontur: 'Банкр',
  rosfinKontur: 'РФМ',
};

const APICLOUD_SOURCE_KEYS = new Set(
  SELECTIVE_SOURCE_GROUPS
    .find((group) => group.title === 'API-cloud')
    ?.sources.map((source) => source.key) || []
);

const KONTUR_SOURCE_KEYS = new Set(
  SELECTIVE_SOURCE_GROUPS
    .find((group) => group.title === 'Контур')
    ?.sources.map((source) => source.key) || []
);

const COUNTERPARTY_AGREEMENT_VERSION = 'v2026-04-29';

const COUNTERPARTY_CONSENT_TEXT = [
  'Пользователь подтверждает согласие на обработку персональных данных для выполнения проверки контрагента, участника сделки или объекта недвижимости.',
  'Пользователь подтверждает, что понимает необходимость передачи данных во внешние сервисы проверки, включая API-Cloud и Контур / Контур.Реестро.',
  'Если пользователь указывает данные третьего лица, пользователь подтверждает наличие согласия такого лица либо иного законного основания для передачи и обработки этих данных.',
  'Пользователь соглашается с сохранением результата проверки и истории проверки в личном кабинете.'
].join(' ');

const initialCounterpartyConsent = {
  acceptedPersonalData: false,
  acceptedExternalTransfer: false,
  acceptedThirdPartyBasis: false,
  acceptedReportStorage: false,
};

function CounterpartyCheckPage() {
  const [form, setForm] = useState(initialForm);
  const [regionsOpen, setRegionsOpen] = useState(false);
  const regionsDropdownRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState([]);

  const [activeCheckId, setActiveCheckId] = useState(null);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [innLookupLoading, setInnLookupLoading] = useState(false);
  const [innLookupError, setInnLookupError] = useState('');
  const [providerMode, setProviderMode] = useState('apicloud');
  const [selectedSources, setSelectedSources] = useState([]);
  const [counterpartyConsent, setCounterpartyConsent] = useState(
    initialCounterpartyConsent
  );

  const hasCounterpartyConsent =
    counterpartyConsent.acceptedPersonalData &&
    counterpartyConsent.acceptedExternalTransfer &&
    counterpartyConsent.acceptedThirdPartyBasis &&
    counterpartyConsent.acceptedReportStorage;

  const handleCounterpartyConsentChange = (name) => {
    setCounterpartyConsent((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  const buildCounterpartyConsentPayload = () => ({
    version: COUNTERPARTY_AGREEMENT_VERSION,
    privacyVersion: COUNTERPARTY_AGREEMENT_VERSION,
    pdnVersion: COUNTERPARTY_AGREEMENT_VERSION,
    termsVersion: COUNTERPARTY_AGREEMENT_VERSION,
    acceptedAt: new Date().toISOString(),

    acceptedPersonalData: counterpartyConsent.acceptedPersonalData,
    acceptedExternalTransfer: counterpartyConsent.acceptedExternalTransfer,
    acceptedThirdPartyBasis: counterpartyConsent.acceptedThirdPartyBasis,
    acceptedReportStorage: counterpartyConsent.acceptedReportStorage,

    consentText: COUNTERPARTY_CONSENT_TEXT,
  });
  const isKonturOnly = providerMode === 'kontur';
  const isSelectiveMode = providerMode === 'selective';
  const [freeTextOpen, setFreeTextOpen] = useState(false);
  const [activeEntityTab, setActiveEntityTab] = useState('person');
  const [activeRealEstateTab, setActiveRealEstateTab] = useState('address');
  const [realEstateForm, setRealEstateForm] = useState({
    address: '',
    cadastralNumber: '',
  });
  const [realEstateSearchResult, setRealEstateSearchResult] = useState(null);
  const HISTORY_PAGE_SIZE = 25;
  const apiBaseUrl =
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:5000'
      : '';
  const getAgreementUrl = (doc) =>
    `${apiBaseUrl}/api/agreements/html?doc=${doc}&v=${encodeURIComponent(
      COUNTERPARTY_AGREEMENT_VERSION
    )}`;
  const getNextPollDelayMs = (nextPollAt) => {
    const fallbackMs = 2000;
    const minMs = 1000;
    const maxMs = 30000;

    if (!nextPollAt) {
      return fallbackMs;
    }

    const ts = new Date(nextPollAt).getTime();
    if (!Number.isFinite(ts)) {
      return fallbackMs;
    }

    const diff = ts - Date.now();

    if (diff <= 0) {
      return minMs;
    }

    return Math.min(Math.max(diff, minMs), maxMs);
  };

  const loadHistory = useCallback(async (pageArg = 1, searchArg = '') => {
    setHistoryLoading(true);

    try {
      const qs = new URLSearchParams({
        page: String(pageArg),
        pageSize: String(HISTORY_PAGE_SIZE),
        search: String(searchArg || '').trim(),
      });

      const r = await fetch(`/api/counterparty/history?${qs.toString()}`, {
        credentials: 'include',
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok || !data.ok) {
        setHistory([]);
        setHistoryPages(1);
        setHistoryTotal(0);
        return [];
      }

      const items = Array.isArray(data.items) ? data.items : [];

      setHistory(items);
      setHistoryPage(Number(data.page || pageArg || 1));
      setHistoryPages(Number(data.pages || 1));
      setHistoryTotal(Number(data.total || 0));

      setSelectedHistoryIds((prev) =>
        prev.filter((id) => items.some((item) => item.id === id))
      );

      return items;
    } catch (err) {
      console.error('history load error', err);
      setHistory([]);
      setHistoryPages(1);
      setHistoryTotal(0);
      return [];
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  

  useEffect(() => {
    const timer = setTimeout(() => {
      loadHistory(historyPage, searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [historyPage, searchTerm, loadHistory]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        regionsDropdownRef.current &&
        !regionsDropdownRef.current.contains(event.target)
      ) {
        setRegionsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setHistoryPage(1);
  }, [searchTerm]);

    
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleToggleSelectedSource = (sourceKey) => {
    setSelectedSources((prev) => toggleSelectedSources(prev, sourceKey));
  };

  const handleRealEstateChange = (e) => {
    const { name, value } = e.target;
    setRealEstateForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRealEstateSubmit = async (e) => {
    e.preventDefault();

    setSubmitting(true);
    setError('');
    setResult(null);
    setRealEstateSearchResult(null);

    try {
      if (activeRealEstateTab === 'address') {
        const address = realEstateForm.address.trim();

        if (!address) {
          setError('Укажи адрес объекта.');
          return;
        }

        const res = await fetch('/api/counterparty/real-estate/cadastr-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ address }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.ok) {
          throw new Error(data?.message || data?.error || 'lookup_failed');
        }

        setRealEstateSearchResult({
          mode: 'address',
          address,
          items: Array.isArray(data.result?.items) ? data.result.items : [],
          message:
            data.result?.message ||
            (Array.isArray(data.result?.items) && data.result.items.length
              ? ''
              : 'По указанному адресу ничего не найдено.'),
        });

        return;
      }

      const cadastralNumber = realEstateForm.cadastralNumber.trim();

      if (!cadastralNumber) {
        setError('Укажи кадастровый номер.');
        return;
      }

      const res = await fetch('/api/counterparty/real-estate/object-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cadastralNumber }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data?.message || data?.error || 'object_lookup_failed');
      }

      setRealEstateSearchResult({
        id: data.result?.id || null,
        entityType: 'realEstate',
        lookupType: 'cadastralObject',
        mode: 'cadastral',
        cadastralNumber,
        item: data.result?.item || null,
        subject: data.result?.subject || null,
        status: data.result?.status || 'done',
        createdAt: data.result?.createdAt || null,
        message:
          data.result?.message ||
          (!data.result?.item ? 'Информация по объекту не найдена.' : ''),
      });

      await loadHistory(historyPage, searchTerm);
    } catch (err) {
      console.error('real estate submit error', err);
      setError('Не удалось выполнить поиск по адресу. Попробуй позже.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleRegion = (code) => {
  setForm((prev) => {
      const hasRegion = prev.regions.includes(code);

      return {
        ...prev,
        regions: hasRegion
          ? prev.regions.filter((item) => item !== code)
          : [...prev.regions, code],
      };
    });
  };

  const handleSelectAllRegions = () => {
    setForm((prev) => ({
      ...prev,
      regions: [],
    }));
  };

  const handleRemoveRegion = (code) => {
    setForm((prev) => ({
      ...prev,
      regions: prev.regions.filter((item) => item !== code),
    }));
  };

  const getRegionsButtonLabel = () => {
    if (!Array.isArray(form.regions) || form.regions.length === 0) {
      return 'Все регионы';
    }

    const selectedRegions = REGIONS.filter((region) =>
      form.regions.includes(region.code)
    );

    if (selectedRegions.length <= 2) {
      return selectedRegions.map((region) => region.name).join(', ');
    }

    return `Выбрано регионов: ${selectedRegions.length}`;
  };

  const splitFullName = (fullName = '') => {
    const parts = String(fullName || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return {
      lastName: parts[0] || '',
      firstName: parts[1] || '',
      middleName: parts[2] || '',
    };
  };

  const splitPassport = (passport = '') => {
    const digits = String(passport || '').replace(/\D/g, '');

    return {
      passportSeries: digits.slice(0, 4) || '',
      passportNumber: digits.slice(4, 10) || '',
    };
  };
  
  const toIsoDate = (value = '') => {
    const m = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
  };

  const applyFreeTextToForm = (rawText) => {
    const parsed = parseFreeTextPerson(rawText || '');
    const fio = splitFullName(parsed.fullName || '');
    const passport = splitPassport(parsed.passport || '');

    const birthDateIso = toIsoDate(parsed.birthDate || '');
    const issueDateIso = toIsoDate(parsed.issueDate || '');

    setForm((prev) => ({
      ...prev,
      lastName: fio.lastName || prev.lastName,
      firstName: fio.firstName || prev.firstName,
      middleName: fio.middleName || prev.middleName,
      birthDate: birthDateIso || prev.birthDate,
      passportSeries: passport.passportSeries || prev.passportSeries,
      passportNumber: passport.passportNumber || prev.passportNumber,
      passportIssueDate: issueDateIso || prev.passportIssueDate,
    }));
  };

  const handleInnLookup = async () => {
    // Сбросим текст ошибки поиска ИНН, если был
    setInnLookupError('');

    // Минимальная валидация
    if (
      !form.lastName ||
      !form.firstName ||
      !form.birthDate ||
      !form.passportSeries ||
      !form.passportNumber
    ) {
      setInnLookupError(
        'Для поиска ИНН заполните ФИО, дату рождения и серию/номер паспорта.'
      );
      return;
    }

    setInnLookupLoading(true);
    try {
      const resp = await fetch('/api/counterparty/inn-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person: form }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || 'Ошибка запроса ИНН');
      }

      const data = await resp.json();
      // data: { status: 'ok' | 'empty' | 'error', payload: { inn, found, message, ... } }

      if (data.status === 'ok' && data.payload && data.payload.found && data.payload.inn) {
        // Подставляем ИНН в форму
        setForm((prev) => ({
          ...prev,
          inn: data.payload.inn,
        }));
      } else if (data.status === 'empty') {
        setInnLookupError(data.payload?.message || 'ИНН не найден по указанным данным.');
      } else {
        setInnLookupError(
          data.payload?.message || 'Не удалось определить ИНН. Проверьте данные и попробуйте позже.'
        );
      }
    } catch (e) {
      console.error('inn-lookup error', e);
      setInnLookupError(e.message || 'Ошибка при запросе ИНН');
    } finally {
      setInnLookupLoading(false);
    }
  };
  
  const waitForResult = async (checkId) => {
    setActiveCheckId(checkId);

    // Polling ends through the terminal-status returns below.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await fetch(`/api/counterparty/check/${checkId}`, {
          credentials: 'include',
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 404) {
          setActiveCheckId(null);
          await loadHistory(historyPage, searchTerm);
          setError('Проверка не найдена. Возможно, она была удалена.');
          return;
        }

        if (res.ok && data.ok) {
          const status = data.status || data.result?.status || null;
          const payload = data.result || null;

          if (payload) {
            setResult((prev) =>
              prev
                ? { ...prev, ...payload, id: checkId, status }
                : { ...payload, id: checkId, status }
            );
          }

          if (status === 'done') {
            setError('');
            setActiveCheckId(null);
            await loadHistory(historyPage, searchTerm);
            return;
          }

          if (status === 'stalled') {
            setError(
              'Проверка не завершилась полностью в отведённый срок. Часть источников задерживается.'
            );
            setActiveCheckId(null);
            await loadHistory(historyPage, searchTerm);
            return;
          }

          if (status === 'error') {
            setError(data.error || payload?.error || 'Проверка завершилась с ошибкой.');
            setActiveCheckId(null);
            await loadHistory(historyPage, searchTerm);
            return;
          }

          const nextPollAt = data.nextPollAt || payload?.nextPollAt || null;
          const delayMs = getNextPollDelayMs(nextPollAt);

          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      } catch (err) {
        console.error('polling error', err);
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();

    if (providerMode === 'selective' && selectedSources.length === 0) {
      setError('Выберите хотя бы один источник для выборочной проверки.');
      return;
    }
    if (!hasCounterpartyConsent) {
      setError('Для запуска проверки необходимо подтвердить согласие на обработку и передачу персональных данных.');
      return;
    }

    setSubmitting(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/counterparty/check/person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...form,
          providerMode,
          selectedSources: providerMode === 'selective' ? selectedSources : [],
          counterpartyConsent: buildCounterpartyConsentPayload(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'failed');
      }

      setResult(data.result);

      if (data.result?.id) {
        await waitForResult(data.result.id);
      }
    } catch (err) {
      console.error('counterparty submit error', err);
      setError('Не удалось выполнить проверку. Попробуйте позже.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleHistorySelection = (checkId) => {
    setSelectedHistoryIds((prev) =>
      prev.includes(checkId)
        ? prev.filter((id) => id !== checkId)
        : [...prev, checkId]
    );
  };

  const handleToggleSelectAllHistory = () => {
    const pageIds = history.map((item) => item.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedHistoryIds.includes(id));

    setSelectedHistoryIds((prev) => {
      if (allSelected) {
        return prev.filter((id) => !pageIds.includes(id));
      }

      return [...new Set([...prev, ...pageIds])];
    });
  };

  const handleDeleteSelectedChecks = async () => {
    if (!selectedHistoryIds.length) return;

    const confirmed = window.confirm(`Удалить выбранные проверки (${selectedHistoryIds.length})?`);
    if (!confirmed) return;

    setBulkDeleting(true);

    try {
      const res = await fetch('/api/counterparty/history/delete-many', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: selectedHistoryIds }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'bulk_delete_failed');
      }

      setSelectedHistoryIds([]);

      const nextPage =
        history.length === data.deletedCount && historyPage > 1
          ? historyPage - 1
          : historyPage;

      await loadHistory(nextPage, searchTerm);

      if (result?.id && data.deletedIds?.includes(result.id)) {
        setResult(null);
      }

      if (activeCheckId && data.deletedIds?.includes(activeCheckId)) {
        setActiveCheckId(null);
      }
    } catch (err) {
      console.error('bulk delete error', err);
      setError('Не удалось удалить выбранные проверки.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDeleteCheck = async (checkId) => {
    const confirmed = window.confirm('Удалить эту проверку?');
    if (!confirmed) return;

    setDeletingId(checkId);
    try {
      const res = await fetch(`/api/counterparty/check/${checkId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'delete_failed');
      }

      setSelectedHistoryIds((prev) => prev.filter((id) => id !== checkId));

      if (result?.id === checkId) {
        setResult(null);
      }

      if (activeCheckId === checkId) {
        setActiveCheckId(null);
      }

      const nextPage =
        history.length === 1 && historyPage > 1
          ? historyPage - 1
          : historyPage;

      await loadHistory(nextPage, searchTerm);
    } catch (err) {
      console.error('delete check error', err);
      setError('Не удалось удалить проверку.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRepeatCheck = async (item) => {
    if (!hasCounterpartyConsent) {
      setError('Для повторной проверки необходимо подтвердить согласие на обработку и передачу персональных данных.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setResult(null);

      const historyPayload = item.payload || {};
      const normalizedHistoryProviderMode =
        typeof historyPayload.providerMode === 'string' && historyPayload.providerMode
          ? historyPayload.providerMode
          : Array.isArray(historyPayload.providers) && historyPayload.providers.length
            ? (
                historyPayload.providers.includes('apicloud') && historyPayload.providers.includes('kontur')
                  ? 'both'
                  : historyPayload.providers.includes('kontur')
                    ? 'kontur'
                    : 'apicloud'
              )
            : 'apicloud';
        console.log('repeat:item', item);
        console.log('repeat:item.payload', item.payload);
        console.log('repeat:historyPayload', historyPayload);
      const historySubject = item.subject || {};
      const resultSubject = item.data?.subject || {};

      const currentFormPassport = {
        series: form.passportSeries || '',
        number: form.passportNumber || '',
        issueDate: form.passportIssueDate || '',
        issuerCode: form.passportIssuerCode || '',
      };

      const source = {
        ...historySubject,
        ...resultSubject,
        ...historyPayload,

        // fallback из текущей формы
        lastName:
          historyPayload.lastName ||
          resultSubject.lastName ||
          historySubject.lastName ||
          form.lastName ||
          '',

        firstName:
          historyPayload.firstName ||
          resultSubject.firstName ||
          historySubject.firstName ||
          form.firstName ||
          '',

        middleName:
          historyPayload.middleName ||
          resultSubject.middleName ||
          historySubject.middleName ||
          form.middleName ||
          '',

        birthDate:
          historyPayload.birthDate ||
          resultSubject.birthDate ||
          historySubject.birthDate ||
          form.birthDate ||
          '',

        regions:
          Array.isArray(historyPayload.regions) ? historyPayload.regions :
          Array.isArray(resultSubject.regions) ? resultSubject.regions :
          Array.isArray(historySubject.regions) ? historySubject.regions :
          Array.isArray(form.regions) ? form.regions :
          [],

        inn:
          historyPayload.inn ||
          resultSubject.inn ||
          historySubject.inn ||
          form.inn ||
          '',

        snils:
          historyPayload.snils ||
          resultSubject.snils ||
          historySubject.snils ||
          form.snils ||
          '',

        passportSeries:
          historyPayload.passportSeries ||
          resultSubject.passportSeries ||
          historySubject.passportSeries ||
          historyPayload?.passport?.series ||
          resultSubject?.passport?.series ||
          historySubject?.passport?.series ||
          form.passportSeries ||
          '',

        passportNumber:
          historyPayload.passportNumber ||
          resultSubject.passportNumber ||
          historySubject.passportNumber ||
          historyPayload?.passport?.number ||
          resultSubject?.passport?.number ||
          historySubject?.passport?.number ||
          form.passportNumber ||
          '',

        passportIssueDate:
          historyPayload.passportIssueDate ||
          resultSubject.passportIssueDate ||
          historySubject.passportIssueDate ||
          historyPayload?.passport?.issueDate ||
          resultSubject?.passport?.issueDate ||
          historySubject?.passport?.issueDate ||
          form.passportIssueDate ||
          '',

        passportIssuerCode:
          historyPayload.passportIssuerCode ||
          resultSubject.passportIssuerCode ||
          historySubject.passportIssuerCode ||
          historyPayload?.passport?.issuerCode ||
          resultSubject?.passport?.issuerCode ||
          historySubject?.passport?.issuerCode ||
          form.passportIssuerCode ||
          '',
      };

      const fullNameParts = String(source.fullName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      const restoredProviderMode =
        normalizedHistoryProviderMode || providerMode;
      const restoredSelectedSources =
      restoredProviderMode === 'selective' && Array.isArray(historyPayload.selectedSources)
        ? historyPayload.selectedSources.filter((key) => SELECTIVE_SOURCE_KEYS.includes(key))
        : [];

      const payload = {
        lastName: source.lastName || fullNameParts[0] || '',
        firstName: source.firstName || fullNameParts[1] || '',
        middleName: source.middleName || fullNameParts[2] || '',
        birthDate: source.birthDate || '',
        regions: Array.isArray(source.regions) ? source.regions : [],
        passportSeries: source.passportSeries || currentFormPassport.series || '',
        passportNumber: source.passportNumber || currentFormPassport.number || '',
        passportIssueDate: source.passportIssueDate || currentFormPassport.issueDate || '',
        passportIssuerCode: source.passportIssuerCode || currentFormPassport.issuerCode || '',
        inn: source.inn || '',
        snils: source.snils || '',
        providerMode: restoredProviderMode,
        selectedSources: restoredSelectedSources,
        counterpartyConsent: buildCounterpartyConsentPayload(),
      };

      setForm({
        lastName: payload.lastName,
        firstName: payload.firstName,
        middleName: payload.middleName,
        birthDate: payload.birthDate,
        regions: payload.regions,
        passportSeries: payload.passportSeries,
        passportNumber: payload.passportNumber,
        passportIssueDate: payload.passportIssueDate,
        passportIssuerCode: payload.passportIssuerCode,
        snils: payload.snils,
        inn: payload.inn,
      });

      const res = await fetch('/api/counterparty/check/person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'repeat_failed');
      }

      setProviderMode(restoredProviderMode);
      setSelectedSources(restoredSelectedSources);

      setResult(data.result);

      if (data.result?.id) {
        await waitForResult(data.result.id);
      }
    } catch (err) {
      console.error('repeat check error', err);
      setError('Не удалось повторить проверку.');
    } finally {
      setSubmitting(false);
    }
  };

  const getSelectedSourcesSummary = (sources = []) => {
    const safeSources = Array.isArray(sources)
      ? sources.filter((key) => SELECTIVE_SOURCE_KEYS.includes(key))
      : [];

    if (!safeSources.length) {
      return '';
    }

    const apiCloudLabels = safeSources
      .filter((key) => APICLOUD_SOURCE_KEYS.has(key))
      .map((key) => SHORT_SOURCE_LABELS[key] || key);

    const konturLabels = safeSources
      .filter((key) => KONTUR_SOURCE_KEYS.has(key))
      .map((key) => SHORT_SOURCE_LABELS[key] || key);

    const parts = [];

    if (apiCloudLabels.length) {
      parts.push(`А: ${apiCloudLabels.join(', ')}`);
    }

    if (konturLabels.length) {
      parts.push(`К: ${konturLabels.join(', ')}`);
    }

    return parts.join('; ');
  };

  const getCheckSourceLabel = (item = {}) => {
    const payload = item.payload || {};
    const data = item.data || {};

    const providerMode =
      payload.providerMode ||
      data.providerMode ||
      item.providerMode ||
      '';

    const provider =
      item.provider ||
      payload.provider ||
      data.provider ||
      '';

    const selectedSources =
      Array.isArray(payload.selectedSources) && payload.selectedSources.length
        ? payload.selectedSources
        : Array.isArray(data.selectedSources)
        ? data.selectedSources
        : [];

    if (providerMode === 'selective') {
      const summary = getSelectedSourcesSummary(selectedSources);
      return summary ? `Выборочная: ${summary}` : 'Выборочная';
    }

    if (providerMode === 'both' || provider === 'mixed') {
      return 'API-cloud + Контур';
    }

    if (providerMode === 'kontur' || provider === 'kontur') {
      return 'Контур';
    }

    if (providerMode === 'apicloud' || provider === 'apicloud') {
      return 'API-cloud';
    }

    // fallback для старых записей, где providerMode мог не сохраниться
    if (Array.isArray(selectedSources) && selectedSources.length) {
      const summary = getSelectedSourcesSummary(selectedSources);
      return summary ? `Выборочная: ${summary}` : 'Выборочная';
    }

    return item.providerLabel || 'API-cloud';
  };

  const formatUnixDate = (value) => {
    if (value === undefined || value === null || value === '') return '—';

    const str = String(value).trim();

    // если дата уже пришла в нормальном виде, оставляем как есть
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(str)) {
      return str;
    }

    // unix seconds
    if (/^\d{10}$/.test(str)) {
      const date = new Date(Number(str) * 1000);
      if (Number.isNaN(date.getTime())) return str;
      return date.toLocaleDateString('ru-RU');
    }

    // unix milliseconds
    if (/^\d{13}$/.test(str)) {
      const date = new Date(Number(str));
      if (Number.isNaN(date.getTime())) return str;
      return date.toLocaleDateString('ru-RU');
    }

    return str;
  };

  const currentPageIds = history.map((item) => item.id);
  const allPageSelected =
    currentPageIds.length > 0 &&
    currentPageIds.every((id) => selectedHistoryIds.includes(id));

  const getStatusLabel = (status) => {
    if (!status) return '—';

    switch (status) {
      case 'ok':
        return 'Данные получены';
      case 'empty':
        return 'Нет данных';
      case 'error':
        return 'Ошибка при запросе';
      case 'processing':
        return 'Проверка выполняется';
      case 'skipped':
        return 'Не запускалась';
      default:
        return status;
    }
  };

  const formatMoney = (value) => {
    if (value === undefined || value === null || value === '') return '—';

    const raw = String(value).replace(/\s+/g, '').replace(',', '.');
    const num = Number(raw);

    if (!Number.isFinite(num)) return String(value);

    return num.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const SOURCE_TITLES = {
    mvdPassport: 'Проверка паспорта МВД',
    mvdWanted: 'Розыск МВД',
    stopOperRS: 'Приостановления операций по счетам',
    fssp: 'ФССП',
    efrsb: 'ЕФРСБ',
    rosfin: 'Росфинмониторинг',
    inoagent: 'Реестр иноагентов',
    kad: 'КАД Арбитр',
    rasArbitr: 'Арбитраж РФ',
    arbitrationApiCloudCombined: 'Арбитражные дела и судебные акты',
    fns: 'ФНС',
    legalEntityParticipationApiCloud: 'Участие в юридических лицах (API-cloud)',
    commercialActivityApiCloud:
      'Коммерческая деятельность связанных организаций (API-cloud)',
    courtsCommon: 'Суды общей юрисдикции',
    passportKontur: 'Проверка паспорта (Контур)',
    snilsKontur: 'Проверка СНИЛС (Контур)',
    fsspKontur: 'ФССП (Контур)',
    arbitrationKontur: 'Арбитраж (Контур)',
    wantedKontur: 'Розыск (Контур)',
    rosfinKontur: 'Росфинмониторинг (Контур)',
    bankruptcyKontur: 'Банкротство (Контур)',
    commercialActivityKontur: 'Коммерческая деятельность (Контур)',
  };

  const SOURCE_ORDER = [
    'mvdPassport',
    'passportKontur',
    'mvdWanted',
    'wantedKontur',
    'stopOperRS',
    'fns',
    'legalEntityParticipationApiCloud',
    'commercialActivityApiCloud',
    'rosfin',
    'inoagent',
    'rosfinKontur',
    'efrsb',
    'bankruptcyKontur',
    'fssp',
    'fsspKontur',
    'arbitrationApiCloudCombined',
    'arbitrationKontur',
    'courtsCommon',
    'commercialActivityKontur',
  ];

  // ---------- Рендер содержимого конкретных источников ----------
  const renderMvdPassport = (items) => {
    const row = items[0] || {};
    const verification = row.verification || {};

    const message = row.message || row.rawRecord?.description || '—';
    const resultState = row.resultState || row.rawRecord?.result || '—';
    const resultStateText =
      row.resultStateText ||
      (row.isValid === true
        ? 'Паспорт действителен'
        : row.isValid === false
        ? 'Паспорт недействителен / не найден'
        : 'Статус не определён');

    const badgeClass =
      row.isValid === true
        ? 'bg-green-100 text-green-800'
        : row.isValid === false
        ? 'bg-red-100 text-red-800'
        : 'bg-slate-100 text-slate-700';

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
          {resultStateText}
        </div>

        <div className="border rounded-lg p-3 bg-slate-50">
          <div className="text-xs font-semibold text-gray-700 mb-2">Проверяемые данные</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Серия</td>
                <td className="px-2 py-1">{verification.series || '—'}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Номер</td>
                <td className="px-2 py-1">{verification.number || '—'}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Дата выдачи</td>
                <td className="px-2 py-1">{verification.issueDate || '—'}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Код подразделения</td>
                <td className="px-2 py-1">{verification.issuerCode || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Статус МВД</td>
                <td className="px-2 py-1">{resultState}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{message}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderMvdWanted = (items) => {
    const row = items[0] || {};
    const verification = row.verification || {};
    const records = Array.isArray(row.records) ? row.records : [];

    const resultStateText =
      row.resultStateText ||
      (row.isFound === true
        ? 'Лицо найдено в базе розыска МВД'
        : row.isFound === false
        ? 'По базе розыска МВД совпадений не найдено'
        : 'Статус не определён');

    const badgeClass =
      row.isFound === true
        ? 'bg-red-100 text-red-800'
        : row.isFound === false
        ? 'bg-green-100 text-green-800'
        : 'bg-slate-100 text-slate-700';

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
          {resultStateText}
        </div>

        <div className="border rounded-lg p-3 bg-slate-50">
          <div className="text-xs font-semibold text-gray-700 mb-2">Проверяемые данные</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Фамилия</td>
                <td className="px-2 py-1">{verification.lastName || '—'}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Имя</td>
                <td className="px-2 py-1">{verification.firstName || '—'}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Отчество</td>
                <td className="px-2 py-1">{verification.middleName || '—'}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Дата рождения</td>
                <td className="px-2 py-1">{verification.birthDate || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Статус ответа</td>
                <td className="px-2 py-1">{row.resultState ?? '—'}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество совпадений</td>
                <td className="px-2 py-1">{row.foundCount ?? '0'}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{row.message || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {records.length > 0 && (
          <div className="border rounded-lg p-3 bg-red-50">
            <div className="text-xs font-semibold text-gray-700 mb-2">Найденные записи</div>
            <div className="space-y-2">
              {records.map((record, idx) => (
                <div key={idx} className="border rounded p-2 bg-white text-xs">
                  <div><span className="font-medium">ФИО:</span> {record.fullName || '—'}</div>
                  {record.imageUrl && (
                    <div className="mt-1">
                      <a
                        href={record.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline"
                      >
                        Фото из базы МВД
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStopOperRS = (items = [], source = {}) => {
    const summary = source.summary || {};
    const row = items[0] || {};

    const resultStateText =
      row.resultStateText ||
      (summary.hasRestrictions
        ? 'Найдены действующие приостановления операций по счетам'
        : 'Действующие приостановления операций по счетам не найдены');

    const badgeClass = summary.hasRestrictions
      ? 'bg-red-100 text-red-800'
      : 'bg-green-100 text-green-800';

    const resultComment =
      row.message ||
      (summary.hasRestrictions
        ? 'Найдены действующие приостановления операций по счетам.'
        : 'Действующие приостановления операций по счетам не найдены.');

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-[11px] font-medium ${badgeClass}`}>
          {resultStateText}
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">
            Сводка по приостановлениям операций
          </div>

          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-52">Всего записей</td>
                <td className="px-2 py-1">{summary.totalCount ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество банков / БИК</td>
                <td className="px-2 py-1">{summary.banksCount ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество решений</td>
                <td className="px-2 py-1">{summary.decisionsCount ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Отрицательное сальдо ЕНС</td>
                <td className="px-2 py-1">
                  {summary.negativeBalance !== undefined &&
                  summary.negativeBalance !== null &&
                  summary.negativeBalance !== ''
                    ? `${formatMoney(summary.negativeBalance)} ₽`
                    : '—'}
                </td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{resultComment}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderFns = (items = [], source = {}) => {
    const summary = source.summary || {};
    const firstItem = items[0] || {};

    const isLookupOnly =
      items.length > 0 &&
      items.every((item) => item?.kind === 'fns_lookup');

    const records = isLookupOnly
      ? []
      : items.filter((item) => item?.kind === 'fns_ip_record');

    const resultComment =
      summary.hasActiveIp
        ? 'Найдены сведения о действующем ИП.'
        : summary.hasClosedIp
        ? 'Найдены сведения о прекращённой деятельности ИП.'
        : firstItem.message || 'Сведения о регистрации в качестве ИП не найдены.';

    const badgeText =
      summary.hasActiveIp
        ? 'Найден действующий статус ИП'
        : summary.hasClosedIp
        ? 'Найдены сведения о прекращённой деятельности ИП'
        : 'Сведения о регистрации в качестве ИП не найдены';

    const badgeClass =
      summary.hasActiveIp
        ? 'bg-blue-100 text-blue-800'
        : summary.hasClosedIp
        ? 'bg-slate-200 text-slate-700'
        : 'bg-green-100 text-green-800';

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
          {badgeText}
        </div>

        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Сводка по коммерческой деятельности
          </div>

          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-56">Всего записей</td>
                <td className="px-2 py-1">{summary.totalCount ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Действующих ИП</td>
                <td className="px-2 py-1">{summary.activeCount ?? 0}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Прекращённых ИП</td>
                <td className="px-2 py-1">{summary.closedCount ?? 0}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Статус ответа</td>
                <td className="px-2 py-1">
                  {firstItem.resultState || getStatusLabel(source.status)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество записей</td>
                <td className="px-2 py-1">{summary.totalCount ?? 0}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{resultComment}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {records.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">Найденные записи</div>

            {records.map((row, idx) => {
              const rowBadgeClass =
                row.isActive === true
                  ? 'bg-blue-100 text-blue-800'
                  : row.isActive === false
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-slate-100 text-slate-700';

              return (
                <div key={idx} className="border rounded-lg p-3 bg-white space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-800">
                      {row.fullName || 'Запись без ФИО'}
                    </div>
                    <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${rowBadgeClass}`}>
                      {row.statusText || 'Статус не определён'}
                    </div>
                  </div>

                  <table className="min-w-full text-xs border">
                    <tbody>
                      <tr className="border-b">
                        <td className="px-2 py-1 font-medium w-48">ФИО</td>
                        <td className="px-2 py-1">{row.fullName || '—'}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-2 py-1 font-medium">ОГРНИП</td>
                        <td className="px-2 py-1">{row.ogrn || '—'}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-2 py-1 font-medium">ИНН</td>
                        <td className="px-2 py-1">{row.inn || '—'}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-2 py-1 font-medium">Статус ИП</td>
                        <td className="px-2 py-1">{row.statusText || '—'}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-2 py-1 font-medium">Дата регистрации</td>
                        <td className="px-2 py-1">{row.registrationDate || '—'}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-2 py-1 font-medium">Основной ОКВЭД</td>
                        <td className="px-2 py-1">{row.okved || '—'}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-2 py-1 font-medium">Расшифровка ОКВЭД</td>
                        <td className="px-2 py-1">{row.okvedName || '—'}</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 font-medium">Участник ЭДО</td>
                        <td className="px-2 py-1">{row.edo || '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderInoagent = (items = [], source = {}) => {
    const summary = source.summary || {};
    const row = items[0] || {};

    const hasActiveMatches = !!summary.hasActiveMatches;
    const hasExcludedMatches = !!summary.hasExcludedMatches;

    const resultComment =
      hasActiveMatches
        ? 'Найдены действующие записи в реестре иноагентов.'
        : hasExcludedMatches
        ? 'Найдены архивные / исключённые записи в реестре иноагентов.'
        : row.message || 'Сведения в реестре иноагентов не найдены.';

    const badgeText =
      hasActiveMatches
        ? 'Найдены действующие записи в реестре иноагентов'
        : hasExcludedMatches
        ? 'Найдены исключённые записи в реестре иноагентов'
        : 'Сведения в реестре иноагентов не найдены';

    const badgeClass =
      hasActiveMatches
        ? 'bg-red-100 text-red-800'
        : hasExcludedMatches
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-green-100 text-green-800';

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
          {badgeText}
        </div>

        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Сводка по реестру иноагентов
          </div>

          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-56">Всего совпадений</td>
                <td className="px-2 py-1">{summary.totalCount ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Действующих записей</td>
                <td className="px-2 py-1">{summary.activeCount ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Исключённых записей</td>
                <td className="px-2 py-1">{summary.excludedCount ?? 0}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Дата обновления реестра</td>
                <td className="px-2 py-1">{summary.dateUpdate || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Статус ответа</td>
                <td className="px-2 py-1">
                  {row.resultState || getStatusLabel(source.status)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество совпадений</td>
                <td className="px-2 py-1">{row.foundCount ?? summary.totalCount ?? 0}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{resultComment}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderRosfin = (items = []) => {
    const row = items[0] || {};
    const records = Array.isArray(row.records) ? row.records : [];

    const resultStateText =
      row.resultStateText ||
      (row.isFound === true
        ? 'Найдены совпадения в списках Росфинмониторинга'
        : row.isFound === false
        ? 'Сведений в списках Росфинмониторинга не найдено'
        : 'Статус не определён');

    const badgeClass =
      row.isFound === true
        ? 'bg-red-100 text-red-800'
        : row.isFound === false
        ? 'bg-green-100 text-green-800'
        : 'bg-slate-100 text-slate-700';

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
          {resultStateText}
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Статус ответа</td>
                <td className="px-2 py-1">{row.resultState ?? '—'}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество совпадений</td>
                <td className="px-2 py-1">{row.foundCount ?? 0}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{row.message || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {records.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">Найденные записи</div>

            {records.map((record, idx) => (
              <div key={idx} className="border rounded-lg p-3 bg-red-50 space-y-2">
                <div className="text-sm font-semibold text-gray-800">
                  {record.fullName || 'Запись без ФИО'}
                </div>

                <table className="min-w-full text-xs border bg-white">
                  <tbody>
                    <tr className="border-b">
                      <td className="px-2 py-1 font-medium w-48">ФИО</td>
                      <td className="px-2 py-1">{record.fullName || '—'}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-2 py-1 font-medium">Дата рождения</td>
                      <td className="px-2 py-1">{record.birthDate || '—'}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-2 py-1 font-medium">Место рождения</td>
                      <td className="px-2 py-1">{record.birthPlace || '—'}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-2 py-1 font-medium">Тип записи</td>
                      <td className="px-2 py-1">{record.recordTypeText || record.recordType || '—'}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-2 py-1 font-medium">ID записи</td>
                      <td className="px-2 py-1">{record.recordId || '—'}</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 font-medium">Основание совпадения</td>
                      <td className="px-2 py-1">{record.matchReasonText || '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
  
  const renderRosfinKonturTable = (items = [], source = {}) => {
    const realItems = items.filter((item) => item.kind === 'rosfin_person_record');

    if (!realItems.length) {
      return (
        <div className="text-xs text-green-700">
          Совпадений в перечнях Росфинмониторинга не найдено.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="border rounded-lg px-3 py-2 text-xs bg-red-50 border-red-200 text-red-800">
          <div className="font-semibold">Найдено совпадений: {realItems.length}</div>
          <div className="mt-1">Есть совпадения в перечнях Росфинмониторинга.</div>
        </div>

        {realItems.map((row, idx) => {
          const tone =
            row.severity === 'danger'
              ? 'border-red-200 bg-red-50'
              : row.severity === 'warning'
              ? 'border-yellow-200 bg-yellow-50'
              : 'border-slate-200 bg-slate-50';

          const badge =
            row.severity === 'danger'
              ? 'bg-red-100 text-red-800'
              : row.severity === 'warning'
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-slate-100 text-slate-700';

          return (
            <div key={idx} className={`border rounded-lg p-3 space-y-2 ${tone}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800">
                    {row.listTypeText || 'Росфинмониторинг'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {row.fullName || 'Запись без ФИО'}
                  </div>
                </div>

                <span className={`inline-flex px-2 py-1 rounded text-[11px] font-semibold ${badge}`}>
                  {row.stateText || 'Совпадение найдено'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div><span className="font-medium">ФИО:</span> {row.fullName || '—'}</div>
                <div><span className="font-medium">Дата рождения:</span> {row.birthDate || '—'}</div>
                <div><span className="font-medium">Место рождения:</span> {row.birthPlace || '—'}</div>
                <div><span className="font-medium">Основание совпадения:</span> {row.foundByText || '—'}</div>
                <div className="md:col-span-2"><span className="font-medium">Комментарий:</span> {row.message || '—'}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderArbitrationApiCloudCombined = (source = {}) => {
    const summary = source.summary || {};
    const totalCases = Number(summary.totalCases || 0);
    const hasBankruptcyCase = summary.hasBankruptcyCase === true;

    const topBadgeText =
      totalCases === 0
        ? 'Арбитражные дела не найдены'
        : hasBankruptcyCase
        ? 'Найдены арбитражные дела о банкротстве'
        : 'Найдены арбитражные дела';

    const topBadgeClass =
      totalCases === 0
        ? 'bg-green-100 text-green-800'
        : hasBankruptcyCase
        ? 'bg-red-100 text-red-800'
        : 'bg-yellow-100 text-yellow-800';

    const resultComment =
      totalCases === 0
        ? 'Арбитражные дела не найдены.'
        : hasBankruptcyCase
        ? 'Найдены арбитражные дела, в том числе дела о банкротстве. Полная детализация доступна в отчёте.'
        : 'Найдены арбитражные дела. Полная детализация доступна в отчёте.';

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${topBadgeClass}`}>
          {topBadgeText}
        </div>

        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Общая сводка по арбитражным делам
          </div>

          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-64">Всего дел</td>
                <td className="px-2 py-1">{summary.totalCases ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Надёжных совпадений по ИНН</td>
                <td className="px-2 py-1">{summary.innMatchedCases ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Совпадений только по ФИО</td>
                <td className="px-2 py-1">{summary.fioOnlyMatchedCases ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Проверяемый — истец</td>
                <td className="px-2 py-1">{summary.plaintiffCases ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Проверяемый — ответчик</td>
                <td className="px-2 py-1">{summary.respondentCases ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Истец и ответчик одновременно</td>
                <td className="px-2 py-1">{summary.mixedRoleCases ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Банкротных дел</td>
                <td className="px-2 py-1">{summary.bankruptcyCases ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Дел с найденными судебными актами</td>
                <td className="px-2 py-1">{summary.casesWithDocuments ?? 0}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Всего судебных актов</td>
                <td className="px-2 py-1">{summary.totalDocuments ?? 0}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-48">Статус ответа</td>
                <td className="px-2 py-1">{getStatusLabel(source.status)}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество дел</td>
                <td className="px-2 py-1">{summary.totalCases ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Банкротные дела</td>
                <td className="px-2 py-1">{summary.bankruptcyCases ?? 0}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{resultComment}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };
    
  const renderSource = (key, source) => {
    const items = Array.isArray(source.items) ? source.items : [];
    const title = SOURCE_TITLES[key] || key;
    const statusLabel = getStatusLabel(source.status);
    const provider = source.provider || '—';

    const hasItems = items.length > 0;

    let content = null;
    if (key === 'commercialActivityApiCloud') {
      content = <CommercialActivityApiCloudSummary source={source} />;
    } else if (key === 'arbitrationApiCloudCombined') {
      content = renderArbitrationApiCloudCombined(source);
    } else
    if (source.status === 'error') {
      content = (
        <div className="text-xs text-red-600">
          {source.error || 'Ошибка получения данных из сервиса.'}
        </div>
      );
    } else if (source.status === 'processing') {
      content = (
        <div className="text-xs text-amber-700">
          {source.error || 'Проверка ещё выполняется.'}
        </div>
      );
    } else if (source.status === 'skipped') {
      content = (
        <div className="text-xs text-gray-500">
          {source.message || 'Проверка не запускалась.'}
        </div>
      );
    } else if (!hasItems) {
      switch (key) {
        case 'fssp':
          content = renderFssp(items, source);
          break;
        case 'efrsb':
          content = renderEfrsb(items, source);
          break;
        case 'rosfin':
          content = renderRosfin(items, source);
          break;
        case 'inoagnet':
          content = renderInoagent(items, source);
          break;
        case 'fns':
          content = renderFns(items, source);
          break;
        case 'legalEntityParticipationApiCloud':
          content = renderLegalEntityParticipationApiCloud(
            items,
            source
          );
          break;
        case 'stopOperRS':
          content = renderStopOperRS(items, source);
          break;
        default:
          content = <div className="text-xs text-gray-500">Нет записей</div>;
      }

    } else {
      switch (key) {
        case 'mvdPassport':
          content = renderMvdPassport(items);
          break;
        case 'mvdWanted':
          content = renderMvdWanted(items);
          break;
        case 'stopOperRS':
          content = renderStopOperRS(items, source);
          break;
        case 'fns':
          content = renderFns(items, source);
          break;
        case 'legalEntityParticipationApiCloud':
          content = renderLegalEntityParticipationApiCloud(
            items,
            source
          );
          break;
        case 'rosfin':
          content = renderRosfin(items, source);
          break;
        case 'inoagent':
          content = renderInoagent(items, source);
          break;
        case 'fssp':
          content = renderFssp(items, source);
          break;
        case 'efrsb':
          content = renderEfrsb(items, source);
          break;
        case 'kad':
          content = renderKad(items);
          break;
        case 'rasArbitr':
          content = renderRasArbitr(items);
          break;
        case 'courtsCommon':
          content = renderCourtsCommonTable(items);
          break;
        case 'passportKontur':
          content = renderPassportKonturTable(items);
          break;
        case 'snilsKontur':
          content = renderSnilsKonturTable(items);
          break;
        case 'wantedKontur':
          content = renderWantedKonturTable(items);
          break;
        case 'rosfinKontur':
          content = renderRosfinKonturTable(items, source);
          break;
        case 'bankruptcyKontur':
          content = renderBankruptcyKonturTable(items, source);
          break;
        case 'fsspKontur':
          content = renderFsspKonturTable(items, source);
          break;
        case 'arbitrationKontur':
          content = renderArbitrationKonturTable(items, source);
          break;
        case 'commercialActivityKontur':
          content = renderCommercialActivityKonturTable(items, source);
          break;
        default:
          content = renderDefaultTable(items);
      }
    }

    return (
      <div
        key={key}
        className={`border rounded-lg p-3 bg-white shadow-sm space-y-2 ${
          key === 'commercialActivityApiCloud' ? 'md:col-span-2' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-700 font-semibold">{title}</div>
            <div className="text-xs text-gray-500">Провайдер: {provider}</div>
          </div>
          <span
            className={
              'inline-flex items-center px-2 py-1 rounded text-[11px] font-medium ' +
              (source.status === 'ok'
                ? 'bg-green-50 text-green-700'
                : source.status === 'empty'
                ? 'bg-gray-50 text-gray-600'
                : source.status === 'error'
                ? 'bg-red-50 text-red-700'
                : source.status === 'processing'
                ? 'bg-yellow-50 text-yellow-700'
                : source.status === 'skipped'
                ? 'bg-slate-50 text-slate-600'
                : 'bg-gray-50 text-gray-600')
            }
          >
            {statusLabel}
          </span>
        </div>

        <div>{content}</div>
      </div>
    );
  };

  // ---------- FSSP: таблица по исполнительным производствам ----------
  const renderFssp = (items = [], source = {}) => {
    const summary = source.summary || {};
    
    const hasRecords = Number(summary.totalCount || 0) > 0;
    const hasBankruptcyRisk = summary.bankruptcyRisk === true;

    const badgeText = !hasRecords
      ? 'Исполнительные производства не найдены'
      : hasBankruptcyRisk
      ? 'Есть риск банкротства'
      : 'Найдены исполнительные производства';

    const badgeClass = !hasRecords
      ? 'bg-green-100 text-green-800'
      : hasBankruptcyRisk
      ? 'bg-red-100 text-red-800'
      : 'bg-yellow-100 text-yellow-800';

    const resultComment = !hasRecords
      ? 'По данным ФССП исполнительные производства не найдены.'
      : hasBankruptcyRisk
      ? 'Найдены исполнительные производства, общая сумма превышает 500 000 ₽.'
      : 'Найдены исполнительные производства. Полная детализация доступна в отчёте.';

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
          {badgeText}
        </div>

        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Сводка по исполнительным производствам
          </div>

          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-56">Всего производств</td>
                <td className="px-2 py-1">{summary.totalCount ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Общая сумма задолженности</td>
                <td className="px-2 py-1">
                  {summary.totalAmount != null ? `${formatMoney(summary.totalAmount)} ₽` : '—'}
                </td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Активных производств</td>
                <td className="px-2 py-1">{summary.activeCount ?? 0}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Завершённых / прекращённых</td>
                <td className="px-2 py-1">{summary.closedCount ?? 0}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Количество регионов / ОСП</td>
                <td className="px-2 py-1">{summary.regionsCount ?? 0}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Статус ответа</td>
                <td className="px-2 py-1">{getStatusLabel(source.status)}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество записей</td>
                <td className="px-2 py-1">{summary.totalCount ?? 0}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{resultComment}</td>
              </tr>
            </tbody>
          </table>
        </div>
       
      </div>
    );
  };

  // ---------- ЕФРСБ: краткая сводка + табличка при наличии данных ----------
  const renderEfrsb = (items = [], source = {}) => {
    const summary = source.summary || {};
    const activeItems = Array.isArray(summary.activeItems) ? summary.activeItems : [];
    const finishedItems = Array.isArray(summary.finishedItems) ? summary.finishedItems : [];
    const statusText = getStatusLabel(source.status);
    const totalCount = summary.totalCount ?? items.length ?? 0;

    const resultComment =
      summary.hasActiveBankruptcy
        ? 'По данным ЕФРСБ обнаружены активные процедуры банкротства.'
        : summary.hasFinishedBankruptcy
        ? 'По данным ЕФРСБ обнаружены завершённые процедуры банкротства.'
        : 'Сведения о процедурах банкротства не найдены.';

    const formatDate = (value) => {
      if (!value) return '—';

      const str = String(value).trim();

      if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const date = new Date(str);
        if (!Number.isNaN(date.getTime())) {
          return date.toLocaleDateString('ru-RU');
        }
      }

      return str;
    };

    const getTopBadge = () => {
      if (summary.hasActiveBankruptcy) {
        return {
          text: 'Обнаружены активные процедуры банкротства',
          className: 'bg-red-100 text-red-800',
        };
      }

      if (summary.hasFinishedBankruptcy) {
        return {
          text: 'Обнаружены завершённые процедуры банкротства',
          className: 'bg-yellow-100 text-yellow-800',
        };
      }

      return {
        text: 'Сведения о процедурах банкротства не найдены',
        className: 'bg-green-100 text-green-800',
      };
    };

    const getShortMatchText = (row = {}) => {
      if (row.matchText) return row.matchText;

      if (Array.isArray(row.matchedBy) && row.matchedBy.length) {
        return `Совпадение по ${row.matchedBy.join(', ')}`;
      }

      if (row.matchType === 'FullMatch') return 'Полное совпадение';
      if (row.matchType === 'PartialMatch') return 'Частичное совпадение';
      if (row.matchType === 'WeakMatch') return 'Совпадение только по ФИО';

      return 'Совпадение не уточнено';
    };

    const getStatusShortText = (row = {}) => {
      if (row.isActive === true) return 'Активная процедура';
      if (row.isActive === false) return 'Процедура завершена';
      return row.statusText || 'Статус не определён';
    };

    const badge = getTopBadge();

    const shortItems = [...activeItems, ...finishedItems].slice(0, 3);

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badge.className}`}>
          {badge.text}
        </div>

        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-sm font-semibold text-gray-900 mb-2">Сводка по ЕФРСБ</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-56">Всего записей</td>
                <td className="px-2 py-1">{totalCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Активных процедур</td>
                <td className="px-2 py-1">{summary.activeCount ?? 0}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Завершённых процедур</td>
                <td className="px-2 py-1">{summary.finishedCount ?? 0}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Статус ответа</td>
                <td className="px-2 py-1">{statusText}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество записей</td>
                <td className="px-2 py-1">{totalCount}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{resultComment}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {shortItems.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">
              Краткая справка по найденным процедурам
            </div>

            {shortItems.map((row, idx) => (
              <div key={idx} className="border rounded-lg p-3 bg-white">
                <table className="min-w-full text-xs border">
                  <tbody>
                    <tr className="border-b">
                      <td className="px-2 py-1 font-medium w-48">Номер дела</td>
                      <td className="px-2 py-1">{row.caseNumber || '—'}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-2 py-1 font-medium">Статус</td>
                      <td className="px-2 py-1">{getStatusShortText(row)}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-2 py-1 font-medium">Последнее обновление</td>
                      <td className="px-2 py-1">{formatDate(row.updateDate)}</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 font-medium">Совпадение</td>
                      <td className="px-2 py-1">{getShortMatchText(row)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            {totalCount > shortItems.length && (
              <div className="text-xs text-gray-500">
                На фронте показаны только первые {shortItems.length} записи. Полная детализация доступна в отчёте.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ---------- КАД: дела арбитражных судов ----------
  const renderKad = (items) => {
    const first = items[0];
    const raw = first?.rawRecord;

    // Если это «обёртка» kind=kad_lookup с массивом Result
    let cases = [];
    if (first?.kind === 'kad_lookup' && raw && Array.isArray(raw.Result)) {
      cases = raw.Result;
    } else {
      // Иначе считаем, что каждый элемент — отдельное дело
      cases = items;
    }

    if (!cases.length) {
      return (
        <div className="text-xs">
          {first?.message || 'Дела в КАД не найдены.'}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 border">№ дела</th>
              <th className="px-2 py-1 border">Суд</th>
              <th className="px-2 py-1 border">Роль</th>
              <th className="px-2 py-1 border">Сумма иска</th>
              <th className="px-2 py-1 border">Стадия / статус</th>
              <th className="px-2 py-1 border">Ссылка</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c, idx) => {
              const caseNumber =
                c.caseNumber ||
                c.CaseNumber ||
                c.CaseNumberShort ||
                c.case_number ||
                '—';
              const court =
                c.court ||
                c.Court ||
                c.CourtName ||
                c.courtName ||
                '—';
              const role =
                c.role ||
                c.Role ||
                c.participantRole ||
                c.side ||
                '—';
              const amount =
                c.sum || c.Sum || c.ClaimSum || c.claimSum || null;
              const stage =
                c.stage ||
                c.Stage ||
                c.stageName ||
                c.Status ||
                c.status ||
                '—';
              const url =
                c.CardUrl || c.CaseUrl || c.Url || c.url || null;

              const formatMoney = (v) => {
                if (!v) return '—';
                const num =
                  parseFloat(String(v).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
                return `${num.toLocaleString('ru-RU', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} ₽`;
              };

              return (
                <tr key={idx} className="border-t">
                  <td className="px-2 py-1 border">{caseNumber}</td>
                  <td className="px-2 py-1 border">{court}</td>
                  <td className="px-2 py-1 border">{role}</td>
                  <td className="px-2 py-1 border">{formatMoney(amount)}</td>
                  <td className="px-2 py-1 border">{stage}</td>
                  <td className="px-2 py-1 border">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Открыть
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderLegalEntityParticipationApiCloud = (
    items = [],
    source = {}
  ) => {
    const summary = source?.summary || {};

    const totalCount = Number(
      summary.totalCount ?? items.length ?? 0
    );

    const hasOrganizations = totalCount > 0;

    const badgeText = hasOrganizations
      ? 'Найдены сведения об участии в юридических лицах'
      : 'Сведения об участии в юридических лицах не найдены';

    const badgeClass = hasOrganizations
      ? 'bg-blue-100 text-blue-800'
      : 'bg-slate-100 text-slate-700';

    const comment =
      source?.message ||
      (hasOrganizations
        ? 'Найдены сведения об участии проверяемого в юридических лицах. Подробный перечень организаций приведён в отчёте.'
        : 'Сведения об участии проверяемого в юридических лицах не найдены.');

    return (
      <div className="space-y-3">
        <div
          className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}
        >
          {badgeText}
        </div>

        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Сводка проверки
          </div>

          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-64">
                  Найдено уникальных юридических лиц
                </td>
                <td className="px-2 py-1">
                  {totalCount}
                </td>
              </tr>

              <tr className="border-b">
                <td className="px-2 py-1 font-medium">
                  Только руководитель
                </td>
                <td className="px-2 py-1">
                  {Number(summary.directorOnlyCount || 0)}
                </td>
              </tr>

              <tr className="border-b">
                <td className="px-2 py-1 font-medium">
                  Только учредитель
                </td>
                <td className="px-2 py-1">
                  {Number(summary.founderOnlyCount || 0)}
                </td>
              </tr>

              <tr className="border-b">
                <td className="px-2 py-1 font-medium">
                  Руководитель и учредитель
                </td>
                <td className="px-2 py-1">
                  {Number(
                    summary.directorAndFounderCount || 0
                  )}
                </td>
              </tr>

              <tr className="border-b">
                <td className="px-2 py-1 font-medium">
                  Действующих организаций
                </td>
                <td className="px-2 py-1">
                  {Number(summary.activeCount || 0)}
                </td>
              </tr>

              <tr className="border-b">
                <td className="px-2 py-1 font-medium">
                  Недействующих организаций
                </td>
                <td className="px-2 py-1">
                  {Number(summary.inactiveCount || 0)}
                </td>
              </tr>

              <tr className="border-b">
                <td className="px-2 py-1 font-medium">
                  Организаций с недостоверными сведениями
                </td>
                <td className="px-2 py-1">
                  {Number(summary.unreliableCount || 0)}
                </td>
              </tr>

              <tr>
                <td className="px-2 py-1 font-medium">
                  Комментарий
                </td>
                <td className="px-2 py-1">
                  {comment}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };
 
  const renderCommercialActivitySummary = (items = [], source = {}) => {
    const realItems = items.filter((item) => item.kind === 'commercial_activity_org');
    const count = realItems.length;

    const activeCount = realItems.filter((item) => item.status === 'Active').length;
    const bankruptingCount = realItems.filter((item) => item.status === 'Bankrupting').length;
    const dissolvingCount = realItems.filter((item) => item.status === 'Dissolving').length;
    const dissolvedCount = realItems.filter((item) => item.status === 'Dissolved').length;

    const arbitrationCount = realItems.filter((item) => Number(item.arbitrationCount || 0) > 0).length;
    const hasActiveBusiness = activeCount > 0;
    const hasBankruptcy = bankruptingCount > 0;
    const hasArbitration = arbitrationCount > 0;
    const bankruptcyCellClass =
      bankruptingCount > 0 ? 'text-red-700 font-semibold' : '';

    const arbitrationCellClass =
      arbitrationCount > 0 ? 'text-red-700 font-semibold' : '';

    const badgeText =
      hasBankruptcy
        ? 'Есть бизнес в стадии банкротства'
        : hasArbitration
        ? 'Есть бизнес с арбитражными спорами'
        : hasActiveBusiness
        ? 'Есть действующий бизнес'
        : count > 0
        ? 'Найдены архивные / прекращённые записи'
        : 'Сведения о коммерческой деятельности не найдены';

    const badgeClass =
      hasBankruptcy
        ? 'bg-red-100 text-red-800'
        : hasArbitration
        ? 'bg-yellow-100 text-yellow-800'
        : hasActiveBusiness
        ? 'bg-green-100 text-green-800'
        : 'bg-slate-100 text-slate-700';

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
          {badgeText}
        </div>

        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Сводка по коммерческой деятельности
          </div>

          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-56">Всего записей</td>
                <td className="px-2 py-1">{count}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Действующих</td>
                <td className="px-2 py-1">{activeCount}</td>
              </tr>
              <tr className="border-b">
                <td className={`px-2 py-1 font-medium ${bankruptcyCellClass}`}>В стадии банкротства</td>
                <td className={`px-2 py-1 ${bankruptcyCellClass}`}>{bankruptingCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">В ликвидации</td>
                <td className="px-2 py-1">{dissolvingCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Недействующих</td>
                <td className="px-2 py-1">{dissolvedCount}</td>
              </tr>
              <tr>
                <td className={`px-2 py-1 font-medium ${arbitrationCellClass}`}>С арбитражными спорами</td>
                <td className={`px-2 py-1 ${arbitrationCellClass}`}>{arbitrationCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const formatCommercialArbitrationGroupLine = (entry = {}) => {
    const label = entry.nameText || entry.name || 'Категория не определена';
    const count = Number(entry.count || 0);
    const sum = entry.sum;

    const sumText =
      sum !== undefined && sum !== null && sum !== ''
        ? ` / ${formatMoney(sum)} ₽`
        : '';

    return `${label}: ${count}${sumText}`;
  };

  const renderCommercialActivityArbitrationBreakdown = (items = []) => {
    const realItems = Array.isArray(items)
      ? items.filter((item) => item?.kind === 'commercial_activity_org')
      : [];

    const rows = realItems.filter((item) => Number(item?.arbitrationCount || 0) > 0);

    if (!rows.length) {
      return null;
    }

    return (
      <div className="border rounded-lg p-3 bg-white">
        <div className="text-xs font-semibold text-gray-700 mb-2">
          Арбитражная нагрузка по коммерческой деятельности
        </div>

        <div className="space-y-2">
          {rows.map((item, index) => {
            const resultGroups = Array.isArray(item.arbitrationGroupByResult)
              ? item.arbitrationGroupByResult
              : [];

            const categoryGroups = Array.isArray(item.arbitrationGroupByCategory)
              ? item.arbitrationGroupByCategory
              : [];

            return (
              <div
                key={`${item.inn || item.ogrn || item.name || 'commercial'}-${index}`}
                className="border rounded-md p-2 bg-slate-50"
              >
                <div className="text-xs font-semibold text-gray-900">
                  {item.name || 'Организация без наименования'}
                </div>

                <div className="text-[11px] text-gray-600 mt-1">
                  {item.inn ? `ИНН ${item.inn}` : 'ИНН не указан'}
                  {item.ogrn ? ` • ОГРН ${item.ogrn}` : ''}
                </div>

                <div className="text-[11px] text-gray-700 mt-1">
                  Арбитраж всего: {Number(item.arbitrationCount || 0)} дел
                  {item.arbitrationSum !== undefined && item.arbitrationSum !== null
                    ? ` / ${formatMoney(item.arbitrationSum)} ₽`
                    : ''}
                </div>

                {resultGroups.length > 0 && (
                  <div className="text-[11px] text-gray-700 mt-1">
                    <span className="font-semibold">По результатам: </span>
                    {resultGroups.map(formatCommercialArbitrationGroupLine).join('; ')}
                  </div>
                )}

                {categoryGroups.length > 0 && (
                  <div className="text-[11px] text-gray-700 mt-1">
                    <span className="font-semibold">По категориям: </span>
                    {categoryGroups.map(formatCommercialArbitrationGroupLine).join('; ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCommercialActivityKonturTable = (items = [], source = {}) => {
    const realItems = items.filter((item) => item.kind === 'commercial_activity_org');
    const firstItem = items[0] || {};

    const activeCount = realItems.filter((item) => item.status === 'Active').length;
    const bankruptingCount = realItems.filter((item) => item.status === 'Bankrupting').length;
    const arbitrationCount = realItems.filter((item) => Number(item.arbitrationCount || 0) > 0).length;

    const resultComment =
      bankruptingCount > 0
        ? 'Найдены организации / ИП в стадии банкротства. Подробности вынесены в отчёт.'
        : arbitrationCount > 0
        ? 'Найдены организации / ИП с арбитражными спорами. Подробности вынесены в отчёт.'
        : activeCount > 0
        ? 'Найдены сведения о действующей коммерческой деятельности.'
        : firstItem.message || 'Сведения о коммерческой деятельности не найдены.';

    
    return (
      <div className="space-y-3">
        {renderCommercialActivitySummary(realItems, source)}
        {renderCommercialActivityArbitrationBreakdown(realItems)}

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Статус ответа</td>
                <td className="px-2 py-1">
                  {firstItem.resultState || getStatusLabel(source.status)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество записей</td>
                <td className="px-2 py-1">{realItems.length}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{resultComment}</td>
              </tr>
            </tbody>
          </table>
        </div>
       
      </div>
    );
  };

  const getBankruptcyTone = (stageCode = '') => {
    switch (stageCode) {
      case 'Completed':
        return {
          card: 'border-green-200 bg-green-50',
          badge: 'bg-green-100 text-green-800',
          text: 'Завершено',
        };
      case 'Observation':
      case 'FinancialRecovery':
      case 'ExternalManagement':
      case 'DebtRestructuring':
      case 'AmicableAgreement':
        return {
          card: 'border-yellow-200 bg-yellow-50',
          badge: 'bg-yellow-100 text-yellow-800',
          text: 'Есть процедура',
        };
      case 'PropertyDisposal':
      case 'SaleOfProperty':
        return {
          card: 'border-red-200 bg-red-50',
          badge: 'bg-red-100 text-red-800',
          text: 'Активная стадия',
        };
      default:
        return {
          card: 'border-slate-200 bg-slate-50',
          badge: 'bg-slate-100 text-slate-700',
          text: 'Статус не уточнён',
        };
    }
  };

  const renderBankruptcySummary = (items = [], source = {}) => {
    const realItems = items.filter((item) => item.kind === 'bankruptcy_procedure');
    const count =
      source?.raw?.summary?.count ??
      realItems.length;

    if (!realItems.length) {
      return (
        <div className="text-xs text-gray-500">
          Сведения о процедурах банкротства не найдены.
        </div>
      );
    }

    const activeCritical = realItems.some(
      (item) => item.stageCode === 'PropertyDisposal' || item.stageCode === 'SaleOfProperty'
    );

    const completedOnly = realItems.every((item) => item.stageCode === 'Completed');

    const summaryTone = activeCritical
      ? 'bg-red-50 border-red-200 text-red-800'
      : completedOnly
      ? 'bg-green-50 border-green-200 text-green-800'
      : 'bg-yellow-50 border-yellow-200 text-yellow-800';

    return (
      <div className={`border rounded-lg px-3 py-2 text-xs ${summaryTone}`}>
        <div className="font-semibold">
          Найдено процедур банкротства: {count}
        </div>
        <div className="mt-1">
          {activeCritical
            ? 'Есть активная стадия, связанная с реализацией имущества.'
            : completedOnly
            ? 'Все найденные процедуры завершены.'
            : 'Найдены сведения о процедурах банкротства.'}
        </div>
      </div>
    );
  };

  const renderCourtsCommonTable = (items = [], source = {}) => {
    const rows = Array.isArray(items) ? items : [];

    const classifyProceeding = (row = {}) => {
      const typeText = String(
        row.proceedingTypeText ||
        row.proceedingType ||
        row.typeText ||
        row.type ||
        ''
      ).toLowerCase();

      if (typeText.includes('уголов')) {
        return { code: 'criminal', text: 'Уголовное судопроизводство' };
      }

      if (typeText.includes('материал')) {
        return { code: 'materials', text: 'Производство по материалам' };
      }

      if (typeText.includes('административ') && !typeText.includes('граждан')) {
        return { code: 'administrative', text: 'Административное судопроизводство' };
      }

      if (typeText.includes('граждан')) {
        return { code: 'civil', text: 'Гражданское судопроизводство' };
      }

      if (typeText.includes('административ')) {
        return { code: 'administrative', text: 'Административное судопроизводство' };
      }

      return { code: 'other', text: 'Прочие процессы' };
    };

    const totalCount = rows.length;

    const criminalCount = rows.filter((row) => classifyProceeding(row).code === 'criminal').length;
    const civilCount = rows.filter((row) => classifyProceeding(row).code === 'civil').length;
    const administrativeCount = rows.filter((row) => classifyProceeding(row).code === 'administrative').length;
    const materialsCount = rows.filter((row) => classifyProceeding(row).code === 'materials').length;
    const otherCount = rows.filter((row) => classifyProceeding(row).code === 'other').length;

    const activeCount = rows.filter((row) => {
      const status = String(row.status || row.statusText || '').toLowerCase();
      return status.includes('active') || status.includes('актив');
    }).length;

    const finishedCount = rows.filter((row) => {
      const status = String(row.status || row.statusText || '').toLowerCase();
      return status.includes('finished') || status.includes('заверш');
    }).length;

    const actsCount = rows.filter((row) => {
      const acts =
        Array.isArray(row.judicialActs) ? row.judicialActs :
        Array.isArray(row.rawRecord?.judicialActs) ? row.rawRecord.judicialActs :
        [];
      return acts.length > 0;
    }).length;

    const resultComment =
      totalCount > 0
        ? 'Найдены дела в судах общей юрисдикции. Полная детализация вынесена в отчёт.'
        : 'Дела в судах общей юрисдикции не найдены.';

    const badgeText =
      totalCount > 0
        ? activeCount > 0
          ? 'Найдены активные и завершённые судебные дела'
          : 'Найдены судебные дела'
        : 'Дела в судах общей юрисдикции не найдены';

    const badgeClass =
      totalCount > 0
        ? activeCount > 0
          ? 'bg-red-100 text-red-800'
          : 'bg-yellow-100 text-yellow-800'
        : 'bg-green-100 text-green-800';

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
          {badgeText}
        </div>

        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Сводка по судам общей юрисдикции
          </div>

          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-64">Всего дел</td>
                <td className="px-2 py-1">{totalCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Гражданское судопроизводство</td>
                <td className="px-2 py-1">{civilCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Уголовное судопроизводство</td>
                <td className="px-2 py-1">{criminalCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Административное судопроизводство</td>
                <td className="px-2 py-1">{administrativeCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Производство по материалам</td>
                <td className="px-2 py-1">{materialsCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Прочие процессы</td>
                <td className="px-2 py-1">{otherCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Активных дел</td>
                <td className="px-2 py-1">{activeCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Завершённых дел</td>
                <td className="px-2 py-1">{finishedCount}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Дел с опубликованными судебными актами</td>
                <td className="px-2 py-1">{actsCount}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-48">Статус ответа</td>
                <td className="px-2 py-1">{getStatusLabel(source.status)}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество дел</td>
                <td className="px-2 py-1">{totalCount}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{resultComment}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderPassportKonturTable = (items) => {
    return (
      <div className="space-y-3">
        {items.map((item, idx) => {
          const colorClass =
            item.severity === 'success'
              ? 'text-green-700'
              : item.severity === 'warning'
              ? 'text-amber-700'
              : item.severity === 'danger'
              ? 'text-red-700'
              : 'text-gray-600';

          const bgClass =
            item.severity === 'success'
              ? 'bg-green-50 border-green-200'
              : item.severity === 'warning'
              ? 'bg-amber-50 border-amber-200'
              : item.severity === 'danger'
              ? 'bg-red-50 border-red-200'
              : 'bg-gray-50 border-gray-200';

          return (
            <div
              key={idx}
              className={`border rounded-lg p-3 ${bgClass}`}
            >
              <div className="text-sm font-semibold text-gray-800 mb-1">
                Проверка паспорта
              </div>

              <div className={`text-base font-bold mb-1 ${colorClass}`}>
                {item.stateText || 'Статус не определён'}
              </div>

              <div className="text-xs text-gray-500 mb-3">
                Статус МВД: {item.state || '—'}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="font-medium text-gray-700">Серия:</span>{' '}
                  {item.series || '—'}
                </div>
                <div>
                  <span className="font-medium text-gray-700">Номер:</span>{' '}
                  {item.number || '—'}
                </div>
                <div>
                  <span className="font-medium text-gray-700">Дата выдачи:</span>{' '}
                  {item.issueDate || '—'}
                </div>
                <div>
                  <span className="font-medium text-gray-700">Код подразделения:</span>{' '}
                  {item.issuerCode || '—'}
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-700">
                <span className="font-medium">Комментарий:</span>{' '}
                {item.message || '—'}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSnilsKonturTable = (items) => {
    return (
      <div className="space-y-3">
        {items.map((item, idx) => {
          const colorClass =
            item.severity === 'success'
              ? 'text-green-700'
              : item.severity === 'warning'
              ? 'text-amber-700'
              : item.severity === 'danger'
              ? 'text-red-700'
              : 'text-gray-600';

          const bgClass =
            item.severity === 'success'
              ? 'bg-green-50 border-green-200'
              : item.severity === 'warning'
              ? 'bg-amber-50 border-amber-200'
              : item.severity === 'danger'
              ? 'bg-red-50 border-red-200'
              : 'bg-gray-50 border-gray-200';

          return (
            <div
              key={idx}
              className={`border rounded-lg p-3 ${bgClass}`}
            >
              <div className="text-sm font-semibold text-gray-800 mb-1">
                Проверка СНИЛС
              </div>

              <div className={`text-base font-bold mb-1 ${colorClass}`}>
                {item.stateText || 'Статус не определён'}
              </div>

              <div className="text-xs text-gray-500 mb-3">
                Статус ПФР: {item.state || '—'}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="font-medium text-gray-700">СНИЛС:</span>{' '}
                  {item.snils || '—'}
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-700">
                <span className="font-medium">Комментарий:</span>{' '}
                {item.message || '—'}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderWantedKonturTable = (items) => {
    return (
      <div className="space-y-3">
        {items.map((item, idx) => {
          const matchBadgeClass =
            item.matchType === 'FullMatch'
              ? 'bg-red-100 text-red-800'
              : item.matchType === 'PartialMatch'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-gray-100 text-gray-700';

          return (
            <div key={idx} className="border rounded-lg p-3 bg-gray-50">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="text-sm font-semibold text-gray-900">
                  {item.fullName || '—'}
                </div>

                {item.sourceTypeText && (
                  <span className="inline-flex px-2 py-1 rounded text-[11px] font-medium bg-blue-50 text-blue-700">
                    {item.sourceTypeText}
                  </span>
                )}

                {item.matchTypeText && (
                  <span className={`inline-flex px-2 py-1 rounded text-[11px] font-medium ${matchBadgeClass}`}>
                    {item.matchTypeText}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="font-medium text-gray-700">Категория:</span>{' '}
                  {item.category || '—'}
                </div>
                <div>
                  <span className="font-medium text-gray-700">Основание совпадения:</span>{' '}
                  {item.criterionText || '—'}
                </div>
                <div>
                  <span className="font-medium text-gray-700">Инициатор:</span>{' '}
                  {item.initiator || '—'}
                </div>
                <div>
                  <span className="font-medium text-gray-700">Исполнитель:</span>{' '}
                  {item.executor || '—'}
                </div>
                <div>
                  <span className="font-medium text-gray-700">Статья:</span>{' '}
                  {item.article || '—'}
                </div>
                <div>
                  <span className="font-medium text-gray-700">Регион / контакты:</span>{' '}
                  {item.region || item.departmentContacts || '—'}
                </div>
              </div>

              {item.description && (
                <div className="mt-2 text-xs text-gray-700">
                  <span className="font-medium">Описание:</span> {item.description}
                </div>
              )}

              {(item.measure || item.measureCode) && (
                <div className="mt-2 text-xs text-gray-700">
                  <span className="font-medium">Объект розыска:</span>{' '}
                  {item.measure || '—'}
                  {item.measureCode ? (
                    <span className="text-gray-500"> ({item.measureCode})</span>
                  ) : null}
                </div>
              )}

              {(item.wantedNumber || item.wantedDate || item.proceedingNumber || item.proceedingDate) && (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="font-medium text-gray-700">№ розыска:</span>{' '}
                    {item.wantedNumber || '—'}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Дата розыска:</span>{' '}
                    {item.wantedDate || '—'}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">№ исполнительного производства:</span>{' '}
                    {item.proceedingNumber || '—'}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Дата исполнительного производства:</span>{' '}
                    {item.proceedingDate || '—'}
                  </div>
                </div>
              )}

              {item.sourceUrl && (
                <div className="mt-2">
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Открыть источник
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderBankruptcyKonturTable = (items = [], source = {}) => {
    const realItems = items.filter((item) => item.kind === 'bankruptcy_procedure');

    if (!realItems.length) {
      return (
        <div className="space-y-2">
          <div className="text-xs text-gray-500">
            Сведения о процедурах банкротства не найдены.
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {renderBankruptcySummary(realItems, source)}

        {realItems.map((row, idx) => {
          const tone = getBankruptcyTone(row.stageCode);

          return (
            <div
              key={idx}
              className={`border rounded-lg p-3 space-y-2 ${tone.card}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800">
                    {row.procedureType || 'Процедура банкротства'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Код стадии: {row.stageCode || '—'}
                  </div>
                </div>

                <span className={`inline-flex px-2 py-1 rounded text-[11px] font-semibold ${tone.badge}`}>
                  {row.stage || tone.text}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div><span className="font-medium">№ дела:</span> {row.caseNumber || '—'}</div>
                <div><span className="font-medium">Дата начала:</span> {row.startDate || '—'}</div>
                <div><span className="font-medium">Последнее сообщение / окончание:</span> {row.endDate || '—'}</div>
                <div><span className="font-medium">Суд:</span> {row.court || '—'}</div>
                <div><span className="font-medium">Арбитражный управляющий:</span> {row.manager || '—'}</div>
                <div><span className="font-medium">Совпадение:</span> {row.matchTypeText || '—'}</div>
                <div className="md:col-span-2">
                  <span className="font-medium">Основание совпадения:</span> {row.criterionText || '—'}
                </div>
              </div>

              <div className="border-t pt-2 text-xs">
                <div className="font-semibold text-gray-700 mb-1">Должник</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div><span className="font-medium">ФИО:</span> {row.debtorName || '—'}</div>
                  <div><span className="font-medium">Дата рождения:</span> {row.debtorBirthDate || '—'}</div>
                  <div><span className="font-medium">ИНН:</span> {row.debtorInn || '—'}</div>
                  <div><span className="font-medium">СНИЛС:</span> {row.debtorSnils || '—'}</div>
                </div>
              </div>

              <div className="pt-1">
                {row.sourceUrl ? (
                  <a
                    href={row.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Открыть дело на Федресурсе
                  </a>
                ) : (
                  <span className="text-xs text-gray-500">Ссылка отсутствует</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ---------- RAS Arbit: документы арбитражных судов ----------
  const renderRasArbitr = (items) => {
    if (!items.length) {
      return <div className="text-xs">Решения арбитражных судов не найдены.</div>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 border">№ дела</th>
              <th className="px-2 py-1 border">Суд</th>
              <th className="px-2 py-1 border">Тип документа</th>
              <th className="px-2 py-1 border">Дата</th>
              <th className="px-2 py-1 border">Краткое содержание</th>
              <th className="px-2 py-1 border">Ссылки</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, idx) => {
              const raw = r.rawRecord || {};
              const caseNumber =
                r.caseNumber || raw.CaseNumber || raw.CaseNumberShort || '—';
              const court = r.court || raw.Court || '—';
              const docType = r.docType || raw.Type || '—';
              const docDate = r.docDate || raw.RegistrationDate || '—';
              const contentText = Array.isArray(raw.ContentTypes)
                ? raw.ContentTypes.join('; ')
                : '';

              const cardUrl = raw.CaseUrl || null;
              const pdfUrl = raw.FileUrl || null;

              return (
                <tr key={idx} className="border-t">
                  <td className="px-2 py-1 border">{caseNumber}</td>
                  <td className="px-2 py-1 border">{court}</td>
                  <td className="px-2 py-1 border">{docType}</td>
                  <td className="px-2 py-1 border">{docDate}</td>
                  <td className="px-2 py-1 border">
                    {contentText || r.docName || '—'}
                  </td>
                  <td className="px-2 py-1 border space-x-2">
                    {cardUrl && (
                      <a
                        href={cardUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Карточка
                      </a>
                    )}
                    {pdfUrl && (
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        PDF
                      </a>
                    )}
                    {!cardUrl && !pdfUrl && '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderFsspKonturTable = (items = [], source = {}) => {
    const summary = source.summary || {};
    const totalCount = Number(summary.totalCount || 0);
    const activeCount = Number(summary.activeCount || 0);
    const closedCount = Number(summary.closedCount || 0);
    const regionsCount = Number(summary.regionsCount || 0);
    const bankruptcyRisk = summary.bankruptcyRisk === true;

    const totalAmountRaw =
      summary.totalAmount ??
      source?.raw?.summary?.totalAmount ??
      0;

    const formatMoney = (v) => {
      if (v === null || v === undefined || v === '') return '—';

      const num =
        typeof v === 'number'
          ? v
          : parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));

      if (!Number.isFinite(num)) return '—';

      return `${num.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ₽`;
    };

    const firstItem = items[0] || {};

    const badgeText =
      totalCount === 0
        ? 'Исполнительные производства не найдены'
        : bankruptcyRisk
        ? 'Есть риск банкротства по сумме ИП'
        : 'Найдены исполнительные производства';

    const badgeClass =
      totalCount === 0
        ? 'bg-green-100 text-green-800'
        : bankruptcyRisk
        ? 'bg-red-100 text-red-800'
        : 'bg-yellow-100 text-yellow-800';

    const resultComment =
      totalCount === 0
        ? 'Исполнительные производства по данным Контур не найдены.'
        : bankruptcyRisk
        ? 'Найдены исполнительные производства, сумма которых указывает на риск банкротства. Полная детализация вынесена в отчёт.'
        : 'Найдены исполнительные производства. Полная детализация вынесена в отчёт.';

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
          {badgeText}
        </div>

        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Сводка по ФССП (Контур)
          </div>

          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-56">Всего производств</td>
                <td className="px-2 py-1">{totalCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Общая сумма задолженности</td>
                <td className="px-2 py-1">{formatMoney(totalAmountRaw)}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество регионов / ОСП</td>
                <td className="px-2 py-1">{regionsCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Активных производств</td>
                <td className="px-2 py-1">{activeCount}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Завершённых / прекращённых</td>
                <td className="px-2 py-1">{closedCount}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Статус ответа</td>
                <td className="px-2 py-1">
                  {firstItem.resultState || getStatusLabel(source.status)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество записей</td>
                <td className="px-2 py-1">{totalCount}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{resultComment}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderArbitrationKonturTable = (items = [], source = {}) => {
    const summary = source.summary || {};

    const realItems = Array.isArray(items)
      ? items.filter((item) => item?.kind === 'arbitration_case')
      : [];

    const totalCount =
      summary.totalCount !== undefined && summary.totalCount !== null
        ? Number(summary.totalCount)
        : realItems.length;

    const totalSumRaw =
      summary.totalSum ??
      summary.sum ??
      source?.raw?.summary?.totalSum ??
      0;

    const bankruptcyCount =
      Number(summary.bankruptcyCount || 0) ||
      realItems.filter((row) => {
        const categoryText = String(
          row?.proceedingCategoryText ||
          row?.proceedingCategory ||
          ''
        ).toLowerCase();

        const typeText = String(
          row?.proceedingTypeText ||
          row?.proceedingType ||
          ''
        ).toLowerCase();

        return categoryText.includes('банкрот') || typeText.includes('банкрот');
      }).length;

    const fullMatchCount = realItems.filter((row) => {
      const participants = Array.isArray(row?.participants) ? row.participants : [];
      return participants.some((p) => p?.matchType === 'FullMatch');
    }).length;

    const partialMatchCount = realItems.filter((row) => {
      const participants = Array.isArray(row?.participants) ? row.participants : [];
      return (
        participants.some((p) => p?.matchType === 'PartialMatch') &&
        !participants.some((p) => p?.matchType === 'FullMatch')
      );
    }).length;

    const hasBankruptcyCases =
      summary.hasBankruptcyCases === true ||
      bankruptcyCount > 0;

    const badgeText =
      totalCount === 0
        ? 'Арбитражные дела не найдены'
        : hasBankruptcyCases
        ? 'Найдены арбитражные дела о банкротстве'
        : 'Найдены арбитражные дела';

    const badgeClass =
      totalCount === 0
        ? 'bg-green-100 text-green-800'
        : hasBankruptcyCases
        ? 'bg-red-100 text-red-800'
        : 'bg-yellow-100 text-yellow-800';

    const formatMoney = (value) => {
      if (value === undefined || value === null || value === '') return '—';

      const num =
        typeof value === 'number'
          ? value
          : parseFloat(String(value).replace(/[^\d.,-]/g, '').replace(',', '.'));

      if (!Number.isFinite(num)) return '—';

      return `${num.toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })} ₽`;
    };

    const firstItem = realItems[0] || items[0] || {};

    const resultComment =
      totalCount === 0
        ? 'Арбитражные дела по данным Контур не найдены.'
        : hasBankruptcyCases
        ? 'Найдены арбитражные дела, включая банкротные споры. Полная детализация вынесена в отчёт.'
        : 'Найдены арбитражные дела. Полная детализация вынесена в отчёт.';

    return (
      <div className="space-y-3">
        <div className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
          {badgeText}
        </div>

        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Сводка по арбитражным делам (Контур)
          </div>

          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-56">Всего дел</td>
                <td className="px-2 py-1">{totalCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Общая сумма требований</td>
                <td className="px-2 py-1">{formatMoney(totalSumRaw)}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Дел о банкротстве</td>
                <td className="px-2 py-1">{bankruptcyCount}</td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Полных совпадений</td>
                <td className="px-2 py-1">{fullMatchCount}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Частичных совпадений</td>
                <td className="px-2 py-1">{partialMatchCount}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-gray-700 mb-2">Результат проверки</div>
          <table className="min-w-full text-xs border">
            <tbody>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium w-40">Статус ответа</td>
                <td className="px-2 py-1">
                  {firstItem.resultState || getStatusLabel(source.status)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="px-2 py-1 font-medium">Количество дел</td>
                <td className="px-2 py-1">{totalCount}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 font-medium">Комментарий</td>
                <td className="px-2 py-1">{resultComment}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderDefaultTable = (items) => (
    <pre className="bg-gray-50 rounded p-2 text-xs overflow-x-auto">
      {JSON.stringify(items, null, 2)}
    </pre>
  );

  

  return (
    <>
      <FreeTextImportModal
        open={freeTextOpen}
        onClose={() => setFreeTextOpen(false)}
        title="Вставьте текст с данными проверяемого лица"
        onApply={(raw) => {
          try {
            applyFreeTextToForm(raw);
          } finally {
            setFreeTextOpen(false);
          }
        }}
      />
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Проверка контрагента</h1>
        <p className="text-gray-600 text-sm">
          Введите данные физлица, чтобы получить объединённый отчёт по ФССП, КАД, ЕФРСБ и другим источникам.
        </p>
      </div>
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setFreeTextOpen(true)}
          className="px-3 py-2 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-sm"
        >
          Вставить данные текстом
        </button>
        <span className="ml-2 text-xs text-gray-500">
          Локальная обработка, ничего не отправляется на сервер
        </span>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveEntityTab('person');
              setError('');
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              activeEntityTab === 'person'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            Проверка физлица
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveEntityTab('realEstate');
              setError('');
              setResult(null);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              activeEntityTab === 'realEstate'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            Проверка объекта недвижимости
          </button>
        </div>
      </div>

      {activeEntityTab === 'person' && (

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-4 rounded-xl shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <div className="text-sm font-medium text-gray-700">Фамилия</div>
            <input
              name="lastName"
              value={form.lastName}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
              required
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-gray-700">Имя</div>
            <input
              name="firstName"
              value={form.firstName}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
              required
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-gray-700">Отчество</div>
            <input
              name="middleName"
              value={form.middleName}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="block">
            <div className="text-sm font-medium text-gray-700">Дата рождения</div>
            <input
              type="date"
              name="birthDate"
              value={form.birthDate}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
              required={!isKonturOnly}
            />
            {isKonturOnly && (
              <div className="mt-1 text-xs text-gray-500">
                Для проверки через Контур дату рождения можно не указывать.
              </div>
            )}
          </label>
          <div className="md:col-span-3" ref={regionsDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Регионы проверки
            </label>

            <button
              type="button"
              onClick={() => setRegionsOpen((prev) => !prev)}
              className="w-full border rounded px-3 py-2 bg-white text-left flex items-center justify-between"
            >
              <span className="truncate text-sm text-gray-700">
                {getRegionsButtonLabel()}
              </span>
              <span className="ml-3 text-gray-400 text-xs">
                {regionsOpen ? '▲' : '▼'}
              </span>
            </button>

            {regionsOpen && (
              <div className="mt-1 border rounded bg-white shadow-lg relative z-20">
                <div className="max-h-64 overflow-y-auto py-1">
                  <button
                    type="button"
                    onClick={handleSelectAllRegions}
                    className={
                      'w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ' +
                      (form.regions.length === 0 ? 'bg-blue-50 text-blue-700' : 'text-gray-700')
                    }
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={form.regions.length === 0}
                      className="pointer-events-none"
                    />
                    <span>Все регионы</span>
                  </button>

                  {REGIONS.map((region) => {
                    const checked = form.regions.includes(region.code);

                    return (
                      <button
                        key={region.code}
                        type="button"
                        onClick={() => handleToggleRegion(region.code)}
                        className={
                          'w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ' +
                          (checked ? 'bg-blue-50 text-blue-700' : 'text-gray-700')
                        }
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={checked}
                          className="pointer-events-none"
                        />
                        <span>{region.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-1 text-xs text-gray-500">
              Можно выбрать несколько регионов обычным кликом. Если ничего не выбрано, проверка выполняется по всем регионам.
            </div>

            <div className="mt-2">
              {form.regions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {form.regions.map((code) => {
                    const region = REGIONS.find((item) => item.code === code);

                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => handleRemoveRegion(code)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-100 hover:bg-blue-100"
                        title="Удалить регион"
                      >
                        <span>{region ? region.label : code}</span>
                        <span className="font-semibold">×</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs">
                  Выбраны все регионы
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <div className="text-sm font-medium text-gray-700">Серия паспорта</div>
            <input
              name="passportSeries"
              value={form.passportSeries}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
              placeholder="1234"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-gray-700">Номер паспорта</div>
            <input
              name="passportNumber"
              value={form.passportNumber}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
              placeholder="567890"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-gray-700">Дата выдачи</div>
            <input
              type="date"
              name="passportIssueDate"
              value={form.passportIssueDate}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-gray-700">Код подразделения</div>
            <input
              name="passportIssuerCode"
              placeholder="Код подразделения"
              value={form.passportIssuerCode}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-gray-700">СНИЛС</div>
            <input
                name="snils"
                placeholder="СНИЛС"
                value={form.snils}
                onChange={handleChange}
                className="mt-1 w-full border rounded px-3 py-2"
              />
          </label>  
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <label className="block">
            <div className="text-sm font-medium text-gray-700">ИНН (опционально)</div>
            <input
              name="inn"
              value={form.inn}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
              placeholder="012345678901"
            />
          </label>

          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={handleInnLookup}
              disabled={submitting || innLookupLoading}
              className={`mt-6 inline-flex items-center px-3 py-2 rounded-md text-sm font-medium text-white ${
                submitting || innLookupLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {innLookupLoading ? 'Ищем ИНН...' : 'Найти ИНН по паспорту'}
            </button>
            
            {innLookupError && (
              <p className="text-xs text-red-600">{innLookupError}</p>
            )}
          </div>
        </div>

        <div className="mb-4">
          <div className="text-sm font-medium mb-2">Источник проверки</div>

          <div className="flex flex-col gap-2 md:flex-row md:gap-6">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="providerMode"
                checked={providerMode === 'apicloud'}
                onChange={() => setProviderMode('apicloud')}
              />
              <span>Только API-Cloud</span>
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="providerMode"
                checked={providerMode === 'kontur'}
                onChange={() => setProviderMode('kontur')}
              />
              <span>Только Контур</span>
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="providerMode"
                checked={providerMode === 'both'}
                onChange={() => setProviderMode('both')}
              />
              <span>Оба источника</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="providerMode"
                checked={providerMode === 'selective'}
                onChange={() => setProviderMode('selective')}
              />
              <span>Выборочная</span>
            </label>
          </div>
        </div>

        {isSelectiveMode && (
          <div className="border rounded-xl p-4 bg-gray-50">
            <div className="text-sm font-semibold text-gray-800 mb-2">
              Выберите источники проверки
            </div>

            <div className="text-xs text-gray-500 mb-4">
              Можно смешивать источники API-cloud и Контур. Для арбитража API-cloud будет показан единый блок “Арбитражные дела и судебные акты”.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SELECTIVE_SOURCE_GROUPS.map((group) => (
                <div key={group.title} className="bg-white border rounded-lg p-3">
                  <div className="font-semibold text-sm text-gray-700 mb-2">
                    {group.title}
                  </div>

                  <div className="space-y-2">
                    {group.sources.map((source) => (
                      <label key={source.key} className="flex items-start gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedSources.includes(source.key)}
                          onChange={() => handleToggleSelectedSource(source.key)}
                          className="mt-1"
                        />
                        <span>{source.label}{source.hint && <span className="mt-0.5 block text-xs text-gray-500">{source.hint}</span>}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedSources.length === 0 && (
              <div className="mt-3 text-xs text-red-600">
                Для выборочной проверки нужно выбрать хотя бы один источник.
              </div>
            )}
          </div>
        )}
        <div className="border rounded-xl p-4 bg-amber-50 border-amber-200 space-y-3">
          <div>
            <div className="text-sm font-semibold text-amber-900">
              Согласие на обработку персональных данных
            </div>
            <div className="text-xs text-amber-800 mt-1">
              Для выполнения проверки данные могут быть переданы во внешние сервисы проверки,
              включая API-Cloud и Контур / Контур.Реестро.
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={counterpartyConsent.acceptedPersonalData}
              onChange={() => handleCounterpartyConsentChange('acceptedPersonalData')}
              className="mt-1"
            />
            <span>
              Я ознакомлен(а) с{' '}
              <a
                href={getAgreementUrl('privacy')}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                Политикой обработки персональных данных
              </a>{' '}
              и{' '}
              <a
                href={getAgreementUrl('pdn')}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                Согласием на обработку персональных данных
              </a>{' '}
              и{' '}
              <a
                href={getAgreementUrl('terms')}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                Правилами использования сайта
              </a>.
            </span>
          </label>

          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={counterpartyConsent.acceptedExternalTransfer}
              onChange={() => handleCounterpartyConsentChange('acceptedExternalTransfer')}
              className="mt-1"
            />
            <span>
              Я понимаю и соглашаюсь, что для выполнения проверки данные могут быть переданы
              во внешние сервисы API-Cloud и Контур / Контур.Реестро.
            </span>
          </label>

          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={counterpartyConsent.acceptedThirdPartyBasis}
              onChange={() => handleCounterpartyConsentChange('acceptedThirdPartyBasis')}
              className="mt-1"
            />
            <span>
              Если я указываю данные третьего лица, я подтверждаю, что получил(а) его согласие
              либо имею иное законное основание для передачи и проверки этих данных.
            </span>
          </label>

          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={counterpartyConsent.acceptedReportStorage}
              onChange={() => handleCounterpartyConsentChange('acceptedReportStorage')}
              className="mt-1"
            />
            <span>
              Я соглашаюсь с сохранением результата проверки и истории проверки в личном кабинете.
            </span>
          </label>

          {!hasCounterpartyConsent && (
            <div className="text-xs text-amber-800">
              Без подтверждения всех пунктов запуск проверки будет недоступен.
            </div>
          )}
        </div>

        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:bg-gray-400"
          disabled={submitting || !hasCounterpartyConsent || (isSelectiveMode && selectedSources.length === 0)}
        >
          {submitting ? 'Отправляем…' : 'Запустить проверку'}
        </button>
      </form>
      )}
      {activeEntityTab === 'realEstate' && (
        <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
          <div className="mb-4">
            <div className="text-lg font-semibold mb-3">Проверка объекта недвижимости</div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveRealEstateTab('address');
                  setError('');
                  setRealEstateSearchResult(null);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                  activeRealEstateTab === 'address'
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Найти кадастровый номер по адресу
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveRealEstateTab('cadastral');
                  setError('');
                  setRealEstateSearchResult(null);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                  activeRealEstateTab === 'cadastral'
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Найти информацию по кадастровому номеру
              </button>
            </div>
          </div>

          <form onSubmit={handleRealEstateSubmit} className="space-y-4">
            {activeRealEstateTab === 'address' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Адрес объекта
                </label>
                <textarea
                  name="address"
                  value={realEstateForm.address}
                  onChange={handleRealEstateChange}
                  rows={3}
                  placeholder="Например: Санкт-Петербург, Гражданский 74 2 8"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Лучше указывать адрес максимально просто: город, улица, дом, квартира.
                </div>
              </div>
            )}

            {activeRealEstateTab === 'cadastral' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Кадастровый номер
                </label>
                <input
                  type="text"
                  name="cadastralNumber"
                  value={realEstateForm.cadastralNumber}
                  onChange={handleRealEstateChange}
                  placeholder="Например: 78:06:0002008:1234"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            )}

            <div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:bg-gray-400"
                disabled={submitting}
              >
                {activeRealEstateTab === 'address'
                  ? 'Найти кадастровый номер'
                  : 'Получить информацию по объекту'}
              </button>
            </div>
          </form>

          {realEstateSearchResult && (
            <div className="mt-4 border rounded-xl p-4 bg-slate-50">
              <div className="text-sm font-semibold mb-2">Результат</div>

              {realEstateSearchResult.mode === 'address' && (
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium">Введённый адрес:</span>{' '}
                    {realEstateSearchResult.address}
                  </div>

                  {!!realEstateSearchResult.message && (
                    <div className="text-amber-700">
                      {realEstateSearchResult.message}
                    </div>
                  )}

                  {Array.isArray(realEstateSearchResult.items) &&
                    realEstateSearchResult.items.length > 0 && (
                      <div className="space-y-3">
                        <div className="font-medium">
                          Найдено объектов: {realEstateSearchResult.items.length}
                        </div>

                        {realEstateSearchResult.items.map((item, index) => (
                          <div
                            key={`${item.cadastralNumber || 'item'}-${index}`}
                            className="border rounded-lg p-3 bg-white"
                          >
                            <div className="mb-2">
                              <span className="font-medium">Кадастровый номер:</span>{' '}
                              {item.cadastralNumber || '—'}
                            </div>

                            <div className="mb-2">
                              <span className="font-medium">Адрес:</span>{' '}
                              {item.address || '—'}
                            </div>

                            <div className="mb-3">
                              <span className="font-medium">Актуальность записи:</span>{' '}
                              {item.actual === true
                                ? 'Актуальная'
                                : item.actual === false
                                ? 'Неактуальная'
                                : '—'}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveRealEstateTab('cadastral');
                                  setRealEstateForm((prev) => ({
                                    ...prev,
                                    cadastralNumber: item.cadastralNumber || '',
                                  }));
                                  setError('');
                                }}
                                className="px-3 py-2 rounded-lg border text-sm"
                              >
                                Использовать
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              )}

              {realEstateSearchResult.mode === 'cadastral' && (
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium">Кадастровый номер:</span>{' '}
                    {realEstateSearchResult.cadastralNumber}
                  </div>

                  {!!realEstateSearchResult.message && (
                    <div className="text-amber-700">
                      {realEstateSearchResult.message}
                    </div>
                  )}

                  {realEstateSearchResult.item && (() => {
                    const raw = realEstateSearchResult.item.rawRecord || {};
                    const rights = Array.isArray(raw.rights) ? raw.rights : [];
                    const encumbrances = Array.isArray(raw.encumbrances) ? raw.encumbrances : [];
                    const oldNumbers = Array.isArray(raw.oldNumbers) ? raw.oldNumbers : [];
                    const permittedUse = Array.isArray(raw.permittedUse) ? raw.permittedUse : [];
                    const mainCharacters = raw.mainCharacters || null;

                    return (
                      <div className="space-y-3">
                        <div className="border rounded-lg p-3 bg-white">
                          <div className="font-semibold mb-2">Основная информация</div>

                          <div className="mb-2">
                            <span className="font-medium">Адрес:</span>{' '}
                            {realEstateSearchResult.item.readableAddress || '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Тип объекта:</span>{' '}
                            {realEstateSearchResult.item.objectType || '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Назначение:</span>{' '}
                            {realEstateSearchResult.item.purpose || '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Актуальность:</span>{' '}
                            {realEstateSearchResult.item.status === '1'
                              ? 'Актуально'
                              : realEstateSearchResult.item.status === '0'
                              ? 'Неактуально'
                              : '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Площадь:</span>{' '}
                            {realEstateSearchResult.item.area || '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Этаж:</span>{' '}
                            {realEstateSearchResult.item.level || '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Подземный этаж:</span>{' '}
                            {realEstateSearchResult.item.undergroundFloor || '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Кадастровая стоимость:</span>{' '}
                            {realEstateSearchResult.item.cadCost || '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Дата кадастровой стоимости:</span>{' '}
                            {realEstateSearchResult.item.cadCostDate || '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Дата обновления сведений:</span>{' '}
                            {realEstateSearchResult.item.infoUpdate || '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Кадастровый квартал:</span>{' '}
                            {realEstateSearchResult.item.cadastralQuarter || '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Материал стен:</span>{' '}
                            {realEstateSearchResult.item.oksWallMaterial || '—'}
                          </div>

                          <div className="mb-2">
                            <span className="font-medium">Год ввода в эксплуатацию:</span>{' '}
                            {realEstateSearchResult.item.oksCommisioningYear || '—'}
                          </div>

                          <div>
                            <span className="font-medium">Год постройки:</span>{' '}
                            {realEstateSearchResult.item.oksYearBuild || '—'}
                          </div>
                        </div>

                        <div className="border rounded-lg p-3 bg-white">
                          <div className="font-semibold mb-2">Регистрационные сведения</div>

                          <div className="mb-2">
                            <span className="font-medium">Дата кадастрового учёта:</span>{' '}
                            {formatUnixDate(raw.regDate) || '—'}
                          </div>

                          <div>
                            <span className="font-medium">Дата прекращения:</span>{' '}
                            {raw.cancelDate || '—'}
                          </div>
                        </div>

                        <div className="border rounded-lg p-3 bg-white">
                          <div className="font-semibold mb-2">Основные характеристики</div>

                          {mainCharacters ? (
                            <div className="space-y-2">
                              <div>
                                <span className="font-medium">Показатель:</span>{' '}
                                {mainCharacters.description || '—'}
                              </div>
                              <div>
                                <span className="font-medium">Значение:</span>{' '}
                                {mainCharacters.value ?? '—'}
                              </div>
                              <div>
                                <span className="font-medium">Единица измерения:</span>{' '}
                                {mainCharacters.unitDescription || '—'}
                              </div>
                            </div>
                          ) : (
                            <div className="text-gray-500">Нет данных</div>
                          )}
                        </div>

                        <div className="border rounded-lg p-3 bg-white">
                          <div className="font-semibold mb-2">Права</div>

                          {rights.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-xs border">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-2 py-1 border">Вид права</th>
                                    <th className="px-2 py-1 border">Номер регистрации</th>
                                    <th className="px-2 py-1 border">Дата госудраственной регистрации</th>
                                    <th className="px-2 py-1 border">Доля</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rights.map((row, idx) => (
                                    <tr key={idx} className="border-t">
                                      <td className="px-2 py-1 border">{row.rightTypeDesc || '—'}</td>
                                      <td className="px-2 py-1 border">{row.rightNumber || '—'}</td>
                                      <td className="px-2 py-1 border">{formatUnixDate(row.rightRegDate) || '—'}</td>
                                      <td className="px-2 py-1 border">{row.part || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-gray-500">Нет данных о правах</div>
                          )}
                        </div>

                        <div className="border rounded-lg p-3 bg-white">
                          <div className="font-semibold mb-2">Обременения</div>

                          {encumbrances.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-xs border">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-2 py-1 border">Тип</th>
                                    <th className="px-2 py-1 border">Номер</th>
                                    <th className="px-2 py-1 border">Дата государственной регистрации</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {encumbrances.map((row, idx) => (
                                    <tr key={idx} className="border-t">
                                      <td className="px-2 py-1 border">{row.typeDesc || '—'}</td>
                                      <td className="px-2 py-1 border">{row.rightNumber || '—'}</td>
                                      <td className="px-2 py-1 border">
                                        {formatUnixDate(row.startDate)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-green-700">Не обнаружены</div>
                          )}
                        </div>

                        <div className="border rounded-lg p-3 bg-white">
                          <div className="font-semibold mb-2">Старые номера</div>

                          {oldNumbers.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-xs border">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-2 py-1 border">Тип номера</th>
                                    <th className="px-2 py-1 border">Значение</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {oldNumbers.map((row, idx) => (
                                    <tr key={idx} className="border-t">
                                      <td className="px-2 py-1 border">{row.numType || '—'}</td>
                                      <td className="px-2 py-1 border">{row.numValue || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-gray-500">Нет данных</div>
                          )}
                        </div>

                        <div className="border rounded-lg p-3 bg-white">
                          <div className="font-semibold mb-2">Разрешённое использование</div>

                          {permittedUse.length > 0 ? (
                            <pre className="text-xs whitespace-pre-wrap bg-slate-50 p-3 rounded border overflow-x-auto">
                              {JSON.stringify(permittedUse, null, 2)}
                            </pre>
                          ) : (
                            <div className="text-gray-500">Нет данных</div>
                          )}
                        </div>

                        <div className="border rounded-lg p-3 bg-white">
                          <div className="font-semibold mb-2">Важно</div>
                          <div className="text-xs text-gray-600">
                            API-cloud по методу object не возвращает ФИО собственника.
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {result && ['queued', 'processing', 'partial', 'error'].includes(result.status) && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-xl">
          {result.status === 'queued' && 'Проверка поставлена в очередь. Ожидаем результат...'}
          {result.status === 'processing' && 'Проверка выполняется...'}
          {result.status === 'partial' && 'Часть результатов уже готова, остальные проверки ещё выполняются.'}
          {result.status === 'error' && 'Проверка завершилась с ошибкой.'}
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl">
          {error}
        </div>
      )}
      {result && (result.status === 'done' || result.status === 'partial') && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between">
            <div className="space-x-2">
              {result.id && (
                <>
                  <a
                    href={`${apiBaseUrl}/api/counterparty/report/${result.id}/html`}
                    className="text-blue-600 hover:underline text-sm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть HTML
                  </a>
                  <a
                    href={`${apiBaseUrl}/api/counterparty/report/${result.id}/pdf`}
                    className="text-blue-600 hover:underline text-sm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Скачать PDF
                  </a>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SOURCE_ORDER
              .filter((key) => {
                const hasCombined = !!result.sources?.arbitrationApiCloudCombined;

                if (hasCombined && (key === 'kad' || key === 'rasArbitr')) {
                  return false;
                }

                return !!result.sources?.[key];
              })
              .map((key) => renderSource(key, result.sources[key]))}

            {Object.keys(result.sources || {})
              .filter((key) => {
                const hasCombined = !!result.sources?.arbitrationApiCloudCombined;

                if (SOURCE_ORDER.includes(key)) return false;
                if (hasCombined && (key === 'kad' || key === 'rasArbitr')) return false;

                return true;
              })
              .map((key) => renderSource(key, result.sources[key]))}
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm">
            <div className="text-sm text-gray-700 font-semibold mb-2">Сводка по провайдерам</div>
            <pre className="bg-gray-50 rounded p-2 text-xs overflow-x-auto">{JSON.stringify(result.providerSummary, null, 2)}</pre>
          </div>
        </div>
      )}
      <div className="bg-white p-4 rounded-xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <div className="text-lg font-semibold text-gray-900">История проверок</div>
            <div className="text-sm text-gray-500">
              Всего записей: {historyTotal}
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Поиск по ФИО, ИНН, адресу, кадастровому номеру..."
              className="border rounded-lg px-3 py-2 text-sm w-full md:w-96"
            />

            <button
              type="button"
              onClick={handleDeleteSelectedChecks}
              disabled={bulkDeleting || selectedHistoryIds.length === 0}
              className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm disabled:bg-gray-300"
            >
              {bulkDeleting
                ? 'Удаляем...'
                : `Удалить выбранные${selectedHistoryIds.length ? ` (${selectedHistoryIds.length})` : ''}`}
            </button>
          </div>
        </div>

        {historyLoading ? (
          <div className="text-sm text-gray-500">Загрузка истории...</div>
        ) : history.length === 0 ? (
          <div className="text-sm text-gray-500">История проверок пока пуста.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 w-10">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={handleToggleSelectAllHistory}
                      />
                    </th>
                    <th className="py-2 pr-3">Дата</th>
                    <th className="py-2 pr-3">Субъект</th>
                    <th className="py-2 pr-3">Источник</th>
                    <th className="py-2 pr-3">Статус</th>
                    <th className="py-2 pr-3">Отчёт</th>
                    <th className="py-2 pr-3">Повтор</th>
                    <th className="py-2">Удаление</th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((item) => {
                    const entityType =
                      item.subject?.entityType ||
                      item.data?.entityType ||
                      item.data?.subject?.entityType ||
                      'person';

                    const fullName =
                      item.subject?.fullName ||
                      item.data?.subject?.fullName ||
                      '';

                    const readableAddress =
                      item.subject?.readableAddress ||
                      item.data?.subject?.readableAddress ||
                      item.data?.item?.readableAddress ||
                      '';

                    const cadastralNumber =
                      item.subject?.cadastralNumber ||
                      item.data?.subject?.cadastralNumber ||
                      item.data?.cadastralNumber ||
                      '';

                    const subjectLabel =
                      entityType === 'realEstate'
                        ? [readableAddress, cadastralNumber].filter(Boolean).join(' — ') || 'Объект недвижимости'
                        : fullName || '—';

                    const status = item.status || item.data?.status || 'done';
                    const isSelected = selectedHistoryIds.includes(item.id);

                    return (
                      <tr key={item.id} className="border-b">
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleHistorySelection(item.id)}
                          />
                        </td>

                        <td className="py-2 pr-3">
                          {item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : '—'}
                        </td>

                        <td className="py-2 pr-3">{subjectLabel}</td>

                        <td className="py-2 pr-3">
                          <div className="text-sm text-gray-900">
                            {getCheckSourceLabel(item)}
                          </div>
                        </td>

                        <td className="py-2 pr-3">
                          {status === 'done'
                            ? 'Готово'
                            : status === 'stalled'
                            ? 'Задержка по части источников'
                            : status === 'error'
                            ? 'Ошибка'
                            : status === 'processing'
                            ? 'В обработке'
                            : status === 'queued'
                            ? 'В очереди'
                            : status}
                        </td>

                        <td className="py-2 pr-3">
                          {item.status === 'done' ? (
                            <a
                              href={`${apiBaseUrl}/api/counterparty/report/${item.id}/html`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Открыть
                            </a>
                          ) : (
                            <span className="text-gray-500">Недоступно</span>
                          )}
                        </td>

                        <td className="py-2 pr-3">
                          {entityType === 'realEstate' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveEntityTab('realEstate');
                                setActiveRealEstateTab('cadastral');
                                setRealEstateForm((prev) => ({
                                  ...prev,
                                  cadastralNumber,
                                }));
                                setRealEstateSearchResult(item.data || null);
                                setError('');
                              }}
                              className="text-blue-600 hover:underline"
                            >
                              Повторить с этим объектом
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRepeatCheck(item)}
                              disabled={submitting}
                              className="text-blue-600 hover:underline disabled:text-gray-400"
                            >
                              {submitting ? 'Запускаем...' : 'Повторить'}
                            </button>
                          )}
                        </td>

                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteCheck(item.id)}
                            disabled={deletingId === item.id}
                            className="text-red-600 hover:underline disabled:text-gray-400"
                          >
                            {deletingId === item.id ? 'Удаляем...' : 'Удалить'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-500">
                Страница {historyPage} из {historyPages}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                  disabled={historyPage <= 1}
                  className="px-3 py-2 rounded-lg border text-sm disabled:text-gray-400 disabled:border-gray-200"
                >
                  Назад
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryPage((prev) => Math.min(historyPages, prev + 1))}
                  disabled={historyPage >= historyPages}
                  className="px-3 py-2 rounded-lg border text-sm disabled:text-gray-400 disabled:border-gray-200"
                >
                  Вперёд
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  </>

  );
}

export default CounterpartyCheckPage;
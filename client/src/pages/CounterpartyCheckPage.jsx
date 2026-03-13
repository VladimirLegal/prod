import React, { useEffect, useState } from 'react';

const initialForm = {
  lastName: '',
  firstName: '',
  middleName: '',
  birthDate: '',
  region: '',
  passportSeries: '',
  passportNumber: '',
  passportIssueDate: '',
  inn: '',
  };

function CounterpartyCheckPage() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [innLookupLoading, setInnLookupLoading] = useState(false);
  const [innLookupError, setInnLookupError] = useState('');
  const [providers, setProviders] = useState(['apicloud']);
  const apiBaseUrl =
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:5000'
      : '';
  
  const loadHistory = async () => {
    try {
      const r = await fetch('/api/counterparty/history', {
        credentials: 'include',
      });
      const data = await r.json();
      if (data.ok) {
        setHistory(data.items || []);
      }
    } catch (err) {
      console.error('history load error', err);
    }
  };
  const filteredHistory = history.filter((item) => {
    const fullName =
      item.subject?.fullName ||
      item.data?.subject?.fullName ||
      '';

    const inn =
      item.subject?.inn ||
      item.data?.subject?.inn ||
      '';

    const status =
      item.status ||
      item.data?.status ||
      '';

    const createdAt = item.createdAt
      ? new Date(item.createdAt).toLocaleString('ru-RU')
      : '';

    const haystack = `${fullName} ${inn} ${status} ${createdAt}`.toLowerCase();
    return haystack.includes(searchTerm.trim().toLowerCase());
  });

  useEffect(() => {
    loadHistory();
  }, []);


  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
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
    const maxAttempts = 30; // примерно 60 секунд при интервале 2 сек
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt += 1;

      try {
        const res = await fetch(`/api/counterparty/check/${checkId}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.ok && data.result) {
          const status = data.result.status;

          if (status === 'done') {
            setResult(data.result);
            await loadHistory();
            return;
          }

          if (status === 'error') {
            setError(data.result.error || 'Проверка завершилась с ошибкой.');
            await loadHistory();
            return;
          }
        }
      } catch (err) {
        console.error('polling error', err);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    setError('Проверка ещё не завершилась. Обновите страницу чуть позже.');
    await loadHistory();
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
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
          providers,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'failed');
      }

      setResult(data.result);

      if (data.result?.id) {
        await loadHistory();
        await waitForResult(data.result.id);
      }
    } catch (err) {
      console.error('counterparty submit error', err);
      setError('Не удалось выполнить проверку. Попробуйте позже.');
    } finally {
      setSubmitting(false);
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

      setHistory((prev) => prev.filter((item) => item.id !== checkId));

      if (result?.id === checkId) {
        setResult(null);
      }
    } catch (err) {
      console.error('delete check error', err);
      setError('Не удалось удалить проверку.');
    } finally {
      setDeletingId(null);
    }
  };

  const SOURCE_TITLES = {
    mvdPassport: 'Паспорт РФ (МВД)',
    stopOperRS: 'Приостановления операций по счетам (ФНС)',
    fssp: 'Исполнительные производства (ФССП)',
    efrsb: 'Банкротство (ЕФРСБ)',
    rosfin: 'Список Росфинмониторинга',
    kad: 'Арбитражные дела (КАД)',
    rasArbitr: 'Решения арбитражных судов',
    fns: 'Прозрачный бизнес (ФНС)',
  };

  const getStatusLabel = (status) => {
    if (!status) return '—';
    switch (status) {
      case 'ok':
        return 'Данные получены';
      case 'empty':
        return 'Нет данных';
      case 'error':
        return 'Ошибка при запросе';
      default:
        return status;
    }
  };

  // ---------- Рендер содержимого конкретных источников ----------

  const renderMvdPassport = (items) => {
    const row = items[0] || {};
    const isValid = row.isValid;
    const message = row.message || row.rawRecord?.description || '—';

    return (
      <div className="space-y-2">
        <div
          className={
            'inline-flex px-2 py-1 rounded text-xs font-semibold ' +
            (isValid
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800')
          }
        >
          {isValid ? 'Паспорт действителен' : 'Паспорт недействителен / не найден'}
        </div>

        <table className="min-w-full text-xs border mt-1">
          <tbody>
            <tr className="border-b">
              <td className="px-2 py-1 font-medium w-32">Статус</td>
              <td className="px-2 py-1">
                {row.rawRecord?.result || (isValid ? 'VALID' : 'NOT_VALID / NOT_FOUND')}
              </td>
            </tr>
            <tr>
              <td className="px-2 py-1 font-medium">Комментарий</td>
              <td className="px-2 py-1">{message}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderStopOperRS = (items) => {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 border">ИНН</th>
              <th className="px-2 py-1 border">Налогоплательщик</th>
              <th className="px-2 py-1 border">Код ФНС</th>
              <th className="px-2 py-1 border">Дата приостановки</th>
              <th className="px-2 py-1 border">БИК банка</th>
              <th className="px-2 py-1 border">№ решения</th>
              <th className="px-2 py-1 border">Основание</th>
              <th className="px-2 py-1 border">Отрицательное сальдо ЕНС</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row, idx) => (
              <tr key={idx} className="border-t">
                <td className="px-2 py-1 border">{row.inn || '—'}</td>
                <td className="px-2 py-1 border">{row.name || '—'}</td>
                <td className="px-2 py-1 border">{row.code_fns || '—'}</td>
                <td className="px-2 py-1 border">{row.date || '—'}</td>
                <td className="px-2 py-1 border">{row.bik || '—'}</td>
                <td className="px-2 py-1 border">{row.number || '—'}</td>
                <td className="px-2 py-1 border">
                  {row.code_osnov || '—'}
                  {row.code_detail ? ` — ${row.code_detail}` : ''}
                </td>
                <td className="px-2 py-1 border">
                  {row.saldo_ens != null ? `${row.saldo_ens} ₽` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderFns = (items) => {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 border">ОГРН / ОГРНИП</th>
              <th className="px-2 py-1 border">ИНН</th>
              <th className="px-2 py-1 border">Статус</th>
              <th className="px-2 py-1 border">Наименование / ФИО</th>
              <th className="px-2 py-1 border">Дата регистрации</th>
              <th className="px-2 py-1 border">Основной ОКВЭД</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row, idx) => {
              const status =
                row.statusIPDesc ||
                row.statusORGDesc ||
                (row.statusIP === 1
                  ? 'Действующий ИП'
                  : row.statusIP === 0
                  ? 'Деятельность прекращена'
                  : '—');

              return (
                <tr key={idx} className="border-t">
                  <td className="px-2 py-1 border">{row.ogrn || '—'}</td>
                  <td className="px-2 py-1 border">{row.inn || '—'}</td>
                  <td className="px-2 py-1 border">{status}</td>
                  <td className="px-2 py-1 border">{row.name || row.abbreviated_name || '—'}</td>
                  <td className="px-2 py-1 border">{row.dateReg || '—'}</td>
                  <td className="px-2 py-1 border">
                    {row.okved || '—'}
                    {row.okved_name ? ` — ${row.okved_name}` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRosfin = (items) => {
    // В твоём примере там один объект с kind="rosfin_lookup"
    const row = items[0] || {};
    const msg =
      row.message ||
      (row.rawRecord?.found === false
        ? 'Сведений в списке Росфинмониторинга не найдено'
        : row.rawRecord?.found
        ? 'Лицо найдено в списке Росфинмониторинга'
        : '—');

    return (
      <div className="space-y-1 text-xs">
        <div className="font-medium">Результат проверки Росфинмониторинга</div>
        <div>{msg}</div>
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
    if (source.status === 'error') {
      content = (
        <div className="text-xs text-red-600">
          {source.error || 'Ошибка получения данных из сервиса.'}
        </div>
      );
    } else if (!hasItems) {
      content = <div className="text-xs text-gray-500">Нет записей</div>;
    } else {
      switch (key) {
        case 'mvdPassport':
          content = renderMvdPassport(items);
          break;
        case 'stopOperRS':
          content = renderStopOperRS(items);
          break;
        case 'fns':
          content = renderFns(items);
          break;
        case 'rosfin':
          content = renderRosfin(items);
          break;
        case 'fssp':
          content = renderFssp(items);
          break;
        case 'efrsb':
          content = renderEfrsb(items);
          break;
        case 'kad':
          content = renderKad(items);
          break;
        case 'rasArbitr':
          content = renderRasArbitr(items);
          break;
        default:
          content = renderDefaultTable(items);
      }
    }

    return (
      <div key={key} className="border rounded-lg p-3 bg-white shadow-sm space-y-2">
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
  const renderFssp = (items) => {
    let totalAmount = 0;

    const prepared = items.map((r) => {
      const raw = r.rawRecord || {};
      let debt = null;
      let rest = null;
      let fee = null;

      if (Array.isArray(raw.subjectArray)) {
        raw.subjectArray.forEach((s) => {
          const clean = (s.sum || '').replace(/[^\d.,]/g, '').replace(',', '.');
          if (!clean) return;
          if (s.title && s.title.includes('Сумма долга')) {
            debt = clean;
          } else if (s.title && s.title.includes('Остаток долга')) {
            rest = clean;
          } else if (s.title && s.title.includes('Исполнительский сбор')) {
            fee = clean;
          }
        });
      }

      const amountStr = debt || r.amount || raw.sum || null;
      const amountNum = amountStr
        ? parseFloat(amountStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
        : 0;
      totalAmount += amountNum;

      return { r, raw, debt, rest, fee, amountStr, amountNum };
    });

    return (
      <div className="space-y-2">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 border">№ ИП</th>
                <th className="px-2 py-1 border">Дата</th>
                <th className="px-2 py-1 border">Вид долга</th>
                <th className="px-2 py-1 border">Сумма долга</th>
                <th className="px-2 py-1 border">Остаток долга</th>
                <th className="px-2 py-1 border">Исп. сбор</th>
              </tr>
            </thead>
            <tbody>
              {prepared.map(({ r, raw, debt, rest, fee }, idx) => {
                const subjectTitle =
                  (Array.isArray(raw.subjectArray) && raw.subjectArray[0]?.title) ||
                  raw.subject ||
                  '—';

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
                    <td className="px-2 py-1 border">{r.processNumber || '—'}</td>
                    <td className="px-2 py-1 border">{r.processDate || '—'}</td>
                    <td className="px-2 py-1 border">{subjectTitle}</td>
                    <td className="px-2 py-1 border">{formatMoney(debt || r.amount)}</td>
                    <td className="px-2 py-1 border">{formatMoney(rest)}</td>
                    <td className="px-2 py-1 border">{formatMoney(fee)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="text-xs font-semibold">
          Общая сумма задолженности по ФССП:{' '}
          {totalAmount > 0
            ? `${totalAmount.toLocaleString('ru-RU', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} ₽`
            : '—'}
        </div>
      </div>
    );
  };

  // ---------- ЕФРСБ: краткая сводка + табличка при наличии данных ----------
  const renderEfrsb = (items) => {
    const row = items[0] || {};
    const raw = row.rawRecord || {};
    const count = raw.num ?? raw.count;

    // Если процедур нет — просто показываем понятный текст
    if (!count) {
      return (
        <div className="text-xs">
          {row.message || 'Информация о процедурах банкротства не найдена.'}
        </div>
      );
    }

    // Если в raw есть массив data/result — попробуем показать табличку
    const dataArray = Array.isArray(raw.data)
      ? raw.data
      : Array.isArray(raw.result)
      ? raw.result
      : null;

    if (!dataArray || dataArray.length === 0) {
      return (
        <div className="space-y-1 text-xs">
          <div>{row.message || 'Найдены сведения о банкротстве.'}</div>
          <div>Количество записей: {count}</div>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 border">№ дела</th>
              <th className="px-2 py-1 border">Суд / орган</th>
              <th className="px-2 py-1 border">Стадия</th>
              <th className="px-2 py-1 border">Роль должника</th>
              <th className="px-2 py-1 border">Сумма требований</th>
            </tr>
          </thead>
          <tbody>
            {dataArray.map((d, idx) => {
              const caseNumber =
                d.caseNumber || d.case_number || d.number || d.CaseNumber || '—';
              const court =
                d.court || d.courtName || d.arbitr || d.organ || d.Court || '—';
              const stage =
                d.stage || d.stageName || d.status || d.procStage || '—';
              const role =
                d.role ||
                d.debtorRole ||
                d.participantRole ||
                d.side ||
                '—';
              const amount =
                d.amount || d.claimSum || d.sum || d.totalAmount || null;

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
                  <td className="px-2 py-1 border">{stage}</td>
                  <td className="px-2 py-1 border">{role}</td>
                  <td className="px-2 py-1 border">{formatMoney(amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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

  const renderDefaultTable = (items) => (
    <pre className="bg-gray-50 rounded p-2 text-xs overflow-x-auto">
      {JSON.stringify(items, null, 2)}
    </pre>
  );

  

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Проверка контрагента</h1>
        <p className="text-gray-600 text-sm">
          Введите данные физлица, чтобы получить объединённый отчёт по ФССП, КАД, ЕФРСБ и другим источникам.
        </p>
      </div>

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
              required
            />
          </label>
          <label className="block md:col-span-3">
            <div className="text-sm font-medium text-gray-700">Регион</div>
            <input
              name="region"
              value={form.region}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
              placeholder="Например, Москва"
            />
          </label>
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

          <label className="mr-4">
            <input
              type="checkbox"
              checked={providers.includes('apicloud')}
              onChange={(e) => {
                if (e.target.checked) {
                  setProviders([...providers, 'apicloud']);
                } else {
                  setProviders(providers.filter(p => p !== 'apicloud'));
                }
              }}
            />
            <span className="ml-2">API-Cloud</span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={providers.includes('kontur')}
              onChange={(e) => {
                if (e.target.checked) {
                  setProviders([...providers, 'kontur']);
                } else {
                  setProviders(providers.filter(p => p !== 'kontur'));
                }
              }}
            />
            <span className="ml-2">Контур</span>
          </label>
        </div>
        
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:bg-gray-400"
          disabled={submitting || providers.length === 0}
        >
          {submitting ? 'Отправляем…' : 'Запустить проверку'}
        </button>
      </form>
      {result && result.status && result.status !== 'done' && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-xl">
          {result.status === 'queued' && 'Проверка поставлена в очередь. Ожидаем результат...'}
          {result.status === 'processing' && 'Проверка выполняется...'}
          {result.status === 'error' && 'Проверка завершилась с ошибкой.'}
        </div>
      )}
      {result && result.status === 'done' && (
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
            {Object.entries(result.sources || {}).map(([key, source]) => renderSource(key, source))}
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm">
            <div className="text-sm text-gray-700 font-semibold mb-2">Сводка по провайдерам</div>
            <pre className="bg-gray-50 rounded p-2 text-xs overflow-x-auto">{JSON.stringify(result.providerSummary, null, 2)}</pre>
          </div>
        </div>
      )}
      {history.length > 0 && (
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="text-lg font-semibold">История проверок</div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Поиск по ФИО, ИНН, дате, статусу"
              className="w-full max-w-md border rounded px-3 py-2 text-sm"
            />
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Дата</th>
                <th>Субъект</th>
                <th>Статус</th>
                <th>Действие</th>
                <th>Удалить</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((item) => {
                const fullName =
                  item.subject?.fullName ||
                  item.data?.subject?.fullName ||
                  '—';

                const status = item.status || item.data?.status || 'done';

                return (
                  <tr key={item.id} className="border-b">
                    <td className="py-2">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td>{fullName}</td>
                    <td>
                      {status === 'done'
                        ? 'Готово'
                        : status === 'error'
                        ? 'Ошибка'
                        : status === 'processing'
                        ? 'В обработке'
                        : status === 'queued'
                        ? 'В очереди'
                        : status}
                    </td>
                    <td>
                      {item.status === 'done' && item.hasResult ? (
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
                    <td>
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
      )}
    </div>
  );
}

export default CounterpartyCheckPage;
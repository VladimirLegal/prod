import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse, faHandshake, faFileContract, faShieldHalved } from '@fortawesome/free-solid-svg-icons';

const API_ORIGIN = process.env.REACT_APP_API_ORIGIN || ''; // '' => относительные URL


// Унифицированные стили кнопок (Tailwind)
const BTN = {
  base:
    'inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium ' +
    'transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ' +
    'disabled:opacity-60 disabled:pointer-events-none',
  primary:   'text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
  secondary: 'border border-gray-300 text-gray-800 hover:bg-gray-50 focus:ring-gray-400',
  danger:    'border border-red-300 text-red-700 hover:bg-red-50 focus:ring-red-400',
  success:   'border border-green-300 text-green-700 hover:bg-green-50 focus:ring-green-400',
  link:      'text-blue-600 hover:underline px-0 h-auto'
};




// ========== УТИЛЫ ==========
function monthName(mm) {
  const map = {
    '01':'Январь','02':'Февраль','03':'Март','04':'Апрель','05':'Май','06':'Июнь',
    '07':'Июль','08':'Август','09':'Сентябрь','10':'Октябрь','11':'Ноябрь','12':'Декабрь'
  };
  return map[mm] || mm;
}

function groupByYMD(items) {
  const byY = {};
  for (const it of items) {
    const date = (it.date || '').slice(0,10); // YYYY-MM-DD
    const [y, m, d] = date.split('-');
    if (!y || !m || !d) continue;
    byY[y] ||= {};
    byY[y][m] ||= {};
    byY[y][m][d] ||= [];
    byY[y][m][d].push(it);
  }
  return Object.keys(byY).sort((a,b)=>b.localeCompare(a)).map(y => ({
    year: y,
    months: Object.keys(byY[y]).sort((a,b)=>b.localeCompare(a)).map(m => ({
      month: m,
      days: Object.keys(byY[y][m]).sort((a,b)=>b.localeCompare(a)).map(d => ({
        day: d,
        docs: byY[y][m][d].sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''))
      }))
    }))
  }));
}

function shortFio(full) {
  // Иванов Иван Иванович -> Иванов И.И.
  const p = String(full||'').trim().split(/\s+/);
  if (!p.length) return '';
  const fam = p[0] || '';
  const i = p[1]?.[0] ? p[1][0] + '.' : '';
  const o = p[2]?.[0] ? p[2][0] + '.' : '';
  return [fam, i, o].filter(Boolean).join(' ');
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + days);
  return d;
}


async function apiTrashDocument(id) {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}/trash`, {
    method: 'POST', credentials: 'include'
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiRestoreDocument(id) {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}/restore`, {
    method: 'POST', credentials: 'include'
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiDeleteDocumentForever(id) {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE', credentials: 'include'
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Получить id последней версии для документа (если его нет в карточке)
async function fetchLastVersionId(docId) {
  try {
    const r = await fetch(`${API_ORIGIN}/api/documents/${encodeURIComponent(docId)}/versions`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const list = await r.json().catch(() => []);
    if (Array.isArray(list) && list.length) {
      const last = list[list.length - 1];
      // поддержим разные поля (id | versionId | version_id)
      return last.id || last.versionId || last.version_id || null;
    }
  } catch {}
  return null;
}

async function handleExportPdf(doc) {
  try {
    // 1) список версий
    const versions = await fetch(`/api/documents/${doc.id}/versions`, {
      credentials: 'include'
    }).then(r => r.json());

    if (!Array.isArray(versions) || versions.length === 0) {
      alert('Нет сохранённых версий для экспорта PDF');
      return;
    }
    const last = versions[versions.length - 1];

    // 2) HTML выбранной версии
    const versionPayload = await fetch(
      `/api/documents/${doc.id}/versions/${last.id}`,
      { credentials: 'include' }
    ).then(r => r.json());
    const html = versionPayload?.html || '';
    if (!html) {
      alert('Не удалось получить HTML версии');
      return;
    }

    // 3) formData документа (если есть)
    let formJson = {};
    try {
      const formResp = await fetch(
        `/api/documents/${doc.id}/form`,
        { credentials: 'include' }
      ).then(r => r.json());
      if (formResp && formResp.json) formJson = formResp.json;
    } catch {}

    // 4) отправляем в РАБОЧИЙ PDF-генератор (как в редакторе)
    const apiOrigin = process.env.REACT_APP_API_ORIGIN || 'http://localhost:5000';
    const res = await fetch(`${API_ORIGIN}/api/docs/1/export/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      // генератор ждёт { html, data }
      body: JSON.stringify({ html, data: formJson }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || 'pdf_failed');
    }

    // 5) открываем PDF в новой вкладке
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    // по желанию: URL.revokeObjectURL(url) сделать позже (после закрытия вкладки)
  } catch (e) {
    console.error('PDF export error:', e);
    alert('Не удалось экспортировать PDF.');
  }
}



// DOCX: получаем blob и скачиваем (если у тебя GET — см. комментарий ниже)
async function handleExportDocx(doc) {
  try {
    // 1) берём версии
    const versions = await fetch(`/api/documents/${doc.id}/versions`, {
      credentials: 'include'
    }).then(r => r.json());

    if (!Array.isArray(versions) || versions.length === 0) {
      alert('Нет сохранённых версий для экспорта DOCX');
      return;
    }
    const last = versions[versions.length - 1];

    // 2) тянем HTML конкретной версии
    const versionPayload = await fetch(
      `/api/documents/${doc.id}/versions/${last.id}`,
      { credentials: 'include' }
    ).then(r => r.json());
    const html = versionPayload?.html || '';
    if (!html) {
      alert('Не удалось получить HTML версии');
      return;
    }

    // 3) тянем formData (если есть — сервер вернёт { json: {...} })
    let formJson = {};
    try {
      const formResp = await fetch(
        `/api/documents/${doc.id}/form`,
        { credentials: 'include' }
      ).then(r => r.json());
      if (formResp && formResp.json) formJson = formResp.json;
    } catch {}

    // 4) отдаём на уже рабочий генератор DOCX (тот же, что использовал редактор)
    const res = await fetch(`${API_ORIGIN}/api/docs/1/export/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ html, data: formJson }),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || 'docx_failed');
    }

    // 5) скачиваем как файл
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // аккуратное имя файла
    a.download = (doc.title ? doc.title.replace(/[\\/:*?"<>|]+/g, '_') : 'document') + '.docx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('DOCX export error:', e);
    alert('Не удалось экспортировать DOCX.');
  }
}


// ========== КАРТОЧКА ДОКУМЕНТА ==========
function DocCard({ doc }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [busy, setBusy] = useState(false);

  const statusBadges = {
    draft: { label: 'Черновик', classes: 'border-gray-200 text-gray-600 bg-gray-100' },
    sent_for_review: { label: 'На согласовании', classes: 'border-blue-300 text-blue-700 bg-blue-100' },
    reviewed_with_changes: { label: 'Правки получены', classes: 'border-amber-400 text-amber-700 bg-amber-100' },
    reviewed_without_changes: { label: 'Подтверждён без правок', classes: 'border-emerald-300 text-emerald-700 bg-emerald-100' },
    final_approved: { label: 'Согласован', classes: 'border-green-300 text-green-700 bg-green-100' }
  };

  const cardBorderClass = useMemo(() => {
    switch (doc.status) {
      case 'sent_for_review':
        return 'border-blue-200';
      case 'reviewed_with_changes':
        return 'border-amber-300';
      case 'reviewed_without_changes':
        return 'border-emerald-300';
      case 'final_approved':
        return 'border-green-300';
      default:
        return 'border-gray-200';
    }
  }, [doc.status]);

  const statusBadge = statusBadges[doc.status] || null;


  useEffect(() => {
    if (!open || details) return;
    // лениво тянем форму и версии
    (async () => {
      try {
        const [form, vers] = await Promise.all([
          fetch(`/api/documents/${doc.id}/form`, { credentials: 'include' }).then(r => r.json()).catch(()=>null),
          fetch(`/api/documents/${doc.id}/versions`, { credentials: 'include' }).then(r => r.json()).catch(()=>[])
        ]);
        // собрать краткую инфу
        let address='', landlords='', tenants='', period='', amount='';
        const jf = form?.json || {};
        address = jf?.terms?.objectAddress || jf?.terms?.address || doc.address || '';
        const lns = (jf?.landlords || []).map(p => shortFio(p.fullName)).filter(Boolean);
        const tns = (jf?.tenants   || []).map(p => shortFio(p.fullName)).filter(Boolean);
        if (lns.length) landlords = lns.join('; ');
        if (tns.length) tenants   = tns.join('; ');
        if (jf?.terms?.startDate || jf?.terms?.endDate) {
          const s = jf?.terms?.startDate ? jf.terms.startDate.split('-').reverse().join('.') : '';
          const e = jf?.terms?.endDate ? jf.terms.endDate.split('-').reverse().join('.') : '';
          period = [s,e].filter(Boolean).join(' — ');
        }
        if (jf?.terms?.rentPerMonth) {
          amount = `${Number(jf.terms.rentPerMonth).toLocaleString('ru-RU')} ₽ / мес`;
        }
        setDetails({
          address, landlords, tenants, period, amount,
          versions: Array.isArray(vers) ? vers.map(v => v.id) : []
        });
      } catch (e) {
        setDetails({ address: doc.address || '', versions: [] });
      }
    })();
  }, [open, details, doc.id]);

  return (
    <div className={`bg-white border rounded-xl shadow-sm mb-3 ${cardBorderClass}`}>
      {/* СВЁРНУТАЯ */}
      <button
        onClick={() => setOpen(v=>!v)}
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 rounded-xl"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{doc.icon || (doc.type==='rent' ? '🏠' : doc.type==='sale' ? '🤝' : '📄')}</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{doc.title}</span>
              {statusBadge && (
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${statusBadge.classes}`}>
                  {statusBadge.label}
                </span>
              )}
            </div>
            {(details?.address || doc.address) ? (
              <div className="text-gray-500 text-sm">
                Адрес: {details?.address || doc.address}
              </div>
            ) : null}
          </div>
        </div>
        
      </button>

      {/* РАЗВЁРНУТАЯ */}
      {open && (
        <div className="px-4 pb-4">
          <div className="text-sm text-gray-700 space-y-2">
            {doc.trashed_at ? (() => {
              const until = addDays(doc.trashed_at, 10);
              return (
                <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
                  В корзине до: <b>{formatDateRu(until)}</b>. После этой даты документ будет удалён автоматически.
                </div>
              );
            })() : null}

            {(details?.landlords) && <div><b>Наймодатель(и):</b> {details.landlords}</div>}
            {(details?.tenants) && <div><b>Наниматель(и):</b> {details.tenants}</div>}
            {(details?.period) && <div><b>Срок:</b> {details.period}</div>}
            {(details?.amount) && <div><b>Сумма:</b> {details.amount}</div>}

            {(details?.versions?.length) ? (
              <div className="flex items-center gap-2 flex-wrap">
                <b>Версии:</b>
                {doc.versions.map((v, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded border ${
                      idx === 0 ? 'border-yellow-400 text-yellow-600' : 'border-gray-300 text-gray-700'
                    }`}
                  >
                    {idx === 0 ? '★ ' : ''}{v}
                  </span>
                ))}
                
              </div>
            ) : null}
          </div>

          {/* Кнопки действий */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* Открыть в редакторе */}
            <Link
              to={`/document-editor?docId=${encodeURIComponent(doc.id)}`}
              className={`${BTN.base} ${BTN.primary} w-full sm:w-auto`}
            >
              Открыть
            </Link>

            {/* Экспорт PDF */}
            <button
              type="button"
              className={`${BTN.base} ${BTN.secondary} w-full sm:w-auto`}
              onClick={() => handleExportPdf(doc)}
              title="Открыть PDF в новой вкладке"
            >
              PDF
            </button>

            {/* Экспорт DOCX */}
            <button
              type="button"
              className={`${BTN.base} ${BTN.secondary} w-full sm:w-auto`}
              onClick={() => handleExportDocx(doc)}
              title="Скачать DOCX"
            >
              DOCX
            </button>

            {/* Действия удаления/восстановления */}
            {!doc.trashed_at ? (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm('Переместить документ в корзину?')) return;
                  try {
                    setBusy(true);
                    await apiTrashDocument(doc.id);
                    doc.trashed_at = new Date().toISOString();  // оптимистично пометим
                    setDetails(d => d ? ({ ...d }) : d);        // триггер перерисовки
                  } catch (e) {
                    alert(e?.message || 'Не удалось переместить в корзину');
                  } finally {
                    setBusy(false);
                  }
                }}
                className={`${BTN.base} ${BTN.danger} w-full sm:w-auto`}
              >
                В корзину
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      setBusy(true);
                      await apiRestoreDocument(doc.id);
                      doc.trashed_at = null;
                      setDetails(d => d ? ({ ...d }) : d);
                    } catch (e) {
                      alert(e?.message || 'Не удалось восстановить документ');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className={`${BTN.base} ${BTN.success} w-full sm:w-auto`}
                >
                  Восстановить
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm('Удалить навсегда? Это действие необратимо.')) return;
                    try {
                      setBusy(true);
                      await apiDeleteDocumentForever(doc.id);
                      doc._deleted_forever = true;              // можно скрыть карточку на UI
                      setDetails(d => d ? ({ ...d }) : d);
                    } catch (e) {
                      alert(e?.message || 'Не удалось удалить');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className={`${BTN.base} ${BTN.danger} w-full sm:w-auto`}
                >
                  Удалить навсегда
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ========== СЕКЦИЯ "Мои сделки / Мои договоры" ==========
function DealsSection() {
  const [items, setItems] = useState([]);
  const [view, setView] = useState('active'); // 'active' | 'trash'
  const [query, setQuery] = useState('');
  const [typeFilters, setTypeFilters] = useState({ rent: true, sale: true, other: true });
  
  useEffect(() => {
    const controller = new AbortController();
    const trashed = view === 'trash' ? 'true' : 'false';

    fetch(`/api/documents?trashed=${trashed}`, {
      credentials: 'include',
      signal: controller.signal
    })
      .then(r => r.json())
      .then(rows => (Array.isArray(rows) ? rows : []))
      .then(async (rows) => {
        const enriched = await Promise.all(rows.map(async r => {
          let address='', landlords='', tenants='', period='', amount='';
          try {
            const jf = await fetch(`/api/documents/${r.id}/form`, { credentials: 'include' }).then(x => x.json());
            const form = jf?.json || null;

            address = form?.terms?.objectAddress || form?.terms?.address || '';
            const lns = (form?.landlords || []).map(p => shortFio(p.fullName)).filter(Boolean);
            const tns = (form?.tenants   || []).map(p => shortFio(p.fullName)).filter(Boolean);
            if (lns.length) landlords = lns.join('; ');
            if (tns.length) tenants   = tns.join('; ');
            if (form?.terms?.startDate || form?.terms?.endDate) {
              const s = form?.terms?.startDate ? form.terms.startDate.split('-').reverse().join('.') : '';
              const e = form?.terms?.endDate ? form.terms.endDate.split('-').reverse().join('.') : '';
              period = [s,e].filter(Boolean).join(' — ');
            }
            if (form?.terms?.rentPerMonth) {
              amount = `${Number(form.terms.rentPerMonth).toLocaleString('ru-RU')} ₽ / мес`;
            }
          } catch {}

          let versions = [];
          try {
            const vs = await fetch(`/api/documents/${r.id}/versions`, { credentials: 'include' }).then(x => x.json());
            versions = (vs || []).map(v => v.id);
          } catch {}

          const date = (r.updated_at || r.created_at || '').slice(0,10);
          return {
            id: r.id,
            type: r.type || 'rent',
            title: r.title || 'Документ',
            status: r.status,
            date,
            updatedAt: r.updated_at,
            address, landlords, tenants, period, amount,
            versions,
            trashed_at: r.trashed_at || null
          };
        }));
        setItems(enriched);
      })
      .catch(() => setItems([]));

    return () => controller.abort();
  }, [view]);
  

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(it => {
      if (it.type==='rent' && !typeFilters.rent) return false;
      if (it.type==='sale' && !typeFilters.sale) return false;
      if (it.type!=='rent' && it.type!=='sale' && !typeFilters.other) return false;
      if (!q) return true;
      const hay = `${it.title} ${it.address} ${it.landlords} ${it.tenants}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, typeFilters]);

  const tree = useMemo(() => groupByYMD(filtered), [filtered]);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">Мои сделки / Мои договоры</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('active')}
            className={`text-sm px-3 py-1.5 rounded ${view==='active' ? 'bg-blue-600 text-white' : 'border text-gray-700 hover:bg-gray-50'}`}
          >
            Активные
          </button>
          <button
            onClick={() => setView('trash')}
            className={`text-sm px-3 py-1.5 rounded ${view==='trash' ? 'bg-blue-600 text-white' : 'border text-gray-700 hover:bg-gray-50'}`}
          >
            Корзина
          </button>
          
        </div>
      </div>


      <div className="flex flex-col md:flex-row gap-2 md:items-center mb-4">
        <input
          value={query}
          onChange={e=>setQuery(e.target.value)}
          placeholder="Поиск по адресу / ФИО / №"
          className="w-full md:w-1/2 px-3 py-2 border rounded-lg"
        />
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={typeFilters.rent} onChange={e=>setTypeFilters(s=>({...s, rent: e.target.checked}))} />
            Найм/Аренда
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={typeFilters.sale} onChange={e=>setTypeFilters(s=>({...s, sale: e.target.checked}))} />
            Купля/Продажа
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={typeFilters.other} onChange={e=>setTypeFilters(s=>({...s, other: e.target.checked}))} />
            Прочее
          </label>
        </div>
      </div>

      {/* Год → Месяц → День → Карточки (адрес только внутри карточки) */}
      <div>
        {tree.map(y => (
          <details key={y.year} open className="mb-2">
            <summary className="cursor-pointer select-none font-semibold text-gray-800">{y.year}</summary>

            {y.months.map(m => (
              <details key={`${y.year}-${m.month}`} open className="ml-4 my-1">
                <summary className="cursor-pointer select-none font-medium text-gray-700">{monthName(m.month)}</summary>

                {m.days.map(d => (
                  <details key={`${y.year}-${m.month}-${d.day}`} open className="ml-8 my-1">
                    <summary className="cursor-pointer select-none text-gray-600">{`${d.day}.${m.month}.${y.year}`}</summary>

                    {/* ВАЖНО: адрес НЕ выводим тут. Только карточки ниже. */}
                    <div className="ml-4 mt-2">
                      {d.docs
                      .filter(doc => !doc._deleted_forever)
                      .map(doc => <DocCard key={doc.id} doc={doc} />)}

                    </div>
                  </details>
                ))}
              </details>
            ))}
          </details>
        ))}
      </div>
    </div>
  );
}
// === helpers ===
const roleLabels = {
  private: 'Частное лицо',
  realtor: 'Риэлтор',
  lawyer: 'Юрист',
};

function formatDateRu(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatPhoneRu(phone) {
  if (!phone) return '—';
  // Ожидаем +7XXXXXXXXXX → превращаем в +7 900 123-45-67
  const m = phone.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (m) return `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}`;
  // Если другое — просто вернём как есть
  return phone;
}

// ========== СТРАНИЦА ==========
export default function UserDashboard() {
    // ⬇️ Очистка гостевых маркеров, чтобы после логина не срабатывал кулдаун гостя
    useEffect(() => {
      try {
        localStorage.removeItem('guest_generated_at');
        // Если хочешь, можно убрать и consent_id у авторизованных:
        // localStorage.removeItem('consent_id');
      } catch {}
    }, []);

    // === edit mode state ===
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [revoking, setRevoking] = useState(false);
    const [revokeErr, setRevokeErr] = useState('');
    const refreshMe = useCallback(async () => {
      setLoadingMe(true);
      try {
        const r = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        setMe(j?.user || null);
      } catch {
        setMe(null);
      } finally {
        setLoadingMe(false);
      }
    }, []);

    const [errMsg, setErrMsg] = useState('');

    // локальная форма профиля
    const [formFullName, setFormFullName] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formRole, setFormRole] = useState('private');
    const [formBirthDate, setFormBirthDate] = useState(''); // YYYY-MM-DD

    // при входе в edit: проставим значения из me
    function startEdit() {
      if (!me) return;
      setFormFullName(me.full_name || '');
      // нормализуем телефон к +7XXXXXXXXXX → для ввода можно оставить так
      setFormPhone(me.phone || '');
      setFormRole(me.profile_role || 'private');
      // приводим birth_date к YYYY-MM-DD (input[type=date])
      const d = me.birth_date ? new Date(me.birth_date) : null;
      const y = d ? d.getFullYear() : '';
      const m = d ? String(d.getMonth()+1).padStart(2,'0') : '';
      const day = d ? String(d.getDate()).padStart(2,'0') : '';
      setFormBirthDate(d ? `${y}-${m}-${day}` : '');
      setErrMsg('');
      setEditMode(true);
    }

    function cancelEdit() {
      setEditMode(false);
      setErrMsg('');
    }

    // простая клиентская валидация возраста (дублирует серверную)
    function checkAge14(birthDate) {
      if (!birthDate) return false;
      const bd = new Date(birthDate);
      if (isNaN(bd.getTime())) return false;
      const today = new Date();
      const age =
        today.getFullYear() - bd.getFullYear() -
        ((today.getMonth() < bd.getMonth() ||
          (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) ? 1 : 0);
      return age >= 14;
    }

    async function saveEdit() {
      try {
        setErrMsg('');
        if (!formFullName.trim()) {
          setErrMsg('Укажите ФИО'); return;
        }
        if (!formBirthDate || !checkAge14(formBirthDate)) {
          setErrMsg('Регистрация/профиль доступны только с 14 лет. Проверьте дату рождения.');
          return;
        }
        if (!formRole) {
          setErrMsg('Выберите роль'); return;
        }
        // телефон можно отправить как есть (сервер нормализует и валидирует)
        setSaving(true);
        const resp = await fetch('/api/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            full_name: formFullName.trim(),
            phone: formPhone.trim(),
            profile_role: formRole,
            birth_date: formBirthDate, // YYYY-MM-DD
          })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) {
          throw new Error(data?.error || 'update_failed');
        }
        // обновим me локально и выйдем из edit
        setMe(data.user);
        setEditMode(false);
        alert('Профиль сохранён');
      } catch (e) {
        setErrMsg('Не удалось сохранить профиль. Проверьте поля и попробуйте ещё раз.');
        console.error('saveEdit error:', e);
      } finally {
        setSaving(false);
      }
    }
    async function handleRevokeConsent() {
      setRevokeErr('');
      try {
        const res = await fetch('/api/consents/revoke', {  // ВАЖНО: ведущий слэш!
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        const j = await res.json().catch(() => ({}));

        if (res.status === 401) {
          setRevokeErr('Требуется вход в систему.');
          return;
        }
        if (res.status === 409 && (j?.code === 'no_active_consent' || j?.error === 'no_active_consent')) {
          // Нет активного подписанного ПДн — считаем кабинет «заблокированным»
          setRevokeErr('Подписанное согласие не найдено.');
          // обновим профиль, чтобы подтянулся pdnActive=false
          await refreshMe?.();
          return;
        }
        if (!res.ok || !j?.ok) {
          throw new Error(j?.error || 'revoke_failed');
        }

        // успех: обновим профиль и покажем баннер в рабочей зоне
        await refreshMe?.();
      } catch (e) {
        console.error('revoke error:', e);
        setRevokeErr('Не удалось отозвать согласие. Попробуйте позже.');
      }
    }



  const [me, setMe] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => {
    refreshMe ();
  }, [refreshMe]);


  const [tab, setTab] = useState('profile');
  

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Вкладки */}
        <div className="flex gap-4 border-b">
          <button
            onClick={()=>setTab('profile')}
            className={`px-4 py-2 -mb-px ${tab==='profile'?'border-b-2 border-blue-600 text-blue-600':'text-gray-600 hover:text-blue-600'}`}
          >
            Профиль
          </button>
          <button
            onClick={()=>setTab('workspace')}
            className={`px-4 py-2 -mb-px ${tab==='workspace'?'border-b-2 border-blue-600 text-blue-600':'text-gray-600 hover:text-blue-600'}`}
          >
            Рабочая зона
          </button>
        </div>

        {/* Профиль */}
        {tab === 'profile' && (
          <div className="bg-white rounded-xl shadow-sm p-6 mt-4">
            <div className="text-lg font-semibold mb-4">Профиль пользователя</div>

            {loadingMe && (
              <div className="text-gray-500 text-sm">Загружаем профиль…</div>
            )}

            {!loadingMe && !me && (
              <div className="text-red-600 text-sm">
                Не удалось загрузить профиль. Попробуйте обновить страницу.
              </div>
            )}

            {!loadingMe && me && (
              <>
                {!editMode ? (
                  // ===== ПРОСМОТР =====
                  <div className="grid md:grid-cols-2 gap-x-8 gap-y-3 text-gray-800">
                    <div><b>ФИО:</b> {me?.full_name || '—'}</div>
                    <div><b>Дата рождения:</b> {formatDateRu(me?.birth_date)}</div>
                    <div><b>Телефон:</b> {formatPhoneRu(me?.phone)}</div>
                    <div>
                      <b>Email:</b> {me?.email || '—'}
                      {me?.email_verified_at && (
                        <span className="text-green-600 ml-1">[Подтверждён]</span>
                      )}
                    </div>
                    <div><b>Роль:</b> {roleLabels[me.profile_role] || '—'}</div>
                    <div><b>Организация:</b> —</div>
                  </div>
                ) : (
                  // ===== ФОРМА РЕДАКТИРОВАНИЯ =====
                  <div className="grid md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-sm">ФИО</span>
                      <input
                        className="mt-1 w-full border rounded px-3 py-2"
                        value={formFullName}
                        onChange={e=>setFormFullName(e.target.value)}
                        placeholder="Иванов Иван Иванович"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm">Телефон</span>
                      <input
                        className="mt-1 w-full border rounded px-3 py-2"
                        value={formPhone}
                        onChange={e=>setFormPhone(e.target.value)}
                        placeholder="+7 900 123-45-67"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm">Роль</span>
                      <select
                        className="mt-1 w-full border rounded px-3 py-2"
                        value={formRole}
                        onChange={e=>setFormRole(e.target.value)}
                      >
                        <option value="private">Частное лицо</option>
                        <option value="realtor">Риэлтор</option>
                        <option value="lawyer">Юрист</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-sm">Дата рождения</span>
                      <input
                        type="date"
                        className="mt-1 w-full border rounded px-3 py-2"
                        value={formBirthDate}
                        onChange={e=>setFormBirthDate(e.target.value)}
                      />
                    </label>
                  </div>
                )}


                {/* Согласие ПДн */}
                <div className="mt-6 pt-4 border-t">
                  <div className="font-medium mb-2">Согласие об обработке ПД:</div>
                  <div className="text-sm text-gray-700 flex items-center gap-3">
                    Подписано: {formatDateRu(me?.consentSignedAt)}
                    <a
                      className="text-blue-600 hover:underline"
                      href={`${API_ORIGIN}/api/agreements/html?doc=pdn&v=${encodeURIComponent(me?.consentVersion || '')}`}
                      target="_blank" rel="noreferrer"
                    >
                      Открыть текст версии ({me?.consentVersion || '—'})
                    </a>
                  </div>
                </div>
                {/* Кнопки действий */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {!editMode ? (
                    <>
                      <button
                        className={`${BTN.base} ${BTN.primary} w-full sm:w-auto`}
                        onClick={startEdit}
                        disabled={loadingMe || !me}
                      >
                        Изменить данные
                      </button>

                      <button
                        className={`${BTN.base} ${BTN.secondary} w-full sm:w-auto`}
                        disabled
                        title="Скоро"
                      >
                        Сменить пароль
                      </button>

                      {me?.pdnActive ? (
                        <button
                          className={`${BTN.base} ${BTN.danger} w-full sm:w-auto`}
                          onClick={handleRevokeConsent}
                          disabled={revoking}
                        >
                          {revoking ? 'Отзываем…' : 'Отозвать согласие ПДн'}
                        </button>
                      ) : (
                        <Link
                          to="/register?mode=reconsent"
                          className={`${BTN.base} ${BTN.primary} w-full sm:w-auto`}
                          title="Открыть мастер повторной подписи документов"
                        >
                          Повторно подписать
                        </Link>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        className={`${BTN.base} ${BTN.primary} w-full sm:w-auto`}
                        onClick={saveEdit}
                        disabled={saving}
                      >
                        {saving ? 'Сохраняем…' : 'Сохранить'}
                      </button>

                      <button
                        className={`${BTN.base} ${BTN.secondary} w-full sm:w-auto`}
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        Отмена
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {/* Рабочая зона */}
        {tab==='workspace' && (
          <div className="mt-4">
            {!me?.pdnActive ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-yellow-900">
                <div className="font-semibold mb-2">Доступ ограничен</div>
                <p className="mb-3">
                  Ваше согласие на обработку персональных данных отозвано или отсутствует.
                  Для продолжения работы необходимо повторно ознакомиться и подписать
                  Политику конфиденциальности, Пользовательское соглашение и Согласие на ПДн.
                </p>
                <Link
                  to="/register?mode=reconsent"
                  className={`${BTN.base} ${BTN.primary} w-full sm:w-auto inline-flex`}
                >
                  Повторно подписать
                </Link>
              </div>
            ) : (
              <>
                {/* Кнопки как на homepage */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Link to="/property-type/rent" className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4"><FontAwesomeIcon icon={faHouse} className="text-blue-600 text-2xl" /></div>
                    <h2 className="text-xl font-semibold mb-2">Сдать/Снять</h2>
                    <p className="text-gray-600 text-center">Договоры аренды жилой и коммерческой недвижимости</p>
                  </Link>
                  <Link to="/property-type/sale" className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4"><FontAwesomeIcon icon={faHandshake} className="text-green-600 text-2xl" /></div>
                    <h2 className="text-xl font-semibold mb-2">Купить/Продать</h2>
                    <p className="text-gray-600 text-center">Договоры купли-продажи и сопутствующие документы</p>
                  </Link>
                  <Link to="/other" className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4"><FontAwesomeIcon icon={faFileContract} className="text-gray-500 text-2xl" /></div>
                    <h2 className="text-xl font-semibold mb-2">Прочие документы</h2>
                    <p className="text-gray-600 text-center">Доверенности, соглашения и др.</p>
                  </Link>
                  <Link to="/counterparty-check" className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-4"><FontAwesomeIcon icon={faShieldHalved} className="text-indigo-600 text-2xl" /></div>
                    <h2 className="text-xl font-semibold mb-2">Проверка контрагента</h2>
                    <p className="text-gray-600 text-center">Доступ к источникам ФССП, КАД, ЕФРСБ и др.</p>
                  </Link>
                </div>

                {/* Блок “Мои сделки / Мои договоры” */}
                <DealsSection />
              </>
            )}  
          </div>
        )}
      </div>
    </div>
  );
}

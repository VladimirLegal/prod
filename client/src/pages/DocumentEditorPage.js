import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLocation } from 'react-router-dom';
import { useEditor, EditorContent } from "@tiptap/react";
import { Editor } from '@tiptap/react'
import StarterKit from "@tiptap/starter-kit";

// ↓↓↓ ДОБАВИТЬ вот это:
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import { Extension } from '@tiptap/core';


// таблицы — СНАЧАЛА импорт, ПОТОМ расширения на их основе
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
// тулбар (иконки)
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBold,
  faItalic,
  faUnderline,
  faListUl,
  faListOl,
  faAlignLeft,
  faAlignCenter,
  faAlignRight,
  faAlignJustify,
  faUndo,
  faRedo,
  faPlay,
  faSave,
  faFilePdf,
  faUndoAlt,
  faFileWord,
  faArrowLeft,
} from '@fortawesome/free-solid-svg-icons';

const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: el => el.getAttribute('class'),
        renderHTML: attrs => attrs.class ? { class: attrs.class } : {}
      },
      style: {
        default: null,
        parseHTML: el => el.getAttribute('style'),
        renderHTML: attrs => attrs.style ? { style: attrs.style } : {}
      },
    };
  },
});

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: el => el.getAttribute('class'),
        renderHTML: attrs => attrs.class ? { class: attrs.class } : {}
      },
      style: {
        default: null,
        parseHTML: el => el.getAttribute('style'),
        renderHTML: attrs => attrs.style ? { style: attrs.style } : {}
      },
    };
  },
});

const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: el => el.getAttribute('class'),
        renderHTML: attrs => attrs.class ? { class: attrs.class } : {}
      },
      style: {
        default: null,
        parseHTML: el => el.getAttribute('style'),
        renderHTML: attrs => attrs.style ? { style: attrs.style } : {}
      },
    };
  },
});

// Разрешаем class / style / data-hint на параграфах и заголовках
const GlobalAttrs = Extension.create({
  name: 'globalAttrsForHints',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          class: {
            default: null,
            parseHTML: el => el.getAttribute('class'),
            renderHTML: attrs => attrs.class ? { class: attrs.class } : {},
          },
          style: {
            default: null,
            parseHTML: el => el.getAttribute('style'),
            renderHTML: attrs => attrs.style ? { style: attrs.style } : {},
          },
          'data-hint': {
            default: null,
            parseHTML: el => el.getAttribute('data-hint'),
            renderHTML: attrs =>
              attrs['data-hint'] ? { 'data-hint': attrs['data-hint'] } : {},
          },
        },
      },
    ];
  },
});

// Wrap naked {{ placeholders }} with non-editable chips for display
function wrapPlaceholdersWithChips(html) {
  return html.replace(/{{\s*([\w.]+)\s*}}/g, (_m, key) =>
    `<span class="ph-chip" data-ph="${key}" contenteditable="false">{{${key}}}</span>`
  );
}

// Try to load formData from storage (sessionStorage or localStorage)
async function loadFormDataFallback() {
  try {
    const s = window.sessionStorage.getItem("leaseFormData");
    if (s) return JSON.parse(s);
  } catch {}
  try {
    const l = window.localStorage.getItem("leaseFormData");
    if (l) return JSON.parse(l);
  } catch {}
  try {
    // check old key (for backward compatibility)
    const old = window.localStorage.getItem("formData");
    if (old) return JSON.parse(old);
  } catch {}
  return {};
}

// простой детектор авторизации
async function fetchMe() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) return { ok: false };
    const j = await res.json();
    return { ok: true, user: j && j.id ? j : null };
  } catch {
    return { ok: false };
  }
}


export default function DocumentEditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const docIdFromUrl = params.get('docId') || null;         // строка или null
  const versionIdFromUrl = params.get('versionId'); // строка или null
  
  const [html, setHtml] = useState("");              // current editor HTML content
  const [formData, setFormData] = useState(null);    // form data object from wizard
  const [saving, setSaving] = useState(false);
  const [documentId, setDocumentId] = useState(null);
  // ------------- ID helpers -------------
  const isUUID = (s) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || ''));
  // UUID документа для /api/documents/:id
  const docUUID = isUUID(docIdFromUrl) ? docIdFromUrl : (isUUID(documentId) ? documentId : null);
  // ID для /api/docs/:id (шаблоны) — допускаем UUID или 1 как базовый шаблон
  const currentDocId = docUUID || 1;

  const terms = formData?.terms || {};
  const [savedAt, setSavedAt] = useState(null); // если такого состояния у тебя ещё нет

  const [versions, setVersions] = useState([]);
  const [selectedFrom, setSelectedFrom] = useState(null);
  const [selectedTo, setSelectedTo] = useState(null);
  const [diffHtml, setDiffHtml] = useState("")
  const [autoRendered, setAutoRendered] = useState(false);
  const effectiveDocId = documentId || docIdFromUrl || '';
  // Запрет параллельной/повторной генерации
  const isRenderingRef = useRef(false);

  const skipNextDocLoadRef = useRef(false);
  const [isAuthed, setIsAuthed] = useState(false);
  useEffect(() => {
    let mounted = true;
    fetchMe().then(r => { if (mounted) setIsAuthed(!!(r.ok && r.user)); });
    return () => { mounted = false; };
  }, []);


  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleCopy = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('copy', handleCopy, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('copy', handleCopy, true);
    };
  }, []);

  const reloadVersions = useCallback(async () => {
    if (!docUUID) return; // только для настоящего документа (UUID)

    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(docUUID)}/versions`, { credentials: 'include' });
      const rows = await res.json();

      const list = Array.isArray(rows)
        ? rows.map((v, idx) => ({
            id: v.id,
            versionId: v.id,
            created_at: v.created_at,
            seq: v.seq || (idx + 1),
            label: v.label || `v${v.seq || (idx + 1)}`
          }))
        : [];

      setVersions(list);

      // починим выбранные для диффа, если их нет в новом списке
      const ids = new Set(list.map(v => String(v.id)));
      setSelectedFrom(prev => (prev && ids.has(String(prev)) ? prev : null));
      setSelectedTo(prev => (prev && ids.has(String(prev)) ? prev : null));
    } catch (e) {
      console.error("Failed to load versions list:", e);
    }
  }, [docUUID]);



  const versionActionButtonStyle = useMemo(() => ({
    padding: '4px 8px',
    border: '1px solid #c5cfe5',
    borderRadius: 6,
    background: '#f5f7ff',
    cursor: 'pointer',
    fontSize: 12,
    color: '#1f2a44'
  }), []);

  const versionBadgeStyle = useMemo(() => ({
    display: 'inline-block',
    marginLeft: 6,
    padding: '2px 6px',
    borderRadius: 4,
    background: '#e6efff',
    color: '#2f4da0',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase'
  }), []);

  // если открыли существующий документ по ссылке — один раз зафиксируем в стейте
  useEffect(() => {
    if (!documentId && docIdFromUrl) {
      setDocumentId(docIdFromUrl);
    }
  }, [docIdFromUrl, documentId]);

  // Load template / existing HTML on mount
  useEffect(() => {
    if (skipNextDocLoadRef.current) {
      skipNextDocLoadRef.current = false;
      return;
    }
    (async () => {
      // === 1) СУЩЕСТВУЮЩИЙ ДОКУМЕНТ ПО UUID ===
      if (docUUID) {
        try {
          // 1.1 Если указан versionId — грузим её
          if (versionIdFromUrl) {
            const htmlResp = await fetch(
              `/api/documents/${encodeURIComponent(docUUID)}/versions/${encodeURIComponent(versionIdFromUrl)}`,
              { credentials: 'include' }
            );
            const { html: versionHtml } = await htmlResp.json();
            if (versionHtml) setHtml(versionHtml);
          } else {
            // 1.2 Иначе — последнюю версию
            const vs = await fetch(
              `/api/documents/${encodeURIComponent(docUUID)}/versions`,
              { credentials: 'include' }
            ).then(r => r.json());

            if (Array.isArray(vs) && vs.length) {
              const last = vs[vs.length - 1];
              const htmlResp = await fetch(
                `/api/documents/${encodeURIComponent(docUUID)}/versions/${encodeURIComponent(last.id)}`,
                { credentials: 'include' }
              );
              const { html: lastHtml } = await htmlResp.json();
              if (lastHtml) setHtml(lastHtml);
            } else {
              // 1.3 Версий нет — срендерим из шаблона по серверной форме
              await restoreFromTemplate(docUUID);
            }
          }

          // 1.4 server-side formData
          try {
            const jf = await fetch(
              `/api/documents/${encodeURIComponent(docUUID)}/form`,
              { credentials: 'include' }
            ).then(r => r.json());
            if (jf && jf.json) setFormData(jf.json);
          } catch {}

          // 1.5 список версий
          await reloadVersions();

          return; // не идём в ветку «новый документ»
        } catch (e) {
          console.error('Failed to load existing document:', e);
          // упадём в ветку «новый документ»
        }
      }

      // === 2) НОВЫЙ ДОКУМЕНТ: шаблон + локальная форма ===
      try {
        const tplText = await fetch(
          `/api/docs/${encodeURIComponent(currentDocId)}/editor?fresh=1`,
          { credentials: 'include' }
        ).then(r => r.text());
        const tplWrapped = wrapPlaceholdersWithChips(tplText);
        setHtml(tplWrapped);
      } catch (e) {
        console.error("Load template error:", e);
      }

      try {
        const fd = await loadFormDataFallback();
        setFormData(fd || {});
        if (fd && Object.keys(fd).length === 0) {
          console.warn("Form data not found. The document will have empty placeholders.");
        }
      } catch (e) {
        console.error("Load formData error:", e);
        setFormData({});
      }

      // у нового документа версий ещё нет — но вызов без docUUID вернёт return
      await reloadVersions();
    })();
  }, [docUUID, versionIdFromUrl, currentDocId, reloadVersions]);


  
  // Initialize Tiptap editor with needed extensions and content
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ['heading', 'paragraph'],   // на что действует
      }),
      CustomTable.configure({ resizable: true }),
      TableRow,
      CustomTableCell,
      CustomTableHeader,
      GlobalAttrs,
    ],

    content: html,  // initial content
    onUpdate: ({ editor }) => {
      // Update html state when editor content changes
      setHtml(editor.getHTML());
    }
  });
  // Автоприменение данных при первом входе
  useEffect(() => {
    if (autoRendered) return;                              // уже применяли — выходим
    if (!editor) return;                                   // ждём инициализации редактора
    if (!formData || Object.keys(formData).length === 0) { // нет данных — не жмём
      return;
    }
    (async () => {
      try {
        await restoreFromTemplate(docUUID || 1);
      } catch (e) {
        console.warn('[auto-render] restoreFromTemplate failed, fallback to handleRenderServer', e);
        try {
          handleRenderServer();                            // пробуем рендер текущего HTML
        } catch (e2) {
          console.error('[auto-render] handleRenderServer failed', e2);
        }
      } finally {
        setAutoRendered(true);                             // больше не запускать
      }
    })();
  }, [editor, formData, autoRendered]);

  // 🔹 Делегат для вашей кнопки/восстановления
  function setEditorContent(html) {
    if (editor) {
      editor.commands.setContent(html); // вторым параметром отключаем нормализацию, если не нужна
    }
  }
  
  // ВСТАВИТЬ СРАЗУ ПОСЛЕ setEditorContent(...)
  function injectRawTablesFromFormData() {
    try {
      const root = document.querySelector('.ProseMirror');
      if (!root || !formData) {
        console.log('[inject] нет root или formData');
        return;
      }

      const invHtml = formData?.terms?.inventoryHtml || '';
      const aptHtml = formData?.terms?.apartmentHtml || '';

      let didInv = false, didApt = false;

      // 1) Пытаемся вставить в слоты (если есть)
      const invSlot = root.querySelector('.app-table-wrap[data-slot="inventoryHtml"]');
      const aptSlot = root.querySelector('.app-table-wrap[data-slot="apartmentHtml"]');

      if (invSlot && invHtml) {
        const alreadyHasTable = invSlot.querySelector('table');
        const innerText = (invSlot.textContent || '').trim();
        if (!alreadyHasTable && !innerText) {
          invSlot.innerHTML = invHtml;
          didInv = true;
        }
      }
      if (aptSlot && aptHtml) {
        const alreadyHasTable = aptSlot.querySelector('table');
        const innerText = (aptSlot.textContent || '').trim();
        if (!alreadyHasTable && !innerText) {
          aptSlot.innerHTML = aptHtml;
          didApt = true;
        }
      }


      // 2) Фолбэк: если слотов нет — вставляем прямо ПОСЛЕ <h2> с нужным текстом
      if (!didInv && invHtml) {
        const h2s = Array.from(root.querySelectorAll('h2, h2 *')).map(n => n.closest('h2')).filter(Boolean);
        const h2Inv = h2s.find(h =>
          /Приложение\s*№\s*1/i.test(h.textContent || '') &&
          /Опись\s+имущества/i.test(h.textContent || '')
        );
        if (h2Inv) {
          const wrap = document.createElement('div');
          wrap.className = 'app-table-wrap';
          wrap.setAttribute('data-fallback', 'inventoryHtml');
          wrap.setAttribute('contenteditable', 'false');
          wrap.innerHTML = invHtml;
          h2Inv.insertAdjacentElement('afterend', wrap);
          didInv = true;
        }
      }

      if (!didApt && aptHtml) {
        const h2s = Array.from(root.querySelectorAll('h2, h2 *')).map(n => n.closest('h2')).filter(Boolean);
        const h2Apt = h2s.find(h =>
          /Приложение\s*№\s*2/i.test(h.textContent || '') &&
          /Описание\s+квартиры/i.test(h.textContent || '')
        );
        if (h2Apt) {
          const wrap = document.createElement('div');
          wrap.className = 'app-table-wrap';
          wrap.setAttribute('data-fallback', 'apartmentHtml');
          wrap.setAttribute('contenteditable', 'false');
          wrap.innerHTML = aptHtml;
          h2Apt.insertAdjacentElement('afterend', wrap);
          didApt = true;
        }
      }

      console.log('[inject] slots:', { invSlot: !!invSlot, aptSlot: !!aptSlot, didInv, didApt });
    } catch (e) {
      console.warn('injectRawTablesFromFormData failed', e);
    }
  }

  // маленькая обёртка — запустить инъекцию после того, как TipTap дорендерит DOM
  function scheduleInjectTables() {
    setTimeout(() => injectRawTablesFromFormData(), 0);
  }

  // (не обязательно, но удобно для ручной проверки из консоли)
  window.injectRawTablesFromFormData = injectRawTablesFromFormData;


  // (необязательно) Временно пробросим в window для простого вызова извне:
  window.setEditorContent = setEditorContent;

  // If template loaded after editor initialized, update the editor content
  useEffect(() => {
    if (editor && html && editor.getHTML() !== html) {
      editor.commands.setContent(html);
      scheduleInjectTables();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, editor]);


  // Save current edits to localStorage on each change (for restore on reload)
  useEffect(() => {
    if (html) {
      window.localStorage.setItem("leaseDocumentHtml", html);
    }
  }, [html]);
  // НОВЫЙ ЭФФЕКТ: при первой загрузке formData подложить таблицы в слоты
  useEffect(() => {
    if (editor && formData) {
      scheduleInjectTables();
    }
  }, [editor, formData]);



  // Навесим классы на две целевые таблицы по их заголовкам
  function markTablesForStyling() {
    const root = document.querySelector('.ProseMirror');
    if (!root) return;

    const tables = Array.from(root.querySelectorAll('table'));
    tables.forEach(tbl => {
      const text = (tbl.textContent || '').replace(/\s+/g, ' ');

      // Опись имущества (есть "Оценочная стоимость" и "Примечание")
      if (/Оценочная стоимость/.test(text) && /Примечание/.test(text)) {
        tbl.classList.add('inventory-table');
        tbl.setAttribute('contenteditable', 'false');
      }

      // Описание квартиры (есть Пол/Стены/Потолок/Двери/Окна)
      if (/Пол/.test(text) && /Стены/.test(text) && /Потолок/.test(text) && /Двери/.test(text) && /Окна/.test(text)) {
        tbl.classList.add('apartment-table');
        tbl.setAttribute('contenteditable', 'false');
      }
    });
  }

  // Подменить слот, только если он существует и пуст
  function replaceIfEmptySlot(html, slotName, payloadHtml) {
    if (!payloadHtml) return html; // нечего вставлять
    const re = new RegExp(
      `<div\\s+class="app-table-wrap"[^>]*data-slot="${slotName}"[^>]*>([\\s\\S]*?)<\\/div>`,
      "i"
    );
    const m = html.match(re);
    if (!m) return html;                 // слота нет — оставим как есть (fallback ниже)
    const inner = (m[1] || "").trim();
    if (inner) return html;              // слот уже заполнен — не трогаем
    return html.replace(
      re,
      `<div class="app-table-wrap" data-slot="${slotName}">${payloadHtml}</div>`
    );
  }


  // Server-side render: substitute formData into placeholders
  async function handleRenderServer() {
    if (!editor) return;
    if (isRenderingRef.current) return;
    isRenderingRef.current = true;
    try {
      // 0) выбираем id: docIdFromUrl (открытый документ) || documentId (только что созданный) || 1 (базовый шаблон)
      const id = docIdFromUrl || documentId || 1;

      // 1) берём свежий шаблон именно для выбранного id
      const templateHtml = await fetch(
        `/api/docs/${encodeURIComponent(id)}/editor?fresh=1`,
        { credentials: 'include' }
      ).then(r => r.text());

      // 2) рендерим на сервере
      const res = await fetch(
        `/api/docs/${encodeURIComponent(id)}/render`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: 'include',
          body: JSON.stringify({ html: templateHtml, data: formData })
        }
      );

      // сервер может вернуть JSON {html} или чистый HTML
      let finalHtml = '';
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const errText = ct.includes('application/json') ? JSON.stringify(await res.json()) : await res.text();
        throw new Error(errText);
      }
      if (ct.includes('application/json')) {
        const j = await res.json();
        finalHtml = j?.html || '';
        if (!j?.ok && !finalHtml) throw new Error(j?.error || "Empty finalHtml");
      } else {
        finalHtml = await res.text();
      }

      if (!finalHtml) throw new Error("Empty finalHtml");

      // 3) подставляем результат + вклеиваем таблицы из formData
      const inv = formData?.terms?.inventoryHtml || '';
      const apt = formData?.terms?.apartmentHtml || '';
      let htmlWithTables = finalHtml;
      htmlWithTables = replaceIfEmptySlot(htmlWithTables, "inventoryHtml", inv);
      htmlWithTables = replaceIfEmptySlot(htmlWithTables, "apartmentHtml", apt);

      // Fallback: если слотов нет — вставим только один раз после H2 (при пустом месте)
      if (!/data-slot="inventoryHtml"/i.test(finalHtml) && inv) {
        htmlWithTables = htmlWithTables.replace(
          /(>Приложение\s*№\s*1[^<]*<\/h2>)/i,
          `$1<div class="app-table-wrap" data-fallback="inventoryHtml">${inv}</div>`
        );
      }

      editor.commands.setContent(htmlWithTables);
      // инъекцию делаем безопасной: только если слоты пустые (внутри сама проверит)
      scheduleInjectTables();

    } catch (e) {
      console.error("Render error:", e);
      alert("Не удалось сгенерировать документ (подставить данные). См. консоль.");
    } finally {
      isRenderingRef.current = false;
    }

  }

  
  // Save the current document version (draft)
  async function handleSaveVersion() {
    if (!editor) return;
    setSaving(true);
    try {
      const html = editor.getHTML() || '';

      // 1) если документа ещё нет — создаём
      let currentId = documentId;
      if (!currentId) {
        const createRes = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // <= ДОБАВЛЕНО
          body: JSON.stringify({
            type: 'rent',
            title: terms?.objectAddress ? `Договор найма: ${terms.objectAddress}` : 'Договор найма',
            status: 'draft',
            html
          }),
        });
        const created = await createRes.json().catch(() => ({}));
        if (!createRes.ok || !created?.id) {
          throw new Error(created?.error || 'create_failed');
        }
        currentId = created.id;

        // зафиксируем id в стейте
        setDocumentId(currentId);
        skipNextDocLoadRef.current = true;

        // и сразу запишем его в URL, чтобы экспорт/перезагрузка всегда видели docId
        try {
          const usp = new URLSearchParams(window.location.search);
          if (usp.get('docId') !== String(currentId)) {
            usp.set('docId', String(currentId));
            window.history.replaceState(null, '', `${window.location.pathname}?${usp.toString()}`);
          }
        } catch {}
      } else {
        // 2) иначе — обновляем (создаст новую версию)
        const putRes = await fetch(`/api/documents/${encodeURIComponent(currentId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // <= ДОБАВЛЕНО
          body: JSON.stringify({ html }),
        });
        if (!putRes.ok) {
          const err = await putRes.json().catch(() => ({}));
          throw new Error(err?.error || 'save_failed');
        }
      }

      // (опционально) сохранить formData мастера на сервере
      if (typeof formData !== 'undefined' && formData) {
        const consentId = localStorage.getItem('consent_id') || null;
        await fetch(`/api/documents/${encodeURIComponent(currentId)}/form`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // <= ДОБАВЛЕНО
          body: JSON.stringify({ json: formData, consentId })
        }).catch(() => {});
      }

      // обновим список версий, если у тебя он на странице
      try {
        const listRes = await fetch(`/api/documents/${encodeURIComponent(currentId)}/versions`, {
          credentials: 'include' // <= ДОБАВЛЕНО
        });
        const list = await listRes.json().catch(() => []);
        setVersions?.(Array.isArray(list) ? list : []);
      } catch (_) {}

      setSavedAt && setSavedAt(new Date());
      alert('Версия сохранена');
    } catch (e) {
      console.error('Save error:', e);
      alert('Не удалось сохранить документ.');
    } finally {
      setSaving(false);
    }
  }


  // Build diff between two selected versions
  function handleBuildDiff() {
    if (!selectedFrom || !selectedTo) {
      alert("Выберите две версии для сравнения");
      return;
    }
    const currentId = documentId || docIdFromUrl; // важная правка
    if (!currentId) {
      alert("Нет ID документа. Сохраните документ или откройте его по ссылке из кабинета.");
      return;
    }
    const diffUrl = `/document-diff?docId=${encodeURIComponent(currentId)}&from=${encodeURIComponent(selectedFrom)}&to=${encodeURIComponent(selectedTo)}`;
    window.open(diffUrl, "_blank", "noopener");
  }


  const handleDeleteVersion = useCallback(async (versionId) => {
    if (!documentId) {
      alert("Нет ID документа. Сохраните документ перед удалением версий.");
      return;
    }

    if (!window.confirm(`Удалить версию ${versionId}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/documents/${documentId}/versions/${versionId}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Не удалось удалить версию");
      }
      await reloadVersions();
      if (String(versionId) === selectedFrom) setSelectedFrom(null);
      if (String(versionId) === selectedTo) setSelectedTo(null);
    } catch (e) {
      console.error("Delete version error:", e);
      alert(e?.message || "Не удалось удалить версию");
    }
  }, [documentId, reloadVersions, selectedFrom, selectedTo]);

  // Загрузить выбранную версию в редактор (перезапишет текущий текст)
  // Открыть конкретную сохранённую версию
  async function handleOpenVersion(versionId) {
    try {
      const id = documentId || docUUID; // резерв: UUID из URL
      if (!id) { alert('Нет ID документа'); return; }

      const r = await fetch(
        `/api/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`,
        { credentials: 'include' }
      );
      const data = await r.json();
      const html = data?.html;
      if (!html) {
        alert('Не удалось загрузить версию документа.');
        return;
      }
      setHtml(html);
    } catch (e) {
      console.error('handleOpenVersion error:', e);
      alert('Ошибка при открытии версии. См. консоль.');
    }
  }


  function handleClearDiff() {
    setSelectedFrom(null);
    setSelectedTo(null);
  
  }

  // Export PDF for guest: auto-save ephemeral draft server-side + enforce 15-min cooldown
  async function handlePreviewPdf() {
    if (!editor) return;
    try {
      const consentId = localStorage.getItem('consent_id') || '';
      const htmlNow = editor.getHTML();

      // 1) Эфемерный черновик (гость). Сервер сам посчитает кулдаун и вернёт 429 при необходимости.
      // 1) Эфемерный черновик (гость) — заголовки собираем условно
      const headers = { "Content-Type": "application/json" };
      if (!isAuthed) {
        const cid = localStorage.getItem('consent_id') || '';
        if (cid) headers["X-Consent-Id"] = cid;
      }

      const draftRes = await fetch(`/api/docs/1/drafts`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ html: htmlNow, changeNote: 'auto-for-pdf', ephemeral: true })
      });

      if (draftRes.status === 429) {
        const msg = await draftRes.json().catch(() => ({}));
        const left = typeof msg?.cooldownRemainingSec === 'number' ? msg.cooldownRemainingSec : null;
        alert(left != null 
          ? `Повторная генерация будет доступна через ${Math.ceil(left/60)} мин.`
          : `Слишком часто. Повторите позже.`);
        return;
      }
      if (!draftRes.ok) {
        throw new Error(`Draft save failed: ${await draftRes.text()}`);
      }

      // 2) Генерация PDF — теми же headers (для авторизованных без X-Consent-Id)
      const pdfRes = await fetch(`/api/docs/1/export/pdf`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ html: htmlNow, data: formData })
      });


      if (pdfRes.status === 429) {
        const msg = await pdfRes.json().catch(() => ({}));
        const left = typeof msg?.cooldownRemainingSec === 'number' ? msg.cooldownRemainingSec : null;
        alert(left != null 
          ? `Повторная генерация будет доступна через ${Math.ceil(left/60)} мин.`
          : `Слишком часто. Повторите позже.`);
        return;
      }
      if (!pdfRes.ok) throw new Error(await pdfRes.text());

      const blob = await pdfRes.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank"); // просмотр в новой вкладке

      // 3) Очистка локальных данных формы (consent_id сохраняем) + отметка времени
      try {
        const consent = localStorage.getItem('consent_id');
        // Полная очистка
        localStorage.clear();
        sessionStorage.clear();
        // Вернём согласие
        if (consent) localStorage.setItem('consent_id', consent);
        // Зафиксируем момент генерации (для блока на повторный заход в мастер)
        localStorage.setItem('guest_generated_at', String(Date.now()));
      } catch (e) {
        console.warn('LS cleanup after PDF error:', e);
      }

    } catch (e) {
      console.error("PDF export error:", e);
      alert("Ошибка экспорта PDF. См. консоль.");
    }
  }


  // Export DOCX: only for authenticated users. Guests get 403 from server.
  async function handleDownloadDocx() {
    if (!editor) return;
    try {
      const payload = { html: editor.getHTML(), data: formData };
      const res = await fetch(`/api/docs/1/export/docx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (res.status === 403) {
        alert("Сохранение DOCX доступно только зарегистрированным пользователям.");
        return;
      }
      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "lease.docx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error("DOCX export error:", e);
      alert("Ошибка экспорта DOCX. См. консоль.");
    }
  }
  
  async function restoreFromTemplate(docIdArg) {
    try {
      if (isRenderingRef.current) return;
      isRenderingRef.current = true;
      // 1) ID: UUID для существующих, иначе 1
      const id = docIdArg || docUUID || 1;

      // 2) Шаблон (для /api/docs/… допускается 1)
      const templateHtml = await fetch(
        `/api/docs/${encodeURIComponent(id)}/editor?fresh=1`,
        { credentials: 'include' }
      ).then(r => r.text());

      // 3) Данные для рендера:
      let dataForRender = formData;

      // форму с сервера берём только если ID — UUID (реальный документ)
      if (isUUID(id)) {
        try {
          const jf = await fetch(
            `/api/documents/${encodeURIComponent(id)}/form`,
            { credentials: 'include' }
          ).then(r => r.json());
          if (jf && jf.json) {
            dataForRender = jf.json;
            setFormData(jf.json);
          }
        } catch {}
      }

      // 4) Серверный рендер
      const renderResp = await fetch(
        `/api/docs/${encodeURIComponent(id)}/render`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ html: templateHtml, data: dataForRender })
        }
      );

      let finalHtml = '';
      const ct = renderResp.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const j = await renderResp.json();
        finalHtml = j?.html || '';
      } else {
        finalHtml = await renderResp.text();
      }

      if (finalHtml) {
        // 5) Вклейка таблиц (оставляю твой код)
        const inv = formData?.terms?.inventoryHtml || '';
        const apt = formData?.terms?.apartmentHtml || '';

        let htmlWithTables = finalHtml;
        htmlWithTables = replaceIfEmptySlot(htmlWithTables, "inventoryHtml", inv);
        htmlWithTables = replaceIfEmptySlot(htmlWithTables, "apartmentHtml", apt);

        if (!/data-slot="inventoryHtml"/i.test(finalHtml) && inv) {
          htmlWithTables = htmlWithTables.replace(
            /(>Приложение\s*№\s*1[^<]*<\/h2>)/i,
            `$1<div class="app-table-wrap" data-fallback="inventoryHtml">${inv}</div>`
          );
        }

        setEditorContent(htmlWithTables);

        // подстраховка классов
        setTimeout(() => {
          try {
            const root = document.querySelector('.ProseMirror');
            root?.querySelectorAll('.app-table-wrap table')?.forEach(tbl => {
              const text = (tbl.textContent || '').replace(/\s+/g, ' ');
              if (/Оценочная стоимость/.test(text) && /Примечание/.test(text)) {
                tbl.classList.add('inventory-table');
              }
              if (/Пол/.test(text) && /Стены/.test(text) && /Потолок/.test(text) && /Двери/.test(text) && /Окна/.test(text)) {
                tbl.classList.add('apartment-table');
              }
            });
          } catch {}
        }, 0);
      } else {
        console.warn('[restoreFromTemplate] render failed, fallback to raw template');
        setEditorContent(templateHtml);
      }
    } catch (err) {
      console.error('restoreFromTemplate error:', err);
    } finally {
      isRenderingRef.current = false;
    }
  }


  async function clearSaved(docId) {
    await fetch(`/api/docs/${docId}/clear`, { method: 'POST' });
    // на клиенте дополнительно очистить localStorage/IndexedDB, если используете
    localStorage.removeItem(`doc:${docId}`);
    localStorage.removeItem('editorContent'); // если такой ключ есть
    // и сразу подгрузить чистый шаблон:
    await restoreFromTemplate(docId);
  }

  // UI warning if formData is missing
  const formDataMissing = formData && Object.keys(formData).length === 0;
  
  function handleBackToWizard() {
    // НИЧЕГО не сохраняем отсюда — мастер сам управляет кэшем формы и таблиц
    try {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/', { replace: true });
      }
    } catch {
      window.history.back();
    }
  }


  return (
    <div style={{ padding: 16 }}>
      {formDataMissing && (
        <div style={{ marginBottom: 16, color: "red" }}>
          Внимание: данные формы не найдены. Пожалуйста, вернитесь к мастеру и заполните данные.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        {/* Left column: Editor */}
        <div>
          <div className="tt-sticky">
            <div className="tt-row tt-top">
              <div className="tt-left">
                <button onClick={handleBackToWizard} className="tt-back">
                  ← Назад к мастеру
                </button>
                <h2 className="tt-title">Редактор договора</h2>
              </div>
              <div className="tt-right doc-actions">
                <button onClick={handleSaveVersion} disabled={saving} className="doc-btn save">
                  <FontAwesomeIcon icon={faSave} className="fa-icon" />
                  Сохранить
                </button>
                <button onClick={handlePreviewPdf} className="doc-btn pdf">
                  <FontAwesomeIcon icon={faFilePdf} className="fa-icon" />
                  PDF
                </button>
                <button onClick={() => restoreFromTemplate(docUUID || 1)} className="doc-btn restore">
                  <FontAwesomeIcon icon={faUndoAlt} className="fa-icon" />
                  Восстановить
                </button>
                <button onClick={handleDownloadDocx} className="doc-btn docx">
                  <FontAwesomeIcon icon={faFileWord} className="fa-icon" />
                  DOCX
                </button>
                <div className="tt-group">
                <button
                  type="button"
                  className={`tt-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  title="Жирный"
                >
                  <FontAwesomeIcon icon={faBold} className="fa-icon" />
                </button>
                <button
                  type="button"
                  className={`tt-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  title="Курсив"
                >
                  <FontAwesomeIcon icon={faItalic} className="fa-icon" />
                </button>
                <button
                  type="button"
                  className={`tt-btn ${editor.isActive('underline') ? 'is-active' : ''}`}
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  title="Подчёркнутый"
                >
                  <FontAwesomeIcon icon={faUnderline} className="fa-icon" />
                </button>
              </div>
              <div className="tt-group">
                <button
                  type="button"
                  className={`tt-btn ${editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}`}
                  onClick={() => editor.chain().focus().setTextAlign('left').run()}
                  title="Выровнять по левому краю"
                >
                  <FontAwesomeIcon icon={faAlignLeft} className="fa-icon" />
                </button>
                <button
                  type="button"
                  className={`tt-btn ${editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}`}
                  onClick={() => editor.chain().focus().setTextAlign('center').run()}
                  title="По центру"
                >
                  <FontAwesomeIcon icon={faAlignCenter} className="fa-icon" />
                </button>
                <button
                  type="button"
                  className={`tt-btn ${editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}`}
                  onClick={() => editor.chain().focus().setTextAlign('right').run()}
                  title="По правому краю"
                >
                  <FontAwesomeIcon icon={faAlignRight} className="fa-icon" />
                </button>
                <button
                  type="button"
                  className={`tt-btn ${editor.isActive({ textAlign: 'justify' }) ? 'is-active' : ''}`}
                  onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                  title="По ширине"
                >
                  <FontAwesomeIcon icon={faAlignJustify} className="fa-icon" />
                </button>
              </div>

              <div className="tt-group">
                <button
                  type="button"
                  className={`tt-btn ${editor.isActive('bulletList') ? 'is-active' : ''}`}
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  title="Маркированный список"
                >
                  <FontAwesomeIcon icon={faListUl} className="fa-icon" />
                </button>
                <button
                  type="button"
                  className={`tt-btn ${editor.isActive('orderedList') ? 'is-active' : ''}`}
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  title="Нумерованный список"
                >
                  <FontAwesomeIcon icon={faListOl} className="fa-icon" />
                </button>
              </div>
              <div className="tt-group">
                <button
                  type="button"
                  className="tt-btn"
                  onClick={() => editor.chain().focus().undo().run()}
                  title="Отменить"
                >
                  <FontAwesomeIcon icon={faUndo} className="fa-icon" />
                </button>
                <button
                  type="button"
                  className="tt-btn"
                  onClick={() => editor.chain().focus().redo().run()}
                  title="Повторить"
                >
                  <FontAwesomeIcon icon={faRedo} className="fa-icon" />
                </button>
              </div>
              </div>
            </div>

            {editor && (
              <div className="tt-row tt-toolbar-row">
                <div className="tt-toolbar">
                  {/* кнопки форматирования редактора */}
                </div>
              </div>
            )}
          </div>
          {editor && (
            <div className="tt-toolbar">
              
            </div>
          )}

          {/* The rich text editor content area */}
          <div style={{ border: "1px solid #ccc", minHeight: 400, padding: 8 }}>
            <style>{`
              /* Единый липкий контейнер */
              .tt-sticky{
                position: sticky;
                top: 0;               /* если есть фикс-хедер приложения сверху, поставь его высоту, например top: 56px */
                z-index: 50;
                background: #fff;
                border-bottom: 1px solid #e5e7eb;
                box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                padding: 8px 10px;
                margin: 0 -10px 12px; /* чтобы фон/бордер тянулись на всю ширину колонки */
              }

              /* Ряды внутри липкого контейнера */
              .tt-row{
                display: flex;
                align-items: center;
                gap: 10px;
              }
              .tt-top{
                justify-content: space-between;
                flex-wrap: wrap;
              }
              .tt-left{
                display: flex;
                align-items: center;
                gap: 12px;
                min-height: 36px;
              }
              .tt-title{
                margin: 0;
                font-size: 18px;
                font-weight: 600;
              }

              /* Кнопка назад — сделаем её чуть аккуратнее */
              .tt-back{
                height: 32px;
                padding: 0 10px;
                border: 1px solid #e5e7eb;
                background: #fff;
                border-radius: 8px;
                cursor: pointer;
              }
              .tt-back:hover{ background: #f8fafc; }

              /* Ряд тулбара редактора под блоком действий */
              .tt-toolbar-row{
                margin-top: 6px;
              }

              /* Стили самого тулбара (если не вставлял раньше) */
              .tt-toolbar{
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                padding: 6px 0 0;
              }

              /* Немного адаптивности — чтобы на узких экранах действия падали на новую строку */
              @media (max-width: 900px){
                .tt-top{ gap: 8px; }
                .tt-right{ width: 100%; display: flex; flex-wrap: wrap; gap: 8px; }
                .tt-sticky{ padding: 8px; margin: 0 -8px 12px; }
              }

              .ProseMirror {
                min-height: 400px;
                padding: 20mm; /* поля как в A4 */
                font-family: "Times New Roman", serif;
                font-size: 12pt;
                line-height: 1.5;
                background: #fff;
              }

              .ProseMirror p {
                text-align: justify;
                margin: 0 0 8pt 0;
              }

              .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 {
                text-align: center;
                font-weight: bold;
                margin: 12pt 0 12pt 0;
              }
              /* Таблицы в редакторе — рамки и ширина */
              .ProseMirror .app-table-wrap table,
              .ProseMirror .inventory-table,
              .ProseMirror .apartment-table,
              .ProseMirror table {
                border-collapse: collapse; 
                width: 100%;
              }

              .ProseMirror .app-table-wrap th, .ProseMirror .app-table-wrap td,
              .ProseMirror .inventory-table th, .ProseMirror .inventory-table td,
              .ProseMirror .apartment-table th, .ProseMirror .apartment-table td,
              .ProseMirror table th, .ProseMirror table td {
                border: 1px solid #000; 
                padding: 3pt 4pt;
              }
              /* Панель действий документа */
              .doc-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 12px;
              }

              .doc-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                color: #fff;
                transition: background 0.2s ease;
              }

              .doc-btn .fa-icon {
                font-size: 14px;
              }

              /* Цветовые варианты */
              .doc-btn.generate { background: #007bff; }       /* синий */
              .doc-btn.generate:hover { background: #0069d9; }

              .doc-btn.save { background: #28a745; }          /* зелёный */
              .doc-btn.save:hover { background: #218838; }

              .doc-btn.pdf { background: #17a2b8; }           /* бирюзовый */
              .doc-btn.pdf:hover { background: #138496; }

              .doc-btn.restore { background: #fd7e14; }       /* оранжевый */
              .doc-btn.restore:hover { background: #e96b0c; }

              .doc-btn.docx { background: #6f42c1; }          /* фиолетовый */
              .doc-btn.docx:hover { background: #5a32a3; }

              /* — тулбар — */
              .tt-toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
              .tt-group   { display: inline-flex; gap: 6px; align-items: center; padding-right: 6px; border-right: 1px solid #ddd; }
              .tt-group:last-child { border-right: 0; }

              .tt-btn {
                display: inline-flex; align-items: center; justify-content: center;
                min-width: 34px; height: 32px; padding: 0 8px; border: 1px solid #ccc; border-radius: 6px;
                background: #f7f7f7; cursor: pointer; font-size: 14px;
              }
              .tt-btn:hover { background: #eee; }
              .tt-btn.is-active { background: #dce6ff; border-color: #7aa2ff; }
              .tt-btn .fa-icon { width: 16px; height: 16px; }
              /* маркер разрыва страницы; можно скрыть или тонко подсветить в редакторе */
              .ProseMirror .pagebreak {
                height: 0; 
                margin: 0; 
                padding: 0;
                /* можно включить визуальную пунктирную линию:
                border-top: 1px dashed #bbb;
                margin: 12px 0;
                */
              }
                
            `}</style>
            {/* Hints styling (editor only) */}
            <style>{`
              /* финальная проверка на специфичность: красим только в редакторе */
              .ProseMirror [data-hint], .ProseMirror .editor-hint {
                display: inline-block;
                margin: 6px 0 0 0;
                padding: 4px 8px;
                background: #fff8c5 !important;
                border: 1px solid #f0c36d;
                border-radius: 6px;
                font-size: 0.9em;
                color: #333;
              }
            `}</style>

            <EditorContent editor={editor} />
          </div>
        </div>
        {/* Right column: Versions and diff viewer */}
        <div style={{ minWidth: 320 }}>
          <h3>Версии</h3>
          <div style={{ marginBottom: 8 }}>
            <select value={selectedFrom || ''} onChange={e => setSelectedFrom(e.target.value)}>
              <option value="">— выбери версию —</option>
              {versions.map(v => (
                <option key={v.id} value={v.id}>
                  {v.label || `v${v.seq || ''}`}{v.created_at ? ` — ${new Date(v.created_at).toLocaleString('ru-RU')}` : ''}
                </option>
              ))}
            </select>

            <select value={selectedTo || ''} onChange={e => setSelectedTo(e.target.value)}>
              <option value="">— выбери версию —</option>
              {versions.map(v => (
                <option key={v.id} value={v.id}>
                  {v.label || `v${v.seq || ''}`}{v.created_at ? ` — ${new Date(v.created_at).toLocaleString('ru-RU')}` : ''}
                </option>
              ))}
            </select>

            <button onClick={handleBuildDiff}>Сравнить</button>

            <button onClick={handleClearDiff} style={{ marginLeft: 8 }}>
              Сбросить сравнение
            </button>
          </div>
          <div
            style={{
              maxHeight: 280,
              overflowY: 'auto',
              border: '1px solid #d7dbe5',
              borderRadius: 10,
              padding: '8px 12px',
              background: '#fff',
            }}
          >
            {versions.length === 0 ? (
              <p style={{ color: '#666', margin: 0 }}>Сохранённых версий пока нет.</p>
            ) : (
              versions.map((v, idx) => {
                // ✅ теперь используем поля нового API: v.id и v.created_at
                const isFrom = String(v.id) === String(selectedFrom || '');
                const isTo = String(v.id) === String(selectedTo || '');

                return (
                  <div
                    key={v.id} // ✅ уникальный ключ
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: idx === versions.length - 1 ? 'none' : '1px solid #eceff6',
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: '1 1 auto' }}>
                      {(() => {
                        const shortId = String(v.id).slice(0, 8);
                        const displayNo = (versions.length - idx); // 1 — самая свежая
                        const created = v.created_at ? new Date(v.created_at).toLocaleString('ru-RU') : '';

                        return (
                          <>
                            <div style={{ fontWeight: 600, color: '#1d2a44' }}>
                              Версия {displayNo}
                              <span
                                title={String(v.id)} // полный UUID по ховеру
                                style={{ marginLeft: 8, fontWeight: 400, color: '#6b7280' }}
                              >
                                ({shortId})
                              </span>
                              {isFrom && <span style={versionBadgeStyle}>От</span>}
                              {isTo && <span style={versionBadgeStyle}>До</span>}
                            </div>

                            <div style={{ fontSize: 12, color: '#556070', marginTop: 2 }}>
                              {created}
                            </div>
                          </>
                        );
                      })()}

                      {/* человекочитаемая дата из created_at */}
                      <div style={{ fontSize: 12, color: '#556070', marginTop: 2 }}>
                        {v.created_at ? new Date(v.created_at).toLocaleString('ru-RU') : ''}
                      </div>

                      {v.note && (
                        <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{v.note}</div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button
                        style={{
                          ...versionActionButtonStyle,
                          fontWeight: isFrom ? 600 : 500,
                          background: isFrom ? '#dfe8ff' : versionActionButtonStyle.background,
                        }}
                        onClick={() => setSelectedFrom(String(v.id))}
                      >
                        В «from»
                      </button>
                      <button
                        style={{
                          ...versionActionButtonStyle,
                          fontWeight: isTo ? 600 : 500,
                          background: isTo ? '#dfe8ff' : versionActionButtonStyle.background,
                        }}
                        onClick={() => setSelectedTo(String(v.id))}
                      >
                        В «to»
                      </button>
                      <button
                        style={{
                          ...versionActionButtonStyle,
                          background: '#eef2ff',     // нежно-фиолетовый фон (можешь убрать)
                          borderColor: '#c7d2fe',
                          color: '#1e3a8a',
                          fontWeight: 600,
                        }}
                        onClick={() => handleOpenVersion(v.id)}
                        title="Подменить содержимое редактора этой версией"
                      >
                        Открыть
                      </button>
                      <button
                        style={{
                          ...versionActionButtonStyle,
                          background: '#fff1f0',
                          borderColor: '#f1b5b0',
                          color: '#b4231f',
                          fontWeight: 600,
                        }}
                        onClick={() => handleDeleteVersion(v.id)} // ✅ передаём id
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

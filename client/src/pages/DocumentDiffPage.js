import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

export default function DocumentDiffPage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [diffHtml, setDiffHtml] = useState("");
  const isUUID = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || ''));

  
  // --- Sanitize diff HTML to avoid nested tables ---
  function sanitizeDiffHtml(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const root = tpl.content;

    // 1) Убираем вложенные .app-table-wrap (если такие появились)
    root.querySelectorAll(".app-table-wrap .app-table-wrap").forEach(inner => {
      const parent = inner.parentNode;
      while (inner.firstChild) parent.insertBefore(inner.firstChild, inner);
      inner.remove();
    });

    // 2) Помечаем таблицы и ячейки, внутри которых есть изменения (на уровне контейнера)
    root.querySelectorAll(".app-table-wrap").forEach(wrap => {
      let tableChanged = false;
      wrap.querySelectorAll('td, th').forEach(cell => {
        const hasInsert = cell.querySelector('ins.diff-ins');
        const hasDelete = cell.querySelector('del.diff-del');
        if (hasInsert || hasDelete) {
          tableChanged = true;
          if (hasInsert) cell.classList.add('diff-cell-insert');
          if (hasDelete) cell.classList.add('diff-cell-delete');
        }
      });
      if (tableChanged || wrap.querySelector('ins.diff-ins, del.diff-del')) {
        wrap.classList.add("diff-table-changed");
      }
    });

    // 3) Убираем случайные текстовые узлы со стилями, которые могли остаться от атрибутов таблиц
    const trashRegex = /(border-collapse\s*:|min-width\s*:|colgroup>)/i;
    root.querySelectorAll('*').forEach(node => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === Node.TEXT_NODE && trashRegex.test(child.textContent || '')) {
          child.remove();
        }
      });
    });
    
    return tpl.innerHTML;
  }



  const docId = searchParams.get("docId") || "";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  useEffect(() => {
    if (!from || !to) {
      setError("Нужно выбрать две версии для сравнения.");
      setLoading(false);
      return;
    }
    if (!docId) {
      setError("Не указан docId. Откройте сравнение из редактора/кабинета.");
      setLoading(false);
      return;
    }
    if (!isUUID(docId)) {
      setError("Неверный docId (ожидается UUID).");
      setLoading(false);
      return;
    }


    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/documents/${encodeURIComponent(docId)}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { credentials: 'include' }
        );
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.message || "Не удалось получить дифф");
        }
        const { html } = payload;
        if (!cancelled) {
          const safeHtml = sanitizeDiffHtml(html || "");
          setDiffHtml(safeHtml);

        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Не удалось получить дифф");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docId, from, to]);

  return (
    <div className="diff-page">
      <style>{`
        .diff-page {
          padding: 24px;
          background: #f4f6fb;
          min-height: 100vh;
        }
        .diff-page__controls {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .diff-page__button {
          padding: 8px 16px;
          border-radius: 6px;
          border: 1px solid #cfd8ea;
          background: white;
          cursor: pointer;
          font-size: 14px;
        }
        .diff-page__button:hover {
          background: #eef2ff;
        }
        .diff-document {
          background: white;
          padding: 24mm;
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
          color: #111827;
          font-family: 'Times New Roman', 'Georgia', serif;
          font-size: 12pt;
          line-height: 1.5;
          max-width: 840px;
          margin: 0 auto;
          box-sizing: border-box;
          overflow-x: auto;
        }
        .diff-document .diff-report {
          display: block;
          white-space: normal;
        }
        .diff-document p {
          margin: 0 0 8pt 0;
          text-align: justify;
        }
        .diff-document h1,
        .diff-document h2,
        .diff-document h3,
        .diff-document h4,
        .diff-document h5,
        .diff-document h6 {
          text-align: center;
          font-weight: 600;
          margin: 12pt 0;
        }
        .diff-document ul,
        .diff-document ol {
          margin: 0 0 12pt 28pt;
          padding: 0;
        }
        .diff-document li {
          margin-bottom: 6pt;
        }
        .diff-document table {
          width: 100%;
          border-collapse: collapse;
          margin: 12pt 0;
        }
        .diff-document th,
        .diff-document td {
          border: 1px solid #000;
          padding: 4pt 6pt;
          vertical-align: top;
        }
        .diff-document .app-table-wrap table {
          width: 100%;
          border-collapse: collapse;
        }
        .diff-document .app-table-wrap th,
        .diff-document .app-table-wrap td {
          border: 1px solid #000;
          padding: 4pt;
        }
        .diff-document .ph-chip {
          background: #eef6ff;
          border: 1px dashed #5aa7ff;
          padding: 0 4px;
          border-radius: 3px;
        }
        .diff-document ins,
        .diff-document del,
        .diff-document ins.diff-ins,
        .diff-document del.diff-del {
          background-clip: padding-box;
          padding: 0 2px;
        }
        .diff-document td.diff-cell-insert, .diff-document th.diff-cell-insert {
          background: rgba(16, 185, 129, 0.12);
        }
        .diff-document td.diff-cell-delete, .diff-document th.diff-cell-delete {
          background: rgba(239, 68, 68, 0.12);
        }
        .diff-document ins,
        .diff-document ins.diff-ins {
          background: rgba(16, 185, 129, 0.2);
          text-decoration: none;
        }
        .diff-document del,
        .diff-document del.diff-del {
          background: rgba(239, 68, 68, 0.18);
          color: #7f1d1d;
          text-decoration: line-through;
        }
        .diff-document ins.diff-ins > *,
        .diff-document del.diff-del > * {
          background-color: inherit;
        }
        .diff-document del.diff-del * {
          text-decoration: inherit;
        }
        .diff-document .diff-empty {
          color: #6b7280;
          font-style: italic;
        }
        .diff-page__status {
          padding: 16px;
          border-radius: 8px;
          background: #fff4f5;
          border: 1px solid #fecdd3;
          color: #b91c1c;
        }
        .diff-document .diff-table-changed {
          outline: 2px dashed #f59e0b;
          position: relative;
        }
        .diff-document .diff-table-changed::before {
          content: "Изменена таблица";
          position: absolute;
          top: -0.9rem;
          left: 0;
          font-size: 12px;
          background: #fff8e1;
          padding: 2px 6px;
          border: 1px solid #f59e0b;
        }

      `}</style>

      <div className="diff-page__controls">
        <Link className="diff-page__button" to="/document-editor">
          ← Вернуться в редактор
        </Link>
        <button
          className="diff-page__button"
          type="button"
          onClick={() => window.close()}
        >
          Закрыть вкладку
        </button>
        <div style={{ marginLeft: "auto", color: "#4b5563" }}>
          Документ {docId}, сравнение версий {from || "?"} → {to || "?"}
        </div>
      </div>

      {loading && <div>Загружаем diff…</div>}
      {!loading && error && (
        <div className="diff-page__status">{error}</div>
      )}
      {!loading && !error && (
        <div
          className="diff-document"
          dangerouslySetInnerHTML={{ __html: diffHtml }}
        />
      )}
    </div>
  );
}
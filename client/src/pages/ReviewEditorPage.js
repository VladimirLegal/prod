import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Extension, Mark } from '@tiptap/core';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';

const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: element => element.getAttribute('class'),
        renderHTML: attrs => (attrs.class ? { class: attrs.class } : {})
      },
      style: {
        default: null,
        parseHTML: element => element.getAttribute('style'),
        renderHTML: attrs => (attrs.style ? { style: attrs.style } : {})
      }
    };
  }
});

const InlineStyle = Mark.create({
  name: 'inlineStyle',
  inclusive: true,
  excludes: '',
  parseHTML() {
    return [
      { tag: 'span[style]' },
      { tag: 'span[class]' }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: element => element.getAttribute('class'),
        renderHTML: attrs => (attrs.class ? { class: attrs.class } : {})
      },
      style: {
        default: null,
        parseHTML: element => element.getAttribute('style'),
        renderHTML: attrs => (attrs.style ? { style: attrs.style } : {})
      }
    };
  }
});

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: element => element.getAttribute('class'),
        renderHTML: attrs => (attrs.class ? { class: attrs.class } : {})
      },
      style: {
        default: null,
        parseHTML: element => element.getAttribute('style'),
        renderHTML: attrs => (attrs.style ? { style: attrs.style } : {})
      }
    };
  }
});

const CustomTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: element => element.getAttribute('class'),
        renderHTML: attrs => (attrs.class ? { class: attrs.class } : {})
      },
      style: {
        default: null,
        parseHTML: element => element.getAttribute('style'),
        renderHTML: attrs => (attrs.style ? { style: attrs.style } : {})
      }
    };
  }
});

const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: element => element.getAttribute('class'),
        renderHTML: attrs => (attrs.class ? { class: attrs.class } : {})
      },
      style: {
        default: null,
        parseHTML: element => element.getAttribute('style'),
        renderHTML: attrs => (attrs.style ? { style: attrs.style } : {})
      }
    };
  }
});

const GlobalAttrs = Extension.create({
  name: 'globalAttrsForHints',
  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'blockquote',
          'bulletList',
          'orderedList',
          'listItem',
          'table',
          'tableRow',
          'tableCell',
          'tableHeader',
          'inlineStyle'
        ],
        attributes: {
          class: {
            default: null,
            parseHTML: el => el.getAttribute('class'),
            renderHTML: attrs => (attrs.class ? { class: attrs.class } : {})
          },
          style: {
            default: null,
            parseHTML: el => el.getAttribute('style'),
            renderHTML: attrs => (attrs.style ? { style: attrs.style } : {})
          },
          'data-hint': {
            default: null,
            parseHTML: el => el.getAttribute('data-hint'),
            renderHTML: attrs =>
              (attrs['data-hint'] ? { 'data-hint': attrs['data-hint'] } : {})
          }
        }
      }
    ];
  }
});

const roleLabels = {
  landlord: 'Наймодатель',
  tenant: 'Наниматель',
  agent: 'Агент',
  lawyer: 'Юрист',
  other: 'Контрагент'
};

export default function ReviewEditorPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [noChanges, setNoChanges] = useState(false);
  const [comment, setComment] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      InlineStyle,
      GlobalAttrs,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      BulletList,
      OrderedList,
      CustomTable.configure({ resizable: false }),
      CustomTableRow,
      CustomTableHeader,
      CustomTableCell
    ],
    editorProps: {
      attributes: {
        class: 'review-prosemirror'
      }
    },
    content: '',
    editable: false
  });

  const layoutStyles = useMemo(() => ({
    page: {
      maxWidth: 960,
      margin: '0 auto',
      padding: '32px 16px'
    },
    card: {
      background: '#ffffff',
      borderRadius: 16,
      boxShadow: '0 18px 48px rgba(15, 23, 42, 0.12)',
      border: '1px solid #e3e8f6',
      padding: '28px 32px'
    }
  }), []);

  const formatDateTime = useCallback((value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('ru-RU');
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setError('Токен не указан.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/review/${encodeURIComponent(token)}`);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.ok === false) {
          throw new Error(payload?.error || 'Ссылка недоступна или истекла');
        }
        if (!cancelled) {
          setSessionInfo(payload);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Не удалось открыть ссылку.');
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (editor && sessionInfo?.html) {
      editor.commands.setContent(sessionInfo.html);
      editor.setEditable(!completed && !error);
    }
  }, [editor, sessionInfo, completed, error]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!completed && !error);
    }
  }, [editor, completed, error]);

  const handleSubmit = useCallback(async () => {
    if (!token || !editor) return;
    setSubmitting(true);
    setSuccessMessage('');
    setError('');
    try {
      const html = editor.getHTML();
      const res = await fetch(`/api/review/${encodeURIComponent(token)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html,
          noChanges,
          counterpartyComment: comment
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Не удалось завершить согласование');
      }
      setCompleted(true);
      editor.setEditable(false);
      setSuccessMessage('Ваши правки успешно отправлены владельцу документа. Спасибо!');
    } catch (e) {
      console.error('review complete error', e);
      setError(e?.message || 'Не удалось отправить правки.');
    } finally {
      setSubmitting(false);
    }
  }, [token, editor, noChanges, comment]);

  if (loading) {
    return (
      <div style={layoutStyles.page}>
        <div style={layoutStyles.card}>Загружаем документ…</div>
      </div>
    );
  }

  if (error && !sessionInfo) {
    return (
      <div style={layoutStyles.page}>
        <div style={{ ...layoutStyles.card, color: '#b91c1c', background: '#fee2e2', borderColor: '#fecaca' }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div style={layoutStyles.page}>
      <div style={layoutStyles.card}>
        <h1 style={{ marginTop: 0, marginBottom: 12 }}>{sessionInfo?.documentTitle || 'Согласование договора'}</h1>
        <div style={{ color: '#4b5563', marginBottom: 24 }}>
          <div>
            Роль контрагента: <b>{roleLabels[sessionInfo?.counterpartyRole] || 'Контрагент'}</b>
          </div>
          {sessionInfo?.expiresAt && (
            <div>Ссылка действует до: {formatDateTime(sessionInfo.expiresAt)}</div>
          )}
          {sessionInfo?.initialMessage && (
            <div style={{
              marginTop: 12,
              padding: '12px 14px',
              borderLeft: '4px solid #6366f1',
              background: '#eef2ff',
              borderRadius: 8,
              color: '#312e81'
            }}>
              <b>Сообщение от владельца:</b>
              <div>{sessionInfo.initialMessage}</div>
            </div>
          )}
        </div>

        {error && sessionInfo && !completed && (
          <div style={{
            marginBottom: 16,
            padding: '10px 12px',
            borderRadius: 10,
            background: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #fecaca'
          }}>
            {error}
          </div>
        )}

        {successMessage && (
          <div style={{
            marginBottom: 16,
            padding: '10px 12px',
            borderRadius: 10,
            background: '#dcfce7',
            color: '#166534',
            border: '1px solid #bbf7d0'
          }}>
            {successMessage}
          </div>
        )}

        <style>{`
          .review-prosemirror {
            min-height: 520px;
            outline: none;
            font-family: 'Times New Roman', 'Georgia', serif;
            font-size: 12pt;
            line-height: 1.5;
            color: #0f172a;
          }
          .review-prosemirror p { margin: 0 0 10px; }
          .review-prosemirror h1,
          .review-prosemirror h2,
          .review-prosemirror h3,
          .review-prosemirror h4,
          .review-prosemirror h5,
          .review-prosemirror h6 {
            text-align: center;
            font-weight: 600;
            margin: 14pt 0 10pt;
          }
          .review-prosemirror table {
            width: 100%;
            border-collapse: collapse;
            margin: 12pt 0;
          }
          .review-prosemirror th,
          .review-prosemirror td {
            border: 1px solid #000;
            padding: 4pt 6pt;
            vertical-align: top;
          }
          .review-prosemirror .app-table-wrap table {
            border-collapse: collapse;
            width: 100%;
          }
          .review-prosemirror .app-table-wrap th,
          .review-prosemirror .app-table-wrap td {
            border: 1px solid #000;
          }
        `}</style>

        <div style={{ border: '1px solid #d1d5db', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #dbe0ea' }}>
            Внесите правки в текст или подтвердите, что документ подходит без изменений.
          </div>
          <div style={{ padding: '16px' }}>
            <EditorContent editor={editor} />
          </div>
        </div>

        {!completed && (
          <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={noChanges}
                onChange={e => setNoChanges(e.target.checked)}
              />
              <span>Я не вносил изменений, меня всё устраивает</span>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Комментарий для владельца (опционально)</span>
              <textarea
                rows={3}
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Укажите пояснения к внесённым правкам"
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', resize: 'vertical' }}
              />
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          {!completed ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {submitting ? 'Отправляем…' : 'Завершить и отправить'}
            </button>
          ) : (
            <button
              type="button"
              disabled
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: '#e5e7eb',
                color: '#4b5563',
                fontSize: 15,
                fontWeight: 600
              }}
            >
              Согласование завершено
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
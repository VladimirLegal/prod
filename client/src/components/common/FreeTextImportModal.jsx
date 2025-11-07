// client/src/components/common/FreeTextImportModal.jsx
import React from 'react';

export default function FreeTextImportModal({
  open,
  title = 'Вставьте текст',
  onClose,
  onApply,
}) {
  // хуки ВСЕГДА сверху
  const [value, setValue] = React.useState('');
  const textRef = React.useRef(null);

  // когда окно открылось — фокус на textarea
  React.useEffect(() => {
    if (open) {
      setTimeout(() => textRef.current?.focus(), 0);
    } else {
      setValue('');
    }
  }, [open]);

  // esc — закрыть
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') {
        // Ctrl/Cmd+Enter = применить
        onApply?.(value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, value, onApply, onClose]);

  if (!open) return null; // безопасный ранний рендер

  const apply = () => onApply?.(value);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', width: 720, maxWidth: '95%', borderRadius: 12, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{title}</h3>
        </div>

        <textarea
          ref={textRef}
          rows={12}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Вставьте сюда строку(и) с данными человека..."
          style={{
            width: '100%', resize: 'vertical', borderRadius: 8,
            border: '1px solid #d1d5db', padding: 12, outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff',
              cursor: 'pointer',
            }}
          >
            Отмена (Esc)
          </button>
          <button
            type="button"
            onClick={apply}
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid transparent',
              background: '#111827', color: '#fff', cursor: 'pointer',
            }}
            title="Ctrl/Cmd + Enter"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}

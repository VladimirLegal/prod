import React, { useState } from 'react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    setStatus('');
    try {
      const res = await fetch('/api/auth/register/magic/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          // после подтверждения отправим в кабинет
          continueUrl: '/cabinet'
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || 'send_failed');
      setStatus(`Мы отправили ссылку на ${email}. Проверьте Inbox/Спам.`);
    } catch (e) {
      setStatus('Не удалось отправить ссылку. Попробуйте позже.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-3">Регистрация</h1>
      <p className="text-gray-600 mb-6">
        Укажите e-mail — мы вышлем письмо с одноразовой ссылкой для входа.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-gray-700">E-mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value.trim())}
            className="mt-1 w-full border rounded px-3 py-2"
            placeholder="you@example.com"
          />
        </label>

        <button
          type="submit"
          disabled={sending}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {sending ? 'Отправляем…' : 'Получить ссылку'}
        </button>
      </form>

      {status && (
        <div className="mt-4 text-sm text-gray-700">{status}</div>
      )}

      <div className="mt-6 text-sm text-gray-500">
        Уже есть аккаунт? <a href="/login" className="text-blue-600 hover:underline">Войти</a>
      </div>
    </div>
  );
}

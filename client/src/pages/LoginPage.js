import React, { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [continueUrl, setContinueUrl] = useState('/user-dashboard');

  async function handleSend(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/auth/magic/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, continueUrl })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'send_failed');
      setSent(true);
    } catch (e) {
      setError(e.message || 'Не удалось отправить ссылку');
    }
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Вход по ссылке</h1>
      {sent ? (
        <div className="p-4 rounded bg-green-50 border border-green-200 text-green-800">
          Мы отправили письмо на <b>{email}</b>. Проверьте Inbox/Спам и перейдите по ссылке.
        </div>
      ) : (
        <form onSubmit={handleSend} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="email@example.com"
            required
            className="w-full border rounded px-3 py-2"
          />
          <input
            type="text"
            value={continueUrl}
            onChange={e=>setContinueUrl(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="/user-dashboard"
          />
          <button className="px-4 py-2 bg-blue-600 text-white rounded">Отправить ссылку</button>
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </form>
      )}
    </div>
  );
}

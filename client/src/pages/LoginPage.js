// client/src/pages/LoginPage.jsx
import React, { useState, useMemo } from 'react';
import { safeJson } from '../utils/http';

// В проде лучше НЕ задавать REACT_APP_API_ORIGIN — тогда уйдёт на /api того же домена через Nginx.
// В dev можешь поставить REACT_APP_API_ORIGIN=http://localhost:5000
const API_ORIGIN = process.env.REACT_APP_API_ORIGIN || '';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [loading, setLoading] = useState(false);

  // подхватываем редирект после логина из ?continue= или ?next=
  const continueUrl = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('continue') || p.get('next') || '/user-dashboard';
  }, []);

  async function handleSend(e) {
    e.preventDefault();
    setError('');
    setErrorCode('');
    setLoading(true);
    try {
      // простая валидация
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Укажите корректный email');
      }

      const res = await fetch(`${API_ORIGIN}/api/auth/magic/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // важно для куки
        body: JSON.stringify({ email, continueUrl }),
      });

      const j = await safeJson(res);
      if (!res.ok || !j.ok) {
        const err = new Error(j.message || j.error || 'send_failed');
        err.code = j.error;
        throw err;
      }
      setSent(true);
    } catch (e) {
      setErrorCode(e.code || '');
      setError(e.message || 'Не удалось отправить ссылку');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow p-6 mt-10">
      <h1 className="text-xl font-semibold mb-4">Вход по e-mail</h1>

      {sent ? (
        <div className="text-green-700">
          Письмо со ссылкой отправлено на <b>{email}</b>. Проверьте почту.
        </div>
      ) : (
        <form onSubmit={handleSend} className="space-y-4">
          <label className="block">
            <span className="text-sm">E-mail</span>
            <input
              type="email"
              className="mt-1 w-full border rounded px-3 py-2"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              required
            />
          </label>

          {error && (
            <div className="text-red-600 text-sm space-y-2">
              <div>{error}</div>
              {errorCode === 'user_not_found' && (
                <a href="/register" className="inline-flex text-blue-600 hover:underline">
                  Зарегистрироваться
                </a>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium text-white ${
              loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Отправляем…' : 'Получить ссылку'}
          </button>
        </form>
      )}
    </div>
  );
}

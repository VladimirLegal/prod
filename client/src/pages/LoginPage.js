// client/src/pages/LoginPage.jsx
import React, { useState, useMemo } from 'react';
import { safeJson } from '../utils/http';

const API_ORIGIN = process.env.REACT_APP_API_ORIGIN || '';

const AUTH_ERRORS = {
  provider_not_configured: 'Вход через выбранный сервис временно не настроен.',
  state_mismatch: 'Не удалось подтвердить безопасность входа. Попробуйте ещё раз.',
  external_identity_not_linked_existing_email: 'По этому email уже есть аккаунт. Войдите старым способом и привяжите Яндекс ID или VK ID в профиле.',
  yandex_auth_denied: 'Вход через Яндекс ID не был завершён.',
  vk_auth_denied: 'Вход через VK ID не был завершён.',
  external_auth_failed: 'Не удалось войти через внешний сервис. Попробуйте ещё раз.',
  vk_callback_missing_code: 'Вход через VK ID не был завершён.',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [vkLoading, setVkLoading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const continueUrl = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('continue') || p.get('next') || '/cabinet';
  }, []);

  const authError = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    const code = p.get('auth_error');
    return code ? AUTH_ERRORS[code] || AUTH_ERRORS.external_auth_failed : '';
  }, []);

  async function handleSend(e) {
    e.preventDefault();
    setError('');
    setErrorCode('');
    setLoading(true);
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Укажите корректный email');
      const res = await fetch(`${API_ORIGIN}/api/auth/magic/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  function handleYandexLogin() {
    const returnTo = encodeURIComponent(continueUrl || '/cabinet');
    window.location.href = `${API_ORIGIN}/api/auth/yandex/start?returnTo=${returnTo}`;
  }

  function handleVkLogin() {
    setError('');
    setErrorCode('');
    setVkLoading(true);

    const returnTo = encodeURIComponent(continueUrl || '/cabinet');
    window.location.href = `${API_ORIGIN}/api/auth/vk/start?returnTo=${returnTo}`;
  }

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow p-6 mt-10 space-y-6">
      <div>
        <h1 className="text-xl font-semibold mb-2">Войти в личный кабинет</h1>
        <p className="text-sm text-gray-600">Используйте российские сервисы авторизации для входа в legal-portal.</p>
      </div>

      {authError && <div className="rounded-md bg-red-50 text-red-700 text-sm p-3">{authError}</div>}
      {error && <div className="rounded-md bg-red-50 text-red-700 text-sm p-3">{error}</div>}

      <div className="space-y-3">
        <button type="button" onClick={handleYandexLogin} className="w-full h-11 rounded-md bg-black text-white font-medium hover:bg-gray-800">Войти через Яндекс ID</button>
        <button type="button" onClick={handleVkLogin} disabled={vkLoading} className="w-full h-11 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-blue-400">
          {vkLoading ? 'Открываем VK ID…' : 'Войти через VK ID'}
        </button>
      </div>

      <div className="border-t pt-4">
        <button type="button" onClick={() => setEmailOpen((v) => !v)} className="text-left w-full text-sm text-gray-700 hover:text-gray-900">
          <span className="font-medium">Старый способ входа по email</span>
          <span className="block text-gray-500">Для пользователей, зарегистрированных ранее.</span>
        </button>

        {emailOpen && (sent ? (
          <div className="text-green-700 mt-4">Письмо со ссылкой отправлено на <b>{email}</b>. Проверьте почту.</div>
        ) : (
          <form onSubmit={handleSend} className="space-y-4 mt-4">
            <label className="block">
              <span className="text-sm">E-mail</span>
              <input type="email" className="mt-1 w-full border rounded px-3 py-2" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </label>

            {errorCode === 'user_not_found' && (
              <div className="text-sm text-gray-600">
                Новый аккаунт создаётся через Яндекс ID или VK ID.
              </div>
            )}

            <button type="submit" disabled={loading} className={`inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium text-white ${loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {loading ? 'Отправляем…' : 'Получить ссылку'}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

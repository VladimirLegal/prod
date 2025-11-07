import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';


export default function MagicHandlerPage() {
  const [status, setStatus] = useState('Проверяем ссылку…');
  const [sp] = useSearchParams();
  const tokenQ = sp.get('token') || '';
  const emailQ = sp.get('email') || '';
  const contQ  = sp.get('continue') || '/cabinet';
  const [apiError, setApiError] = useState(null);
  const [resending, setResending] = useState(false);


  useEffect(() => {
        setStatus('Проверяем ссылку…');
        setApiError(null);

        // читаем параметры ОДИН раз
        const sp = new URLSearchParams(window.location.search);
        const token = sp.get('token') || '';
        const email = sp.get('email') || '';
        const cont  = (sp.get('continue') || '/cabinet').startsWith('/') ? (sp.get('continue') || '/cabinet') : '/cabinet';

        const go = (to) => {
            const safe = (typeof to === 'string' && to.startsWith('/')) ? to : '/cabinet';
            window.location.replace(safe);
        };

        // небольшой «дожим»: подождать пока браузер применит Set-Cookie, до 5 попыток
        const waitSessionAndGo = async () => {
            for (let i = 0; i < 5; i++) {
            try {
                const r = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
                const j = await r.json().catch(() => ({}));
                if (j?.ok && j?.user) {
                setStatus('Вход выполнен. Перенаправляем…');
                go(cont);
                return;
                }
            } catch {}
            // короткая пауза 120мс — Edge иногда пишет cookie не мгновенно
            await new Promise(res => setTimeout(res, 120));
            }
            // если так и не увидели сессию
            setApiError('verify_failed');
            setStatus('Ссылка недействительна или устарела.');
        };

        (async () => {
            // 1) пробуем подтвердить токен
            try {
            const res = await fetch('/api/auth/magic/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ token, email }),
                cache: 'no-store'
            });
            let j = null;
            try { j = await res.json(); } catch {}

            if (res.ok && j && j.ok) {
                setStatus('Готово. Перенаправляем…');
                // не ждём — просто убедимся, что кука реально видна
                return waitSessionAndGo();
            }
            } catch {
            // игнорируем — пойдём проверять сессию ниже
            }

            // 2) вне зависимости от verify — «дожмём» сессию
            await waitSessionAndGo();
        })();
    }, []);





    async function handleResend() {
        if (!emailQ) return;
        setResending(true);
        try {
        const res = await fetch('/api/auth/magic/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: emailQ, continueUrl: contQ })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j?.error || 'send_failed');
        setStatus('Мы отправили новую ссылку на ' + emailQ + '. Проверьте Inbox/Спам.');
        setApiError(null);
        } catch (e) {
        setStatus('Не удалось отправить новую ссылку. Попробуйте позже.');
        } finally {
        setResending(false);
        }
    }

    return (
        <div style={{maxWidth: 480, margin: '40px auto', padding: 16, fontFamily: 'system-ui'}}>
        <h1 style={{fontSize: 20, marginBottom: 12}}>Вход по ссылке</h1>

        <div style={{
            padding: 12,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            background: '#f9fafb',
            marginBottom: 12
        }}>
            {status}
        </div>

        {apiError && (
            <div style={{ display: 'grid', gap: 8 }}>
            {(apiError === 'expired' || apiError === 'invalid_token' || apiError === 'already_used') && (
                <>
                <div style={{ color: '#6b7280', fontSize: 14 }}>
                    {emailQ
                    ? <>Можем отправить новую ссылку на <b>{emailQ}</b>.</>
                    : <>Вернитесь на страницу входа и запросите новую ссылку.</>}
                </div>
                {emailQ && (
                    <button
                    onClick={handleResend}
                    disabled={resending}
                    style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #d1d5db',
                        background: resending ? '#e5e7eb' : 'white',
                        cursor: resending ? 'not-allowed' : 'pointer',
                        width: 'fit-content'
                    }}
                    >
                    {resending ? 'Отправляем…' : 'Отправить новую ссылку'}
                    </button>
                )}
                </>
            )}
            </div>
        )}
        </div>
    );


}

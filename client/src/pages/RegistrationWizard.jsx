import React, { useEffect, useMemo, useRef, useState } from 'react';

function DocViewer({ title, version, contentUrl, onReadyToContinue }) {
  const [html, setHtml] = useState('<p style="color:#6b7280">Загружаем документ…</p>');
  const boxRef = useRef(null);


  // грузим HTML и рендерим прямо в контейнер (без iframe)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(contentUrl, { credentials: 'include', cache: 'no-store' });
        const text = await resp.text();
        if (!cancelled) setHtml(text || '<p>Документ пуст</p>');
        // подождём, пока браузер нарисует контент, и проверим скролл
        setTimeout(() => {
            const el = boxRef.current;
            if (el && el.scrollHeight <= el.clientHeight + 2) {
            // текста мало — скроллить нечего → считаем «прочитано»
            setScrolled(true);
            }
        }, 0);
      } catch {
        if (!cancelled) setHtml('<p style="color:#b91c1c">Не удалось загрузить документ.</p>');
      }
    })();
    return () => { cancelled = true; };
  }, [contentUrl]);


  // простая проверка: доскроллил до низа + таймер ≥ 10с
  const [scrolled, setScrolled] = useState(false);
  const [timerOk, setTimerOk] = useState(false);
  

  useEffect(() => {
    const t = setTimeout(() => setTimerOk(true), 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function onScroll() {
      const el = boxRef.current;
      if (!el) return;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      if (atBottom) setScrolled(true);
    }
    const el = boxRef.current;
    if (el) el.addEventListener('scroll', onScroll);
    return () => el && el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (scrolled && timerOk) onReadyToContinue?.();
  }, [scrolled, timerOk, onReadyToContinue]);

  return (
        <div>
            <h2 className="text-xl font-semibold mb-2">
            {title} <span className="text-gray-400">({version})</span>
            </h2>
            <div
                ref={boxRef}
                className="border rounded p-3 h-64 overflow-y-auto bg-white prose max-w-none mb-3"
                dangerouslySetInnerHTML={{ __html: html }}
            />
            <p className="text-sm text-gray-500 mt-2">
            Пролистайте документ до конца и подождите 10 секунд, чтобы продолжить.
            </p>
        </div>
    );

}

export default function RegistrationWizard() {
    // Если пришли из кабинета для повторной подписи: /register?mode=reconsent
    const urlParams = new URLSearchParams(window.location.search);
    const isReconsent = urlParams.get('mode') === 'reconsent';

    // Если юзер уже авторизован и пришёл на ресайн — шаг 4 нам не нужен
    const [me, setMe] = useState(null);
    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch('/api/me', { credentials:'include', cache:'no-store' });
          const j = await r.json().catch(() => ({}));
          if (!cancelled) setMe(j?.user || null);
        } catch {
          if (!cancelled) setMe(null);
        }
      })();
      return () => { cancelled = true; };
    }, []);

  const [step, setStep] = useState(1);
  const [allowNext, setAllowNext] = useState(false);

  // форма
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('private'); // private | realtor | lawyer
  const [birthDate, setBirthDate] = useState('');

  // согласие ПДн
  const PD_VERSION = 'v2025-10-01';
  const [consentId, setConsentId] = useState(null);
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => { setAllowNext(false); }, [step]);

  function next() { if (allowNext) setStep(s => s + 1); }
  function prev() { setStep(s => Math.max(1, s - 1)); }

  
  async function handleRegister(e) {
    e.preventDefault();
    if (!email || !fullName || !phone || !birthDate || !role) return;
    // Проверка возраста ≥ 14 лет
    const today = new Date();
    const bd = new Date(birthDate);
    if (isNaN(bd.getTime())) {
        setStatus('Укажите корректную дату рождения');
        return;
    }
    const age =
        today.getFullYear() - bd.getFullYear() -
        ( (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) ? 1 : 0 );

    if (age < 14) {
        setStatus('Регистрация доступна только пользователям от 14 лет.');
        return;
    }
    setSending(true);
    setStatus('');
    try {
      // Если на шаге 3 пользователь согласился, а consentId ещё нет — подпишем сейчас (теперь у нас есть email)
      let consentIdNow = consentId;
      if (agreeChecked && !consentId) {
        try {
          const pres = await fetch('/api/consents/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ docType: 'pdn', docVersion: PD_VERSION, email })
          });
          const pj = await pres.json().catch(() => ({}));
          if (pres.ok && pj.ok && pj.consentId) {
            setConsentId(pj.consentId);
          }
       } catch {
         // не критично для UX на этом шаге: продолжим; сервер потом привяжет все висящие по email после verify
       }
     }
      // 1) сохраним черновик профиля на бэке вместе с запросом magic-link
      const res = await fetch('/api/auth/register/magic/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          continueUrl: '/cabinet',
          full_name: fullName,
          phone,
          role,
          birth_date: birthDate
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || 'send_failed');

      // 2) на всякий случай — привяжем конкретное согласие по его id
      if (consentIdNow) {
        try {
          await fetch('/api/consents/attach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ consentId: consentIdNow, email })
          });
        } catch {}
      }

      setStatus(`Мы отправили ссылку на ${email}. Проверьте Inbox/Спам.`);
    } catch (e) {
      setStatus('Не удалось отправить ссылку. Попробуйте позже.');
    } finally {
      setSending(false);
    }
  }
  // Подписать ПДн для уже авторизованного пользователя (без шага 4)
  async function handleSignAuth() {
    setSending(true);
    setStatus('');
    try {
      const res = await fetch('/api/consents/sign-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ docVersion: PD_VERSION })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || 'sign_failed');

      // Готово — сразу в кабинет
      window.location.href = '/cabinet';
    } catch (e) {
      console.error('sign-auth error:', e);
      setStatus('Не удалось подписать. Попробуйте ещё раз.');
    } finally {
      setSending(false);
    }
  }


  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Регистрация</h1>
      <div className="text-sm text-gray-500">Шаг {step} из 4</div>

      {step === 1 && (
        <>
          <DocViewer
            title="Политика конфиденциальности"
            version="v2025-10-01"
            contentUrl="/api/agreements/html?doc=privacy&v=v2025-10-01"  // используй ваш роут показа политики
            onReadyToContinue={() => setAllowNext(true)}
          />
          <div className="flex justify-between mt-4">
            <span />
            <button
              className={`px-4 py-2 rounded ${allowNext ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
              disabled={!allowNext}
              onClick={next}
            >
              Далее
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <DocViewer
            title="Пользовательское соглашение"
            version="v2025-10-01"
            contentUrl="/api/agreements/html?doc=terms&v=v2025-10-01"
            onReadyToContinue={() => setAllowNext(true)}
          />
          <div className="flex justify-between mt-4">
            <button className="px-4 py-2 rounded border" onClick={prev}>Назад</button>
            <button
              className={`px-4 py-2 rounded ${allowNext ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
              disabled={!allowNext}
              onClick={next}
            >
              Далее
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <DocViewer
            title="Согласие на обработку персональных данных"
            version={PD_VERSION}
            contentUrl={`/api/agreements/html?doc=pdn&v=${encodeURIComponent(PD_VERSION)}`}
            onReadyToContinue={undefined}
          />

          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={agreeChecked}
              onChange={e => setAgreeChecked(e.target.checked)}
            />
            <span>Я ознакомился и даю согласие на обработку персональных данных</span>
          </label>

          <div className="flex justify-between">
            <button className="px-4 py-2 rounded border" onClick={prev}>Назад</button>

            {(isReconsent || me) ? (
              <button
                className={`px-4 py-2 rounded ${agreeChecked ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
                disabled={!agreeChecked || sending}
                onClick={handleSignAuth}
              >
                {sending ? 'Подписываем…' : 'Подписать и продолжить'}
              </button>
            ) : (
              <button
                className={`px-4 py-2 rounded ${agreeChecked ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
                disabled={!agreeChecked}
                onClick={() => setStep(4)}
              >
                Далее
              </button>
            )}
          </div>

          {status && <div className="text-sm text-gray-600 mt-3">{status}</div>}
        </>
      )}

      {step === 4 && (
        <>
          <form onSubmit={handleRegister} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm">ФИО</span>
                <input className="mt-1 w-full border rounded px-3 py-2" required
                       value={fullName} onChange={e => setFullName(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm">Телефон</span>
                <input className="mt-1 w-full border rounded px-3 py-2" required
                       value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7..." />
              </label>
              <label className="block">
                <span className="text-sm">Роль</span>
                <select className="mt-1 w-full border rounded px-3 py-2" required
                        value={role} onChange={e => setRole(e.target.value)}>
                  <option value="private">Частное лицо</option>
                  <option value="realtor">Риэлтор</option>
                  <option value="lawyer">Юрист</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm">Дата рождения</span>
                <input type="date" className="mt-1 w-full border rounded px-3 py-2" required
                       value={birthDate} onChange={e => setBirthDate(e.target.value)} />
              </label>
            </div>

            <label className="block">
              <span className="text-sm">E-mail</span>
              <input type="email" className="mt-1 w-full border rounded px-3 py-2" required
                     value={email} onChange={e => setEmail(e.target.value.trim())}
                     placeholder="you@example.com" />
            </label>

            <div className="flex justify-between pt-2">
              <button className="px-4 py-2 rounded border" type="button" onClick={prev}>Назад</button>
              <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
                      disabled={sending} type="submit">
                {sending ? 'Отправляем…' : 'Получить ссылку для входа'}
              </button>
            </div>
          </form>

          {status && <div className="text-sm text-gray-700 mt-3">{status}</div>}
        </>
      )}
    </div>
  );
}

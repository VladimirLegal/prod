import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBuilding, 
  faDoorOpen, 
  faHome, 
  faTree, 
  faHotel, 
  faStore,
  faWarehouse
} from '@fortawesome/free-solid-svg-icons';

const PropertyTypePage = () => {
  const navigate = useNavigate();
  const { transactionType } = useParams();
  const [isAuthed, setIsAuthed] = useState(null);
  const [showConsent, setShowConsent] = useState(false);
  const [agree, setAgree] = useState(false);
  const AGREEMENT_VERSION = 'v1.0_2025-10-09';
  const AGREEMENT_KEY = `agreement_viewed_${AGREEMENT_VERSION}`;

  // Чекбокс активен только если страницу соглашения уже открывали (в этой или другой вкладке)
  const [viewedAgreement, setViewedAgreement] = useState(
    !!localStorage.getItem(AGREEMENT_KEY)
  );

  // Проверяем авторизацию (по /api/me)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setIsAuthed(!!data?.user?.id);
      } catch {
        if (!cancelled) setIsAuthed(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let bc;
    try {
      bc = new BroadcastChannel('agreement-consent');
      bc.onmessage = (e) => {
        if (e?.data?.type === 'viewed' && e?.data?.version === AGREEMENT_VERSION) {
          setViewedAgreement(true);
        }
      };
    } catch (_) {}

    return () => {
      try { bc && bc.close(); } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (!showConsent) return;
    const id = setInterval(() => {
      if (localStorage.getItem(AGREEMENT_KEY)) {
        setViewedAgreement(true);
        clearInterval(id);
      }
    }, 600);
    return () => clearInterval(id);
  }, [showConsent]);

  
  const propertyTypes = [
    { id: 'apartment', name: 'Квартиру', icon: faBuilding },
    { id: 'room', name: 'Комнату', icon: faDoorOpen },
    { id: 'house', name: 'Жилой дом с участком', icon: faHome },
    { id: 'garden-house', name: 'Садовый дом с участком', icon: faTree },
    { id: 'apartments', name: 'Апартаменты', icon: faHotel },
    { id: 'commercial-space', name: 'Коммерческое помещение', icon: faStore },
    { id: 'commercial-building', name: 'Здание коммерческого назначения с участком', icon: faWarehouse }
  ];

  const handleSelect = (propertyId) => {
    // Для аренды квартиры - переход к форме
    if (transactionType === 'rent' && propertyId === 'apartment') {
      if (isAuthed) {
        // Авторизованным ПДн-окно не показываем
        navigate('/rent/apartment');
      } else {
        // Гость: показываем ПДн
        setViewedAgreement(!!localStorage.getItem(AGREEMENT_KEY));
        setShowConsent(true);
      }
    } else {
      alert('Этот функционал находится в разработке. Спасибо за понимание!');
    }
  };


  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6 flex justify-start">
        <button
          onClick={() => navigate(isAuthed ? '/cabinet' : '/')}
          className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-2"
        >
          ← {isAuthed ? 'В личный кабинет' : 'На главную'}
        </button>
      </div>

      <h1 className="text-2xl md:text-3xl font-bold mb-8 text-center">
        {transactionType === 'rent' ? 'Аренда' : 'Покупка/продажа'}
      </h1>
      
      <p className="text-lg text-gray-700 mb-8 text-center">
        Выберите тип недвижимости:
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {propertyTypes.map((property) => (
          <button
            key={property.id}
            onClick={() => handleSelect(property.id)}
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow flex items-start"
          >
            <FontAwesomeIcon 
              icon={property.icon} 
              className="text-blue-600 text-2xl mt-1 mr-4" 
            />
            <div className="text-left">
              <h3 className="text-lg font-semibold">{property.name}</h3>
              {transactionType === 'rent' && property.id === 'apartment' && (
                <p className="text-sm text-green-600 mt-1">Доступно для оформления</p>
              )}
            </div>
          </button>
        ))}
      </div>
      {showConsent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-semibold mb-2">Согласие на обработку персональных данных</h2>
            <p className="text-sm text-gray-600 mb-4">
              Чтобы продолжить оформление договора, необходимо принять Соглашение об обработке персональных данных.
            </p>

            <a
              href="/agreement"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              Открыть полное соглашение
            </a>

            <div className="mt-4 flex items-center gap-2">
              <input
                id="agree"
                type="checkbox"
                className="h-4 w-4"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                disabled={!viewedAgreement}
              />
              {!viewedAgreement && (
                <div className="text-xs text-gray-500 mt-1">
                  Сначала откройте текст соглашения (кнопка выше). После возврата чекбокс станет активным.
                </div>
              )}
              <label htmlFor="agree" className="text-sm text-gray-800">
                Я ознакомился(ась) и согласен(на) с условиями обработки персональных данных
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                onClick={() => { setShowConsent(false); setAgree(false); }}
              >
                Отмена
              </button>

              <button
                className={`px-4 py-2 rounded-lg ${agree ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                disabled={!agree}
                onClick={async () => {
                  try {
                    const consentText = 'Редакция v1.0 от 09.10.2025. (вставить фактический текст)';
                    const agreementVersion = 'v1.0_2025-10-09';
                    const res = await fetch('/api/consents', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        role: 'guest',
                        agreementVersion,
                        consentText
                      })
                    });
                    const payload = await res.json();
                    if (!res.ok) throw new Error(payload?.error || 'failed_to_save_consent');

                    localStorage.setItem('consent_id', payload.id);
                    setShowConsent(false);
                    setAgree(false);
                    navigate('/rent/apartment');
                  } catch (e) {
                    alert('Не удалось зафиксировать согласие. Попробуйте позже.');
                    console.error(e);
                  }
                }}
              >
                Продолжить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyTypePage;
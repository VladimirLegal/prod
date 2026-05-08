import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faHouse, faFileContract, faHandshake } from '@fortawesome/free-solid-svg-icons';

// Используем серверный origin для страниц контента в DEV
const PAGES_BASE =
  process.env.REACT_APP_SERVER_ORIGIN
  || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '');

const AGREEMENT_VERSION = 'v2026-04-29';

const getAgreementUrl = (doc) =>
  `${PAGES_BASE}/api/agreements/html?doc=${doc}&v=${encodeURIComponent(
    AGREEMENT_VERSION
  )}`;


const HomePage = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  
  return (
    <div className="min-h-screen bg-gray-50">
      

      {/* Основной контент */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
          Юридические документы для сделок с недвижимостью
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          {/* Кнопка: Сдать/снять */}
          <Link
            to="/property-type/rent"
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faHouse} className="text-blue-600 text-2xl" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Сдать/снять</h2>
            <p className="text-gray-600">Договоры аренды жилой и коммерческой недвижимости</p>
          </Link>
     
          {/* Кнопка: Купить/продать */}
          <Link 
            to="/property-type/sale" 
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faHandshake} className="text-green-600 text-2xl" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Купить/продать</h2>
            <p className="text-gray-600">Договоры купли-продажи недвижимости</p>
          </Link>
          
          {/* Кнопка: Прочие документы */}
          <div 
            className="bg-white p-8 rounded-xl shadow-md flex flex-col items-center opacity-75 cursor-not-allowed"
          >
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faFileContract} className="text-gray-500 text-2xl" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Прочие документы</h2>
            <p className="text-gray-600">Доверенности, соглашения и другие документы</p>
          </div>
        </div>
      </div>
      {/* ===== Footer: статические страницы ===== */}
      <div style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: '1px solid #eee',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        fontSize: 14,
        color: '#666'
      }}>
        <a
          href={`${PAGES_BASE}/pages/about-portal`}
          className="hover:text-blue-600"
        >
          О портале
        </a>

        <span>·</span>

        <a
          href={getAgreementUrl('privacy')}
          target="_blank"
          rel="noreferrer"
          className="hover:text-blue-600"
        >
          Политика обработки персональных данных
        </a>

        <span>·</span>

        <a
          href={getAgreementUrl('pdn')}
          target="_blank"
          rel="noreferrer"
          className="hover:text-blue-600"
        >
          Согласие на обработку персональных данных
        </a>

        <span>·</span>

        <a
          href={getAgreementUrl('terms')}
          target="_blank"
          rel="noreferrer"
          className="hover:text-blue-600"
        >
          Правила использования сайта
        </a>

        <span>·</span>

        <a
          href={`${PAGES_BASE}/pages/about-unique`}
          className="hover:text-blue-600"
        >
          <b>Почему мы</b>
        </a>
      </div>
    </div>
  );
};

export default HomePage;
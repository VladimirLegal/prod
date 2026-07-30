import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faBuilding,
  faFileContract,
  faHandshake,
  faHouse,
  faIdCard,
} from '@fortawesome/free-solid-svg-icons';

// Используем серверный origin для страниц контента в DEV
const PAGES_BASE =
  process.env.REACT_APP_SERVER_ORIGIN
  || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '');

const AGREEMENT_VERSION = 'v2026-04-29';

const getAgreementUrl = (doc) =>
  `${PAGES_BASE}/api/agreements/html?doc=${doc}&v=${encodeURIComponent(
    AGREEMENT_VERSION
  )}`;

const processSteps = [
  {
    number: 1,
    title: 'Данные из Госуслуг',
    description: 'Паспортные данные',
    icon: faIdCard,
  },
  {
    number: 2,
    title: 'Выписка ЕГРН',
    description: 'Данные об объекте',
    icon: faBuilding,
  },
  {
    number: 3,
    title: 'Документы готовы',
    description: 'PDF / Word / согласование',
    icon: faFileContract,
  },
];

const HomePage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Первый экран */}
      <section className="border-b border-blue-100 bg-gradient-to-br from-white via-blue-50 to-blue-100">
        <div className="max-w-6xl mx-auto px-4 py-10 md:py-16">
          <div className="max-w-4xl">
            <h1 className="text-3xl md:text-5xl font-bold leading-tight text-gray-900">
              Конструктор юридических документов для недвижимости —
              <span className="text-blue-600">
                {' '}по данным ЕГРН и Госуслуг
              </span>
            </h1>

            <p className="mt-6 max-w-3xl text-base md:text-lg leading-7 text-gray-600">
              Загрузите выписку ЕГРН или заполните данные вручную. Legal Portal
              подготовит документ, позволит проверить и отредактировать
              результат, скачать его в PDF или Word либо отправить ссылку
              на согласование.
            </p>
          </div>

          {/* Схема работы */}
          <div className="mt-10 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-4 md:gap-3">
            {processSteps.map((step, index) => (
              <React.Fragment key={step.number}>
                <div className="relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="absolute -top-3 left-4 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                    {step.number}
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <FontAwesomeIcon icon={step.icon} className="text-2xl" />
                    </div>

                    <div>
                      <h2 className="font-semibold text-gray-900">
                        {step.title}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>

                {index < processSteps.length - 1 && (
                  <div className="hidden md:flex items-center justify-center text-gray-400">
                    <FontAwesomeIcon icon={faArrowRight} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-7 text-center">
            <h2 className="text-lg font-semibold text-gray-900">
              Как это работает?
            </h2>

            <p className="mt-2 text-sm md:text-base text-gray-600">
              Посмотрите, как Legal Portal использует данные из Госуслуг и ЕГРН
              для создания документа.
            </p>

            <Link
              to="/articles"
              className="mt-4 inline-flex items-center gap-2 font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              Посмотреть пример работы
              <FontAwesomeIcon icon={faArrowRight} />
            </Link>
          </div>
        </div>
      </section>

      {/* Плиточная навигация */}
      <main
        id="document-selection"
        className="max-w-5xl mx-auto px-4 py-12 md:py-16 text-center"
      >
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
          Выберите, что вы хотите сделать
        </h2>

        <p className="mt-3 text-gray-600">
          Мы подберём нужный документ и подскажем, какие данные потребуются.
          Юридические термины знать не обязательно.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
          {/* Плитка: Сдать/снять */}
          <Link
            to="/property-type/rent"
            className="group bg-white p-8 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
              <FontAwesomeIcon
                icon={faHouse}
                className="text-blue-600 text-2xl"
              />
            </div>

            <h3 className="text-xl font-semibold mb-2 text-gray-900">
              Сдать / снять
            </h3>

            <p className="text-gray-600">
              Документы для передачи недвижимости во временное пользование
            </p>

            <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-blue-600">
              Перейти
              <FontAwesomeIcon
                icon={faArrowRight}
                className="transition-transform group-hover:translate-x-1"
              />
            </span>
          </Link>

          {/* Плитка: Купить/продать */}
          <Link
            to="/property-type/sale"
            className="group bg-white p-8 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-xl bg-green-100 flex items-center justify-center mb-4">
              <FontAwesomeIcon
                icon={faHandshake}
                className="text-green-600 text-2xl"
              />
            </div>

            <h3 className="text-xl font-semibold mb-2 text-gray-900">
              Купить / продать
            </h3>

            <p className="text-gray-600">
              Документы и сценарии для сделок с недвижимостью
            </p>

            <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-blue-600">
              Перейти
              <FontAwesomeIcon
                icon={faArrowRight}
                className="transition-transform group-hover:translate-x-1"
              />
            </span>
          </Link>

          {/* Плитка: Прочие документы */}
          <Link
            to="/other-documents"
            className="group bg-white p-8 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-xl bg-purple-100 flex items-center justify-center mb-4">
              <FontAwesomeIcon
                icon={faFileContract}
                className="text-purple-600 text-2xl"
              />
            </div>

            <h3 className="text-xl font-semibold mb-2 text-gray-900">
              Прочие документы
            </h3>

            <p className="text-gray-600">
              Доли, материнский капитал, уведомления и другие документы
            </p>

            <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-blue-600">
              Перейти
              <FontAwesomeIcon
                icon={faArrowRight}
                className="transition-transform group-hover:translate-x-1"
              />
            </span>
          </Link>
        </div>
      </main>

      {/* Нижние ссылки сохраняем */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-gray-600">
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
              className="font-semibold hover:text-blue-600"
            >
              Почему мы
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
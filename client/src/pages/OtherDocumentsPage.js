import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faFileContract } from '@fortawesome/free-solid-svg-icons';

const OtherDocumentsPage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link
          to="/"
          className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-8"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
          На главную
        </Link>

        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Прочие документы
          </h1>
          <p className="text-lg text-gray-600">
            Выберите документ, который хотите подготовить.
          </p>
        </div>

        <div className="space-y-6">
          <Link
            to="/other-documents/maternity-capital-shares"
            className="block bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-8"
          >
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                <FontAwesomeIcon icon={faFileContract} className="text-purple-600 text-2xl" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                  Соглашение о выделении долей по материнскому капиталу
                </h2>
                <p className="text-gray-600 mb-6">
                  Документ для оформления долей супругам и детям при использовании средств материнского капитала.
                </p>
                <span className="inline-flex items-center justify-center px-5 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
                  Создать документ
                </span>
              </div>
            </div>
            </Link>

          <Link
            to="/other-documents/share-sale-notice"
            className="block bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-8"
          >
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <FontAwesomeIcon icon={faFileContract} className="text-blue-600 text-2xl" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                  Уведомление о продаже доли
                </h2>
                <p className="text-gray-600 mb-6">
                  Подготовка уведомлений сособственникам о продаже доли, описи вложения ф. 107, уведомления о вручении и инструкции по отправке.
                </p>
                <span className="inline-flex items-center justify-center px-5 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
                  Создать документ
                </span>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default OtherDocumentsPage;
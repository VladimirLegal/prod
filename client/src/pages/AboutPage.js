import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faLightbulb, faShieldAlt, faHandshake } from '@fortawesome/free-solid-svg-icons';

const AboutPage = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-center">О нашем сервисе</h1>
      
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
        <p className="text-lg mb-6 text-gray-700">
          LegalPortal — это современная платформа для создания юридических документов 
          для сделок с недвижимостью. Наша миссия — сделать процесс оформления договоров 
          простым, быстрым и доступным для каждого.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex items-start">
            <div className="bg-blue-100 p-3 rounded-full mr-4">
              <FontAwesomeIcon icon={faLightbulb} className="text-blue-600 text-xl" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Как это работает</h3>
              <p className="text-gray-600">
                Просто заполните онлайн-форму с необходимыми данными, и наш сервис 
                автоматически сгенерирует готовый к использованию документ в формате PDF. 
                Вам не нужно знать юридические тонкости — мы обо всем позаботимся.
              </p>
            </div>
          </div>
          
          <div className="flex items-start">
            <div className="bg-green-100 p-3 rounded-full mr-4">
              <FontAwesomeIcon icon={faShieldAlt} className="text-green-600 text-xl" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Надежность</h3>
              <p className="text-gray-600">
                Все документы составляются в соответствии с актуальным законодательством РФ. 
                Наша команда юристов постоянно обновляет шаблоны документов, чтобы 
                обеспечить их юридическую корректность.
              </p>
            </div>
          </div>
          
          <div className="flex items-start">
            <div className="bg-purple-100 p-3 rounded-full mr-4">
              <FontAwesomeIcon icon={faHandshake} className="text-purple-600 text-xl" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Для кого это</h3>
              <p className="text-gray-600">
                Наш сервис идеально подходит для собственников недвижимости, арендаторов, 
                риелторов и агентств недвижимости. Сэкономьте время и деньги на составлении 
                юридических документов.
              </p>
            </div>
          </div>
          
          <div className="flex items-start">
            <div className="bg-orange-100 p-3 rounded-full mr-4">
              <FontAwesomeIcon icon={faUsers} className="text-orange-600 text-xl" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Наша команда</h3>
              <p className="text-gray-600">
                Мы объединяем опытных юристов в сфере недвижимости и талантливых 
                разработчиков. Наша цель — создать лучший сервис для работы с недвижимостью 
                в России.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
        <h2 className="text-2xl font-bold mb-4 text-center">Наши преимущества</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-lg shadow text-center">
            <div className="text-5xl font-bold text-blue-600 mb-2">100+</div>
            <p className="text-gray-700">Довольных клиентов ежедневно</p>
          </div>
          <div className="bg-white p-5 rounded-lg shadow text-center">
            <div className="text-5xl font-bold text-blue-600 mb-2">24/7</div>
            <p className="text-gray-700">Доступ к сервису в любое время</p>
          </div>
          <div className="bg-white p-5 rounded-lg shadow text-center">
            <div className="text-5xl font-bold text-blue-600 mb-2">99%</div>
            <p className="text-gray-700">Успешных сделок с нашими документами</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
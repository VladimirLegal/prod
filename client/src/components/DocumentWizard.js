import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const DocumentWizard = () => {
  const [step, setStep] = useState(1);
  const [documentType, setDocumentType] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleGenerate = async () => {
  setIsLoading(true);
  
  try {
    const response = await axios.post(
      'http://localhost:5000/api/documents/generate', 
      {
        documentType,
        propertyType,
        ownerName: ownerName || "Иванов Иван Иванович"
      }
    );

    // Проверяем успешность ответа
    if (response.data.success) {
      // Создаем скрытую ссылку для скачивания
      const link = document.createElement('a');
      link.href = `http://localhost:5000${response.data.downloadUrl}`;
      link.setAttribute('download', `${documentType}_${propertyType}.pdf`);
      link.setAttribute('target', '_blank');
      document.body.appendChild(link);
      link.click();
      
      // Удаляем ссылку после скачивания
      setTimeout(() => {
        document.body.removeChild(link);
        navigate('/', { state: { successMessage: 'Документ успешно сгенерирован!' } });
      }, 1000);
    } else {
      // Добавляем обработку серверных ошибок
      const errorMessage = response.data.error || response.data.details || 'Неизвестная ошибка сервера';
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error('Полная ошибка:', error.response || error);
    alert(`Произошла ошибка: ${error.message}`);
  } finally {
    setIsLoading(false);
  }
};

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg my-8">
      <h2 className="text-2xl font-bold mb-4">Мастер создания документов</h2>
      <div className="mb-6">
        <div className="w-full bg-gray-200 h-3 rounded-full">
          <div 
            className={`h-full bg-blue-600 rounded-full ${step === 1 ? 'w-1/3' : step === 2 ? 'w-2/3' : 'w-full'}`}
          ></div>
        </div>
      </div>

      {step === 1 && (
        <div>
          <p>Шаг 1: Выбор типа документа</p>
          <button 
            onClick={() => setStep(2)}
            className="mt-4 bg-blue-600 text-white py-2 px-4 rounded"
          >
            Далее
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <p>Шаг 2: Выбор типа недвижимости</p>
          <button 
            onClick={() => setStep(3)}
            className="mt-4 bg-blue-600 text-white py-2 px-4 rounded"
          >
            Далее
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <p>Шаг 3: Ввод данных</p>
          <button className="mt-4 bg-green-600 text-white py-2 px-4 rounded">
            Сгенерировать документ
          </button>
        </div>
      )}
    </div>
  );
};

export default DocumentWizard;
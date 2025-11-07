// client/src/services/templateService.js
import { 
  formatLandlordData, 
  formatTenantData 
} from '../utils/documentFormatters';

export const compileTemplate = (template, formData) => {
  return new Promise((resolve) => {
    // Форматируем специальные поля
    const roomsForm = formData.terms?.rooms > 1 ? 'комнаты' : 'комната';
    
    // Создаем карту замен
    const replacements = {
      agreementPlace: formData.terms?.agreementPlace || '',
      agreementDate: formData.terms?.agreementDate || '',
      address: formData.terms?.address || '',
      cadastralNumber: formData.terms?.cadastralNumber || '',
      floor: formData.terms?.floor || '',
      rooms: formData.terms?.rooms || '',
      roomsForm,
      area: formData.terms?.area || '',
    };
    
    // Обрабатываем шаблон
    const compiled = template.map(clause => {
      let content = clause.content;
      
      // Замена простых переменных
      Object.entries(replacements).forEach(([key, value]) => {
        content = content.replace(new RegExp(`{${key}}`, 'g'), value);
      });
      
      // Обработка сложных структур (арендодатели)
      if (content.includes('{landlords}')) {
        const landlordsContent = formData.landlords.map((landlord, index) => 
          formatLandlordData(landlord, index, formData.landlords.length)
        ).join('\n\n');
        content = content.replace('{landlords}', landlordsContent);
      }
      
      // Обработка арендаторов
      if (content.includes('{tenants}')) {
        const tenantsContent = formData.tenants.map((tenant, index) => 
          formatTenantData(tenant, index, formData.tenants.length)
        ).join('\n\n');
        content = content.replace('{tenants}', tenantsContent);
      }
      
      return content;
    }).join('\n\n');
    
    resolve(compiled);
  });
};
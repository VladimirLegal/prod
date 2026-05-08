const { request } = require('../providers/apiCloudClient');

async function rosreestrAddressLookup(input = {}) {
  const address = String(input.address || '').trim();

  if (!address) {
    return {
      status: 'error',
      provider: 'apicloud',
      error: 'address_required',
      items: [],
      raw: null,
    };
  }

  const response = await request('rosreestr.php', {
    type: 'cadastr',
    adress: address,
  });

  const result = {
    status: 'empty',
    provider: 'apicloud',
    items: [],
    raw: response || null,
    message: '',
  };

  if (!response || typeof response !== 'object') {
    return {
      ...result,
      status: 'error',
      error: 'invalid_response',
      message: 'Не удалось получить корректный ответ от API-cloud.',
    };
  }

  if (response.error) {
    return {
      ...result,
      status: 'error',
      error: response.error,
      message: response.message || 'Ошибка API-cloud при поиске кадастрового номера.',
    };
  }

  if (typeof response.status !== 'number' || response.status !== 200) {
    return {
      ...result,
      status: 'error',
      error: `status_${response.status || 'unknown'}`,
      message: response.message || 'API-cloud вернул неожиданный статус ответа.',
    };
  }

  const records = Array.isArray(response.result) ? response.result : [];

  if (!records.length) {
    return {
      ...result,
      status: 'empty',
      message: response.message || 'По указанному адресу ничего не найдено.',
      items: [],
    };
  }

  return {
    ...result,
    status: 'ok',
    message: response.message || '',
    items: records.map((item) => ({
      cadastralNumber: item?.cadnum || null,
      address: item?.adress || null,
      actual: typeof item?.actual === 'boolean' ? item.actual : null,
      rawRecord: item,
    })),
  };
}

module.exports = { rosreestrAddressLookup };
const { request } = require('../providers/apiCloudClient');

async function rosreestrObjectLookup(input = {}) {
  const cadastralNumber = String(
    input.cadastralNumber || input.cadastr || ''
  ).trim();

  if (!cadastralNumber) {
    return {
      status: 'error',
      provider: 'apicloud',
      error: 'cadastral_number_required',
      message: 'Не указан кадастровый номер.',
      item: null,
      raw: null,
    };
  }

  const response = await request('rosreestr.php', {
    type: 'object',
    cadastr: cadastralNumber,
  });

  const result = {
    status: 'empty',
    provider: 'apicloud',
    error: null,
    message: '',
    item: null,
    raw: response || null,
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
      message: response.message || 'Ошибка API-cloud при запросе сведений по объекту.',
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

  if (response.found === false || !response.object) {
    return {
      ...result,
      status: 'empty',
      message: response.message || 'Информация по объекту не найдена.',
    };
  }

  const object = response.object || {};
  const address = object.address || {};

  return {
    ...result,
    status: 'ok',
    item: {
      cadastralNumber: object.cadNumber || cadastralNumber,
      cadastralQuarter: object.cadQuarter || null,
      readableAddress: address.readableAddress || null,

      status: object.status || null,
      objectType: object.ObjectType || null,
      purpose: object.purpose || null,

      area: object.area || null,
      level: object.level || null,
      undergroundFloor: object.undergroundFloor || null,

      cadCost: object.cadCost || null,
      cadCostDate: object.cadCostDate || null,
      infoUpdate: object.infoUpdate || null,

      oksWallMaterial: object.oksWallMaterial || null,
      oksCommisioningYear: object.oksCommisioningYear || null,
      oksYearBuild: object.oksYearBuild || null,

      address: {
        region: address.region || null,
        district: address.district || null,
        city: address.city || null,
        cityType: address.cityType || null,
        street: address.street || null,
        streetType: address.streetType || null,
        house: address.house || null,
        houseType: address.houseType || null,
        building: address.building || null,
        buildingType: address.buildingType || null,
        structure: address.structure || null,
        structureType: address.structureType || null,
        apartment: address.apartment || null,
        apartmentType: address.apartmentType || null,
        liter: address.liter || null,
      },

      rawRecord: object,
    },
  };
}

module.exports = { rosreestrObjectLookup };
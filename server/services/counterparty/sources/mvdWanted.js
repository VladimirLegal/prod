const { request } = require('../providers/apiCloudClient');

function formatBirthDateForApi(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // YYYY-MM-DD -> DD.MM.YYYY
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}.${iso[2]}.${iso[1]}`;
  }

  // MM.YYYY или DD.MM.YYYY или YYYY оставляем как есть
  return raw;
}

async function checkMvdWanted(person, options = {}) {
  const lastName = String(person?.lastName || '').trim();
  const firstName = String(person?.firstName || '').trim();
  const middleName = String(person?.middleName || '').trim();
  const birthDate = formatBirthDateForApi(person?.birthDate || '');

  const canRequest =
    lastName &&
    firstName &&
    birthDate &&
    process.env.APICLOUD_API_TOKEN;

  let response = null;

  if (canRequest) {
    response = await request('mvd.php', {
      type: 'wanted',
      lastname: lastName,
      firstname: firstName,
      birthdate: birthDate,
    });
  }

  const verification = {
    lastName: lastName || null,
    firstName: firstName || null,
    middleName: middleName || null,
    birthDate: birthDate || null,
  };

  const result = {
    status: 'empty',
    provider: 'apicloud',
    items: [],
    raw: response || null,
  };

  if (!response) {
    return result;
  }

  if (response.error) {
    result.status = 'error';
    result.items.push({
      kind: 'mvd_wanted_check',
      isFound: null,
      verification,
      resultState: response.status || null,
      resultStateText: 'Ошибка проверки',
      foundCount: null,
      records: [],
      message: response.message || `Ошибка API МВД (error=${response.error})`,
      rawRecord: response,
    });
    return result;
  }

  if (typeof response.status !== 'number' || (response.status !== 200 && response.status !== 404)) {
    result.status = 'error';
    result.items.push({
      kind: 'mvd_wanted_check',
      isFound: null,
      verification,
      resultState: response.status || null,
      resultStateText: 'Ошибка проверки',
      foundCount: null,
      records: [],
      message:
        response.message ||
        `Неожиданный статус ответа от МВД: ${response.status}`,
      rawRecord: response,
    });
    return result;
  }

  const found = response.found === true;
  const foundCount = Number(response.count || 0) || 0;
  const rawRecords = Array.isArray(response.result) ? response.result : [];

  const records = rawRecords.map((item) => ({
    fullName: item?.fio || null,
    imageUrl: item?.img
        ? (String(item.img).startsWith('http') ? item.img : `https:${item.img}`)
        : null,
    rawRecord: item,
    }));

  const responseStatusText =
    response.status === 200
        ? 'Данные получены'
        : response.status === 404
        ? 'Совпадений не найдено'
        : 'Ошибка ответа сервиса';

  result.status = found ? 'ok' : 'empty';
  result.items.push({
    kind: 'mvd_wanted_check',
    isFound: found,
    verification,
    resultState: responseStatusText,
    resultStateText: found
        ? 'Лицо найдено в базе розыска МВД'
        : 'По базе розыска МВД совпадений не найдено',
    foundCount,
    records,
    message:
        response.message ||
        (found
        ? 'Найдены совпадения в базе розыска МВД'
        : 'Совпадений в базе розыска МВД не найдено'),
    rawRecord: response,
  });

  return result;
}

module.exports = checkMvdWanted;
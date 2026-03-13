const { requestAnalytics } = require('../providers/konturClient');

async function checkCourtsCommon(person) {
  const payload = {
    subject: {
      type: 'person',
      lastName: person.lastName,
      firstName: person.firstName,
      middleName: person.middleName,
      birthDate: person.birthDate,
    },
    modules: ['courts.common'],
  };

  const response = await requestAnalytics(payload);

  return {
    status: response?.status || (Array.isArray(response?.items) && response.items.length ? 'ok' : 'empty'),
    provider: response?.provider || 'kontur',
    items: Array.isArray(response?.items) ? response.items : [],
    raw: response,
  };
}

module.exports = checkCourtsCommon;
const toDigits = (value = '') => String(value || '').replace(/\D+/g, '');

function normalizeNamePart(part) {
  const cleaned = String(part || '').trim();
  return cleaned || '';
}

function normalizeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function normalizePersonInput(input = {}) {
  const lastName = normalizeNamePart(input.lastName || input.surname || input.familyName);
  const firstName = normalizeNamePart(input.firstName || input.name || input.givenName);
  const middleName = normalizeNamePart(input.middleName || input.patronymic || input.secondName);

  const birthDate = normalizeDate(input.birthDate || input.birthdate || input.birth_day);
  const region = String(input.region || '').trim();

  const passportSeries = toDigits(input.passportSeries || input.passport_series || (input.passport && input.passport.series));
  const passportNumber = toDigits(input.passportNumber || input.passport_number || (input.passport && input.passport.number));
  const passportIssueDate = normalizeDate(
    input.passportIssueDate || input.passport_issue_date || (input.passport && input.passport.issueDate)
  );

  const inn = toDigits(input.inn || input.INN || input.taxId);

  return {
    fullName: [lastName, firstName, middleName].filter(Boolean).join(' ').trim(),
    lastName,
    firstName,
    middleName,
    birthDate,
    region,
    passport: {
      series: passportSeries,
      number: passportNumber,
      issueDate: passportIssueDate,
    },
    inn,
  };
}

module.exports = {
  normalizePersonInput,
};
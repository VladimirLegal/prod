const toDigits = (value = '') => String(value || '').replace(/\D+/g, '');

function normalizeRegionCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^0[1-9]$/.test(raw)) {
    return String(Number(raw));
  }

  if (/^\d{1,2}$/.test(raw)) {
    return raw;
  }

  return '';
}

function normalizeRegions(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map(normalizeRegionCode)
      .filter(Boolean)
  )];
}

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
  const regions = normalizeRegions(input.regions);

  const passportSeries = toDigits(input.passportSeries || input.passport_series || (input.passport && input.passport.series));
  const passportNumber = toDigits(input.passportNumber || input.passport_number || (input.passport && input.passport.number));
  const passportIssueDate = normalizeDate(
    input.passportIssueDate || input.passport_issue_date || (input.passport && input.passport.issueDate)
  );

  const inn = toDigits(input.inn || input.INN || input.taxId);
  const snils = toDigits(input.snils || input.SNILS || input.socialNumber);

  return {
    fullName: [lastName, firstName, middleName].filter(Boolean).join(' ').trim(),
    lastName,
    firstName,
    middleName,
    birthDate,
    regions,

    passportSeries,
    passportNumber,
    passportIssueDate,
    passportIssuerCode: input.passportIssuerCode || input.passport_issuer_code || (input.passport && input.passport.issuerCode) || '',
    
    passport: {
      series: passportSeries,
      number: passportNumber,
      issueDate: passportIssueDate,
    },
    inn,
    snils,
  };
}

module.exports = {
  normalizePersonInput,
};
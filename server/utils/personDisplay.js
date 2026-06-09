function splitPassportSeriesNumber(passport) {
  const digits = String(passport || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return { series: digits.slice(0, 4), number: digits.slice(4, 10) };
  }
  return { series: '', number: '' };
}

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function getPersonFullName(person = {}) {
  const directFullName = text(person.fullName);
  if (directFullName) return directFullName;

  const name = text(person.name);
  if (name) return name;

  const fullNameRaw = text(person.fullNameRaw);
  if (fullNameRaw) return fullNameRaw;

  return [
    text(person.lastName),
    text(person.firstName),
    text(person.middleName || person.patronymic),
  ].filter(Boolean).join(' ');
}

function normalizeGender(genderOrPerson) {
  const normalizeString = (value) => {
    const gender = text(value).toLowerCase();
    if (['female', 'f', 'ж', 'женский', 'женщина'].includes(gender)) return 'female';
    if (['male', 'm', 'м', 'мужской', 'мужчина'].includes(gender)) return 'male';
    return '';
  };

  if (typeof genderOrPerson !== 'object' || genderOrPerson === null) {
    return normalizeString(genderOrPerson);
  }

  const person = genderOrPerson;
  const gender = normalizeString(person.gender)
    || normalizeString(person.sex)
    || normalizeString(person.display?.gender)
    || normalizeString(person.display?.genderWord);
  if (gender) return gender;

  const patronymic = text(person.middleName || person.patronymic || getPersonFullName(person).split(/\s+/).slice(2).join(' ')).toLowerCase();
  if (patronymic.endsWith('вна') || patronymic.endsWith('чна')) return 'female';
  if (patronymic.endsWith('вич') || patronymic.endsWith('ич')) return 'male';

  return '';
}

function getGenderWordRu(genderOrPerson) {
  const gender = normalizeGender(genderOrPerson);
  if (gender === 'female') return 'женский';
  if (gender === 'male') return 'мужской';
  return '';
}

function getRegisteredVerbRu(genderOrPerson) {
  const gender = normalizeGender(genderOrPerson);
  if (gender === 'female') return 'зарегистрирована';
  if (gender === 'male') return 'зарегистрирован';
  return 'зарегистрирован(а)';
}

function parseDateLocal(value) {
  const raw = text(value);
  if (!raw) return null;

  let day;
  let month;
  let year;

  const ruMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (ruMatch) {
    day = Number(ruMatch[1]);
    month = Number(ruMatch[2]);
    year = Number(ruMatch[3]);
    if (ruMatch[3].length === 2) {
      year = year <= 30 ? 2000 + year : 1900 + year;
    }
  } else {
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!isoMatch) return null;
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateLongRu(value) {
  const date = parseDateLocal(value);
  if (!date) return '';

  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];

  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function ensureGoda(value) {
  const dateText = text(value);
  if (!dateText) return '';
  if (/года$/i.test(dateText)) return dateText;
  return `${dateText} года`;
}

function getPassportParts(person = {}) {
  const empty = {
    series: '',
    number: '',
    issuedBy: '',
    issueDate: '',
    departmentCode: '',
  };

  const document = person.document || {};
  if (document.type && document.type !== 'passport_rf') {
    return empty;
  }

  let series = text(document.series);
  let number = text(document.number);

  if (!series && !number && person.passport) {
    const splitPassport = splitPassportSeriesNumber(person.passport);
    series = splitPassport.series;
    number = splitPassport.number;
  }

  return {
    series,
    number,
    issuedBy: text(document.issuedBy || person.passportIssued),
    issueDate: text(document.issueDate || person.issueDate),
    departmentCode: text(document.departmentCode || person.departmentCode),
  };
}

function getRegistrationAddress(person = {}) {
  return text(
    person.registrationAddress
    || person.registration
    || person.addressRegistration
    || person.address
  ).replace(/[\s,]+$/g, '');
}

function buildRegistrationPhrase(person = {}) {
  const registrationType = text(person.registrationType);
  const registeredVerb = getRegisteredVerbRu(person);

  if (registrationType === 'none') {
    return `нигде не ${registeredVerb}`;
  }

  const address = getRegistrationAddress(person);
  if (!address) return '';

  if (registrationType === 'previous') {
    return `ранее ${registeredVerb} по адресу: ${address}`;
  }

  if (registrationType === 'temporary') {
    return `временно ${registeredVerb} по адресу: ${address}`;
  }

  return `${registeredVerb} по адресу: ${address}`;
}

function buildPersonTitle(person = {}, options = {}) {
  const normalizedOptions = {
    includeSnils: true,
    includeGender: true,
    dateFormat: 'long',
    ...options,
  };

  const parts = [];
  const fullName = getPersonFullName(person);
  if (fullName) parts.push(fullName);

  const genderWord = getGenderWordRu(person);
  if (normalizedOptions.includeGender && genderWord) {
    parts.push(`пол: ${genderWord}`);
  }

  const birthDate = normalizedOptions.dateFormat === 'long'
    ? formatDateLongRu(person.birthDate)
    : '';
  if (birthDate) {
    parts.push(`дата рождения: ${ensureGoda(birthDate)} рождения`);
  }

  const birthPlace = text(person.birthPlace);
  if (birthPlace) parts.push(`место рождения: ${birthPlace}`);

  const passport = getPassportParts(person);
  if (passport.series && passport.number) {
    parts.push(`паспорт гражданина Российской Федерации: серия: ${passport.series} номер: ${passport.number}`);
  }
  if (passport.issuedBy) parts.push(`выдан: ${passport.issuedBy}`);

  const issueDate = normalizedOptions.dateFormat === 'long'
    ? formatDateLongRu(passport.issueDate)
    : '';
  if (issueDate) {
    parts.push(`дата выдачи: ${ensureGoda(issueDate)}`);
  }

  if (passport.departmentCode) {
    parts.push(`код подразделения: ${passport.departmentCode}`);
  }

  const registrationPhrase = buildRegistrationPhrase(person);
  if (registrationPhrase) parts.push(registrationPhrase);

  const snils = text(person.snils || person.snilsNumber);
  if (normalizedOptions.includeSnils && snils) {
    parts.push(`СНИЛС ${snils}`);
  }

  return parts.filter(Boolean).join(', ').replace(/(?:,\s*)+$/g, '');
}

module.exports = {
  splitPassportSeriesNumber,
  text,
  getPersonFullName,
  normalizeGender,
  getGenderWordRu,
  getRegisteredVerbRu,
  parseDateLocal,
  formatDateLongRu,
  ensureGoda,
  getPassportParts,
  getRegistrationAddress,
  buildRegistrationPhrase,
  buildPersonTitle,
};

const MAX_SUPPORTED_NUMBER = 999999;

const FRACTION_RE = /^\s*(\d+)\s*\/\s*(\d+)\s*$/;

const UNITS_MALE = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const UNITS_FEMALE = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

const ORDINAL_FEMALE = {
  1: 'первая', 2: 'вторая', 3: 'третья', 4: 'четвертая', 5: 'пятая', 6: 'шестая', 7: 'седьмая', 8: 'восьмая', 9: 'девятая',
  10: 'десятая', 11: 'одиннадцатая', 12: 'двенадцатая', 13: 'тринадцатая', 14: 'четырнадцатая', 15: 'пятнадцатая', 16: 'шестнадцатая', 17: 'семнадцатая', 18: 'восемнадцатая', 19: 'девятнадцатая',
  20: 'двадцатая', 30: 'тридцатая', 40: 'сороковая', 50: 'пятидесятая', 60: 'шестидесятая', 70: 'семидесятая', 80: 'восьмидесятая', 90: 'девяностая',
  100: 'сотая', 200: 'двухсотая', 300: 'трехсотая', 400: 'четырехсотая', 500: 'пятисотая', 600: 'шестисотая', 700: 'семисотая', 800: 'восьмисотая', 900: 'девятисотая',
};

const ORDINAL_PLURAL = {
  1: 'первых', 2: 'вторых', 3: 'третьих', 4: 'четвертых', 5: 'пятых', 6: 'шестых', 7: 'седьмых', 8: 'восьмых', 9: 'девятых',
  10: 'десятых', 11: 'одиннадцатых', 12: 'двенадцатых', 13: 'тринадцатых', 14: 'четырнадцатых', 15: 'пятнадцатых', 16: 'шестнадцатых', 17: 'семнадцатых', 18: 'восемнадцатых', 19: 'девятнадцатых',
  20: 'двадцатых', 30: 'тридцатых', 40: 'сороковых', 50: 'пятидесятых', 60: 'шестидесятых', 70: 'семидесятых', 80: 'восьмидесятых', 90: 'девяностых',
  100: 'сотых', 200: 'двухсотых', 300: 'трехсотых', 400: 'четырехсотых', 500: 'пятисотых', 600: 'шестисотых', 700: 'семисотых', 800: 'восьмисотых', 900: 'девятисотых',
};

const pluralForm = (number, one, few, many) => {
  const lastTwo = number % 100;
  const last = number % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
};

const parseSimpleFraction = (value) => {
  const match = String(value ?? '').match(FRACTION_RE);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return null;
  if (numerator < 1 || denominator < 1) return null;
  if (numerator > MAX_SUPPORTED_NUMBER || denominator > MAX_SUPPORTED_NUMBER) return null;
  return { numerator, denominator };
};

const isSimpleFraction = (value) => parseSimpleFraction(value) !== null;

const cardinalUnderThousand = (number, gender = 'male') => {
  const words = [];
  const hundreds = Math.floor(number / 100);
  const rest = number % 100;
  if (hundreds) words.push(HUNDREDS[hundreds]);
  if (rest >= 10 && rest < 20) words.push(TEENS[rest - 10]);
  else {
    const tens = Math.floor(rest / 10);
    const units = rest % 10;
    if (tens) words.push(TENS[tens]);
    if (units) words.push((gender === 'female' ? UNITS_FEMALE : UNITS_MALE)[units]);
  }
  return words.join(' ');
};

const cardinal = (number, gender = 'male') => {
  if (number < 1 || number > MAX_SUPPORTED_NUMBER) return '';
  const thousands = Math.floor(number / 1000);
  const rest = number % 1000;
  const words = [];
  if (thousands) {
    words.push(cardinalUnderThousand(thousands, 'female'));
    words.push(pluralForm(thousands, 'тысяча', 'тысячи', 'тысяч'));
  }
  if (rest) words.push(cardinalUnderThousand(rest, gender));
  return words.filter(Boolean).join(' ');
};

const ordinalUnderThousand = (number, singular) => {
  const map = singular ? ORDINAL_FEMALE : ORDINAL_PLURAL;
  if (map[number]) return map[number];

  const hundreds = Math.floor(number / 100);
  const rest = number % 100;
  const words = [];
  if (hundreds) words.push(HUNDREDS[hundreds]);

  if (map[rest]) {
    words.push(map[rest]);
  } else {
    const tens = Math.floor(rest / 10);
    const units = rest % 10;
    if (tens) words.push(TENS[tens]);
    if (units) words.push(map[units]);
  }

  return words.filter(Boolean).join(' ');
};

const denominatorWords = (number, singular) => {
  if (number < 1000) return ordinalUnderThousand(number, singular);
  const thousands = Math.floor(number / 1000);
  const rest = number % 1000;
  if (!rest) {
    return `${cardinal(thousands, 'female')} ${singular ? 'тысячная' : 'тысячных'}`;
  }
  return `${cardinal(thousands, 'female')} ${pluralForm(thousands, 'тысяча', 'тысячи', 'тысяч')} ${ordinalUnderThousand(rest, singular)}`;
};

const fractionToRussianWords = (value) => {
  const fraction = parseSimpleFraction(value);
  if (!fraction) return '';
  const numeratorWords = cardinal(fraction.numerator, 'female');
  const denominator = denominatorWords(fraction.denominator, fraction.numerator === 1);
  return numeratorWords && denominator ? `${numeratorWords} ${denominator}` : '';
};

export { fractionToRussianWords, isSimpleFraction };

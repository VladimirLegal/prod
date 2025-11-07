// client/src/hooks/useFormattedCurrency.js
const getCurrencyEnding = (num, forms) => {
  const lastTwo = num % 100;
  const last = num % 10;

  if (lastTwo > 10 && lastTwo < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
};

const capitalizeFirstLetter = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const numberToWordsFull = (num, feminine) => {
  const ones = feminine
    ? ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
    : ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];

  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
    'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят',
    'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста',
    'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

  const scales = [
    ['', '', ''],
    ['тысяча', 'тысячи', 'тысяч'],
    ['миллион', 'миллиона', 'миллионов'],
    ['миллиард', 'миллиарда', 'миллиардов'],
    ['триллион', 'триллиона', 'триллионов']
  ];

  const parts = [];
  let remainder = num;
  let scaleIdx = 0;

  while (remainder > 0) {
    const segment = remainder % 1000;
    remainder = Math.floor(remainder / 1000);

    if (segment === 0) {
      scaleIdx++;
      continue;
    }

    const h = Math.floor(segment / 100);
    const t = Math.floor((segment % 100) / 10);
    const o = segment % 10;
    const teen = segment % 100;

    const gender = scaleIdx === 1
      ? ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
      : ones;

    let chunk = '';
    if (h) chunk += hundreds[h] + ' ';
    if (t > 1) {
      chunk += tens[t] + ' ';
      if (o) chunk += gender[o] + ' ';
    } else if (t === 1) {
      chunk += teens[o] + ' ';
    } else if (o) {
      chunk += gender[o] + ' ';
    }

    const form = (teen > 10 && teen < 20) ? 2 :
                 o === 1 ? 0 : (o >= 2 && o <= 4 ? 1 : 2);
    chunk += scales[scaleIdx][form] + ' ';
    parts.unshift(chunk.trim());
    scaleIdx++;
  }

  return parts.join(' ').trim();
};

export const useFormattedCurrency = (amount) => {
  const cleanValue = parseFloat(amount?.toString().replace(/[^\d,]/g, '').replace(',', '.'));

  if (isNaN(cleanValue) || cleanValue > 999999999999.99) {
    return { formatted: '', raw: '', rubles: 0, kopecks: 0 };
  }

  const rubles = Math.floor(cleanValue);
  const kopecks = Math.round((cleanValue - rubles) * 100);

  const rubStr = new Intl.NumberFormat('ru-RU').format(rubles);
  const wordsRub = capitalizeFirstLetter(numberToWordsFull(rubles, false));
  const rubEnding = getCurrencyEnding(rubles, ['рубль', 'рубля', 'рублей']);
  const kopEnding = getCurrencyEnding(kopecks, ['копейка', 'копейки', 'копеек']);

  const formatted = `${rubStr} (${wordsRub}) ${rubEnding} ${kopecks.toString().padStart(2, '0')} ${kopEnding}`;

  return { formatted, rubles, kopecks, raw: cleanValue };
};

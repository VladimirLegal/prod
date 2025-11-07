export function formatDateToText(dateString) {
  if (!dateString) return '';

  let day, month, year;

  const digitsOnly = dateString.replace(/\D/g, '');

  if (digitsOnly.length === 6) {
    day = digitsOnly.slice(0, 2);
    month = digitsOnly.slice(2, 4);
    let shortYear = digitsOnly.slice(4);
    year = parseInt(shortYear, 10) > 30 ? '19' + shortYear : '20' + shortYear;
  } else if (digitsOnly.length === 8) {
    day = digitsOnly.slice(0, 2);
    month = digitsOnly.slice(2, 4);
    year = digitsOnly.slice(4);
  } else if (dateString.includes('.')) {
    const parts = dateString.split('.');
    if (parts.length !== 3) return 'Неверный формат даты';

    let [d, m, y] = parts;

    if (!d || !m || !y) return 'Неверный формат даты';

    d = d.toString().padStart(2, '0');
    m = m.toString().padStart(2, '0');

    if (y.length === 2) {
      y = parseInt(y, 10) > 30 ? '19' + y : '20' + y;
    }
    y = y.toString().padStart(4, '0');

    day = d;
    month = m;
    year = y;
  } else {
    return 'Неверный формат даты';
  }

  const parsed = new Date(`${year}-${month}-${day}`);
  if (
    parsed.getFullYear() !== parseInt(year, 10) ||
    parsed.getMonth() + 1 !== parseInt(month, 10) ||
    parsed.getDate() !== parseInt(day, 10)
  ) {
    return 'Неверный формат даты';
  }

  const months = [
    '', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];

  return `${parseInt(day, 10)} ${months[parseInt(month, 10)]} ${year} года`;
};

// Форматирование паспорта при вводе
export const formatPassport = (value) => {
  if (!value) return value;
  const passport = value.replace(/\D/g, '');
  if (passport.length <= 4) return passport;
  return `${passport.slice(0, 4)} ${passport.slice(4, 10)}`;
};

// Форматирование номера телефона
export const formatPhone = (value) => {
  if (!value) return value;
  const phone = value.replace(/\D/g, '');
  const length = phone.length;
  
  if (length < 2) return phone;
  if (length < 5) return `+7 (${phone.slice(1, 4)}`;
  if (length < 8) return `+7 (${phone.slice(1, 4)}) ${phone.slice(4, 7)}`;
  if (length < 10) return `+7 (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7, 9)}`;
  return `+7 (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7, 9)}-${phone.slice(9, 11)}`;
};

// Форматирование паспорта в текстовый вид
export const formatPassportText = (passport) => {
  if (!passport) return '';
  const cleanPassport = passport.replace(/\D/g, '');
  if (cleanPassport.length !== 10) return 'Неверный формат паспорта';
  
  const series = cleanPassport.substring(0, 4);
  const number = cleanPassport.substring(4, 10);
  return `серия ${series} номер ${number}`;
};

// Форматирование кода подразделения
export const formatDepartmentCode = (value) => {
  if (!value) return value;
  const code = value.replace(/\D/g, '');
  if (code.length <= 3) return code;
  return `${code.slice(0, 3)}-${code.slice(3, 6)}`;
};

// Форматирование кадастрового номера
export const formatCadastral = (value) => {
  const clean = value.replace(/\D/g, '');
  if (clean.length > 18) return value.substring(0, 18);
  
  // Форматирование по группам: 2:2:7:7
  const groups = [
    clean.substring(0, 2),
    clean.substring(2, 4),
    clean.substring(4, 11),
    clean.substring(11, 18)
  ].filter(group => group !== '');
  
  return groups.join(':');
};

// Функция для преобразования строки в дату
export const parseDate = (dateString) => {
  if (!dateString) return null;
  const cleanDate = dateString.replace(/\D/g, '');
  let day, month, year;
  
  if (cleanDate.length === 6) {
    day = cleanDate.substring(0, 2);
    month = cleanDate.substring(2, 4);
    const shortYear = parseInt(cleanDate.substring(4, 6), 10);
    const currentYear = new Date().getFullYear();
    const currentShortYear = currentYear % 100;
    const currentCentury = Math.floor(currentYear / 100) * 100;
    
    year = shortYear > currentShortYear ? 
      currentCentury - 100 + shortYear : 
      currentCentury + shortYear;
  } else if (cleanDate.length === 8) {
    day = cleanDate.substring(0, 2);
    month = cleanDate.substring(2, 4);
    year = parseInt(cleanDate.substring(4, 8), 10);
  } else {
    return null;
  }
  
  const monthIndex = parseInt(month, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  
  const dateObj = new Date(year, monthIndex, day);
  if (
    dateObj.getFullYear() !== year || 
    dateObj.getMonth() !== monthIndex || 
    dateObj.getDate() !== parseInt(day, 10)
  ) {
    return null;
  }
  
  return dateObj;
};

// Функция преобразования числа в текст
export const numberToWords = (num) => {
  const units = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
                'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  
  let result = '';
  if (num === 0) {
    return 'ноль';
  }

  // Преобразуем число в строку и дополняем нулями до 6 знаков
  let n = ('000000' + num).slice(-6);
  let rubles = parseInt(n.substr(0, 6), 10);

  if (rubles === 0) {
    result = 'ноль ';
  }

  // Обработка тысяч
  if (rubles >= 1000) {
    const thousands = Math.floor(rubles / 1000);
    if (thousands >= 100) {
      result += hundreds[Math.floor(thousands / 100)] + ' ';
    }
    const remainder = thousands % 100;
    if (remainder < 10) {
      result += units[remainder] + ' ';
    } else if (remainder >= 10 && remainder < 20) {
      result += teens[remainder - 10] + ' ';
    } else {
      result += tens[Math.floor(remainder / 10)] + ' ' + units[remainder % 10] + ' ';
    }

    // Правильное склонение "тысяч"
    const lastDigit = remainder % 10;
    if (lastDigit === 1 && remainder % 100 !== 11) {
      result += 'тысяча ';
    } else if ([2, 3, 4].includes(lastDigit) && remainder % 100 < 10 || remainder % 100 > 20) {
      result += 'тысячи ';
    } else {
      result += 'тысяч ';
    }
  }

  // Обработка сотен рублей
  const hundredsRubles = Math.floor(rubles % 1000 / 100);
  if (hundredsRubles > 0) {
    result += hundreds[hundredsRubles] + ' ';
  }

  // Обработка десятков и единиц рублей
  const tensRubles = rubles % 100;
  if (tensRubles < 10) {
    result += units[tensRubles] + ' ';
  } else if (tensRubles >= 10 && tensRubles < 20) {
    result += teens[tensRubles - 10] + ' ';
  } else {
    result += tens[Math.floor(tensRubles / 10)] + ' ' + units[tensRubles % 10] + ' ';
  }

  // Правильное склонение "рублей"
  const lastDigit = tensRubles % 10;
  if (lastDigit === 1 && tensRubles !== 11) {
    result += 'рубль';
  } else if ([2, 3, 4].includes(lastDigit) && tensRubles < 10 || tensRubles > 20) {
    result += 'рубля';
  } else {
    result += 'рублей';
  }

  return result.trim();
};

// Форматирование стоимости аренды
export const formatRentAmount = (value) => {
  if (!value) return '';
  
  // Разделяем рубли и копейки
  const [rublesPart, kopecksPart] = value.split(',');
  const rublesClean = rublesPart.replace(/\D/g, '');
  
  if (!rublesClean) {
    return '';
  }
  
  // Форматирование числа
  const num = parseInt(rublesClean);
  const formattedNum = new Intl.NumberFormat('ru-RU').format(num);
  
  // Форматирование прописью
  const words = numberToWords(num);
  
  // Обработка копеек
  let kopecksClean = '00';
  if (kopecksPart !== undefined) {
    kopecksClean = kopecksPart.replace(/\D/g, '').substring(0, 2);
    if (kopecksClean.length === 1) kopecksClean += '0';
    if (kopecksClean === '') kopecksClean = '00';
  }
  
  return formattedNum;
};
// === СУММА: цифрами + прописью (RU) ===
export const amountRu = (input) => {
  if (input === null || input === undefined || input === '') return '';
  const normalized = String(input).replace(/\s+/g, '').replace(',', '.');
  let value = Number(normalized);
  if (!isFinite(value) || value < 0) value = 0;

  const rub = Math.floor(value + 1e-9);
  const kop = Math.round((value - rub) * 100);
  const rubFormatted = new Intl.NumberFormat('ru-RU').format(rub);
  const rubWord = declWord(rub, ['рубль', 'рубля', 'рублей']);
  const kop2 = String(kop).padStart(2, '0');
  const kopWord = declWord(kop, ['копейка', 'копейки', 'копеек']);

  const words = numberToWordsRu(rub); // без "рублей"
  return `${rubFormatted} (${words}) ${rubWord} ${kop2} ${kopWord}`;
};

const declWord = (n, forms) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b > 1 && b < 5) return forms[1];
  return forms[2];
};

const numberToWordsRu = (n) => {
  if (n === 0) return 'ноль';
  const unitsM = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const unitsF = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const teens = ['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
  const tens = ['', 'десять','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
  const hundreds = ['', 'сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];
  const groups = [
    { fem: false, names: ['', '', ''] },                      // единицы
    { fem: true,  names: ['тысяча','тысячи','тысяч'] },       // тысячи
    { fem: false, names: ['миллион','миллиона','миллионов'] },
    { fem: false, names: ['миллиард','миллиарда','миллиардов'] },
    { fem: false, names: ['триллион','триллиона','триллионов'] },
  ];
  const parts = [];
  let i = 0;
  while (n > 0 && i < groups.length) {
    const triad = n % 1000;
    if (triad) {
      const w = triadToWords(triad, groups[i].fem, unitsM, unitsF, teens, tens, hundreds);
      const g = i === 0 ? '' : ' ' + declWord(triad, groups[i].names);
      parts.unshift(w + g);
    }
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(' ').trim();
};

const triadToWords = (num, fem, unitsM, unitsF, teens, tens, hundreds) => {
  const h = Math.floor(num / 100);
  const t = Math.floor((num % 100) / 10);
  const u = num % 10;
  const res = [];
  if (h) res.push(hundreds[h]);
  if (t > 1) {
    res.push(tens[t]);
    if (u) res.push((fem ? unitsF : unitsM)[u]);
  } else if (t === 1) {
    res.push(teens[u]);
  } else if (u) {
    res.push((fem ? unitsF : unitsM)[u]);
  }
  return res.join(' ');
};

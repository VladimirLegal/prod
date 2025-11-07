// client/src/utils/freeTextParser.js
// Универсальный парсер "любой текст → паспортные поля" с расширенными эвристиками.

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

// ===== ДАТЫ =====
function normalizeDateNumeric(s) {
  if (!s) return '';
  s = s
    .replace(/[ОоoO]/g, '0')
    .replace(/[,]/g, '.')
    .replace(/[^\d./-]/g, '');
  const m = s.match(/^([0-3]?\d)[./-]([01]?\d)[./-](\d{2}|\d{4})$/);
  if (!m) return '';
  let dd = m[1].padStart(2, '0');
  let mm = m[2].padStart(2, '0');
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = (Number(yyyy) > 30 ? '19' : '20') + yyyy;
  return `${dd}.${mm}.${yyyy}`;
}

const RU_MONTHS = {
  'янв': '01', 'фев': '02', 'мар': '03', 'апр': '04',
  'мая': '05', 'май': '05', 'июн': '06', 'июл': '07',
  'авг': '08', 'сен': '09', 'сент': '09', 'окт': '10',
  'ноя': '11', 'дек': '12'
};

function normalizeDateWords(s) {
  if (!s) return '';
  const m = s.match(/([0-3]?\d)\s+([А-Яа-яё]+)\s+(\d{4})/i);
  if (!m) return '';
  const dd = m[1].padStart(2, '0');
  const monRaw = m[2].toLowerCase();
  const key = monRaw.slice(0, 3);
  const mm = RU_MONTHS[key] || '';
  if (!mm) return '';
  const yyyy = m[3];
  return `${dd}.${mm}.${yyyy}`;
}

function normalizeDateSmart(s) {
  return normalizeDateNumeric(s) || normalizeDateWords(s);
}

// Сохраняем ПОРЯДОК дат по тексту (и числовых, и словесных)
function extractAllDates(raw) {
  const text = String(raw || '');
  const re = /([0-3]?\d[./-][01]?\d[./-](\d{4}|\d{2}))|([0-3]?\d\s+[А-Яа-яё]+\s+\d{4})/gi;
  const out = [];
  for (const m of text.matchAll(re)) {
    const hit = m[1] || m[3];
    const d = normalizeDateSmart(hit);
    if (d) out.push(d);
  }
  return out;
}

// Вырезаем даты из "Места рождения" и хвосты типа "г.р."
const RU_MONTHS_WORDS = '(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)';
function stripDatesFromPlace(s) {
  if (!s) return '';
  let str = String(s);

  const reNum  = /[0-3]?\d[./-][01]?\d[./-](\d{2}|\d{4})/;
  const reWord = new RegExp(`([0-3]?\\d)\\s+${RU_MONTHS_WORDS}\\s+\\d{4}`, 'i');

  const mNum  = reNum.exec(str);
  const mWord = reWord.exec(str);

  let cutIdx = -1;
  if (mNum)  cutIdx = mNum.index;
  if (mWord) cutIdx = (cutIdx === -1) ? mWord.index : Math.min(cutIdx, mWord.index);

  if (cutIdx !== -1) str = str.slice(0, cutIdx);

  str = str
    .replace(/\bг\.?\s*р\.?\b/gi, '')
    .replace(/\bгода\s+рождения\b/gi, '')
    .replace(/[,\s;]+$/g, '');

  return norm(str);
}

// ===== ПАСПОРТ/ПРОЧЕЕ =====
function normalizePassportNumber(s) {
  if (!s) return '';
  s = s.replace(/[OoОоD]/g, '0').replace(/[Il|]/g, '1');
  const digits = (s.match(/\d/g) || []).join('');
  if (digits.length < 10) return '';
  const ser = digits.slice(0, 4);
  const num = digits.slice(4, 10);
  return `${ser} ${num}`;
}

function normalizeDepCode(s) {
  if (!s) return '';
  s = s.replace(/[—–−]/g, '-');
  const digits = (s.match(/\d/g) || []).join('');
  if (digits.length < 6) return '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
}

function normalizePhone(s) {
  if (!s) return '';
  const digits = (s.match(/\d/g) || []).join('');
  if (digits.length < 10) return '';
  const d = digits.slice(-10);
  return `+7 (${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6,8)}-${d.slice(8,10)}`;
}

function detectGender(s) {
  const t = (s || '').toLowerCase();
  if (t.includes('жен')) return 'female';
  if (t.includes('муж')) return 'male';
  return '';
}

function grab(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return norm(m[1]);
  }
  return '';
}

// Ограничиваемся окном вокруг первого "паспорт", если текст очень длинный
function cutAroundFirstPassport(text) {
  const re = /(?:пас+порт|паспорт)(?:\s+гражданина\s+российской\s+федерации)?|Серия\s*и\s*номер|серия|№/iu;
  const m = re.exec(text);
  if (!m) return text;
  const i = Math.max(0, m.index - 180);
  const j = Math.min(text.length, m.index + 520);
  return text.slice(i, j);
}

// Фильтр "похоже на ФИО"
const BAD_TOKENS = /(гор\.?|г\.|ул\.?|просп\.?|пр-т|район|р-?н|обл\.?|край|края|лит\.?|дом|д\.|корп\.?|кв\.?|снилс|именуем)/i;
function isLikelyFIO(str) {
  const parts = (str || '').trim().split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  if (parts.some(p => BAD_TOKENS.test(p))) return false;
  return parts.every(w => /^[А-ЯЁ][а-яё-]+$/.test(w));
}
function findNameNearPassport(text) {
  const pivots = [/пас+порт/iu, /Серия\s*и\s*номер/iu, /серия/iu];
  let pos = -1;
  for (const re of pivots) {
    const m = re.exec(text);
    if (m) { pos = m.index; break; }
  }
  if (pos < 0) return '';
  const left = text.slice(Math.max(0, pos - 220), pos);
  const candidates = left.match(/[А-ЯЁ][а-яё-]+(?:\s+[А-ЯЁ][а-яё-]+){1,3}/g) || [];
  const filtered = candidates.filter(isLikelyFIO);
  if (filtered.length) return norm(filtered[filtered.length - 1]);
  return '';
}

// Вспомогалки для фоллбэка по датам
function _toParts(ddmmyyyy) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ddmmyyyy || '');
  return m ? { d: +m[1], m: +m[2], y: +m[3], s: ddmmyyyy } : null;
}
function _toDate(s) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s || '');
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}
function _dateNum(s) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s || '');
  return m ? (+m[3]) * 10000 + (+m[2]) * 100 + (+m[1]) : 0;
}

// ===== ОСНОВНОЙ ПАРСЕР =====
export function parseFreeTextPerson(raw) {
  let text = (raw || '')
    .replace(/\r/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/Отправлено из приложения «?Госуслуги»?,?/i, '')
    .trim();

  if (text.length > 1200) text = cutAroundFirstPassport(text);

  // --- ФИО ---
  let fullName = grab(text, [
    /^\s*([А-ЯЁ][а-яё-]+(?:\s+[А-ЯЁ][а-яё-]+){1,2})\s*,/m,
    /ФИО\s*[:\-]?\s*([\s\S]*?)\n/i,
    /Фамилия Имя Отчество\s*[:\-]?\s*([\s\S]*?)\n/i,
    /(?:гр\.\s*РФ|гражданин(?:ка)?\s*РФ)[,\s]*([\p{Lu}][\p{Ll}ё-]+(?:\s+[\p{Lu}][\p{Ll}ё-]+){1,2})/iu,
  ]);
  if (!fullName) {
    const firstLine = text.split(/\n/)[0] || '';
    const beforeComma = firstLine.split(',')[0];
    const words = beforeComma.match(/[А-ЯЁ][а-яё-]+/g) || [];
    if (words.length >= 2) {
      const candidate = words.slice(0, 4).join(' ');
      if (isLikelyFIO(candidate)) fullName = candidate;
    }
  }
  if (!fullName) fullName = findNameNearPassport(text);

  // --- ПОЛ ---
  const gender = detectGender(
    grab(text, [/Пол\s*[:\-]?\s*(мужской|женский)/i]) || text
  );

  // --- ДАТА РОЖДЕНИЯ (с метками) ---
  let birthDate = normalizeDateSmart(
    grab(text, [
      // "Дата рождения: 22.12.1983" или "Дата рождения: 15 марта 1986"
      /Дата\s*рождения\s*[:\-]?\s*([0-3]?\d[./-][01]?\d[./-]\d{2,4}|[0-3]?\d\s+[А-Яа-яё]+\s+\d{4})/i,
      // "22.12.1983 г.р." / "22.12.1983 года рождения"
      /([0-3]?\d[./-][01]?\d[./-]\d{2,4})\s*(?:г\.?\s*р\.?|года\s*рождения)/i,
      // "15 марта 1986 года рождения"
      /([0-3]?\d\s+[А-Яа-яё]+\s+\d{4})\s*(?:г(?:ода)?\s*рождения|г\.?\s*р\.?)/i,
      // "… рождения: 15 марта 1986"
      /рождения\s*[:\-]?\s*([0-3]?\d\s+[А-Яа-яё]+\s+\d{4})/i,
    ])
  );

  // --- ПАСПОРТ (серия+номер) ---
  let passport = normalizePassportNumber(
    grab(text, [
      /(^|\n)\s*([0-9]{4}\s?[0-9]{6})\s*(\n|$)/m,
      /пас+порт(?:\s+(?:гражданина\s+российской\s+федерации|российской\s+федерации|рф))?\s*[:\-]?\s*([0-9\s№-]{10,})/iu,
      /Серия\s*и\s*номер\s*[:\-]?\s*([0-9\s-№]{10,})/i,
    ])
  );
  if (!passport) {
    const m = text.match(/серия\s*[:\-]?\s*([0-9]{2}\s?[0-9]{2}).*?номер\s*[:\-]?\s*([0-9][0-9\s]{5,})/i);
    if (m) passport = normalizePassportNumber(`${m[1]}${m[2]}`);
  }

  // --- КЕМ ВЫДАН / ДАТА ВЫДАЧИ ---
  let passportIssued = grab(text, [
    /Кем\s*выдан\s*[:\-]?\s*([\s\S]*?)(?=дата\s*выдачи|код\s*подразделения|зарегистр|телефон|СНИЛС|пас+порт|$)/iu,
  ]);
  if (!passportIssued) {
    passportIssued = grab(text, [
      /выдан\s*[:\-]?\s*([\s\S]*?)(?=\n|дата\s*выдачи|код\s*подразделения|зарегистр|телефон|СНИЛС|$)/i,
    ]);
  }

  // «выдан <дата> <орган>» → дата в issueDate, остальное — в passportIssued
  let issueDate = '';
  if (!passportIssued) {
    const m = text.match(
      /выдан[^0-9]*([0-3]?\d[./-][01]?\d[./-]\d{2,4}|[0-3]?\d\s+[А-Яа-яё]+\s+\d{4})\s*(?:г(?:ода)?\.?)?\s*([\s\S]*?)(?=,|код\s*подразделения|зарегистр|телефон|СНИЛС|$)/i
    );
    if (m) {
      issueDate = normalizeDateSmart(m[1]) || '';
      passportIssued = norm(m[2]);
    }
  }

  // Явная "Дата выдачи: ..."
  if (!issueDate) {
    issueDate = normalizeDateSmart(
      grab(text, [
        /Дата\s*выдачи\s*[:\-]?\s*([0-3]?\d[./-][01]?\d{1}[./-]\d{2,4}|[0-3]?\d\s+[А-Яа-яё]+\s+\d{4})/i,
      ])
    );
  }

  // Подчистка "Кем выдан"
  if (passportIssued) {
    
    // 3.1 Если на конце есть ", <дата>" — заберём её в issueDate и срежем из текста
    const tailDate = passportIssued.match(
      /,\s*([0-3]?\d[./-][01]?\d[./-]\d{2,4}|[0-3]?\d\s+[А-Яа-яё]+\s+\d{4})(?:\s*г(?:ода)?\.?)?\s*,?\s*$/i
    );
    if (tailDate && !issueDate) {
      const d = normalizeDateSmart(tailDate[1]);
      if (d) issueDate = d;
    }
    passportIssued = passportIssued.replace(
      /,\s*([0-3]?\d[./-][01]?\d[./-]\d{2,4}|[0-3]?\d\s+[А-Яа-яё]+\s+\d{4})(?:\s*г(?:ода)?\.?)?\s*,?\s*$/i,
      ''
    );

    // 3.2 Если на конце есть ", выдан <дата>" — тоже забираем в issueDate и срезаем
    const tailGiven = passportIssued.match(
      /,\s*выдан\s+([0-3]?\d[./-][01]?\d[./-]\d{2,4}|[0-3]?\d\s+[А-Яа-яё]+\s+\d{4})(?:\s*г(?:ода)?\.?)?\s*,?\s*$/i
    );
    if (tailGiven && !issueDate) {
      const d = normalizeDateSmart(tailGiven[1]);
      if (d) issueDate = d;
    }
    passportIssued = passportIssued.replace(
      /,\s*выдан\s+([0-3]?\d[./-][01]?\d[./-]\d{2,4}|[0-3]?\d\s+[А-Яа-яё]+\s+\d{4})(?:\s*г(?:ода)?\.?)?\s*,?\s*$/i,
      ''
    );

    // если начинается с даты — утащим в issueDate
    const lead = passportIssued.match(/^([0-3]?\d[./-][01]?\d[./-]\d{2,4}|[0-3]?\d\s+[А-Яа-яё]+\s+\d{4})\s*(?:г(?:ода)?\.?)?\s*(.*)$/i);
    if (lead) {
      const d = normalizeDateSmart(lead[1]);
      if (d && !issueDate) issueDate = d;
      passportIssued = norm(lead[2]);
    }
    // убрать завершающую дату, если прилипла
    passportIssued = passportIssued.replace(
      /[,;\s]*([0-3]?\d[./-][01]?\d[./-]\d{2,4}|[0-3]?\d\s+[А-Яа-яё]+\s+\d{4})(?:\s*г(?:ода)?\.?)?\s*$/i,
      ''
    );
    // убрать хвост ", выдан 22.07.2010( г./года)?,"
    passportIssued = passportIssued.replace(
      /,\s*выдан\s+([0-3]?\d[./-][01]?\d[./-]\d{2,4}|[0-3]?\d\s+[А-Яа-яё]+\s+\d{4})(?:\s*г(?:ода)?\.?)?,?$/i,
      ''
    );
    // убрать хвост ", Дата выдачи ..."
    passportIssued = passportIssued
      .replace(/\s*,?\s*выдан\s*$/i, '')
      .replace(/\s*,?\s*Дата\s*выдачи.*$/i, '')
      .replace(/[,\s]+$/g, '')
      .trim();
  }

  // --- КОД ПОДРАЗДЕЛЕНИЯ ---
  const departmentCode = normalizeDepCode(
    grab(text, [
      /Код\s*подразделения\s*[:\-]?\s*([0-9]{3}\s*[-–—]?\s*[0-9]{3})/i,
      /Код\s*подразд\.?\s*[:\-]?\s*([0-9]{3}\s*[-–—]?\s*[0-9]{3})/i,
      /код\s*подразделения\s*([0-9]{3}\s*[-–—]?\s*[0-9]{3})/i,
    ])
  );

  // --- РЕГИСТРАЦИЯ ---
  let registration = grab(text, [
    /Адрес\s*регистрации\s*[:\-]?\s*([\s\S]*?)(?=\n|телефон|phone|e-?mail|email|СНИЛС|именуем|$)/i,
  ]);
  if (!registration) {
    registration = grab(text, [
      /зарегистрирован[а-я]*\s*(?:по\s*месту\s*жительства\s*)?по\s*адресу\s*[:\-]?\s*([\s\S]*?)(?=,?\s*(?:телефон|phone|e-?mail|email|СНИЛС|именуем|$))/i,
    ]);
  }
  registration = norm(registration);

  // --- ТЕЛЕФОН / EMAIL ---
  const phone = normalizePhone(
    grab(text, [
      /Телефон\s*[:\-]?\s*([\s\S]*?)\n/i,
      /(?:Тел|тел\.?|Phone)\s*[:\-]?\s*([\s\S]*?)\n/i,
    ])
  );

  const email = grab(text, [
    /Email\s*[:\-]?\s*([\w.\-+]+@[A-Za-z0-9\-.]+\.[A-Za-z]{2,})/i,
    /([\w.\-+]+@[A-Za-z0-9\-.]+\.[A-Za-z]{2,})/i,
  ]);

  // --- МЕСТО РОЖДЕНИЯ ---
  let birthPlace = grab(text, [
    /Место\s*рождения\s*[:\-]?\s*([\s\S]*?)(?=,?\s*(?:пас+порт|Серия\s*и\s*номер|серия|номер|выдан|код\s*подразделения|зарегистр|телефон|email|e-?mail|СНИЛС|именуем|пол|$))/iu,
  ]);
  if (!birthPlace) {
    // fallback: после ФИО/даты в первой строке — до ключей
    const firstLine = text.split(/\n/)[0] || '';
    const afterName = firstLine.replace(/^[^,]*,\s*/, '');
    let cut = afterName;
    cut = cut.split(/СНИЛС|пас+порт|Серия\s*и\s*номер|серия|номер|выдан|код\s*подразделения|зарегистр|телефон|email|e-?mail|именуем|пол/iu)[0] || '';
    cut = cut.replace(/^\s*[,;]\s*/, '');
    if (cut && !/\d{4}\s?\d{6}/.test(cut)) birthPlace = norm(cut);
  }
  if (birthPlace) {
    // финальная подчистка ключей…
    birthPlace = birthPlace.replace(
      /\s*,?\s*(пас+порт|Серия\s*и\s*номер|серия|номер|выдан|код\s*подразделения|зарегистр|телефон|email|e-?mail|СНИЛС|именуем|пол)[\s\S]*$/iu,
      ''
    ).trim();
    // …и вырезаем любые даты
    birthPlace = stripDatesFromPlace(birthPlace);
    // и если вдруг «Пол: …» прилип до очистки — отрежем по «Пол»
    birthPlace = birthPlace.split(/(?:^|,\s*)Пол\s*:/i)[0].trim();
  }

  // ===== ЕСЛИ НЕТ ДАТЫ РОЖДЕНИЯ / ВЫДАЧИ — ПРАВИЛО «14 ЛЕТ» =====
  if (!birthDate || !issueDate) {
    const all = extractAllDates(text); // ['dd.mm.yyyy', ...]
    const parsed = all
      .map(_toParts)
      .filter(Boolean)
      .filter(o => o.y >= 1900 && o.y <= new Date().getFullYear());

    if (parsed.length) {
      const today = new Date();
      const minBirthYear = today.getFullYear() - 14;

      // кандидаты на рождение: не моложе 14 лет
      const birthCands = parsed.filter(o => o.y <= minBirthYear);
      if (!birthDate && birthCands.length) {
        // самая ранняя по календарю
        birthDate = birthCands.reduce((a, b) => _dateNum(b.s) < _dateNum(a.s) ? b : a).s;
      }

      // кандидаты на выдачу
      let issueCands;
      if (birthDate) {
        const bd = _toDate(birthDate);
        issueCands = parsed.filter(o => {
          const id = _toDate(o.s);
          if (!id || !bd) return false;
          const bdPlus14 = new Date(bd.getFullYear() + 14, bd.getMonth(), bd.getDate());
          return id >= bdPlus14; // не раньше 14 лет от рождения
        });
      } else {
        // birthDate нет: всё моложе 14 лет точно не рождение → хорошие кандидаты для выдачи
        issueCands = parsed.filter(o => o.y >= minBirthYear || o.y >= 1997);
      }

      if (!issueDate && issueCands.length) {
        // самая поздняя по календарю
        issueDate = issueCands.reduce((a, b) => _dateNum(b.s) > _dateNum(a.s) ? b : a).s;
      }

      // одинокая дата и она моложе 14 лет — это выдача
      if (!birthDate && !issueDate && parsed.length === 1 && parsed[0].y > minBirthYear) {
        issueDate = parsed[0].s;
      }

      // страховка: "выдача" раньше "рождения" — меняем местами
      if (birthDate && issueDate && _dateNum(issueDate) < _dateNum(birthDate)) {
        const tmp = birthDate; birthDate = issueDate; issueDate = tmp;
      }
    }
  }

  return {
    fullName: norm(fullName),
    gender,
    birthDate: birthDate || '',
    birthPlace: norm(birthPlace),
    passport,
    issueDate: issueDate || '',
    passportIssued: norm(passportIssued),
    departmentCode,
    registration,
    phone,
    email,
    rawText: text,
  };
}

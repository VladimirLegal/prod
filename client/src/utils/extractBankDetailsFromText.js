// client/src/utils/extractBankDetailsFromText.js

// Оставить только цифры
const digits = (s) => String(s || '').replace(/\D/g, '');

// Перечень «следующих меток», чтобы обрывать многострочные блоки аккуратно
const NEXT_LABEL_SRC = [
  'ИНН(?:\\s+при\\s+необходимости)?', 'INN',
  'КПП(?:\\s+при\\s+необходимости)?', 'KPP',
  'БИК(?:\\s+Банка(?:\\s+получателя)?)?', 'BIK',
  '(?:К\\/?С|КСС|Корр\\.?\\s*сч(?:е|ё)т|Корреспондентский\\s*сч(?:е|ё)т|corr\\.?\\s*acc(?:ount)?)',
  '(?:(?:Р\\/?С|Р\\.?\\s*с)|Расч(?:е|ё)тн[ао]й\\s*сч(?:е|ё)т|Сч(?:е|ё)т\\s*№|Номер\\s*сч(?:е|ё)та|Account|Счет\\s*получателя(?:\\s*в\\s*банке\\s*получателя)?)',
  '(?:(?:Наименование\\s+)?Банка?\\s+получателя|Банк(?:-получатель)?|Bank)',
  '(?:Получатель|Бенефициар|Beneficiary)',
  'Назначение\\s*платежа', 'SWIFT', 'ОКПО', 'ОГРН',
  'Почтовый\\s+адрес\\s+банка', 'Почтовый\\s+адрес\\s+доп\\.офиса'
].join('|');

// Захват значения после метки (на той же строке ИЛИ со следующей),
// до ближайшей следующей метки, которая может начинаться и после \n, и после , или ;
const capBlock = (norm, labelSrc) => {
  const re = new RegExp(
    `(?:^|[\\n,;])\\s*(?:${labelSrc})\\s*[:\\-]?\\s*([\\s\\S]*?)(?=(?:[\\n,;])\\s*(?:${NEXT_LABEL_SRC})|$)`,
    'i'
  );
  const m = norm.match(re);
  return m ? m[1].trim() : '';
};

// Если capBlock не сработал, взять следующую непустую строку после метки
const capNextNonEmptyLine = (norm, labelSrc) => {
  const re = new RegExp(`(?:^|\\n)\\s*(?:${labelSrc})\\s*[:\\-]?\\s*(?:\\n|$)([\\s\\S]*?)$`, 'i');
  const m = norm.match(re);
  if (!m) return '';
  const tail = m[1] || '';
  const line = (tail.split('\n').map((x) => x.trim()).find((x) => x.length > 0)) || '';
  return line;
};
// Захват после метки БЕЗ привязки к началу/переносу строки — до следующей метки или конца
const capInlineAfterLabel = (norm, labelSrc) => {
  const re = new RegExp(
    `${labelSrc}\\s*[:\\-]?\\s*([\\s\\S]*?)(?=(?:[\\n,;])\\s*(?:${NEXT_LABEL_SRC})|$)`,
    'i'
  );
  const m = norm.match(re);
  return m ? m[1].trim() : '';
};

export function extractBankDetailsFromText(raw) {
  const text = String(raw || '');
  const norm = text
    .replace(/\u00A0/g, ' ')      // неразрывные пробелы
    .replace(/\r\n?/g, '\n')      // CRLF -> LF
    .replace(/[ \t]+/g, ' ');     // схлопнуть табы/повторы пробелов

  const res = {
    recipientName: '',
    inn: '',
    kpp: '',
    bik: '',
    account: '',
    correspondentAccount: '',
    bankName: '',
  };

  // 1) Получатель (метки + переносы)
  res.recipientName =
    capBlock(norm, '(?:Получатель|Бенефициар|Beneficiary)') ||
    capNextNonEmptyLine(norm, '(?:Получатель|Бенефициар|Beneficiary)');
  // ФОЛБЭК: имя без метки в начале текста, до запятой или перед упоминанием счета
  if (!res.recipientName) {
    const m1 = norm.match(/^\s*([А-ЯЁ][а-яё'\-]+(?:\s+[А-ЯЁ][а-яё'\-]+){1,2})(?=\s*(?:,|$|\s+(?:л\/?сч|лицевой\s*сч(?:е|ё)т|номер\s*сч(?:е|ё)та|р\/?с|сч(?:е|ё)т\s*№)))/i);
    if (m1) res.recipientName = m1[1].trim();
  }
  // Фолбэк: метка может быть внутри строки (после запятой и т.п.)
  if (!res.recipientName) {
    res.recipientName = capInlineAfterLabel(norm, '(?:Получатель|Бенефициар|Beneficiary)');
  }
  // Нормализуем ФИО: аккуратно забрать 2–4 слова с заглавных букв (RU/EN)
  if (res.recipientName) {
    // сначала пробуем «Фамилия Имя Отчество/второе имя»
    const mFull = res.recipientName.match(/([А-ЯЁA-Z][\p{L}'\-]+(?:\s+[А-ЯЁA-Z][\p{L}'\-]+){1,3})(?!\S)/u);
    if (mFull) {
      res.recipientName = mFull[1].trim();
    } else {
      // запасной вариант: взять первые 2–3 слова
      const mShort = res.recipientName.match(/([А-ЯЁA-Z][\p{L}'\-]+(?:\s+[А-ЯЁA-Z][\p{L}'\-]+){1,2})/u);
      if (mShort) res.recipientName = mShort[1].trim();
    }
    res.recipientName = res.recipientName.replace(/[ ,;]+$/,'').trim();
  }

  // 2) Банк-получатель (строго банковские метки, чтобы не ловить «Почтовый адрес банка»)
  res.bankName = capBlock(
    norm,
    '(?:(?:(?:Наименование\\s+)?Банка?\\s+получателя)|Банк(?:-получатель)?|Bank(?:\\s+name)?)'
  ) || capNextNonEmptyLine(
    norm,
    '(?:(?:(?:Наименование\\s+)?Банка?\\s+получателя)|Банк(?:-получатель)?|Bank(?:\\s+name)?)'
  );

  // 3) БИК (основная маска — на любой позиции строки)
  {
    // «БИК», «БИК Банка получателя», допускаем до 100 символов мусора до цифр
    const re1 = /БИК(?:\s+Банка(?:\s+получателя)?)?[^0-9]{0,100}(\d[\d \-]{7,})/i;
    const re2 = /BIK[^0-9]{0,100}(\d[\d \-]{7,})/i;
    const m = norm.match(re1) || norm.match(re2);
    const bik = digits(m?.[1]).slice(0, 9);
    if (bik.length === 9) res.bik = bik;
  }

  // 4) ИНН (10/12), включая «ИНН Банка получателя» и «ИНН при необходимости»
  {
    const re1 = /ИНН(?:\s+Банка)?(?:\s+получателя)?(?:\s+при\s+необходимости)?[^0-9]{0,120}(\d[\d \-]{8,})/i;
    const re2 = /INN[^0-9]{0,120}(\d[\d \-]{8,})/i;
    const m = norm.match(re1) || norm.match(re2);
    const inn = digits(m?.[1]).slice(0, 12);
    if (inn.length === 10 || inn.length === 12) res.inn = inn;
  }

  // 5) КПП (9), включая «КПП Банка получателя» и «КПП при необходимости»
  {
    const re1 = /КПП(?:\s+Банка)?(?:\s+получателя)?(?:\s+при\s+необходимости)?[^0-9]{0,120}(\d[\d \-]{7,})/i;
    const re2 = /KPP[^0-9]{0,120}(\d[\d \-]{7,})/i;
    const m = norm.match(re1) || norm.match(re2);
    const kpp = digits(m?.[1]).slice(0, 9);
    if (kpp.length === 9) res.kpp = kpp;
  }

  // 6) Корр. счёт (20)
  {
    const re = /(?:^|\n)\s*(?:(?:К\/?С|КСС)|Корр\.?\s*сч(?:е|ё)т|Корреспондентский\s*сч(?:е|ё)т|кор\/?сч(?:е|ё)т(?:\s+банка)?|corr\.?\s*acc(?:ount)?)\s*[:№-]*\s*([0-9 \-]{20,})/i;
    const m = norm.match(re);
    const ks = digits(m?.[1]);
    if (ks.length === 20) res.correspondentAccount = ks;
  }

  // 7) Расчётный счёт (20): «Р/С», «Номер счёта», «Счет получателя ...»
  {
    const re = /(?:^|\n)\s*(?:(?:Р\/?С|Р\.?\s*с)|Расч(?:е|ё)тн[ао]й\s*сч(?:е|ё)т|Сч(?:е|ё)т\s*№|Номер\s*сч(?:е|ё)та|л\/?сч(?:е|ё)?\.?|лицевой\s*сч(?:е|ё)т|Account|Счет\s*получателя(?:\s*в\s*банке\s*получателя)?)\s*[:№-]*\s*([0-9 \-]{20,})/i;
    const m = norm.match(re);
    const rs = digits(m?.[1]);
    if (rs.length === 20) res.account = rs;
  }

  // 8) Эвристики
  // 8.1 Если не нашли счёта по меткам — подобрать любые 20-значные и распределить
  if (!res.account || !res.correspondentAccount) {
    const all20 = Array.from(norm.matchAll(/(?<!\d)(\d[\d \-]{19,})(?!\d)/g))
      .map((x) => digits(x[1]))
      .filter((x) => x.length === 20);

    for (const num of all20) {
      if (!res.correspondentAccount && /^301/.test(num)) { res.correspondentAccount = num; continue; }
      if (!res.account && /^(407|408|421|423|426)/.test(num)) { res.account = num; continue; }
    }
    for (const num of all20) {
      if (!res.account) { res.account = num; break; }
      if (!res.correspondentAccount && num !== res.account) { res.correspondentAccount = num; break; }
    }
  }

  // 8.2 Если есть К/С, но нет БИК — попытаться найти 9-значный БИК, оканчивающийся теми же 3 цифрами
  if (!res.bik && res.correspondentAccount && res.correspondentAccount.length === 20) {
    const last3 = res.correspondentAccount.slice(-3);
    const candidates = Array.from(norm.matchAll(/(?<!\d)(\d[\d \-]{8,})(?!\d)/g))
      .map((x) => digits(x[1]))
      .filter((x) => x.length === 9 && x.endsWith(last3));
    if (candidates.length > 0) {
      res.bik = candidates[0]; // берём первый подходящий
    }
  }

  return res;
}

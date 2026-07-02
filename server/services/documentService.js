const fs = require('fs');
const path = require('path');

const crypto = require('crypto');
const sanitizeHtml = require('sanitize-html');
const { diff_match_patch } = require('diff-match-patch');

const leaseTemplatePath = path.join(__dirname, '../templates/lease.html');
const maternityCapitalSharesTemplatePath = path.join(__dirname, '../templates/maternity-capital-shares.html');
const shareSaleNoticeTemplatePath = path.join(__dirname, '../templates/share-sale-notice.html');
const shareSaleNoticeStatementsTemplatePath = path.join(__dirname, '../templates/share-sale-notice-statements.html');
const shareSaleNoticeInventory107TemplatePath = path.join(__dirname, '../templates/share-sale-notice-inventory107.html');

// читаем файл всегда свежим
function readLeaseTemplateFile() {
  return fs.readFileSync(leaseTemplatePath, 'utf8');
}

// актуальная информация по файлу шаблона (для логов/заголовков)
function getLeaseTemplateInfo() {
  const resolved = path.resolve(leaseTemplatePath);
  const stat = fs.statSync(resolved);
  const raw = fs.readFileSync(resolved, 'utf8');
  const md5 = crypto.createHash('md5').update(raw, 'utf8').digest('hex');
  return { path: resolved, mtime: stat.mtime.toISOString(), md5 };
}

// публичная функция: отдать свежий шаблон и залогировать инфо
function getTemplatePathByType(docType = 'rent') {
  if (docType === 'maternity_capital_shares') return maternityCapitalSharesTemplatePath;
  if (docType === 'share_sale_notice') return shareSaleNoticeTemplatePath;
  if (docType === 'share_sale_notice_statements') return shareSaleNoticeStatementsTemplatePath;
  if (docType === 'share_sale_notice_inventory107') return shareSaleNoticeInventory107TemplatePath;
  return leaseTemplatePath;
}
  
function readTemplateFileByType(docType = 'rent') {
  const templatePath = getTemplatePathByType(docType);
  return fs.readFileSync(templatePath, 'utf8');
}

function getTemplateInfoByType(docType = 'rent') {
  const templatePath = getTemplatePathByType(docType);
  const resolved = path.resolve(templatePath);
  const stat = fs.statSync(resolved);
  const raw = fs.readFileSync(resolved, 'utf8');
  const md5 = crypto.createHash('md5').update(raw, 'utf8').digest('hex');
  return { path: resolved, mtime: stat.mtime.toISOString(), md5 };
}

function getFreshTemplate(docType = 'rent') {
  try {
    const html = readTemplateFileByType(docType);
    const info = getTemplateInfoByType(docType);
    console.log(`🧩 ${docType} template path:`, info.path);
    console.log(`🕒 ${docType} template mtime:`, info.mtime);
    console.log(`🔑 ${docType} template md5 :`, info.md5.slice(0, 12));
    return html;
  } catch (e) {
    console.error('[getFreshTemplate] read error:', e);
    return '';
  }
}

function getFreshLeaseTemplate() {
  try {
    const html = readLeaseTemplateFile();
    const info = getLeaseTemplateInfo();
    console.log('🧩 lease.html path:', info.path);
    console.log('🕒 lease.html mtime:', info.mtime);
    console.log('🔑 lease.html md5 :', info.md5.slice(0, 12));
    return html;
  } catch (e) {
    console.error('[getFreshLeaseTemplate] read error:', e);
    return '';
  }
}

// для совместимости, если где-то ещё импортируется
const rawLeaseTemplate = ''; // НЕ используем статическую версию

const LENGTH_VALUE = '(?:-?\\d+(?:\\.\\d+)?(?:px|em|rem|%)|0(?:px|em|rem|%)?)';
const lengthRegex = new RegExp(`^\\s*${LENGTH_VALUE}\\s*$`, 'i');
const lengthOrZeroRegex = lengthRegex;
const multiLengthRegex = new RegExp(`^\\s*${LENGTH_VALUE}(?:\\s+${LENGTH_VALUE}){0,3}\\s*$`, 'i');
const widthRegex = /^\s*(?:\d+(?:\.\d+)?(?:px|%)|auto)\s*$/i;
const colorRegex = /^\s*(?:#[0-9a-fA-F]{3,6}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))\s*$/;
const borderRegex = new RegExp(
  `^\\s*\\d+(?:\\.\\d+)?px\\s+(?:solid|dashed|dotted)\\s+(?:#[0-9a-fA-F]{3,6}|rgba?\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+(?:\\s*,\\s*(?:0|1|0?\\.\\d+))?\\s*\\))\\s*$`,
  'i'
);
const borderStyleRegex = /^\s*(?:solid|dashed|dotted|none)\s*$/i;
const alignRegex = /^\s*(?:left|right|center|justify)\s*$/i;

const allowedDiffTags = Array.from(new Set([
  ...sanitizeHtml.defaults.allowedTags,
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'colgroup',
  'col',
  'ins',
  'del'
]));

const allowedDiffAttributes = {
  '*': ['class'],
  a: ['href', 'name', 'target', 'rel', 'class'],
  p: ['style', 'class'],
  span: ['style', 'class'],
  div: ['style', 'class'],
  h1: ['style', 'class'],
  h2: ['style', 'class'],
  h3: ['style', 'class'],
  h4: ['style', 'class'],
  h5: ['style', 'class'],
  h6: ['style', 'class'],
  ul: ['style', 'class'],
  ol: ['style', 'class'],
  li: ['style', 'class'],
  table: ['style', 'class', 'border', 'cellpadding', 'cellspacing'],
  thead: ['style', 'class'],
  tbody: ['style', 'class'],
  tfoot: ['style', 'class'],
  tr: ['style', 'class'],
  td: ['style', 'class', 'colspan', 'rowspan'],
  th: ['style', 'class', 'colspan', 'rowspan'],
  colgroup: ['style', 'class', 'span'],
  col: ['style', 'class', 'span'],
  blockquote: ['style', 'class'],
  strong: ['style', 'class'],
  em: ['style', 'class'],
  ins: ['style', 'class'],
  del: ['style', 'class']
};

const allowedDiffStyles = {
  '*': {
    'text-align': [alignRegex],
    'text-indent': [lengthRegex],
    margin: [multiLengthRegex],
    'margin-left': [lengthRegex],
    'margin-right': [lengthRegex],
    'margin-top': [lengthRegex],
    'margin-bottom': [lengthRegex],
    padding: [multiLengthRegex],
    'padding-left': [lengthRegex],
    'padding-right': [lengthRegex],
    'padding-top': [lengthRegex],
    'padding-bottom': [lengthRegex]
  },
  table: {
    width: [widthRegex],
    'min-width': [widthRegex],
    border: [borderRegex],
    'border-width': [lengthOrZeroRegex],
    'border-style': [borderStyleRegex],
    'border-color': [colorRegex],
    'border-collapse': [/^\s*(?:collapse|separate)\s*$/i]
  },
  td: {
    width: [widthRegex],
    'min-width': [widthRegex],
    border: [borderRegex],
    'border-width': [lengthOrZeroRegex],
    'border-style': [borderStyleRegex],
    'border-color': [colorRegex],
    padding: [multiLengthRegex],
    'padding-left': [lengthRegex],
    'padding-right': [lengthRegex],
    'padding-top': [lengthRegex],
    'padding-bottom': [lengthRegex],
    'text-align': [alignRegex]
  },
  th: {
    width: [widthRegex],
    'min-width': [widthRegex],
    border: [borderRegex],
    'border-width': [lengthOrZeroRegex],
    'border-style': [borderStyleRegex],
    'border-color': [colorRegex],
    padding: [multiLengthRegex],
    'padding-left': [lengthRegex],
    'padding-right': [lengthRegex],
    'padding-top': [lengthRegex],
    'padding-bottom': [lengthRegex],
    'text-align': [alignRegex]
  },
  col: {
    width: [widthRegex],
    'min-width': [widthRegex]
  },
  colgroup: {
    width: [widthRegex],
    'min-width': [widthRegex]
  },
  span: {
    'background-color': [colorRegex]
  },
  ins: {
    'background-color': [colorRegex],
    'text-decoration': [/^\s*none\s*$/i]
  },
  del: {
    'background-color': [colorRegex],
    'text-decoration': [/^\s*none\s*$/i]
  }
};

const sanitizeDiffOptions = {
  allowedTags: allowedDiffTags,
  allowedAttributes: allowedDiffAttributes,
  allowedStyles: allowedDiffStyles,
  disallowedTagsMode: 'discard',
  textFilter: (text) => {
    // Удаляем мусорные текстовые узлы, оставшиеся от атрибутов таблиц после нормализации
    if (/border-collapse\s*:|min-width\s*:|colgroup>/i.test(text)) {
      return '';
    }
    return text;
  }
};

function sanitizeDiffHtml(html) {
  if (!html) return '';
  return sanitizeHtml(html, sanitizeDiffOptions);
}


/* ====================== Date and Sum Formatting ====================== */
function parseAnyDate(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  const toDate = (dd, mm, yyyy) => {
    const day = Number(dd);
    const month = Number(mm) - 1;
    const year = Number(yyyy);
    const d = new Date(year, month, day);
    if (
      Number.isNaN(d.getTime()) ||
      d.getFullYear() !== year ||
      d.getMonth() !== month ||
      d.getDate() !== day
    ) {
      return null;
    }
    return d;
  };

  const expandYear = (yy) => {
    const short = Number(yy);
    if (Number.isNaN(short)) return null;
    return short > 30 ? 1900 + short : 2000 + short;
  };
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) {
    return toDate(m[1], m[2], m[3]);
  }
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (m) {
    const expanded = expandYear(m[3]);
    if (expanded) return toDate(m[1], m[2], expanded);
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return toDate(m[3], m[2], m[1]);
  }

  const digits = s.replace(/\D/g, '');
  if (digits.length === 8) {
    return toDate(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8));
  }
  if (digits.length === 6) {
    const expanded = expandYear(digits.slice(4, 6));
    if (expanded) return toDate(digits.slice(0, 2), digits.slice(2, 4), expanded);
  }
 
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function formatDateLong(input) {
  const d = parseAnyDate(input);
  if (!d) return '';
  const months = [
    'января','февраля','марта','апреля','мая','июня',
    'июля','августа','сентября','октября','ноября','декабря'
  ];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = months[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd} ${mm} ${yyyy}`;
}

function formatDateShort(input) {
  const d = parseAnyDate(input);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

// Convert a number to a spaced string
function formatSpaced(num) {
  if (num === null || num === undefined || isNaN(num)) return '';
  return Number(num).toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
}
function pluralRu(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2]; // 11–19 → many
  if (b > 1 && b < 5)  return forms[1]; // 2,3,4 → few
  if (b === 1)         return forms[0]; // 1 → one
  return forms[2];                       // остальные → many
}

// Convert integer part of amount to Russian words (rubles only, no kopeks handling beyond "00 копеек")
function amountToWordsRu(n) {
  n = Math.floor(Number(n) || 0);
  const units = [
    ['рубль','рубля','рублей'],
    ['тысяча','тысячи','тысяч'],
    ['миллион','миллиона','миллионов'],
    ['миллиард','миллиарда','миллиардов']
  ];
  const onesMasculine = ['','один','два','три','четыре','пять','шесть','семь','восемь','девять'];
  const onesFeminine = ['','одна','две','три','четыре','пять','шесть','семь','восемь','девять'];
  const tens = ['','десять','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
  const teens = ['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать',
                 'шестнадцать','семнадцать','восемнадцать','девятнадцать'];
  const hundreds = ['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];

  function tripletToWords(triplet, feminine) {
    let str = '';
    const h = Math.floor(triplet / 100);
    const t = Math.floor((triplet % 100) / 10);
    const o = triplet % 10;
    if (h) str += (str ? ' ' : '') + hundreds[h];
    if (t > 1) {
      str += (str ? ' ' : '') + tens[t];
      if (o) str += ' ' + (feminine ? onesFeminine[o] : onesMasculine[o]);
    } else if (t === 1) {
      str += (str ? ' ' : '') + teens[o];
    } else if (o) {
      str += (str ? ' ' : '') + (feminine ? onesFeminine[o] : onesMasculine[o]);
    }
    return str;
  }
  function pluralForm(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  if (n === 0) return 'Ноль рублей 00 копеек';

  const parts = [];
  let unitIndex = 0;
  while (n > 0 && unitIndex < units.length) {
    const triplet = n % 1000;
    if (triplet !== 0) {
      const feminine = (unitIndex === 1); // thousands are feminine in Russian
      const words = tripletToWords(triplet, feminine);
      const unitWord = pluralForm(triplet, units[unitIndex]);
      parts.unshift((words ? (words + ' ') : '') + unitWord);
    }
    n = Math.floor(n / 1000);
    unitIndex++;
  }
  const capitalized = parts.join(' ').replace(/^./, c => c.toUpperCase());
  return `${capitalized} 00 копеек`;
}

function pluralize(n, forms) {
  n = Math.abs(Number(n)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

function formatAmountRu(amount) {
  if (amount == null || amount === '') return '';
  // парсим число: убираем пробелы и разрешаем запятую как разделитель
  const s = String(amount).replace(/\s/g, '').replace(',', '.');
  const num = Number(s);
  if (isNaN(num)) return String(amount);

  const rub = Math.trunc(num);
  const kop = Math.round((num - rub) * 100);
  const kop2 = String(isNaN(kop) ? 0 : kop).padStart(2, '0');

  const spacedRub = formatSpaced(rub);

  // amountToWordsRu(rub) даёт фразу вроде «Сорок тысяч рублей 00 копеек»
  // или «Сорок тысяч 00 копеек», если триплет рублей = 0.
  const wordsFull = amountToWordsRu(rub);
  // Оставляем только «Сорок тысяч» — срезаем «руб… 00 копеек» ИЛИ просто «00 копеек»
  const wordsOnly = String(wordsFull).replace(/\s*(?:руб(?:ль|ля|лей))?\s*00\s+копе(йка|йки|ек)$/i, '');

  const rubWord = pluralize(rub, ['рубль', 'рубля', 'рублей']);
  const kopWord = pluralize(kop2, ['копейка', 'копейки', 'копеек']);

  return `${spacedRub} (${wordsOnly}) ${rubWord} ${kop2} ${kopWord}`;
}



function asBool(val) {
  if (val === true || val === false) return val;
  if (val == null) return false;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    // Пустая строка, "false", "0", "no", "нет", "null", "undefined" -> false
    if (s === '' || s === 'false' || s === '0' || s === 'no' || s === 'нет' || s === 'null' || s === 'undefined') return false;
    return true;
  }
  return !!val;
}
// Разворачиваем data-repeat рекурсивно, с учётом контекста (ctx)
// ВАЖНО: сначала раскрываем вложенные repeat, потом подставляем плейсхолдеры текущего уровня,
// чтобы не затирать плейсхолдеры дочерних блоков пустыми значениями.
function expandRepeats(html, ctx, getBy) {
  if (!html) return html;
  const repeatRe = /<([a-z0-9-]+)([^>]*?)data-repeat="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/gsi;

  let out = String(html);
  let prev;
  do {
    prev = out;

    out = out.replace(repeatRe, (_m, tag, before, arrPath, after, innerTemplate) => {
      const raw = getBy(ctx, arrPath);
      // 1) Если в ЭТОМ контексте массива нет — не трогаем этот repeat (развернётся позже).
      if (!Array.isArray(raw)) {
        return _m;
      }

      const arr = raw;
      // 2) Если массив пуст — убираем блок
      if (arr.length === 0) return '';

      return arr.map((item) => {
        let chunk = innerTemplate;

        // 1) СНАЧАЛА раскрываем вложенные repeat относительно текущего item
        chunk = expandRepeats(chunk, item, getBy);

        // 2) Локальные условия (data-if) для текущего item
        chunk = applyDataIfAll(chunk, item, getBy);

        // 3) ТЕПЕРЬ подставляем плейсхолдеры текущего item
        // ph-chip — текст с форматами дат/сумм
        // стало (ph-chip: поддерживаем <span> и <div>)
        chunk = chunk.replace(
          /<(span|div)([^>]*?)class="([^"]*?\bph-chip\b[^"]*?)"([^>]*?)data-ph="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/gsi,
          (_m2, tagName, b1, cls, b2, key, b3) => {
            let v = getBy(item, key);
            if (key.endsWith('AmountFormatted')) {
              const baseKey = key.replace(/Formatted$/, '');
              const baseVal = getBy(item, baseKey);
              v = baseVal != null ? formatAmountRu(baseVal) : '';
            } else if (key.endsWith('Amount')) {
              v = formatAmountRu(v);
            } else if (key.endsWith('Date')) {
              v = formatDateLong(v || getBy(item, key));
            }
            return `<${tagName}${b1}${b2}${b3}>${v ?? ''}</${tagName}>`;
          }
        );

        // ph-raw — «как есть» (но те же форматы для дат/сумм)

        // стало (ph-raw: поддерживаем <span> и <div>)
        chunk = chunk.replace(
          /<(span|div)([^>]*?)class="([^"]*?\bph-raw\b[^"]*?)"([^>]*?)data-ph="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/gsi,
          (_m3, tagName, b1, cls, b2, key, b3) => {
            let v = getBy(item, key);
            if (key.endsWith('AmountFormatted')) {
              const baseKey = key.replace(/Formatted$/, '');
              const baseVal = getBy(item, baseKey);
              v = baseVal != null ? formatAmountRu(baseVal) : '';
            } else if (key.endsWith('Amount')) {
              v = formatAmountRu(v);
            } else if (key.endsWith('Date')) {
              v = formatDateLong(v || getBy(item, key));
            }
            return `<${tagName}${b1}${b2}${b3}>${v ?? ''}</${tagName}>`;
          }
        );

        // 4) Замораживаем обработанный блок: убираем data-if, чтобы родители не "переоценивали" его
        chunk = chunk.replace(/\sdata-if="[^"]*"/g, '');

        // Корневой тег repeat превращаем в div для валидности HTML
        const outTag = (String(tag).toLowerCase() === 'repeat') ? 'div' : tag;
        return `<${outTag}${before}${after}>${chunk}</${outTag}>`;
      }).join('');
    });

  } while (out !== prev);

  return out;
}



function applyDataIfAll(html, ctx, getBy) {
  if (!html) return html;
  const ifRe = /<([a-z0-9-]+)([^>]*?)data-if="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/gsi;
  let out = String(html);
  let prev;
  do {
    prev = out;
    out = out.replace(ifRe, (_m, tag, before, expr, after, inner) => {
      let e = String(expr || '').trim();
      let negate = false;
      if (e.toLowerCase().startsWith('not:')) {
        negate = true;
        e = e.slice(4).trim();
      }
      const eq = e.match(/^([a-z0-9_.]+)\s*==\s*'([^']*)'$/i);
      let keep;
      if (eq) {
        const leftVal = getBy(ctx, eq[1]);
        keep = String(leftVal) === eq[2];
      } else {
        const val = getBy(ctx, e);
        keep = asBool(val);
      }
      if (negate) keep = !keep;
      return keep ? `<${tag}${before}${after}>${inner}</${tag}>` : '';
    });
  } while (out !== prev);
  return out;
}

/* ====================== Rendering Template with Data ====================== */
/**
 * Render the final HTML by substituting placeholders in the template HTML with data.
 * Supports:
 *  - <span data-ph="..."></span> placeholders (with class "ph-chip" or "ph-raw")
 *  - Conditional blocks via data-if (with optional "not:" prefix or == 'value' condition)
 *  - Repeating blocks via data-repeat for arrays
 * After substitution, all data-* attributes and placeholder classes are removed.
 */
function renderFinalHtml(html, data = {}) {
  let out = String(html || '');

  // Локальный геттер путей — нужен и для глобальных плейсхолдеров, и для expandRepeats/applyDataIfAll
  const getByPath = (obj, path) => {
    if (!obj) return '';
    const parts = String(path).split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return '';
      if (Object.prototype.hasOwnProperty.call(cur, p)) {
        cur = cur[p];
      } else {
        return ''; // путь не найден — возвращаем пустую строку
      }
    }
    return (cur === undefined || cur === null) ? '' : cur;
  };

  // === 1) Разворачиваем ВСЕ data-repeat (рекурсивно, в нужном контексте) ===
  out = expandRepeats(out, data, getByPath);

  // === 2) Глобальная подстановка плейсхолдеров (<span class="ph-chip|ph-raw" data-ph="...">) ===
  // ph-chip — текст (с форматированием дат/сумм)
  // стало (ph-chip)
  out = out.replace(
    /<(span|div)([^>]*?)class="([^"]*?\bph-chip\b[^"]*?)"([^>]*?)data-ph="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/gsi,
    (_m, tagName, before, cls, mid, key, after, innerText) => {
      let val = getByPath(data, key);
      if (key.endsWith('Date')) {
        val = formatDateLong(val || getByPath(data, key));
      } else if (key.endsWith('AmountFormatted')) {
        const baseKey = key.replace(/Formatted$/, '');
        const baseVal = getByPath(data, baseKey);
        val = baseVal != null ? formatAmountRu(baseVal) : '';
      } else if (key.endsWith('Amount')) {
        val = formatAmountRu(val);
      }
      return `<${tagName}${before}class="${cls}"${mid}data-ph="${key}"${after}>${val ?? ''}</${tagName}>`;
    }
  );

  // стало (ph-raw)
  out = out.replace(
    /<(span|div)([^>]*?)class="([^"]*?\bph-raw\b[^"]*?)"([^>]*?)data-ph="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/gsi,
    (_m, tagName, before, cls, mid, key, after, inner) => {
      let val = getByPath(data, key);
      if (key.endsWith('Date')) {
        val = formatDateLong(val || getByPath(data, key));
      } else if (key.endsWith('AmountFormatted')) {
        const baseKey = key.replace(/Formatted$/, '');
        const baseVal = getByPath(data, baseKey);
        val = baseVal != null ? formatAmountRu(baseVal) : '';
      } else if (key.endsWith('Amount')) {
        val = formatAmountRu(val);
      }
      return `<${tagName}${before}class="${cls}"${mid}data-ph="${key}"${after}>${val ?? ''}</${tagName}>`;
    }
  );


  // === 3) Глобальные условия data-if (многошагово) ===
  out = applyDataIfAll(out, data, getByPath);

  // === 3.5) Safety: убрать любые неразвёрнутые repeat-блоки целиком ===
  out = out.replace(
    /<([a-z0-9-]+)([^>]*?)data-repeat="[^"]*"([^>]*)>([\s\S]*?)<\/\1>/gsi,
    ''
  );

  // === 4) Финальная очистка служебных атрибутов/классов ===
  out = out
    .replace(/\sdata-ph="[^"]*"/g, '')
    .replace(/\sdata-if="[^"]*"/g, '')
    .replace(/\sdata-repeat="[^"]*"/g, '')
    .replace(/\scontenteditable="[^"]*"/g, '')
    .replace(/\bph-chip\b/g, '')
    .replace(/\bph-raw\b/g, '');

  return out;
}


/* ====================== PDF Export via Puppeteer or PDF Library ====================== */
async function exportPdf(finalHtml) {
  if (!finalHtml || typeof finalHtml !== 'string') {
    throw new Error('exportPdf: empty finalHtml');
  }
  // Delegate actual PDF generation to pdfGenerator service
  const { exportHtmlToPdfBuffer } = require('./pdfGenerator');
  const pdfBuffer = await exportHtmlToPdfBuffer(finalHtml);
  if (!pdfBuffer || !pdfBuffer.length) {
    throw new Error('exportPdf: got empty PDF buffer from generator');
  }
  return pdfBuffer;
}

/* ====================== Versioning (Drafts) Stubs ====================== */
const _versionsStore = {};  // in-memory storage of document versions by id

function saveDraft(docId, html, changeNoteOrOptions) {
  const id = String(docId);
  if (!_versionsStore[id]) _versionsStore[id] = [];
  const versionList = _versionsStore[id];

  // Поддерживаем старый вызов (строкой) и новый (объектом)
  let note = '';
  let options = {};
  if (typeof changeNoteOrOptions === 'string' || changeNoteOrOptions == null) {
    note = changeNoteOrOptions || '';
  } else if (typeof changeNoteOrOptions === 'object') {
    options = changeNoteOrOptions || {};
    note = options.changeNote || '';
  }

  const newVersionId = versionList.length + 1;
  const versionEntry = {
    versionId: newVersionId,
    createdAt: new Date().toLocaleString(),
    html: html || '',
    note,
    ephemeral: !!options.ephemeral,
    expiresAt: options.expiresAt || null
  };
  versionList.push(versionEntry);
  return versionEntry;
}


async function listVersions(docId) {
  const id = String(docId);
  return _versionsStore[id] || [];
}

async function getVersion(docId, versionId) {
  const id = String(docId);
  const vId = String(versionId);
  const list = _versionsStore[id] || [];
  return list.find(v => String(v.versionId) === vId) || null;
}


async function deleteVersion(docId, versionId) {
  const id = String(docId);
  const vId = Number(versionId);

  if (!vId) {
    throw new Error('Некорректный идентификатор версии.');
  }

  const list = _versionsStore[id];
  if (!list || !list.length) {
    return false;
  }

  const idx = list.findIndex(v => v.versionId === vId);
  if (idx === -1) {
    return false;
  }

  list.splice(idx, 1);
  return true;
}

const CSS_LENGTH_PATTERN = '-?\\d+(?:\\.\\d+)?(?:px|pt|pc|in|mm|cm|em|rem|%)?';
const CSS_LENGTH_RE = new RegExp(`^${CSS_LENGTH_PATTERN}$`, 'i');
const CSS_MULTI_LENGTH_RE = new RegExp(`^${CSS_LENGTH_PATTERN}(\\s+${CSS_LENGTH_PATTERN}){0,3}$`, 'i');
const CSS_COLOR_PATTERN = '(?:#[0-9a-fA-F]{3,8}|rgba?\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+(?:\\s*,\\s*(?:0|0?\\.\\d+|1))?\\s*\\)|[a-z]+)';
const CSS_COLOR_RE = new RegExp(`^${CSS_COLOR_PATTERN}$`, 'i');
const CSS_BORDER_RE = new RegExp(`^(?:${CSS_LENGTH_PATTERN}\\s+)?(?:solid|dashed|dotted|double)\\s+${CSS_COLOR_PATTERN}$`, 'i');
const CSS_BORDER_SIMPLE_RE = new RegExp(`^${CSS_LENGTH_PATTERN}$`, 'i');
const CSS_BORDER_NONE_RE = /^(?:0|none)$/i;
const CSS_NUMBER_RE = /^-?\\d+(?:\\.\\d+)?$/;

async function buildDiff(docId, fromId, toId) {
  const fromVersionId = String(fromId).trim();
  const toVersionId = String(toId).trim();

  if (!fromVersionId || !toVersionId) {
    throw new Error('Не указаны версии "from" и "to" для сравнения.');
  }

  const [fromVersion, toVersion] = await Promise.all([
    getVersion(docId, fromVersionId),
    getVersion(docId, toVersionId)
  ]);

  if (!fromVersion) {
    throw new Error(`Версия ${fromId} не найдена для документа ${docId}.`);
  }
  if (!toVersion) {
    throw new Error(`Версия ${toId} не найдена для документа ${docId}.`);
  }

  const dmp = new diff_match_patch();
  const diff = dmp.diff_main(fromVersion.html || '', toVersion.html || '');
  dmp.diff_cleanupSemantic(diff);

  const diffHtml = diff.map(([op, text]) => {
    if (!text) return '';
    if (op === diff_match_patch.DIFF_INSERT) {
      return `<ins class="diff-ins">${text}</ins>`;
    }
    if (op === diff_match_patch.DIFF_DELETE) {
      return `<del class="diff-del">${text}</del>`;
    }
    return text;
  }).join('');

  const wrapped = `<div class="diff-report">${diffHtml || '<p class="diff-empty">Изменений не найдено.</p>'}</div>`;

  const html = sanitizeHtml(wrapped, {
    allowedTags: [
      'a', 'b', 'br', 'caption', 'col', 'colgroup', 'del', 'div', 'em', 'h1', 'h2', 'h3',
      'h4', 'h5', 'h6', 'hr', 'i', 'ins', 'li', 'ol', 'p', 's', 'span', 'strong', 'sub',
      'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
    ],
    allowedAttributes: {
      '*': ['class', 'data-hint', 'data-ph', 'data-slot'],
      a: ['href', 'name', 'target', 'rel'],
      table: ['class', 'border', 'cellpadding', 'cellspacing', 'width'],
      td: ['class', 'colspan', 'rowspan', 'width', 'align'],
      th: ['class', 'colspan', 'rowspan', 'width', 'align'],
      col: ['span', 'width'],
      colgroup: ['span', 'width'],
      div: ['class', 'data-slot', 'data-fallback'],
      span: ['class', 'data-hint', 'data-ph'],
      ins: ['class'],
      del: ['class']
    },
    allowedStyles: {
      '*': {
        'text-align': [/^(?:left|right|center|justify)$/i],
        'text-indent': [CSS_LENGTH_RE],
        'margin': [CSS_MULTI_LENGTH_RE],
        'margin-left': [CSS_LENGTH_RE],
        'margin-right': [CSS_LENGTH_RE],
        'margin-top': [CSS_LENGTH_RE],
        'margin-bottom': [CSS_LENGTH_RE],
        'padding': [CSS_MULTI_LENGTH_RE],
        'padding-left': [CSS_LENGTH_RE],
        'padding-right': [CSS_LENGTH_RE],
        'padding-top': [CSS_LENGTH_RE],
        'padding-bottom': [CSS_LENGTH_RE],
        'font-weight': [/^(?:normal|bold|bolder|lighter|\d{3})$/i],
        'font-style': [/^(?:normal|italic|oblique)$/i],
        'font-size': [CSS_LENGTH_RE],
        'line-height': [CSS_NUMBER_RE, CSS_LENGTH_RE, /^(?:normal)$/i],
        'color': [CSS_COLOR_RE],
        'background-color': [CSS_COLOR_RE],
        'text-transform': [/^(?:none|uppercase|lowercase|capitalize)$/i],
        'text-decoration': [/^(?:none|underline|line-through|overline)$/i],
        'white-space': [/^(?:normal|pre|pre-wrap|pre-line|nowrap)$/i],
        'vertical-align': [/^(?:baseline|bottom|middle|top|sub|super|text-bottom|text-top)$/i, CSS_LENGTH_RE],
        'list-style-type': [/^(?:disc|decimal|lower-alpha|upper-alpha|none)$/i],
        'list-style-position': [/^(?:inside|outside)$/i],
        'width': [CSS_LENGTH_RE],
        'min-width': [CSS_LENGTH_RE],
        'max-width': [CSS_LENGTH_RE],
        'height': [CSS_LENGTH_RE],
        'min-height': [CSS_LENGTH_RE],
        'max-height': [CSS_LENGTH_RE]
      },
      table: {
        'border': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-top': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-right': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-bottom': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-left': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-collapse': [/^(?:collapse|separate)$/i],
        'border-spacing': [CSS_MULTI_LENGTH_RE],
        'width': [CSS_LENGTH_RE],
        'min-width': [CSS_LENGTH_RE]
      },
      tr: {
        'border': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE]
      },
      td: {
        'border': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-top': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-right': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-bottom': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-left': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'padding': [CSS_MULTI_LENGTH_RE],
        'padding-left': [CSS_LENGTH_RE],
        'padding-right': [CSS_LENGTH_RE],
        'padding-top': [CSS_LENGTH_RE],
        'padding-bottom': [CSS_LENGTH_RE],
        'text-align': [/^(?:left|right|center|justify)$/i],
        'vertical-align': [/^(?:baseline|bottom|middle|top|sub|super|text-bottom|text-top)$/i]
      },
      th: {
        'border': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-top': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-right': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-bottom': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'border-left': [CSS_BORDER_RE, CSS_BORDER_SIMPLE_RE, CSS_BORDER_NONE_RE],
        'padding': [CSS_MULTI_LENGTH_RE],
        'padding-left': [CSS_LENGTH_RE],
        'padding-right': [CSS_LENGTH_RE],
        'padding-top': [CSS_LENGTH_RE],
        'padding-bottom': [CSS_LENGTH_RE],
        'text-align': [/^(?:left|right|center|justify)$/i],
        'vertical-align': [/^(?:baseline|bottom|middle|top|sub|super|text-bottom|text-top)$/i]
      },
      col: {
        'width': [CSS_LENGTH_RE],
        'min-width': [CSS_LENGTH_RE]
      },
      span: {
        'background-color': [CSS_COLOR_RE]
      }
    },
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto']
    },
    allowProtocolRelative: true
  });

  return { html };
}

function clearVersions(docId) {
  const id = String(docId);
  delete _versionsStore[id];
  return true;
}
// --- utils ---
function escapeHtmlUi(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function formatRubShortUi(v) {
  if (v == null || v === '') return '';
  const num = Number(String(v).replace(/\s+/g, '').replace(',', '.'));
  if (!isFinite(num)) return '';
  return num.toLocaleString('ru-RU') + ' руб.';
}

// --- Таблица «Описание квартиры» из массива apartmentDescription ---
function buildApartmentTableHtml(apartmentDescription = []) {
  const rows = (Array.isArray(apartmentDescription) ? apartmentDescription : []).map(r => {
    const name    = escapeHtmlUi(r?.name ?? '');
    const floor   = escapeHtmlUi(r?.floor ?? '');
    const walls   = escapeHtmlUi(r?.walls ?? '');
    const ceiling = escapeHtmlUi(r?.ceiling ?? '');
    const doors   = escapeHtmlUi(r?.doors ?? '');
    const windows = escapeHtmlUi(r?.windows ?? '');
    const state   = escapeHtmlUi(r?.state ?? '');
    return `
      <tr>
        <td>${name}</td>
        <td>${floor}</td>
        <td>${walls}</td>
        <td>${ceiling}</td>
        <td>${doors}</td>
        <td>${windows}</td>
        <td>${state}</td>
      </tr>`;
  }).join('');

  return `
    <table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse; width:100%;">
      <thead>
        <tr>
          <th>Помещение</th>
          <th>Пол</th>
          <th>Стены</th>
          <th>Потолок</th>
          <th>Двери</th>
          <th>Окна</th>
          <th>Состояние</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
}

// --- Таблица «Опись имущества» из массива inventory ---
/*
Ожидаем структуру:
inventory: [
  { id, name, base?:true, items: [{ name, state, price, note }] },
  ...
]
*/
function buildInventoryTableHtml(inventory = []) {
  const body = [];

  (Array.isArray(inventory) ? inventory : []).forEach(group => {
    const gName = escapeHtmlUi(group?.name ?? '');
    const items = Array.isArray(group?.items) ? group.items : [];

    if (gName) {
      body.push(`
        <tr>
          <td colspan="5" style="font-weight:bold; background:#f7f7f7;">${gName}</td>
        </tr>
      `);
    }

    if (items.length === 0) {
      // Пустая группа — покажем строку-заглушку (необязательно, можно удалить)
      // body.push(`<tr><td colspan="5" style="color:#888;">нет предметов</td></tr>`);
      return;
    }

    items.forEach(it => {
      const name  = escapeHtmlUi(it?.name ?? '');
      const state = escapeHtmlUi(it?.state ?? '');
      const note  = escapeHtmlUi(it?.note ?? '');
      const price = formatRubShortUi(it?.price ?? ''); // "1 000 руб."
      body.push(`
        <tr>
          <td>${gName ? name : escapeHtmlUi(name)}</td>
          <td>${state}</td>
          <td>${price}</td>
          <td>${note}</td>
        </tr>
      `);
    });
  });

  return `
    <table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse; width:100%;">
      <thead>
        <tr>
          <th>Помещение</th>
          <th>Состояние</th>
          <th>Оценочная стоимость</th>
          <th>Примечание</th>
        </tr>
      </thead>
      <tbody>
        ${body.join('')}
      </tbody>
    </table>`;
}

module.exports = {
  rawLeaseTemplate,
  renderFinalHtml,
  exportPdf,
  saveDraft,
  listVersions,
  getVersion,
  deleteVersion,
  buildDiff,
  getFreshLeaseTemplate,
  getFreshTemplate,
  getTemplateInfoByType,
  clearVersions,
  getLeaseTemplateInfo,
  buildApartmentTableHtml,
  buildInventoryTableHtml,
  sanitizeDiffHtml,
};

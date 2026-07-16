// server/services/docxGenerator.js
const htmlToDocx = require('html-to-docx');
const JSZip = require('jszip');
const { JSDOM } = require('jsdom');

const PAGE_BREAK_XML = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const PAGE_BREAK_PATTERNS = [
  'приложение №1',
  'приложение №2',
  'приложение №3',
  'расписка о получении денежных средств',
  'расписка о плучении денежных средств',
];

const EXPLICIT_PAGE_BREAK_MARKER = '__LEGAL_PORTAL_PAGE_BREAK__';

function replaceExplicitPageBreakMarkers(xml) {
  if (!xml || typeof xml !== 'string') return xml;

  const paragraphRegex = /<w:p\b[\s\S]*?<\/w:p>/gi;

  return xml.replace(paragraphRegex, paragraphXml => {
    if (!paragraphXml.includes(EXPLICIT_PAGE_BREAK_MARKER)) {
      return paragraphXml;
    }

    return PAGE_BREAK_XML;
  });
}

const DEFAULT_FONT_FAMILY = "'Times New Roman', Times, serif";
const DEFAULT_FONT_SIZE = '12pt';
const F107_FONT_SIZE = '7pt';
const DEFAULT_LINE_HEIGHT = '1';
const CM_TO_TWIPS = valueCm => Math.round((valueCm / 2.54) * 72 * 20);
const DOCX_PAGE_MARGINS = {
  top: CM_TO_TWIPS(2),
  bottom: CM_TO_TWIPS(2),
  left: CM_TO_TWIPS(3),
  right: CM_TO_TWIPS(1.5),
};
const DOCX_F107_PAGE_MARGINS = {
  top: CM_TO_TWIPS(0.6),
  bottom: CM_TO_TWIPS(0.6),
  left: CM_TO_TWIPS(0.6),
  right: CM_TO_TWIPS(0.6),
};
const isInventory107Doc = options => options?.docType === 'share_sale_notice_inventory107';

function decodeXmlEntities(text = '') {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function splitBrIntoParagraphs(container, document) {
  // Собираем новые <p>, разбивая по <br>
  const nodes = Array.from(container.childNodes);
  if (!nodes.length) return;

  let currentP = document.createElement('p');
  container.replaceChildren(); // очистим

  const pushCurrent = () => {
    if (!currentP) return;
    if (currentP.childNodes.length === 0) {
      // пуста строка -> всё равно абзац
      currentP.appendChild(document.createTextNode(''));
    }
    container.appendChild(currentP);
    currentP = document.createElement('p');
  };

  nodes.forEach(n => {
    if (n.nodeName === 'BR') {
      pushCurrent();
    } else {
      currentP.appendChild(n.cloneNode(true));
    }
  });
  pushCurrent();
}

function appendTextCell(document, row, text, colSpan = 1, className = '') {
  const cell = document.createElement('td');
  if (colSpan > 1) cell.setAttribute('colspan', String(colSpan));
  if (className) cell.setAttribute('class', className);
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  (lines.length ? lines : ['']).forEach(line => {
    const paragraph = document.createElement('p');
    paragraph.textContent = line;
    cell.appendChild(paragraph);
  });
  row.appendChild(cell);
  return cell;
}

function extractF107CopyData(copy) {
  const inventoryRows = Array.from(copy.querySelectorAll('table.inventory-107 tr'));
  const itemCells = Array.from(inventoryRows[1]?.querySelectorAll('td,th') || []);
  const totalCells = Array.from(inventoryRows[2]?.querySelectorAll('td,th') || []);
  const itemName = itemCells[1]
    ? Array.from(itemCells[1].querySelectorAll('p'))
      .map(node => (node.textContent || '').trim())
      .filter(Boolean)
      .join('\n') || itemCells[1].textContent || ''
    : '';
  const signatureText = Array.from(copy.querySelectorAll('.f107-signatures p'))
    .map(node => (node.textContent || '').trim())
    .filter(Boolean)
    .join('\n');

  return {
    header: Array.from(copy.querySelectorAll('.f107-header p, .f107-logo'))
      .map(node => (node.textContent || '').trim())
      .filter(Boolean)
      .join('\n') || 'ПОЧТА РОССИИ\nф. 107\nИзменения не допускаются',
    title: copy.querySelector('.f107-title')?.textContent || 'ОПИСЬ',
    mailId: copy.querySelector('.f107-mail-id')?.textContent || 'Идентификатор почтового отправления',
    itemName,
    itemCount: itemCells[2]?.textContent || '1',
    itemValue: itemCells[3]?.textContent || '1(один)',
    totalLabel: totalCells[0]?.textContent || 'Общий итог предметов и объявленной ценности',
    totalCount: totalCells[1]?.textContent || '1',
    totalValue: totalCells[2]?.textContent || '1(один)',
    signatureText,
  };
}

function buildF107DocxFlatSheet(document, sheet) {
  const copies = Array.from(sheet.querySelectorAll('.f107-copy')).slice(0, 2).map(extractF107CopyData);
  if (copies.length !== 2) return null;

  const table = document.createElement('table');
  table.setAttribute('class', 'f107-docx-flat-table');
  table.setAttribute('data-f107-docx-flat-table', 'true');

  const addDualWideRow = (leftText, rightText, className = '') => {
    const row = document.createElement('tr');
    appendTextCell(document, row, leftText, 4, className);
    appendTextCell(document, row, rightText, 4, className);
    table.appendChild(row);
  };

  addDualWideRow(
    `${copies[0].header}\n${copies[0].title}\n${copies[0].mailId}`,
    `${copies[1].header}\n${copies[1].title}\n${copies[1].mailId}`,
    'f107-docx-heading'
  );

  const headerRow = document.createElement('tr');
  ['№ п/п', 'Наименование предметов', 'Кол-во предметов', 'Объявленная ценность, руб']
    .concat(['№ п/п', 'Наименование предметов', 'Кол-во предметов', 'Объявленная ценность, руб'])
    .forEach(text => appendTextCell(document, headerRow, text, 1, 'f107-docx-table-header'));
  table.appendChild(headerRow);

  const itemRow = document.createElement('tr');
  [copies[0], copies[1]].forEach(copy => {
    appendTextCell(document, itemRow, '1', 1, 'f107-docx-num');
    appendTextCell(document, itemRow, copy.itemName, 1, 'f107-docx-name');
    appendTextCell(document, itemRow, copy.itemCount, 1, 'f107-docx-count');
    appendTextCell(document, itemRow, copy.itemValue, 1, 'f107-docx-value');
  });
  table.appendChild(itemRow);

  const totalRow = document.createElement('tr');
  [copies[0], copies[1]].forEach(copy => {
    appendTextCell(document, totalRow, copy.totalLabel, 2, 'f107-docx-total');
    appendTextCell(document, totalRow, copy.totalCount, 1, 'f107-docx-count');
    appendTextCell(document, totalRow, copy.totalValue, 1, 'f107-docx-value');
  });
  table.appendChild(totalRow);

  addDualWideRow(copies[0].signatureText, copies[1].signatureText, 'f107-docx-signatures');

  return table;
}

function flattenF107SheetsForDocx(document) {
  const sheets = Array.from(document.querySelectorAll('.f107-sheet'));
  sheets.forEach((sheet, index) => {
    const flatTable = buildF107DocxFlatSheet(document, sheet);
    if (!flatTable) return;
    if (index < sheets.length - 1) {
      const breakParagraph = document.createElement('p');
      breakParagraph.textContent = EXPLICIT_PAGE_BREAK_MARKER;
      sheet.replaceWith(flatTable, breakParagraph);
      return;
    }
    sheet.replaceWith(flatTable);
  });
}

function normalizeForDocx(html, options = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html || ''}</body></html>`);
  const doc = dom.window.document;

  // 0) Удалим лишние атрибуты редактора
  doc.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  if (isInventory107Doc(options)) {
    flattenF107SheetsForDocx(doc);
  }

  // 1) Превратим одиночные текстовые DIV/SECTION в <p>
  Array.from(doc.querySelectorAll('div,section')).forEach(el => {
    if (el.tagName !== 'DIV' && el.tagName !== 'SECTION') return;

    // если внутри таблицы/списков/заголовков — не трогаем
    if (el.querySelector('table, thead, tbody, tr, td, th, ul, ol, h1, h2, h3, h4, h5, h6')) return;

    // если содержит <br> — сначала разрежем на <p> по <br>
    if (el.querySelector('br')) {
      splitBrIntoParagraphs(el, doc);
      return;
    }

    // если текст/inline — заменим на <p>
    const onlyInline = Array.from(el.childNodes).every(n => {
      if (n.nodeType === 3) return true; // текст
      if (n.nodeType === 1) {
        const tag = n.tagName.toLowerCase();
        return ['span','b','strong','i','em','u','s','sup','sub','a'].includes(tag);
      }
      return false;
    });
    if (onlyInline) {
      const p = doc.createElement('p');
      p.innerHTML = el.innerHTML;
      el.replaceWith(p);
    }
  });

  // 2) В корневом body: если есть <br> на верхнем уровне — разрежем в абзацы
  if (doc.body.querySelector(':scope > br')) {
    splitBrIntoParagraphs(doc.body, doc);
  }

  // 3) Заголовки — центр и жирный (инлайн + align)
  Array.from(doc.querySelectorAll('h1,h2')).forEach(h => {
    const prev = h.getAttribute('style') || '';
    h.setAttribute(
      'style',
      `${prev};text-align:center;font-weight:bold;margin:8pt 0 6pt 0;`.replace(/;;+/g,';')
    );
    h.setAttribute('align', 'center');
  });

  // 4) Абзацы — шрифт/кегль/интерлиньяж/отступ.
  // Важно: если у абзаца уже задан text-align:right/center/justify,
  // не перетираем его на justify. Это нужно для заявлений о продаже доли.
  Array.from(doc.querySelectorAll('p')).forEach(p => {
    const prev = p.getAttribute('style') || '';

    const alignMatch = prev.match(/text-align\s*:\s*(left|right|center|justify)/i);
    const existingAlign = alignMatch ? alignMatch[1].toLowerCase() : null;
    const finalAlign = existingAlign || 'justify';

    const hasFontFamily = /font-family\s*:/i.test(prev);
    const hasFontSize = /font-size\s*:/i.test(prev);
    const defaultFontSize = isInventory107Doc(options) ? F107_FONT_SIZE : DEFAULT_FONT_SIZE;
    const hasLineHeight = /line-height\s*:/i.test(prev);
    const hasMargin = /margin\s*:/i.test(prev);
    const defaultMargin = isInventory107Doc(options) ? 'margin:0 0 1pt 0' : 'margin:6pt 0';

    const additions = [
      existingAlign ? '' : `text-align:${finalAlign}`,
      hasFontFamily ? '' : `font-family:${DEFAULT_FONT_FAMILY}`,
      hasFontSize ? '' : `font-size:${defaultFontSize}`,
      hasLineHeight ? '' : `line-height:${DEFAULT_LINE_HEIGHT}`,
      hasMargin ? '' : defaultMargin,
    ].filter(Boolean).join(';');

    p.setAttribute(
      'style',
      `${prev};${additions};`.replace(/;;+/g, ';')
    );

    p.setAttribute('align', finalAlign);
  });

  // 5) Списки — шрифт/кегль
  Array.from(doc.querySelectorAll('ul,ol,li')).forEach(el => {
    const prev = el.getAttribute('style') || '';
    el.setAttribute(
      'style',
      `${prev};font-family:${DEFAULT_FONT_FAMILY};font-size:${isInventory107Doc(options) ? F107_FONT_SIZE : DEFAULT_FONT_SIZE};line-height:${DEFAULT_LINE_HEIGHT};`.replace(/;;+/g,';')
    );
  });

  // 6) Таблицы — базово
  const tables = Array.from(doc.querySelectorAll('table'));
  const cells = Array.from(doc.querySelectorAll('td,th'));
  tables.forEach(t => {
    const prev = t.getAttribute('style') || '';
    t.setAttribute(
      'style',
      `${prev};border-collapse:collapse;font-family:${DEFAULT_FONT_FAMILY};font-size:${isInventory107Doc(options) ? F107_FONT_SIZE : DEFAULT_FONT_SIZE};line-height:${DEFAULT_LINE_HEIGHT};border:none;`.replace(/;;+/g,';')
    );
    t.removeAttribute('border');
  });
  cells.forEach(c => {
    const prev = c.getAttribute('style') || '';
    const padding = isInventory107Doc(options) ? 'padding:1pt 1.5pt' : 'padding:3pt 4pt';
    c.setAttribute(
      'style',
      `${prev};font-family:${DEFAULT_FONT_FAMILY};font-size:${isInventory107Doc(options) ? F107_FONT_SIZE : DEFAULT_FONT_SIZE};line-height:${DEFAULT_LINE_HEIGHT};border:none;${padding};`.replace(/;;+/g,';')
    );
  });
  
  const isSignatureTable = table => {
    if (!table) return false;

    const text = (table.textContent || '').toLowerCase();
    if (!text) return false;

    if (text.includes('подпис')) return true;
    if (text.includes('фамилия имя отчество') && text.includes('подп')) return true;

    const cellTexts = Array.from(table.querySelectorAll('td,th')).map(cell =>
      (cell.textContent || '').toLowerCase()
    );

    const hasRoleCell = cellTexts.some(t =>
      ['наймодат', 'нанимател', 'арендодат', 'арендатор'].some(role => t.includes(role))
    );
    const hasUnderline = cellTexts.some(t => /_{4,}/.test(t));

    if (hasRoleCell && hasUnderline) return true;

    return /_{6,}/.test(text);
  };

  const shouldKeepBorders = table => {
    if (!table) return false;
    if (table.closest('[data-slot="inventoryHtml"]')) return true;
    if (table.closest('[data-slot="apartmentHtml"]')) return true;
    const tableText = table.textContent || '';
    if (tableText.includes('№ п/п') && tableText.includes('Наименование предметов') && tableText.includes('Объявленная ценность')) return true;

    const heading = findNearestHeading(table);
    if (!heading) return false;
    const text = heading.textContent || '';
    return /Приложение\s*№\s*(1|2)/i.test(text);
  };

  tables.forEach(table => {
    const keep = !isSignatureTable(table) && shouldKeepBorders(table);
    const style = table.getAttribute('style') || '';
    const updated = keep
      ? `${style};border:1px solid #000;`
      : `${style};border:none;`;
    table.setAttribute('style', updated.replace(/;;+/g, ';'));

    Array.from(table.querySelectorAll('td,th')).forEach(cell => {
      const cellStyle = cell.getAttribute('style') || '';
      const cellUpdated = keep
        ? `${cellStyle};border:1px solid #000;`
        : `${cellStyle};border:none;`;
      cell.setAttribute('style', cellUpdated.replace(/;;+/g, ';'));
    });
  })

  // DEBUG: посчитаем параграфы/заголовки после нормализации
  const pCount  = doc.querySelectorAll('p').length;
  const hCount  = doc.querySelectorAll('h1, h2').length;
  console.log(`[DOCX normalize] p:${pCount} h:${hCount}`);

  return doc.body.innerHTML;
}

function findNearestHeading(element) {
  if (!element) return null;
  let current = element;
  while (current) {
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (/^H[1-6]$/i.test(sibling.tagName)) {
        return sibling;
      }
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }
  return null;
}

function wrapHtmlForDocx(html, options = {}) {
  const bodyMatch = String(html || '').match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyInner = bodyMatch ? bodyMatch[1] : String(html || '');
  const normalized = normalizeForDocx(bodyInner, options);

  const page = `
    <div style="
      box-sizing:border-box;
      margin:0;
      padding:0;
      font-family:${DEFAULT_FONT_FAMILY};
      font-size:${isInventory107Doc(options) ? F107_FONT_SIZE : DEFAULT_FONT_SIZE};
      line-height:${DEFAULT_LINE_HEIGHT};
      color:#000;
      text-align:justify;
    ">
      ${normalized}
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>
<body>${page}</body>
</html>`;
}

function ensureNodeBuffer(output) {
  if (Buffer.isBuffer(output)) return output;
  if (output instanceof Uint8Array) return Buffer.from(output);
  if (output instanceof ArrayBuffer) return Buffer.from(new Uint8Array(output));
  if (output?.buffer instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(output.buffer));
  }
  return Buffer.from(String(output ?? ''), 'binary');
}

function ensureDocxMargins(xml, margins = DOCX_PAGE_MARGINS) {
  if (!xml || typeof xml !== 'string') return xml;

  const marginEntries = Object.entries(margins);
  const pgMarRegex = /<w:pgMar\b[^>]*\/?>(?:<\/w:pgMar>)?/gi;

  const applyAttributes = match => {
    let result = match;
    const headerFooterAttrs = {
      header: '720',
      footer: '720',
      gutter: '0',
    };

    marginEntries.forEach(([key, value]) => {
      const attrRegex = new RegExp(`w:${key}="[^"]*"`, 'i');
      if (attrRegex.test(result)) {
        result = result.replace(attrRegex, `w:${key}="${value}"`);
      } else {
        result = result.replace(/<w:pgMar\b/i, found => `${found} w:${key}="${value}"`);
      }
    });

    Object.entries(headerFooterAttrs).forEach(([key, value]) => {
      const attrRegex = new RegExp(`w:${key}="[^"]*"`, 'i');
      if (attrRegex.test(result)) {
        result = result.replace(attrRegex, `w:${key}="${value}"`);
      } else {
        result = result.replace(/<w:pgMar\b/i, found => `${found} w:${key}="${value}"`);
      }
    });
    return result;
  };

  const hasPgMar = /<w:pgMar\b/i.test(xml);
  let updated = hasPgMar ? xml.replace(pgMarRegex, applyAttributes) : xml;

  if (hasPgMar) {
    return updated;
  }

  const attrs = marginEntries.map(([key, value]) => `w:${key}="${value}"`).join(' ');
  const marginTag = `<w:pgMar ${attrs} w:header="720" w:footer="720" w:gutter="0"/>`;

  const sectPrBlockRegex = /<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/gi;
  const sectPrSelfClosingRegex = /<w:sectPr\b[^>]*\/>/gi;

  if (sectPrBlockRegex.test(updated)) {
    updated = updated.replace(sectPrBlockRegex, block => {
      if (/<w:pgMar\b/i.test(block)) return block;
      return block.replace(/<w:sectPr\b[^>]*>/i, opener => `${opener}${marginTag}`);
    });
    return updated;
  }

  if (sectPrSelfClosingRegex.test(updated)) {
    updated = updated.replace(sectPrSelfClosingRegex, match => {
      const openTag = match.replace(/\/>$/, '>');
      return `${openTag}${marginTag}</w:sectPr>`;
    });
    return updated;
  }

  return updated;
}


// Единый параграф-разрыв (готовая вставка)
const PAGE_BREAK_P = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

// Достаём видимый текст из <w:t> внутри переданного фрагмента таблицы
function extractDocxText(xmlFragment) {
  // Собираем все <w:t>...</w:t>
  const texts = [];
  const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let m;
  while ((m = re.exec(xmlFragment))) {
    texts.push(m[1]);
  }
  // Простейшая «раскодировка» спецсимволов
  return texts
    .join(' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// УСЛОВИЕ «это таблица подписей»: есть Наймодатель И (Наниматель|Арендатор) И длинное подчёркивание
function isSignatureTable(tblXml) {
  const t = extractDocxText(tblXml).toLowerCase();

  // «наймодател…» (поймает наймодатель/наймодатели/наймодателя/и т.п.)
  const hasLandlord = /наймодател[ьяеию]/i.test(t);
  // «нанимател…» или «арендатор…»
  const hasTenant = /(нанимател[ьяеию]|арендатор[ауые]?)/i.test(t);
  // длинная линия подписи: 6+ подчёркиваний подряд
  const hasLongUnderline = /_{6,}/.test(t);

  return hasLandlord && hasTenant && hasLongUnderline;
}

// Вставляем page break СРАЗУ ПОСЛЕ каждой таблицы, удовлетворяющей isSignatureTable
function addBreakAfterEachSignatureTable(xml) {
  if (!xml) return xml;

  const tblRe = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  let out = '';
  let lastIndex = 0;
  let m;

  while ((m = tblRe.exec(xml))) {
    const tbl = m[0];
    const start = m.index;
    const end = m.index + tbl.length;

    out += xml.slice(lastIndex, end);

    if (isSignatureTable(tbl)) {
      // Проверка: нет ли уже сразу после таблицы разрыва
      const lookAhead = xml.slice(end, end + 400);
      const alreadyHasBreak = /<w:br[^>]*w:type="page"/i.test(lookAhead);
      if (!alreadyHasBreak) {
        out += PAGE_BREAK_P; // вставляем разрыв СРАЗУ ПОСЛЕ таблицы
      }
    }

    lastIndex = end;
  }

  // Хвост документа
  if (lastIndex === 0) return xml; // таблиц не было
  return out + xml.slice(lastIndex);
}




function extractTableText(tableXml) {
  if (!tableXml) return '';
  return decodeXmlEntities(
    Array.from(tableXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi))
      .map(match => match[1])
      .join(' ')
  );
}

function isSignatureTableByXml(tableXml) {
  const text = extractTableText(tableXml).toLowerCase();
  if (!text) return false;

  if (text.includes('подпис')) return true;
  if (text.includes('фамилия имя отчество') && text.includes('подп')) return true;
  if (/(наймодат|нанимател|арендодат|арендатор)/.test(text) && /_{4,}/.test(text)) return true;
  return /_{6,}/.test(text);
}

function extractParagraphsBefore(xml, index, count = 3) {
  const paragraphs = [];
  let searchIndex = index;

  while (paragraphs.length < count && searchIndex > 0) {
    const start = xml.lastIndexOf('<w:p', searchIndex - 1);
    if (start === -1) break;
    const end = xml.indexOf('</w:p>', start);
    if (end === -1) {
      break;
    }
    if (end >= index) {
      searchIndex = start - 1;
      continue;
    }
    const block = xml.slice(start, end + 6);
    const text = extractTableText(block).trim();
    if (text) {
      paragraphs.push(text);
    }
    searchIndex = start - 1;
  }

  return paragraphs;
}

function isF107TableByXml(tableXml) {
  const text = extractTableText(tableXml);
  return text.includes('№ п/п') && text.includes('Наименование предметов') && text.includes('Объявленная ценность');
}

function shouldKeepBordersForTable(xml, tableXml, tableIndex) {
  if (!tableXml) return false;

  if (isF107TableByXml(tableXml)) {
    return true;
  }

  if (isSignatureTableByXml(tableXml)) {
    return false;
  }

  const precedingParagraphs = extractParagraphsBefore(xml, tableIndex, 5);
  const heading = precedingParagraphs.find(text => /приложение\s*№/i.test(text));
  if (!heading) return false;
  return /приложение\s*№\s*(1|2)/i.test(heading);
}

function stripTableBorders(tableXml) {
  if (!tableXml) return tableXml;

  let updated = tableXml.replace(/<w:tblBorders[\s\S]*?<\/w:tblBorders>/gi, '');
  updated = updated.replace(/<w:tcBorders[\s\S]*?<\/w:tcBorders>/gi, '');
  // удалить пустые tcPr
  updated = updated.replace(/<w:tcPr\b[^>]*>\s*<\/w:tcPr>/gi, '');
  return updated;
}

function enforceTableBorders(xml) {
  if (!xml || typeof xml !== 'string') return xml;

  const tableRegex = /<w:tbl[\s\S]*?<\/w:tbl>/gi;
  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = tableRegex.exec(xml)) !== null) {
    const tableXml = match[0];
    const tableIndex = match.index;
    const keep = shouldKeepBordersForTable(xml, tableXml, tableIndex);
    const replacement = keep ? tableXml : stripTableBorders(tableXml);
    result += xml.slice(lastIndex, tableIndex) + replacement;
    lastIndex = tableIndex + tableXml.length;
  }

  if (lastIndex === 0) {
    return xml;
  }

  return result + xml.slice(lastIndex);
}

function ensureDocxLandscapeA4(xml) {
  if (!xml || typeof xml !== 'string') return xml;
  const pgSzTag = '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>';
  const pgSzRegex = /<w:pgSz\b[^>]*\/?>(?:<\/w:pgSz>)?/gi;
  if (/<w:pgSz\b/i.test(xml)) {
    return xml.replace(pgSzRegex, match => {
      let result = match;
      const attrs = { w: '16838', h: '11906', orient: 'landscape' };
      Object.entries(attrs).forEach(([key, value]) => {
        const attrRegex = new RegExp(`w:${key}="[^"]*"`, 'i');
        if (attrRegex.test(result)) result = result.replace(attrRegex, `w:${key}="${value}"`);
        else result = result.replace(/<w:pgSz\b/i, found => `${found} w:${key}="${value}"`);
      });
      return result;
    });
  }
  if (/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/i.test(xml)) {
    return xml.replace(/<w:sectPr\b[^>]*>/i, opener => `${opener}${pgSzTag}`);
  }
  return xml;
}

function upsertTblPrChild(tableXml, tagName, childXml) {
  const tblPrRegex = /<w:tblPr\b[^>]*>[\s\S]*?<\/w:tblPr>/i;
  const selfClosingTblPrRegex = /<w:tblPr\b[^>]*\/>/i;

  if (tblPrRegex.test(tableXml)) {
    return tableXml.replace(tblPrRegex, tblPr => {
      const childRegex = new RegExp(`<w:${tagName}\\b[\\s\\S]*?(?:<\\/w:${tagName}>|\\/>)`, 'i');
      if (childRegex.test(tblPr)) {
        return tblPr.replace(childRegex, childXml);
      }
      return tblPr.replace(/<\/w:tblPr>/i, `${childXml}</w:tblPr>`);
    });
  }

  if (selfClosingTblPrRegex.test(tableXml)) {
    return tableXml.replace(selfClosingTblPrRegex, `<w:tblPr>${childXml}</w:tblPr>`);
  }

  return tableXml.replace(/<w:tbl\b[^>]*>/i, match => `${match}<w:tblPr>${childXml}</w:tblPr>`);
}

function setTableGrid(tableXml, columnWidths) {
  const gridXml = `<w:tblGrid>${columnWidths.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`;
  if (/<w:tblGrid\b[\s\S]*?<\/w:tblGrid>/i.test(tableXml)) {
    return tableXml.replace(/<w:tblGrid\b[\s\S]*?<\/w:tblGrid>/i, gridXml);
  }
  return tableXml.replace(/<\/w:tblPr>/i, `</w:tblPr>${gridXml}`);
}

function setTableWidth(tableXml, width, type = 'dxa') {
  let updated = upsertTblPrChild(tableXml, 'tblW', `<w:tblW w:w="${width}" w:type="${type}"/>`);
  updated = upsertTblPrChild(updated, 'tblLayout', '<w:tblLayout w:type="fixed"/>');
  return updated;
}

function upsertTcPrChild(cellXml, tagName, childXml) {
  const tcPrRegex = /<w:tcPr\b[^>]*>[\s\S]*?<\/w:tcPr>/i;
  const selfClosingTcPrRegex = /<w:tcPr\b[^>]*\/>/i;

  if (tcPrRegex.test(cellXml)) {
    return cellXml.replace(tcPrRegex, tcPr => {
      const childRegex = new RegExp(`<w:${tagName}\\b[\\s\\S]*?(?:<\\/w:${tagName}>|\\/>)`, 'i');
      if (childRegex.test(tcPr)) {
        return tcPr.replace(childRegex, childXml);
      }
      return tcPr.replace(/<\/w:tcPr>/i, `${childXml}</w:tcPr>`);
    });
  }

  if (selfClosingTcPrRegex.test(cellXml)) {
    return cellXml.replace(selfClosingTcPrRegex, `<w:tcPr>${childXml}</w:tcPr>`);
  }

  return cellXml.replace(/<w:tc\b[^>]*>/i, match => `${match}<w:tcPr>${childXml}</w:tcPr>`);
}

function setCellWidth(cellXml, width) {
  return upsertTcPrChild(cellXml, 'tcW', `<w:tcW w:w="${width}" w:type="dxa"/>`);
}

function setCellBorders(cellXml, visible) {
  const borderValue = visible ? 'single' : 'nil';
  const borderSize = visible ? '4' : '0';
  const color = visible ? '000000' : 'auto';
  const bordersXml = [
    '<w:tcBorders>',
    `<w:top w:val="${borderValue}" w:sz="${borderSize}" w:space="0" w:color="${color}"/>`,
    `<w:left w:val="${borderValue}" w:sz="${borderSize}" w:space="0" w:color="${color}"/>`,
    `<w:bottom w:val="${borderValue}" w:sz="${borderSize}" w:space="0" w:color="${color}"/>`,
    `<w:right w:val="${borderValue}" w:sz="${borderSize}" w:space="0" w:color="${color}"/>`,
    '</w:tcBorders>',
  ].join('');
  return upsertTcPrChild(cellXml, 'tcBorders', bordersXml);
}

function setTableBorders(tableXml, visible) {
  const borderValue = visible ? 'single' : 'nil';
  const borderSize = visible ? '4' : '0';
  const color = visible ? '000000' : 'auto';
  const bordersXml = [
    '<w:tblBorders>',
    `<w:top w:val="${borderValue}" w:sz="${borderSize}" w:space="0" w:color="${color}"/>`,
    `<w:left w:val="${borderValue}" w:sz="${borderSize}" w:space="0" w:color="${color}"/>`,
    `<w:bottom w:val="${borderValue}" w:sz="${borderSize}" w:space="0" w:color="${color}"/>`,
    `<w:right w:val="${borderValue}" w:sz="${borderSize}" w:space="0" w:color="${color}"/>`,
    `<w:insideH w:val="${borderValue}" w:sz="${borderSize}" w:space="0" w:color="${color}"/>`,
    `<w:insideV w:val="${borderValue}" w:sz="${borderSize}" w:space="0" w:color="${color}"/>`,
    '</w:tblBorders>',
  ].join('');
  return upsertTblPrChild(tableXml, 'tblBorders', bordersXml);
}

function getTopLevelCellRanges(tableXml) {
  const ranges = [];
  const tagRegex = /<\/?w:(tbl|tc)\b[^>]*>/gi;
  const stack = [];
  let match;

  while ((match = tagRegex.exec(tableXml)) !== null) {
    const [, tagName] = match;
    const isClosing = match[0].startsWith('</');
    const entry = { tagName, index: match.index, end: tagRegex.lastIndex };

    if (!isClosing) {
      stack.push(entry);
      continue;
    }

    const opener = stack.pop();
    if (!opener || opener.tagName !== tagName) continue;

    const openTableDepth = stack.filter(item => item.tagName === 'tbl').length;
    if (tagName === 'tc' && openTableDepth === 1) {
      ranges.push({ start: opener.index, end: tagRegex.lastIndex });
    }
  }

  return ranges;
}

function applyCellWidths(tableXml, columnWidths, visibleBorders) {
  const ranges = getTopLevelCellRanges(tableXml);
  if (!ranges.length) return tableXml;

  let result = '';
  let lastIndex = 0;
  ranges.forEach((range, index) => {
    const width = columnWidths[index % columnWidths.length];
    let cellXml = tableXml.slice(range.start, range.end);
    cellXml = setCellWidth(cellXml, width);
    cellXml = setCellBorders(cellXml, visibleBorders);
    result += tableXml.slice(lastIndex, range.start) + cellXml;
    lastIndex = range.end;
  });

  return result + tableXml.slice(lastIndex);
}

function splitTableXml(tableXml) {
  const openMatch = tableXml.match(/^<w:tbl\b[^>]*>/i);
  if (!openMatch) return null;
  const closeTag = '</w:tbl>';
  if (!tableXml.toLowerCase().endsWith(closeTag)) return null;
  return {
    open: openMatch[0],
    inner: tableXml.slice(openMatch[0].length, -closeTag.length),
    close: tableXml.slice(-closeTag.length),
  };
}

function rewriteTopLevelTables(fragment, transformTable) {
  const tagRegex = /<\/?w:tbl\b[^>]*>/gi;
  let result = '';
  let lastIndex = 0;
  let depth = 0;
  let tableStart = -1;
  let match;

  while ((match = tagRegex.exec(fragment)) !== null) {
    const isClosing = match[0].startsWith('</');
    if (!isClosing) {
      if (depth === 0) tableStart = match.index;
      depth += 1;
      continue;
    }

    depth -= 1;
    if (depth === 0 && tableStart !== -1) {
      const tableEnd = tagRegex.lastIndex;
      result += fragment.slice(lastIndex, tableStart);
      result += transformTable(fragment.slice(tableStart, tableEnd));
      lastIndex = tableEnd;
      tableStart = -1;
    }
  }

  return result + fragment.slice(lastIndex);
}

function fixInventory107DocxTables(xml) {
  if (!xml || typeof xml !== 'string') return xml;

  const outerWidth = 16158;
  const outerCellWidths = [8079, 8079];
  const innerWidth = 7600;
  const innerCellWidths = [532, 4712, 912, 1444];

  const transformTable = tableXml => {
    const parts = splitTableXml(tableXml);
    if (!parts) return tableXml;

    const processedInner = rewriteTopLevelTables(parts.inner, transformTable);
    const hasNestedTables = /<w:tbl\b/i.test(processedInner);
    let updatedTable = `${parts.open}${processedInner}${parts.close}`;

    if (isF107TableByXml(updatedTable) && !hasNestedTables) {
      const directCellCount = getTopLevelCellRanges(updatedTable).length;
      const isFlatSheetTable = directCellCount > 8;
      const width = isFlatSheetTable ? outerWidth : innerWidth;
      const columnWidths = isFlatSheetTable
        ? [566, 5009, 970, 1534, 566, 5009, 970, 1534]
        : innerCellWidths;
      updatedTable = setTableWidth(updatedTable, width);
      updatedTable = setTableGrid(updatedTable, columnWidths);
      updatedTable = setTableBorders(updatedTable, true);
      updatedTable = applyCellWidths(updatedTable, columnWidths, true);
      return updatedTable;
    }

    if (hasNestedTables && isF107TableByXml(updatedTable)) {
      updatedTable = setTableWidth(updatedTable, outerWidth);
      updatedTable = setTableGrid(updatedTable, outerCellWidths);
      updatedTable = setTableBorders(updatedTable, false);
      updatedTable = applyCellWidths(updatedTable, outerCellWidths, false);
      return updatedTable;
    }

    return updatedTable;
  };

  return rewriteTopLevelTables(xml, transformTable);
}

async function enforceDocxPostProcessing(buffer, options = {}) {
  if (!buffer || !buffer.length) return buffer;

  try {
    const zip = await JSZip.loadAsync(buffer);

    // Гарантируем наличие word/numbering.xml (MS Word бывает капризным без него)
    const NUMBERING_PATH = 'word/numbering.xml';
    if (!zip.file(NUMBERING_PATH)) {
      const MIN_NUMBERING_XML =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>';
      zip.file(NUMBERING_PATH, MIN_NUMBERING_XML);
    }

    const documentEntry = zip.file('word/document.xml');
    if (!documentEntry) return buffer;

    const originalXml = await documentEntry.async('text');
    let updatedXml = originalXml;

    // 1) Поля/межстрочный/выравнивание
    updatedXml = ensureDocxMargins(updatedXml, isInventory107Doc(options) ? DOCX_F107_PAGE_MARGINS : DOCX_PAGE_MARGINS);
    if (isInventory107Doc(options)) {
      updatedXml = ensureDocxLandscapeA4(updatedXml);
    }

    // 1.1) Явные разрывы страниц из HTML-маркеров
    updatedXml = replaceExplicitPageBreakMarkers(updatedXml);

    // 2) Границы таблиц (убираем глобально, кроме ваших исключений — если в enforceTableBorders это уже учтено)
    updatedXml = enforceTableBorders(updatedXml);
    if (isInventory107Doc(options)) {
      updatedXml = fixInventory107DocxTables(updatedXml);
    }

    // 3) Разрывы страниц — ТОЛЬКО после таблиц с подписями сторон
    //    (таблица считается «подписной», если содержит роль Наймод/Арендод/Нанимат/Арендатор
    //     и длинную линию подчёркивания из 6+ символов)
    if (!isInventory107Doc(options)) {
      updatedXml = addBreakAfterEachSignatureTable(updatedXml);
    }

    if (updatedXml !== originalXml) {
      zip.file('word/document.xml', updatedXml);
      return await zip.generateAsync({ type: 'nodebuffer' });
    }
  } catch (err) {
    console.error('[DOCX postprocess] layout overrides failed:', err);
  }

  return buffer;
}



// ——— хелпер: гарантирует Override для numbering.xml ———
function ensureContentTypesHasNumbering(ctXml) {
  if (!ctXml) return ctXml;
  const hasOverride = /<Override[^>]+PartName="\/word\/numbering\.xml"[^>]*>/.test(ctXml);
  if (hasOverride) return ctXml;

  const overrideTag =
    '<Override PartName="/word/numbering.xml" ' +
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>';

  // вставим перед закрывающим </Types>
  return ctXml.replace(/<\/Types>\s*$/i, `${overrideTag}</Types>`);
}

async function exportHtmlToDocxBuffer(html, options = {}) {
  const wrapped = wrapHtmlForDocx(html, options);
  const htmlToDocxOptions = {
    page: {
      size: 'A4',
      orientation: isInventory107Doc(options) ? 'landscape' : 'portrait',
      margin: {
        top: (isInventory107Doc(options) ? DOCX_F107_PAGE_MARGINS : DOCX_PAGE_MARGINS).top,
        bottom: (isInventory107Doc(options) ? DOCX_F107_PAGE_MARGINS : DOCX_PAGE_MARGINS).bottom,
        left: (isInventory107Doc(options) ? DOCX_F107_PAGE_MARGINS : DOCX_PAGE_MARGINS).left,
        right: (isInventory107Doc(options) ? DOCX_F107_PAGE_MARGINS : DOCX_PAGE_MARGINS).right,
      },
    },
    font: 'Times New Roman',
    fontSize: isInventory107Doc(options) ? 7 : 12,
  };

  if (!isInventory107Doc(options)) {
    htmlToDocxOptions.table = { row: { cantSplit: true } };
  }

  const docxOutput = await htmlToDocx(wrapped, null, htmlToDocxOptions);

  const buffer = ensureNodeBuffer(docxOutput);
  return enforceDocxPostProcessing(buffer, options);
}

module.exports = { exportHtmlToDocxBuffer };

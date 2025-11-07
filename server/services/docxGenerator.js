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

const DEFAULT_FONT_FAMILY = "'Times New Roman', Times, serif";
const DEFAULT_FONT_SIZE = '12pt';
const DEFAULT_LINE_HEIGHT = '1';
const CM_TO_TWIPS = valueCm => Math.round((valueCm / 2.54) * 72 * 20);
const DOCX_PAGE_MARGINS = {
  top: CM_TO_TWIPS(2),
  bottom: CM_TO_TWIPS(2),
  left: CM_TO_TWIPS(3),
  right: CM_TO_TWIPS(1.5),
};

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

function normalizeForDocx(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html || ''}</body></html>`);
  const doc = dom.window.document;

  // 0) Удалим лишние атрибуты редактора
  doc.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));

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

  // 4) Абзацы — justify + шрифт/кегль/интерлиньяж/отступ (ИНЛАЙН + align)
  Array.from(doc.querySelectorAll('p')).forEach(p => {
    const prev = p.getAttribute('style') || '';
    p.setAttribute(
      'style',
      `${prev};text-align:justify;font-family:${DEFAULT_FONT_FAMILY};font-size:${DEFAULT_FONT_SIZE};line-height:${DEFAULT_LINE_HEIGHT};margin:6pt 0;`.replace(/;;+/g,';')
    );
    p.setAttribute('align', 'justify');
  });

  // 5) Списки — шрифт/кегль
  Array.from(doc.querySelectorAll('ul,ol,li')).forEach(el => {
    const prev = el.getAttribute('style') || '';
    el.setAttribute(
      'style',
      `${prev};font-family:${DEFAULT_FONT_FAMILY};font-size:${DEFAULT_FONT_SIZE};line-height:${DEFAULT_LINE_HEIGHT};`.replace(/;;+/g,';')
    );
  });

  // 6) Таблицы — базово
  const tables = Array.from(doc.querySelectorAll('table'));
  const cells = Array.from(doc.querySelectorAll('td,th'));
  tables.forEach(t => {
    const prev = t.getAttribute('style') || '';
    t.setAttribute(
      'style',
      `${prev};border-collapse:collapse;font-family:${DEFAULT_FONT_FAMILY};font-size:${DEFAULT_FONT_SIZE};line-height:${DEFAULT_LINE_HEIGHT};border:none;`.replace(/;;+/g,';')
    );
    t.removeAttribute('border');
  });
  cells.forEach(c => {
    const prev = c.getAttribute('style') || '';
    c.setAttribute(
      'style',
      `${prev};font-family:${DEFAULT_FONT_FAMILY};font-size:${DEFAULT_FONT_SIZE};line-height:${DEFAULT_LINE_HEIGHT};border:none;padding:3pt 4pt;`.replace(/;;+/g,';')
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

function wrapHtmlForDocx(html) {
  const bodyMatch = String(html || '').match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyInner = bodyMatch ? bodyMatch[1] : String(html || '');
  const normalized = normalizeForDocx(bodyInner);

  const page = `
    <div style="
      box-sizing:border-box;
      margin:0;
      padding:0;
      font-family:${DEFAULT_FONT_FAMILY};
      font-size:${DEFAULT_FONT_SIZE};
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

function ensureDocxMargins(xml) {
  if (!xml || typeof xml !== 'string') return xml;

  const marginEntries = Object.entries(DOCX_PAGE_MARGINS);
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

function shouldKeepBordersForTable(xml, tableXml, tableIndex) {
  if (!tableXml) return false;

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

async function enforceDocxPostProcessing(buffer) {
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
    updatedXml = ensureDocxMargins(updatedXml);

    // 2) Границы таблиц (убираем глобально, кроме ваших исключений — если в enforceTableBorders это уже учтено)
    updatedXml = enforceTableBorders(updatedXml);

    // 3) Разрывы страниц — ТОЛЬКО после таблиц с подписями сторон
    //    (таблица считается «подписной», если содержит роль Наймод/Арендод/Нанимат/Арендатор
    //     и длинную линию подчёркивания из 6+ символов)
    updatedXml = addBreakAfterEachSignatureTable(updatedXml);

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

async function exportHtmlToDocxBuffer(html) {
  const wrapped = wrapHtmlForDocx(html);
  const CM_TO_TWIPS = valueCm => Math.round((valueCm / 2.54) * 72 * 20);
  
  const docxOutput = await htmlToDocx(wrapped, null, {
    table: { row: { cantSplit: true } },
    page: {
      size: 'A4',
      margin: {
        top: DOCX_PAGE_MARGINS.top,
        bottom: DOCX_PAGE_MARGINS.bottom,
        left: DOCX_PAGE_MARGINS.left,
        right: DOCX_PAGE_MARGINS.right,
      },
    },
    font: 'Times New Roman',
    fontSize: 12,
  });

  const buffer = ensureNodeBuffer(docxOutput);
  return enforceDocxPostProcessing(buffer);
}

module.exports = { exportHtmlToDocxBuffer };

const fs = require('fs');
const path = require('path');
const { fractionToRussianWords } = require('../../utils/fractionWordsRu');

let petrovich = null;
try {
  petrovich = require('petrovich');
} catch {
  try {
    petrovich = require(path.join(__dirname, '../../../client/node_modules/petrovich'));
  } catch {
    console.warn('[shareSaleNotice] Petrovich is not available, names will not be inflected.');
  }
}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const fullName = (person = {}) => text(person.fullName || person.name || [person.lastName, person.firstName, person.patronymic || person.middleName].map(text).filter(Boolean).join(' '));

const normalizeGender = (person = {}) => {
  const raw = text(person.gender || person.sex || person.display?.genderWord).toLowerCase();
  if (['female', 'f', 'ж', 'женский', 'женщина'].includes(raw)) return 'female';
  if (['male', 'm', 'м', 'мужской', 'мужчина'].includes(raw)) return 'male';
  const patronymic = text(person.patronymic || person.middleName || fullName(person).split(' ')[2]).toLowerCase();
  if (patronymic.endsWith('вна') || patronymic.endsWith('чна')) return 'female';
  return 'male';
};

const splitName = (name = '') => {
  const parts = text(name).split(' ').filter(Boolean);
  return { last: parts[0] || '', first: parts[1] || '', middle: parts.slice(2).join(' ') };
};

const inflectName = (personOrName, grammaticalCase = 'nominative') => {
  const name = typeof personOrName === 'string' ? personOrName : fullName(personOrName);
  if (!name || grammaticalCase === 'nominative' || !petrovich) return name;
  try {
    const parts = splitName(name);
    const gender = normalizeGender(typeof personOrName === 'string' ? { fullName: name } : personOrName);
    const engine = petrovich[gender] || petrovich.androgynous || petrovich.male;
    return [
      parts.last && engine.last?.[grammaticalCase]?.(parts.last),
      parts.first && engine.first?.[grammaticalCase]?.(parts.first),
      parts.middle && engine.middle?.[grammaticalCase]?.(parts.middle),
    ].filter(Boolean).join(' ') || name;
  } catch (e) {
    console.warn('[shareSaleNotice] Petrovich failed for', name, grammaticalCase, e.message);
    return name;
  }
};

const formatSellerTitleGenitive = (seller = {}) => inflectName(seller, 'genitive');
const formatRecipientDative = (coOwner = {}) => inflectName(coOwner, 'dative');
const formatPassport = (seller = {}) => text(seller.passport);

const parseDate = (input) => {
  const s = text(input);
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const ordinalDays = ['', 'первое','второе','третье','четвертое','пятое','шестое','седьмое','восьмое','девятое','десятое','одиннадцатое','двенадцатое','тринадцатое','четырнадцатое','пятнадцатое','шестнадцатое','семнадцатое','восемнадцатое','девятнадцатое','двадцатое','двадцать первое','двадцать второе','двадцать третье','двадцать четвертое','двадцать пятое','двадцать шестое','двадцать седьмое','двадцать восьмое','двадцать девятое','тридцатое','тридцать первое'];
const years = { 2023: 'две тысячи двадцать третьего', 2024: 'две тысячи двадцать четвертого', 2025: 'две тысячи двадцать пятого', 2026: 'две тысячи двадцать шестого', 2027: 'две тысячи двадцать седьмого', 2028: 'две тысячи двадцать восьмого', 2029: 'две тысячи двадцать девятого', 2030: 'две тысячи тридцатого' };
const formatDateLongWithYearWord = (input) => {
  const d = parseDate(input);
  if (!d) return text(input);
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()} года`;
};
const formatDateWordsForSignatureLine = (input) => {
  const d = parseDate(input);
  if (!d) return text(input);
  return `${ordinalDays[d.getDate()] || String(d.getDate())} ${months[d.getMonth()]} ${years[d.getFullYear()] || `${d.getFullYear()}`} года`;
};

const formatPriceNumber = (value) => {
  const numeric = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(numeric)) return text(value);
  return numeric.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, ' ');
};
const cleanPriceWords = (value) => {
  const raw = text(value)
    .replace(/\s+00\s+копеек\.?$/i, '')
    .replace(/\s+руб(?:ль|ля|лей)\.?$/i, '')
    .trim();

  const bracketMatch = raw.match(/\(([^()]+)\)/);
  if (bracketMatch?.[1]) {
    return bracketMatch[1].trim();
  }

  return raw;
};

const formatPriceForNotice = (saleTerms = {}) =>
  `${formatPriceNumber(saleTerms.price)} (${cleanPriceWords(saleTerms.priceWords)}) рублей 00 копеек`;
const formatSaleShare = (seller = {}) => {
  const share = text(seller.saleShare);
  const manualWords = text(seller.saleShareWords);
  const autoWords = fractionToRussianWords(share);
  const words = manualWords && manualWords !== share ? manualWords : autoWords;

  return words ? `${share} (${words})` : share;
};
const PAGE_BREAK_MARKER = '__LEGAL_PORTAL_PAGE_BREAK__';

const PAGE_BREAK_HTML = `<p style="page-break-before: always; break-before: page; mso-break-before: page; font-size:0; line-height:0; height:0; margin:0; color:transparent; overflow:hidden;">${PAGE_BREAK_MARKER}</p>`;

const paragraphHtml = (content, style = '') =>
  `<p${style ? ` style="${style}"` : ''}>${escapeHtml(content)}</p>`;
const emptyLineHtml = () =>
  '<p style="margin:0; line-height:1;">&nbsp;</p>';

const buildStatementParts = (formData = {}, shipment = {}) => {
  const seller = formData.seller || {};
  const saleTerms = formData.saleTerms || {};
  const object = formData.object || {};
  const gender = normalizeGender(seller);
  const objectKind = text(object.objectKindFromEgrn) || 'квартиру';
  const registeredWord = gender === 'female' ? 'зарегистрированной' : 'зарегистрированного';
  const consentWord = gender === 'female' ? 'согласна' : 'согласен';
  
  const recipientLine = `гр. ${formatRecipientDative(shipment.coOwner)},`;
  const addressLine = `по адресу: ${text(shipment.deliveryAddress?.address)}`;
  const fromLine = `от ${formatSellerTitleGenitive(seller)}, ${formatDateLongWithYearWord(seller.birthDate)} рождения, место рождения: ${text(seller.birthPlace)}, гражданство: Российская Федерация, пол: ${gender === 'female' ? 'женский' : 'мужской'}, паспорт ${formatPassport(seller)}, выданный ${text(seller.passportIssued)} ${formatDateLongWithYearWord(seller.issueDate)}, код подразделения ${text(seller.departmentCode)}, ${registeredWord} по адресу: ${text(seller.registration)}.`;

  const bodyParagraphs = [
    `Настоящим довожу до Вашего сведения, что продаю принадлежащие мне ${formatSaleShare(seller)} долей в праве общей долевой собственности на ${objectKind} по адресу: ${text(object.address)}., кадастровый номер: ${text(object.cadastralNumber)}, за ${formatPriceForNotice(saleTerms)}.`,
    'Согласно ст. 250 Гражданского кодекса РФ Вы имеете преимущественное право покупки указанной доли квартиры как участник общей долевой собственности, поэтому прошу Вас не позднее одного месяца со дня вручения Вам настоящего заявления сообщить мне о своем желании или об отказе (нотариально удостоверенным) приобрести указанную долю квартиры за вышеуказанную сумму.',
    'В случае неполучения ответа по истечении указанного срока принадлежащая мне доля квартиры будет продана.',
    `Отсрочить продажу, снизить цену или принять платеж в рассрочку не ${consentWord}.`,
    `${text(saleTerms.place)}, ${formatDateWordsForSignatureLine(saleTerms.date)}.`,
  ];
  
  return { recipientLine, addressLine, fromLine, bodyParagraphs };
};

const statementTextLines = (formData = {}, shipment = {}) => {
  const { recipientLine, addressLine, fromLine, bodyParagraphs } = buildStatementParts(formData, shipment);
  return [recipientLine, addressLine, fromLine, 'ЗАЯВЛЕНИЕ', ...bodyParagraphs];
};

const linesToHtml = (lines) => lines.map((line) => line ? `<p>${escapeHtml(line)}</p>` : '<p>&nbsp;</p>').join('');

const buildStatementHtml = (formData, shipment) => {
  const { recipientLine, addressLine, fromLine, bodyParagraphs } = buildStatementParts(formData, shipment);

  const headerStyle = 'text-align:right; margin:0 0 4pt 28%;';
  const headerFromStyle = 'text-align:right; margin:0 0 12pt 28%;';
  const titleStyle = 'text-align:center; font-weight:bold; margin:0 0 12pt;';
  const bodyStyle = 'text-align:justify; margin:0 0 8pt;';
  const signatureStyle = 'text-align:left; margin:0;';

  return [
    paragraphHtml(recipientLine, headerStyle),
    paragraphHtml(addressLine, headerStyle),
    paragraphHtml(fromLine, headerFromStyle),

    emptyLineHtml(),
    emptyLineHtml(),
    paragraphHtml('ЗАЯВЛЕНИЕ', titleStyle),

    ...bodyParagraphs.map((paragraph) => paragraphHtml(paragraph, bodyStyle)),

    emptyLineHtml(),
    emptyLineHtml(),
    `<p style="${signatureStyle}">________________________________________________________________________________</p>`,
  ].join('');
};

const buildStatementPlainText = (formData, shipment) => statementTextLines(formData, shipment).join('\n');

const getRussianPostLogoDataUri = () => {
  const logoPath = path.join(__dirname, '../../assets/russian-post-f107-logo.jpeg');
  if (!fs.existsSync(logoPath)) return '';
  const logo = fs.readFileSync(logoPath);
  return `data:image/jpeg;base64,${logo.toString('base64')}`;
};

const buildRussianPostLogoHtml = () => {
  const logoDataUri = getRussianPostLogoDataUri();
  const logoStyle = 'display:table-cell;width:34%;height:18pt;vertical-align:middle;font-weight:bold;font-size:7pt;';
  if (!logoDataUri) return `<div class="f107-logo f107-logo-fallback" style="${logoStyle}">ПОЧТА РОССИИ</div>`;
  return `<div class="f107-logo" style="${logoStyle}"><img src="${logoDataUri}" alt="Почта России" style="max-width:100%;max-height:18pt;display:block;"></div>`;
};

const F107_COPY_STYLE = 'width:100%;font-family:"Times New Roman",serif;font-size:6.6pt;line-height:1.05;color:#111;';
const F107_PARAGRAPH_STYLE = 'margin:0 0 1.5pt 0;font-family:"Times New Roman",serif;font-size:6.6pt;line-height:1.05;';
const F107_TABLE_STYLE = 'width:100%;border-collapse:collapse;table-layout:fixed;font-family:"Times New Roman",serif;font-size:6.4pt;line-height:1.05;';
const F107_CELL_BASE_STYLE = 'border:1px solid #111;padding:1.5pt;vertical-align:top;font-family:"Times New Roman",serif;font-size:6.4pt;line-height:1.05;';
const F107_HEADER_CELL_STYLE = `${F107_CELL_BASE_STYLE}text-align:center;font-weight:normal;`;
const F107_NUM_CELL_STYLE = `${F107_CELL_BASE_STYLE}width:7%;text-align:center;`;
const F107_NAME_CELL_STYLE = `${F107_CELL_BASE_STYLE}width:62%;`;
const F107_COUNT_CELL_STYLE = `${F107_CELL_BASE_STYLE}width:12%;text-align:center;`;
const F107_VALUE_CELL_STYLE = `${F107_CELL_BASE_STYLE}width:19%;text-align:center;`;
const F107_TOTAL_CELL_STYLE = `${F107_CELL_BASE_STYLE}text-align:left;`;
const F107_SHEET_STYLE = 'width:100%;page-break-after:always;break-after:page;margin:0;padding:0;';
const F107_SHEET_TABLE_STYLE = 'width:100%;table-layout:fixed;border-collapse:separate;border-spacing:4mm 0;border:none;page-break-after:always;break-after:page;';
const F107_SHEET_CELL_STYLE = 'width:50%;vertical-align:top;border:none;padding:0;';

const buildInventory107CopyHtml = (formData, statementPlainText) => `
<section class="f107-copy inventory-copy">
  <div class="f107-header">
    ${buildRussianPostLogoHtml()}
    <div class="f107-header-text"><p>ф. 107</p><p>Изменения не допускаются</p></div>
  </div>
  <p class="f107-title" style="${F107_PARAGRAPH_STYLE}text-align:center;font-weight:bold;font-size:8pt;letter-spacing:.5pt;">ОПИСЬ</p>
  <p class="f107-mail-id" style="${F107_PARAGRAPH_STYLE}margin-bottom:2pt;">Идентификатор почтового отправления</p>
  <table class="inventory-107" data-f107-inventory-table="true" style="${F107_TABLE_STYLE}"><thead><tr><th style="${F107_HEADER_CELL_STYLE}width:7%;">№ п/п</th><th style="${F107_HEADER_CELL_STYLE}width:62%;">Наименование предметов</th><th style="${F107_HEADER_CELL_STYLE}width:12%;">Кол-во предметов</th><th style="${F107_HEADER_CELL_STYLE}width:19%;">Объявленная ценность, руб</th></tr></thead><tbody>
    <tr><td class="f107-num" style="${F107_NUM_CELL_STYLE}">1</td><td style="${F107_NAME_CELL_STYLE}"><p style="${F107_PARAGRAPH_STYLE}">Заявление следующего содержания:</p>${linesToHtml(statementPlainText.split('\n')).replace(/<p>/g, `<p style="${F107_PARAGRAPH_STYLE}">`)}</td><td class="f107-count" style="${F107_COUNT_CELL_STYLE}">1</td><td class="f107-value" style="${F107_VALUE_CELL_STYLE}">1(один)</td></tr>
    <tr><td colspan="2" style="${F107_TOTAL_CELL_STYLE}">Общий итог предметов и объявленной ценности</td><td class="f107-count" style="${F107_COUNT_CELL_STYLE}">1</td><td class="f107-value" style="${F107_VALUE_CELL_STYLE}">1(один)</td></tr>
  </tbody></table>
  <div class="f107-signatures" style="margin-top:3pt;">
    <p style="${F107_PARAGRAPH_STYLE}">Отправитель</p><p style="${F107_PARAGRAPH_STYLE}">ФИО, наименование юр. лица</p><p style="${F107_PARAGRAPH_STYLE}">${escapeHtml(fullName(formData.seller))}</p><p class="f107-sign-line" style="${F107_PARAGRAPH_STYLE}text-align:center;margin-top:4pt;">(подпись)</p>
    <p style="${F107_PARAGRAPH_STYLE}">Проверил</p><p style="${F107_PARAGRAPH_STYLE}">ФИО почтового работника</p><p style="${F107_PARAGRAPH_STYLE}">Оттиск КПШ</p><p style="${F107_PARAGRAPH_STYLE}">ОПС места приёма</p><p style="${F107_PARAGRAPH_STYLE}">Должность почтового работника</p><p class="f107-sign-line" style="${F107_PARAGRAPH_STYLE}text-align:center;margin-top:4pt;">(подпись почтового работника)</p>
  </div>
</section>`;

const buildInventory107SheetHtml = (formData, statementPlainText) => {
  const copyHtml = buildInventory107CopyHtml(formData, statementPlainText);
  return `
<section class="f107-sheet" style="${F107_SHEET_STYLE}">
  <table class="f107-sheet-table" data-f107-sheet-table="true" style="${F107_SHEET_TABLE_STYLE}"><tbody><tr>
    <td class="f107-sheet-cell" data-f107-sheet-cell="true" style="${F107_SHEET_CELL_STYLE}">${copyHtml}</td>
    <td class="f107-sheet-cell" data-f107-sheet-cell="true" style="${F107_SHEET_CELL_STYLE}">${copyHtml}</td>
  </tr></tbody></table>
</section>`;
};

const buildInventory107Html = buildInventory107CopyHtml;

const collectShipments = (coOwners = []) => {
  const shipments = [];
  coOwners.forEach((coOwner) => (coOwner.deliveryAddresses || []).forEach((deliveryAddress) => {
    if (deliveryAddress?.selected === true && text(deliveryAddress.address)) {
      shipments.push({ coOwner, deliveryAddress, index: shipments.length + 1 });
    }
  }));
  return shipments;
};

const buildShareSaleNoticePackageHtml = (formData, statements, inventories) => `
<h2>Раздел 1. Заявления сособственникам</h2>
${statements.map((item, index) => `${index ? PAGE_BREAK_HTML : ''}${item.html}`).join('')}
${PAGE_BREAK_HTML}
<h2>Раздел 2. Описи вложения ф. 107</h2>
${inventories.map((item) => item.html).join('')}`;

const buildStatementsOnlyHtml = (statements) =>
  statements
    .map((item, index) => `${index ? PAGE_BREAK_HTML : ''}${item.html}`)
    .join('');

const buildInventoriesOnlyHtml = (inventorySheets) => `
${inventorySheets.map((item) => item.html).join('')}
`;

const buildShareSaleNoticeRenderData = (formData = {}) => {
  const shipments = collectShipments(formData.coOwners || []);
  const statements = shipments.map((shipment) => {
    const plainText = buildStatementPlainText(formData, shipment);
    return { shipmentIndex: shipment.index, shipment, plainText, html: buildStatementHtml(formData, shipment) };
  });
  const inventories = statements.map((statement) => ({
    shipmentIndex: statement.shipmentIndex,
    html: buildInventory107SheetHtml(formData, statement.plainText),
  }));
  return {
    documentType: formData.documentType || 'share_sale_notice',
    packageHtml: buildShareSaleNoticePackageHtml(formData, statements, inventories),
    statementsHtml: buildStatementsOnlyHtml(statements),
    inventoriesHtml: buildInventoriesOnlyHtml(inventories),
    statements,
    inventories,
    shipments,
    object: formData.object || {},
    seller: formData.seller || {},
    saleTerms: formData.saleTerms || {},
    coOwners: formData.coOwners || [],
  };
};

module.exports = { escapeHtml, text, fullName, inflectName, formatSellerTitleGenitive, formatRecipientDative, formatPassport, formatDateLongWithYearWord, formatDateWordsForSignatureLine, formatPriceForNotice, formatSaleShare, buildStatementHtml, buildInventory107Html, buildInventory107CopyHtml, buildInventory107SheetHtml, buildInventoriesOnlyHtml, buildShareSaleNoticePackageHtml, buildShareSaleNoticeRenderData };
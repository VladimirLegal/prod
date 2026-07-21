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
  const logoStyle = 'display:inline-block;width:42mm;height:7mm;vertical-align:middle;font-family:Arial,sans-serif;font-weight:bold;font-size:7pt;';
  if (!logoDataUri) return `<div class="f107-logo f107-logo-fallback" style="${logoStyle}">ПОЧТА РОССИИ</div>`;
  return `<div class="f107-logo" style="${logoStyle}"><img src="${logoDataUri}" alt="Почта России" style="max-width:42mm;max-height:7mm;display:block;"></div>`;
};

const getF107StatementTypography = (statementPlainText = '') => {
  const length = String(statementPlainText).length;
  if (length <= 1600) return { fontSizePt: 6, lineHeight: 1.02 };
  if (length <= 1900) return { fontSizePt: 5.8, lineHeight: 1.02 };
  if (length <= 2200) return { fontSizePt: 5.6, lineHeight: 1.01 };
  if (length <= 2500) return { fontSizePt: 5.4, lineHeight: 1 };
  return { fontSizePt: 5.2, lineHeight: 1 };
};

const F107_COPY_STYLE = 'width:132.45mm;font-family:Arial,sans-serif;font-size:7pt;line-height:1.05;color:#111;';
const F107_PARAGRAPH_STYLE = 'margin:0 0 1pt 0;font-family:Arial,sans-serif;font-size:7pt;line-height:1.05;';
const F107_TABLE_STYLE = 'width:126mm;border-collapse:collapse;table-layout:fixed;font-family:Arial,sans-serif;font-size:7pt;line-height:1.05;border:1px solid #111;';
const F107_CELL_BASE_STYLE = 'border:1px solid #111;padding:1.2pt;vertical-align:top;font-family:Arial,sans-serif;font-size:7pt;line-height:1.05;';
const F107_HEADER_CELL_STYLE = `${F107_CELL_BASE_STYLE}text-align:center;font-weight:normal;`;
const F107_NUM_CELL_STYLE = `${F107_CELL_BASE_STYLE}width:8mm;text-align:center;`;
const F107_NAME_CELL_STYLE = `${F107_CELL_BASE_STYLE}width:70.5mm;overflow-wrap:normal;word-break:normal;white-space:normal;`;
const F107_COUNT_CELL_STYLE = `${F107_CELL_BASE_STYLE}width:23.4mm;text-align:center;`;
const F107_VALUE_CELL_STYLE = `${F107_CELL_BASE_STYLE}width:24.1mm;text-align:center;`;
const F107_TOTAL_CELL_STYLE = `${F107_CELL_BASE_STYLE}text-align:left;`;
const F107_SHEET_STYLE = 'width:271.43mm;break-inside:avoid;page-break-inside:avoid;margin:0 auto;padding:0;';
const F107_SHEET_TABLE_STYLE = 'width:271.43mm;table-layout:fixed;border-collapse:collapse;border:none;margin:0 auto;';
const F107_SHEET_LEFT_STYLE = 'width:132.45mm;vertical-align:top;border:none;padding:0;';
const F107_SHEET_GAP_STYLE = 'width:6.33mm;vertical-align:top;border:none;padding:0;';
const F107_SHEET_RIGHT_STYLE = 'width:132.64mm;vertical-align:top;border:none;padding:0;';
const F107_BORDERLESS_TABLE_STYLE = 'border-collapse:collapse;table-layout:fixed;border:none;font-family:Arial,sans-serif;';

const buildF107IdentifierTableHtml = () => `
<table class="f107-identifier-table" data-f107-table="identifier" style="width:70mm;${F107_BORDERLESS_TABLE_STYLE}margin:0 0 1.5mm 0;">
  <tbody><tr>${Array.from({ length: 14 }, () => '<td style="width:5mm;height:4.1mm;border:1px solid #111;padding:0;"></td>').join('')}</tr></tbody>
</table>`;

const buildF107SenderTableHtml = (sellerName) => `
<table class="f107-sender-table" data-f107-table="sender" style="width:126.4mm;${F107_BORDERLESS_TABLE_STYLE}margin-top:1.5mm;font-size:7pt;line-height:1.05;">
  <tbody><tr>
    <td style="width:82.8mm;border:none;padding:0;vertical-align:bottom;">
      <p style="${F107_PARAGRAPH_STYLE}">Отправитель</p>
      <p style="${F107_PARAGRAPH_STYLE}">ФИО, наименование юр. лица</p>
      <p style="${F107_PARAGRAPH_STYLE}border-bottom:1px solid #111;min-height:3.2mm;">${escapeHtml(sellerName)}</p>
      <p style="${F107_PARAGRAPH_STYLE}border-bottom:1px solid #111;min-height:3.2mm;">&nbsp;</p>
    </td>
    <td style="width:5mm;border:none;padding:0;"></td>
    <td style="width:38.6mm;border:none;padding:0;vertical-align:bottom;text-align:center;">
      <div style="height:8mm;border:1px solid #111;box-sizing:border-box;"></div>
      <p style="${F107_PARAGRAPH_STYLE}margin-top:.5mm;">(подпись)</p>
    </td>
  </tr></tbody>
</table>`;

const buildF107VerificationTableHtml = () => `
<table class="f107-verification-table" data-f107-table="verification" style="width:126.4mm;${F107_BORDERLESS_TABLE_STYLE}margin-top:.8mm;font-size:7pt;line-height:1.05;">
  <tbody><tr>
    <td style="width:82.8mm;border:none;padding:0;vertical-align:top;">
      <p style="${F107_PARAGRAPH_STYLE}">Проверил</p>
      <p style="${F107_PARAGRAPH_STYLE}">ФИО почтового работника</p>
      <p style="${F107_PARAGRAPH_STYLE}border-bottom:1px solid #111;min-height:2.8mm;">&nbsp;</p>
      <p style="${F107_PARAGRAPH_STYLE}border-bottom:1px solid #111;min-height:2.8mm;">&nbsp;</p>
      <p style="${F107_PARAGRAPH_STYLE}border-bottom:1px solid #111;min-height:2.8mm;">&nbsp;</p>
      <p style="${F107_PARAGRAPH_STYLE}">Должность почтового работника</p>
      <p style="${F107_PARAGRAPH_STYLE}border-bottom:1px solid #111;min-height:2.8mm;">&nbsp;</p>
      <p style="${F107_PARAGRAPH_STYLE}border-bottom:1px solid #111;min-height:2.8mm;">&nbsp;</p>
      <p style="${F107_PARAGRAPH_STYLE}border-bottom:1px solid #111;min-height:2.8mm;">&nbsp;</p>
      <div style="width:38.6mm;margin-left:auto;margin-top:1.9mm;text-align:center;">
        <div style="border-bottom:1px solid #111;min-height:3mm;"></div>
        <p style="${F107_PARAGRAPH_STYLE}">(подпись почтового работника)</p>
      </div>
    </td>
    <td style="width:5mm;border:none;padding:0;"></td>
    <td style="width:38.6mm;border:none;padding:0;vertical-align:top;text-align:center;padding-top:7.4mm;">
      <div style="height:24.5mm;border:1px solid #111;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding-bottom:1mm;">
        <p style="${F107_PARAGRAPH_STYLE}">Оттиск КПШ</p>
        <p style="${F107_PARAGRAPH_STYLE}">ОПС места приёма</p>
      </div>
    </td>
  </tr></tbody>
</table>`;

const buildInventory107CopyHtml = (formData, statementPlainText) => {
  const statementTypography = getF107StatementTypography(statementPlainText);
  const statementTextStyle = `margin:0 0 .5pt 0;font-family:Arial,sans-serif;font-size:${statementTypography.fontSizePt}pt;line-height:${statementTypography.lineHeight};white-space:pre-wrap;word-break:normal;overflow-wrap:break-word;`;
  const statementHtml = linesToHtml(statementPlainText.split('\n')).replace(/<p>/g, `<p style="${statementTextStyle}">`);
  return `
<section class="f107-copy inventory-copy" style="${F107_COPY_STYLE}">
  <div class="f107-header" style="width:126mm;margin:0 0 1mm 0;white-space:nowrap;">
    ${buildRussianPostLogoHtml()}
    <div class="f107-header-text" style="display:inline-block;width:84mm;text-align:right;vertical-align:top;"><p style="${F107_PARAGRAPH_STYLE}">ф. 107</p><p style="${F107_PARAGRAPH_STYLE}">Изменения не допускаются</p></div>
  </div>
  <p class="f107-title" style="${F107_PARAGRAPH_STYLE}width:126mm;text-align:center;font-weight:bold;font-size:14pt;line-height:1;letter-spacing:.5pt;">ОПИСЬ</p>
  <p class="f107-mail-id" style="${F107_PARAGRAPH_STYLE}margin-bottom:.5mm;">Идентификатор почтового отправления</p>
  ${buildF107IdentifierTableHtml()}
  <table class="inventory-107" data-f107-table="inventory" style="${F107_TABLE_STYLE}"><thead><tr><th style="${F107_HEADER_CELL_STYLE}width:8mm;font-size:8pt;">№ п/п</th><th style="${F107_HEADER_CELL_STYLE}width:70.5mm;font-size:8pt;">Наименование предметов</th><th style="${F107_HEADER_CELL_STYLE}width:23.4mm;font-size:8pt;">Кол-во предметов</th><th style="${F107_HEADER_CELL_STYLE}width:24.1mm;font-size:8pt;">Объявленная ценность, руб</th></tr></thead><tbody>
    <tr><td class="f107-num" style="${F107_NUM_CELL_STYLE}">1</td><td class="f107-name" style="${F107_NAME_CELL_STYLE}"><p style="${statementTextStyle}font-weight:bold;">Заявление следующего содержания:</p>${statementHtml}</td><td class="f107-count" style="${F107_COUNT_CELL_STYLE}">1</td><td class="f107-value" style="${F107_VALUE_CELL_STYLE}">1(один)</td></tr>
    <tr><td colspan="2" style="${F107_TOTAL_CELL_STYLE}">Общий итог предметов и объявленной ценности</td><td class="f107-count" style="${F107_COUNT_CELL_STYLE}">1</td><td class="f107-value" style="${F107_VALUE_CELL_STYLE}">1(один)</td></tr>
  </tbody></table>
  ${buildF107SenderTableHtml(fullName(formData.seller))}
  ${buildF107VerificationTableHtml()}
</section>`;
};

const buildInventory107SheetHtml = (formData, statementPlainText) => {
  const copyHtml = buildInventory107CopyHtml(formData, statementPlainText);
  return `
<section class="f107-sheet" style="${F107_SHEET_STYLE}">
  <table class="f107-sheet-table" data-f107-sheet-table="true" style="${F107_SHEET_TABLE_STYLE}"><tbody><tr>
    <td class="f107-sheet-cell f107-sheet-left" data-f107-sheet-cell="true" style="${F107_SHEET_LEFT_STYLE}">${copyHtml}</td>
    <td class="f107-sheet-gap" style="${F107_SHEET_GAP_STYLE}">&nbsp;</td>
    <td class="f107-sheet-cell f107-sheet-right" data-f107-sheet-cell="true" style="${F107_SHEET_RIGHT_STYLE}">${copyHtml}</td>
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

const buildInventoriesOnlyHtml = (inventorySheets) =>
  inventorySheets.map((item, index) => `${index ? PAGE_BREAK_HTML : ''}${item.html}`).join('');

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

module.exports = { escapeHtml, text, fullName, inflectName, formatSellerTitleGenitive, formatRecipientDative, formatPassport, formatDateLongWithYearWord, formatDateWordsForSignatureLine, formatPriceForNotice, formatSaleShare, getF107StatementTypography, buildStatementHtml, buildInventory107Html, buildInventory107CopyHtml, buildInventory107SheetHtml, buildInventoriesOnlyHtml, buildShareSaleNoticePackageHtml, buildShareSaleNoticeRenderData };
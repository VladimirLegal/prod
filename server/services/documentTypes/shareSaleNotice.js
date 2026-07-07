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
  if (!logoDataUri) return '<div class="f107-logo f107-logo-fallback">ПОЧТА РОССИИ</div>';
  return `<div class="f107-logo"><img src="${logoDataUri}" alt="Почта России"></div>`;
};

const buildInventory107CopyHtml = (formData, statementPlainText) => `
<section class="f107-copy inventory-copy">
  <div class="f107-header">
    ${buildRussianPostLogoHtml()}
    <div class="f107-header-text"><p>ф. 107</p><p>Изменения не допускаются</p></div>
  </div>
  <p class="f107-title">ОПИСЬ</p>
  <p class="f107-mail-id">Идентификатор почтового отправления</p>
  <table class="inventory-107"><thead><tr><th>№ п/п</th><th>Наименование предметов</th><th>Кол-во предметов</th><th>Объявленная ценность, руб</th></tr></thead><tbody>
    <tr><td class="f107-num">1</td><td><p>Заявление следующего содержания:</p>${linesToHtml(statementPlainText.split('\n'))}</td><td class="f107-count">1</td><td class="f107-value">1(один)</td></tr>
    <tr><td colspan="2">Общий итог предметов и объявленной ценности</td><td class="f107-count">1</td><td class="f107-value">1(один)</td></tr>
  </tbody></table>
  <div class="f107-signatures">
    <p>Отправитель</p><p>ФИО, наименование юр. лица</p><p>${escapeHtml(fullName(formData.seller))}</p><p class="f107-sign-line">(подпись)</p>
    <p>Проверил</p><p>ФИО почтового работника</p><p>Оттиск КПШ</p><p>ОПС места приёма</p><p>Должность почтового работника</p><p class="f107-sign-line">(подпись почтового работника)</p>
  </div>
</section>`;

const buildInventory107SheetHtml = (formData, statementPlainText) => {
  const copyHtml = buildInventory107CopyHtml(formData, statementPlainText);
  return `
<section class="f107-sheet">
  <table class="f107-sheet-table"><tbody><tr>
    <td class="f107-sheet-cell">${copyHtml}</td>
    <td class="f107-sheet-cell">${copyHtml}</td>
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
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const DEBUG_EGRN_PARSER = process.env.NODE_ENV === 'development' && process.env.REACT_APP_DEBUG_EGRN_PARSER === 'true';
const debugLog = (...args) => { if (DEBUG_EGRN_PARSER) console.info(...args); };

const getPdfText = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => item.str).join(' ');
    fullText += strings + '\n';
  }

  return fullText;
};


const cleanEgrnValue = (value = '') =>
  value
    .toString()
    .replace(/\s+/g, ' ')
    .replace(/^(?:—|-|:)+\s*/, '')
    .trim();

const pickLineValue = (text, label, stopLabels = []) => {
  const stops = stopLabels.length ? `|${stopLabels.join('|')}` : '';
  const re = new RegExp(`${label}\\s*:?\\s*([\\s\\S]*?)(?=${stops}|\\n|$)`, 'i');
  const match = text.match(re);
  return match ? cleanEgrnValue(match[1]) : '';
};

const extractValueBeforeLabel = (text = '', label = '') => {
  const m = text.match(new RegExp(`([А-Яа-яЁё0-9.,-]+)\\s+${label}`, 'i'));
  return m ? cleanEgrnValue(m[1]) : '';
};

const extractObjectMetaFromText = (text) => ({
  objectKindFromEgrn: pickLineValue(text, 'Вид объекта', [
    'Назначение',
    'Наименование',
    'Вид жилого помещения',
  ]) || extractValueBeforeLabel(text, 'Вид объекта'),
  purpose: (text.match(/Назначение\s+([^\s]+)(?=\s+Наименование|\s+Вид\s+жилого\s+помещения|$)/i)||[])[1] || pickLineValue(text, 'Назначение', ['Наименование','Вид жилого помещения','Площадь']),
  objectName: (text.match(/Наименование\s+([^\s]+)(?=\s+Вид\s+жилого\s+помещения|\s+Площадь|$)/i)||[])[1] || pickLineValue(text, 'Наименование', ['Вид жилого помещения','Площадь','Кадастровая стоимость']),
  residentialKind: (text.match(/Вид\s+жилого\s+помещения\s+([^\s]+)(?=\s+Кадастровая\s+стоимость|\s+Площадь|$)/i)||[])[1] || pickLineValue(text, 'Вид жилого помещения', ['Кадастровая стоимость','Площадь','Вид объекта']),
  cadastralValue: ((text.match(/Кадастровая\s+стоимость[^0-9]*([0-9]+(?:[.,][0-9]+)?)/i)||[])[1] || pickLineValue(text, 'Кадастровая стоимость', ['Статус записи','Дата внесения','Данные актуальны'])),
  recordStatus: pickLineValue(text, 'Статус записи', [
    'Данные актуальны',
    'Дата актуальности',
    'Особые отметки',
  ]),
  egrnActualDate: (
    text.match(/Данные\s+актуальны\s+на\s+([0-3]?\d\.[01]?\d\.\d{4})/i) ||
    text.match(/Дата\s+актуальности[^0-9]*([0-3]?\d\.[01]?\d\.\d{4})/i) ||
    []
  )[1] || '',
});

const DOCUMENT_START_PATTERN =
  '(?:' +
  [
    'Кредитный\\s+договор',
    'Договор',
    'Передаточный\\s+акт',
    'Акт\\s+при[её]ма-передачи(?:\\s+квартиры)?',
    'Разрешение',
    'Дополнительное\\s+соглашение',
    'Распоряжение',
    'Соглашение',
    'Свидетельство',
    'Справка',
  ].join('|') +
  ')';

const splitEgrnDocumentItems = (section = '') => {
  const source = cleanEgrnValue(section)
    .replace(/№\s*/g, '№ ')
    .replace(/\s*,\s*/g, ', ');

  if (!source) return [];

  const re = new RegExp(DOCUMENT_START_PATTERN, 'gi');
  const starts = [];
  let match;

  while ((match = re.exec(source)) !== null) {
    starts.push(match.index);
  }

  if (!starts.length) {
    return [source].filter(Boolean);
  }

  return starts
    .map((start, index) => {
      const end = starts[index + 1] ?? source.length;
      return cleanEgrnValue(source.slice(start, end));
    })
    .filter(Boolean);
};

const parseEgrnDocumentItem = (item = '') => {
  const dateMatches = [...String(item).matchAll(/([0-3]?\d\.[01]?\d\.\d{4})/g)];

  if (!dateMatches.length) return null;

  const lastDateMatch = dateMatches[dateMatches.length - 1];
  const docDate = lastDateMatch[1];

  const title = cleanEgrnValue(item.slice(0, lastDateMatch.index))
    .replace(/[,\s;]+$/g, '')
    .replace(/\s+,\s+/g, ', ')
    .replace(/№\s*/g, '№ ');

  if (!title) return null;

  return {
    title,
    number: '',
    docDate,
  };
};

const parseEgrnDocumentsFromSection = (section = '') => {
  return splitEgrnDocumentItems(section)
    .map(parseEgrnDocumentItem)
    .filter(Boolean);
};

const extractEncumbranceFromText = (text = '') => {
  const markerRe =
    /Ограничение\s+прав\s+и\s+обременение\s+(?:всего\s+)?объекта\s+недвижимости\s*:?\s*/gi;

  const blocks = [];
  let markerMatch;

  while ((markerMatch = markerRe.exec(text)) !== null) {
    const tail = text.slice(markerRe.lastIndex);

    const stopIndex = tail.search(
      /(?=Сведения\s+из\s+Росреестра|Данные\s+актуальны\s+на|Сертификат:|ДОКУМЕНТ\s+ПОДПИСАН|Лист\s+\d+\s+из\s+\d+|$)/i
    );

    const rawBlock = stopIndex >= 0 ? tail.slice(0, stopIndex) : tail;

    const block = cleanEgrnValue(rawBlock);

    if (block) {
      blocks.push(block);
    }
  }

  if (!blocks.length) {
    return {
      type: 'unknown',
      subtype: '',
      description: '',
      rawText: '',
      mortgagee: '',
      beneficiary: '',
      registrationNumber: '',
      registrationDate: '',
      term: '',
      basisDocuments: [],
    };
  }

  const description =
    blocks.find((block) => /ипотек|залог/i.test(block)) ||
    blocks.find((block) => !/не\s+зарегистрировано|не\s+зарегистрированы/i.test(block)) ||
    blocks[0];
  const rawText = description;

  if (/не\s+зарегистрировано|не\s+зарегистрированы|отсутств/i.test(description) && !/ипотек|залог/i.test(description)) {
    return {
      type: 'none',
      subtype: '',
      description: 'Не зарегистрировано',
      rawText,
      mortgagee: '',
      beneficiary: '',
      registrationNumber: '',
      registrationDate: '',
      term: '',
      basisDocuments: [],
    };
  }

  const isMortgage = /ипотек|залог/i.test(description);

  const registrationMatch = description.match(
    /(Ипотека\s+в\s+силу\s+закона|Ипотека|Залог)[^,]*,\s*([0-9:]{5,}-[0-9/:-]+),\s*([0-3]?\d\.[01]?\d\.\d{4})/i
  );

  const termMatch = description.match(
    /Срок,\s*на\s*который[\s\S]*?обременение\s+объекта\s+недвижимости\s*([\s\S]*?)(?=Лицо,\s*в\s*пользу\s*которого|Основание\s+государственной\s+регистрации|$)/i
  );

  const beneficiaryMatch = description.match(
    /Лицо,\s*в\s*пользу\s*которого[\s\S]*?обременение\s+объекта\s+недвижимости\s*([\s\S]*?)(?=Основание\s+государственной\s+регистрации|$)/i
  );

  const basisMatch = description.match(
    /Основание\s+государственной\s+регистрации\s*([\s\S]*?)$/i
  );

  const basisDocuments = parseEgrnDocumentsFromSection(basisMatch?.[1] || '');

  const beneficiary = cleanEgrnValue(beneficiaryMatch?.[1] || '').replace(/^"|"$/g, '');

  if (isMortgage) {
  const subtype = registrationMatch?.[1] || 'Ипотека';

    debugLog('🏦 Ипотека / обременение:', {
      subtype,
      registrationNumber: registrationMatch?.[2] || '',
      registrationDate: registrationMatch?.[3] || '',
      beneficiary,
      term: cleanEgrnValue(termMatch?.[1] || ''),
      basisDocuments,
      rawText,
    });

    return {
      type: 'mortgage', // внутренний технический код
      subtype, // человекочитаемый вид: "Ипотека в силу закона"
      description: subtype, // короткое описание для UI
      rawText, // полный сырой блок из ЕГРН сохраняем отдельно
      mortgagee: beneficiary,
      beneficiary,
      registrationNumber: registrationMatch?.[2] || '',
      registrationDate: registrationMatch?.[3] || '',
      term: cleanEgrnValue(termMatch?.[1] || ''),
      basisDocuments,
    };
  }

  if (/арест/i.test(description)) {
    return {
      type: 'arrest',
      subtype: 'Арест',
      description,
      rawText,
      mortgagee: '',
      beneficiary: '',
      registrationNumber: registrationMatch?.[2] || '',
      registrationDate: registrationMatch?.[3] || '',
      term: cleanEgrnValue(termMatch?.[1] || ''),
      basisDocuments,
    };
  }

  if (/запрет|запрещ/i.test(description)) {
    return {
      type: 'registration_ban',
      subtype: 'Запрет регистрационных действий',
      description,
      rawText,
      mortgagee: '',
      beneficiary: '',
      registrationNumber: registrationMatch?.[2] || '',
      registrationDate: registrationMatch?.[3] || '',
      term: cleanEgrnValue(termMatch?.[1] || ''),
      basisDocuments,
    };
  }

  return {
    type: 'other',
    subtype: '',
    description,
    rawText,
    mortgagee: beneficiary,
    beneficiary,
    registrationNumber: registrationMatch?.[2] || '',
    registrationDate: registrationMatch?.[3] || '',
    term: cleanEgrnValue(termMatch?.[1] || ''),
    basisDocuments,
  };
};


const extractRecipientName = (text = '') => {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/Получатель выписки\s+([\s\S]*?)(?=Особые отметки|Данные актуальны|Сертификат|ДОКУМЕНТ ПОДПИСАН|Лист\s*№?|$)/i);
  const raw = (match?.[1] || '').replace(/\s+/g, ' ').trim();
  const fio = raw.match(/[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+/);
  return fio ? fio[0] : raw;
};

const parseBasisDocuments = (block = '') => {
  const startIndex = block.search(/Основание государственной регистрации/i);
  if (startIndex < 0) return [];

  const tail = block.slice(startIndex);

  const stopMatch = tail.match(
    /Дата,\s*номер\s*и\s*основание\s*государственной\s*регистрации\s*перехода|Право\s+на\s+недвижимость\s+действующее|Сведения\s+об\s+осуществлении\s+государственной\s+регистрации/i
  );

  const section = cleanEgrnValue(
    (stopMatch ? tail.slice(0, stopMatch.index) : tail)
      .replace(/^Основание\s+государственной\s+регистрации/i, '')
  );

  const docs = parseEgrnDocumentsFromSection(section);

  debugLog(`📚 Основания (${docs.length} шт.):`, docs);

  return docs;
};

const extractTermsFromText = (text) => {
  const terms = {};

  const cadastralMatch = text.match(/Кадастровый номер[^\d]*(\d{2}:\d{2}:\d{6,7}:\d+)/i);
  if (cadastralMatch) terms.cadastralNumber = cadastralMatch[1];

  const addressMatch = text.match(/(?:Адрес \(местоположение\)|Местоположение)[\s:]*([\s\S]*?)(?=Площадь|Этаж|Номер, тип этажа|Назначение|Кадастровая стоимость)/i);
  if (addressMatch) {
    terms.address = addressMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Получатель выписки (нужен для понимания, чьи паспортные данные показываются)
  const recipientName = extractRecipientName(text);
  if (recipientName) terms.recipientName = recipientName;
 
  const areaMatch = text.match(/Площадь, м\s*2\s+(\d+[.,]?\d*)/i);
  if (areaMatch) {
    terms.area = parseFloat(areaMatch[1].replace(',', '.'));
  }

  const floorMatch = text.match(/Номер, тип этажа\s+(?:Этаж\s*)?(\d+)/i);
  if (floorMatch) {
    terms.floor = parseInt(floorMatch[1], 10);
  }

  const objectMeta = extractObjectMetaFromText(text);
  Object.assign(terms, objectMeta);
  terms.encumbrance = extractEncumbranceFromText(text);

  return terms;
};

// ✅ Нормализация текста (если у тебя её уже нет — оставь; если есть, используй существующую)
const normalizeChunk = (s = '') =>
  s
    .replace(/\u00A0/g, ' ')
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();


// ✅ Нормализация ФИО и сравнение с учётом регистра/пробелов/ё
const normalizeName = (s = '') =>
  s.toLowerCase().replace(/[ё]/g, 'е').replace(/\s+/g, ' ').trim();

const isSamePerson = (a = '', b = '') => {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

// ✅ Извлечение СНИЛС/телефон/email из куска текста
const extractContacts = (chunk) => {
  const t = normalizeChunk(chunk);

  // СНИЛС может быть "105-406-768 32" или "105 406 768 32" или "10540676832"
  const snilsMatch = t.match(/\b(\d{3}[-\s]?\d{3}[-\s]?\d{3})[-\s]?(\d{2})\b/);

  // Телефон РФ: +7 или 8, с любыми пробелами/скобками/дефисами
  const phoneMatch = t.match(/\b(?:\+7|8)\s*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/);

  // Email — базовый надёжный шаблон
  const emailMatch = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  // Нормализуем СНИЛС к формату XXX-XXX-XXX YY
  let snils = '';
  if (snilsMatch) {
    const digits = (snilsMatch[1] + snilsMatch[2]).replace(/\D/g, ''); // 11 цифр
    if (digits.length === 11) {
      snils = `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)} ${digits.slice(9)}`;
    }
  }

  return {
    snils,
    phone: phoneMatch ? phoneMatch[0] : '',
    email: emailMatch ? emailMatch[0] : ''
  };
};

// ✅ Универсальный парсер паспорта: серия/номер + "выдан: ..." + дата,
// ограничиваемся фрагментом сразу после "выдан", чтобы не цеплять "Основание..."
const extractPassport = (chunk) => {
  const t = normalizeChunk(chunk);

  // Серия: допускаем формат "40 05" или "4005" → нормализуем до "4005"
  const seriesMatch = t.match(/серия[:\s]*([0-9]{2}\s?[0-9]{2}|[0-9]{4})/i);
  const seriesRaw = seriesMatch?.[1] || '';
  const series = seriesRaw.replace(/\s+/g, ''); // "40 05" -> "4005"

  // Номер: 6 цифр, иногда с пробелами → склеим
  const numberMatch = t.match(/номер[:\s]*([0-9][0-9\s]{4,8}[0-9])/i);
  const numberRaw = numberMatch?.[1] || '';
  const number = numberRaw.replace(/\s+/g, ''); // "220 581" -> "220581"

  // Найдём "выдан" и ограничим окно анализа, чтобы не захватывать "Основание..."
  const issuedIdx = t.search(/выдан[:\s]*/i);
  let issuedBy = '';
  let issueDate = '';
  // Код подразделения: 3-3 цифры, иногда с тире/длинным тире
  let deptCode = '';
  const deptMatchAll = t.match(/код\s*подразделения[:\s]*([0-9]{3}[-–][0-9]{3})/i);
  if (deptMatchAll) {
    deptCode = deptMatchAll[1].replace(/[–]/g, '-'); // нормализуем длинное тире
  }

  if (issuedIdx !== -1) {
    const stopRegex = /(Основание государственной регистрации|Дата, номер и основание|Сведения об осуществлении государственной регистрации|Правообладатель)/i;
    const stopMatch = t.slice(issuedIdx).match(stopRegex);
    const stopIdxAbs = stopMatch ? issuedIdx + stopMatch.index : -1;

    const HARD_LIMIT = 220; // символов после "выдан"
    const endIdx = Math.min(
      stopIdxAbs > -1 ? stopIdxAbs : t.length,
      issuedIdx + HARD_LIMIT
    );
    const issuedSection = t.slice(issuedIdx, endIdx);

    // 1) "выдан: <орган>, код подразделения 123-456, DD.MM.YYYY"
    // 2) "выдан: <орган> DD.MM.YYYY"
    // 3) "выдан: <орган>" (без даты)
    const m1 = issuedSection.match(/выдан[:\s]*([\s\S]*?),(?:\s*код\s*подразделения[:\s]*\d{3}[-–]\d{3})?\s*([0-3]?\d\.[01]?\d\.\d{4})/i);
    const m2 = m1 || issuedSection.match(/выдан[:\s]*([\s\S]*?)\s+([0-3]?\d\.[01]?\d\.\d{4})/i);
    const m3 = m2 || issuedSection.match(/выдан[:\s]*([\s\S]*?)(?=,|$)/i);

    const byRaw   = (m2?.[1] || m3?.[1] || '').toString();
    const dateRaw = (m2?.[2] || '').toString();

    issuedBy  = normalizeChunk(byRaw).replace(/[ ,]+$/,'');
    issueDate = dateRaw;
  }

    return { series, number, issuedBy, issueDate, deptCode };
};


// ✅ ХЕЛПЕР: парсинг нескольких правообладателей в одном блоке при "Общая совместная"
const parseJointOwners = (block) => {
  const people = [];

  // Разделяем блок на персон по шаблону "ФИО, ДД.ММ.ГГГГ … (до следующего ФИО/даты или конца)"
  const personRegex = /([А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+),\s*([0-3]?\d\.[01]?\d\.\d{4})([\s\S]*?)(?=(?:[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+,\s*[0-3]?\d\.[01]?\d\.\d{4})|$)/g;

  let m;
  while ((m = personRegex.exec(block)) !== null) {
    const fullName = m[1].trim();
    const birthDate = m[2].trim();
    const tail = (m[3] || "");

    const t = normalizeChunk(tail);
    const p = extractPassport(t);
    const contacts = extractContacts(t);

    people.push({
      fullName,
      birthDate,
      passport: (p?.series || p?.number || p?.issuedBy || p?.issueDate) ? {
        series: p.series,
        number: p.number,
        issuedBy: p.issuedBy,
        issueDate: p.issueDate,
	deptCode: p.deptCode,
      } : undefined,
      snils: contacts.snils || '',
      phone: contacts.phone || '',
      email: contacts.email || ''
    });
  }

  // Подстраховка: если никого не нашли (редко), попробуем вытащить хотя бы одно ФИО
  if (people.length === 0) {
    const fallback = block.match(/Правообладатель \(правообладатели\)\s+([^\n,]+)/i);
    if (fallback) {
      people.push({ fullName: fallback[1].trim(), birthDate: '', passport: undefined });
    }
  }

  return people;
};
// Группируем одинаковых персон в одного владельца с массивом прав (rights[])
function groupLandlords(list) {
  const grouped = {};

  list.forEach((l) => {
    const key = normalizeName(l.fullName) + '|' + (l.birthDate || '');

    if (!grouped[key]) {
      grouped[key] = {
        fullName: l.fullName || '',
        birthDate: l.birthDate || '',
        // берём первый найденный паспорт/контакты; дальше — только дополняем пустые поля
        passport: l.passport || undefined,
        snils: l.snils || '',
        phone: l.phone || '',
        email: l.email || '',
        ownershipType: l.ownershipType || '',
        rights: []
      };
    } else {
      // дозаполняем верхние поля, если в «первом» экземпляре они были пустые
      const g = grouped[key];
      if (!g.passport && l.passport) g.passport = l.passport;
      if (!g.snils && l.snils) g.snils = l.snils;
      if (!g.phone && l.phone) g.phone = l.phone;
      if (!g.email && l.email) g.email = l.email;
      if (!g.ownershipType && l.ownershipType) g.ownershipType = l.ownershipType;
    }

    // каждая исходная запись становится отдельной записью права внутри владельца
    grouped[key].rights.push({
      ownershipType: l.ownershipType || '',
      share: l.share || '',
      regNum: (l.documents || [])[0]?.regNumber || '',
      regDate: (l.documents || [])[0]?.regDate || '',
      documents: (l.documents || []).map((doc) => ({
        title: doc.title || '',
        number: doc.number || '',
        docDate: doc.docDate || '',
        regNumber: doc.regNumber || '',
        regDate: doc.regDate || ''
      }))
    });
  });

  return Object.values(grouped);
}

const extractLandlordsFromText = (text) => {
  const landlords = [];

  // Получатель выписки — чтобы корректно интерпретировать паспорт в блоке "Общая совместная"
  const recipientName = extractRecipientName(text);
   
  // 🔍 Шаг 1. Находим все вхождения " 1.1", " 1.2", ...
  const matches = [...text.matchAll(/\s1\.\d+\.?/g)];
  const positions = matches.map(m => m.index);

  console.log('📌 Найдено блоков:', positions.length);
  console.log('🔢 Индексы блоков:', positions);

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = positions[i + 1] || text.length;
    const block = text.slice(start, end);

    console.log(`\n🧩 Блок ${i + 1} (первые 500 символов):\n${block.slice(0, 500)}`);

    if (!/Правообладатель/i.test(block)) {
      console.log(`⛔ Блок ${i + 1}: без "Правообладатель" — пропущен`);
      continue;
    }

    if (!/Право на недвижимость действующее/i.test(block)) {
      console.log(`⛔ Блок ${i + 1}: право не действующее — пропущен`);
      continue;
    }

    // 🔹 ФИО
    let fullName = '';
    const fullNameRawMatch = block.match(/Правообладатель \(правообладатели\)\s+([^\n,]+)/i);
    if (fullNameRawMatch) {
      fullName = fullNameRawMatch[1].split('Основание государственной регистрации')[0].trim();
    }

    // 🔹 Дата рождения
    let birthDate = '';
    const birthAfterNameMatch = block.match(/([А-ЯЁ][а-яё]+\s[А-ЯЁ][а-яё]+\s[А-ЯЁ][а-яё]+),\s+([0-3]?\d\.[01]?\d\.\d{4})/);
    if (birthAfterNameMatch) {
      fullName = birthAfterNameMatch[1];
      birthDate = birthAfterNameMatch[2];
      if (!birthDate) {
        const birthLabelMatch = block.match(/Дата\s*рождения[:\s]+([0-3]?\d\.[01]?\d\.\d{4})/i);
        if (birthLabelMatch) {
          birthDate = birthLabelMatch[1];
        }
      }
    }

    console.log(`👤 ФИО: ${fullName}`);
    console.log(`🎂 Дата рождения: ${birthDate}`);

    // 🔹 Паспорт
    const pAll = extractPassport(block);
    if (pAll.series || pAll.number || pAll.issuedBy || pAll.issueDate) {
      console.log(`🪪 Паспорт: серия ${pAll.series}, номер ${pAll.number}`);
      console.log(`🏢 Кем выдан: ${pAll.issuedBy}`);
      console.log(`📅 Дата выдачи: ${pAll.issueDate}`);
      // Паспорт прикрепляем только если это получатель выписки (если он известен)
    }
    // Паспорт прикрепляем только если это получатель выписки (если он известен)
    const attachPassport = !recipientName || isSamePerson(fullName, recipientName);

    const contactsAll = extractContacts(block);
    if (contactsAll.snils || contactsAll.phone || contactsAll.email) {
      console.log(`🧾 СНИЛС: ${contactsAll.snils || '—'}`);
      console.log(`📞 Телефон: ${contactsAll.phone || '—'}`);
      console.log(`✉️ Email: ${contactsAll.email || '—'}`);
    }

    // 🔹 Тип собственности и доля
    const ownershipTypeMatch = block.match(/(Общая долевая собственность|Общая совместная собственность|Индивидуальная собственность|Собственность)/i);
    const ownershipType = ownershipTypeMatch?.[1] || '';
    const isShared = /Общая долевая собственность/i.test(ownershipType);
    const isJoint  = /Общая совместная собственность/i.test(ownershipType);

    // ➗ Долю ИЩЕМ только при общей долевой. Для "Собственность" и "Общая совместная" — НЕ ищем.
    let share = '';
    if (isShared) {
      const headingShare = block.match(
        /Вид,\s*номер\s*и\s*дата\s*государственной\s*регистрации\s*права\s+Общая\s+долевая\s+собственность,\s*([0-9]{1,3}\s*\/\s*[0-9]{1,3})/i
      );
      if (headingShare) {
        share = headingShare[1].replace(/\s+/g, '');
      } else {
        const anyShare = block.match(/\b(\d{1,3}\s*\/\s*\d{1,3})\b/);
        share = anyShare?.[1]?.replace(/\s+/g, '') || '';
      }
    }
    console.log(`📄 Тип собственности: ${ownershipType}`);
    console.log(`➗ Доля: ${share || 'нет'}`);

    // 🔹 Документы-основания
    const documents = parseBasisDocuments(block);
    if (documents.length) console.log(`📚 Основания (${documents.length} шт.):`, documents);

    // 🔹 Регистрация
    // 1) Пробуем найти прямо в строке "Вид, номер и дата государственной регистрации права ..."
    let regNumber = '';
    let regDate = '';
    const headingReg = block.match(
  /Вид,\s*номер\s*и\s*дата\s*государственной\s*регистрации\s*права\s+[^\n,]+,\s*([0-9A-Za-z:/-]+),\s*([0-3]?\d\.[01]?\d\.\d{4})/i
    );
    if (headingReg) {
      regNumber = headingReg[1];
      regDate = headingReg[2];
    } else {
      // 2) Запасной поиск, как было раньше
      const regMatch = block.match(
        /государственной регистрации права\s+[^,\n]+,\s+[^,\n]+,\s+([^\s,]+),\s+(\d{2}\.\d{2}\.\d{4})/i
      );
      regNumber = regMatch?.[1] || '';
      regDate = regMatch?.[2] || '';
    }
    console.log(`🏛 Номер регистрации: ${regNumber}`);
    console.log(`📅 Дата регистрации: ${regDate}`);

    // Добавляем к каждому документу regNumber/regDate
    documents.forEach(doc => {
      doc.regNumber = regNumber;
      doc.regDate = regDate;
    });
    // Если "Общая совместная" — в одном блоке может быть несколько правообладателей.
    // Для каждого человека — ФИО/дата/паспорт из его подфрагмента.
    // Общие поля (тип, документы, рег.номер/дата) копируем каждому.
    // Долю НЕ заполняем.
    if (isJoint) {
      const persons = parseJointOwners(block);

      // Если ни у кого не нашёлся паспорт, но в блоке есть один паспорт вне "подфрагментов",
      // мы НЕ будем тянуть его наугад. (Паспорт у Росреестра показывается только у получателя,
      // но в текущем блоке он и так окажется в подфрагменте нужного человека.)
      persons.forEach((p, idxP) => {
        // Паспорт показываем только получателю выписки (если он известен)
        const attachPassport = !recipientName || isSamePerson(p.fullName, recipientName);
        const landlordJoint = {
          fullName: p.fullName || '',
          birthDate: p.birthDate || '',
          passport: attachPassport ? p.passport : undefined,
             // только если найден внутри персонального подфрагмента
          ownershipType,
          share: '',                        // ⛔ для совместной собственности доли нет
          documents: documents.map(d => ({ ...d, regNumber, regDate })),
          snils: p.snils || '',
          phone: p.phone || '',
          email: p.email || '',
        };
        console.log(`✅ Итог joint-landlord ${i + 1}.${idxP + 1}:`, landlordJoint);
        landlords.push(landlordJoint);
     });

     // Переходим к следующему блоку — стандартную ветку ниже пропускаем
     continue;
    }

    const landlord = {
      fullName,
      birthDate,
      passport: (attachPassport && (pAll.series || pAll.number || pAll.issuedBy || pAll.issueDate || pAll.deptCode)) ? {
  	series: pAll.series,
  	number: pAll.number,
  	issuedBy: pAll.issuedBy,
  	issueDate: pAll.issueDate,
  	deptCode: pAll.deptCode
      } : undefined,

      snils: contactsAll.snils || '',
      phone: contactsAll.phone || '',
      email: contactsAll.email || '',
      ownershipType: ownershipTypeMatch?.[1] || '',
      share,
      documents
    };

    console.log(`✅ Итог landlord ${i + 1}:`, landlord);
    landlords.push(landlord);
  }

  return groupLandlords(landlords);
};

export const extractEGRNDataFromPdf = async (file) => {
  const rawText = await getPdfText(file);
  console.log('📄 Извлечённый текст выписки:', rawText);

  const terms = extractTermsFromText(rawText);
  const extractedLandlords = extractLandlordsFromText(rawText);

  const suggestions = [];
  const warnings = [];

  return {
    terms,
    recipientName: terms.recipientName || '',
    encumbrance: terms.encumbrance,
    extractedLandlords,
    suggestions,
    warnings
  };
};

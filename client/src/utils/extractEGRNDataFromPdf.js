import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

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

const extractTermsFromText = (text) => {
  const terms = {};

  const cadastralMatch = text.match(/Кадастровый номер[^\d]*(\d{2}:\d{2}:\d{6,7}:\d+)/i);
  if (cadastralMatch) terms.cadastralNumber = cadastralMatch[1];

  const addressMatch = text.match(/(?:Адрес \(местоположение\)|Местоположение)[\s:]*([\s\S]*?)(?=Площадь|Этаж|Номер, тип этажа|Назначение|Кадастровая стоимость)/i);
  if (addressMatch) {
    terms.address = addressMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Получатель выписки (нужен для понимания, чьи паспортные данные показываются)
  const recipientMatch = text.match(/Получатель выписки\s+([^\n]+)/i);
  if (recipientMatch) {
    terms.recipientName = recipientMatch[1].replace(/\s+/g, ' ').trim();
  }
 
  const areaMatch = text.match(/Площадь, м\s*2\s+(\d+[.,]?\d*)/i);
  if (areaMatch) {
    terms.area = parseFloat(areaMatch[1].replace(',', '.'));
  }

  const floorMatch = text.match(/Номер, тип этажа\s+(?:Этаж\s*)?(\d+)/i);
  if (floorMatch) {
    terms.floor = parseInt(floorMatch[1], 10);
  }

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
      share: l.share || '',
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
  const recipientMatch = text.match(/Получатель выписки\s+([^\n]+)/i);
  const recipientName = recipientMatch ? recipientMatch[1].replace(/\s+/g, ' ').trim() : '';
   
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
    const documents = [];
    const docBlockMatch = block.match(/Основание государственной регистрации([\s\S]*?)Дата, номер и/i);
    const docBlock = docBlockMatch?.[1]?.trim();
    if (docBlock) {
      const documentRegex = /([^,]+?)(?:,\s*номер\s*([^\s,]+))?,\s*(\d{2}\.\d{2}\.\d{4})/g;
      let m;
      while ((m = documentRegex.exec(docBlock)) !== null) {
        documents.push({
          title: m[1].trim(),
          number: m[2]?.trim() || '',
          docDate: m[3]
        });
      }
      console.log(`📚 Основания (${documents.length} шт.):`, documents);
    }

    // 🔹 Регистрация
    // 1) Пробуем найти прямо в строке "Вид, номер и дата государственной регистрации права ..."
    let regNumber = '';
    let regDate = '';
    const headingReg = block.match(
  /Вид,\s*номер\s*и\s*дата\s*государственной\s*регистрации\s*права\s+[^\n,]+,\s*([0-9A-Za-z:\-\/]+),\s*([0-3]?\d\.[01]?\d\.\d{4})/i
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
    extractedLandlords,
    suggestions,
    warnings
  };
};

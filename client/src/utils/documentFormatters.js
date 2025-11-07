// client/src/utils/documentFormatters.js
import { formatDateToText, formatPassportText } from './formatters';

export const formatLandlordData = (landlord, index, totalCount) => {
  const gender = landlord.gender || 'male';
  const genderSuffix = gender === 'female' ? 'ая' : 'ый';
  const registrationType = landlord.registrationType || 'permanent';
  
  let registrationText = '';
  switch(registrationType) {
    case 'previous':
      registrationText = `ранее зарегистрирован${gender === 'female' ? 'а' : ''} по адресу`;
      break;
    case 'temporary':
      registrationText = `временно зарегистрирован${gender === 'female' ? 'а' : ''} по адресу`;
      break;
    case 'none':
      registrationText = `на данный момент нигде не зарегистрирован${gender === 'female' ? 'а' : ''}`;
      break;
    default:
      registrationText = `зарегистрирован${gender === 'female' ? 'а' : ''} по адресу`;
  }
  
  const representation = totalCount > 1 
    ? `именуем${genderSuffix} в дальнейшем "Наймодатель ${index + 1}"`
    : `именуем${genderSuffix} "Наймодатель"`;
  
  return `${landlord.fullName}, пол: ${gender === 'male' ? 'мужской' : 'женский'}, 
дата рождения: ${formatDateToText(landlord.birthDate)}, 
место рождения: ${landlord.birthPlace}, 
паспорт гражданина Российской Федерации: ${landlord.passport}, 
кем выдан: ${landlord.passportIssued}, 
дата выдачи: ${formatDateToText(landlord.issueDate)}, 
код подразделения: ${landlord.departmentCode}, 
${registrationText}: ${landlord.registration || 'не указано'}, 
${representation}`;
};

export const formatTenantData = (tenant, index, totalCount) => {
  // Аналогичная реализация для арендаторов
  return `Арендатор ${index + 1}: ${tenant.fullName}`;
};
// === ГРУППИРОВКА ПРЕДСТАВИТЕЛЕЙ (АРЕНДОДАТЕЛИ) ===

// утилиты нормализации
const onlyDigits = (s = '') => (s || '').replace(/\D+/g, '');
const norm = (s = '') => (s || '').trim().replace(/\s+/g, ' ');

// нормализуем ключевые поля представителя
const normalizeRep = (rep = {}) => ({
  fullName: norm(rep.fullName),
  passport: onlyDigits(rep.passport),
  attorneyNumber: norm(rep.attorneyNumber),
  attorneyDate: norm(rep.attorneyDate),
  attorneyIssuedBy: norm(rep.attorneyIssuedBy),
  gender: rep.gender || ''
});

// ключ для группировки (одинаковые → одна группа)
const repKey = (rep = {}) => {
  const r = normalizeRep(rep);
  return JSON.stringify({
    f: r.fullName,
    p: r.passport,
    an: r.attorneyNumber,
    ad: r.attorneyDate,
    ai: r.attorneyIssuedBy
  });
};

// склейка списка "A, B и C" (без запятой перед "и")
const joinWithAnd = (items) => {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} и ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`;
};

// мини-профиль арендодателя в ОДНУ строку + хвост «Арендодатель N»
export const formatLandlordInline = (l, idx) => {
  const genderWord = l.gender === 'female' ? 'женский' : 'мужской';
  const genderEnd = l.gender === 'female' ? 'ая' : 'ый';

  const parts = [];
  parts.push(`${l.fullName}, пол: ${genderWord}`);
  if (l.birthDate) parts.push(`дата рождения: ${formatDateToText(l.birthDate)} года рождения`);
  if (l.birthPlace) parts.push(`место рождения: ${l.birthPlace}`);

  // паспорт
  if (l.passport) {
    parts.push(`паспорт гражданина Российской Федерации: ${formatPassportText(l.passport)}`);
  } else {
    parts.push(`паспорт гражданина Российской Федерации: `);
  }

  if (l.passportIssued) parts.push(`выдан: ${l.passportIssued}`);
  if (l.issueDate) parts.push(formatDateToText(l.issueDate));
  if (l.departmentCode) parts.push(`код подразделения: ${l.departmentCode}`);
  if (l.registration) parts.push(`зарегистрирован${l.gender === 'female' ? 'а' : ''} по адресу: ${l.registration}`);

  const body = parts.filter(Boolean).join(', ');
  return `${body}, именуем${genderEnd} в дальнейшем «Наймодатель ${idx + 1}»`;
};

// ГЛАВНАЯ: подготовить группы представителя для арендодателей
export const prepareLandlordRepresentativeGroups = (landlords) => {
  if (!Array.isArray(landlords) || landlords.length === 0) return landlords || [];

  // сгруппируем по ключу представителя
  const map = new Map();
  landlords.forEach((l, i) => {
    if (!l?.hasRepresentative || !l.representative) return;
    const key = repKey(l.representative);
    if (!key || key === '{}') return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i);
  });

  // клон массива (не мутируем исходник)
  const out = landlords.map(l => ({ ...l }));

  for (const [, idxs] of map.entries()) {
    if (idxs.length < 2) continue; // группа только если 2+

    // список подопечных одной строкой
    const inlineList = joinWithAnd(idxs.map(idx => formatLandlordInline(out[idx], idx)));

    // тело представителя
    const src = out[idxs[0]];
    const rep = src.representative || {};
    const repGenderWord = rep.gender === 'female' ? 'женский' : 'мужской';

    const repParts = [];
    repParts.push(`${rep.fullName}, пол: ${repGenderWord}`);
    if (rep.birthDate) repParts.push(`дата рождения: ${formatDateToText(rep.birthDate)} года рождения`);
    if (rep.birthPlace) repParts.push(`место рождения: ${rep.birthPlace}`);
    if (rep.passport) {
      repParts.push(`паспорт гражданина Российской Федерации: ${formatPassportText(rep.passport)}`);
    } else {
      repParts.push(`паспорт гражданина Российской Федерации: `);
    }
    if (rep.passportIssued) repParts.push(`выдан: ${rep.passportIssued}`);
    if (rep.issueDate) repParts.push(formatDateToText(rep.issueDate));
    if (rep.departmentCode) repParts.push(`код подразделения: ${rep.departmentCode}`);
    if (rep.registration) repParts.push(`зарегистрирован${rep.gender === 'female' ? 'а' : ''} по адресу: ${rep.registration}`);
    if (rep.attorneyDate || rep.attorneyIssuedBy || rep.attorneyNumber) {
      repParts.push(`действует по доверенности от ${rep.attorneyDate ? formatDateToText(rep.attorneyDate) : ''}`);
      if (rep.attorneyIssuedBy) repParts.push(`удостоверенной ${rep.attorneyIssuedBy}`);
      if (rep.attorneyNumber) repParts.push(`реестровый номер: ${rep.attorneyNumber}`);
    }

    const repBody = repParts.filter(Boolean).join(', ');
    const groupText = `${repBody}, от имени: ${inlineList},`;

    // отметить участников: их не печатаем в основном списке
    idxs.forEach(idx => { out[idx].suppressSelfInMainList = true; });
    // у первого положим текст группы
    out[idxs[0]].representativeGroupBlock = groupText;
  }

  return out;
};
// === ГРУППИРОВКА ПРЕДСТАВИТЕЛЕЙ (АРЕНДАТОРЫ) ===

// "Иванов …, именуемый … «Арендатор N»" — в одну строку
export const formatTenantInline = (t, idx) => {
  const genderWord = t.gender === 'female' ? 'женский' : 'мужской';
  const genderEnd = t.gender === 'female' ? 'ая' : 'ый';

  const parts = [];
  parts.push(`${t.fullName}, пол: ${genderWord}`);
  if (t.birthDate) parts.push(`дата рождения: ${formatDateToText(t.birthDate)} года рождения`);
  if (t.birthPlace) parts.push(`место рождения: ${t.birthPlace}`);

  if (t.passport) {
    parts.push(`паспорт гражданина Российской Федерации: ${formatPassportText(t.passport)}`);
  } else {
    parts.push(`паспорт гражданина Российской Федерации: `);
  }

  if (t.passportIssued) parts.push(`выдан: ${t.passportIssued}`);
  if (t.issueDate) parts.push(formatDateToText(t.issueDate));
  if (t.departmentCode) parts.push(`код подразделения: ${t.departmentCode}`);
  if (t.registration) parts.push(`зарегистрирован${t.gender === 'female' ? 'а' : ''} по адресу: ${t.registration}`);

  const body = parts.filter(Boolean).join(', ');
  return `${body}, именуем${genderEnd} в дальнейшем «Арендатор ${idx + 1}»`;
};

// Главная: подготовить группы представителя для арендаторов
export const prepareTenantRepresentativeGroups = (tenants) => {
  if (!Array.isArray(tenants) || tenants.length === 0) return tenants || [];

  const map = new Map();
  tenants.forEach((t, i) => {
    if (!t?.hasRepresentative || !t.representative) return;
    const key = repKey(t.representative);
    if (!key || key === '{}') return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i);
  });

  const out = tenants.map(t => ({ ...t }));

  for (const [, idxs] of map.entries()) {
    if (idxs.length < 2) continue;

    const inlineList = joinWithAnd(idxs.map(idx => formatTenantInline(out[idx], idx)));

    const src = out[idxs[0]];
    const rep = src.representative || {};
    const repGenderWord = rep.gender === 'female' ? 'женский' : 'мужской';

    const repParts = [];
    repParts.push(`${rep.fullName}, пол: ${repGenderWord}`);
    if (rep.birthDate) repParts.push(`дата рождения: ${formatDateToText(rep.birthDate)} года рождения`);
    if (rep.birthPlace) repParts.push(`место рождения: ${rep.birthPlace}`);
    if (rep.passport) {
      repParts.push(`паспорт гражданина Российской Федерации: ${formatPassportText(rep.passport)}`);
    } else {
      repParts.push(`паспорт гражданина Российской Федерации: `);
    }
    if (rep.passportIssued) repParts.push(`выдан: ${rep.passportIssued}`);
    if (rep.issueDate) repParts.push(formatDateToText(rep.issueDate));
    if (rep.departmentCode) repParts.push(`код подразделения: ${rep.departmentCode}`);
    if (rep.registration) repParts.push(`зарегистрирован${rep.gender === 'female' ? 'а' : ''} по адресу: ${rep.registration}`);
    if (rep.attorneyDate || rep.attorneyIssuedBy || rep.attorneyNumber) {
      repParts.push(`действует по доверенности от ${rep.attorneyDate ? formatDateToText(rep.attorneyDate) : ''}`);
      if (rep.attorneyIssuedBy) repParts.push(`удостоверенной ${rep.attorneyIssuedBy}`);
      if (rep.attorneyNumber) repParts.push(`реестровый номер: ${rep.attorneyNumber}`);
    }

    const repBody = repParts.filter(Boolean).join(', ');
    const groupText = `${repBody}, от имени: ${inlineList},`;

    idxs.forEach(idx => { out[idx].suppressSelfInMainList = true; });
    out[idxs[0]].representativeGroupBlock = groupText;
  }

  return out;
};
// === Описание квартиры (Приложение №2) → многострочный текст для шаблона ===
export const formatApartmentDescriptionText = (arr = []) => {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  const nonEmpty = arr.filter(r => {
    const vals = [r?.floor, r?.walls, r?.ceiling, r?.doors, r?.windows, r?.condition]
      .map(v => (v ?? '').toString().trim());
    return vals.some(Boolean);
  });
  if (nonEmpty.length === 0) return '';
  return nonEmpty.map(r => {
    const name    = (r?.name     || 'Помещение').toString().trim();
    const floor   = (r?.floor    || '—').toString().trim();
    const walls   = (r?.walls    || '—').toString().trim();
    const ceiling = (r?.ceiling  || '—').toString().trim();
    const doors   = (r?.doors    || '—').toString().trim();
    const windows = (r?.windows  || '—').toString().trim();
    const state   = (r?.condition|| '—').toString().trim();
    return `${name}: пол — ${floor}; стены — ${walls}; потолок — ${ceiling}; двери — ${doors}; окна — ${windows}; состояние — ${state}`;
  }).join('\n');
};
// === Описание квартиры (Приложение №2) → HTML-таблица для шаблона ===
export const formatApartmentDescriptionHtml = (arr = []) => {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  const esc = (s = '') =>
    String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // берём только непустые помещения
  const rows = arr
    .filter(r => {
      const vals = [r?.floor, r?.walls, r?.ceiling, r?.doors, r?.windows, r?.condition]
        .map(v => (v ?? '').toString().trim());
      return vals.some(Boolean);
    })
    .map(r => `<tr>
<td>${esc(r?.name || 'Помещение')}</td>
<td>${esc(r?.floor || '')}</td>
<td>${esc(r?.walls || '')}</td>
<td>${esc(r?.ceiling || '')}</td>
<td>${esc(r?.doors || '')}</td>
<td>${esc(r?.windows || '')}</td>
<td>${esc(r?.condition || '')}</td>
</tr>`).join('');

  if (!rows) return '';

  return `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse: collapse; width: 100%;">
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
};
// === Контакты сторон → HTML-список <ol> ===
export const formatContactsListHtml = (parties = []) => {
  if (!Array.isArray(parties) || parties.length === 0) return '';

  const esc = (s = '') =>
    String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const toArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  const onlyDigits = (s = '') => String(s).replace(/\D+/g, '');

  const buildPhones = (party) => {
    const map = new Map(); // key: digitsOnly, val: original
    const push = (val) => {
      toArray(val).forEach((p) => {
        const raw = String(p || '').trim();
        if (!raw) return;
        const key = onlyDigits(raw);
        if (!key) return;
        if (!map.has(key)) map.set(key, raw);
      });
    };
    push(party.phone); push(party.phones);
    const rep = party.representative || {};
    push(rep.phone); push(rep.phones);
    return Array.from(map.values()).join('; ');
  };

  const buildEmails = (party) => {
    const set = new Set();
    const push = (val) => {
      toArray(val).forEach((e) => {
        const raw = String(e || '').trim();
        if (!raw) return;
        set.add(raw.toLowerCase());
      });
    };
    push(party.email); push(party.emails);
    const rep = party.representative || {};
    push(rep.email); push(rep.emails);
    // печатаем «как ввели», но без дублей (нижний регистр уже в множестве)
    return Array.from(set.values()).join('; ');
  };

  const buildRepresentative = (party) => {
    const rep = party.representative || {};
    if (!party.hasRepresentative || !rep.fullName) return '';
    const num = rep.attorneyNumber ? ` № ${rep.attorneyNumber}` : '';
    const dt  = rep.attorneyDate ? ` от ${rep.attorneyDate}` : '';
    const basis = (rep.attorneyNumber || rep.attorneyDate) ? ` (по доверенности${num}${dt})` : '';
    return ` — представитель: ${esc(rep.fullName)}${esc(basis)}`;
  };

  const items = parties.map((p) => {
    const name = p.companyName || p.fullName || p.name || 'Сторона';
    const phones = buildPhones(p);
    const emails = buildEmails(p);
    const repr = buildRepresentative(p);

    const phonePart = phones ? `, тел.: ${esc(phones)}` : '';
    const emailPart = emails ? `, e-mail: ${esc(emails)}` : '';
    return `<li><strong>${esc(name)}</strong>${repr}${phonePart}${emailPart}</li>`;
  });

  // если все пустые — вернем пустую строку
  const hasContent = items.some(li => /tel\.|e-mail|представитель|<strong>[^<]+<\/strong>/.test(li));
  if (!hasContent) return '';

  return `<ol>${items.join('')}</ol>`;
};


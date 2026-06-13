const express = require('express');
const router = express.Router();

// Parse JSON and URL-encoded bodies (to handle large HTML content)
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Services
const {
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
  getLeaseTemplateInfo,   // ⬅️ добавили
  buildApartmentTableHtml,   // ⬅️ NEW
  buildInventoryTableHtml    // ⬅️ NEW
} = require('../services/documentService');

// ==== Guest cooldown (15 min) & identification via X-Consent-Id ====
const _guestCooldown = new Map();              // key -> { last:number, until:number }
const COOLDOWN_MS = 15 * 60 * 1000;


const DOCUMENT_TYPE_META = {
  rent: { templateType: 'rent', pdfFileName: 'lease.pdf', docxFileName: 'lease.docx' },
  maternity_capital_shares: {
    templateType: 'maternity_capital_shares',
    pdfFileName: 'soglashenie-o-vydelenii-doley-matkapital.pdf',
    docxFileName: 'soglashenie-o-vydelenii-doley-matkapital.docx'
  }
};

const isUuidValue = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

async function resolveDocumentType(req, fallbackData = {}) {
  const explicit = req.query?.docType || req.body?.docType || fallbackData?.documentType || fallbackData?.type;
  if (explicit === 'maternity_capital_shares' || explicit === 'maternity_capital_shares_agreement') return 'maternity_capital_shares';
  if (explicit === 'rent') return 'rent';
  if (isUuidValue(req.params?.id)) {
    try {
      const { rows } = await query('select type from documents where id = $1 limit 1', [req.params.id]);
      if (rows[0]?.type === 'maternity_capital_shares') return 'maternity_capital_shares';
    } catch (e) {
      console.warn('[resolveDocumentType] failed:', e.message);
    }
  }
  return 'rent';
}

function normalizeDocumentType(type) {
  return type === 'maternity_capital_shares_agreement' ? 'maternity_capital_shares' : (type || 'rent');
}

function getGuestKey(req) {
  // если пользователь авторизован — это НЕ гость
  const isAuthed = !!(req.userId || (req.user && req.user.id));
  if (isAuthed) return null;
  const cid = String(req.get('X-Consent-Id') || '').trim();
  return cid ? `consent:${cid}` : null;
}


function checkAndSetCooldown(req) {
  const key = getGuestKey(req);
  if (!key) return { ok: true }; // неизвестный — не ограничиваем (или позже решим иначе)
  const now = Date.now();
  const rec = _guestCooldown.get(key);
  if (rec && rec.until && now < rec.until) {
    return { ok: false, cooldownRemainingSec: Math.ceil((rec.until - now) / 1000) };
  }
  _guestCooldown.set(key, { last: now, until: now + COOLDOWN_MS });
  return { ok: true };
}

const { exportHtmlToDocxBuffer } = require('../services/docxGenerator');
const { buildMaternityCapitalSharesRenderData } = require('../services/documentTypes/maternityCapitalShares');
const { query } = require('../db');
const { splitPassportSeriesNumber, ensureGoda, } = require('../utils/personDisplay');
const { buildContactsHtml } = require('../services/documentTypes/rent/contacts');
const { insertShareWord } = require('../services/documentTypes/rent/ownershipDocs');
// === Helpers: dates/passports and representatives display ===
function parseAnyDateLocal(input) {
  if (!input) return null;
  const s = String(input).trim();
  // DD.MM.YYYY
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  // DD.MM.YY  -> 20YY (если YY <= 30), иначе 19YY
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (m) {
    const yy = +m[3];
    const full = yy <= 30 ? (2000 + yy) : (1900 + yy);
    return new Date(full, +m[2]-1, +m[1]);
  }
  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
// ==== Russian group labels by case (Наймодатель / Наниматель) ====
const GROUP_FORMS = {
  landlord: {
    sg: { // единственное число
      nom: 'Наймодатель',
      gen: 'Наймодателя',
      dat: 'Наймодателю',
      acc: 'Наймодателя',     // одуш., значит как gen
      ins: 'Наймодателем',
      pre: 'Наймодателе',
    },
    pl: { // множественное число
      nom: 'Наймодатели',
      gen: 'Наймодателей',
      dat: 'Наймодателям',
      acc: 'Наймодателей',    // одуш., значит как gen
      ins: 'Наймодателями',
      pre: 'Наймодателях',
    },
  },
  tenant: {
    sg: {
      nom: 'Наниматель',
      gen: 'Нанимателя',
      dat: 'Нанимателю',
      acc: 'Нанимателя',      // одуш., значит как gen
      ins: 'Нанимателем',
      pre: 'Нанимателе',
    },
    pl: {
      nom: 'Наниматели',
      gen: 'Нанимателей',
      dat: 'Нанимателям',
      acc: 'Нанимателей',     // одуш., значит как gen
      ins: 'Нанимателями',
      pre: 'Нанимателях',
    },
  },
};

function buildGroupLabels(nounKey, isOne) {
  const forms = GROUP_FORMS[nounKey][isOne ? 'sg' : 'pl'];
  // возвращаем с «говорящими» ключами
  return {
    nominative: forms.nom,       // именительный
    genitive: forms.gen,         // родительный
    dative: forms.dat,           // дательный
    accusative: forms.acc,       // винительный
    instrumental: forms.ins,     // творительный
    prepositional: forms.pre,    // предложный
  };
}

function formatDateLongLocal(input) {
  const d = parseAnyDateLocal(input);
  if (!d) return '';
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const dd = String(d.getDate()); // без паддинга — как в твоём UI («4 января…»)
  return `${dd} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function buildDisplayForPerson(p) {
  const gender = String(p?.gender || '').toLowerCase();
  const genderWord = gender === 'female' ? 'женский' : (gender === 'male' ? 'мужской' : '');
  const genderVerbRegistered = gender === 'female' ? 'зарегистрирована' : 'зарегистрирован';

  // Даты + обязательное "года" (если дата непустая)
  const birthDateText    = ensureGoda(formatDateLongLocal(p?.birthDate || ''));
  const issueDateText    = ensureGoda(formatDateLongLocal(p?.issueDate || ''));
  const attorneyDateText = ensureGoda(formatDateLongLocal(p?.attorneyDate || ''));

  const { series: passportSeries, number: passportNumber } =
    splitPassportSeriesNumber(p?.passport || '');

  return {
    genderWord,
    genderVerbRegistered,
    birthDateText,
    issueDateText,
    attorneyDateText,
    passportSeries,
    passportNumber,
  };
}

function ensureRepresentativesDisplay(data) {
  // Общий представитель Наймодателей
  if (data?.landlordsRepresentative && String(data.landlordsRepresentative.fullName || '').trim()) {
    data.landlordsRepresentative.display = buildDisplayForPerson(data.landlordsRepresentative);
  }
  // Индивидуальные представители Наймодателей
  if (Array.isArray(data?.landlords)) {
    data.landlords = data.landlords.map(l => {
      if (l?.representative && String(l.representative.fullName || '').trim()) {
        l.representative.display = buildDisplayForPerson(l.representative);
      }
      return l;
    });
  }
  return data;
}

function ensureTenantsRepresentativesDisplay(data) {
  // общий представитель нанимателей
  if (data?.tenantsRepresentative && String(data.tenantsRepresentative.fullName || '').trim()) {
    data.tenantsRepresentative.display = buildDisplayForPerson(data.tenantsRepresentative);
  }
  // персональные представители у каждого нанимателя
  if (Array.isArray(data?.tenants)) {
    data.tenants = data.tenants.map(t => {
      if (t?.representative && String(t.representative.fullName || '').trim()) {
        t.representative.display = buildDisplayForPerson(t.representative);
      }
      return t;
    });
  }
  return data;
}
function normalizeTenants(data) {
  if (!data) return data;

  // общий представитель нанимателей — удалить, если пуст
  if (!data.tenantsRepresentative || !String(data.tenantsRepresentative.fullName || '').trim()) {
    delete data.tenantsRepresentative;
  }

  // персональные
  if (Array.isArray(data.tenants)) {
    data.tenants = data.tenants.map(t => {
      const repFull = (t?.representative?.fullName || '').trim();
      const raw = t?.hasRepresentative;
      const explicitTrue = (raw === true || raw === 'true' || raw === 1 || raw === '1');
      const hasRep = explicitTrue || !!repFull;

      if (hasRep) {
        t.hasRepresentative = true;
      } else {
        if (t && 'representative' in t) delete t.representative;
        t.hasRepresentative = false;
      }
      return t;
    });
  }
  return data;
}

function normalizeLandlords(data) {
  if (!data) return data;
  // общий представитель — удаляем, если пуст
  if (!data.landlordsRepresentative || !String(data.landlordsRepresentative.fullName || '').trim()) {
    delete data.landlordsRepresentative;
  }
  // персональные
  if (Array.isArray(data.landlords)) {
    data.landlords = data.landlords.map(l => {
      const repFullName = (l?.representative?.fullName || '').trim();
      const raw = l?.hasRepresentative;
      const explicitTrue = (raw === true || raw === 'true' || raw === 1 || raw === '1');
      const hasRep = explicitTrue || !!repFullName;

      if (hasRep) {
        l.hasRepresentative = true; // зафиксировать истину
      } else {
        if (l && 'representative' in l) delete l.representative; // убрать пустой объект
        l.hasRepresentative = false;
      }
      return l;
    });
  }
  return data;
}
function assignTenantsNamedAs(data) {
  data.calc = data.calc || {};
  const total = Array.isArray(data.tenants) ? data.tenants.length : 0;
  const multi = total > 1;

  if (Array.isArray(data.tenants)) {
    let idx = 1;
    data.tenants = data.tenants.map(t => {
      const d = { ...(t.display || {}) };
      const g = String(t.gender || '').toLowerCase();
      d.namedLater = (g === 'female') ? 'именуемая в дальнейшем' : 'именуемый в дальнейшем';
      d.namedAs = multi ? `Наниматель ${idx++}` : 'Наниматель';
      return { ...t, display: d };
    });
  }

  // если у тебя будут групповые блоки (см. ниже), там нумерацию тоже можно проставить локально
  return data;
}

function markShowNamedLaterForTenants(data) {
  data.calc = data.calc || {};
  const showInLine = !(data.calc.tenantsCountIsOne === true);

  if (Array.isArray(data.tenants)) {
    data.tenants = data.tenants.map(t => {
      const showNamed = showInLine || !!t.inRepGroup; // в группах показываем всегда
      const d = { ...(t.display || {}) };

      const namedLater = d.namedLater || '';
      const namedAs    = d.namedAs || '';
      const multi      = data?.calc?.tenantsCountIsOne === false;
      const endComma   = multi ? ',' : '';
      const namedFull  = (namedLater && namedAs) ? `${namedLater} «${namedAs}»${endComma}` : '';

      return { ...t, display: { ...d, showNamedLaterInLine: showNamed, namedFull } };
    });
  }

  // если будет общий представитель нанимателей
  if (data.tenantsRepresentative && Array.isArray(data.tenantsRepresentative.represented)) {
    data.tenantsRepresentative.represented =
      data.tenantsRepresentative.represented.map(p => {
        const d = { ...(p.display || {}) };
        const namedLater = d.namedLater || '';
        const namedAs    = d.namedAs || '';
        const lastComma  = d.lastInGroup ? ',' : '';
        const namedFull  = (namedLater && namedAs) ? `${namedLater} «${namedAs}»${lastComma}` : '';
        return { ...p, display: { ...d, showNamedLaterInLine: true, namedFull } };
      });
  }

  return data;
}
function promoteTenantsCommonRepresentative(data) {
  if (!Array.isArray(data?.tenants) || data.tenants.length === 0) return data;
  if (data.tenantsRepresentative && String(data.tenantsRepresentative.fullName || '').trim()) {
    return data; // уже задан
  }

  const keys = new Set();
  let commonRep = null;
  for (const t of data.tenants) {
    const rep = t?.representative;
    const key = buildRepKey(rep);
    if (!key) return data; // хотя бы у одного нет представителя → общего нет
    keys.add(key);
    if (!commonRep) commonRep = rep;
  }
  if (keys.size !== 1) return data; // разные представители → общего нет

  // список представляемых
  const represented = data.tenants.map((t, i, arr) => ({
    ...t,
    display: { ...(t.display || {}), lastInGroup: i < arr.length - 1 }
  }));

  data.tenantsRepresentative = { ...commonRep, represented };
  data.tenants = data.tenants.map(t => ({ ...t, inRepGroup: true }));
  data.calc = data.calc || {};
  data.calc.tenantRepGroups = [];

  return data;
}
function buildTenantRepresentativeGroups(data) {
  if (data?.tenantsRepresentative?.fullName) {
    data.calc = data.calc || {};
    data.calc.tenantRepGroups = [];
    return data;
  }

  const groupsMap = new Map();
  for (const t of Array.isArray(data.tenants) ? data.tenants : []) {
    const rep = t?.representative;
    const key = buildRepKey(rep);
    if (!key) continue;
    if (!groupsMap.has(key)) groupsMap.set(key, { representative: rep, represented: [] });
    groupsMap.get(key).represented.push(t);
  }

  const groups = [];
  for (const g of groupsMap.values()) {
    if (g.represented.length >= 2) {
      g.represented = g.represented.map((p, idx, arr) => {
        const copy = { ...p, display: { ...(p.display || {}) } };
        copy.display.lastInGroup = idx < arr.length - 1;
        return copy;
      });

      // готовим display.registrationClause у самого представителя группы)
      {
        const rep = g.representative || {};
        const repDisp = { ...(rep.display || {}) };
        repDisp.registrationClause = repDisp.registrationClause ?? buildRegistrationClauseForPerson(rep);
        g.representative = { ...rep, display: repDisp };
      }
   
      // HTML списка представляемых — безопасный и без лишних запятых
      g.representedHtml = g.represented.map((p, idx, arr) => {
        const parts = [];
        parts.push('<p style="text-indent: 2em;">');

        // ФИО + пол
        parts.push(`${escapeHtml(p.fullName)}, пол: ${escapeHtml(p.display?.genderWord || '')},`);

        // даты/место рождения
        if (p.birthDate)  parts.push(` дата рождения: ${escapeHtml(p.display?.birthDateText || '')} рождения,`);
        if (p.birthPlace) parts.push(` место рождения: ${escapeHtml(p.birthPlace)},`);

        // паспорт
        parts.push(' паспорт гражданина Российской Федерации:');
        if (p.display?.passportSeries) parts.push(` серия: ${escapeHtml(p.display.passportSeries)}`);
        if (p.display?.passportNumber) parts.push(` номер: ${escapeHtml(p.display.passportNumber)},`);
        if (p.passportIssued)          parts.push(` выдан: ${escapeHtml(p.passportIssued)},`);
        if (p.issueDate)               parts.push(` дата выдачи: ${escapeHtml(p.display?.issueDateText || '')},`);
        if (p.departmentCode)          parts.push(` код подразделения: ${escapeHtml(p.departmentCode)},`);

        // регистрация (используем нашу формулу)
        const regClause = buildRegistrationClauseForPerson(p);
        if (regClause) parts.push(` ${escapeHtml(regClause)}`);

        // «именуемый…»
        const namedLater = p.display?.namedLater || '';
        const namedAs    = p.display?.namedAs || '';
        const endComma   = (idx < arr.length - 1) ? ',' : '';
        if (namedLater && namedAs) {
          parts.push(` ${escapeHtml(namedLater)} «${escapeHtml(namedAs)}»${endComma}`);
        }

        parts.push('</p>');
        return parts.join('');
      }).join('\n');

      groups.push(g);
    }
  }

  // пометить тех, кого надо скрыть из одиночных блоков
  if (groups.length) {
    const inGroupSet = new Set();
    for (const g of groups) {
      for (const p of g.represented) {
        inGroupSet.add(p.fullName + '|' + (p.passport || ''));
      }
    }
    data.tenants = data.tenants.map(t => {
      const mark = t.fullName + '|' + (t.passport || '');
      return { ...t, inRepGroup: inGroupSet.has(mark) };
    });
  }

  data.calc = data.calc || {};
  data.calc.tenantRepGroups = groups;
  // после data.calc.tenantRepGroups = groups;
  console.log('[TENANT GROUPS]', (groups || []).map(g => ({
    rep: g?.representative?.fullName,
    count: (g?.represented || []).length,
    represented: (g?.represented || []).map(p => p.fullName)
  })));

  return data;
}


function normalizeFio(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRepKey(rep) {
  if (!rep) return '';
  const fio = normalizeFio(rep.fullName);
  const passDigits = String(rep.passport || '').replace(/\D/g, '');
  // ключ по ФИО + серия/номер, чтобы не склеить однофамильцев
  return fio + '|' + passDigits;
}

function sanitizeAddress(s) {
  return String(s || '').replace(/[,\s]+$/g, '').trim();
}

function buildRegistrationClauseForPerson(p) {
  const t = String(p?.registrationType || '').toLowerCase();
  const rawAddr = String(p?.registration || '').trim();
  const addr = sanitizeAddress(rawAddr);  // <-- важно
  const verb = String(p?.display?.genderVerbRegistered || 'зарегистрирован'); // дефолт на всякий

  if (t === 'none') {
    // нигде не зарегистрирован(а),
    return ` нигде не ${verb},`;
  }

  // префиксы для previous / temporary
  let prefix = '';
  if (t === 'previous') prefix = ' ранее ';
  else if (t === 'temporary') prefix = ' временно ';

  // если адрес пуст — показываем только глагол (редкий кейс)
  if (!addr) return `, ${prefix}${verb},`;

  // обычный случай с адресом
  return `${prefix}${verb} по адресу: ${addr},`;
}

// Проставляем display.registrationClause там, где это нужно
function applyRegistrationClauses(data) {
  // --- Landlords (как было) ---
  if (Array.isArray(data?.landlords)) {
    data.landlords = data.landlords.map(l => {
      const d = { ...(l.display || {}) };
      d.registrationClause = buildRegistrationClauseForPerson(l);
      if (l.representative) {
        const rd = { ...(l.representative.display || {}) };
        rd.registrationClause = buildRegistrationClauseForPerson(l.representative);
        l = { ...l, representative: { ...l.representative, display: rd } };
      }
      return { ...l, display: d };
    });
  }
  if (data?.landlordsRepresentative) {
    const rep = data.landlordsRepresentative;
    const rd = { ...(rep.display || {}) };
    rd.registrationClause = buildRegistrationClauseForPerson(rep);
    data.landlordsRepresentative = { ...rep, display: rd };
    if (Array.isArray(rep.represented)) {
      data.landlordsRepresentative.represented = rep.represented.map(p => {
        const pd = { ...(p.display || {}) };
        pd.registrationClause = buildRegistrationClauseForPerson(p);
        return { ...p, display: pd };
      });
    }
  }

  // --- Tenants (новое) ---
  if (Array.isArray(data?.tenants)) {
    data.tenants = data.tenants.map(t => {
      const d = { ...(t.display || {}) };
      d.registrationClause = buildRegistrationClauseForPerson(t);
      if (t.representative) {
        const rd = { ...(t.representative.display || {}) };
        rd.registrationClause = buildRegistrationClauseForPerson(t.representative);
        t = { ...t, representative: { ...t.representative, display: rd } };
      }
      return { ...t, display: d };
    });
  }
  if (data?.tenantsRepresentative) {
    const rep = data.tenantsRepresentative;
    const rd = { ...(rep.display || {}) };
    rd.registrationClause = buildRegistrationClauseForPerson(rep);
    data.tenantsRepresentative = { ...rep, display: rd };
    if (Array.isArray(rep.represented)) {
      data.tenantsRepresentative.represented = rep.represented.map(p => {
        const pd = { ...(p.display || {}) };
        pd.registrationClause = buildRegistrationClauseForPerson(p);
        return { ...p, display: pd };
      });
    }
  }

  return data;
}


function promoteCommonRepresentative(data) {
  if (!Array.isArray(data?.landlords) || data.landlords.length === 0) return data;
  // если общий представитель уже задан — выходим
  // если наймодатель один — НЕ переводим в режим общего представителя
  if (data.landlords.length === 1) return data;

  if (data.landlordsRepresentative && String(data.landlordsRepresentative.fullName || '').trim()) {
    return data;
  }

  // проверяем, что у КАЖДОГО наймодателя есть представитель и он один и тот же (ФИО + паспорт)
  const keys = new Set();
  let commonRep = null;
  for (const l of data.landlords) {
    const rep = l?.representative;
    const key = buildRepKey(rep);
    if (!key) return data; // хотя бы у одного нет представителя → общего нет
    keys.add(key);
    if (!commonRep) commonRep = rep;
  }
  if (keys.size !== 1) return data; // разные представители → общего нет

  // готовим список представляемых (проставим lastInGroup для запятых в шаблоне)
  const represented = data.landlords.map((l, i, arr) => ({
    ...l,
    display: { ...(l.display || {}), lastInGroup: i < arr.length - 1 }
  }));

  // формируем общий представитель + список
  data.landlordsRepresentative = { ...commonRep, represented };

  // чтобы индивидуальные абзацы не печатались (на всякий случай)
  data.landlords = data.landlords.map(l => ({ ...l, inRepGroup: true }));

  // опционально обнулим группы (они не нужны при общем представителе)
  data.calc = data.calc || {};
  data.calc.landlordRepGroups = [];

  return data;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
// собирает компактную карточку с паспортом и адресом (используется для представителя/наймодателя)
function buildPersonShortHtml(p) {
  const fio = escapeHtml(p.display?.fio?.nom || p.fullName || '');
  const gender = p.display?.genderWord ? escapeHtml(p.display.genderWord) : '';
  const birth = p.display?.birthDateText ? escapeHtml(p.display.birthDateText) : '';
  const birthPlace = p.birthPlace ? escapeHtml(p.birthPlace) : '';

  // отдельные паспортные поля (если есть)
  const passportSummary = p.display?.passportSummary ? escapeHtml(p.display.passportSummary) : '';
  const passportSeries = p.display?.passportSeries ? escapeHtml(p.display.passportSeries) : '';
  const passportNumber = p.display?.passportNumber ? escapeHtml(p.display.passportNumber) : '';
  const passportIssued = p.passportIssued ? escapeHtml(p.passportIssued) : '';
  const passportIssueDate = p.display?.issueDateText ? escapeHtml(p.display.issueDateText) : '';
  const departmentCode = (p.departmentCode || p.display?.departmentCode) ? escapeHtml(p.departmentCode || p.display.departmentCode) : '';

  const regText = buildRegistrationText(p);
  const reg = regText ? escapeHtml(regText) : '';


  const parts = [fio];
  if (gender) parts.push(`пол: ${gender}`);
  if (birth) parts.push(`дата рождения: ${birth} рождения`);
  if (birthPlace) parts.push(`место рождения: ${birthPlace}`);

  if (passportSummary) {
    parts.push(`паспорт гражданина Российской Федерации: ${passportSummary}`);
  } else {
    const passParts = [];
    if (passportSeries) passParts.push(`серия: ${passportSeries}`);
    if (passportNumber) passParts.push(`номер: ${passportNumber}`);
    if (passportIssued) passParts.push(`выдан: ${passportIssued}`);
    if (passportIssueDate) passParts.push(`дата выдачи: ${passportIssueDate}`);
    if (departmentCode) passParts.push(`код подразделения: ${departmentCode}`);
    if (passParts.length) parts.push(`паспорт гражданина Российской Федерации: ${passParts.join(', ')}`);
  }

  if (reg) parts.push(`зарегистрирован(а) по адресу: ${reg}`);
  return parts.join(', ');
}
// Вывод "короткой карточки" с ФИО в выбранном падеже (gen/nom)
function buildPersonShortHtmlWithCase(p, fioCase = 'nom') {
  const fio =
    fioCase === 'gen'
      ? escapeHtml(p.display?.fio?.gen || p.fullName || '')
      : escapeHtml(p.display?.fio?.nom || p.fullName || '');

  const gender = p.display?.genderWord ? escapeHtml(p.display.genderWord) : '';
  const birth = p.display?.birthDateText ? escapeHtml(p.display.birthDateText) : '';
  const birthPlace = p.birthPlace ? escapeHtml(p.birthPlace) : '';

  // паспорт (используем свёртку, иначе собираем по частям)
  const passportSummary = p.display?.passportSummary ? escapeHtml(p.display.passportSummary) : '';
  const passportSeries = p.display?.passportSeries ? escapeHtml(p.display.passportSeries) : '';
  const passportNumber = p.display?.passportNumber ? escapeHtml(p.display.passportNumber) : '';
  const passportIssued = p.passportIssued ? escapeHtml(p.passportIssued) : '';
  const passportIssueDate = p.display?.issueDateText ? escapeHtml(p.display.issueDateText) : '';
  const departmentCode = (p.departmentCode || p.display?.departmentCode) ? escapeHtml(p.departmentCode || p.display.departmentCode) : '';

  const regText = buildRegistrationText(p);
  const reg = regText ? escapeHtml(regText) : '';

  const parts = [fio];
  if (gender) parts.push(`пол: ${gender}`);
  if (birth) parts.push(`дата рождения: ${birth} рождения`);
  if (birthPlace) parts.push(`место рождения: ${birthPlace}`);

  if (passportSummary) {
    parts.push(`паспорт гражданина Российской Федерации: ${passportSummary}`);
  } else {
    const passParts = [];
    if (passportSeries) passParts.push(`серия: ${passportSeries}`);
    if (passportNumber) passParts.push(`номер: ${passportNumber}`);
    if (passportIssued) passParts.push(`выдан: ${passportIssued}`);
    if (passportIssueDate) passParts.push(`дата выдачи: ${passportIssueDate}`);
    if (departmentCode) passParts.push(`код подразделения: ${departmentCode}`);
    if (passParts.length) parts.push(`паспорт гражданина Российской Федерации: ${passParts.join(', ')}`);
  }

  if (reg) parts.push(`зарегистрирован(а) по адресу: ${reg}`);

  return parts.join(', ');
}

// если display.registrationClause пуст, попробуем собрать адрес регистрации из полей
function buildRegistrationText(p) {
  // 1) если уже есть готовая строка — используем её
  const ready = p?.display?.registrationClause;
  if (ready && String(ready).trim()) return String(ready).trim();

  // 2) пробуем «сырые» поля
  const raw =
    p.registrationAddress
    || p.registration
    || p.addressRegistration
    || '';

  if (raw && String(raw).trim()) return String(raw).trim().replace(/\s*,\s*$/, '');

  // 3) конструктор по частям (если структура хранится раздельно)
  const parts = [];
  const city   = p.registrationCity   || p.city;
  const region = p.registrationRegion || p.region;
  const street = p.registrationStreet || p.street;
  const house  = p.registrationHouse  || p.house;
  const corp   = p.registrationCorp   || p.corp || p.building;
  const flat   = p.registrationFlat   || p.flat || p.apartment;

  if (region) parts.push(region);
  if (city)   parts.push(city);
  if (street) parts.push(street);
  if (house)  parts.push(`д. ${house}`);
  if (corp)   parts.push(`корп. ${corp}`);
  if (flat)   parts.push(`кв. ${flat}`);

  const built = parts.join(', ').trim().replace(/\s*,\s*$/, '');
  return built;
}

function buildRepresentativeGroups(data) {
  if (data?.landlordsRepresentative?.fullName) {
    data.calc = data.calc || {};
    data.calc.landlordRepGroups = [];
    return data;
  }

  const groupsMap = new Map();
  // собираем только тех, у кого представитель указан
  for (const l of (Array.isArray(data.landlords) ? data.landlords : [])) {
    const rep = l?.representative;
    const key = buildRepKey(rep);
    if (!key) continue; // нет представителя
    if (!groupsMap.has(key)) {
      groupsMap.set(key, { representative: rep, represented: [] });
    }
    // кладём полную карточку наймодателя (нам нужны display.*, пол, паспорт и т.п.)
    groupsMap.get(key).represented.push(l);
  }

  // оставляем только группы, где представитель обслуживает 2+
  const groups = [];
  for (const g of groupsMap.values()) {
    if (g.represented.length >= 2) {
      // проставим "запятые" для перечисления представляемых
      g.represented = g.represented.map((p, idx, arr) => {
        // скопируем, чтобы не трогать исходные объекты
        const copy = { ...p, display: { ...(p.display || {}) } };
        copy.display.lastInGroup = idx < arr.length - 1;
        // на всякий — сразу подготовим registrationClause у представляемого
        copy.display.registrationClause = copy.display.registrationClause ?? buildRegistrationClauseForPerson(copy);
        return copy;
      });

      // >>> INSERTED: гарантируем registrationClause у самого представителя группы
      {
        const rep = g.representative || {};
        const repDisp = { ...(rep.display || {}) };
        repDisp.registrationClause = repDisp.registrationClause ?? buildRegistrationClauseForPerson(rep);
        g.representative = { ...rep, display: repDisp };
      }
      // <<< INSERTED

      // >>> REPLACED: пересобираем representedHtml без двойных запятых
      g.representedHtml = g.represented.map((p, idx, arr) => {
        const parts = [];
        parts.push('<p style="text-indent: 2em;">');

        parts.push(`${escapeHtml(p.fullName)}, пол: ${escapeHtml(p.display?.genderWord || '')},`);
        if (p.birthDate)  parts.push(` дата рождения: ${escapeHtml(p.display?.birthDateText || '')} рождения,`);
        if (p.birthPlace) parts.push(` место рождения: ${escapeHtml(p.birthPlace)}`);

        parts.push(`, паспорт гражданина Российской Федерации`);
        if (p.display?.passportSeries) parts.push(`: серия: ${escapeHtml(p.display.passportSeries)}`);
        if (p.display?.passportNumber) parts.push(` номер: ${escapeHtml(p.display.passportNumber)},`);
        if (p.passportIssued)          parts.push(` выдан: ${escapeHtml(p.passportIssued)}`);
        if (p.issueDate)               parts.push(` дата выдачи: ${escapeHtml(p.display?.issueDateText || '')},`);
        if (p.departmentCode)          parts.push(` код подразделения: ${escapeHtml(p.departmentCode)},`);

        // готовая фраза о регистрации (учитывает previous/temporary/none)
        const regClause = (p.display?.registrationClause) ?? buildRegistrationClauseForPerson(p);
        parts.push(regClause);

        // «именуемый(ая) в дальнейшем …» + запятая у всех, кроме последнего
        const namedLater = p.display?.namedLater || '';
        const namedAs    = p.display?.namedAs || '';
        const tailComma  = (idx < arr.length - 1) ? ',' : '';
        if (namedLater && namedAs) {
          parts.push(` ${escapeHtml(namedLater)} «${escapeHtml(namedAs)}»${tailComma}`);
        }

        parts.push('</p>');

        // подчищаем потенциальные двойные запятые
        let html = parts.join('');
        html = html.replace(/,\s*,/g, ', ');
        return html;
      }).join('\n');
      // <<< REPLACED

      groups.push(g);
    }
  }

  // отметим тех наймодателей, кого надо скрыть из обычного списка
  if (groups.length) {
    const inGroupSet = new Set();
    for (const g of groups) {
      for (const p of g.represented) {
        inGroupSet.add(p.fullName + '|' + (p.passport || '')); // грубое совпадение; при желании усложним
      }
    }
    data.landlords = data.landlords.map(l => {
      const mark = l.fullName + '|' + (l.passport || '');
      return { ...l, inRepGroup: inGroupSet.has(mark) };
    });
  }

  // положим группы в calc, чтобы не засорять корень
  data.calc = data.calc || {};
  data.calc.landlordRepGroups = groups;
  return data;
}


function markShowNamedLaterForLandlords(data) {
  data.calc = data.calc || {};
  // Если наймодатель один — в строке человека "именуемый…" прячем (останется только финальный абзац)
  const showInLine = !(data.calc.landlordsCountIsOne === true);

  // 1) Обычные наймодатели
  if (Array.isArray(data.landlords)) {
    data.landlords = data.landlords.map((l) => {
      const showNamed = showInLine || !!l.inRepGroup; // в группах показываем всегда
      const d = { ...(l.display || {}) };

      const namedLater = d.namedLater || '';
      const namedAs    = d.namedAs || '';
      // если наймодателей больше одного — ставим запятую у КАЖДОГО (в т.ч. у последнего)
      const multi = data?.calc?.landlordsCountIsOne === false;
      const endComma = multi ? ',' : '';
      const namedFull = (namedLater && namedAs) ? `${namedLater} «${namedAs}»${endComma}` : '';


      return {
        ...l,
        display: { ...d, showNamedLaterInLine: showNamed, namedFull }
      };
    });
  }

  // 2) Представляемые у общего представителя (Вариант 1)
  if (data.landlordsRepresentative && Array.isArray(data.landlordsRepresentative.represented)) {
    data.landlordsRepresentative.represented =
      data.landlordsRepresentative.represented.map((p) => {
        const d = { ...(p.display || {}) };

        const namedLater = d.namedLater || '';
        const namedAs    = d.namedAs || '';
        const lastComma  = d.lastInGroup ? ',' : '';
        const namedFull  = (namedLater && namedAs) ? `${namedLater} «${namedAs}»${lastComma}` : '';
        const showRepNamed = !(data?.calc?.landlordsCountIsOne === true);

        return {
          ...p,
          // у представляемых внутри общего представителя показываем всегда
          display: { ...d, showNamedLaterInLine: showRepNamed, namedFull }

        };
      });
  }

  return data;
}

// ======= Ownership docs (1.2) — поддержка долей у одного наймодателя =======
function buildLandlordsBasisHtml(data) {
  const landlords = Array.isArray(data?.landlords) ? data.landlords : [];
  if (!landlords.length) return '';

  const many = landlords.length > 1;
  const parts = [];

  landlords.forEach((l, li) => {
    const groups = Array.isArray(l.documents) ? l.documents : [];

    // Заголовок поднаймодателя только если их больше одного
    if (many) {
      parts.push(`<p>— «Наймодателю ${li + 1}»:</p>`);
    }

    // --- Определяем режим "по группам" (для долей у одного наймодателя) ---
    // Если один наймодатель и среди групп разные regDate/рег.№ -> ЕГРН после каждой группы
    let distinctRegs = new Set();
    for (const g of groups) {
      const key = `${g?.regDate || ''}|${g?.regNumber || ''}`;
      if (key !== '|') distinctRegs.add(key);
    }
    const oneLandlord = !many;
    const perGroupEgrn = oneLandlord && distinctRegs.size > 1;

    if (perGroupEgrn) {
      // --- Режим "по группам" ---
      groups.forEach((g, gi) => {
        const docs = Array.isArray(g.basisDocuments) ? g.basisDocuments : [];

        // 1) Документы группы
        docs.forEach((b, di) => {
          const isLastDocInGroup = di === docs.length - 1;
          let line = '• ' + escapeHtml(insertShareWord(b?.title || ''));
          if (b?.docDate) {
            const dt = ensureGoda(formatDateLongLocal(b.docDate));
            line += `, от ${escapeHtml(dt)}`;
          }
          const tail = isLastDocInGroup ? ',' : ';';
          parts.push(`<p>${line}${tail}</p>`);
        });

        // 2) ЕГРН этой группы
        if (g?.regDate || g?.regNumber) {
          let eg = 'о чём в Едином государственном реестре недвижимости сделана запись о государственной регистрации права';
          if (g.regDate) eg += ` от ${escapeHtml(ensureGoda(formatDateLongLocal(g.regDate)))}`;
          if (g.regNumber) eg += `, номер записи: ${escapeHtml(g.regNumber)}`;
          const isLastGroup = gi === groups.length - 1 && li === landlords.length - 1;
          parts.push(`<p>${eg}${isLastGroup ? '.' : ';'}</p>`);
        }
      });

      return; // к следующему наймодателю
    }

    // --- Обычный режим (как раньше): все документы, затем ОДНА ЕГРН-строка ---
    const flat = [];
    groups.forEach(g => {
      const docs = Array.isArray(g.basisDocuments) ? g.basisDocuments : [];
      docs.forEach(b => flat.push({ b, g }));
    });

    flat.forEach((it, idx) => {
      const isLastDocOfLandlord = idx === flat.length - 1;
      let line = '• ' + escapeHtml(insertShareWord(it.b?.title || ''));
      if (it.b?.docDate) {
        line += `, от ${escapeHtml(ensureGoda(formatDateLongLocal(it.b.docDate)))}`;
      }
      parts.push(`<p>${line}${isLastDocOfLandlord ? ',' : ';'}</p>`);
    });

    // ЕГРН на уровне наймодателя (или фолбэк из последней группы)
    let regDate = l?.regDate;
    let regNum  = l?.regNumber;
    if (!regDate || !regNum) {
      for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i];
        if (!regDate && g?.regDate)   regDate = g.regDate;
        if (!regNum  && g?.regNumber) regNum  = g.regNumber;
        if (regDate || regNum) break;
      }
    }
    if (regDate || regNum) {
      let eg = 'о чём в Едином государственном реестре недвижимости сделана запись о государственной регистрации права';
      if (regDate) eg += ` от ${escapeHtml(ensureGoda(formatDateLongLocal(regDate)))}`;
      if (regNum)  eg += `, номер записи: ${escapeHtml(regNum)}`;
      const isLastLandlord = li === landlords.length - 1;
      parts.push(`<p>${eg}${isLastLandlord ? '.' : ';'}</p>`);
    }
  });

  return parts.join('\n');
}
// === Простейшая пропись суммы в рублях (только целые, до миллионов) ===
function rublesToWordsTitleCase(n) {
  n = Math.floor(Math.max(0, Number(n) || 0));
  const ones = ['ноль','один','два','три','четыре','пять','шесть','семь','восемь','девять'];
  const onesF = ['ноль','одна','две','три','четыре','пять','шесть','семь','восемь','девять'];
  const teens = ['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
  const tens = ['','десять','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
  const hund = ['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];
  function triadToWords(num, female=false) {
    const a = num % 10, b = Math.floor(num / 10) % 10, c = Math.floor(num / 100);
    let out = [];
    if (c) out.push(hund[c]);
    if (b === 1) out.push(teens[a]);
    else {
      if (b) out.push(tens[b]);
      if (a) out.push((female ? onesF : ones)[a]);
    }
    return out.join(' ');
  }
  function unitName(n, forms) { // формы: ['тысяча','тысячи','тысяч']
    const a = n % 10, b = Math.floor(n/10)%10;
    if (b === 1) return forms[2];
    if (a === 1) return forms[0];
    if (a >= 2 && a <= 4) return forms[1];
    return forms[2];
  }
  const parts = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const rub = n % 1_000;

  if (millions) parts.push(triadToWords(millions), unitName(millions, ['миллион','миллиона','миллионов']));
  if (thousands) parts.push(triadToWords(thousands, true), unitName(thousands, ['тысяча','тысячи','тысяч']));
  if (rub || parts.length===0) parts.push(triadToWords(rub, false));

  let text = parts.join(' ').replace(/\s+/g,' ').trim();
  if (!text) text = 'ноль';
  // Заглавная первая буква
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// === Обогащение участников для блока "Подписи" ===
// добавляем: item.current.{ ...копия полей..., index, representative.attorneyDateFormatted }
// и ссылку item.calc на общий calc, чтобы внутри data-repeat сработали условия вида data-if="calc.multipleLandlords"
function decorateForSignatures(arr, calc, formatDateLongLocal) {
  if (!Array.isArray(arr)) return arr;
  return arr.map((p, i) => {
    const current = { ...p, index: i + 1 };

    if (current?.representative?.attorneyDate && !current.representative.attorneyDateFormatted) {
      current.representative = {
        ...current.representative,
        attorneyDateFormatted: formatDateLongLocal(current.representative.attorneyDate)
      };
    }
    // возвращаем элемент с доп. полями для шаблона
    return {
      ...p,
      current,   // чтобы работали data-ph="current.fullName", data-ph="current.index", ...
      calc       // чтобы работали data-if="calc.multipleLandlords" внутри repeat
    };
  });
}

function assignLandlordsNamedAs(data) {
  data.calc = data.calc || {};
  const total = Array.isArray(data.landlords) ? data.landlords.length : 0;

  // 1) Базовая нумерация для всех наймодателей (до группировок)
  if (Array.isArray(data.landlords)) {
    const multi = total > 1;
    let idx = 1;
    data.landlords = data.landlords.map(l => {
      const d = { ...(l.display || {}) };
      // Именуемый/именуемая
      const g = String(l.gender || '').toLowerCase();
      d.namedLater = (g === 'female') ? 'именуемая в дальнейшем' : 'именуемый в дальнейшем';
      // Название с номером (если их несколько)
      d.namedAs = multi ? `Наймодатель ${idx++}` : 'Наймодатель';
      return { ...l, display: d };
    });
  }

  // 2) Если есть общий представитель для всех — его .represented уже будет напечатан как один список.
  // 3) Для групп внутри ВАРИАНТА 2 (один представитель на нескольких) нумеруем внутри группы:
  if (data.calc && Array.isArray(data.calc.landlordRepGroups)) {
    for (const g of data.calc.landlordRepGroups) {
      if (!Array.isArray(g.represented)) continue;
      g.represented = g.represented.map((p, i) => {
        const d = { ...(p.display || {}) };
        d.namedAs = (g.represented.length > 1) ? `Наймодатель ${i + 1}` : 'Наймодатель';
        // namedLater уже задан выше, оставляем
        return { ...p, display: d };
      });
    }
  }  

  return data;
}

function stripEditorHints(html) {
  if (!html) return html;
  // вырезать любые элементы, у которых есть атрибут data-hint
  return html
    // теги с data-hint, включая их содержимое:
    .replace(/<([a-z0-9:-]+)\b[^>]*\bdata-hint\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    // однотеговые (на всякий случай, если когда-то появятся):
    .replace(/<([a-z0-9:-]+)\b[^>]*\bdata-hint\b[^>]*\/>/gi, '');
}
// === enforceInlineAlignment: проставляем inline-выравнивание заголовкам и абзацам ===
function enforceInlineAlignment(html) {
  if (!html || typeof html !== 'string') return html;

  // 1) Заголовки: всегда по центру (сохраняя уже имеющийся style)
  html = html.replace(
    /<h([1-6])([^>]*)>/gi,
    (m, lvl, attrs) => {
      // вытащим style, добавим/заменим text-align:center;
      const hasStyle = /style\s*=/.test(attrs);
      if (hasStyle) {
        // если style уже есть — впишем/заменим text-align
        attrs = attrs.replace(
          /style\s*=\s*"(.*?)"/i,
          (mm, styleVal) => {
            // удалим прежний text-align и добавим center
            let s = styleVal.replace(/text-align\s*:\s*[^;"]+;?/i, '').trim();
            if (s && !s.endsWith(';')) s += ';';
            return `style="${s} text-align:center;"`;
          }
        );
      } else {
        attrs += ` style="text-align:center;"`;
      }
      return `<h${lvl}${attrs}>`;
    }
  );

  // 2) Абзацы: по ширине (justify), кроме:
  //    - ячеек таблицы (в них и так часто inline уже стоит)
  //    - списков (<li>), TipTap их сам разрулит
  //    тут простой подход: проставим всем <p>, у которых НЕТ text-align
  html = html.replace(
    /<p(?![^>]*text-align)([^>]*)>/gi,
    (m, attrs) => {
      const hasStyle = /style\s*=/.test(attrs);
      if (hasStyle) {
        return m.replace(
          /style\s*=\s*"(.*?)"/i,
          (mm, styleVal) => {
            let s = styleVal;
            // если вдруг где-то уже есть text-align:left — заменим
            s = s.replace(/text-align\s*:\s*[^;"]+;?/i, '').trim();
            if (s && !s.endsWith(';')) s += ';';
            return `style="${s} text-align:justify; text-justify:inter-word;"`;
          }
        );
      }
      return `<p style="text-align:justify; text-justify:inter-word;"${attrs}>`;
    }
  );

  return html;
}
// Принудительные разрывы страниц для DOCX: добавляем пустой <p> перед заголовками приложений
function insertDocxPageBreaks(html) {
  if (!html || typeof html !== 'string') return html;

  const dom = new JSDOM(`<body>${html}</body>`);
  const { document } = dom.window;

  const hasPageBreakStyle = element => {
    if (!element || element.nodeType !== 1) return false;
    const style = String(element.getAttribute('style') || '').toLowerCase();
    return (
      /page-break-(before|after)\s*:\s*always/.test(style) ||
      /break-(before|after)\s*:\s*page/.test(style) ||
      /mso-break-(before|after)\s*:\s*page/.test(style)
    );
  };
  

  const ensurePageBreakBefore = element => {
    if (!element || element.nodeType !== 1) return;
    // если прямо перед заголовком уже есть элемент с разрывом — ничего не делаем
    const prev = element.previousElementSibling;
    if (hasPageBreakStyle(prev)) return;

    const p = document.createElement('p');
    p.setAttribute(
      'style',
      'page-break-before: always; break-before: page; mso-break-before: page; mso-break-type: page;'
    );
    const span = document.createElement('span');
    span.appendChild(document.createTextNode(' '));
    p.appendChild(span);

    element.parentNode.insertBefore(p, element);
  };

  const targetPatterns = [
    /Приложение\s*№\s*1/i,
    /Приложение\s*№\s*2/i,
    /Приложение\s*№\s*3/i,
    /Расписка\s+о\s+получении\s+денежных\s+средств/i,
  ];

  const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
  headings.forEach(heading => {
    const text = (heading.textContent || '').trim();
    if (!text) return;

    if (!targetPatterns.some(pattern => pattern.test(text))) return;

    ensurePageBreakBefore(heading);

    const currentStyle = heading.getAttribute('style') || '';
    if (!/page-break-before\s*:\s*always/i.test(currentStyle)) {
      const normalized = `${currentStyle};page-break-before: always; break-before: page; mso-break-before: page;`;
      heading.setAttribute('style', normalized.replace(/;;+/g, ';'));
    }
  });

  return document.body.innerHTML;
}

// 1) GET template for editor (with data substituted if available)
router.get('/docs/:id/editor', async (req, res) => {
  try {
    const docType = await resolveDocumentType(req);
    const html = getFreshTemplate(docType);
    const info = getTemplateInfoByType(docType);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Жёстко выключаем кеш на любом уровне
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Для отладки пробрасываем md5 шаблона
    res.setHeader('X-Document-Type', docType);
    res.setHeader('X-Template-MD5', info.md5);
    res.send(html);
  } catch (e) {
    console.error('Error in /docs/:id/editor:', e);
    res.status(500).send('Template load error');
  }
});


// 2) Server-side render (substitute formData into the HTML template)
router.post('/docs/:id/render', async (req, res) => {
  try {
    const htmlInput = req.body.html || req.body.content || '';
    let data = req.body.data || req.body.formData || {};

    // отключаем кеширование ответа
    res.setHeader('Cache-Control', 'no-store');
    console.log('[/render] Input HTML length:', htmlInput.length);
    console.log('[/render] Data keys:', Object.keys(data));
    const docType = normalizeDocumentType(await resolveDocumentType(req, data));
    if (docType === 'maternity_capital_shares') {
      const renderData = buildMaternityCapitalSharesRenderData({ ...data, documentType: docType });
      const finalHtml = renderFinalHtml(htmlInput, renderData);
      return res.json({ ok: true, html: finalHtml, data: renderData });
    }

    // ===================== LANDLORDS =====================
    normalizeLandlords(data);

    data.calc = data.calc || {};
    // Счётчики
    data.calc.landlordsCount = Array.isArray(data.landlords) ? data.landlords.length : 0;
    data.calc.landlordsCountIsOne = data.calc.landlordsCount === 1;

    // Метки по падежам — Наймодатель/Наймодатели
    {
      const L = buildGroupLabels('landlord', data.calc.landlordsCountIsOne);
      data.calc.landlordsGroupLabel              = L.nominative;    // Именительный
      data.calc.landlordsGroupLabelGenitive      = L.genitive;      // Родительный
      data.calc.landlordsGroupLabelDative        = L.dative;        // Дательный
      data.calc.landlordsGroupLabelAccusative    = L.accusative;    // Винительный
      data.calc.landlordsGroupLabelInstrumental  = L.instrumental;  // Творительный
      data.calc.landlordsGroupLabelPrepositional = L.prepositional; // Предложный
    }
    // --- Определение пола единственного Наймодателя и слово "именуемый/именуемая"
    function detectPersonGender(p) {
      const gw = (p?.display?.genderWord || '').toString().toLowerCase();
      if (p?.gender === 'female' || gw === 'женский') return 'female';
      if (p?.gender === 'male'   || gw === 'мужской') return 'male';
      return 'male'; // безопасный дефолт
    }

    if (data.calc.landlordsCountIsOne) {
      const L = Array.isArray(data.landlords) ? data.landlords : [];
      const g = detectPersonGender(L[0] || {});
      data.calc._singleLandlordGender = g; // внутренний флаг
      data.calc.landlordsNamedWord = (g === 'female') ? 'именуемая' : 'именуемый';
    } else {
      data.calc._singleLandlordGender = 'male';
      data.calc.landlordsNamedWord = ''; // не используется во множественной ветке
    }

    // Глаголы
    data.calc.landlordsVerbProvide = data.calc.landlordsCountIsOne
      ? 'обязуется предоставить'
      : 'обязуются предоставить';
    // для конструкций вида «подтвержда(ет/ют)»
    data.calc.landlordsConfirmVerb = data.calc.landlordsCountIsOne ? 'ет' : 'ют';
    // 5.4. осуществляют\ осуществляет
    data.calc.landlordsDoVerb = data.calc.landlordsCountIsOne ? 'осуществляет' : 'осуществляют';
    data.calc.landlordsTransferVerb = data.calc.landlordsCountIsOne ? 'передал' : 'передали';
    // для расписки
    data.calc.landlordsAcceptVerb = data.calc.landlordsCountIsOne
      ? (data.calc._singleLandlordGender === 'female' ? 'получила' : 'получил')
      : 'получили';


    // HTML оснований права собственности (если используешь этот вывод)
    data.calc.landlordsBasisHtml = buildLandlordsBasisHtml(data);

    // Представители / отображение наймодателей
    promoteCommonRepresentative(data);
    ensureRepresentativesDisplay(data);
    assignLandlordsNamedAs(data);
    buildRepresentativeGroups(data);
    markShowNamedLaterForLandlords(data);

    // ====================== TENANTS ======================
    normalizeTenants(data);

    data.calc.tenantsCount = Array.isArray(data.tenants) ? data.tenants.length : 0;
    data.calc.tenantsCountIsOne = data.calc.tenantsCount === 1;
    // Метки по падежам — Наниматель/Наниматели
    {
      const T = buildGroupLabels('tenant', data.calc.tenantsCountIsOne);
      data.calc.tenantsGroupLabel              = T.nominative;
      data.calc.tenantsGroupLabelGenitive      = T.genitive;
      data.calc.tenantsGroupLabelDative        = T.dative;
      data.calc.tenantsGroupLabelAccusative    = T.accusative;
      data.calc.tenantsGroupLabelInstrumental  = T.instrumental;
      data.calc.tenantsGroupLabelPrepositional = T.prepositional;
    }
    // --- Определение пола единственного Нанимателя и слово "именуемый/именуемая"
    if (data.calc.tenantsCountIsOne) {
      const T = Array.isArray(data.tenants) ? data.tenants : [];
      const g = detectPersonGender(T[0] || {});
      data.calc.tenantsNamedWord = (g === 'female') ? 'именуемая' : 'именуемый';
    } else {
      data.calc.tenantsNamedWord = '';
    }

    // ===== НОРМАЛИЗУЕМ СПОСОБ ОПЛАТЫ И СТАВИМ ФЛАГИ =====
    data.terms = data.terms || {};
    const pmRaw = String(data.terms.paymentMethod || '');
    const pm = pmRaw.trim().toLowerCase();
    // перезатираем на нормализованное значение — так шаблон сработает по == 'bank'/'cash'
    data.terms.paymentMethod = pm;
    data.terms.paymentMethodIsCash = (pm === 'cash');
    data.terms.paymentMethodIsBank = (pm === 'bank');
    // диагностика
    console.log('[pay] method raw="%s" → pm="%s" | cash=%s bank=%s',
      
      pmRaw, pm, data.terms.paymentMethodIsCash, data.terms.paymentMethodIsBank);
    
    // ===== РАСЧЁТ ДЛЯ РАСПИСКИ (calc.receipt.*) =====
      (function buildReceipt() {
        const calc = data.calc = data.calc || {};
        const t = data.terms = data.terms || {};

        // 1) «Я/Мы» и глаголы «получил/получили»
        const one = !!calc.landlordsCountIsOne;
        const pronoun = one ? 'Я,' : 'Мы,';
        calc.receipt = calc.receipt || {};
        calc.receipt.landlordsPronoun = pronoun;
        calc.receipt.landlordsPronounCapitalized = pronoun;

        // определим пол единственного наймодателя (если он один)
        let singleGender = 'male';
        if (one) {
          const L = Array.isArray(data.landlords) ? data.landlords : [];
          const first = L[0] || {};
          const gw = (first.display && first.display.genderWord) ? String(first.display.genderWord).toLowerCase() : '';
          singleGender = (first.gender === 'female' || gw === 'женский') ? 'female' : 'male';
        }
        calc.receipt.landlordsVerbReceived = one
          ? (singleGender === 'female' ? 'получила' : 'получил')
          : 'получили';

        calc.receipt.landlordsVerbReceivedPast = 'получены';
        calc.receipt.landlordsPronounInstr = one ? 'мной' : 'нами';
        calc.receipt.noClaimsVerb = one ? 'не имею' : 'не имеем';



        // 2) Даты периода: с даты начала договора по +1 месяц
        const start = parseAnyDateLocal(t.startDate) || new Date();
        function addMonthsSafeLocal(dateObj, months) {
          const d = new Date(dateObj.getTime());
          const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
          const target = new Date(y, m + months + 1, 0); // последний день целевого месяца
          const clampedDay = Math.min(day, target.getDate());
          return new Date(y, m + months, clampedDay);
        }
        calc.receipt.periodStartLong = ensureGoda(formatDateLongLocal(start));
        calc.receipt.periodEndLong   = ensureGoda(formatDateLongLocal(addMonthsSafeLocal(start, 1)));

        // 3) Утилиты чисел
        const spaced = (n) => Number(n).toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
        const toNumber = (v) => {
          if (v == null) return 0;
          const s = String(v).replace(/\s/g, '').replace(',', '.');
          const num = Number(s);
          return isNaN(num) ? 0 : num;
        };
        // 3.1 Форматтер денег: руб/коп + прописью (капитализация)
        function makeMoneyParts(amount) {
          let n = Number(amount);
          if (!isFinite(n)) n = 0;
          n = Math.round(n * 100) / 100;
          const rub = Math.floor(n);
          const kop = Math.round((n - rub) * 100);
          const kopStr = String(kop).padStart(2, '0');

          const rubWord = (function ruRub(n) {
            const a = n % 10, b = Math.floor(n / 10) % 10;
            if (b === 1) return 'рублей';
            if (a === 1) return 'рубль';
            if (a >= 2 && a <= 4) return 'рубля';
            return 'рублей';
          })(rub);

          const kopWord = (function ruKop(k) {
            const a = k % 10, b = Math.floor(k / 10) % 10;
            if (b === 1) return 'копеек';
            if (a === 1) return 'копейка';
            if (a >= 2 && a <= 4) return 'копейки';
            return 'копеек';
          })(Number(kopStr));

          return {
            rub,
            kop: kopStr,
            formatted: spaced(rub),                 // "50 000"
            words: rublesToWordsTitleCase(rub),     // "Пятьдесят тысяч"
            rubWord,                                // "рубль/рубля/рублей"
            kopWord                                 // "копейка/копейки/копеек"
          };
        }


        // 4) Аренда за первый месяц — берём из первых подходящих полей
        const rentCandidates = [
          t.rentMonthlyAmount,
          t.rentAmount,
          t.monthlyRent,
          t.rentPerMonth,
          t?.rent?.amount
        ];
        let rentFirstMonth = 0;
        for (const c of rentCandidates) { const n = toNumber(c); if (n > 0) { rentFirstMonth = n; break; } }

        // 5) Обеспечительный платёж (внесён «при подписании»)
        const sd = t.securityDeposit || {};
        const sdAmt = toNumber(sd.amount ?? t.securityDepositAmount);
        const sdN = Number(sd.installmentsCount || 1);
        const sdSplit = String(sd.paymentMethod || '').toLowerCase() === 'installments' && sdN > 1;
        const depositUpfront = sdAmt > 0 ? (sdSplit ? Math.round(sdAmt * 100 / sdN) / 100 : sdAmt) : 0;

        // 6) Предоплата за последний месяц (внесённая «при подписании»)
        const lm = t.lastMonthRentPrepayment || {};
        const lmAmt = toNumber(lm.amount ?? t.lastMonthPrepayAmount);
        const lmN = Number(lm.installmentsCount || 1);
        const lmSplit = String(lm.paymentMethod || '').toLowerCase() === 'installments' && lmN > 1;
        const lastMonthUpfront = lmAmt > 0 ? (lmSplit ? Math.round(lmAmt * 100 / lmN) / 100 : lmAmt) : 0;

        // 7) Значения для шаблона
        // для data-if
        calc.receipt.depositUpfrontCents   = Math.round(depositUpfront * 100);
        calc.receipt.lastMonthUpfrontCents = Math.round(lastMonthUpfront * 100);

        // Объекты денег со всеми частями
        calc.receipt.rentFirstMonth   = makeMoneyParts(rentFirstMonth);
        calc.receipt.depositUpfront   = makeMoneyParts(depositUpfront);
        calc.receipt.lastMonthUpfront = makeMoneyParts(lastMonthUpfront);

        const total = rentFirstMonth + depositUpfront + lastMonthUpfront;
        calc.receipt.totalAtSigning = makeMoneyParts(total);

      })();
      // === Собираем финальный HTML расписки (генерируется только при оплате 'cash') ===
      function buildReceiptHtml(data) {
        const calc = data.calc || {};
        const t = data.terms || {};

        if (String(t.paymentMethod || '').toLowerCase() !== 'cash') return '';

        const pageBreak =
          '<p style="page-break-before:always; break-before:page; page-break-after:always; mso-break-before:page; mso-break-type:page;"></p>';
        const title = '<h2>Расписка о получении денежных средств</h2>';
          // место и дата составления (дата договора в «длинном» формате)
        const agreementDateObj =
          parseAnyDateLocal(t.agreementDate) ||
          parseAnyDateLocal(t.startDate) ||
          new Date();

        const agreementDateLong = ensureGoda(
          formatDateLongLocal(agreementDateObj)
        );

        const place = escapeHtml(
          t.agreementPlace
          || t.city
          || data.property?.address?.city
          || data.property?.city
          || data.apartment?.city
          || ''
        );

        const placeDateRow =
          `<table style="width:100%; border-collapse:collapse; margin: 0 0 10px 0;">
            <tr>
              <td style="text-align:left; vertical-align:top;">${place || '&nbsp;'}</td>
              <td style="text-align:right; vertical-align:top;">${agreementDateLong}</td>
            </tr>
          </table>`;


        const pronoun = escapeHtml(calc.receipt?.landlordsPronoun || ''); // "Я" или "Мы"

          // ---------- LANDLORDS (общий представитель ИЛИ per-landlord представитель ИЛИ без представителей)
          let landlordsHtml = '';
          

          if (data.landlordsRepresentative && data.landlordsRepresentative.fullName) {
            // === общий представитель ===
            const rep = data.landlordsRepresentative;
            const repBlock = buildPersonShortHtml(rep);

            // доверенность
            const attorneyParts = [];
            let attorneyDateText = rep.display?.attorneyDateText;
            if (!attorneyDateText && rep.attorneyDate) {
              attorneyDateText = ensureGoda(formatDateLongLocal(parseAnyDateLocal(rep.attorneyDate)));
            }
            if (attorneyDateText) attorneyParts.push(`от ${escapeHtml(attorneyDateText)}`);
            if (rep.display?.attorneyIssuedBy || rep.attorneyIssuedBy)
              attorneyParts.push(`удостоверенной ${escapeHtml(rep.display?.attorneyIssuedBy || rep.attorneyIssuedBy)}`);
            if (rep.attorneyNumber) attorneyParts.push(`реестровый номер: ${escapeHtml(rep.attorneyNumber)}`);
            const attorneyStr = attorneyParts.length ? (', действует по доверенности ' + attorneyParts.join(', ')) : '';

            // ВАЖНО: конец — запятая (дальше пойдёт "от имени: ...")
            landlordsHtml += `<p>${pronoun} ${repBlock}${attorneyStr},</p>`;

            // представляемые — ТЕПЕРЬ ПОЛНЫЕ ДАННЫЕ + ФИО в РОДИТЕЛЬНОМ
            if (Array.isArray(rep.represented) && rep.represented.length) {
              const fullRepresented = rep.represented
                .map(p => buildPersonShortHtmlWithCase(p, 'gen'))
                .filter(Boolean);
              if (fullRepresented.length) {
                landlordsHtml += `<p>от имени: ${fullRepresented.join('; ')},</p>`;
              }
            }

          } else {
            // === per-landlord / без представителя ===
            const L = Array.isArray(data.landlords) ? data.landlords : [];
            if (L.length) {
              const landlordItems = L.map((land) => {
                const rep = land.representative && land.hasRepresentative ? land.representative : null;
                if (rep && rep.fullName) {
                  const repBlock = buildPersonShortHtml(rep);

                  // доверенность
                  const ap = [];
                  let adate = rep.display?.attorneyDateText;
                  if (!adate && rep.attorneyDate) {
                    adate = ensureGoda(formatDateLongLocal(parseAnyDateLocal(rep.attorneyDate)));
                  }
                  if (adate) ap.push(`от ${escapeHtml(adate)}`);
                  if (rep.display?.attorneyIssuedBy || rep.attorneyIssuedBy)
                    ap.push(`удостоверенной ${escapeHtml(rep.display?.attorneyIssuedBy || rep.attorneyIssuedBy)}`);
                  if (rep.attorneyNumber) ap.push(`реестровый номер: ${escapeHtml(rep.attorneyNumber)}`);
                  const astr = ap.length ? (', действует по доверенности ' + ap.join(', ')) : '';

                  // представляемый — ПОЛНЫЕ ДАННЫЕ + ФИО в РОДИТЕЛЬНОМ
                  const landFullGen = buildPersonShortHtmlWithCase(land, 'gen');
                  return `${repBlock}${astr}, от имени: ${landFullGen}`;
                } else {
                  return buildPersonShortHtml(land);
                }
              });

              // ВАЖНО: местоимение один раз и точка в конце
              landlordsHtml += `<p>${pronoun} ${landlordItems.join('; ')},</p>`;
            }
          }



        // ---------- СУММЫ
        const rent = calc.receipt?.rentFirstMonth || { formatted:'0', words:'Ноль', kop:'00', rubWord:'рублей', kopWord:'копеек' };
        const deposit = calc.receipt?.depositUpfront || { formatted:'0', words:'Ноль', kop:'00', rubWord:'рублей', kopWord:'копеек' };
        const lastMonth = calc.receipt?.lastMonthUpfront || { formatted:'0', words:'Ноль', kop:'00', rubWord:'рублей', kopWord:'копеек' };
        const total = calc.receipt?.totalAtSigning || { formatted:'0', words:'Ноль', kop:'00', rubWord:'рублей', kopWord:'копеек' };
        const hasDeposit = !!(calc.receipt?.depositUpfrontCents);
        const hasLast = !!(calc.receipt?.lastMonthUpfrontCents);

        const rentEnd = (hasDeposit || hasLast) ? ',' : '.';
        const depositEnd = hasLast ? ',' : '.';
        const lastEnd = '.';


        const rentHtml = `<p>${escapeHtml(calc.receipt?.landlordsVerbReceived || 'получил(и)')} сумму в размере ${rent.formatted} (${rent.words}) ${rent.rubWord} ${rent.kop} ${rent.kopWord} в счёт платежа за найм квартиры за период с ${escapeHtml(calc.receipt?.periodStartLong || '')} по ${escapeHtml(calc.receipt?.periodEndLong || '')}${rentEnd}</p>`;

        const depositHtml = (hasDeposit)
          ? `<p>а также сумму в размере ${deposit.formatted} (${deposit.words}) ${deposit.rubWord} ${deposit.kop} ${deposit.kopWord} в качестве обеспечительного платежа согласно п. 5.5 Договора найма жилого помещения от ${escapeHtml(agreementDateLong)}${depositEnd}</p>`
          : '';


        const lastMonthHtml = (hasLast)
          ? `<p>и сумму в размере ${lastMonth.formatted} (${lastMonth.words}) ${lastMonth.rubWord} ${lastMonth.kop} ${lastMonth.kopWord} в качестве предоплаты за последний месяц проживания${lastEnd}</p>`
          : '';


        // ---------- ИТОГО и ПЛАТЕЛЬЩИКИ (НАНИМАТЕЛИ)
          const tenantsHtml = (Array.isArray(data.tenants) && data.tenants.length)
          ? data.tenants.map((p, i) => {
              const pieces = [];
              // ФИО в РОДИТ. падеже после "от"
              pieces.push(`<strong>${escapeHtml(p.display?.fio?.gen || p.fullName || '')}</strong>`);
              if (p.display?.genderWord) pieces.push(`пол: ${escapeHtml(p.display.genderWord)}`);
              if (p.display?.birthDateText) pieces.push(`дата рождения: ${escapeHtml(p.display.birthDateText)} рождения`);
              if (p.birthPlace) pieces.push(`место рождения: ${escapeHtml(p.birthPlace)}`);

              // паспорт: если нет display.passportSummary — соберём вручную
              const ps = p.display?.passportSummary
                || (function () {
                    const pass = [];
                    if (p.display?.passportSeries) pass.push(`серия: ${escapeHtml(p.display.passportSeries)}`);
                    if (p.display?.passportNumber) pass.push(`номер: ${escapeHtml(p.display.passportNumber)}`);
                    if (p.passportIssued) pass.push(`выдан: ${escapeHtml(p.passportIssued)}`);
                    if (p.display?.issueDateText) pass.push(`дата выдачи: ${escapeHtml(p.display.issueDateText)}`);
                    if (p.departmentCode || p.display?.departmentCode)
                      pass.push(`код подразделения: ${escapeHtml(p.departmentCode || p.display?.departmentCode)}`);
                    return pass.length ? pass.join(', ') : '';
                  })();
              if (ps) pieces.push(`паспорт: ${ps}`);

              // регистрация — через фолбэк
              const regTx = buildRegistrationText(p);
              if (regTx) pieces.push(`зарегистрирован(а): ${escapeHtml(regTx)}`);

              return pieces.join(', ') + (i < data.tenants.length - 1 ? '; ' : '.');
            }).join(' ')
          : '';


        const totalHtml = `<p>Итого ${escapeHtml(calc.receipt?.landlordsPronounInstr || 'мной/нами')} получено при подписании Договора сумма в размере ${total.formatted} (${total.words}) ${total.rubWord} ${total.kop} ${total.kopWord}, от ${tenantsHtml}</p>`;

        const noClaimsTo = (Array.isArray(data.tenants) && data.tenants.length)
          ? data.tenants.map(p => escapeHtml(p.display?.fio?.dat || p.fullName || '')).join(', ')
          : '';

        const noClaimsHtml = `<p>Денежные средства ${escapeHtml(calc.receipt?.landlordsPronounInstr || 'мной/нами')} ${escapeHtml(calc.receipt?.landlordsVerbReceivedPast || 'получены')}, претензий к ${noClaimsTo} ${escapeHtml(calc.receipt?.noClaimsVerb || 'не имею(ем)')}.</p>`;

        // подписи
        const signatures = (Array.isArray(data.landlords) ? data.landlords : [])
          .map(() => '<p>_____________________________________________________________________________<br>(Фамилия Имя Отчество полностью и подпись)</p>')
          .join('\n');

        const html = [
          pageBreak,
          title,
          placeDateRow,
          landlordsHtml,
          rentHtml,
          depositHtml,
          lastMonthHtml,
          totalHtml,
          noClaimsHtml,
          '<br>',
          '<p><b>Подписи Наймодателей:</b></p>',
          signatures
        ].join('\n');

        return html;
      }

      // вызвать сборку расписки только для cash
      if (String(data.terms.paymentMethod || '').toLowerCase() === 'cash') {
        data.calc = data.calc || {};
        data.calc.receiptHtml = buildReceiptHtml(data);
      } else {
        data.calc = data.calc || {};
        data.calc.receiptHtml = '';
      }

    // Глаголы «берёт/берут», «подтвержда(ет/ют)» — на всякий, если понадобится
    data.calc.tenantsVerbTake = data.calc.tenantsCountIsOne ? 'берёт' : 'берут';
    // ===== Глагол в п.2.1: «обязуется/обязуются выплачивать» =====
    data.calc.tenantsConfirmVerb = data.calc.tenantsCountIsOne ? 'обязуется выплачивать' : 'обязуются выплачивать';
    // для пункта 3.1.и 4.2. обязан/обязаны
    data.calc.tenantsObligedVerb = data.calc.tenantsCountIsOne ? 'обязан' : 'обязаны';
    // для пункта 3.2.
    data.calc.tenantsHasRightVerb = data.calc.tenantsCountIsOne ? 'имеет' : 'имеют';
    // для пункта 4.1. не освободят и не сдадут/не освободит и не сдаст; обязан запалатить/обязаны заплатить
    data.calc.tenantsNotVacateVerb = data.calc.tenantsCountIsOne ? 'не освободит и не сдаст' : 'не освободят и не сдадут';
    data.calc.tenantsObligedToPay = data.calc.tenantsCountIsOne ? 'он обязан уплатить' : 'они обязаны уплатить';
    // для пункта 4.3. они обязаны уплатить{{else}}он обязан уплатить
    data.calc.tenantsPayVerb = data.calc.tenantsCountIsOne ? 'он выплачивает' : 'они выплачивают';
    // для пункта 5.5. передает/передают
    data.calc.tenantsTransferVerb = data.calc.tenantsCountIsOne ? 'передаёт' : 'передают';
    data.calc.tenantsAcceptVerb = data.calc.tenantsCountIsOne ? 'принял' : 'приняли';

    // Доп. фраза «именуемый/именуемая» для одного нанимателя
    if (data.calc.tenantsCountIsOne && Array.isArray(data.tenants) && data.tenants[0]) {
      const g = String(data.tenants[0].gender || '').toLowerCase();
      data.calc.tenantsSingleNamedLater = (g === 'female') ? 'именуемая в дальнейшем' : 'именуемый в дальнейшем';
    } else {
      data.calc.tenantsSingleNamedLater = '';
    }
    // === 1.5–1.7: кто будет проживать + нумерация пункта про животных ===
    {
      // Собираем непустые whoLive у нанимателей
      const whoList = (Array.isArray(data.tenants) ? data.tenants : [])
        .map(t => String(t?.whoLive || '').trim())
        .filter(s => s.length > 0);

      // Есть ли хотя бы один пункт «кто будет проживать»
      data.calc.hasWhoLive = whoList.length > 0;

      // Склеенная строка для 1.6: "А, Б, В"
      data.calc.tenantsWhoLiveJoined = whoList.join(', ');

      // Номер пункта для животных: если был 1.6 (кто проживает) → животные = 1.7, иначе 1.6
      data.calc.petsClauseNumber = data.calc.hasWhoLive ? '1.7' : '1.6';

      // Показывать ли вообще пункт про животных
      const petsDesc = String(data?.terms?.petsDescription || '').trim();
      data.terms.petsHasText = petsDesc.length > 0; // удобный флаг для data-if
    }
    // === 2.2: жилищно-коммунальные услуги (кто платит / полностью / частично) ===
    {
      const payerRaw = String(data?.terms?.utilitiesPayer || '').toLowerCase();        // 'landlord' | 'tenant'
      const typeRaw  = String(data?.terms?.utilitiesPaymentType || '').toLowerCase();  // 'full' | 'partial'
      const chosen   = Array.isArray(data?.terms?.utilitiesServices)
        ? data.terms.utilitiesServices.filter(Boolean)
        : [];

      // Канонический справочник услуг (можешь дополнять при необходимости)
      const ALL_UTILS = [
        'Жилищные услуги(Услуги от УК)',
        'Холодное водоснабжение (ХВС)',
        'Водоотведение (канализация)',
        'Газоснабжение',
        'Электроснабжение',
        'Горячее водоснабжение (ГВС)',
        'Взносы на капитальный ремонт',
        'Теплоснабжение',
        'Обращение с ТКО',
      ];

      // Унифицируем: полный набор = объединение канона и выбранных
      const fullSet = Array.from(new Set([...ALL_UTILS, ...chosen]));
      const chosenSet = new Set(chosen);
      const rest = fullSet.filter(s => !chosenSet.has(s)); // не выбранные (комплементарный список)

      // Удобные ярлыки/глаголы в зависимости от числа
      const L_isOne = !!data?.calc?.landlordsCountIsOne;
      const T_isOne = !!data?.calc?.tenantsCountIsOne;

      const L_nom  = data?.calc?.landlordsGroupLabel || (L_isOne ? 'Наймодатель' : 'Наймодатели');
      const T_nom  = data?.calc?.tenantsGroupLabel   || (T_isOne ? 'Наниматель'  : 'Наниматели');

      const L_pay  = L_isOne ? 'оплачивает'  : 'оплачивают';
      const T_pay  = T_isOne ? 'оплачивает'  : 'оплачивают';

      const listInc = chosen.join(', ');
      const listExc = rest.join(', ');

      let text = '';

      if (payerRaw === 'landlord') {
        if (typeRaw === 'full') {
          // Полностью платит Наймодатель(и)
          text = `Все жилищные и коммунальные услуги включены в стоимость ежемесячной оплаты за найм, которые «${L_nom}» ${L_pay} самостоятельно по факту выставления соответствующих квитанций, ежемесячно до 10-го числа месяца, следующего за истекшим месяцем.`;
        } else if (typeRaw === 'partial') {
          // Частично платит Наймодатель(и): перечисляем включённые и отдельно — не включённые
          if (listInc) {
            text = `В стоимость ежемесячной оплаты за найм включены следующие услуги: ${listInc}.`;
          } else {
            text = `Часть жилищных и коммунальных услуг включена в стоимость ежемесячной оплаты за найм.`;
          }
          if (listExc) {
            text += ` Услуги, не включённые в указанную стоимость (${listExc}), «${T_nom}» ${T_pay} самостоятельно по факту выставления соответствующих квитанций.`;
          } else {
            text += ` Иные услуги отсутствуют.`;
          }
        }
      } else if (payerRaw === 'tenant') {
        if (typeRaw === 'full') {
          // Полностью платит Наниматель(и)
          text = `Все жилищные и коммунальные услуги «${T_nom}» ${T_pay} самостоятельно по факту выставления соответствующих квитанций и показаний приборов учёта, ежемесячно до 10-го числа месяца, следующего за истекшим месяцем.`;
        } else if (typeRaw === 'partial') {
          // Частично платит Наниматель(и): перечисляем оплачиваемые и отдельно — включённые в плату (за Наймодателем)
          if (listInc) {
            text = `«${T_nom}» ${T_pay} самостоятельно следующие услуги: ${listInc}.`;
          } else {
            text = `Часть жилищных и коммунальных услуг «${T_nom}» ${T_pay} самостоятельно.`;
          }
          if (listExc) {
            text += ` Прочие услуги (${listExc}) включены в стоимость ежемесячной оплаты за найм и «${L_nom}» ${L_pay} самостоятельно.`;
          } else {
            text += ` Иные услуги включены в стоимость ежемесячной оплаты за найм.`;
          }
        }
      }

      data.calc.utilitiesClauseText = text;
    }
    // --- Денежные поля для раздела 4 (автоформат "40 000 (Сорок тысяч) рублей 00 копеек")
    data.terms = data.terms || {};
    // создаём алиасы с суффиксом "Amount", чтобы движок форматировал их как суммы
    if (data.terms.latePenaltyPerDay != null) {
      data.terms.latePenaltyPerDayAmount = data.terms.latePenaltyPerDay;
    }
    if (data.terms.penaltyClause44 != null) {
      data.terms.penaltyClause44Amount = data.terms.penaltyClause44;
    }

    ensureTenantsRepresentativesDisplay(data);
    assignTenantsNamedAs(data);
    promoteTenantsCommonRepresentative(data);
    buildTenantRepresentativeGroups(data);
    markShowNamedLaterForTenants(data);
    // === CONTACTS (phones/emails) ===
    data.calc = data.calc || {};
    data.calc.contacts = data.calc.contacts || {};
    data.calc.contacts.landlords = buildContactsHtml(data.landlords);
    data.calc.contacts.tenants   = buildContactsHtml(data.tenants);

    // ================== REGISTRATION CLAUSES ==================
    // Проставляет display.registrationClause всем (landlords + tenants + их представителям)
    applyRegistrationClauses(data);
    
    // ===== §5: ДЕНЬГИ И ГРАФИКИ (залог и предоплата за последний месяц) =====
    {
      data.terms = data.terms || {};
      const t = data.terms;

      // Нужны для формулировок
      const Ldat = (data.calc && data.calc.landlordsGroupLabelDative) || 'Наймодателю';

      // ---------- утилиты денег/слов ----------
      const toNumber = (x) => Number(String(x ?? '').replace(',', '.')) || 0;
      const spaced = (n) => Number(n).toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
      const plural = (n, forms) => {
        n = Math.abs(n);
        const a = n % 100, b = a % 10;
        if (a >= 11 && a <= 14) return forms[2];
        if (b === 1) return forms[0];
        if (b >= 2 && b <= 4) return forms[1];
        return forms[2];
      };
      const onesM = ['','один','два','три','четыре','пять','шесть','семь','восемь','девять'];
      const onesF = ['','одна','две','три','четыре','пять','шесть','семь','восемь','девять'];
      const tens = ['','десять','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
      const teens = ['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
      const hundreds = ['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];

      const tripletToWords = (n, feminine) => {
        n = Math.floor(n);
        const h = Math.floor(n/100), t10 = Math.floor((n%100)/10), o = n%10;
        let s = '';
        if (h) s += (s?' ':'') + hundreds[h];
        if (t10 > 1) {
          s += (s?' ':'') + tens[t10];
          if (o) s += ' ' + (feminine ? onesF[o] : onesM[o]);
        } else if (t10 === 1) {
          s += (s?' ':'') + teens[o];
        } else if (o) {
          s += (s?' ':'') + (feminine ? onesF[o] : onesM[o]);
        }
        return s;
      };

      const numToWords = (n) => {
        n = Math.floor(Math.abs(n));
        if (n === 0) return 'ноль';
        const units = [
          ['рубль','рубля','рублей', false],
          ['тысяча','тысячи','тысяч', true],
          ['миллион','миллиона','миллионов', false],
          ['миллиард','миллиарда','миллиардов', false],
        ];
        let parts = [], i = 0;
        while (n > 0 && i < units.length) {
          const tr = n % 1000;
          if (tr) {
            const [u1,u2,u3,fem] = units[i];
            const w = tripletToWords(tr, fem);
            const p = plural(tr,[u1,u2,u3]);
            parts.unshift((w ? (w + ' ') : '') + p);
          }
          n = Math.floor(n/1000);
          i++;
        }
        return parts.join(' ');
      };

      // формат: 40 000 (Сорок тысяч) рублей 00 копеек
      const fmtDetailed = (amount) => {
        const a = toNumber(amount);
        const rub = Math.floor(a);
        const kop = Math.round((a - rub) * 100);
        const rubWord = plural(rub, ['рубль','рубля','рублей']);
        const kopWord = plural(kop, ['копейка','копейки','копеек']);
        const words = numToWords(rub).replace(/^./, c => c.toUpperCase());
        return `${spaced(rub)} (${words}) ${rubWord} ${String(kop).padStart(2,'0')} ${kopWord}`;
      };

      // ---------- даты для рассрочек ----------
      function addMonthsSafe(dateObj, months) {
        const d = new Date(dateObj.getTime());
        const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
        const target = new Date(y, m + months + 1, 0); // последний день целевого месяца
        const clampedDay = Math.min(day, target.getDate());
        return new Date(y, m + months, clampedDay);
      }
      const parseStart = () => {
        const sd = String(t.startDate || '').trim();
        // используем твой локальный парсер
        return parseAnyDateLocal(sd) || new Date(); // если пусто — сегодня
      };

      // Сборка HTML-расписания: N строк, первая — «при подписании», остальные — «до <дата> …»
      function buildInstallmentsScheduleHtml(totalAmount, count, startDateStr, dativeLabel) {
        const totalKop = Math.round(toNumber(totalAmount) * 100);
        const n = Math.max(1, Number(count || 1));
        if (n === 1) return ''; // тут не используется — для единовременного есть отдельный хвост

        const base = Math.floor(totalKop / n);
        const rest = totalKop - base * n; // остаток копеек кинем в ПОСЛЕДНИЙ платёж

        const start = parseStart();
        const lines = [];

        for (let i = 0; i < n; i++) {
          const kopAmt = base + (i === n - 1 ? rest : 0);
          const rub = Math.floor(kopAmt / 100);
          const kop = kopAmt % 100;

          const rubPart = fmtDetailed(rub + kop/100); // уже со словами и руб./коп.
          const prefix = `${rubPart} вносится «${dativeLabel}»`;

          if (i === 0) {
            lines.push(prefix + ' при подписании Договора');
          } else {
            const due = addMonthsSafe(start, i);
            const dateStr = ensureGoda(formatDateLongLocal(due));
            lines.push(prefix + ` в срок до ${dateStr} одновременно с очередным платежом за найм`);
          }
        }

        // точку в конце предложения добавляет шаблон после плейсхолдера,
        // поэтому сами тут завершаем строки `;` и у последней — без знака.
        return lines.map((s, idx) => idx < lines.length - 1 ? (s + ';') : s).join('<br>');
      }

      // ---------- ЗАЛОГ ----------
      const sd = t.securityDeposit || {};
      const sdAmount = toNumber(sd.amount ?? t.securityDepositAmount ?? 0);
      t.securityDepositAmount = sdAmount;            // <span data-ph="terms.securityDepositAmount"> → отформатится движком
      t.securityDepositEnabled = sdAmount > 0;

      const sdN = Number(sd.installmentsCount || 1);
      const sdSplit = String(sd.paymentMethod || '').toLowerCase() === 'installments' && sdN > 1;
      t.securityDepositSplit = sdSplit;
      t.securityDepositSplitNot = !sdSplit;

      if (sdSplit) {
        t.securityDepositSchedule = buildInstallmentsScheduleHtml(sdAmount, sdN, t.startDate, Ldat);
      } else {
        t.securityDepositSchedule = ''; // используется хвост «при подписании Договора.» в шаблоне
      }

      // ---------- ПРЕДОПЛАТА ЗА ПОСЛЕДНИЙ МЕСЯЦ ----------
      const lm = t.lastMonthRentPrepayment || {};
      const lmAmount = toNumber(lm.amount ?? t.lastMonthPrepayAmount ?? 0);
      t.lastMonthPrepayAmount = lmAmount;
      t.lastMonthPrepayEnabled = lmAmount > 0;

      const lmN = Number(lm.installmentsCount || 1);
      const lmSplit = String(lm.paymentMethod || '').toLowerCase() === 'installments' && lmN > 1;
      t.lastMonthPrepaySplit = lmSplit;
      t.lastMonthPrepaySplitNot = !lmSplit;

      if (lmSplit) {
        t.lastMonthPrepaySchedule = buildInstallmentsScheduleHtml(lmAmount, lmN, t.startDate, Ldat);
      } else {
        t.lastMonthPrepaySchedule = '';
      }

      // На всякий — глагол «передаёт/передают», если ещё не задан
      if (!data.calc.tenantsTransferVerb) {
        data.calc.tenantsTransferVerb = data.calc.tenantsCountIsOne ? 'передаёт' : 'передают';
      }
    }
    // ===== §5.8: КОЛ-ВО ЭКЗЕМПЛЯРОВ (минимум 2, максимум 20) =====
    {
      data.terms = data.terms || {};
      const t = data.terms;

      // 1) Читаем значение и жёстко ограничиваем диапазон 2..20
      let cc = parseInt(String(t.copiesCount ?? ''), 10);
      if (!Number.isFinite(cc)) cc = 2;
      cc = Math.min(Math.max(cc, 2), 20);
      t.copiesCount = cc; // в текст пойдёт уже нормализованное число

      // 2) Числительные в предложном падеже для 2..20
      const PREP = {
        2:  'двух',
        3:  'трёх',
        4:  'четырёх',
        5:  'пяти',
        6:  'шести',
        7:  'семи',
        8:  'восьми',
        9:  'девяти',
        10: 'десяти',
        11: 'одиннадцати',
        12: 'двенадцати',
        13: 'тринадцати',
        14: 'четырнадцати',
        15: 'пятнадцати',
        16: 'шестнадцати',
        17: 'семнадцати',
        18: 'восемнадцати',
        19: 'девятнадцати',
        20: 'двадцати',
      };

      // 3) Формы существительного и причастия (для 2..20 всегда множественное)
      t.copiesCountWordsPrep = PREP[cc] || 'двадцати';
      t.copiesUnitPrep       = 'экземплярах';
      t.copiesParticiple     = 'имеющих';
    }



    // ===== §5: НУМЕРАЦИЯ ПУНКТОВ (СТРОГО В НОВОМ ПОРЯДКЕ) =====
    // Требование: 5.4 (налоги) — есть всегда, дальше:
    // 5.5 залог (если есть), 5.6 предоплата за последний месяц (если есть),
    // 5.7 срок действия, 5.8 экземпляры, 5.9 средства связи.

    data.terms = data.terms || {};
    const t = data.terms;

    // --- безопасные дефолты (если ранее не проставил где-то ещё) ---
    if (typeof t.securityDepositEnabled === 'undefined') {
      const a = Number(
        (t.securityDeposit && t.securityDeposit.amount) ??
        t.securityDepositAmount ?? 0
      );
      t.securityDepositEnabled = a > 0;
    }
    if (typeof t.lastMonthPrepayEnabled === 'undefined') {
      const a = Number(
        (t.lastMonthRentPrepayment && t.lastMonthRentPrepayment.amount) ??
        t.lastMonthPrepayAmount ?? 0
      );
      t.lastMonthPrepayEnabled = a > 0;
    }

    // --- сброс номеров (чтобы не осталось старых значений) ---
    t.numSecurityDeposit = '';
    t.numLastMonthPrepay = '';
    t.numContractPeriod  = '';
    t.numCopiesCount     = '';
    t.numCommsMeans      = '';

    // 5.4 уже «занят» налогами в шаблоне → начинаем считать дальше
    let n = 4;
    const next = () => `5.${++n}.`;

    // 5.5 — Обеспечительный платёж (если есть)
    if (t.securityDepositEnabled) {
      t.numSecurityDeposit = next();
    }

    // 5.6 — Предоплата за последний месяц (если есть)
    if (t.lastMonthPrepayEnabled) {
      t.numLastMonthPrepay = next();
    }

    // 5.7 — Срок действия (всегда)
    t.numContractPeriod = next();

    // 5.8 — Количество экземпляров (всегда)
    t.numCopiesCount = next();

    // 5.9 — Средства связи (всегда)
    t.numCommsMeans = next();

    console.log('[§5 numbering] secDep=%s lastMonth=%s → 5.5=%s 5.6=%s 5.7=%s 5.8=%s 5.9=%s',
      String(t.securityDepositEnabled),
      String(t.lastMonthPrepayEnabled),
      t.numSecurityDeposit, t.numLastMonthPrepay, t.numContractPeriod, t.numCopiesCount, t.numCommsMeans
    );
    // флаги "несколько участников"
    data.calc.multipleLandlords = !data.calc.landlordsCountIsOne;
    data.calc.multipleTenants   = !data.calc.tenantsCountIsOne;

    // обогащаем участников для блока подписей
    data.landlords = decorateForSignatures(data.landlords, data.calc, formatDateLongLocal);
    data.tenants   = decorateForSignatures(data.tenants,   data.calc, formatDateLongLocal);

    

    // ======================= RENDER =======================
    console.log('[calc] landlordsCount=%d isOne=%s', data.calc.landlordsCount, data.calc.landlordsCountIsOne);
    console.log('[calc] tenantsCount=%d isOne=%s', data.calc.tenantsCount, data.calc.tenantsCountIsOne);
    console.log('L sample:', data.landlords?.[0]?.fullName, 'T sample:', data.tenants?.[0]?.fullName);
    console.log('tenantsRepresentative:', data.tenantsRepresentative ? data.tenantsRepresentative.fullName : '(none)');
    if (Array.isArray(data.calc?.tenantRepGroups)) {
      console.log('[TENANT GROUPS]', data.calc.tenantRepGroups.map(g => ({
        rep: g?.representative?.fullName,
        count: (g?.represented || []).length,
      })));
    }
    // Сформировать HTML-таблицы из массивов (если есть такие поля)
    try {
      if (Array.isArray(data.apartmentDescription)) {
        data.terms = data.terms || {};
        data.terms.apartmentHtml = buildApartmentTableHtml(data.apartmentDescription);
      }
      if (Array.isArray(data.inventory)) {
        data.terms = data.terms || {};
        data.terms.inventoryHtml = buildInventoryTableHtml(data.inventory);
      }
    } catch (e) {
      console.error('[tables] build error:', e);
    }
    // Сформировать HTML-таблицы из массивов (если есть такие поля)
    try {
      if (Array.isArray(data.apartmentDescription)) {
        data.terms = data.terms || {};
        data.terms.apartmentHtml = buildApartmentTableHtml(data.apartmentDescription);
      }
      if (Array.isArray(data.inventory)) {
        data.terms = data.terms || {};
        data.terms.inventoryHtml = buildInventoryTableHtml(data.inventory);
      }
    } catch (e) {
      console.error('[tables] build error:', e);
    }

    const finalHtml = renderFinalHtml(htmlInput, data);
    res.json({ ok: true, html: finalHtml });
  } catch (e) {
    console.error('HTML render error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// 3) Export PDF (returns a PDF file generated from the current HTML and data)
router.post('/docs/:id/export/pdf', async (req, res) => {
  try {
    let htmlInput = req.body.html || req.body.content || '';
    res.setHeader('Cache-Control', 'no-store');
    const data = req.body.data || req.body.formData || {};
    const docType = normalizeDocumentType(await resolveDocumentType(req, data));
    const fileName = DOCUMENT_TYPE_META[docType]?.pdfFileName || DOCUMENT_TYPE_META.rent.pdfFileName;
    // ⬇️ ВСТАВИТЬ СРАЗУ ПОСЛЕ ПОЛУЧЕНИЯ htmlInput
    htmlInput = stripEditorHints(htmlInput);
    // Кулдаун только для гостей
    const key = getGuestKey(req);
    if (key) {
      const cd = checkAndSetCooldown(req);
      if (!cd.ok) {
        return res.status(429).json({ ok: false, cooldownRemainingSec: cd.cooldownRemainingSec });
      }
    }
    console.log('[PDF] incoming html length:', htmlInput.length);
    console.log('[PDF] data keys:', Object.keys(data));

    const finalHtml = renderFinalHtml(htmlInput, data);
    const alignedHtml = enforceInlineAlignment(finalHtml);  // 👈 вставили

    console.log('[PDF] finalHtml length:', alignedHtml.length);
    const pdfBuffer = await exportPdf(alignedHtml);         // 👈 передаём alignedHtml

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(pdfBuffer);
  } catch (e) {
    console.error('PDF export error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// 4) Export DOCX (returns a Word document generated from the current HTML and data)
router.post('/docs/:id/export/docx', async (req, res) => {
  try {
    let htmlInput = req.body.html || req.body.content || '';
    
    res.setHeader('Cache-Control', 'no-store');
    const data = req.body.data || req.body.formData || {};
    const docType = normalizeDocumentType(await resolveDocumentType(req, data));
    const fileName = DOCUMENT_TYPE_META[docType]?.docxFileName || DOCUMENT_TYPE_META.rent.docxFileName;
    // DOCX — только для зарегистрированных (учитываем и req.userId, и req.user?.id)
    const isAuthed = !!(req.userId || (req.user && req.user.id));
    if (!isAuthed) {
      return res.status(403).json({ ok: false, error: 'DOCX available for registered users only' });
    }

    htmlInput = stripEditorHints(htmlInput);

    console.log('[DOCX] incoming html length:', htmlInput.length);
    console.log('[DOCX] data keys:', Object.keys(data));

    const finalHtml = renderFinalHtml(htmlInput, data);
    let alignedHtml = enforceInlineAlignment(finalHtml);

    // ⬇️ ДОБАВИЛИ разрывы страниц перед приложениями (только для DOCX)
    alignedHtml = insertDocxPageBreaks(alignedHtml);

    console.log('[DOCX] finalHtml length:', alignedHtml.length);

    const cleanedHtml = alignedHtml
      .replace(/<p([^>]*)>\s*<\/p>/gi, '<p$1>&nbsp;</p>')
      .replace(/<h([1-6])([^>]*)>\s*<\/h\1>/gi, '<h$1$2>&nbsp;</h$1>');
      
    const docxBuffer = await exportHtmlToDocxBuffer(cleanedHtml);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(docxBuffer);
  } catch (e) {
    console.error('DOCX export error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});



// 5) Document versions list
router.get('/docs/:id/versions', async (req, res) => {
  try {
    const versions = await listVersions(req.params.id);
    res.json(versions);
  } catch (e) {
    console.error('List versions error:', e);
    res.status(500).json([]);
  }
});
//Удаление
router.delete('/docs/:id/versions/:versionId', async (req, res) => {
  try {
    const removed = await deleteVersion(req.params.id, req.params.versionId);
    if (!removed) {
      return res.status(404).json({ ok: false, error: 'Версия не найдена.' });
    }
    const versions = await listVersions(req.params.id);
    res.json({ ok: true, versions });
  } catch (e) {
    console.error('Delete version error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});
// X) Clear all saved versions for the document (reset to clean state)
router.post('/docs/:id/clear', async (req, res) => {
  try {
    clearVersions(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Clear versions error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 6) Save a new draft/version of the document
router.post('/docs/:id/drafts', async (req, res) => {
  try {
    const { html, changeNote, ephemeral } = req.body || {};
    const options = {
      changeNote: changeNote || '',
      ephemeral: !!ephemeral,
      expiresAt: ephemeral ? new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() : null
    };
    const newVersion = await saveDraft(req.params.id, html || '', options);
    res.json(newVersion);
  } catch (e) {
    console.error('Save draft error:', e);
    res.status(500).json({ error: e.message });
  }
});


// 7) Build diff between two versions (stub)
router.get('/docs/:id/diff', async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ html: '', error: 'Параметры "from" и "to" обязательны для сравнения версий.' });
  }

  try {
    const { html } = await buildDiff(req.params.id, from, to);
    return res.json({ html });
  } catch (e) {
    console.error('Build diff error:', e);
    const message = e?.message || 'Не удалось построить сравнительный отчёт.';
    const statusCode = /не найдена/i.test(message) ? 404 : 500;
    return res.status(statusCode).json({ html: '', error: message });
  }
});

module.exports = router;

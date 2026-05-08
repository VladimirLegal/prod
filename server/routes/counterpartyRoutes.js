const express = require('express');
const path = require('path');
const fs = require('fs');
const handlebars = require('handlebars');
const requireAuth = require('../middlewares/requireAuth');
const checkPerson = require('../services/counterparty/checkPerson');
const { loadResult, listUserResults } = require('../services/counterparty/storage/loadResult');
const { loadRaw } = require('../services/counterparty/storage/loadRaw');
const { saveRaw } = require('../services/counterparty/storage/saveRaw');
const { exportHtmlToPdfBuffer } = require('../services/pdfGenerator');
const { innLookup } = require('../services/counterparty/innLookup');
const { rosreestrAddressLookup } = require('../services/counterparty/sources/rosreestrAddressLookup');
const { rosreestrObjectLookup } = require('../services/counterparty/sources/rosreestrObjectLookup');
const { query } = require('../db'); // добавь вверху
let bankDirectory = {};

try {
  bankDirectory = require('../data/bankDirectory.json');
} catch (err) {
  bankDirectory = {};
}


const router = express.Router();

router.use(requireAuth);

const COUNTERPARTY_AGREEMENT_VERSION = 'v2026-04-29';

const COUNTERPARTY_CONSENT_TEXT = [
  'Пользователь подтверждает согласие на обработку персональных данных для выполнения проверки контрагента, участника сделки или объекта недвижимости.',
  'Пользователь подтверждает, что понимает необходимость передачи данных во внешние сервисы проверки, включая API-Cloud и Контур / Контур.Реестро.',
  'Если пользователь указывает данные третьего лица, пользователь подтверждает наличие согласия такого лица либо иного законного основания для передачи и обработки этих данных.',
  'Пользователь соглашается с сохранением результата проверки и истории проверки в личном кабинете.'
].join(' ');

function getClientIp(req) {
  return (
    req.ip ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    ''
  );
}

function buildCounterpartyConsentSnapshot(req, context = {}) {
  const consent = req.body?.counterpartyConsent || {};

  const version = String(consent.version || '').trim().toLowerCase();

  const flags = {
    acceptedPersonalData: consent.acceptedPersonalData === true,
    acceptedExternalTransfer: consent.acceptedExternalTransfer === true,
    acceptedThirdPartyBasis: consent.acceptedThirdPartyBasis === true,
    acceptedReportStorage: consent.acceptedReportStorage === true,
  };

  if (version !== COUNTERPARTY_AGREEMENT_VERSION) {
    return {
      ok: false,
      error: 'counterparty_consent_version_required',
      message: 'Необходимо принять актуальную редакцию согласия на обработку персональных данных.',
    };
  }

  const allAccepted = Object.values(flags).every(Boolean);

  if (!allAccepted) {
    return {
      ok: false,
      error: 'counterparty_consent_required',
      message: 'Для запуска проверки необходимо подтвердить согласие на обработку и передачу персональных данных.',
    };
  }

  const nowIso = new Date().toISOString();

  return {
    ok: true,
    snapshot: {
      version: COUNTERPARTY_AGREEMENT_VERSION,
      privacyVersion: COUNTERPARTY_AGREEMENT_VERSION,
      pdnVersion: COUNTERPARTY_AGREEMENT_VERSION,
      termsVersion: COUNTERPARTY_AGREEMENT_VERSION,

      acceptedAt: nowIso,
      ip: getClientIp(req) || null,
      userAgent: req.headers['user-agent'] || null,

      providerMode: context.providerMode || null,
      provider: context.provider || null,
      selectedSources: Array.isArray(context.selectedSources)
        ? context.selectedSources
        : [],

      ...flags,

      consentText: COUNTERPARTY_CONSENT_TEXT,
    },
  };
}

handlebars.registerHelper('json', (context) => JSON.stringify(context, null, 2));
handlebars.registerHelper('eq', (a, b) => a === b);
handlebars.registerHelper('formatMoneyRu', (value) => {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  const num = Number(String(value).replace(/\s+/g, '').replace(',', '.'));

  if (!Number.isFinite(num)) {
    return value;
  }

  return num.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
});

function normalizeRegionCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^0[1-9]$/.test(raw)) {
    return String(Number(raw));
  }

  if (/^\d{1,2}$/.test(raw)) {
    return raw;
  }

  return '';
}

function normalizeRegionsInput(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map(normalizeRegionCode)
      .filter(Boolean)
  )];
}

const APICLOUD_SELECTIVE_SOURCES = [
  'mvdPassport',
  'mvdWanted',
  'stopOperRS',
  'fssp',
  'efrsb',
  'rosfin',
  'arbitrationApiCloudCombined',
  'fns',
  'inoagent',
];

const KONTUR_SELECTIVE_SOURCES = [
  'courtsCommon',
  'passportKontur',
  'fsspKontur',
  'snilsKontur',
  'arbitrationKontur',
  'commercialActivityKontur',
  'wantedKontur',
  'bankruptcyKontur',
  'rosfinKontur',
];

const SELECTIVE_SOURCE_KEYS = [
  ...APICLOUD_SELECTIVE_SOURCES,
  ...KONTUR_SELECTIVE_SOURCES,
];

function normalizeSelectedSources(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((item) => String(item || '').trim())
      .filter((item) => SELECTIVE_SOURCE_KEYS.includes(item))
  )];
}

function resolveProviderBySelectedSources(selectedSources = []) {
  const hasApiCloud = selectedSources.some((key) => APICLOUD_SELECTIVE_SOURCES.includes(key));
  const hasKontur = selectedSources.some((key) => KONTUR_SELECTIVE_SOURCES.includes(key));

  if (hasApiCloud && hasKontur) return 'mixed';
  if (hasKontur) return 'kontur';
  return 'apicloud';
}

function getTemplate(templateName = 'counterpartyReport.html') {
  const filePath = path.join(__dirname, '..', 'templates', templateName);
  const html = fs.readFileSync(filePath, 'utf8');
  return handlebars.compile(html);
}

function maskFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const lastName = parts[0] || '';
  const firstInitial = parts[1] ? `${parts[1][0]}.` : '';
  const middleInitial = parts[2] ? `${parts[2][0]}.` : '';
  return [lastName, firstInitial, middleInitial].filter(Boolean).join(' ');
}

function maskInn(inn) {
  const value = String(inn || '').replace(/\D/g, '');
  if (value.length < 8) return inn || '';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function maskPassportSeries(series) {
  const value = String(series || '').replace(/\D/g, '');
  if (value.length < 2) return series || '';
  return `${value.slice(0, 2)}**`;
}

function maskPassportNumber(number) {
  const value = String(number || '').replace(/\D/g, '');
  if (value.length < 2) return number || '';
  return `${value.slice(0, 2)}****`;
}

function maskBirthDate(dateValue) {
  const value = String(dateValue || '').trim();
  if (!value) return '';

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}.${iso[2]}.****`;
  }

  const ru = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) {
    return `${ru[1]}.${ru[2]}.****`;
  }

  return value;
}

function maskPersonalData(reportData = {}) {
  const subject = reportData.subject || {};
  const passport = subject.passport || {};

  return {
    ...reportData,
    subject: {
      ...subject,
      fullName: maskFullName(subject.fullName),
      inn: maskInn(subject.inn),
      birthDate: maskBirthDate(subject.birthDate),
      passport: {
        ...passport,
        series: maskPassportSeries(passport.series),
        number: maskPassportNumber(passport.number),
      },
    },
  };
}

function formatReportDate(value) {
  if (value === undefined || value === null || value === '') return '—';

  const str = String(value).trim();

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(str)) {
    return str;
  }

  if (/^\d{10}$/.test(str)) {
    const date = new Date(Number(str) * 1000);
    if (Number.isNaN(date.getTime())) return str;
    return date.toLocaleDateString('ru-RU');
  }

  if (/^\d{13}$/.test(str)) {
    const date = new Date(Number(str));
    if (Number.isNaN(date.getTime())) return str;
    return date.toLocaleDateString('ru-RU');
  }

  return str;
}

function normalizeFsspStatusFilter(value) {
  const raw = String(value || '').trim().toLowerCase();

  if (raw === 'active') return 'active';
  if (raw === 'closed') return 'closed';
  return 'all';
}

function parseFsspMoneyFilter(value) {
  if (value === undefined || value === null || value === '') return null;

  const normalized = String(value).replace(/\s+/g, '').replace(',', '.');
  const num = Number(normalized);

  return Number.isFinite(num) ? num : null;
}

function parseFsspProceedingSum(value) {
  if (value === undefined || value === null || value === '') return 0;

  const normalized = String(value).replace(/\s+/g, '').replace(',', '.');
  const num = Number(normalized);

  return Number.isFinite(num) ? num : 0;
}

function getFsspProceedingStatus(item = {}) {
  return item?.endDate ? 'closed' : 'active';
}

function rebuildFsspKonturSummary(items = []) {
  const safeItems = Array.isArray(items) ? items : [];

  const totalAmount = safeItems.reduce(
    (acc, item) => acc + parseFsspProceedingSum(item?.sum),
    0
  );

  const activeCount = safeItems.filter((item) => getFsspProceedingStatus(item) === 'active').length;
  const closedCount = safeItems.filter((item) => getFsspProceedingStatus(item) === 'closed').length;

  return {
    totalCount: safeItems.length,
    totalAmount,
    hasProceedings: safeItems.length > 0,
    activeCount,
    closedCount,
  };
}

function buildFsspAvailableRegions(items = []) {
  const safeItems = Array.isArray(items) ? items : [];

  return [...new Set(
    safeItems
      .map((item) => normalizeRegionCode(item?.region || ''))
      .filter(Boolean)
  )].sort((a, b) => Number(a) - Number(b));
}

function applyFsspKonturFilters(reportData = {}, query = {}) {
  const source = reportData?.sources?.fsspKontur;

  if (!source || typeof source !== 'object') {
    return reportData;
  }

  if (source.status === 'empty') {
    return {
      ...reportData,
      reportFilters: {
        ...(reportData.reportFilters || {}),
        fsspStatus: normalizeFsspStatusFilter(query.fsspStatus),
        fsspRegion: normalizeRegionCode(query.fsspRegion || ''),
        fsspMinSum: parseFsspMoneyFilter(query.fsspMinSum),
        fsspMaxSum: parseFsspMoneyFilter(query.fsspMaxSum),
      },
      sources: {
        ...(reportData.sources || {}),
        fsspKontur: {
          ...source,
          items: [],
          summary: {
            totalCount: 0,
            totalAmount: 0,
            hasProceedings: false,
            activeCount: 0,
            closedCount: 0,
          },
          filterMeta: {
            availableRegions: [],
            totalBeforeFilter: 0,
            totalAfterFilter: 0,
            hasFilters: false,
          },
        },
      },
    };
  }

  const originalItems = Array.isArray(source.items) ? source.items : [];

  const statusFilter = normalizeFsspStatusFilter(query.fsspStatus);
  const regionFilter = normalizeRegionCode(query.fsspRegion || '');
  const minSum = parseFsspMoneyFilter(query.fsspMinSum);
  const maxSum = parseFsspMoneyFilter(query.fsspMaxSum);

  const filteredItems = originalItems.filter((item) => {
    const status = getFsspProceedingStatus(item);
    const region = normalizeRegionCode(item?.region || '');
    const sum = parseFsspProceedingSum(item?.sum);

    if (statusFilter !== 'all' && status !== statusFilter) {
      return false;
    }

    if (regionFilter && region !== regionFilter) {
      return false;
    }

    if (minSum !== null && sum < minSum) {
      return false;
    }

    if (maxSum !== null && sum > maxSum) {
      return false;
    }

    return true;
  });

  return {
    ...reportData,
    reportFilters: {
      ...(reportData.reportFilters || {}),
      fsspStatus: statusFilter,
      fsspRegion: regionFilter,
      fsspMinSum: minSum,
      fsspMaxSum: maxSum,
    },
    sources: {
      ...(reportData.sources || {}),
      fsspKontur: {
        ...source,
        items: filteredItems,
        summary: rebuildFsspKonturSummary(filteredItems),
        filterMeta: {
          availableRegions: buildFsspAvailableRegions(originalItems),
          totalBeforeFilter: originalItems.length,
          totalAfterFilter: filteredItems.length,
          hasFilters:
            statusFilter !== 'all' ||
            !!regionFilter ||
            minSum !== null ||
            maxSum !== null,
        },
      },
    },
  };
}

function rebuildFsspApiCloudSummary(items = []) {
  const safeItems = Array.isArray(items) ? items : [];

  const totalAmount = safeItems.reduce(
    (acc, item) => acc + parseFsspProceedingSum(item?.amount),
    0
  );

  const activeCount = safeItems.filter((item) => !item?.stopInfo).length;
  const closedCount = safeItems.filter((item) => !!item?.stopInfo).length;

  const departmentSet = new Set(
    safeItems
      .map((item) => String(item?.departmentName || '').trim())
      .filter(Boolean)
  );

  return {
    totalCount: safeItems.length,
    totalAmount,
    activeCount,
    closedCount,
    regionsCount: 0,
    bankruptcyRisk: totalAmount >= 500000,
    regionGroups: [],
    departmentsCount: departmentSet.size,
  };
}

function buildFsspApiCloudAvailableDepartments(items = []) {
  const safeItems = Array.isArray(items) ? items : [];

  return [...new Set(
    safeItems
      .map((item) => String(item?.departmentName || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'ru'));
}

function getFsspApiCloudStatus(item = {}) {
  return item?.stopInfo ? 'closed' : 'active';
}

function applyFsspApiCloudFilters(reportData = {}, query = {}) {
  const source = reportData?.sources?.fssp;

  if (!source || typeof source !== 'object') {
    return reportData;
  }

  const originalItems = Array.isArray(source.items) ? source.items : [];

  const statusFilter = normalizeFsspStatusFilter(query.fsspApiStatus);
  const departmentFilter = String(query.fsspApiDepartment || '').trim();
  const minSum = parseFsspMoneyFilter(query.fsspApiMinSum);
  const maxSum = parseFsspMoneyFilter(query.fsspApiMaxSum);

  const filteredItems = originalItems.filter((item) => {
    const status = getFsspApiCloudStatus(item);
    const departmentName = String(item?.departmentName || '').trim();
    const sum = parseFsspProceedingSum(item?.amount);

    if (statusFilter !== 'all' && status !== statusFilter) {
      return false;
    }

    if (departmentFilter && departmentName !== departmentFilter) {
      return false;
    }

    if (minSum !== null && sum < minSum) {
      return false;
    }

    if (maxSum !== null && sum > maxSum) {
      return false;
    }

    return true;
  });

  return {
    ...reportData,
    reportFilters: {
      ...(reportData.reportFilters || {}),
      fsspApiStatus: statusFilter,
      fsspApiDepartment: departmentFilter,
      fsspApiMinSum: minSum,
      fsspApiMaxSum: maxSum,
    },
    sources: {
      ...(reportData.sources || {}),
      fssp: {
        ...source,
        items: filteredItems,
        summary: rebuildFsspApiCloudSummary(filteredItems),
        filterMeta: {
          availableDepartments: buildFsspApiCloudAvailableDepartments(originalItems),
          totalBeforeFilter: originalItems.length,
          totalAfterFilter: filteredItems.length,
          hasFilters:
            statusFilter !== 'all' ||
            !!departmentFilter ||
            minSum !== null ||
            maxSum !== null,
        },
      },
    },
  };
}

function normalizeStopOperBik(value) {
  const digits = String(value || '').replace(/\D+/g, '');

  if (!digits) return '';

  if (digits.length <= 9) {
    return digits.padStart(9, '0');
  }

  return digits;
}

function getStopOperBankInfo(value) {
  const bik = normalizeStopOperBik(value);

  if (!bik) {
    return {
      bik: '',
      bankName: '',
      bankKs: '',
      bankDisplayName: 'БИК не указан',
    };
  }

  const bank = bankDirectory?.[bik] || null;
  const bankName = String(bank?.name || '').trim();
  const bankKs = String(bank?.ks || '').trim();

  return {
    bik,
    bankName,
    bankKs,
    bankDisplayName: bankName
      ? `${bankName}, БИК ${bik}`
      : `Банк не найден в справочнике, БИК ${bik}`,
  };
}

function formatStopOperMoneyText(value) {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  const num = Number(String(value).replace(/\s+/g, '').replace(',', '.'));

  if (!Number.isFinite(num)) {
    return String(value);
  }

  return `${num.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`;
}

function getStopOperRecords(source = {}) {
  const items = Array.isArray(source?.items) ? source.items : [];

  return items.flatMap((item) =>
    Array.isArray(item?.records) ? item.records : []
  );
}

function buildStopOperRSTableRows(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      const bankInfo = getStopOperBankInfo(record?.bik);

      const reasonCode = String(record?.reasonCode || '').trim();
      const reasonText = String(record?.reasonText || '').trim();

      return {
        number: String(record?.number || '').trim() || '—',
        codeFns: String(record?.codeFns || '').trim() || '—',

        date: formatReportDate(record?.date || ''),
        dateRaw: record?.date || '',

        dateAddInfo: String(record?.dateAddInfo || '').trim() || '—',

        reasonCode,
        reasonText,
        reasonDisplay: [reasonCode, reasonText].filter(Boolean).join(' — ') || '—',

        bik: bankInfo.bik || String(record?.bik || '').trim() || '',
        bankName: record?.bankName || bankInfo.bankName || '',
        bankKs: record?.bankKs || bankInfo.bankKs || '',
        bankDisplayName: record?.bankDisplayName || bankInfo.bankDisplayName,

        saldoEns: record?.saldoEns ?? null,
        saldoEnsText: formatStopOperMoneyText(record?.saldoEns),

        sourceItem: record,
      };
    })
    .sort((a, b) => toSortableDate(b.dateRaw || b.date) - toSortableDate(a.dateRaw || a.date));
}

function buildStopOperRSFilterMeta(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];

  const availableNumbers = [...new Set(
    safeRows.map((row) => row.number).filter((item) => item && item !== '—')
  )].sort((a, b) => a.localeCompare(b, 'ru'));

  const availableCodeFns = [...new Set(
    safeRows.map((row) => row.codeFns).filter((item) => item && item !== '—')
  )].sort((a, b) => a.localeCompare(b, 'ru'));

  const reasonMap = new Map();
  const bankMap = new Map();

  for (const row of safeRows) {
    if (row.reasonCode || row.reasonText) {
      const key = row.reasonCode || row.reasonText;
      if (!reasonMap.has(key)) {
        reasonMap.set(key, {
          code: row.reasonCode || row.reasonText,
          display: row.reasonDisplay || row.reasonText || row.reasonCode,
        });
      }
    }

    if (row.bik) {
      if (!bankMap.has(row.bik)) {
        bankMap.set(row.bik, {
          bik: row.bik,
          displayName: row.bankDisplayName || `БИК ${row.bik}`,
        });
      }
    }
  }

  return {
    availableNumbers,
    availableCodeFns,
    availableReasons: Array.from(reasonMap.values())
      .sort((a, b) => String(a.display || '').localeCompare(String(b.display || ''), 'ru')),
    availableBanks: Array.from(bankMap.values())
      .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), 'ru')),
  };
}

function applyStopOperRSFilters(reportData = {}, query = {}) {
  const source = reportData?.sources?.stopOperRS;

  if (!source || typeof source !== 'object') {
    return reportData;
  }

  const originalRecords = getStopOperRecords(source);
  const originalRows = buildStopOperRSTableRows(originalRecords);

  const numberFilter = String(query.stopOperNumber || '').trim();
  const codeFnsFilter = String(query.stopOperCodeFns || '').trim();
  const reasonCodeFilter = String(query.stopOperReasonCode || '').trim();
  const bikFilter = normalizeStopOperBik(query.stopOperBik || '');

  const filteredRows = originalRows.filter((row) => {
    if (numberFilter && row.number !== numberFilter) {
      return false;
    }

    if (codeFnsFilter && row.codeFns !== codeFnsFilter) {
      return false;
    }

    if (
      reasonCodeFilter &&
      row.reasonCode !== reasonCodeFilter &&
      row.reasonText !== reasonCodeFilter
    ) {
      return false;
    }

    if (bikFilter && row.bik !== bikFilter) {
      return false;
    }

    return true;
  });

  return {
    ...reportData,
    reportFilters: {
      ...(reportData.reportFilters || {}),
      stopOperNumber: numberFilter,
      stopOperCodeFns: codeFnsFilter,
      stopOperReasonCode: reasonCodeFilter,
      stopOperBik: bikFilter,
    },
    sources: {
      ...(reportData.sources || {}),
      stopOperRS: {
        ...source,
        tableRows: filteredRows,
        filterMeta: {
          ...buildStopOperRSFilterMeta(originalRows),
          totalBeforeFilter: originalRows.length,
          totalAfterFilter: filteredRows.length,
          hasFilters:
            !!numberFilter ||
            !!codeFnsFilter ||
            !!reasonCodeFilter ||
            !!bikFilter,
        },
      },
    },
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  );
}

function buildReportQueryString(query = {}) {
  const params = new URLSearchParams();

  const fsspStatus = String(query.fsspStatus || '').trim();
  const fsspRegion = String(query.fsspRegion || '').trim();
  const fsspMinSum = String(query.fsspMinSum || '').trim();
  const fsspMaxSum = String(query.fsspMaxSum || '').trim();
  const fsspApiStatus = String(query.fsspApiStatus || '').trim();
  const fsspApiDepartment = String(query.fsspApiDepartment || '').trim();
  const fsspApiMinSum = String(query.fsspApiMinSum || '').trim();
  const fsspApiMaxSum = String(query.fsspApiMaxSum || '').trim();
  const stopOperNumber = String(query.stopOperNumber || '').trim();
  const stopOperCodeFns = String(query.stopOperCodeFns || '').trim();
  const stopOperReasonCode = String(query.stopOperReasonCode || '').trim();
  const stopOperBik = String(query.stopOperBik || '').trim();
  const courtType = String(query.courtType || '').trim();
  const courtMatch = String(query.courtMatch || '').trim();
  const courtRole = String(query.courtRole || '').trim();
  const courtRegion = String(query.courtRegion || '').trim();
  const courtName = String(query.courtName || '').trim();
  const courtDateFrom = String(query.courtDateFrom || '').trim();
  const courtDateTo = String(query.courtDateTo || '').trim();
  const courtArticle = String(query.courtArticle || '').trim();
  const courtStatus = String(query.courtStatus || '').trim();
  const commercialStatus = String(query.commercialStatus || '').trim();
  const commercialRole = String(query.commercialRole || '').trim();
  const commercialMinSum = String(query.commercialMinSum || '').trim();
  const commercialMaxSum = String(query.commercialMaxSum || '').trim();
  const commercialPersonalRisk = String(query.commercialPersonalRisk || '').trim();
  const commercialCompanyRoles = normalizeCommercialCompanyRoleFilter(query.commercialCompanyRole);
  const arbRole = String(query.arbRole || '').trim();
  const arbOppositeRole = String(query.arbOppositeRole || '').trim();
  const arbKonturRole = String(query.arbKonturRole || '').trim();
  const arbKonturMatch = String(query.arbKonturMatch || '').trim();
  const arbKonturOppositeRole = String(query.arbKonturOppositeRole || '').trim();

  if (fsspStatus && fsspStatus !== 'all') {
    params.set('fsspStatus', fsspStatus);
  }

  if (fsspRegion) {
    params.set('fsspRegion', fsspRegion);
  }

  if (fsspMinSum) {
    params.set('fsspMinSum', fsspMinSum);
  }

  if (fsspMaxSum) {
    params.set('fsspMaxSum', fsspMaxSum);
  }

  if (stopOperNumber) {
    params.set('stopOperNumber', stopOperNumber);
  }

  if (stopOperCodeFns) {
    params.set('stopOperCodeFns', stopOperCodeFns);
  }

  if (stopOperReasonCode) {
    params.set('stopOperReasonCode', stopOperReasonCode);
  }

  if (stopOperBik) {
    params.set('stopOperBik', stopOperBik);
  }

  if (fsspApiStatus && fsspApiStatus !== 'all') {
    params.set('fsspApiStatus', fsspApiStatus);
  }

  if (fsspApiDepartment) {
    params.set('fsspApiDepartment', fsspApiDepartment);
  }

  if (fsspApiMinSum) {
    params.set('fsspApiMinSum', fsspApiMinSum);
  }

  if (fsspApiMaxSum) {
    params.set('fsspApiMaxSum', fsspApiMaxSum);
  }

  if (courtType) {
    params.set('courtType', courtType);
  }

  if (courtMatch) {
    params.set('courtMatch', courtMatch);
  }

  if (courtRole) {
    params.set('courtRole', courtRole);
  }

  if (courtRegion) {
    params.set('courtRegion', courtRegion);
  }

  if (courtName) {
    params.set('courtName', courtName);
  }

  if (courtDateFrom) {
    params.set('courtDateFrom', courtDateFrom);
  }

  if (courtDateTo) {
    params.set('courtDateTo', courtDateTo);
  }

  if (courtArticle) {
    params.set('courtArticle', courtArticle);
  }

  if (courtStatus) {
    params.set('courtStatus', courtStatus);
  }

  if (commercialStatus) {
    params.set('commercialStatus', commercialStatus);
  }

  if (commercialRole) {
    params.set('commercialRole', commercialRole);
  }

  if (commercialMinSum) {
    params.set('commercialMinSum', commercialMinSum);
  }

  if (commercialMaxSum) {
    params.set('commercialMaxSum', commercialMaxSum);
  }

  if (commercialPersonalRisk) {
    params.set('commercialPersonalRisk', commercialPersonalRisk);
  }

  for (const role of commercialCompanyRoles) {
    params.append('commercialCompanyRole', role);
  }

  if (arbRole) {
    params.set('arbRole', arbRole);
  }

  if (arbOppositeRole) {
    params.set('arbOppositeRole', arbOppositeRole);
  }

  if (arbKonturRole) {
    params.set('arbKonturRole', arbKonturRole);
  }

  if (arbKonturMatch) {
    params.set('arbKonturMatch', arbKonturMatch);
  }

  if (arbKonturOppositeRole) {
    params.set('arbKonturOppositeRole', arbKonturOppositeRole);
  }

  return params.toString();
}

function toSortableDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;

  const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) {
    return Date.UTC(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]));
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCourtProceedingTypeForTable(value = '') {
  const raw = String(value || '').trim().toLowerCase();

  if (!raw) return 'Прочее';

  if (raw.includes('уголов')) return 'Уголовное';
  if (raw.includes('административ')) return 'Административное';
  if (raw.includes('материал')) return 'Материалы';
  if (raw.includes('граждан')) return 'Гражданское';

  return 'Прочее';
}

function pickPrimaryMatchedCourtParticipant(participants = []) {
  const safeParticipants = Array.isArray(participants) ? participants : [];

  const fullMatch = safeParticipants.find((item) => item?.matchType === 'FullMatch');
  if (fullMatch) return fullMatch;

  const partialMatch = safeParticipants.find((item) => item?.matchType === 'PartialMatch');
  if (partialMatch) return partialMatch;

  return null;
}

function buildCourtsCommonTableRows(items = []) {
  const safeItems = Array.isArray(items) ? items : [];

  return safeItems
    .map((item) => {
      const primaryParticipant = pickPrimaryMatchedCourtParticipant(item?.participants || []);
      if (!primaryParticipant) return null;

      const actsCount = Array.isArray(item?.judicialActs) ? item.judicialActs.length : 0;
      const tableProceedingType = normalizeCourtProceedingTypeForTable(item?.proceedingType || '');

      return {
        tableProceedingType,
        tableProceedingTypeText: item?.proceedingType || tableProceedingType,

        tableMatchType: primaryParticipant?.matchTypeText || primaryParticipant?.matchType || '—',
        tableRole: primaryParticipant?.roleText || primaryParticipant?.role || '—',

        tableRegion: item?.region || '—',
        tableCourt: item?.court || '—',
        tableDate: item?.proceedingStartDate || '',
        tableCaseNumber: item?.caseNumber || '—',
        tableArticle: primaryParticipant?.article || '',
        tableStatus: item?.statusText || item?.status || '—',
        tableResult: item?.proceedingResult || '—',

        tableActsCount: actsCount,
        tableHasActs: actsCount > 0 ? 'Да' : 'Нет',

        tableUrl: item?.proceedingUrl || null,

        sourceItem: item,
        matchedParticipant: primaryParticipant,
      };
    })
    .filter(Boolean);
}

function buildCourtsCommonFilterMeta(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];

  return {
    availableProceedingTypes: [...new Set(
      safeRows.map((row) => row.tableProceedingType).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'ru')),

    availableMatchTypes: [...new Set(
      safeRows.map((row) => row.tableMatchType).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'ru')),

    availableRoles: [...new Set(
      safeRows.map((row) => row.tableRole).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'ru')),

    availableRegions: [...new Set(
      safeRows.map((row) => row.tableRegion).filter(Boolean)
    )].sort((a, b) => String(a).localeCompare(String(b), 'ru')),

    availableCourts: [...new Set(
      safeRows.map((row) => row.tableCourt).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'ru')),

    availableArticles: [...new Set(
      safeRows.map((row) => row.tableArticle).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'ru')),

    availableStatuses: [...new Set(
      safeRows.map((row) => row.tableStatus).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'ru')),
  };
}

function buildCourtsCommonSummary(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];

  const summary = {
    totalCount: safeRows.length,
    hasCases: safeRows.length > 0,

    civilCount: 0,
    criminalCount: 0,
    administrativeCount: 0,
    materialsCount: 0,
    otherCount: 0,

    activeCount: 0,
    finishedCount: 0,
    suspendedCount: 0,

    actsCount: 0,
  };

  for (const row of safeRows) {
    const type = String(row?.tableProceedingType || '').trim();
    const status = String(row?.tableStatus || '').trim();
    const actsCount = Number(row?.tableActsCount || 0);

    if (type === 'Гражданское') summary.civilCount += 1;
    else if (type === 'Уголовное') summary.criminalCount += 1;
    else if (type === 'Административное') summary.administrativeCount += 1;
    else if (type === 'Материалы') summary.materialsCount += 1;
    else summary.otherCount += 1;

    if (status === 'Производство активно' || status === 'Активно') {
      summary.activeCount += 1;
    } else if (status === 'Производство завершено') {
      summary.finishedCount += 1;
    } else if (status === 'Производство приостановлено') {
      summary.suspendedCount += 1;
    }

    if (actsCount > 0) {
      summary.actsCount += 1;
    }
  }

  return summary;
}

function applyCourtsCommonFilters(reportData = {}, query = {}) {
  const source = reportData?.sources?.courtsCommon;

  if (!source || typeof source !== 'object') {
    return reportData;
  }

  const originalItems = Array.isArray(source.items) ? source.items : [];
  const originalRows = buildCourtsCommonTableRows(originalItems);
  const rebuiltSummary = buildCourtsCommonSummary(originalRows);

  const typeFilter = String(query.courtType || '').trim();
  const matchFilter = String(query.courtMatch || '').trim();
  const roleFilter = String(query.courtRole || '').trim();
  const regionFilter = String(query.courtRegion || '').trim();
  const courtFilter = String(query.courtName || '').trim();
  const dateFromFilter = String(query.courtDateFrom || '').trim();
  const dateToFilter = String(query.courtDateTo || '').trim();
  const articleFilter = String(query.courtArticle || '').trim().toLowerCase();
  const statusFilter = String(query.courtStatus || '').trim();

  const dateFromTs = toSortableDate(dateFromFilter);
  const dateToTs = toSortableDate(dateToFilter);

  const filteredRows = originalRows.filter((row) => {
    if (typeFilter && row.tableProceedingType !== typeFilter) return false;
    if (matchFilter && row.tableMatchType !== matchFilter) return false;
    if (roleFilter && row.tableRole !== roleFilter) return false;
    if (regionFilter && row.tableRegion !== regionFilter) return false;
    if (courtFilter && row.tableCourt !== courtFilter) return false;
    if (statusFilter && row.tableStatus !== statusFilter) return false;

    if (articleFilter) {
      const articleValue = String(row.tableArticle || '').toLowerCase();
      if (!articleValue.includes(articleFilter)) {
        return false;
      }
    }

    const rowDateTs = toSortableDate(row.tableDate);

    if (dateFromTs && (!rowDateTs || rowDateTs < dateFromTs)) {
      return false;
    }

    if (dateToTs && (!rowDateTs || rowDateTs > dateToTs)) {
      return false;
    }

    return true;
  });

  const filteredItems = filteredRows.map((row) => row.sourceItem);

  return {
    ...reportData,
    reportFilters: {
      ...(reportData.reportFilters || {}),
      courtType: typeFilter,
      courtMatch: matchFilter,
      courtRole: roleFilter,
      courtRegion: regionFilter,
      courtName: courtFilter,
      courtDateFrom: dateFromFilter,
      courtDateTo: dateToFilter,
      courtArticle: String(query.courtArticle || '').trim(),
      courtStatus: statusFilter,
    },
    sources: {
      ...(reportData.sources || {}),
      courtsCommon: {
        ...source,
        summary: rebuiltSummary,
        items: filteredItems,
        tableRows: filteredRows,
        filterMeta: {
          ...buildCourtsCommonFilterMeta(originalRows),
          totalBeforeFilter: originalRows.length,
          totalAfterFilter: filteredRows.length,
          hasFilters:
            !!typeFilter ||
            !!matchFilter ||
            !!roleFilter ||
            !!regionFilter ||
            !!courtFilter ||
            !!dateFromFilter ||
            !!dateToFilter ||
            !!articleFilter ||
            !!statusFilter,
        },
      },
    },
  };
}

function normalizeArbFilterText(value = '') {
  return String(value || '').trim();
}

function getArbLastDocument(item = {}) {
  const documents = Array.isArray(item?.documents) ? item.documents : [];
  return documents[0] || null;
}

function buildArbPartyText(party = {}, fallbackRoleText = '') {
  const name = String(party?.name || '').trim() || '—';
  const inn = String(party?.inn || '').trim();
  const roleText = String(party?.roleText || fallbackRoleText || '').trim();

  const rolePart = roleText ? ` — ${roleText.toLowerCase()}` : '';
  const innPart = inn ? `, ИНН ${inn}` : '';

  return `${name}${rolePart}${innPart}`;
}

function normalizeArbOppositeParty(party = {}, roleText = '') {
  return {
    name: String(party?.name || '').trim() || '—',
    inn: String(party?.inn || '').trim(),
    address: String(party?.address || '').trim(),
    roleText,
    text: buildArbPartyText(
      {
        ...party,
        roleText,
      },
      roleText
    ),
  };
}

function buildArbOppositeParties(item = {}) {
  const plaintiffs = Array.isArray(item?.plaintiffs) ? item.plaintiffs : [];
  const respondents = Array.isArray(item?.respondents) ? item.respondents : [];

  if (item?.role === 'plaintiff') {
    return respondents.map((party) => normalizeArbOppositeParty(party, 'Ответчик'));
  }

  if (item?.role === 'respondent') {
    return plaintiffs.map((party) => normalizeArbOppositeParty(party, 'Истец'));
  }

  if (item?.role === 'mixed') {
    return [
      ...plaintiffs.map((party) => normalizeArbOppositeParty(party, 'Истец')),
      ...respondents.map((party) => normalizeArbOppositeParty(party, 'Ответчик')),
    ];
  }

  const participants = Array.isArray(item?.participants) ? item.participants : [];

  return participants.map((party) =>
    normalizeArbOppositeParty(
      party,
      party?.roleText || party?.role || 'Участник'
    )
  );
}

function buildArbLastActText(lastDocument = null) {
  if (!lastDocument) {
    return {
      hasLastAct: false,
      title: 'Судебные акты не найдены',
      meta: '',
      content: '',
      court: '',
      fileName: '',
      fileUrl: '',
      caseUrl: '',
      instanceLevelText: '',
    };
  }

  const typeText =
    lastDocument.documentTypeText ||
    lastDocument.documentType ||
    'Судебный акт';

  const dateText = lastDocument.registrationDate
    ? ` от ${lastDocument.registrationDate}`
    : '';

  return {
    hasLastAct: true,
    title: `${typeText}${dateText}`,
    meta: lastDocument.instanceNumber || '',
    content: lastDocument.primaryContentText || '',
    court: lastDocument.court || '',
    fileName: lastDocument.fileName || '',
    fileUrl: lastDocument.fileUrl || '',
    caseUrl: lastDocument.caseUrl || '',
    instanceLevelText: lastDocument.instanceLevelText || '',
  };
}

function buildArbitrationApiCloudTableRows(cases = []) {
  const safeCases = Array.isArray(cases) ? cases : [];

  return safeCases
    .map((item) => {
      const oppositeParties = buildArbOppositeParties(item);
      const oppositeRoleValues = [
        ...new Set(
          oppositeParties
            .map((party) => String(party.roleText || '').trim())
            .filter(Boolean)
        ),
      ];

      const lastDocument = getArbLastDocument(item);
      const lastAct = buildArbLastActText(lastDocument);

      return {
        caseNumber: item?.caseNumber || '—',
        caseDate: item?.caseDate || '',
        caseType: item?.caseType || 'other',
        caseTypeText: item?.caseTypeText || 'Прочее арбитражное дело',

        court: item?.court || '—',
        judge: item?.judge || '',

        subjectRole: item?.role || 'unknown',
        subjectRoleText: item?.roleText || 'Роль не определена',

        matchGroup: item?.matchGroup || '',
        matchText: item?.matchText || 'Совпадение не определено',

        oppositeParties,
        oppositeRoleValues,
        oppositeRoleText: oppositeRoleValues.join(', ') || '—',

        lastAct,
        hasDocuments: item?.hasDocuments === true,
        documentsCount: item?.documentsSummary?.totalDocuments || 0,

        kadUrl: item?.url || null,
        rasUrl: lastAct.fileUrl || lastAct.caseUrl || null,

        sourceItem: item,
      };
    })
    .sort((a, b) => toSortableDate(b.caseDate) - toSortableDate(a.caseDate));
}

function buildArbitrationApiCloudFilterMeta(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];

  return {
    availableRoles: [
      ...new Set(
        safeRows
          .map((row) => row.subjectRoleText)
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, 'ru')),

    availableOppositeRoles: [
      ...new Set(
        safeRows
          .flatMap((row) => Array.isArray(row.oppositeRoleValues) ? row.oppositeRoleValues : [])
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, 'ru')),
  };
}

function applyArbitrationApiCloudCombinedFilters(reportData = {}, query = {}) {
  const source = reportData?.sources?.arbitrationApiCloudCombined;

  if (!source || typeof source !== 'object') {
    return reportData;
  }

  const originalCases = Array.isArray(source.cases) ? source.cases : [];
  const originalRows = buildArbitrationApiCloudTableRows(originalCases);

  const roleFilter = normalizeArbFilterText(query.arbRole);
  const oppositeRoleFilter = normalizeArbFilterText(query.arbOppositeRole);

  const filteredRows = originalRows.filter((row) => {
    if (roleFilter && row.subjectRoleText !== roleFilter) {
      return false;
    }

    if (
      oppositeRoleFilter &&
      !row.oppositeRoleValues.includes(oppositeRoleFilter)
    ) {
      return false;
    }

    return true;
  });

  return {
    ...reportData,
    reportFilters: {
      ...(reportData.reportFilters || {}),
      arbRole: roleFilter,
      arbOppositeRole: oppositeRoleFilter,
    },
    sources: {
      ...(reportData.sources || {}),
      arbitrationApiCloudCombined: {
        ...source,
        tableRows: filteredRows,
        filterMeta: {
          ...buildArbitrationApiCloudFilterMeta(originalRows),
          totalBeforeFilter: originalRows.length,
          totalAfterFilter: filteredRows.length,
          hasFilters: !!roleFilter || !!oppositeRoleFilter,
        },
      },
    },
  };
}

function translateArbKonturDocumentTypeForReport(value = '') {
  const map = {
    Decision: 'Решение',
    Ruling: 'Определение',
    Resolution: 'Постановление',
    Writ: 'Исполнительный лист',
  };

  return map[value] || value || '';
}

function translateArbKonturCriterionForReport(value = '') {
  const map = {
    Fio: 'ФИО',
    BirthDate: 'Дата рождения',
    SurnameAndInitials: 'Фамилия и инициалы',
    Inn: 'ИНН',
    Snils: 'СНИЛС',
    Passport: 'Паспорт',
  };

  return map[value] || value || '';
}

function formatArbKonturDateForReport(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}.${iso[2]}.${iso[1]}`;
  }

  return raw;
}

function normalizeArbKonturInn(value = '') {
  return String(value || '').replace(/\D+/g, '');
}

function getArbKonturTargetParticipants(item = {}) {
  const participants = Array.isArray(item?.participants) ? item.participants : [];

  return participants.filter((participant) => participant?.isTarget);
}

function getArbKonturCriterionCodes(participant = {}) {
  return (Array.isArray(participant?.criterion) ? participant.criterion : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function getArbKonturCriterionText(participant = {}) {
  const existingText = String(participant?.criterionText || '').trim();

  if (existingText) {
    return existingText;
  }

  return getArbKonturCriterionCodes(participant)
    .map(translateArbKonturCriterionForReport)
    .filter(Boolean)
    .join(', ');
}

function buildArbKonturMatchInfo(item = {}, subject = {}) {
  const targetParticipants = getArbKonturTargetParticipants(item);
  const subjectInn = normalizeArbKonturInn(subject?.inn || '');

  const matchTypes = [
    ...new Set(
      targetParticipants
        .map((participant) => String(participant?.matchType || '').trim())
        .filter(Boolean)
    ),
  ];

  const criteriaCodes = [
    ...new Set(
      targetParticipants
        .flatMap((participant) => getArbKonturCriterionCodes(participant))
        .filter(Boolean)
    ),
  ];

  const criteriaText = criteriaCodes
    .map(translateArbKonturCriterionForReport)
    .filter(Boolean)
    .join(', ');

  const hasFullMatch = matchTypes.includes('FullMatch');
  const hasPartialMatch = matchTypes.includes('PartialMatch');
  const hasInnCriterion = criteriaCodes.includes('Inn');

  const hasParticipantInnMatch = targetParticipants.some((participant) => {
    const participantInn = normalizeArbKonturInn(participant?.inn || '');
    return !!subjectInn && !!participantInn && participantInn === subjectInn;
  });

  const hasInnEvidence = hasInnCriterion || hasParticipantInnMatch;

  if (hasFullMatch && hasInnEvidence) {
    return {
      level: 'reliableInn',
      filterValue: 'Надёжное совпадение по ИНН',
      title: 'Надёжное совпадение',
      text: 'FullMatch по ИНН',
      details: criteriaText ? `Критерии: ${criteriaText}` : '',
      badgeClass: 'arb-match-badge-reliable',
    };
  }

  if (hasFullMatch) {
    return {
      level: 'fullNoInn',
      filterValue: 'Полное совпадение без ИНН',
      title: 'Полное совпадение',
      text: criteriaText ? `FullMatch по ${criteriaText}` : 'FullMatch',
      details: 'ИНН в совпадении не подтверждён',
      badgeClass: 'arb-match-badge-warning',
    };
  }

  if (hasPartialMatch && hasInnEvidence) {
    return {
      level: 'partialInn',
      filterValue: 'Частичное совпадение по ИНН',
      title: 'Частичное совпадение',
      text: 'PartialMatch по ИНН',
      details: criteriaText ? `Критерии: ${criteriaText}` : '',
      badgeClass: 'arb-match-badge-warning',
    };
  }

  if (hasPartialMatch) {
    return {
      level: 'partialFio',
      filterValue: 'Частичное совпадение по ФИО',
      title: 'Требует проверки',
      text: criteriaText ? `PartialMatch по ${criteriaText}` : 'PartialMatch',
      details: 'ИНН участника дела не подтверждён',
      badgeClass: 'arb-match-badge-weak',
    };
  }

  return {
    level: 'unknown',
    filterValue: 'Совпадение не подтверждено',
    title: 'Совпадение не подтверждено',
    text: 'Критерии совпадения не определены',
    details: '',
    badgeClass: 'arb-match-badge-weak',
  };
}

function getArbKonturSubjectRoleText(item = {}) {
  const targetParticipants = getArbKonturTargetParticipants(item);

  const roles = [
    ...new Set(
      targetParticipants
        .map((participant) => String(participant?.roleText || participant?.role || '').trim())
        .filter(Boolean)
    ),
  ];

  const hasPlaintiff = roles.includes('Истец');
  const hasDefendant = roles.includes('Ответчик');

  if (hasPlaintiff && hasDefendant) {
    return 'Истец и ответчик';
  }

  if (roles.length) {
    return roles.join(', ');
  }

  return 'Роль не определена';
}

function buildArbKonturOppositeParties(item = {}) {
  const participants = Array.isArray(item?.participants) ? item.participants : [];

  return participants
    .filter((participant) => !participant?.isTarget)
    .map((participant) => {
      const name = String(participant?.name || '').trim() || '—';
      const inn = String(participant?.inn || '').trim();
      const ogrn = String(participant?.ogrn || '').trim();
      const roleText = String(participant?.roleText || participant?.role || '').trim() || 'Участник';

      return {
        name,
        inn,
        ogrn,
        roleText,
      };
    });
}

function getArbKonturLastAct(item = {}) {
  const instances = Array.isArray(item?.instances) ? item.instances : [];
  const candidates = [];

  for (const instance of instances) {
    const instanceTypeText =
      instance?.instanceTypeText ||
      instance?.instanceType ||
      '';

    const instanceDate =
      instance?.receivedInstanceDate ||
      '';

    const instanceDocumentType =
      translateArbKonturDocumentTypeForReport(instance?.documentType || '') ||
      instance?.documentType ||
      '';

    const documents = Array.isArray(instance?.documents) ? instance.documents : [];

    if (!documents.length) {
      candidates.push({
        hasLastAct: true,
        title: instanceDocumentType || 'Судебный акт',
        date: formatArbKonturDateForReport(instanceDate),
        instanceLevelText: instanceTypeText,
        content: '',
        fileUrl: '',
        sortDate: instanceDate,
      });

      continue;
    }

    for (const document of documents) {
      const documentType =
        translateArbKonturDocumentTypeForReport(document?.documentType || '') ||
        instanceDocumentType ||
        'Судебный акт';

      const documentDate =
        document?.publishDate ||
        document?.issueDate ||
        instanceDate ||
        '';

      const formattedDate = formatArbKonturDateForReport(documentDate);

      candidates.push({
        hasLastAct: true,
        title: formattedDate ? `${documentType} от ${formattedDate}` : documentType,
        date: formattedDate,
        instanceLevelText: instanceTypeText,
        content: '',
        fileUrl: document?.url || '',
        sortDate: documentDate,
      });
    }
  }

  const sorted = candidates.sort((a, b) => toSortableDate(b.sortDate) - toSortableDate(a.sortDate));
  const last = sorted[0] || null;

  if (!last) {
    return {
      hasLastAct: false,
      title: 'Судебные акты не найдены',
      date: '',
      instanceLevelText: '',
      content: '',
      fileUrl: '',
    };
  }

  return last;
}

function getArbKonturDocumentsCount(item = {}) {
  const instances = Array.isArray(item?.instances) ? item.instances : [];

  return instances.reduce((acc, instance) => {
    const documents = Array.isArray(instance?.documents) ? instance.documents : [];
    return acc + documents.length;
  }, 0);
}

function buildArbitrationKonturTableRows(items = [], subject = {}) {
  const safeItems = (Array.isArray(items) ? items : []).filter(
    (item) => item?.kind === 'arbitration_case'
  );

  return safeItems
    .map((item) => {
      const oppositeParties = buildArbKonturOppositeParties(item);

      const oppositeRoleValues = [
        ...new Set(
          oppositeParties
            .map((party) => String(party.roleText || '').trim())
            .filter(Boolean)
        ),
      ];

      const lastAct = getArbKonturLastAct(item);
      const subjectRoleText = getArbKonturSubjectRoleText(item);
      const matchInfo = buildArbKonturMatchInfo(item, subject);

      const categoryText =
        item?.proceedingCategoryText ||
        item?.proceedingCategory ||
        item?.rawRecord?.proceedingCategoryText ||
        item?.rawRecord?.proceedingCategory ||
        '';

      const caseTypeText =
        item?.proceedingType ||
        categoryText ||
        'Арбитражное дело';

      const court =
        item?.court ||
        item?.rawRecord?.court ||
        item?.rawRecord?.instance ||
        '—';

      return {
        caseNumber: item?.number || '—',
        caseDate: formatArbKonturDateForReport(item?.proceedingStartDate || ''),
        caseDateRaw: item?.proceedingStartDate || '',
        caseTypeText,
        categoryText,

        court,
        judge: item?.judge || item?.rawRecord?.judge || '',

        subjectRoleText,

        matchInfo,
        matchFilterValue: matchInfo.filterValue,
        matchText: matchInfo.text,

        oppositeParties,
        oppositeRoleValues,
        oppositeRoleText: oppositeRoleValues.join(', ') || '—',

        resultText: item?.proceedingResultText || item?.proceedingResult || '',
        sum: item?.sum ?? null,

        lastAct,
        documentsCount: getArbKonturDocumentsCount(item),

        kadUrl: item?.url || null,
        actUrl: lastAct?.fileUrl || null,

        sourceItem: item,
      };
    })
    .sort((a, b) => toSortableDate(b.caseDateRaw || b.caseDate) - toSortableDate(a.caseDateRaw || a.caseDate));
}

function buildArbitrationKonturMatchSummary(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];

  return {
    reliableInnCount: safeRows.filter((row) => row?.matchInfo?.level === 'reliableInn').length,
    fullNoInnCount: safeRows.filter((row) => row?.matchInfo?.level === 'fullNoInn').length,
    partialInnCount: safeRows.filter((row) => row?.matchInfo?.level === 'partialInn').length,
    partialFioCount: safeRows.filter((row) => row?.matchInfo?.level === 'partialFio').length,
    unknownCount: safeRows.filter((row) => row?.matchInfo?.level === 'unknown').length,
  };
}

function buildArbitrationKonturFilterMeta(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];

  return {
    availableRoles: [
      ...new Set(
        safeRows
          .map((row) => row.subjectRoleText)
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, 'ru')),

    availableMatches: [
      ...new Set(
        safeRows
          .map((row) => row.matchFilterValue)
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, 'ru')),

    availableOppositeRoles: [
      ...new Set(
        safeRows
          .flatMap((row) => Array.isArray(row.oppositeRoleValues) ? row.oppositeRoleValues : [])
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, 'ru')),
  };
}

function applyArbitrationKonturFilters(reportData = {}, query = {}) {
  const source = reportData?.sources?.arbitrationKontur;

  if (!source || typeof source !== 'object') {
    return reportData;
  }

  const originalItems = (Array.isArray(source.items) ? source.items : []).filter(
    (item) => item?.kind === 'arbitration_case'
  );
  const originalRows = buildArbitrationKonturTableRows(
    originalItems,
    reportData?.subject || {}
  );

  const roleFilter = normalizeArbFilterText(query.arbKonturRole);
  const matchFilter = normalizeArbFilterText(query.arbKonturMatch);
  const oppositeRoleFilter = normalizeArbFilterText(query.arbKonturOppositeRole);

  const filteredRows = originalRows.filter((row) => {
    if (roleFilter && row.subjectRoleText !== roleFilter) {
      return false;
    }

    if (matchFilter && row.matchFilterValue !== matchFilter) {
      return false;
    }

    if (
      oppositeRoleFilter &&
      !row.oppositeRoleValues.includes(oppositeRoleFilter)
    ) {
      return false;
    }

    return true;
  });

  return {
    ...reportData,
    reportFilters: {
      ...(reportData.reportFilters || {}),
      arbKonturRole: roleFilter,
      arbKonturMatch: matchFilter,
      arbKonturOppositeRole: oppositeRoleFilter,
    },
    sources: {
      ...(reportData.sources || {}),
      arbitrationKontur: {
        ...source,
        tableRows: filteredRows,
        matchSummary: buildArbitrationKonturMatchSummary(originalRows),
        filterMeta: {
          ...buildArbitrationKonturFilterMeta(originalRows),
          totalBeforeFilter: originalRows.length,
          totalAfterFilter: filteredRows.length,
          hasFilters: !!roleFilter || !!matchFilter || !!oppositeRoleFilter,
        },
      },
    },
  };
}

function normalizeCommercialText(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeCommercialDigits(value = '') {
  return String(value || '').replace(/\D+/g, '');
}

function parseCommercialMoney(value) {
  if (value === undefined || value === null || value === '') return null;

  const normalized = String(value).replace(/\s+/g, '').replace(',', '.');
  const num = Number(normalized);

  return Number.isFinite(num) ? num : null;
}

function buildCommercialRelationshipText(item = {}) {
  const values = Array.isArray(item?.relationshipTypeText) ? item.relationshipTypeText : [];
  if (values.length) {
    return values.join(', ');
  }

  const rawValues = Array.isArray(item?.relationshipType) ? item.relationshipType : [];
  if (rawValues.length) {
    return rawValues.join(', ');
  }

  if (item?.isOwnEntrepreneur || rawValues.includes('IndividualEntrepreneur')) {
    return 'ИП';
  }

  return 'Связь в компании не раскрыта';
}

function isCommercialDirector(item = {}) {
  const values = Array.isArray(item?.relationshipType) ? item.relationshipType : [];
  return values.includes('Director');
}

function isCommercialFounder(item = {}) {
  const values = Array.isArray(item?.relationshipType) ? item.relationshipType : [];
  return values.includes('Founder');
}

function isCommercialIp(item = {}) {
  const values = Array.isArray(item?.relationshipType) ? item.relationshipType : [];
  return values.includes('IndividualEntrepreneur');
}

function matchCommercialParticipantToOrganization(org = {}, participant = {}) {
  const orgInn = normalizeCommercialDigits(org?.inn || '');
  const participantInn = normalizeCommercialDigits(participant?.inn || '');

  if (orgInn && participantInn && orgInn === participantInn) {
    return true;
  }

  const orgOgrn = normalizeCommercialDigits(org?.ogrn || '');
  const participantOgrn = normalizeCommercialDigits(participant?.ogrn || '');

  if (orgOgrn && participantOgrn && orgOgrn === participantOgrn) {
    return true;
  }

  const orgName = normalizeCommercialText(org?.name || '');
  const participantName = normalizeCommercialText(participant?.name || '');

  if (orgName && participantName && orgName === participantName) {
    return true;
  }

  return false;
}

function buildCommercialProceedingRoleText(proceeding = {}, org = {}) {
  const participants = Array.isArray(proceeding?.participants) ? proceeding.participants : [];

  const roles = [...new Set(
    participants
      .filter((participant) => matchCommercialParticipantToOrganization(org, participant))
      .map((participant) => participant?.roleText || participant?.role || null)
      .filter(Boolean)
  )];

  if (!roles.length) {
    return '—';
  }

  return roles.join(', ');
}

function findCommercialDecisionLink(proceeding = {}) {
  const instances = Array.isArray(proceeding?.instances) ? proceeding.instances : [];

  for (const instance of instances) {
    const documents = Array.isArray(instance?.documents) ? instance.documents : [];

    for (const document of documents) {
      if (document?.url) {
        return {
          label: document?.documentTypeText || document?.documentType || 'Решение',
          url: document.url,
        };
      }
    }
  }

  return null;
}

function translateCommercialArbitrationResultName(value = '') {
  const map = {
    Lost: 'Проиграно',
    PartiallyLost: 'Частично проиграно',
    NotLost: 'Не проиграно',
    InProgress: 'В процессе',
    BlindSpot: 'Не определено',
    ResultUnknown: 'Не определено',
    Won: 'Выиграно',
    PartiallyWon: 'Частично выиграно',
    Settled: 'Мировое соглашение',
  };

  return map[value] || value || 'Не определено';
}

function formatCommercialMoneyText(value) {
  const num = parseCommercialMoney(value);
  if (num === null) return '—';

  return `${num.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`;
}

function buildCommercialArbitrationResultSummary(item = {}) {
  const values = Array.isArray(item?.arbitrationGroupByResult)
    ? item.arbitrationGroupByResult
    : [];

  return values
    .map((entry) => {
      const code = String(entry?.name || '').trim();

      const label =
        translateCommercialArbitrationResultName(code) ||
        entry?.nameText ||
        'Результат не определён';

      const count = Number(entry?.count || 0);
      const sumText = formatCommercialMoneyText(entry?.sum);

      return {
        code,
        label,
        count,
        sum: parseCommercialMoney(entry?.sum),
        sumText,
        text: `${label}: ${count}${sumText !== '—' ? ` / ${sumText}` : ''}`,
      };
    })
    .filter((entry) => entry.label && (entry.count > 0 || entry.sumText !== '—'));
}

function translateCommercialArbitrationCategoryName(value = '') {
  const map = {
    Bankruptcy: 'Банкротство',
    Loan: 'Займы / кредиты',
    ServicesAgreement: 'Договоры оказания услуг',
    SupplyAgreement: 'Договоры поставки',
    Taxes: 'Налоги',
    Lease: 'Аренда',
    Rent: 'Аренда',
    RealEstate: 'Недвижимость',
    EnergySupply: 'Энергоснабжение',
    Transportation: 'Перевозка',
  };

  return map[value] || value || 'Категория не указана';
}

function buildCommercialArbitrationCategorySummary(item = {}) {
  const values = Array.isArray(item?.arbitrationGroupByCategory)
    ? item.arbitrationGroupByCategory
    : [];

  return values
    .map((entry) => {
      const code = String(entry?.name || '').trim();

      const label =
        entry?.nameText ||
        translateCommercialArbitrationCategoryName(code) ||
        'Категория не указана';

      const count = Number(entry?.count || 0);
      const sum = parseCommercialMoney(entry?.sum);
      const sumText = formatCommercialMoneyText(entry?.sum);

      return {
        code,
        label,
        count,
        sum,
        sumText,
        text: `${label}: ${count}${sumText !== '—' ? ` / ${sumText}` : ''}`,
      };
    })
    .filter((entry) => entry.label && (entry.count > 0 || entry.sumText !== '—'));
}

function buildCommercialCompanyRoleFilterValue(item = {}) {
  const values = Array.isArray(item?.relationshipType) ? item.relationshipType : [];

  const hasDirector = values.includes('Director');
  const hasFounder = values.includes('Founder');
  const hasIp = values.includes('IndividualEntrepreneur');

  if (hasIp || item?.isOwnEntrepreneur) return 'ИП';
  if (hasDirector && hasFounder) return 'Руководитель, учредитель';
  if (hasDirector) return 'Руководитель';
  if (hasFounder) return 'Учредитель';
  return 'Связь в компании не раскрыта';
}

function buildCommercialOwnIpComment(item = {}) {
  const arbitrationCount = Number(item?.arbitrationCount || 0);
  const arbitrationSumText = formatCommercialMoneyText(item?.arbitrationSum);

  if (!arbitrationCount) {
    return 'Проверяемый зарегистрирован как ИП. На дату проверки арбитражная нагрузка не выявлена.';
  }

  return `Проверяемый — индивидуальный предприниматель. Выявлена арбитражная нагрузка: ${arbitrationCount} дел${arbitrationSumText !== '—' ? ` на сумму ${arbitrationSumText}` : ''}.`;
}

function buildCommercialRiskTags(item = {}) {
  const tags = [];

  if (item?.status === 'Bankrupting') {
    tags.push('Банкротство');
  }

  const bankruptcyIndicators = Array.isArray(item?.bankruptcyIndicators)
    ? item.bankruptcyIndicators
    : [];

  for (const indicator of bankruptcyIndicators) {
    if (indicator?.text && !tags.includes(indicator.text)) {
      tags.push(indicator.text);
    }
  }

  const affiliation = Array.isArray(item?.affiliation) ? item.affiliation : [];

  for (const relation of affiliation) {
    if (relation?.nameText && !tags.includes(relation.nameText)) {
      tags.push(relation.nameText);
    }
  }

  if (item?.status === 'Dissolved' && !tags.includes('Историческая запись')) {
    tags.push('Историческая запись');
  }

  if (!tags.length) {
    tags.push('Нет существенных');
  }

  return tags;
}

function buildCommercialPersonalRisk(item = {}) {
  const isBankrupting = item?.status === 'Bankrupting';
  const hasArbitration = Number(item?.arbitrationCount || 0) > 0;
  const hasAffiliation = Array.isArray(item?.affiliation) && item.affiliation.length > 0;
  const hasBankruptcyIndicators = Array.isArray(item?.bankruptcyIndicators) && item.bankruptcyIndicators.length > 0;

  if (isBankrupting && (isCommercialDirector(item) || (isCommercialDirector(item) && isCommercialFounder(item)))) {
    return 'Повышенный';
  }

  if (isBankrupting && isCommercialFounder(item)) {
    return 'Средний';
  }

  if (item?.status === 'Dissolved' && (hasArbitration || hasAffiliation || hasBankruptcyIndicators)) {
    return 'Умеренный';
  }

  if (hasArbitration || hasAffiliation || hasBankruptcyIndicators) {
    return 'Умеренный';
  }

  return 'Низкий';
}

function buildCommercialComment(item = {}, proceedingRows = []) {
  const hasArbitration = Number(item?.arbitrationCount || 0) > 0;
  const isBankrupting = item?.status === 'Bankrupting';
  const isDissolved = item?.status === 'Dissolved';
  const relationLabel = buildCommercialCompanyRoleFilterValue(item);
  const roleTexts = [...new Set(
    proceedingRows
      .map((row) => row.caseRoleText)
      .filter((value) => value && value !== '—')
  )];

  const hasDefendantLikeRole = roleTexts.some(
    (value) => value.includes('Ответчик') || value.includes('Должник')
  );

  if (item?.isOwnEntrepreneur || relationLabel === 'ИП') {
    return buildCommercialOwnIpComment(item);
  }

  if (isBankrupting && (relationLabel === 'Руководитель' || relationLabel === 'Руководитель, учредитель')) {
    return 'Организация в процедуре банкротства. Для проверяемого возможен риск субсидиарной ответственности.';
  }

  if (isBankrupting && relationLabel === 'Учредитель') {
    return 'Организация в процедуре банкротства. Требует внимания, однако прямой риск для проверяемого ниже, чем у руководителя.';
  }

  if (!hasArbitration && item?.status === 'Active') {
    return 'На дату проверки рисков не выявлено.';
  }

  if (!hasArbitration && isDissolved) {
    return 'Историческая запись, текущих рисков не выявлено.';
  }

  if (hasArbitration && hasDefendantLikeRole) {
    return 'Есть арбитражная нагрузка. Компания участвует в делах в роли ответчика / должника.';
  }

  if (hasArbitration) {
    return `Есть арбитражная нагрузка. Роли компании: ${roleTexts.join('; ')}.`;
  }

  return 'Требуется дополнительный анализ.';
}

function buildCommercialProceedingRows(item = {}) {
  const proceedings = Array.isArray(item?.arbitrationProceedings)
    ? item.arbitrationProceedings
    : [];

  return proceedings.map((proceeding) => {
    const decisionLink = findCommercialDecisionLink(proceeding);

    const participants = [
      ...(Array.isArray(proceeding?.participants) ? proceeding.participants : []),
      ...(Array.isArray(proceeding?.rawRecord?.participants) ? proceeding.rawRecord.participants : []),
    ];

    const plaintiff = participants.find((participant) => {
      const roleText = String(
        participant?.roleText ||
        participant?.role ||
        participant?.rawRecord?.role ||
        ''
      )
        .trim()
        .toLowerCase();

      return roleText.includes('истец') || roleText.includes('plaintiff');
    });

    const caseCategoryText =
      proceeding?.proceedingCategoryText ||
      proceeding?.proceedingCategory ||
      proceeding?.proceedingType ||
      proceeding?.rawRecord?.proceedingCategoryText ||
      proceeding?.rawRecord?.proceedingCategory ||
      proceeding?.rawRecord?.proceedingType ||
      '—';

    return {
      caseNumber: proceeding?.number || '—',
      caseDate: proceeding?.proceedingStartDate || '',
      caseRoleText: buildCommercialProceedingRoleText(proceeding, item),
      caseSum: parseCommercialMoney(proceeding?.sum),
      caseUrl: proceeding?.url || null,
      decisionUrl: decisionLink?.url || null,
      decisionLabel: decisionLink?.label || 'Решение',

      casePlaintiff:
        plaintiff?.name ||
        plaintiff?.fio ||
        plaintiff?.fullName ||
        plaintiff?.rawRecord?.name ||
        '—',

      caseCategoryText,

      rawProceeding: proceeding,
    };
  });
}

function buildCommercialActivityKonturSummary(items = []) {
  const safeItems = Array.isArray(items) ? items : [];

  return {
    totalCount: safeItems.length,
    activeCount: safeItems.filter((item) => item?.status === 'Active').length,
    dissolvedCount: safeItems.filter((item) => item?.status === 'Dissolved').length,
    bankruptingCount: safeItems.filter((item) => item?.status === 'Bankrupting').length,
    withArbitrationCount: safeItems.filter((item) => Number(item?.arbitrationCount || 0) > 0).length,
  };
}

function buildCommercialActivityKonturTableRows(items = []) {
  const safeItems = Array.isArray(items) ? items : [];

  return safeItems.map((item) => {
    const proceedingRows = buildCommercialProceedingRows(item);
    const relationshipText = buildCommercialRelationshipText(item);

    const arbitrationCount = Number(item?.arbitrationCount || 0);
    const arbitrationSum = parseCommercialMoney(item?.arbitrationSum);

    const arbitrationResultSummary = buildCommercialArbitrationResultSummary(item);
    const arbitrationCategorySummary = buildCommercialArbitrationCategorySummary(item);

    const companyRoleFilterValue = buildCommercialCompanyRoleFilterValue(item);

    return {
      orgName: item?.name || 'Организация без наименования',
      orgStatus: item?.statusText || item?.status || '—',
      orgRelationshipText: relationshipText,
      orgCompanyRoleFilterValue: companyRoleFilterValue,

      orgInn: item?.inn || null,
      orgOgrn: item?.ogrn || null,
      orgRegistrationDate: item?.registrationDate || null,
      orgStatusDate: item?.statusDate || null,

      orgActivityCode: item?.activityCode || null,
      orgActivityName: item?.activityName || null,

      orgArbitrationTotalText: arbitrationCount
        ? `Арбитраж всего: ${arbitrationCount} ${arbitrationCount === 1 ? 'дело' : arbitrationCount < 5 ? 'дела' : 'дел'}${arbitrationSum !== null ? ` / ${formatCommercialMoneyText(arbitrationSum)}` : ''}`
        : 'Арбитраж не выявлен',

      arbitrationResultSummary,
      arbitrationCategorySummary,

      proceedingRows,
      commentText: buildCommercialComment(item, proceedingRows),

      isOwnEntrepreneur:
        item?.isOwnEntrepreneur === true ||
        companyRoleFilterValue === 'ИП',

      sourceItem: item,
    };
  });
}

function normalizeCommercialStatusFilter(value = '') {
  return String(value || '').trim();
}

function normalizeCommercialRoleFilter(value = '') {
  return String(value || '').trim();
}


function parseCommercialSumFilter(value) {
  if (value === undefined || value === null || value === '') return null;

  const normalized = String(value).replace(/\s+/g, '').replace(',', '.');
  const num = Number(normalized);

  return Number.isFinite(num) ? num : null;
}

function buildCommercialAvailableStatuses(rows = []) {
  return [...new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => String(row?.orgStatus || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'ru'));
}

function buildCommercialAvailableRoles(rows = []) {
  const values = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    for (const proceeding of Array.isArray(row?.proceedingRows) ? row.proceedingRows : []) {
      const roleText = String(proceeding?.caseRoleText || '').trim();
      if (roleText) {
        values.push(roleText);
      }
    }
  }

  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ru'));
}

function buildCommercialAvailablePersonalRisks(rows = []) {
  return [...new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => String(row?.personalRisk || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'ru'));
}

function normalizeCommercialArrayQuery(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item || '').split(','))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCommercialCompanyRoles(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return [];

  return raw
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCommercialCompanyRoleFilter(value) {
  return [...new Set(normalizeCommercialArrayQuery(value))];
}

function buildCommercialCompanyRoleOptions(rows = [], selectedRoles = []) {
  const selectedSet = new Set(selectedRoles);

  const roles = [...new Set(
    (Array.isArray(rows) ? rows : [])
      .flatMap((row) => parseCommercialCompanyRoles(row?.orgCompanyRoleFilterValue || ''))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'ru'));

  return roles.map((value) => ({
    value,
    checked: selectedSet.has(value),
  }));
}

function formatCommercialList(values = [], limit = Number.POSITIVE_INFINITY) {
  const safeValues = [...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )];

  if (!safeValues.length) return '—';

  const shouldLimit = Number.isFinite(limit) && limit > 0;
  const shown = shouldLimit ? safeValues.slice(0, limit) : safeValues;

  return shown.join('; ');
}

function getCommercialCaseAmount(proceeding = {}) {
  const num = Number(proceeding?.caseSum);

  return Number.isFinite(num) ? num : 0;
}

function getCommercialAmountKey(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;

  return num.toFixed(2);
}

function formatCommercialInsightDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}.${iso[2]}.${iso[1]}`;
  }

  return raw;
}

function getCommercialInsightDateTs(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return 0;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) {
    return Date.UTC(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]));
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCommercialOrganizationInsight(entry = {}) {
  const name = String(entry?.orgName || '—').trim() || '—';
  const inn = String(entry?.orgInn || '').trim();
  const ogrn = String(entry?.orgOgrn || '').trim();
  const status = String(entry?.orgStatus || '').trim();
  const relationshipText = String(entry?.orgRelationshipText || '').trim();

  const key =
    inn ? `inn:${inn}` :
    ogrn ? `ogrn:${ogrn}` :
    `name:${normalizeCommercialText(name)}`;

  const details = [
    inn ? `ИНН ${inn}` : '',
    ogrn ? `ОГРН ${ogrn}` : '',
  ].filter(Boolean);

  return {
    key,
    name,
    inn,
    ogrn,
    status,
    relationshipText,
    text: details.length ? `${name} — ${details.join(' • ')}` : name,
  };
}

function buildCommercialCaseInsight(entry = {}) {
  const number = String(entry?.caseNumber || '').trim();
  if (!number || number === '—') return null;

  const date = String(entry?.caseDate || '').trim();
  const dateText = formatCommercialInsightDate(date);

  return {
    key: `${number}|${date}`,
    number,
    date,
    dateText,
    text: dateText ? `${number} от ${dateText}` : number,
    sortTs: getCommercialInsightDateTs(date),
  };
}

function addCommercialInsightGroup(map, key, base = {}, entry = {}) {
  if (!key) return;

  if (!map.has(key)) {
    map.set(key, {
      ...base,
      count: 0,
      totalAmount: 0,
      cases: [],
      casesMap: new Map(),
      organizationsMap: new Map(),
      plaintiffs: new Set(),
      categories: new Set(),
      dates: new Set(),
    });
  }

  const group = map.get(key);
  const amount = getCommercialCaseAmount(entry);

  group.count += 1;
  group.totalAmount += amount;

  const caseInfo = buildCommercialCaseInsight(entry);
  if (caseInfo?.key && !group.casesMap.has(caseInfo.key)) {
    group.casesMap.set(caseInfo.key, caseInfo);
  }

  const organizationInfo = buildCommercialOrganizationInsight(entry);
  if (organizationInfo?.key && !group.organizationsMap.has(organizationInfo.key)) {
    group.organizationsMap.set(organizationInfo.key, organizationInfo);
  }

  if (entry.plaintiffName && entry.plaintiffName !== '—') {
    group.plaintiffs.add(entry.plaintiffName);
  }

  if (entry.categoryText && entry.categoryText !== '—') {
    group.categories.add(entry.categoryText);
  }

  if (entry.caseDate) {
    group.dates.add(formatCommercialInsightDate(entry.caseDate));
  }

  group.cases.push(entry);
}

function isCommercialPublicCreditor(name = '') {
  const text = normalizeCommercialText(name);

  if (!text || text === '—') return false;

  return (
    text.includes('федеральной налоговой службы') ||
    text.includes('межрайонная инспекция') ||
    text.includes('ифнс') ||
    text.includes('фнс') ||
    text.includes('пенсионного') ||
    text.includes('социального страхования') ||
    text.includes('отделение фонда') ||
    text.includes('администрация') ||
    text.includes('комитет') ||
    text.includes('департамент') ||
    text.includes('управление') ||
    text.includes('росимущество') ||
    text.includes('государственное') ||
    text.includes('муниципальное') ||
    text.includes('служба судебных приставов') ||
    text.includes('россети') ||
    text.includes('водоканал')
  );
}

function isCommercialSubjectPlaintiff(plaintiffName = '', subject = {}) {
  const plaintiff = normalizeCommercialText(plaintiffName);
  const subjectName = normalizeCommercialText(subject?.fullName || '');

  if (!plaintiff || !subjectName) return false;

  const subjectParts = subjectName
    .split(/\s+/)
    .filter((part) => part.length >= 3);

  if (subjectParts.length < 2) {
    return false;
  }

  return subjectParts.every((part) => plaintiff.includes(part));
}

function buildCommercialFlatProceedings(tableRows = []) {
  const result = [];

  for (const row of Array.isArray(tableRows) ? tableRows : []) {
    const proceedings = Array.isArray(row?.proceedingRows) ? row.proceedingRows : [];

    for (const proceeding of proceedings) {
      const caseNumber = String(proceeding?.caseNumber || '').trim();

      if (!caseNumber || caseNumber === '—') {
        continue;
      }

      const plaintiffName = String(proceeding?.casePlaintiff || '').trim() || '—';
      const categoryText = String(proceeding?.caseCategoryText || '').trim() || '—';
      const amount = getCommercialCaseAmount(proceeding);

      result.push({
        orgName: row?.orgName || '—',
        orgInn: row?.orgInn || null,
        orgOgrn: row?.orgOgrn || null,
        orgStatus: row?.orgStatus || '—',
        orgRelationshipText: row?.orgRelationshipText || '—',
        orgCompanyRoleFilterValue: row?.orgCompanyRoleFilterValue || '—',

        caseNumber,
        caseDate: proceeding?.caseDate || '',
        caseRoleText: proceeding?.caseRoleText || '—',
        caseSum: amount,
        caseSumText: amount > 0 ? formatCommercialMoneyText(amount) : '—',

        plaintiffName,
        plaintiffKey: normalizeCommercialText(plaintiffName),

        categoryText,
        categoryKey: normalizeCommercialText(categoryText),

        amountKey: getCommercialAmountKey(amount),
      });
    }
  }

  return result;
}

function finalizeCommercialInsightGroup(group = {}) {
  const organizationsList = Array.from(group.organizationsMap?.values?.() || [])
    .sort((a, b) => {
      const byName = String(a.name || '').localeCompare(String(b.name || ''), 'ru');
      if (byName !== 0) return byName;
      return String(a.inn || '').localeCompare(String(b.inn || ''), 'ru');
    });

  const casesList = Array.from(group.casesMap?.values?.() || [])
    .sort((a, b) => {
      if (b.sortTs !== a.sortTs) return b.sortTs - a.sortTs;
      return String(a.number || '').localeCompare(String(b.number || ''), 'ru');
    });

  const plaintiffsList = Array.from(group.plaintiffs || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ru'));

  const categoriesList = Array.from(group.categories || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ru'));

  const datesList = Array.from(group.dates || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .sort((a, b) => getCommercialInsightDateTs(b) - getCommercialInsightDateTs(a));

  const {
    casesMap,
    organizationsMap,
    plaintiffs,
    categories,
    dates,
    cases,
    ...plainGroup
  } = group;

  return {
    ...plainGroup,

    totalAmountText: formatCommercialMoneyText(group.totalAmount),

    organizationsList,
    casesList,
    plaintiffsList,
    categoriesList,
    datesList,

    // Старые текстовые поля оставляем для совместимости, но теперь без "ещё N"
    casesText: casesList.map((item) => item.text).join('; ') || '—',
    organizationsText: organizationsList.map((item) => item.text).join('; ') || '—',
    plaintiffsText: formatCommercialList(plaintiffsList),
    categoriesText: formatCommercialList(categoriesList),
    datesText: formatCommercialList(datesList),

    organizationsCount: organizationsList.length,
  };
}

function buildCommercialActivityInsights(tableRows = [], subject = {}) {
  const flatProceedings = buildCommercialFlatProceedings(tableRows);

  const repeatedCasesMap = new Map();
  const plaintiffsMap = new Map();
  const amountsMap = new Map();
  const categoriesMap = new Map();
  const publicCreditorsMap = new Map();
  const subjectAsPlaintiff = [];

  for (const entry of flatProceedings) {
    addCommercialInsightGroup(
      repeatedCasesMap,
      entry.caseNumber,
      {
        caseNumber: entry.caseNumber,
        plaintiffName: entry.plaintiffName,
        categoryText: entry.categoryText,
        amountText: entry.caseSumText,
      },
      entry
    );

    if (entry.plaintiffKey && entry.plaintiffName !== '—') {
      addCommercialInsightGroup(
        plaintiffsMap,
        entry.plaintiffKey,
        {
          plaintiffName: entry.plaintiffName,
        },
        entry
      );
    }

    if (entry.amountKey) {
      addCommercialInsightGroup(
        amountsMap,
        entry.amountKey,
        {
          amount: entry.caseSum,
          amountText: entry.caseSumText,
        },
        entry
      );
    }

    if (entry.categoryKey && entry.categoryText !== '—') {
      addCommercialInsightGroup(
        categoriesMap,
        entry.categoryKey,
        {
          categoryText: entry.categoryText,
        },
        entry
      );
    }

    if (isCommercialPublicCreditor(entry.plaintiffName)) {
      addCommercialInsightGroup(
        publicCreditorsMap,
        entry.plaintiffKey,
        {
          plaintiffName: entry.plaintiffName,
        },
        entry
      );
    }

    if (isCommercialSubjectPlaintiff(entry.plaintiffName, subject)) {
      subjectAsPlaintiff.push({
        caseNumber: entry.caseNumber,
        caseDate: formatCommercialInsightDate(entry.caseDate) || '—',
        orgName: entry.orgName,
        orgInn: entry.orgInn || '',
        categoryText: entry.categoryText,
        amountText: entry.caseSumText,
      });
    }
  }

  const repeatedCases = Array.from(repeatedCasesMap.values())
    .filter((group) => group.count >= 2)
    .map(finalizeCommercialInsightGroup)
    .sort((a, b) => b.count - a.count || b.totalAmount - a.totalAmount)
    .slice(0, 10);

  const repeatedPlaintiffs = Array.from(plaintiffsMap.values())
    .filter((group) => group.count >= 3 || group.totalAmount >= 1000000)
    .map(finalizeCommercialInsightGroup)
    .sort((a, b) => b.count - a.count || b.totalAmount - a.totalAmount)
    .slice(0, 10);

  const repeatedAmounts = Array.from(amountsMap.values())
    .filter((group) => group.count >= 3 || (group.count >= 2 && group.totalAmount >= 1000000))
    .map(finalizeCommercialInsightGroup)
    .sort((a, b) => b.count - a.count || b.amount - a.amount)
    .slice(0, 10);

  const topPlaintiffs = Array.from(plaintiffsMap.values())
    .map(finalizeCommercialInsightGroup)
    .sort((a, b) => b.totalAmount - a.totalAmount || b.count - a.count)
    .slice(0, 10);

  const topCategories = Array.from(categoriesMap.values())
    .filter((group) => group.count >= 2)
    .map(finalizeCommercialInsightGroup)
    .sort((a, b) => b.totalAmount - a.totalAmount || b.count - a.count)
    .slice(0, 10);

  const publicCreditors = Array.from(publicCreditorsMap.values())
    .filter((group) => group.count >= 2 || group.totalAmount >= 500000)
    .map(finalizeCommercialInsightGroup)
    .sort((a, b) => b.totalAmount - a.totalAmount || b.count - a.count)
    .slice(0, 10);

  const subjectAsPlaintiffLimited = subjectAsPlaintiff
    .sort((a, b) => parseCommercialMoney(b.amountText) - parseCommercialMoney(a.amountText))
    .slice(0, 10);

  const hasInsights =
    repeatedCases.length > 0 ||
    repeatedPlaintiffs.length > 0 ||
    repeatedAmounts.length > 0 ||
    topPlaintiffs.length > 0 ||
    topCategories.length > 0 ||
    publicCreditors.length > 0 ||
    subjectAsPlaintiffLimited.length > 0;

  return {
    hasInsights,
    repeatedCases,
    repeatedPlaintiffs,
    repeatedAmounts,
    topPlaintiffs,
    topCategories,
    publicCreditors,
    subjectAsPlaintiff: subjectAsPlaintiffLimited,

    // Старый блок больше не выводим, оставляем пустым для совместимости с шаблоном
    timeClusters: [],
  };
}

function buildCommercialFilterMeta(rows = [], selectedCompanyRoles = []) {
  const safeRows = Array.isArray(rows) ? rows : [];

  const availableCompanyRoles = [...new Set(
    safeRows
      .flatMap((row) => parseCommercialCompanyRoles(row?.orgCompanyRoleFilterValue || ''))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'ru'));

  return {
    availableStatuses: buildCommercialAvailableStatuses(safeRows),
    availableRoles: buildCommercialAvailableRoles(safeRows),
    availableCompanyRoles,
    availableCompanyRoleOptions: buildCommercialCompanyRoleOptions(
      safeRows,
      selectedCompanyRoles
    ),
  };
}

function buildCommercialRowspanRows(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const result = [];

  for (const row of safeRows) {
    const proceedings = Array.isArray(row?.proceedingRows) ? row.proceedingRows : [];

    const baseOrgFields = {
      orgName: row.orgName,
      orgStatus: row.orgStatus,
      orgRelationshipText: row.orgRelationshipText,
      orgCompanyRoleFilterValue: row.orgCompanyRoleFilterValue,

      orgInn: row.orgInn,
      orgOgrn: row.orgOgrn,
      orgRegistrationDate: row.orgRegistrationDate,
      orgStatusDate: row.orgStatusDate,

      orgActivityCode: row.orgActivityCode,
      orgActivityName: row.orgActivityName,
      orgArbitrationTotalText: row.orgArbitrationTotalText,

      arbitrationResultSummary: Array.isArray(row.arbitrationResultSummary)
        ? row.arbitrationResultSummary
        : [],

      arbitrationCategorySummary: Array.isArray(row.arbitrationCategorySummary)
        ? row.arbitrationCategorySummary
        : [],

      isOwnEntrepreneur: row.isOwnEntrepreneur === true,

      riskTags: row.riskTags,
      personalRisk: row.personalRisk,
      commentText: row.commentText,
    };

    if (!proceedings.length) {
      result.push({
        isFirstProceedingRow: true,
        rowspan: 1,

        ...baseOrgFields,

        caseNumber: '—',
        caseDate: '',
        caseRoleText: '—',
        caseSum: null,
        caseUrl: null,
        decisionUrl: null,
        decisionLabel: null,

        casePlaintiff: '—',
        caseCategoryText: '—',
      });

      continue;
    }

    proceedings.forEach((proceeding, index) => {
      result.push({
        isFirstProceedingRow: index === 0,
        rowspan: proceedings.length,

        ...baseOrgFields,

        caseNumber: proceeding?.caseNumber || '—',
        caseDate: proceeding?.caseDate || '',
        caseRoleText: proceeding?.caseRoleText || '—',
        caseSum: proceeding?.caseSum ?? null,
        caseUrl: proceeding?.caseUrl || null,
        decisionUrl: proceeding?.decisionUrl || null,
        decisionLabel: proceeding?.decisionLabel || 'Решение',

        casePlaintiff: proceeding?.casePlaintiff || '—',
        caseCategoryText: proceeding?.caseCategoryText || '—',
      });
    });
  }

  return result;
}

function applyCommercialActivityKonturFilters(reportData = {}, query = {}) {
  const source = reportData?.sources?.commercialActivityKontur;

  if (!source || typeof source !== 'object') {
    return reportData;
  }

  const originalItems = Array.isArray(source.items) ? source.items : [];
  const originalTableRows = buildCommercialActivityKonturTableRows(originalItems);

  const statusFilter = normalizeCommercialStatusFilter(query.commercialStatus);
  const roleFilter = normalizeCommercialRoleFilter(query.commercialRole);
  const companyRoleFilters = normalizeCommercialCompanyRoleFilter(query.commercialCompanyRole);
  const minSum = parseCommercialSumFilter(query.commercialMinSum);
  const maxSum = parseCommercialSumFilter(query.commercialMaxSum);

  const filteredTableRows = originalTableRows.filter((row) => {
    if (statusFilter && row.orgStatus !== statusFilter) {
      return false;
    }

    if (companyRoleFilters.length) {
      const rowCompanyRoles = parseCommercialCompanyRoles(row?.orgCompanyRoleFilterValue || '');

      const hasMatchingCompanyRole = rowCompanyRoles.some((role) =>
        companyRoleFilters.includes(role)
      );

      if (!hasMatchingCompanyRole) {
        return false;
      }
    }

    const proceedings = Array.isArray(row.proceedingRows) ? row.proceedingRows : [];

    if (roleFilter) {
      const hasMatchingRole = proceedings.some(
        (proceeding) => String(proceeding?.caseRoleText || '').trim() === roleFilter
      );

      if (!hasMatchingRole) {
        return false;
      }
    }

    if (minSum !== null || maxSum !== null) {
      const hasMatchingSum = proceedings.some((proceeding) => {
        const sum = proceeding?.caseSum;
        if (sum === null || sum === undefined || !Number.isFinite(Number(sum))) {
          return false;
        }

        if (minSum !== null && Number(sum) < minSum) {
          return false;
        }

        if (maxSum !== null && Number(sum) > maxSum) {
          return false;
        }

        return true;
      });

      if (!hasMatchingSum) {
        return false;
      }
    }

    return true;
  });

  const filteredSourceItems = filteredTableRows.map((row) => row.sourceItem);
  const rowspanRows = buildCommercialRowspanRows(filteredTableRows);
  const ownEntrepreneurSummary = buildCommercialOwnEntrepreneurSummary(originalTableRows);
  const commercialInsights = buildCommercialActivityInsights(
    originalTableRows,
    reportData?.subject || {}
  );

  return {
    ...reportData,
    reportFilters: {
      ...(reportData.reportFilters || {}),
      commercialStatus: statusFilter,
      commercialRole: roleFilter,
      commercialMinSum: minSum,
      commercialMaxSum: maxSum,

      // Для старой логики / обратной совместимости
      commercialCompanyRole: companyRoleFilters[0] || '',

      // Для нового мультивыбора
      commercialCompanyRoles: companyRoleFilters,
    },
    sources: {
      ...(reportData.sources || {}),
      commercialActivityKontur: {
        ...source,
        items: filteredSourceItems,
        tableRows: filteredTableRows,
        tableRenderRows: rowspanRows,
        ownEntrepreneurSummary,
        commercialInsights,
        filterMeta: {
          ...buildCommercialFilterMeta(originalTableRows, companyRoleFilters),
          totalBeforeFilter: originalTableRows.length,
          totalAfterFilter: filteredTableRows.length,
          hasFilters:
            !!statusFilter ||
            companyRoleFilters.length > 0 ||
            !!roleFilter ||
            minSum !== null ||
            maxSum !== null,
        },
      },
    },
  };
}

function buildCommercialOwnEntrepreneurSummary(tableRows = []) {
  const row = (Array.isArray(tableRows) ? tableRows : []).find((item) => item?.isOwnEntrepreneur);

  if (!row) return null;

  return {
    fullName: row.orgName,
    inn: row.orgInn || null,
    ogrn: row.orgOgrn || null,
    registrationDate: row.orgRegistrationDate || null,
    activityCode: row.orgActivityCode || null,
    activityName: row.orgActivityName || null,
    arbitrationTotalText: row.orgArbitrationTotalText || 'Арбитраж не выявлен',

    arbitrationResultSummary: Array.isArray(row.arbitrationResultSummary)
      ? row.arbitrationResultSummary
      : [],

    arbitrationCategorySummary: Array.isArray(row.arbitrationCategorySummary)
      ? row.arbitrationCategorySummary
      : [],

    commentText: row.commentText || '',
  };
}

function applyCommercialActivityKonturTransforms(reportData = {}) {
  const source = reportData?.sources?.commercialActivityKontur;

  if (!source || typeof source !== 'object') {
    return reportData;
  }

  const originalItems = Array.isArray(source.items) ? source.items : [];
  const tableRows = buildCommercialActivityKonturTableRows(originalItems);
  const rebuiltSummary = buildCommercialActivityKonturSummary(originalItems);
  const tableRenderRows = buildCommercialRowspanRows(tableRows);
  const filterMeta = buildCommercialFilterMeta(tableRows);
  const ownEntrepreneurSummary = buildCommercialOwnEntrepreneurSummary(tableRows);
  const commercialInsights = buildCommercialActivityInsights(
    tableRows,
    reportData?.subject || {}
  );

  return {
    ...reportData,
    sources: {
      ...(reportData.sources || {}),
      commercialActivityKontur: {
        ...source,
        summary: {
          ...(source.summary || {}),
          ...rebuiltSummary,
        },
        tableRows,
        tableRenderRows,
        ownEntrepreneurSummary,
        commercialInsights,
        filterMeta: {
          ...filterMeta,
          totalBeforeFilter: tableRows.length,
          totalAfterFilter: tableRows.length,
          hasFilters: false,
        },
      },
    },
  };
}

function getReportEntityType(entryData = {}) {
  return (
    entryData?.entityType ||
    entryData?.subject?.entityType ||
    'person'
  );
}

function buildRealEstateReportData(entry = {}) {
  const data = entry?.data || {};
  const subject = data?.subject || {};
  const item = data?.item || {};
  const raw = item?.rawRecord || {};

  const rights = Array.isArray(raw.rights) ? raw.rights : [];
  const encumbrances = Array.isArray(raw.encumbrances) ? raw.encumbrances : [];
  const oldNumbers = Array.isArray(raw.oldNumbers) ? raw.oldNumbers : [];
  const permittedUseRaw = Array.isArray(raw.permittedUse) ? raw.permittedUse : [];
  const mainCharacters = raw.mainCharacters || null;

  const permittedUse = permittedUseRaw.map((value) => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      return value.text || value.name || JSON.stringify(value);
    }
    return String(value || '');
  }).filter(Boolean);

  return {
    entityType: 'realEstate',
    reportId: entry.id,
    createdAt: entry.createdAt,

    subject: {
      cadastralNumber: subject.cadastralNumber || item.cadastralNumber || '—',
      readableAddress: subject.readableAddress || item.readableAddress || '—',
      objectType: subject.objectType || item.objectType || '—',
    },

    item: {
      readableAddress: item.readableAddress || '—',
      objectType: item.objectType || '—',
      purpose: item.purpose || '—',
      statusText:
        item.status === '1'
          ? 'Актуально'
          : item.status === '0'
          ? 'Неактуально'
          : '—',
      area: item.area || '—',
      level: item.level || '—',
      undergroundFloor: item.undergroundFloor || '—',
      cadCost: item.cadCost || '—',
      cadCostDate: formatReportDate(item.cadCostDate),
      infoUpdate: formatReportDate(item.infoUpdate),
      cadastralQuarter: item.cadastralQuarter || '—',
      oksWallMaterial: item.oksWallMaterial || '—',
      oksCommisioningYear: item.oksCommisioningYear || '—',
      oksYearBuild: item.oksYearBuild || '—',
    },

    registration: {
      regDate: formatReportDate(raw.regDate),
      cancelDate: formatReportDate(raw.cancelDate),
    },

    mainCharacters: mainCharacters
      ? {
          description: mainCharacters.description || '—',
          value:
            mainCharacters.value === undefined || mainCharacters.value === null
              ? '—'
              : String(mainCharacters.value),
          unitDescription: mainCharacters.unitDescription || '—',
        }
      : null,

    rights: rights.map((row) => ({
      rightTypeDesc: row?.rightTypeDesc || '—',
      rightNumber: row?.rightNumber || '—',
      rightRegDate: formatReportDate(row?.rightRegDate),
      part: row?.part || '—',
    })),

    encumbrances: encumbrances.map((row) => ({
      typeDesc: row?.typeDesc || '—',
      rightNumber: row?.rightNumber || '—',
      startDate: formatReportDate(row?.startDate),
    })),

    oldNumbers: oldNumbers.map((row) => ({
      numType: row?.numType || '—',
      numValue: row?.numValue || '—',
    })),

    permittedUse,
  };
}

function buildRealEstateStoredResult(lookup, cadastralNumber) {
  const item = lookup?.item || null;

  const subject = {
    entityType: 'realEstate',
    lookupType: 'cadastralObject',
    cadastralNumber: item?.cadastralNumber || cadastralNumber || '',
    readableAddress: item?.readableAddress || '',
    objectType: item?.objectType || '',
    purpose: item?.purpose || '',
  };

  return {
    entityType: 'realEstate',
    lookupType: 'cadastralObject',
    provider: 'apicloud',
    status: 'done',
    subject,
    cadastralNumber: item?.cadastralNumber || cadastralNumber || '',
    item,
    message:
      lookup?.message ||
      (!item ? 'Информация по объекту не найдена.' : ''),
    providerSummary: {
      apicloud: 1,
    },
    createdAt: new Date().toISOString(),
  };
}

router.post('/check/person', async (req, res) => {
  try {
    const payload = req.body || {};
    const normalizedRegions = normalizeRegionsInput(payload.regions);

    const providerModeRaw =
      typeof payload.providerMode === 'string' ? payload.providerMode.trim() : '';

    let providerMode = 'apicloud';

    if (providerModeRaw === 'kontur') {
      providerMode = 'kontur';
    } else if (providerModeRaw === 'both') {
      providerMode = 'both';
    } else if (providerModeRaw === 'selective') {
      providerMode = 'selective';
    }

    const selectedSources =
      providerMode === 'selective'
        ? normalizeSelectedSources(payload.selectedSources)
        : [];

    if (providerMode === 'selective' && selectedSources.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'selected_sources_required',
        message: 'Для выборочной проверки нужно выбрать хотя бы один источник.',
      });
    }

    const provider =
      providerMode === 'both'
        ? 'mixed'
        : providerMode === 'selective'
        ? resolveProviderBySelectedSources(selectedSources)
        : providerMode;
    const consentResult = buildCounterpartyConsentSnapshot(req, {
      providerMode,
      provider,
      selectedSources,
    });

    if (!consentResult.ok) {
      return res.status(400).json({
        ok: false,
        error: consentResult.error,
        message: consentResult.message,
      });
    }

    const consentSnapshot = consentResult.snapshot;
    
    const normalizedPayload = {
      ...payload,
      regions: normalizedRegions,
      providerMode,
      selectedSources,
      counterpartyConsent: consentSnapshot,
    };

   const subject = {
      lastName: normalizedPayload.lastName || '',
      firstName: normalizedPayload.firstName || '',
      middleName: normalizedPayload.middleName || '',
      fullName: [normalizedPayload.lastName, normalizedPayload.firstName, normalizedPayload.middleName]
        .filter(Boolean)
        .join(' ')
        .trim(),
      birthDate: normalizedPayload.birthDate || '',
      regions: normalizedRegions,
      inn: normalizedPayload.inn || '',
      snils: normalizedPayload.snils || '',
      passportSeries: normalizedPayload.passportSeries || '',
      passportNumber: normalizedPayload.passportNumber || '',
      passportIssueDate: normalizedPayload.passportIssueDate || '',
      passportIssuerCode: normalizedPayload.passportIssuerCode || '',
      passport: {
        series: normalizedPayload.passportSeries || '',
        number: normalizedPayload.passportNumber || '',
        issueDate: normalizedPayload.passportIssueDate || '',
        issuerCode: normalizedPayload.passportIssuerCode || '',
      },
    };

    // создаём запись проверки
    const { rows } = await query(
      `INSERT INTO counterparty_checks(
          user_id,
          provider,
          subject,
          payload,
          status,
          consent_snapshot,
          consent_version,
          privacy_version,
          terms_version,
          consented_at
      )
      VALUES (
          $1,
          $2,
          $3::jsonb,
          $4::jsonb,
          'queued',
          $5::jsonb,
          $6,
          $7,
          $8,
          now()
      )
      RETURNING id, created_at`,
      [
        req.userId,
        provider,
        JSON.stringify(subject),
        JSON.stringify(normalizedPayload),
        JSON.stringify(consentSnapshot),
        consentSnapshot.version,
        consentSnapshot.privacyVersion,
        consentSnapshot.termsVersion,
      ]
    );

    const checkId = rows[0].id;

    // создаём job
    const jobInsert = await query(
      `INSERT INTO counterparty_jobs(check_id, user_id, status)
       VALUES ($1, $2, 'queued')
       ON CONFLICT (check_id)
       WHERE status IN ('queued', 'processing')
       DO NOTHING
       RETURNING id`,
      [checkId, req.userId]
    );

    if (!jobInsert.rowCount) {
      throw new Error('active_job_already_exists');
    }

    // сразу ответ
   res.json({
      ok: true,
      result: {
        id: checkId,
        status: 'queued',
        subject,
        providerMode,
        selectedSources,
      },
    });
  } catch (err) {
    console.error('[counterparty] enqueue error', err);
    res.status(500).json({ ok: false, error: 'enqueue_failed' });
  }
});

function buildCheckProgress(entry) {
  const sources = entry?.data?.sources && typeof entry.data.sources === 'object'
    ? entry.data.sources
    : {};

  const sourceEntries = Object.entries(sources)
    .filter(([, value]) => value && typeof value === 'object');

  const totalSources = sourceEntries.length;

  const finalStatuses = new Set(['ok', 'empty', 'error', 'skipped']);
  const finishedSources = sourceEntries.filter(([, value]) =>
    finalStatuses.has(value.status)
  ).length;

  const processingSources = sourceEntries.filter(([, value]) =>
    value.status === 'processing'
  ).length;

  const stalledSources = sourceEntries.filter(([, value]) =>
    value.status === 'stalled'
  ).length;

  const percent = totalSources > 0
    ? Math.round((finishedSources / totalSources) * 100)
    : 0;

  return {
    totalSources,
    finishedSources,
    processingSources,
    stalledSources,
    percent,
  };
}

router.get('/check/:id', async (req, res) => {
  try {
    const entry = await loadResult(req.params.id, req.userId);
    if (!entry) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    const progress = buildCheckProgress(entry);
    const sources =
      entry?.data?.sources && typeof entry.data.sources === 'object'
        ? entry.data.sources
        : {};

    const resultPayload = {
      ...(entry.data || {}),
      id: entry.id,
      status: entry.status,
      createdAt: entry.createdAt,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
      deadlineAt: entry.deadlineAt,
      nextPollAt: entry.nextPollAt,
      pollState: entry.pollState,
      error: entry.error || entry?.data?.error || null,
      progress,
      sources,
    };

    res.json({
      ok: true,
      id: entry.id,
      status: entry.status,
      createdAt: entry.createdAt,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
      deadlineAt: entry.deadlineAt,
      nextPollAt: entry.nextPollAt,
      pollState: entry.pollState,
      error: entry.error || entry?.data?.error || null,
      reportReady: entry.status === 'done',
      progress,
      sources,
      result: resultPayload,
    });
  } catch (err) {
    console.error('[counterparty] get check error', err);
    res.status(500).json({ ok: false, error: 'check_load_failed' });
  }
});

router.post('/real-estate/cadastr-lookup', async (req, res) => {
  try {
    const payload = req.body || {};
    const address = String(payload.address || '').trim();

    if (!address) {
      return res.status(400).json({
        ok: false,
        error: 'address_required',
      });
    }

    const lookup = await rosreestrAddressLookup({ address });

    if (lookup.status === 'error') {
      return res.status(502).json({
        ok: false,
        error: lookup.error || 'rosreestr_lookup_failed',
        message: lookup.message || 'Не удалось выполнить поиск по адресу.',
      });
    }

    return res.json({
      ok: true,
      result: lookup,
    });
  } catch (err) {
    console.error('[counterparty] rosreestr address lookup error', err);
    return res.status(500).json({
      ok: false,
      error: 'rosreestr_lookup_failed',
    });
  }
});

router.post('/real-estate/object-lookup', async (req, res) => {
  try {
    const payload = req.body || {};
    const cadastralNumber = String(payload.cadastralNumber || '').trim();

    if (!cadastralNumber) {
      return res.status(400).json({
        ok: false,
        error: 'cadastral_number_required',
      });
    }

    const lookup = await rosreestrObjectLookup({ cadastralNumber });

    if (lookup.status === 'error') {
      return res.status(502).json({
        ok: false,
        error: lookup.error || 'rosreestr_object_lookup_failed',
        message: lookup.message || 'Не удалось получить сведения по объекту.',
      });
    }

    const subject = {
      entityType: 'realEstate',
      lookupType: 'cadastralObject',
      cadastralNumber: lookup?.item?.cadastralNumber || cadastralNumber,
      readableAddress: lookup?.item?.readableAddress || '',
      objectType: lookup?.item?.objectType || '',
      purpose: lookup?.item?.purpose || '',
    };

    const normalizedPayload = {
      entityType: 'realEstate',
      lookupType: 'cadastralObject',
      cadastralNumber,
    };

    const storedResult = buildRealEstateStoredResult(lookup, cadastralNumber);

    const { rows } = await query(
      `INSERT INTO counterparty_checks(user_id, provider, subject, payload, result, status, finished_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, 'done', now())
       RETURNING id, created_at`,
      [
        req.userId,
        'apicloud',
        JSON.stringify(subject),
        JSON.stringify(normalizedPayload),
        JSON.stringify(storedResult),
      ]
    );

    return res.json({
      ok: true,
      result: {
        id: rows[0].id,
        createdAt: rows[0].created_at,
        ...storedResult,
      },
    });
  } catch (err) {
    console.error('[counterparty] rosreestr object lookup error', err);
    return res.status(500).json({
      ok: false,
      error: 'rosreestr_object_lookup_failed',
    });
  }
});

router.get('/check/:id/raw', async (req, res) => {
  const raw = await loadRaw(req.params.id, req.userId);
  if (!raw) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, raw: raw.raw });
});

router.delete('/check/:id', async (req, res) => {
  try {
    const checkId = req.params.id;

    const { rowCount } = await query(
      `SELECT 1
       FROM counterparty_checks
       WHERE id = $1 AND user_id = $2`,
      [checkId, req.userId]
    );

    if (!rowCount) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    await query(
      `DELETE FROM counterparty_jobs
       WHERE check_id = $1 AND user_id = $2`,
      [checkId, req.userId]
    );

    await query(
      `DELETE FROM counterparty_checks
       WHERE id = $1 AND user_id = $2`,
      [checkId, req.userId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[counterparty] delete error', err);
    res.status(500).json({ ok: false, error: 'delete_failed' });
  }
});

router.post('/history/delete-many', async (req, res) => {
  try {
    const idsRaw = Array.isArray(req.body?.ids) ? req.body.ids : [];

    const ids = [...new Set(
      idsRaw
        .map((value) => String(value || '').trim())
        .filter((value) => /^[0-9a-fA-F-]{36}$/.test(value))
    )];

    if (!ids.length) {
      return res.status(400).json({
        ok: false,
        error: 'ids_required',
      });
    }

    await query(
      `DELETE FROM counterparty_jobs
       WHERE user_id = $2
         AND check_id = ANY($1::uuid[])`,
      [ids, req.userId]
    );

    const deleteResult = await query(
      `DELETE FROM counterparty_checks
       WHERE user_id = $2
         AND id = ANY($1::uuid[])
       RETURNING id`,
      [ids, req.userId]
    );

    return res.json({
      ok: true,
      deletedCount: deleteResult.rowCount || 0,
      deletedIds: deleteResult.rows.map((row) => row.id),
    });
  } catch (err) {
    console.error('[counterparty] bulk delete error', err);
    return res.status(500).json({
      ok: false,
      error: 'bulk_delete_failed',
    });
  }
});

router.get('/history', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 25);
    const search = String(req.query.search || '').trim();

    const list = await listUserResults(req.userId, {
      page,
      pageSize,
      search,
    });

    return res.json({
      ok: true,
      items: list.items.map((item) => ({
        id: item.id,
        provider: item.provider || null,
        providerLabel: item.providerLabel || 'Api-cloud',
        subject: item.subject,
        payload: item.payload,
        status: item.status,
        data: item.data,
        createdAt: item.createdAt,
        startedAt: item.startedAt,
        finishedAt: item.finishedAt,
        deadlineAt: item.deadlineAt,
        nextPollAt: item.nextPollAt,
        pollState: item.pollState,
        error: item.error || null,
      })),
      total: list.total,
      page: list.page,
      pageSize: list.pageSize,
      pages: list.pages,
      search: list.search,
    });
  } catch (err) {
    console.error('[counterparty] history load error', err);
    return res.status(500).json({
      ok: false,
      error: 'history_load_failed',
    });
  }
});

router.get('/report/:id/html', async (req, res) => {
  const reportId = String(req.params.id || '').trim();

  if (!isUuid(reportId)) {
    return res.status(400).send('invalid_report_id');
  }

  const entry = await loadResult(reportId, req.userId);
  if (!entry) return res.status(404).send('not_found');
  if (entry.status !== 'done') {
    return res.status(409).send('report_not_ready');
  }

  const entityType = getReportEntityType(entry.data);

  if (entityType === 'realEstate') {
    const template = getTemplate('realEstateReport.html');
    const html = template(buildRealEstateReportData(entry));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  const template = getTemplate('counterpartyReport.html');

  const filteredKonturData = applyFsspKonturFilters(
    {
      ...entry.data,
      createdAt: entry.createdAt,
      reportId: entry.id,
      reportMode: 'html',
      reportQueryString: buildReportQueryString(req.query),
    },
    req.query
  );

  const filteredFsspApiCloudData = applyFsspApiCloudFilters(filteredKonturData, req.query);
  const filteredStopOperData = applyStopOperRSFilters(filteredFsspApiCloudData, req.query);
  const filteredCourtsData = applyCourtsCommonFilters(filteredStopOperData, req.query);
  const filteredArbitrationApiCloudData = applyArbitrationApiCloudCombinedFilters(
    filteredCourtsData,
    req.query
  );
  const filteredArbitrationKonturData = applyArbitrationKonturFilters(
    filteredArbitrationApiCloudData,
    req.query
  );
  const transformedCommercialData = applyCommercialActivityKonturTransforms(filteredArbitrationKonturData);
  const filteredReportData = applyCommercialActivityKonturFilters(transformedCommercialData, req.query);


  const html = template(filteredReportData);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/report/:id/pdf', async (req, res) => {
  const reportId = String(req.params.id || '').trim();

  if (!isUuid(reportId)) {
    return res.status(400).send('invalid_report_id');
  }

  const entry = await loadResult(reportId, req.userId);
  if (!entry) return res.status(404).send('not_found');
  if (entry.status !== 'done') {
    return res.status(409).send('report_not_ready');
  }
  const entityType = getReportEntityType(entry.data);

  let html = '';
  let fileName = 'counterparty-report.pdf';

  if (entityType === 'realEstate') {
    const template = getTemplate('realEstateReport.html');
    html = template(buildRealEstateReportData(entry));
    fileName = 'real-estate-report.pdf';
  } else {
    const template = getTemplate('counterpartyReport.html');

    const filteredKonturData = applyFsspKonturFilters(
      {
        ...entry.data,
        createdAt: entry.createdAt,
        reportId: entry.id,
        reportMode: 'pdf',
        reportQueryString: buildReportQueryString(req.query),
      },
      req.query
    );

    const filteredFsspApiCloudData = applyFsspApiCloudFilters(filteredKonturData, req.query);
    const filteredStopOperData = applyStopOperRSFilters(filteredFsspApiCloudData, req.query);
    const filteredCourtsData = applyCourtsCommonFilters(filteredStopOperData, req.query);
    const filteredArbitrationApiCloudData = applyArbitrationApiCloudCombinedFilters(
      filteredCourtsData,
      req.query
    );
    const filteredArbitrationKonturData = applyArbitrationKonturFilters(
      filteredArbitrationApiCloudData,
      req.query
    );
    const transformedCommercialData = applyCommercialActivityKonturTransforms(filteredArbitrationKonturData);
    const filteredReportData = applyCommercialActivityKonturFilters(transformedCommercialData, req.query);

    const maskedData = maskPersonalData(filteredReportData);
    html = template(maskedData);
  }

  try {
    const pdfBuffer = await exportHtmlToPdfBuffer(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[counterparty] pdf error', err);
    res.status(500).send('pdf_failed');
  }
});


// Поиск ИНН по ФИО + дате рождения + паспорту через api-cloud (nalog.php?type=inn)
router.post('/inn-lookup', async (req, res, next) => {
  try {
    const { person } = req.body || {};
    if (!person) {
      return res.status(400).json({ error: 'PERSON_REQUIRED' });
    }

    const result = await innLookup(person);

    // result: { status: 'ok' | 'empty' | 'error', payload: {...} }
    res.json(result);
  } catch (err) {
    console.error('[counterparty] inn-lookup error', err);
    next(err);
  }
});

// Hook to store additional raw payloads if needed later
router.post('/check/:id/raw', async (req, res) => {
  const entry = await loadResult(req.params.id, req.userId);
  if (!entry) return res.status(404).json({ ok: false, error: 'not_found' });
  await saveRaw(entry.id, req.body, req.userId);
  res.json({ ok: true });
});

module.exports = router;
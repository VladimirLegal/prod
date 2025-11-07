// client/src/utils/passportOcr.js
// ВЕРСИЯ ДЛЯ tesseract.js 2.1.5 (браузер). Один воркер, кропы по зонам (ROI) + Canvas-предобработка.

import Tesseract from 'tesseract.js';

let workerPromise = null;

// --- Геометрия карточки (проценты от ширины/высоты изображения).
// Если что-то не попадает — правь числа +/- 2–5%.
const ROI_TEMPLATE = {
  // Крупный номер паспорта вверху справа: "4022 372517"
  passportNumber: { left: 62, top: 5, width: 33, height: 9 },

  // Блок "Кем выдан" (многострочный)
  issuedBy:      { left: 6, top: 19, width: 70, height: 11 },

  // "Дата выдачи" (dd.mm.yyyy)
  issueDate:     { left: 6, top: 31.5, width: 30, height: 6.5 },

  // "Код подразделения" (xxx-xxx)
  depCode:       { left: 38, top: 31.5, width: 25, height: 6.5 },

  // "ФИО"
  fullName:      { left: 6, top: 44.5, width: 70, height: 9 },

  // "Пол" обычно рядом с ФИО — но определяем через парсинг текста, поэтому ROI необязателен.

  // "Дата рождения"
  birthDate:     { left: 6, top: 55, width: 30, height: 7 },

  // "Место рождения"
  birthPlace:    { left: 6, top: 63.5, width: 78, height: 13 },

  // Небольшой общий fallback-блок (нижняя половина карточки)
  fallbackText:  { left: 4, top: 42, width: 92, height: 35 },
};

// --- Воркер (жёстко указываем пути, никаких функций в опциях!)
async function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker({
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@2.1.5/dist/worker.min.js',
      corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@2.2.0/tesseract-core.wasm.js',
      langPath:   'https://tessdata.projectnaptha.com/4.0.0',
    });
    const w = await workerPromise;
    await w.load();
    await w.loadLanguage('rus'); // один язык — стабильнее
    await w.initialize('rus');
    // Базовые параметры (строки/числа только)
    await w.setParameters({
      preserve_interword_spaces: '1',
    });
  }
  return workerPromise;
}

// --- utils: загрузка изображения из файла/Blob
function loadImage(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// --- utils: создает canvas по размеру
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return c;
}

// --- Предобработка: grayscale + лёгкий threshold + upscale х2
function preprocessToCanvas(srcCanvas) {
  const scale = 2; // апскейлим, Tesseract любит большие буквы/цифры
  const dst = makeCanvas(srcCanvas.width * scale, srcCanvas.height * scale);
  const dctx = dst.getContext('2d');

  // Билинейный ресайз
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = 'high';
  dctx.drawImage(srcCanvas, 0, 0, dst.width, dst.height);

  // Градации серого + простой порог (авто по среднему)
  const imgData = dctx.getImageData(0, 0, dst.width, dst.height);
  const data = imgData.data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const gray = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
    data[i] = data[i + 1] = data[i + 2] = gray;
    sum += gray;
  }
  const avg = sum / (data.length / 4);
  const thr = Math.max(90, Math.min(170, avg)); // мягкий диапазон порога

  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > thr ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  dctx.putImageData(imgData, 0, 0);

  return dst;
}

// --- Кроп по процентам
function cropToCanvas(img, roiPercent) {
  const { left, top, width, height } = roiPercent;
  const x = (img.width * left) / 100;
  const y = (img.height * top) / 100;
  const w = (img.width * width) / 100;
  const h = (img.height * height) / 100;

  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return c;
}

// --- Нормализации/regex-помощники
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

function normalizePassportNumber(s) {
  if (!s) return '';
  // Похожие символы → цифры
  s = s.replace(/[OoОоD]/g, '0').replace(/[Il|]/g, '1');
  const digits = (s.match(/\d/g) || []).join('');
  if (digits.length < 10) return '';
  const ser = digits.slice(0, 4);
  const num = digits.slice(4, 10);
  return `${ser} ${num}`;
}

function normalizeDepCode(s) {
  if (!s) return '';
  s = s.replace(/[—–−]/g, '-');
  const digits = (s.match(/\d/g) || []).join('');
  if (digits.length < 6) return '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
}

function normalizeDate(s) {
  if (!s) return '';
  // Оставим только цифры/точки, заменим похожие символы
  s = s.replace(/[ОО]+/gi, '0').replace(/[,]/g, '.').replace(/[^\d.]/g, '');
  const m = s.match(/^([0-3]?\d)\.([01]?\d)\.(\d{2}|\d{4})$/);
  if (!m) return '';
  let dd = m[1].padStart(2, '0');
  let mm = m[2].padStart(2, '0');
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = (Number(yyyy) > 30 ? '19' : '20') + yyyy;
  return `${dd}.${mm}.${yyyy}`;
}

function detectGenderFromText(t) {
  const txt = (t || '').toLowerCase();
  if (txt.includes('жен')) return 'female';
  if (txt.includes('муж')) return 'male';
  return '';
}

// --- Универсальная функция OCR одного ROI с параметрами
async function ocrROI(worker, canvas, { psm = '7', whitelist = null }) {
  // Для каждого поля — свои параметры
  await worker.setParameters({
    tessedit_pageseg_mode: String(psm), // '6' = абзац/строки, '7' = одна строка
    ...(whitelist ? { tessedit_char_whitelist: whitelist } : {}),
  });
  const { data } = await worker.recognize(canvas);
  return norm(data?.text || '');
}

// --- Главная: OCR + парсинг карточки Госуслуг
export async function extractPassportFromImage(fileOrBlob) {
  const img = await loadImage(fileOrBlob);

  const worker = await getWorker();

  // Кропаем ROI и предобрабатываем
  const cNumber      = preprocessToCanvas(cropToCanvas(img, ROI_TEMPLATE.passportNumber));
  const cIssuedBy    = preprocessToCanvas(cropToCanvas(img, ROI_TEMPLATE.issuedBy));
  const cIssueDate   = preprocessToCanvas(cropToCanvas(img, ROI_TEMPLATE.issueDate));
  const cDepCode     = preprocessToCanvas(cropToCanvas(img, ROI_TEMPLATE.depCode));
  const cFullName    = preprocessToCanvas(cropToCanvas(img, ROI_TEMPLATE.fullName));
  const cBirthDate   = preprocessToCanvas(cropToCanvas(img, ROI_TEMPLATE.birthDate));
  const cBirthPlace  = preprocessToCanvas(cropToCanvas(img, ROI_TEMPLATE.birthPlace));
  const cFallback    = preprocessToCanvas(cropToCanvas(img, ROI_TEMPLATE.fallbackText));

  // Распознаём с «узкими» параметрами
  const [numRaw, issuedRaw, issueDateRaw, depRaw, fioRaw, bDateRaw, bPlaceRaw, fallbackRaw] =
    await Promise.all([
      ocrROI(worker, cNumber,    { psm: '7', whitelist: '0123456789 ' }),
      ocrROI(worker, cIssuedBy,  { psm: '6' }),
      ocrROI(worker, cIssueDate, { psm: '7', whitelist: '0123456789.' }),
      ocrROI(worker, cDepCode,   { psm: '7', whitelist: '0123456789-' }),
      ocrROI(worker, cFullName,  { psm: '6' }),
      ocrROI(worker, cBirthDate, { psm: '7', whitelist: '0123456789.' }),
      ocrROI(worker, cBirthPlace,{ psm: '6' }),
      ocrROI(worker, cFallback,  { psm: '6' }),
    ]);

  // Нормализация
  const passport = normalizePassportNumber(numRaw) ||
                   normalizePassportNumber(fallbackRaw);

  const departmentCode = normalizeDepCode(depRaw) ||
                         normalizeDepCode(fallbackRaw);

  const issueDate = normalizeDate(issueDateRaw) ||
                    normalizeDate(fallbackRaw);

  const birthDate = normalizeDate(bDateRaw) ||
                    normalizeDate(fallbackRaw);

  const fullName = fioRaw || '';
  const birthPlace = bPlaceRaw || '';

  const gender = detectGenderFromText(`${fallbackRaw}\n${issuedRaw}\n${fioRaw}`);

  // Соберём «сырой» текст для отладки/проверки
  const rawText =
    [
      '--- passportNumber ---\n' + numRaw,
      '--- issuedBy ---\n' + issuedRaw,
      '--- issueDate ---\n' + issueDateRaw,
      '--- depCode ---\n' + depRaw,
      '--- fullName ---\n' + fioRaw,
      '--- birthDate ---\n' + bDateRaw,
      '--- birthPlace ---\n' + bPlaceRaw,
      '--- fallback ---\n' + fallbackRaw,
    ].join('\n\n');

  return {
    fullName,
    gender,
    birthDate,
    birthPlace,
    passport,
    issueDate,
    passportIssued: issuedRaw,
    departmentCode,
    rawText,
  };
}

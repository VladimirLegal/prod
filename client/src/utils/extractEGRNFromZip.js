// client/src/utils/extractEGRNFromZip.js
// ZIP → XML (приоритет) + PDF (только паспорт/контакты получателя как дополнение).
// ВАЖНО:
//  - В documents кладём ТОЛЬКО реальные underlying_documents из XML (никакой синтетики).
//  - У владельца есть rights[] (метаданные записей права): { regNum, regDate, ownershipType, share }.
//  - Для "Собственность" и "Общая совместная собственность" долей НЕТ → share == "" везде.
//  - Для "Общая долевая собственность" доля есть и выводится РОВНО как в XML (без сокращений).
//  - Плоский список documents у владельца: элементы { (опц.)share, doc, docDate, regNum, regDate }.
//    share включаем ТОЛЬКО для долевой; для собственности/совместной — без share.
//  - Дедуп прав по ключу regNum|regDate. Дедуп документов по ключу:
//      * долевая: share|doc|docDate|regNum|regDate
//      * собственность/совместная: doc|docDate|regNum|regDate
//  - regNum всегда строка; regDate формат ДД.ММ.ГГГГ.
//  - shareTotal считаем только для внутренней проверки и кладём в debug (в выдаче НЕ показываем).

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { extractEGRNDataFromPdf } from './extractEGRNDataFromPdf';

// =============== helpers ===============

const get = (obj, path, def = undefined) =>
  path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : undefined), obj) ?? def;

const ensureArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const normalizeStr = (s) =>
  (s ?? '')
    .toString()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();

const isoToRu = (s) => {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(s);
};

// 👇 ВСТАВИТЬ СРАЗУ ПОСЛЕ isoToRu (или блока хелперов)
const combineDocTitleAndNumber = (doc, number) => {
  const title = (doc || '').trim();
  const num = (number || '').trim();

  if (!num) return title;                       // нет номера — оставляем как есть
  // если в title уже лежит "..., № <num>" — не дублируем
  if (title && new RegExp(`№\\s*${num}$`).test(title)) return title;

  return title ? `${title}, № ${num}` : `№ ${num}`;
};

// рациональная арифметика для суммарной доли (для debug)
const gcd = (a, b) => {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};
const parseShare = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  return { n: parseInt(m[1], 10), d: parseInt(m[2], 10) };
};
const sumShares = (shares) => {
  const fracs = shares.map(parseShare).filter(Boolean);
  if (!fracs.length) return '';
  let num = 0, den = 1;
  for (const f of fracs) {
    num = num * f.d + f.n * den;
    den = den * f.d;
    const g = gcd(num, den);
    num /= g; den /= g;
  }
  return `${num}/${den}`;
};

const parseRuDateToSortable = (ru) => {
  // "ДД.ММ.ГГГГ" -> "ГГГГ-ММ-ДД" для сортировки
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ru || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

// =============== XML parsing ===============

function parseEGRNXml(xmlText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    allowBooleanAttributes: true,
    parseTagValue: true,
    trimValues: true,
  });

  const xml = parser.parse(xmlText);
  const root =
    xml?.extract_base_params_room ||
    xml?.extract_base_params ||
    xml;

  const cadastralNumber =
    get(root, 'room_record.object.common_data.cad_number') ||
    get(root, 'object.common_data.cad_number') ||
    '';

  const address =
    get(root, 'room_record.address_room.address.address.readable_address') ||
    get(root, 'address_room.address.address.readable_address') ||
    get(root, 'object.address.readable_address') ||
    '';

  const areaRaw = get(root, 'room_record.params.area') || get(root, 'params.area');
  const area =
    typeof areaRaw === 'object'
      ? (areaRaw?.value ?? areaRaw?.area ?? '')?.toString()
      : (areaRaw ?? '')?.toString();

  const floorRaw =
    get(root, 'room_record.location_in_build.level.floor') ||
    get(root, 'location_in_build.level.floor');
  const floor =
    typeof floorRaw === 'object' ? (floorRaw?.value ?? '')?.toString() : (floorRaw ?? '')?.toString();

  // --- собираем все right_record по дереву ---
  const collectRightRecords = (node) => {
    const out = [];
    const stack = [node];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object') continue;

      if (cur.right_records && cur.right_records.right_record) {
        out.push(...ensureArray(cur.right_records.right_record));
      } else if (cur.right_record) {
        out.push(...ensureArray(cur.right_record));
      }
      for (const k of Object.keys(cur)) {
        const v = cur[k];
        if (v && typeof v === 'object') stack.push(v);
      }
    }
    return out;
  };

  let rightRecords = ensureArray(get(root, 'room_record.right_records.right_record')) || [];
  if (rightRecords.length === 0) rightRecords = collectRightRecords(root);

  // Права считаем уникальными по (regNum|regDate)
  const seenRights = new Set();
  const uniqueRights = [];
  for (const r of rightRecords) {
    if (get(r, 'record_info.cancel_date')) continue; // пропускаем прекращённые
    const regNum = String(get(r, 'right_data.right_number') || '');
    const regDate = isoToRu(get(r, 'record_info.registration_date') || '');
    const key = `${regNum}|${regDate}`;
    if (seenRights.has(key)) continue;
    seenRights.add(key);
    uniqueRights.push(r);
  }

  // --- группируем по держателю, наполняем rights[] и плоские documents ---
  const holdersMap = new Map(); // key → owner object

  // вспомогательный push документа в ПЛОСКИЙ массив владельца с дедупом по правилу типа собственности
  const pushOwnerDoc = (owner, item, isSharedOwnership) => {
    owner._docsSet = owner._docsSet || new Set();
    const baseKey = `${normalizeStr(item.doc)}|${normalizeStr(item.number || '')}|${normalizeStr(item.docDate)}|${normalizeStr(item.regNum)}|${normalizeStr(item.regDate)}`;
    const k = isSharedOwnership
      ? `${normalizeStr(item.share)}|${baseKey}`
      : baseKey;

    if (owner._docsSet.has(k)) return;
    owner._docsSet.add(k);
    owner.documents.push(item);
  };

  const addRightToOwner = (owner, { regNum, regDate, ownershipType, share, baseDocs }) => {
    // rights map (метаданные)
    owner._rightsMap = owner._rightsMap || new Map();
    const rKey = `${normalizeStr(regNum)}|${normalizeStr(regDate)}`;
    if (!owner._rightsMap.has(rKey)) {
      owner._rightsMap.set(rKey, {
        regNum,
        regDate,
        ownershipType,
        share,
      });
    }
    // документы-основания → в ПЛОСКИЙ массив owner.documents
    const isShared = ownershipType === 'Общая долевая собственность';
    for (const d of baseDocs) {
      const docTitle = d?.document_name || get(d, 'document_code.value') || '';
      const docDate = isoToRu(d?.document_date || '');
      // номер документа: <document_number>
      const docNumber = (d?.document_number ?? '').toString().trim();
      const docItem = isShared
        ? { share: share || '', doc: docTitle, number: docNumber, docDate, regNum, regDate }
        : { doc: docTitle, number: docNumber, docDate, regNum, regDate };

      pushOwnerDoc(owner, docItem, isShared);
    }
  };

  const ownersFromXML = () => {
    for (const rec of uniqueRights) {
      const ownershipType = get(rec, 'right_data.right_type.value') || '';
      // долю даём ТОЛЬКО для долевой, ровно как в XML (без сокращений)
      const share =
        ownershipType === 'Общая долевая собственность'
          ? (() => {
              const num = get(rec, 'right_data.shares.share.numerator');
              const den = get(rec, 'right_data.shares.share.denominator');
              if (num && den) return `${num}/${den}`;
              return get(rec, 'right_data.share_description') || '';
            })()
          : '';

      const regNum = String(get(rec, 'right_data.right_number') || '');
      const regDate = isoToRu(get(rec, 'record_info.registration_date') || '');
      const holders = [
        ...ensureArray(get(rec, 'right_holders.right_holder')),
        ...ensureArray(get(rec, 'right_holders.holder')),
        ...ensureArray(get(rec, 'right_holder')),
      ];
      const baseDocs = ensureArray(get(rec, 'underlying_documents.underlying_document'));

      for (const h of holders) {
        // ФИЗЛИЦО
        if (h?.individual) {
          const ind = h.individual;
          const fullName = [ind.surname, ind.name, ind.patronymic].filter(Boolean).join(' ').trim();
          const birthDate = isoToRu(ind.birth_date || '');
          const key = `person|${normalizeStr(fullName)}|${birthDate}`;

          if (!holdersMap.has(key)) {
            holdersMap.set(key, {
              kind: 'person',
              fullName,
              birthDate,
              birthPlace: ind.birth_place || '',
              snils: ind.snils || '',
              registration:
                get(ind, 'contacts.mailing_address') ||
                get(ind, 'contacts.mailing_addess') || // возможная опечатка в XML
                get(ind, 'contacts.place_of_residence') ||
                '',
              phone: '',
              email: '',
              ownershipType, // актуальный тип (будет уточнён первым правом)
              passport: {
                series: get(ind, 'identity_doc.document_series') || '',
                number: get(ind, 'identity_doc.document_number') || '',
                issuedBy: get(ind, 'identity_doc.document_issuer') || '',
                issueDate: isoToRu(get(ind, 'identity_doc.document_date') || ''),
                deptCode: '',
              },
              rights: [],
              documents: [],
              _sharesForDebug: [], // для shareTotal (только долевая)
            });
          }
          const owner = holdersMap.get(key);
          // ownershipType у владельца берём первого встретившегося (как правило, одинаковый)
          if (!owner.ownershipType) owner.ownershipType = ownershipType;

          addRightToOwner(owner, { regNum, regDate, ownershipType, share, baseDocs });
          if (share) owner._sharesForDebug.push(share);
          continue;
        }

        // ЮРЛИЦО
        if (h?.legal_entity) {
          const le = h.legal_entity;
          const name = (le?.name?.full || le?.name?.short || le?.name || '').trim();
          const key = `legal|${normalizeStr(name)}`;

          if (!holdersMap.has(key)) {
            holdersMap.set(key, {
              kind: 'legal',
              fullName: name,
              birthDate: '',
              birthPlace: '',
              snils: '',
              registration: le?.address || '',
              phone: '',
              email: '',
              ownershipType,
              passport: { series: '', number: '', issuedBy: '', issueDate: '', deptCode: '' },
              ogrn: le?.ogrn || '',
              inn: le?.inn || '',
              rights: [],
              documents: [],
              _sharesForDebug: [],
            });
          }
          const owner = holdersMap.get(key);
          if (!owner.ownershipType) owner.ownershipType = ownershipType;

          addRightToOwner(owner, { regNum, regDate, ownershipType, share, baseDocs });
          if (share) owner._sharesForDebug.push(share);
          continue;
        }

        // ПУБЛИЧНОЕ ОБРАЗОВАНИЕ
        if (h?.public_formation) {
          const name =
            get(h, 'public_formation.public_formation_type.subject_of_rf.name.value') ||
            get(h, 'public_formation.name') ||
            '';
          const nm = (name || '').trim();
          const key = `public|${normalizeStr(nm)}`;

          if (!holdersMap.has(key)) {
            holdersMap.set(key, {
              kind: 'public',
              fullName: nm,
              birthDate: '',
              birthPlace: '',
              snils: '',
              registration: '',
              phone: '',
              email: '',
              ownershipType,
              passport: { series: '', number: '', issuedBy: '', issueDate: '', deptCode: '' },
              rights: [],
              documents: [],
              _sharesForDebug: [],
            });
          }
          const owner = holdersMap.get(key);
          if (!owner.ownershipType) owner.ownershipType = ownershipType;

          addRightToOwner(owner, { regNum, regDate, ownershipType, share, baseDocs });
          if (share) owner._sharesForDebug.push(share);
          continue;
        }
      }
    }
  };

  ownersFromXML();

  // финализация владельцев
  const landlords = Array.from(holdersMap.values()).map((owner) => {
    // rights[] из map → массив и сортируем по regDate (возрастание)
    const rights = Array.from(owner._rightsMap?.values() || []).sort((a, b) => {
      const sa = parseRuDateToSortable(a.regDate);
      const sb = parseRuDateToSortable(b.regDate);
      return sa.localeCompare(sb);
    });

    // для "Собственность" и "Общая совместная" доля всегда пустая
    let ownerShare = '';
    if (owner.ownershipType === 'Общая долевая собственность') {
      // показываем долю как в выписке на уровне владельца, если у всех прав одна и та же доля,
      // иначе оставляем пусто (чтобы не вводить в заблуждение). Сумму считаем только в debug.
      const uniqueShares = Array.from(new Set(rights.map((r) => r.share).filter(Boolean)));
      ownerShare = uniqueShares.length === 1 ? uniqueShares[0] : '';
    }

    // суммарная доля только в debug (если долевая)
    const shareTotalDebug =
      owner.ownershipType === 'Общая долевая собственность'
        ? sumShares((rights.map((r) => r.share).filter(Boolean)))
        : '';

    // плоский список документов уже собран (owner.documents) и продедуплен
    // приводим regNum к строке (на всякий случай)
    const flatDocs = (owner.documents || []).map((d) => ({
      ...(d.share !== undefined ? { share: d.share } : {}),
      doc: combineDocTitleAndNumber(d.doc, d.number),
      number: d.number || '',         // ← ДОБАВИЛИ ЭТУ СТРОКУ
      docDate: d.docDate || '',
      regNum: String(d.regNum || ''),
      regDate: d.regDate || '',
    }));

    return {
      fullName: owner.fullName,
      birthDate: owner.birthDate || '',
      birthPlace: owner.birthPlace || '',
      snils: owner.snils || '',
      registration: owner.registration || '',
      phone: owner.phone || '',
      email: owner.email || '',
      ownershipType: owner.ownershipType || '',
      share: ownerShare,                 // на карточке — как в выписке (при едином значении), иначе ""
      passport: owner.passport || { series: '', number: '', issuedBy: '', issueDate: '', deptCode: '' },
      rights: rights.map((r) => ({
        regNum: String(r.regNum || ''),
        regDate: r.regDate || '',
        ownershipType: r.ownershipType || '',
        share: r.share || '',            // у собственности/совместной будет ""
      })),
      documents: flatDocs,               // ТОЛЬКО реальные underlying_documents; без синтетики
      ...(owner.ogrn ? { ogrn: owner.ogrn } : {}),
      ...(owner.inn ? { inn: owner.inn } : {}),
      _debugShareTotal: shareTotalDebug, // только для внутренней проверки; наружу не мапим
    };
  });

  return {
    cadastralNumber,
    address,
    area,
    floor,
    landlords,
    recipientName: get(root, 'recipient_statement') || '',
  };
}

// =============== merge XML + PDF (паспорт/контакты получателя) ===============

function normalizeName(n) { return normalizeStr(n); }

function mergeXmlAndPdf(xmlData, pdfData, recipientName) {
  if (!xmlData && !pdfData) return null;
  if (!xmlData) return pdfData || null; // если XML нет — отдаём PDF как есть
  if (!pdfData) return { ...xmlData };

  const result = { ...xmlData };

  // сопоставление получателя по ФИО (дата рождения опционально)
  const byKey = new Map();
  for (const l of xmlData.landlords || []) {
    const key = `${normalizeName(l.fullName)}|${l.birthDate || ''}`;
    byKey.set(key, { ...l });
  }

  if (recipientName) {
    const recipientNorm = normalizeName(recipientName);
    for (const [k, val] of byKey.entries()) {
      const nameOnly = k.split('|')[0];
      if (nameOnly === recipientNorm) {
        const pdfPassport =
          pdfData?.recipientPassport ||
          pdfData?.passport ||
          pdfData?.terms?.recipientPassport ||
          null;

        const pdfContacts =
          pdfData?.recipientContacts ||
          pdfData?.contacts ||
          null;

        if (pdfPassport) {
          val.passport = {
            series: pdfPassport.series || val.passport?.series || '',
            number: pdfPassport.number || val.passport?.number || '',
            issuedBy: pdfPassport.issuedBy || val.passport?.issuedBy || '',
            issueDate: pdfPassport.issueDate || val.passport?.issueDate || '',
            deptCode: pdfPassport.deptCode || val.passport?.deptCode || '',
          };
        }
        if (pdfContacts) {
          val.phone = pdfContacts.phone || val.phone || '';
          val.email = pdfContacts.email || val.email || '';
          val.registration = pdfContacts.registration || val.registration || '';
        }
        byKey.set(k, val);
        break;
      }
    }
  }

  result.landlords = Array.from(byKey.values());
  return result;
}

// =============== mapping to UI ===============

function toUiPayload(merged) {
  if (!merged) return { terms: null, extractedLandlords: [] };

  const terms = {
    address: merged.address || '',
    cadastralNumber: merged.cadastralNumber || '',
    area: merged.area || '',
    floor: merged.floor || '',
  };

  // передаём владельцев как есть (rights + плоские documents), shareTotal наружу не отдаём
  const extractedLandlords = (merged.landlords || []).map((l) => ({
    fullName: l.fullName || '',
    birthDate: l.birthDate || '',
    birthPlace: l.birthPlace || '',
    snils: l.snils || '',
    registration: l.registration || '',
    phone: l.phone || '',
    email: l.email || '',
    ownershipType: l.ownershipType || '',
    share: l.share || '',
    passport: {
      series: l.passport?.series || '',
      number: l.passport?.number || '',
      issuedBy: l.passport?.issuedBy || '',
      issueDate: l.passport?.issueDate || '',
      deptCode: l.passport?.deptCode || '',
    },
    documents: ensureArray(l.documents).map((d) => ({
      ...(d.share !== undefined && d.share !== '' ? { share: d.share } : {}),
      doc: combineDocTitleAndNumber(d.doc, d.number),
      number: d.number || '',
      docDate: d.docDate || '',
      regNum: String(d.regNum || ''),
      regDate: d.regDate || '',
    })),
       
    ...(l.ogrn ? { ogrn: l.ogrn } : {}),
    ...(l.inn ? { inn: l.inn } : {}),
  }));


  return { terms, extractedLandlords };
}

// =============== main ===============

/**
 * @param {File|ArrayBuffer|Uint8Array} zipInput - ZIP с XML+PDF
 * @returns {Promise<{terms: object, extractedLandlords: array, landlords: array, debug?: object}>}
 */
export async function extractEGRNFromZip(zipInput) {
  // → ArrayBuffer
  let arrayBuffer;
  if (zipInput instanceof ArrayBuffer) {
    arrayBuffer = zipInput;
  } else if (zipInput && typeof zipInput.arrayBuffer === 'function') {
    arrayBuffer = await zipInput.arrayBuffer();
  } else if (zipInput && zipInput.buffer) {
    arrayBuffer = zipInput.buffer;
  } else {
    throw new Error('Не удалось прочитать ZIP: неподдерживаемый тип входных данных');
  }

  // load zip
  const zip = await JSZip.loadAsync(arrayBuffer);

  // find entries
  const entries = Object.values(zip.files || {});
  const xmlEntry =
    entries.find((f) => /\.xml$/i.test(f.name) && /extract.*base.*params.*room/i.test(f.name)) ||
    entries.find((f) => /\.xml$/i.test(f.name));
  const pdfEntry = entries.find((f) => /\.pdf$/i.test(f.name));

  if (!xmlEntry && !pdfEntry) {
    throw new Error('В ZIP не найдено ни одного XML или PDF файла.');
  }

  // parse XML
  let xmlData = null;
  if (xmlEntry) {
    try {
      const xmlRaw = await xmlEntry.async('text');
      xmlData = parseEGRNXml(xmlRaw);
    } catch (e) {
      console.warn('Ошибка парсинга XML из ZIP:', e);
      xmlData = null;
    }
  }

  // parse PDF (только паспорт/контакты получателя; документы из PDF НЕ подмешиваем к XML)
  let pdfData = null;
  if (pdfEntry) {
    try {
      const pdfBuffer = await pdfEntry.async('arraybuffer');
      const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
      pdfData = await extractEGRNDataFromPdf(pdfBlob);
      // eslint-disable-next-line no-console
      console.log('📄 PDF parsed (для доп. полей получателя):', {
        hasRecipientName: !!(pdfData && (pdfData.recipientName || pdfData.terms?.recipientName)),
      });
    } catch (e) {
      console.warn('Ошибка парсинга PDF из ZIP:', e);
      pdfData = null;
    }
  }

  // merge
  const recipientName =
    xmlData?.recipientName ||
    pdfData?.recipientName ||
    pdfData?.terms?.recipientName ||
    '';

  const merged = mergeXmlAndPdf(xmlData, pdfData, recipientName);

  // UI
  const ui = toUiPayload(merged || pdfData || { landlords: [], terms: null });

  const finalPayload = {
    terms: ui.terms,
    extractedLandlords: ui.extractedLandlords,
    landlords: ui.extractedLandlords, // алиас
    debug: {
      recipientName,
      from: xmlData ? 'xml' : (pdfData ? 'pdf' : 'none'),
      xmlFileName: xmlEntry?.name || '',
      pdfFileName: pdfEntry?.name || '',
      // shareTotal только для внутренней проверки
      shareTotals: (merged?.landlords || []).map((l) => ({
        name: l.fullName,
        ownershipType: l.ownershipType,
        shareTotal: l._debugShareTotal || '',
      })),
    },
  };

  // eslint-disable-next-line no-console
  console.log('✅ to UI:', {
    address: finalPayload.terms?.address || '',
    cad: finalPayload.terms?.cadastralNumber || '',
    floor: finalPayload.terms?.floor || '',
    area: finalPayload.terms?.area || '',
    owners: finalPayload.extractedLandlords.length,
    names: finalPayload.extractedLandlords.map((l) => l.fullName),
    
  });

  return finalPayload;
}

export default extractEGRNFromZip;

// client/src/utils/egrnUiAdapter.js

// ----- Нормализация и сравнение ФИО -----
export const norm = (s = "") =>
  s.toString().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export const splitFio = (fullName = "") => {
  const p = norm(fullName).split(" ");
  return { last: p[0] || "", first: p[1] || "", middle: p[2] || "" };
};

export const namesMatchStrict = (aName, aBirth, bName, bBirth) =>
  !!aBirth && !!bBirth && norm(aBirth) === norm(bBirth) && norm(aName) === norm(bName);

export const namesMatchFuzzy = (aName, aBirth, bName, bBirth) => {
  if (!aBirth || !bBirth) return false;
  if (norm(aBirth) !== norm(bBirth)) return false;
  const a = splitFio(aName), b = splitFio(bName);
  return a.first && a.first === b.first && a.middle && a.middle === b.middle;
};

// ----- Преобразование документов выписки к структуре UI -----

// Собираем текст "Название документа" согласно правилам:
// - для долевой: включаем share в начало названия;
// - из PDF добавляем ", № <number>", если number есть;
// - для ZIP отдельного number обычно нет (он внутри doc).
const composeTitle = ({ ownershipType, share, name, number }) => {
  const parts = [];
  if (ownershipType === "Общая долевая собственность" && share) parts.push(share);
  if (name) parts.push(name.trim());
  if (number) parts.push(`№ ${String(number).trim()}`);
  return parts.join(", ");
};

// Один документ -> элемент списка оснований внутри группы регистрации
const toBasisItem = ({ ownershipType, share, title, doc, number, docDate }) => ({
  title: composeTitle({
    ownershipType,
    share,
    name: title || doc || "",
    number: number || "",
  }),
  docDate: docDate || "",
});

// Объединяем документы в группы по (regNumber, regDate) с сортировками
// Вход: landlord из парсера (PDF: rights[].documents[], ZIP: documents[]).
// Выход: Array<{ regNumber, regDate, basisDocuments: Array<{title, docDate}> }>
export const toUiDocGroups = (landlord) => {
  const ownershipType = landlord?.ownershipType || "";
  const rawItems = [];

  if (Array.isArray(landlord?.documents) && landlord.documents.length) {
    // ZIP (XML): [{ share?, doc, docDate, regNum, regDate }]
    landlord.documents.forEach((d) => {
      rawItems.push({
        ownershipType,
        share: d.share,
        title: d.doc,
        number: "", // у ZIP обычно отдельного поля номера нет
        docDate: d.docDate,
        regNumber: String(d.regNum || "").trim(),
        regDate: d.regDate || "",
      });
    });
  } else if (Array.isArray(landlord?.rights) && landlord.rights.length) {
    // PDF: rights[] -> documents[] ({ title, number, docDate, regNumber, regDate }), доля в right.share
    landlord.rights.forEach((r) => {
      (r.documents || []).forEach((doc) => {
        rawItems.push({
          ownershipType,
          share: r.share,
          title: doc.title,
          number: doc.number,
          docDate: doc.docDate,
          regNumber: String(doc.regNumber || "").trim(),
          regDate: doc.regDate || "",
        });
      });
    });
  }

  // Группировка по паре (regNumber, regDate)
  const map = new Map(); // key: `${regNumber}|${regDate}` -> { regNumber, regDate, basisDocuments[] }
  rawItems.forEach((it) => {
    const key = `${it.regNumber}|${it.regDate}`;
    if (!map.has(key)) {
      map.set(key, { regNumber: it.regNumber, regDate: it.regDate, basisDocuments: [] });
    }
    map.get(key).basisDocuments.push(toBasisItem(it));
  });

  // Сортировка: группы по regDate ↑; внутри — по docDate ↑, затем по title
  const toDateKey = (s) => {
    // формат ДД.ММ.ГГГГ -> ГГГГ-ММ-ДД (для безопасного сравнения строк) или пусто в конец
    const m = String(s || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "9999-99-99";
  };

  const groups = Array.from(map.values()).sort(
    (a, b) => (toDateKey(a.regDate) > toDateKey(b.regDate) ? 1 : -1)
  );

  groups.forEach((g) => {
    g.basisDocuments.sort((a, b) => {
      const da = toDateKey(a.docDate), db = toDateKey(b.docDate);
      if (da !== db) return da > db ? 1 : -1;
      return a.title.localeCompare(b.title, "ru");
    });
  });

  return groups;
};

const makeBlockId = (prefix, index) => `${prefix}-${index}`;

const getOwnerShareFromData = (owner = {}) => {
  if (owner.share) return owner.share;

  const fromRights = (owner.rights || []).map((right) => right.share).find(Boolean);
  if (fromRights) return fromRights;

  const fromDocs = (owner.documents || []).map((doc) => doc.share).find(Boolean);
  if (fromDocs) return fromDocs;

  return '';
};

const getOwnerFirstRight = (owner = {}) => {
  const rights = Array.isArray(owner.rights) ? owner.rights : [];
  return rights[0] || {};
};

const getOwnerShareDisplayText = ({ ownershipType, share }) => {
  if (ownershipType === 'Собственность') {
    return '1/1 — объект принадлежит правообладателю полностью';
  }

  if (ownershipType === 'Общая совместная собственность') {
    return 'Доли не определены — объект находится в общей совместной собственности';
  }

  return share || '';
};

const mergeRegistrationGroups = (groups = []) => {
  const map = new Map();

  groups.forEach((group) => {
    const regNumber = String(group?.regNumber || '').trim();
    const regDate = group?.regDate || '';
    const key = `${regNumber}|${regDate}`;

    if (!map.has(key)) {
      map.set(key, {
        regNumber,
        regDate,
        basisDocuments: [],
      });
    }

    const target = map.get(key);
    const seenDocs = new Set(
      target.basisDocuments.map((doc) => `${norm(doc.title)}|${norm(doc.docDate)}`)
    );

    (group?.basisDocuments || []).forEach((doc) => {
      const title = doc?.title || '';
      const docDate = doc?.docDate || '';
      const docKey = `${norm(title)}|${norm(docDate)}`;

      if (!title && !docDate) return;
      if (seenDocs.has(docKey)) return;

      seenDocs.add(docKey);
      target.basisDocuments.push({ title, docDate });
    });
  });

  return Array.from(map.values());
};

const normalizeOwnerForBlock = (owner = {}, index = 0) => ({
  ownerIndex: index,
  fullName: owner.fullName || '',
  birthDate: owner.birthDate || '',
  birthPlace: owner.birthPlace || '',
  snils: owner.snils || '',
  passport: owner.passport || {},
});

const emptyEncumbrance = {
  type: 'none',
  subtype: '',
  description: 'Не зарегистрировано',
  rawText: '',
  mortgagee: '',
  beneficiary: '',
  registrationNumber: '',
  registrationDate: '',
  term: '',
  basisDocuments: [],
};

const hasRealEncumbrance = (encumbrance = null) => {
  if (!encumbrance || typeof encumbrance !== 'object') return false;
  if (!encumbrance.type || encumbrance.type === 'none' || encumbrance.type === 'unknown') return false;

  return Boolean(
    encumbrance.registrationNumber ||
    encumbrance.registrationDate ||
    encumbrance.subtype ||
    encumbrance.description ||
    encumbrance.mortgagee ||
    encumbrance.beneficiary ||
    (Array.isArray(encumbrance.basisDocuments) && encumbrance.basisDocuments.length)
  );
};

const getOwnerEncumbrance = ({
  globalEncumbrance,
  ownershipType,
  ownersCount,
  ownerIndex,
  recipientOwnerIndex,
}) => {
  if (!hasRealEncumbrance(globalEncumbrance)) {
    return emptyEncumbrance;
  }

  const isSharedOwnership = ownershipType === 'Общая долевая собственность';

  // В долевой собственности нельзя автоматически подставлять одно найденное
  // обременение всем сособственникам. Если получатель выписки найден среди
  // правообладателей, считаем, что найденное обременение относится к нему.
  if (isSharedOwnership && ownersCount > 1) {
    return recipientOwnerIndex !== null &&
      recipientOwnerIndex !== undefined &&
      Number(recipientOwnerIndex) === Number(ownerIndex)
      ? globalEncumbrance
      : emptyEncumbrance;
  }

  return globalEncumbrance;
};

/**
 * Строит юридические блоки права для мастера маткапитала.
 *
 * Важно:
 * - для "Собственность" обычно один блок;
 * - для "Общая совместная собственность" один общий блок на всех правообладателей;
 * - для "Общая долевая собственность" отдельный блок на каждого правообладателя.
 */
export const toOwnerRightsBlocks = (owners = [], globalEncumbrance = null, options = {}) => {
  const { recipientOwnerIndex = null } = options;
  const list = Array.isArray(owners) ? owners : [];
  if (!list.length) return [];

  const normalizedTypes = Array.from(
    new Set(list.map((owner) => owner?.ownershipType).filter(Boolean))
  );

  const isJoint =
    normalizedTypes.length === 1 &&
    normalizedTypes[0] === 'Общая совместная собственность';

  if (isJoint) {
    const allGroups = list.flatMap((owner) => toUiDocGroups(owner));
    const firstOwner = list[0] || {};
    const firstRight = getOwnerFirstRight(firstOwner);

    return [
      {
        id: 'joint-owners',
        blockType: 'joint',
        title: 'Общая совместная собственность',
        ownerIndex: null,
        owners: list.map(normalizeOwnerForBlock),
        fullName: list.map((owner) => owner.fullName).filter(Boolean).join('\n'),
        ownershipType: 'Общая совместная собственность',
        share: '',
        shareDisplayText: 'Доли не определены — объект находится в общей совместной собственности',
        registrationNumber: firstRight.regNum || firstRight.regNumber || '',
        registrationDate: firstRight.regDate || '',
        registrationGroups: mergeRegistrationGroups(allGroups),
        encumbrance: hasRealEncumbrance(globalEncumbrance)
          ? globalEncumbrance
          : emptyEncumbrance,
      },
    ];
  }

  return list.map((owner, index) => {
    const ownershipType = owner?.ownershipType || '';
    const share = getOwnerShareFromData(owner);
    const firstRight = getOwnerFirstRight(owner);
    const registrationGroups = toUiDocGroups(owner);

    return {
      id: makeBlockId('owner-right', index),
      blockType: ownershipType === 'Общая долевая собственность' ? 'share' : 'single',
      title: owner?.fullName || `Правообладатель ${index + 1}`,
      ownerIndex: index,
      owners: [normalizeOwnerForBlock(owner, index)],
      fullName: owner?.fullName || '',
      ownershipType,
      share: ownershipType === 'Собственность' && !share ? '1/1' : share,
      shareDisplayText: getOwnerShareDisplayText({
        ownershipType,
        share: ownershipType === 'Собственность' && !share ? '1/1' : share,
      }),
      registrationNumber: firstRight.regNum || firstRight.regNumber || '',
      registrationDate: firstRight.regDate || '',
      registrationGroups,
      encumbrance: getOwnerEncumbrance({
        globalEncumbrance,
        ownershipType,
        ownersCount: list.length,
        ownerIndex: index,
        recipientOwnerIndex,
      }),
    };
  });
};

// ----- Проверка суммы долей (для UX-значка "Проверьте сумму долей") -----
const parseShare = (s) => {
  const m = String(s || "").match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? { n: +m[1], d: +m[2] } : null;
};
const gcd = (x, y) => {
  x = Math.abs(x); y = Math.abs(y);
  while (y) [x, y] = [y, x % y];
  return x || 1;
};
const addFrac = (a, b) => {
  const num = a.n * b.d + b.n * a.d, den = a.d * b.d, g = gcd(num, den);
  return { n: num / g, d: den / g };
};

export const computeSharesTotal = (extractedLandlords = []) => {
  const shares = extractedLandlords
    .filter((l) => (l.ownershipType || "") === "Общая долевая собственность")
    .map((l) => {
      const direct = parseShare(l.share);
      if (direct) return direct;
      const fromDocs = (l.documents || []).map((d) => parseShare(d.share)).find(Boolean);
      if (fromDocs) return fromDocs;
      const fromRights = (l.rights || []).map((r) => parseShare(r.share)).find(Boolean);
      return fromRights || null;
    })
    .filter(Boolean);

  if (!shares.length) {
    return {
      total: "",
      numerator: 0,
      denominator: 1,
      isFullObject: false,
      mismatch: false,
      shares: [],
    };
  }

  const total = shares.reduce((acc, f) => (acc ? addFrac(acc, f) : f), null);
  const totalText = total ? `${total.n}/${total.d}` : "";
  const isFullObject = !!(total && total.n === total.d);

  return {
    total: totalText,
    numerator: total?.n || 0,
    denominator: total?.d || 1,
    isFullObject,
    mismatch: !isFullObject,
    shares: shares.map((share) => `${share.n}/${share.d}`),
  };
};

export const computeSharesMismatch = (extractedLandlords = []) => {
  const result = computeSharesTotal(extractedLandlords);
  return result.shares.length ? result.mismatch : false;
};

const buildOwnerRights = (owner = {}) => {
  if (Array.isArray(owner.rights) && owner.rights.length) {
    return owner.rights.map((right) => ({
      regNum: right.regNum || right.regNumber || "",
      regNumber: right.regNumber || right.regNum || "",
      regDate: right.regDate || "",
      ownershipType: right.ownershipType || owner.ownershipType || "",
      share: right.share || owner.share || "",
      documents: right.documents || [],
    }));
  }

  const documents = Array.isArray(owner.documents) ? owner.documents : [];
  const firstDoc = documents[0] || {};
  return [
    {
      regNum: firstDoc.regNum || firstDoc.regNumber || "",
      regNumber: firstDoc.regNumber || firstDoc.regNum || "",
      regDate: firstDoc.regDate || "",
      ownershipType: owner.ownershipType || "",
      share: owner.share || firstDoc.share || "",
      documents,
    },
  ];
};

export const toUiRightsPayload = (owners = []) =>
  (owners || []).flatMap((owner, ownerIndex) =>
    buildOwnerRights(owner).map((right) => ({
      ...right,
      ownerIndex,
      ownerFullName: owner.fullName || "",
    }))
  );

// Advisory-only helper: сопоставление получателя с правообладателем помогает UI подсветить
// вероятного владельца доли, но не является юридически окончательным выводом.
export const matchRecipientToOwner = (recipientName = "", owners = []) => {
  const base = {
    matched: false,
    ambiguous: false,
    matchType: "none",
    recipientName: recipientName || "",
    ownerFullName: "",
    ownerIndex: null,
    ownershipType: "",
    share: "",
    rights: [],
    documents: [],
  };

  if (!recipientName || !Array.isArray(owners) || owners.length === 0) return base;

  const recipientNorm = norm(recipientName);
  const matches = owners
    .map((owner, index) => ({ owner, index }))
    .filter(({ owner }) => norm(owner.fullName || owner.name || "") === recipientNorm);

  if (matches.length !== 1) {
    return {
      ...base,
      ambiguous: matches.length > 1,
    };
  }

  const { owner, index } = matches[0];
  const rights = buildOwnerRights(owner);
  const share = owner.share || rights.map((right) => right.share).find(Boolean) || "";

  return {
    ...base,
    matched: true,
    matchType: owner.birthDate ? "fio_birth" : "fio",
    ownerFullName: owner.fullName || owner.name || "",
    ownerIndex: index,
    ownershipType: owner.ownershipType || rights[0]?.ownershipType || "",
    share,
    rights,
    documents: owner.documents || [],
  };
};

const hasShareLessThanOne = (share = "") => {
  const parsed = parseShare(share);
  return !!(parsed && parsed.n < parsed.d);
};

// Advisory-only helper: классификация нужна только как подсказка мастера. Она не заменяет
// пользовательский выбор и не является окончательной юридической квалификацией объекта.
export const classifyEgrnForMaternityShares = (parsedEgrn = {}) => {
  const terms = parsedEgrn.terms || parsedEgrn.object || parsedEgrn || {};
  const owners = parsedEgrn.extractedLandlords || parsedEgrn.landlords || parsedEgrn.owners || [];
  const rightsPayload = toUiRightsPayload(owners);
  const firstRight = rightsPayload[0] || {};
  const residentialKind = norm(terms.residentialKind || terms.objectName || "");
  const ownershipType = firstRight.ownershipType || owners[0]?.ownershipType || "";
  const recipientMatch = parsedEgrn.recipientOwnerMatch ||
    matchRecipientToOwner(terms.recipientName || parsedEgrn.recipientName || "", owners);
  const shareTotal = computeSharesTotal(owners);

  if (residentialKind.includes("комната")) {
    return {
      suggestedType: "separate_room",
      confidence: "high",
      reason: "В ЕГРН указан вид жилого помещения: комната.",
      alternatives: [],
    };
  }

  if (residentialKind.includes("квартира")) {
    if (/общая долевая собственность/i.test(ownershipType)) {
      const matchedShare = recipientMatch?.share || owners[0]?.share || firstRight.share || "";
      if (shareTotal.isFullObject) {
        return {
          suggestedType: "apartment",
          confidence: "high",
          reason: "В ЕГРН указана квартира, а сумма долей по действующим правам равна целому объекту.",
          alternatives: [],
        };
      }

      if (hasShareLessThanOne(matchedShare)) {
        return {
          suggestedType: "",
          confidence: "manual_required",
          reason: "По выписке видно, что объект оформлен как квартира, а право зарегистрировано как общая долевая собственность. Уточните, что приобреталось с использованием материнского капитала: обычная доля в квартире или комната в коммунальной квартире.",
          alternatives: ["apartment_share", "communal_room_share"],
        };
      }
    }

    if (!/общая долевая собственность/i.test(ownershipType) && /собственность|общая совместная собственность/i.test(ownershipType)) {
      return {
        suggestedType: "apartment",
        confidence: "high",
        reason: "В ЕГРН указана квартира и право собственности без доли отдельного помещения.",
        alternatives: [],
      };
    }
  }

  return {
    suggestedType: "",
    confidence: "manual_required",
    reason: "По данным ЕГРН не удалось надёжно определить тип приобретения. Выберите вариант вручную.",
    alternatives: ["apartment", "apartment_share", "communal_room_share", "separate_room"],
  };
};
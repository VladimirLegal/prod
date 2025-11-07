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

export const computeSharesMismatch = (extractedLandlords = []) => {
  const perOwner = extractedLandlords
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

  if (!perOwner.length) return false;
  const total = perOwner.reduce((acc, f) => (acc ? addFrac(acc, f) : f), null);
  return !(total && total.n === total.d); // true => есть несоответствие
};

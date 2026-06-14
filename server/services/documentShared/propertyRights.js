function defaultEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function insertShareWord(title) {
  const t = String(title || '').trim();
  // Уже содержит "дол" сразу после дроби — не трогаем
  if (/^\d+\s*\/\s*\d+\s+дол/i.test(t)) return t;

  const m = t.match(/^(\d+\s*\/\s*\d+)\s*,\s*(.+)$/);
  if (!m) return t;

  const share = m[1].replace(/\s*/g, ''); // "7/10"
  const rest = m[2]; // "Договор ..."
  return `${share} доли, ${rest}`;
}

function normalizeBasisTitle(title) {
  return insertShareWord(title);
}

function cleanDate(value, formatDate) {
  if (!value) return '';
  const formatted = typeof formatDate === 'function' ? formatDate(value) : value;
  return String(formatted || '').trim();
}

function buildBasisDocumentLine(document = {}, options = {}) {
  const escapeHtml = options.escapeHtml || defaultEscapeHtml;
  const formatDate = options.formatDate;
  const title = normalizeBasisTitle(document.title || document.name || '');
  let line = `• ${escapeHtml(title)}`;
  const documentDate = cleanDate(document.date || document.docDate, formatDate);
  if (documentDate) line += `, от ${escapeHtml(documentDate)}`;
  return line;
}

function buildEgrnRegistrationLine(group = {}, options = {}) {
  const escapeHtml = options.escapeHtml || defaultEscapeHtml;
  const formatDate = options.formatDate;
  const registrationDate = cleanDate(group.registrationDate || group.regDate, formatDate);
  const registrationNumber = String(group.registrationNumber || group.regNumber || '').trim();

  if (!registrationDate && !registrationNumber) return '';

  let line = 'о чём в Едином государственном реестре недвижимости сделана запись о государственной регистрации права';
  if (registrationDate) line += ` от ${escapeHtml(registrationDate)}`;
  if (registrationNumber) line += `, номер записи: ${escapeHtml(registrationNumber)}`;
  return line;
}

function getDocumentGroups(holder = {}) {
  if (Array.isArray(holder.documentGroups)) return holder.documentGroups;
  if (Array.isArray(holder.documents)) return holder.documents;
  return [];
}

function buildPropertyRightsBlockHtml(rightHolders, options = {}) {
  const holders = Array.isArray(rightHolders) ? rightHolders : [];
  if (!holders.length) return '';

  const escapeHtml = options.escapeHtml || defaultEscapeHtml;
  const many = holders.length > 1;
  const parts = [];

  holders.forEach((holder, holderIndex) => {
    const groups = getDocumentGroups(holder);

    if (many && holder.label) {
      parts.push(`<p>— ${escapeHtml(holder.label)}:</p>`);
    }

    const distinctRegs = new Set();
    for (const group of groups) {
      const key = `${group?.registrationDate || group?.regDate || ''}|${group?.registrationNumber || group?.regNumber || ''}`;
      if (key !== '|') distinctRegs.add(key);
    }

    const perGroupEgrn = distinctRegs.size > 1;

    if (perGroupEgrn) {
      groups.forEach((group, groupIndex) => {
        const documents = Array.isArray(group?.basisDocuments) ? group.basisDocuments : [];

        documents.forEach((document, documentIndex) => {
          const isLastDocInGroup = documentIndex === documents.length - 1;
          const tail = isLastDocInGroup ? ',' : ';';
          parts.push(`<p>${buildBasisDocumentLine(document, options)}${tail}</p>`);
        });

        const egrnLine = buildEgrnRegistrationLine(group, options);
        if (egrnLine) {
          const isLastGroup = groupIndex === groups.length - 1 && holderIndex === holders.length - 1;
          parts.push(`<p>${egrnLine}${isLastGroup ? '.' : ';'}</p>`);
        }
      });

      return;
    }

    const flat = [];
    groups.forEach(group => {
      const documents = Array.isArray(group?.basisDocuments) ? group.basisDocuments : [];
      documents.forEach(document => flat.push({ document, group }));
    });

    flat.forEach((item, index) => {
      const isLastDocOfHolder = index === flat.length - 1;
      parts.push(`<p>${buildBasisDocumentLine(item.document, options)}${isLastDocOfHolder ? ',' : ';'}</p>`);
    });

    let registrationDate = holder?.registrationDate || holder?.regDate;
    let registrationNumber = holder?.registrationNumber || holder?.regNumber;
    if (!registrationDate || !registrationNumber) {
      for (let i = groups.length - 1; i >= 0; i--) {
        const group = groups[i];
        if (!registrationDate) registrationDate = group?.registrationDate || group?.regDate;
        if (!registrationNumber) registrationNumber = group?.registrationNumber || group?.regNumber;
        if (registrationDate || registrationNumber) break;
      }
    }

    const egrnLine = buildEgrnRegistrationLine({ registrationDate, registrationNumber }, options);
    if (egrnLine) {
      const isLastHolder = holderIndex === holders.length - 1;
      parts.push(`<p>${egrnLine}${isLastHolder ? '.' : ';'}</p>`);
    }
  });

  return parts.join('\n');
}

module.exports = {
  insertShareWord,
  normalizeBasisTitle,
  buildBasisDocumentLine,
  buildEgrnRegistrationLine,
  buildPropertyRightsBlockHtml,
};

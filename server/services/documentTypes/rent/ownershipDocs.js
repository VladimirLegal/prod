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

module.exports = {
  insertShareWord,
};
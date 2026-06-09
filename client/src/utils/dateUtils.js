const formatNumericDisplayDate = (value = "") => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);

  return [dd, mm, yyyy].filter(Boolean).join(".");
};

export const toDisplayDate = (value = "") => {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return formatNumericDisplayDate(text);
};

export const parseDateParts = (value = "") => {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (match)
    return {
      day: Number(match[1]),
      month: Number(match[2]),
      year: Number(match[3]),
    };
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match)
    return {
      day: Number(match[3]),
      month: Number(match[2]),
      year: Number(match[1]),
    };
  return null;
};

export const toDate = (value = "") => {
  const parts = parseDateParts(value);
  if (!parts) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() + 1 !== parts.month ||
    date.getDate() !== parts.day
  ) {
    return null;
  }
  return date;
};

export const calculateAgeOnDate = (birthDate, targetDate) => {
  const birth = toDate(birthDate);
  const date = toDate(targetDate);
  if (!birth || !date) return null;
  let age = date.getFullYear() - birth.getFullYear();
  const monthDelta = date.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && date.getDate() < birth.getDate()))
    age -= 1;
  return age;
};

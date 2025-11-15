const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateTimeSecondsFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const dayMonthFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });

function toDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === 'number') return new Date(value);
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatDateTime(value) {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : '—';
}

export function formatDateTimeWithSeconds(value) {
  const date = toDate(value);
  return date ? dateTimeSecondsFormatter.format(date) : '—';
}

export function formatDay(value) {
  const date = toDate(value);
  return date ? dayMonthFormatter.format(date) : '';
}

export function formatRelativeTime(value) {
  const date = toDate(value);
  if (!date) return '';
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 60) {
    return relativeTimeFormatter.format(diffSeconds, 'second');
  }
  if (abs < 3600) {
    return relativeTimeFormatter.format(Math.round(diffSeconds / 60), 'minute');
  }
  if (abs < 86400) {
    return relativeTimeFormatter.format(Math.round(diffSeconds / 3600), 'hour');
  }
  if (abs < 604800) {
    return relativeTimeFormatter.format(Math.round(diffSeconds / 86400), 'day');
  }
  return relativeTimeFormatter.format(Math.round(diffSeconds / 604800), 'week');
}

export function startOfDay(value = new Date()) {
  const date = toDate(value) || new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function subtractDays(value, amount) {
  const date = toDate(value) || new Date();
  date.setDate(date.getDate() - amount);
  return date;
}

export function isSameDay(a, b) {
  const dateA = toDate(a);
  const dateB = toDate(b);
  if (!dateA || !dateB) return false;
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

export function isAfter(value, comparison) {
  const date = toDate(value);
  const compareTo = toDate(comparison);
  if (!date || !compareTo) return false;
  return date.getTime() > compareTo.getTime();
}

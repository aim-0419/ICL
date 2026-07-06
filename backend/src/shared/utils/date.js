function toDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseDateFromYmd(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function addDays(value, days) {
  const date = toDate(value);
  if (!date) return null;
  date.setDate(date.getDate() + Number(days || 0));
  return date;
}

export function getMondayStart(value) {
  const date = toDate(value) || new Date();
  date.setHours(0, 0, 0, 0);

  const weekday = date.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + diff);
  return date;
}

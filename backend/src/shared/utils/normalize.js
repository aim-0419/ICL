export function toSafeAmount(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value ?? "")
    .replace(/[,\s원₩]/g, "")
    .trim();
  if (!normalized) return 0;

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function normalizeBirthYear(value) {
  const year = Number.parseInt(String(value ?? "").trim(), 10);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) return null;
  return year;
}

export function normalizeAgeGroup(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const numeric = Number.parseInt(text.replace(/[^\d]/g, ""), 10);
  if (Number.isInteger(numeric) && numeric >= 10 && numeric < 100) {
    return `${Math.floor(numeric / 10) * 10}대`;
  }

  const lower = text.toLowerCase();
  if (["unknown", "none", "기타", "미상"].includes(lower)) return "미상";
  return "";
}

export function resolveAgeGroupByBirthYear(value) {
  const birthYear = normalizeBirthYear(value);
  if (!birthYear) return "";

  const age = new Date().getFullYear() - birthYear + 1;
  if (age < 10 || age >= 100) return "미상";
  return `${Math.floor(age / 10) * 10}대`;
}

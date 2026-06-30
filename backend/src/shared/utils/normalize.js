// 파일 역할: 숫자·나이·생년 등 데이터 정규화에 필요한 공통 유틸 함수를 제공합니다.

// pii.js의 normalizeBirthYear(string 반환)와 달리, DB 저장용으로 number|null을 반환합니다.
export function normalizeBirthYear(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const year = Number.parseInt(text, 10);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) return null;

  return year;
}

export function normalizeAgeGroup(value) {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  if (!text) return "";

  if (text.includes("10")) return "10대 이하";
  if (text.includes("20")) return "20대";
  if (text.includes("30")) return "30대";
  if (text.includes("40")) return "40대";
  if (text.includes("50")) return "50대";
  if (text.includes("60") || text.includes("70") || text.includes("80") || text.includes("90")) {
    return "60대 이상";
  }

  return "";
}

export function resolveAgeGroupByBirthYear(birthYear) {
  const year = normalizeBirthYear(birthYear);
  if (!year) return "";

  const age = Math.max(0, new Date().getFullYear() - year);
  if (age <= 19) return "10대 이하";
  if (age <= 29) return "20대";
  if (age <= 39) return "30대";
  if (age <= 49) return "40대";
  if (age <= 59) return "50대";
  return "60대 이상";
}

// payments/admin에서 쓰는 기본 금액 변환 (음수·소수 허용).
// refunds.service.js의 toAmount (Math.max(0, Math.round) 버전)와 다릅니다.
export function toSafeAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

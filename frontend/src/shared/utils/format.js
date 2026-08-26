/**
 * [공통 유틸] 날짜·금액·시간을 화면에 보여줄 수 있는 문자열로 변환하는 함수 모음입니다.
 * 여러 페이지에서 동일한 변환 로직이 반복되는 것을 막기 위해 이 파일 하나에 모아두었습니다.
 * 사용법: import { formatDate, formatDateTime, formatCurrency } from "../shared/utils/format.js"
 */

/**
 * 날짜·시간 값을 "2025. 6. 2. 오후 3:20:00" 형식으로 변환합니다.
 * - value가 없거나 잘못된 값이면 "-"를 반환합니다.
 * - MySQL의 "2025-06-02 15:20:00" 형식도 처리할 수 있습니다.
 * @param {string|Date} value - 변환할 날짜·시간 값
 * @returns {string} 화면에 표시할 날짜·시간 문자열
 */
export function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

/**
 * 날짜 값을 "2025. 6. 2." 형식(날짜만)으로 변환합니다.
 * - value가 없거나 잘못된 값이면 "-"를 반환합니다.
 * @param {string|Date} value - 변환할 날짜 값
 * @returns {string} 화면에 표시할 날짜 문자열
 */
export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR");
}

/**
 * 날짜 값을 "2025년 6월 2일" 형식의 수료증용 날짜로 변환합니다.
 * @param {string|Date} value - 변환할 날짜 값
 * @returns {string} 수료증에 표시할 날짜 문자열
 */
export function formatCertificateDate(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * 날짜 값을 "YYYY-MM-DD" 형식(연-월-일)으로 변환합니다.
 * @param {string|Date} value - 변환할 날짜 값
 * @returns {string} YYYY-MM-DD 형식 문자열
 */
export function formatYmd(value) {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 날짜 값을 "YYYY-MM-DD HH:MM" 형식으로 변환합니다.
 * @param {string|Date} value - 변환할 날짜·시간 값
 * @returns {string} YYYY-MM-DD HH:MM 형식 문자열
 */
// [현재 미사용] 날짜와 시간을 짧게 표기합니다. 현재 사용하는 화면이 없습니다.
export function formatDateTimeCompact(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}

/**
 * 금액을 "₩1,000" 형식으로 변환합니다.
 * - 숫자가 아닌 값이 들어오면 "-"를 반환합니다.
 * @param {number|string} value - 변환할 금액
 * @returns {string} ₩ 기호가 붙은 한국 금액 문자열
 */
export function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `₩${num.toLocaleString("ko-KR")}`;
}

/**
 * 금액을 Intl.NumberFormat 방식의 "₩1,000" 형식으로 변환합니다.
 * formatCurrency와 결과는 동일하며, 표준 API 방식을 사용합니다.
 * @param {number} amount - 변환할 금액
 * @returns {string} 한국 원화 형식 문자열
 */
// [현재 미사용] 금액을 원화 표기로 바꿉니다. 현재 사용하는 화면이 없습니다.
export function formatCurrencyKRW(amount) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * 초(second) 단위 재생 시간을 "1시간 30분" 또는 "45분" 형식으로 변환합니다.
 * - 강의 영상 길이 표시에 사용합니다.
 * @param {number} sec - 초 단위 시간
 * @returns {string} 시간·분 형식 문자열
 */
export function formatDuration(sec) {
  const total = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

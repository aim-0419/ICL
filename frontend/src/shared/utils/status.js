/**
 * [공통 유틸] 환불·예약·결제 등의 상태(status) 값을 화면에 표시할 한글 이름과 CSS 클래스로 변환하는 함수 모음입니다.
 * 상태 표시 로직이 여러 페이지에서 중복되는 것을 방지하기 위해 한 곳에 모아두었습니다.
 */

// ─── 주문 환불 상태 ────────────────────────────────────────────────────────────

/**
 * 주문 환불 상태 코드를 화면에 표시할 한글 이름으로 변환합니다.
 * - pending  → "검토 중"  (관리자가 아직 처리하지 않은 상태)
 * - approved → "환불 완료" (환불이 승인·완료된 상태)
 * - rejected → "거절됨"   (환불 요청이 거절된 상태)
 * @param {string} status - 상태 코드
 * @returns {string} 한글 상태 이름
 */
export function getRefundStatusLabel(status) {
  const map = { pending: "검토 중", approved: "환불 완료", rejected: "거절됨" };
  return map[status] || status || "-";
}

/**
 * 주문 환불 상태 코드를 CSS 클래스 문자열로 변환합니다.
 * - 반환된 클래스를 className에 그대로 사용하면 됩니다.
 * @param {string} status - 상태 코드
 * @returns {string} CSS 클래스 문자열
 */
export function getRefundStatusClass(status) {
  const map = {
    pending: "refund-status pending",
    approved: "refund-status approved",
    rejected: "refund-status rejected",
  };
  return map[status] || "refund-status pending";
}

// ─── 수강권 환불 상태 ───────────────────────────────────────────────────────────

/**
 * 수강권 환불 상태 코드를 한글 이름으로 변환합니다.
 * - requested → "검토 중"
 * - approved  → "환불 완료"
 * - rejected  → "거절됨"
 * @param {string} status - 상태 코드
 * @returns {string} 한글 상태 이름
 */
export function getPassRefundStatusLabel(status) {
  const map = { requested: "검토 중", approved: "환불 완료", rejected: "거절됨" };
  return map[status] || status || "-";
}

// ─── 예약 상태 ─────────────────────────────────────────────────────────────────

/**
 * 수업 예약 상태 코드를 한글 이름으로 변환합니다.
 * - reserved   → "예약 완료"
 * - waitlisted → "대기 중"
 * - cancelled  → "취소됨"
 * @param {string} status - 상태 코드
 * @returns {string} 한글 상태 이름
 */
export function getBookingStatusLabel(status) {
  const map = { reserved: "예약 완료", waitlisted: "대기 중", cancelled: "취소됨" };
  return map[status] || status || "-";
}

// ─── 결제 상태 ─────────────────────────────────────────────────────────────────

/**
 * 결제 상태 코드를 한글 이름으로 변환합니다.
 * - paid     → "결제 완료"
 * - refunded → "환불 완료"
 * - partial  → "부분 환불"
 * - pending  → "결제 대기"
 * @param {string} status - 상태 코드
 * @returns {string} 한글 상태 이름
 */
export function getPaymentStatusLabel(status) {
  const map = {
    paid: "결제 완료",
    refunded: "환불 완료",
    partial: "부분 환불",
    pending: "결제 대기",
  };
  return map[status] || status || "-";
}

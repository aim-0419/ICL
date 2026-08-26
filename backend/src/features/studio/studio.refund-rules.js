/**
 * [수강권 환불 규칙]
 *
 * 환불 요청 내용이 올바른지 검사하고 저장할 수 있는 형태로 정리합니다.
 * 환불 사유가 없거나 금액이 음수이면 받아들이지 않습니다.
 */
function createRuleError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeId(value, label) {
  const id = String(value || "").trim();
  if (!id) throw createRuleError(`${label} 정보가 필요합니다.`);
  return id;
}

export function normalizePassRefundRequest(payload = {}) {
  const refundAmount = Math.floor(Number(payload.refundAmount ?? payload.amount ?? 0));
  if (!Number.isFinite(refundAmount) || refundAmount < 0) {
    throw createRuleError("환불 금액은 0원 이상이어야 합니다.");
  }
  const reason = String(payload.reason || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  if (!reason) {
    throw createRuleError("환불 사유를 입력해 주세요.");
  }

  return {
    passId: normalizeId(payload.passId ?? payload.pass_id, "수강권"),
    userId: normalizeId(payload.userId ?? payload.user_id, "회원"),
    refundAmount,
    reason,
  };
}

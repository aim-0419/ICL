function createValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = "INVALID_REFUND_REQUEST";
  return error;
}

/** 회원의 수강권 환불 요청값을 저장 가능한 형태로 검증하고 정리합니다. */
export function normalizePassRefundRequest(payload = {}) {
  const userId = String(payload.userId || "").trim();
  const passId = String(payload.passId || "").trim();
  const reason = String(payload.reason || "").trim();
  const refundAmount = Number(payload.refundAmount || 0);

  if (!userId) throw createValidationError("로그인 회원 정보를 확인할 수 없습니다.");
  if (!passId) throw createValidationError("환불할 수강권을 선택해 주세요.");
  if (!reason) throw createValidationError("환불 사유를 입력해 주세요.");
  if (reason.length > 1000) throw createValidationError("환불 사유는 1,000자 이하로 입력해 주세요.");
  if (!Number.isFinite(refundAmount) || refundAmount < 0) {
    throw createValidationError("환불 요청 금액이 올바르지 않습니다.");
  }

  return {
    userId,
    passId,
    reason,
    refundAmount: Math.floor(refundAmount),
  };
}

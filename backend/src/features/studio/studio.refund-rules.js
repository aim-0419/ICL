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
  const refundAmount = Math.max(0, Math.round(Number(payload.refundAmount ?? payload.amount ?? 0) || 0));
  const reason = String(payload.reason || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  return {
    passId: normalizeId(payload.passId ?? payload.pass_id, "수강권"),
    userId: normalizeId(payload.userId ?? payload.user_id, "회원"),
    refundAmount,
    reason,
  };
}

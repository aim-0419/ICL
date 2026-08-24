// 파일 역할: 수강권 환불 요청값 검증과 법정 환급액 산정을 담당합니다.
//
// 수강권은 방문판매법상 계속거래여서 소비자가 언제든 해지할 수 있고,
// 공정거래위원회 「계속거래 등의 해지·해제에 따른 위약금 및 대금의 환급에 관한 산정기준」
// 고시가 요가·필라테스업에 적용됩니다. 이 고시는 위약금을 총 계약 대금의 10%로 제한합니다.
// "환불 불가"나 "위약금 30%" 같은 약관은 무효로 판단될 수 있어 계산을 코드로 고정합니다.

// 위약금 상한 비율. 해지 시기나 서비스 개시 여부와 무관하게 총액의 10%를 넘을 수 없습니다.
export const PASS_CANCELLATION_PENALTY_RATE = 0.1;

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

// 함수 역할: 수강권 해지 시 환급액을 법정 기준으로 계산합니다.
//
// 환급액 = 총 결제금액 − 실제 이용분 − 위약금(총액의 10% 이내)
//
// 실제 이용분은 횟수제면 사용 횟수 비율로, 기간제면 경과 일수 비율로 봅니다.
// 두 정보가 모두 있으면 횟수를 기준으로 삼습니다. 회차 차감이 실제 이용을 더 정확히 반영하기 때문입니다.
//
// 폐업이나 강사 이탈처럼 사업자 귀책으로 해지되면 위약금을 물릴 수 없으므로
// businessFault 를 켜면 위약금이 0이 됩니다.
export function calculatePassRefundAmount({
  totalAmount,
  totalCount = 0,
  remainingCount = 0,
  validDays = 0,
  elapsedDays = 0,
  businessFault = false,
} = {}) {
  const paid = Math.max(0, Math.floor(Number(totalAmount) || 0));
  if (paid === 0) {
    return { refundAmount: 0, usedAmount: 0, penaltyAmount: 0, basis: "none" };
  }

  const counts = Math.max(0, Math.floor(Number(totalCount) || 0));
  const remaining = Math.min(counts, Math.max(0, Math.floor(Number(remainingCount) || 0)));
  const days = Math.max(0, Math.floor(Number(validDays) || 0));
  const elapsed = Math.max(0, Math.floor(Number(elapsedDays) || 0));

  let usedAmount = 0;
  let basis = "none";
  if (counts > 0) {
    basis = "count";
    usedAmount = Math.floor((paid * (counts - remaining)) / counts);
  } else if (days > 0) {
    basis = "period";
    usedAmount = Math.floor((paid * Math.min(elapsed, days)) / days);
  }
  usedAmount = Math.min(paid, usedAmount);

  const remainingAmount = paid - usedAmount;
  // 위약금은 총액 기준으로 계산하되, 남은 금액을 넘어 청구할 수는 없습니다.
  const penaltyAmount = businessFault
    ? 0
    : Math.min(remainingAmount, Math.floor(paid * PASS_CANCELLATION_PENALTY_RATE));

  return {
    refundAmount: Math.max(0, remainingAmount - penaltyAmount),
    usedAmount,
    penaltyAmount,
    basis,
  };
}

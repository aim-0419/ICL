// 파일 역할: 결제 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { env } from "../../config/env.js";

// 함수 역할: 금액 number 값으로 안전하게 변환합니다.
function toAmountNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// 함수 역할: paid 금액에서 필요한 항목만 골라냅니다.
function pickPaidAmount(portonePayment) {
  // PortOne 응답 구조 변화에 대비해 amount 필드를 유연하게 파싱
  const candidates = [
    portonePayment?.amount?.total,
    portonePayment?.amount?.paid,
    portonePayment?.amount,
    portonePayment?.paidAmount,
  ];
  return candidates.map(toAmountNumber).find((amount) => amount > 0) || 0;
}

// 함수 역할: status에서 필요한 항목만 골라냅니다.
function pickStatus(portonePayment) {
  return (
    portonePayment?.status ||
    portonePayment?.paymentStatus ||
    portonePayment?.transactionStatus ||
    ""
  );
}

// 함수 역할: portone 결제 데이터를 조회해 호출자에게 반환합니다.
async function getPortonePayment(paymentId) {
  if (!env.portoneApiSecret) {
    const error = new Error("PORTONE_API_SECRET 값이 설정되지 않았습니다.");
    error.status = 500;
    throw error;
  }

  const response = await fetch(
    `${env.portoneApiBaseUrl.replace(/\/$/, "")}/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `PortOne ${env.portoneApiSecret}`,
      },
    }
  );

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body?.message || "PortOne 결제 조회에 실패했습니다.");
    error.status = response.status || 502;
    throw error;
  }

  return body?.payment ?? body;
}

// 함수 역할: confirmPayment 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function confirmPayment(payload) {
  const paymentId = String(payload?.paymentId || "");
  const orderId = String(payload?.orderId || "");
  const requestedAmount = toAmountNumber(payload?.amount);

  if (!paymentId || !orderId || requestedAmount <= 0) {
    const error = new Error("결제 검증에 필요한 paymentId/orderId/amount 값이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const payment = await getPortonePayment(paymentId);
  const paidAmount = pickPaidAmount(payment);
  const status = pickStatus(payment);

  if (paidAmount !== requestedAmount) {
    const error = new Error(
      `결제 금액 검증 실패: 요청금액(${requestedAmount})과 승인금액(${paidAmount})이 다릅니다.`
    );
    error.status = 400;
    throw error;
  }

  if (String(status).toUpperCase() !== "PAID") {
    const error = new Error(`결제 상태가 완료가 아닙니다. 현재 상태: ${status || "UNKNOWN"}`);
    error.status = 400;
    throw error;
  }

  return {
    approved: true,
    approvedAt: new Date().toISOString(),
    paymentId,
    orderId,
    amount: paidAmount,
    status,
  };
}

// 함수 역할: portone 결제 권한이 있는지 참/거짓으로 판별합니다.
export async function cancelPortonePayment(paymentId, reason, cancelAmount = null) {
  if (!env.portoneApiSecret) {
    const error = new Error("PORTONE_API_SECRET 값이 설정되지 않았습니다.");
    error.status = 500;
    throw error;
  }

  const body = { reason: reason || "고객 요청 환불" };
  if (cancelAmount != null && cancelAmount > 0) {
    body.amount = Math.round(cancelAmount);
  }

  const response = await fetch(
    `${env.portoneApiBaseUrl.replace(/\/$/, "")}/payments/${encodeURIComponent(paymentId)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `PortOne ${env.portoneApiSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const resBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(resBody?.message || "PortOne 결제 취소에 실패했습니다.");
    error.status = response.status || 502;
    throw error;
  }

  return resBody;
}

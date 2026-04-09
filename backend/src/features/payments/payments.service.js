import { env } from "../../config/env.js";

function toAmountNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

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

function pickStatus(portonePayment) {
  return (
    portonePayment?.status ||
    portonePayment?.paymentStatus ||
    portonePayment?.transactionStatus ||
    ""
  );
}

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

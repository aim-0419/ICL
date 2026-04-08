const DEFAULT_PAYMENT_CONFIG = {
  clientKey: "test_ck_your_client_key",
  successUrl: `${window.location.origin}/success`,
  failUrl: `${window.location.origin}/fail`,
};

function getPaymentConfig() {
  return {
    ...DEFAULT_PAYMENT_CONFIG,
    ...(window.PILATES_PAYMENT_CONFIG || {}),
  };
}

function mapPaymentMethod(method) {
  if (method === "card") return "카드";
  if (method === "transfer") return "가상계좌";
  return "카드";
}

export async function requestExternalPayment({ orderPayload, paymentMethod }) {
  const config = getPaymentConfig();

  // Priority 1: custom external adapter
  // window.PILATES_EXTERNAL_PAYMENT_API.requestPayment(payload) 를 붙이면
  // 프론트 코드 수정 없이 외부 결제 API로 연결할 수 있습니다.
  if (
    window.PILATES_EXTERNAL_PAYMENT_API &&
    typeof window.PILATES_EXTERNAL_PAYMENT_API.requestPayment === "function"
  ) {
    const result = await window.PILATES_EXTERNAL_PAYMENT_API.requestPayment({
      ...orderPayload,
      paymentMethod,
      successUrl: config.successUrl,
      failUrl: config.failUrl,
    });

    if (result?.redirectUrl) {
      window.location.href = result.redirectUrl;
      return { type: "external_redirect" };
    }

    if (result?.status === "fail") {
      return {
        type: "fail",
        code: result.code || "EXTERNAL_FAIL",
        message: result.message || "외부 결제 API에서 실패 응답을 반환했습니다.",
      };
    }

    return { type: "success", paymentKey: result?.paymentKey || "" };
  }

  // Priority 2: Toss Payments
  if (
    typeof window.TossPayments === "function" &&
    config.clientKey &&
    config.clientKey !== "test_ck_your_client_key"
  ) {
    const tossPayments = window.TossPayments(config.clientKey);
    await tossPayments.requestPayment(mapPaymentMethod(paymentMethod), {
      amount: orderPayload.amount,
      orderId: orderPayload.orderId,
      orderName: orderPayload.orderName,
      customerName: orderPayload.customerName,
      customerEmail: orderPayload.customerEmail,
      customerMobilePhone: orderPayload.customerPhone,
      successUrl: config.successUrl,
      failUrl: config.failUrl,
    });
    return { type: "external_redirect" };
  }

  // Priority 3: local demo fallback
  return { type: "mock_success" };
}

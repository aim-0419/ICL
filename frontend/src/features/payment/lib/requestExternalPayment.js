// 파일 역할: 외부 결제 SDK 호출과 백엔드 결제 승인 연결을 담당합니다.
import { requestPayment } from "@portone/browser-sdk/v2";

const DEFAULT_PAYMENT_CONFIG = {
  provider: "portone-v2",
  storeId: "",
  channelKey: "",
  successUrl: `${window.location.origin}/success`,
  failUrl: `${window.location.origin}/fail`,
  approvalApiUrl: `${window.location.origin}/api/payments/confirm`,
};

// 함수 역할: 브라우저 전역 설정에서 결제 SDK에 필요한 채널키와 상점 정보를 읽습니다.
function getPaymentConfig() {
  return {
    ...DEFAULT_PAYMENT_CONFIG,
    ...(window.PILATES_PAYMENT_CONFIG || {}),
  };
}

// 함수 역할: 결제 수단 값을 다른 표현 형식으로 매핑합니다.
function mapPaymentMethod(method) {
  if (method === "transfer") {
    return { payMethod: "TRANSFER" };
  }

  if (method === "naverpay") {
    return {
      payMethod: "EASY_PAY",
      easyPay: {
        easyPayProvider: "NAVERPAY",
      },
    };
  }

  if (method === "tosspay") {
    return {
      payMethod: "EASY_PAY",
      easyPay: {
        easyPayProvider: "TOSSPAY",
      },
    };
  }

  return { payMethod: "CARD" };
}

// 함수 역할: 결제 성공 정보를 백엔드 승인 API로 보내 최종 주문 처리를 완료합니다.
async function confirmByBackend({ approvalApiUrl, paymentId, orderId, amount }) {
  const response = await fetch(approvalApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentId, orderId, amount }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      type: "fail",
      code: body?.code || "PAYMENT_CONFIRM_FAIL",
      message: body?.message || "결제 검증에 실패했습니다.",
    };
  }

  if (!body?.approved) {
    return {
      type: "fail",
      code: "PAYMENT_NOT_APPROVED",
      message: "결제 승인 상태를 확인하지 못했습니다.",
    };
  }

  return {
    type: "success",
    paymentId,
  };
}

// 함수 역할: 외부 결제창을 열고 성공 시 백엔드 승인 API까지 호출합니다.
export async function requestExternalPayment({ orderPayload, paymentMethod }) {
  const config = getPaymentConfig();

  if (config.provider !== "portone-v2") {
    return {
      type: "fail",
      code: "UNSUPPORTED_PROVIDER",
      message: "현재 결제 설정은 PortOne V2 전용입니다.",
    };
  }

  if (!config.storeId || !config.channelKey) {
    return {
      type: "fail",
      code: "PAYMENT_CONFIG_MISSING",
      message: "storeId 또는 channelKey가 설정되지 않았습니다.",
    };
  }

  try {
    const paymentResponse = await requestPayment({
      storeId: config.storeId,
      channelKey: config.channelKey,
      paymentId: orderPayload.orderId,
      orderName: orderPayload.orderName,
      totalAmount: Number(orderPayload.amount),
      currency: "KRW",
      customer: {
        fullName: orderPayload.customerName || "회원",
        email: orderPayload.customerEmail || undefined,
        phoneNumber: orderPayload.customerPhone || undefined,
      },
      redirectUrl: config.successUrl,
      ...mapPaymentMethod(paymentMethod),
    });

    // 모바일 리다이렉트 결제의 경우 SDK가 화면 이동을 수행한 뒤 반환값이 없을 수 있습니다.
    if (!paymentResponse) {
      return { type: "external_redirect" };
    }

    if (paymentResponse.code) {
      return {
        type: "fail",
        code: paymentResponse.code,
        message: paymentResponse.message || "결제 요청이 실패했습니다.",
      };
    }

    const paymentId = paymentResponse.paymentId || orderPayload.orderId;

    return confirmByBackend({
      approvalApiUrl: config.approvalApiUrl,
      paymentId,
      orderId: orderPayload.orderId,
      amount: orderPayload.amount,
    });
  } catch (error) {
    return {
      type: "fail",
      code: "PAYMENT_REQUEST_EXCEPTION",
      message: error?.message || "결제 요청 중 오류가 발생했습니다.",
    };
  }
}

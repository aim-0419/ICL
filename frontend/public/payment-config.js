// 파일 역할: 브라우저에서 결제 SDK가 읽을 포트원 결제 설정값을 제공합니다.
window.PILATES_PAYMENT_CONFIG = {
  provider: "portone-v2",
  storeId: "store-cf6f0a71-5c2a-46f8-bbff-f9a49d023872",
  channelKey: "channel-key-36ab093f-936b-45b4-ba9c-a64f0d233098",
  successUrl: `${window.location.origin}/success`,
  failUrl: `${window.location.origin}/fail`,
  approvalApiUrl: `${window.location.origin}/api/payments/confirm`,
};

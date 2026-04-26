// 파일 역할: 배포 환경에 맞게 복사해 쓰는 결제 설정 예시를 제공합니다.
window.PILATES_PAYMENT_CONFIG = {
  provider: "portone-v2",
  storeId: "store-your-store-id",
  channelKey: "channel-key-your-channel-key",
  successUrl: `${window.location.origin}/success`,
  failUrl: `${window.location.origin}/fail`,
  approvalApiUrl: `${window.location.origin}/api/payments/confirm`,
};

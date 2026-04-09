window.PILATES_PAYMENT_CONFIG = {
  provider: "portone-v2",
  storeId: "store-your-store-id",
  channelKey: "channel-key-your-channel-key",
  successUrl: `${window.location.origin}/success`,
  failUrl: `${window.location.origin}/fail`,
  approvalApiUrl: `${window.location.origin}/api/payments/confirm`,
};

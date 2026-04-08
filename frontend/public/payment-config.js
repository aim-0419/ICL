window.PILATES_PAYMENT_CONFIG = {
  clientKey: "test_ck_your_client_key",
  successUrl: `${window.location.origin}/success`,
  failUrl: `${window.location.origin}/fail`,
  approvalApiUrl: "https://your-domain.com/api/payments/confirm",
};

// Optional external payment adapter
// 아래 객체를 실제 API 호출 코드로 바꾸면 Cart 페이지에서 바로 사용됩니다.
// window.PILATES_EXTERNAL_PAYMENT_API = {
//   async requestPayment(payload) {
//     // return {
//     //   status: "success",
//     //   paymentKey: "pay_xxx",
//     // };
//     // or redirect:
//     // return { redirectUrl: "https://external-gateway.example/checkout/..." };
//   },
// };

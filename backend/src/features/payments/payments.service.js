export function confirmPayment(payload) {
  return {
    approved: true,
    approvedAt: new Date().toISOString(),
    ...payload,
  };
}

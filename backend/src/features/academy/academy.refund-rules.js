// 파일 역할: 교육영상(디지털 콘텐츠) 환불액을 전자상거래법 기준으로 계산합니다.
//
// 전자상거래법 제17조 제2항 제5호는 디지털콘텐츠 제공이 개시되면 청약철회를 제한하지만,
// 가분적 콘텐츠는 제공이 개시되지 않은 부분에 대해 청약철회를 인정합니다.
// 강의가 회차로 나뉘면 미시청 회차는 환불 대상이므로 "1강 봤으니 전액 불가"는 성립하지 않습니다.
//
// 같은 조 제6항 단서는 더 강합니다. 사업자가 시험 사용 상품(미리보기)을 제공하지 않았다면
// 제공 개시를 이유로 청약철회를 제한할 수 없습니다. 이 경우 전액 환불 대상입니다.

// 함수 역할: 강의 환불액과 그 근거를 계산합니다.
//
// 반환값의 reason 은 사용자 안내와 분쟁 대응에 그대로 쓸 수 있도록 사유를 구분합니다.
// - preview-not-provided : 미리보기 미제공이라 제한 사유를 원용할 수 없음
// - not-started          : 아직 한 회차도 시청하지 않음
// - partial              : 미시청 회차 비율만큼 부분 환불
// - not-divisible        : 회차 구분이 없어 부분 환불을 계산할 수 없음
export function calculateVideoRefundAmount({
  paidAmount,
  totalChapters = 0,
  watchedChapters = 0,
  previewProvided = false,
} = {}) {
  const paid = Math.max(0, Math.floor(Number(paidAmount) || 0));
  if (paid === 0) {
    return { refundAmount: 0, refundableChapters: 0, reason: "not-started" };
  }

  const total = Math.max(0, Math.floor(Number(totalChapters) || 0));
  // 시청 회차는 아직 total 로 깎지 않습니다. 회차 구분이 없는 강의(total = 0)에서
  // 먼저 깎아버리면 "이미 시청함"이라는 사실이 사라져 미시청으로 잘못 판정됩니다.
  const rawWatched = Math.max(0, Math.floor(Number(watchedChapters) || 0));

  // 미리보기를 제공하지 않았다면 제공 개시를 이유로 환불을 제한할 수 없습니다.
  if (!previewProvided) {
    return {
      refundAmount: paid,
      refundableChapters: Math.max(0, total - Math.min(total, rawWatched)),
      reason: "preview-not-provided",
    };
  }

  if (rawWatched === 0) {
    return { refundAmount: paid, refundableChapters: total, reason: "not-started" };
  }

  // 회차 구분이 없으면 가분적 콘텐츠가 아니므로 부분 환불을 계산할 근거가 없습니다.
  if (total === 0) {
    return { refundAmount: 0, refundableChapters: 0, reason: "not-divisible" };
  }

  const refundableChapters = total - Math.min(total, rawWatched);
  return {
    refundAmount: Math.floor((paid * refundableChapters) / total),
    refundableChapters,
    reason: "partial",
  };
}

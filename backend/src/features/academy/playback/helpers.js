// 파일 역할: 아카데미 영상 보안 재생을 위한 세션, 토큰, 파일 경로 처리 로직을 담당합니다.
// 문자열 정규화 유틸리티
// 함수 역할: 안전한 텍스트 값으로 안전하게 변환합니다.
export function toSafeText(value) {
  return String(value || "").trim();
}

// HTTP 오류 객체 생성 유틸리티
// 함수 역할: http error 데이터를 새로 생성합니다.
export function createHttpError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

// 재생 화면 워터마크 문구 생성 로직
// 함수 역할: 재생 화면에 표시할 사용자 식별 워터마크 문구를 만듭니다.
export function buildWatermarkText(user, chapter) {
  const label =
    toSafeText(user?.loginId) ||
    toSafeText(user?.email) ||
    toSafeText(user?.name) ||
    toSafeText(user?.id);

  const curriculum = toSafeText(chapter?.lectureTitle);
  const chapterOrder = Math.max(1, Math.round(Number(chapter?.chapterOrder || 1)));
  const chapterLabel = `${chapterOrder}차시`;

  return [label, curriculum, chapterLabel].filter(Boolean).join(" · ");
}


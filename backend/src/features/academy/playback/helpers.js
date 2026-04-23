// 문자열 정규화 유틸리티
export function toSafeText(value) {
  return String(value || "").trim();
}

// HTTP 오류 객체 생성 유틸리티
export function createHttpError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

// 재생 화면 워터마크 문구 생성 로직
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


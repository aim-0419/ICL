/**
 * [요청 내용 읽기 도구]
 *
 * 화면에서 보낸 데이터를 안전하게 읽어 들입니다.
 * 형식이 깨진 값이 들어와도 오류로 서버가 멈추지 않고
 * 빈 값으로 넘어가도록 처리합니다.
 */
export function parseJson(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export function parsePayload(value) {
  const parsed = parseJson(value, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

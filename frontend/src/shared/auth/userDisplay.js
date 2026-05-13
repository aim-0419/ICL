// 파일 역할: 사용자 표시 이름을 화면 출력용으로 안전하게 계산합니다.
export function getUserDisplayName(user, fallback = "회원") {
  const name = String(user?.name || "").trim();
  if (name) return name;

  return fallback;
}

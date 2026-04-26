// 파일 역할: 프론트엔드에서 백엔드 API를 호출할 때 쓰는 공통 요청 함수를 제공합니다.
// 상수 역할: 프론트엔드 API 호출의 기본 주소를 보관합니다.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// 모든 API 호출이 이 함수를 거치도록 통일해 쿠키/JSON/에러 형식을 일관되게 맞춘다.
// 함수 역할: 공통 옵션으로 API를 호출하고 실패 응답을 에러로 정리합니다.
export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || "서버 요청에 실패했습니다.");
  }

  return data;
}

/**
 * [서버 통신 기본 도구]
 *
 * 화면에서 서버로 요청을 보낼 때 공통으로 거치는 창구입니다.
 *
 * - 서버 주소를 붙여 줍니다. 앱에서는 전체 주소가 필요하기 때문입니다.
 * - 로그인 상태(쿠키)를 함께 보냅니다.
 * - 서버가 오류를 돌려주면 화면에 보여 줄 수 있는 메시지로 정리합니다.
 * - 서버에 올려 둔 사진·영상 주소를 앱에서도 열 수 있는 형태로 바꿔 줍니다.
 */
import { isNativeDevice } from "../platform/runtime.js";

const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "/api").trim();

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/$/, "") || "/api";

function getApiOrigin() {
  if (!/^https?:\/\//i.test(API_BASE_URL)) return "";
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return "";
  }
}

// [현재 미사용] 앱 빌드의 API 주소 설정이 올바른지 검사합니다. 현재 호출하는 곳이 없습니다.
export function assertNativeApiConfiguration() {
  if (isNativeDevice() && !getApiOrigin()) {
    throw new Error("앱 API 주소가 설정되지 않았습니다. VITE_API_BASE_URL에 HTTPS 주소를 설정해 주세요.");
  }
}

// 서버가 상대 경로로 반환하는 업로드 파일은 앱에서 API 서버의 절대 주소로 변환합니다.
export function resolveApiAssetUrl(value) {
  const source = String(value || "").trim();
  if (!source || source.startsWith("blob:") || source.startsWith("data:")) return source;
  if (/^https?:\/\//i.test(source)) return source;
  if (!source.startsWith("/uploads/")) return source;

  const apiOrigin = getApiOrigin();
  return apiOrigin ? `${apiOrigin}${source}` : source;
}

const pendingGetRequests = new Map();

function getRequestKey(path, method) {
  return `${method}:${API_BASE_URL}${path}`;
}

// 파일 역할: 프론트엔드의 모든 JSON API 요청을 공통 방식으로 처리합니다.
export async function apiRequest(path, options = {}) {
  assertNativeApiConfiguration();
  const method = String(options.method || "GET").toUpperCase();
  const requestKey = getRequestKey(path, method);

  // 같은 GET 요청이 동시에 여러 컴포넌트에서 발생하면 실제 네트워크 호출은 한 번만 보냅니다.
  if (method === "GET" && pendingGetRequests.has(requestKey)) {
    return pendingGetRequests.get(requestKey);
  }

  const requestPromise = (async () => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 204) return {};

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const isJsonResponse = contentType.includes("application/json") || contentType.includes("+json");
    if (!isJsonResponse) {
      const error = new Error("API 서버 응답 형식이 올바르지 않습니다.");
      error.status = response.status;
      error.code = "INVALID_API_RESPONSE";
      throw error;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      const error = new Error("API 서버 응답을 읽을 수 없습니다.");
      error.status = response.status;
      error.code = "INVALID_API_RESPONSE";
      throw error;
    }

    if (!response.ok) {
      const error = new Error(data?.message || "서버 요청에 실패했습니다.");
      error.status = response.status;
      error.code = data?.code || "";
      error.data = data;
      throw error;
    }

    return data;
  })();

  if (method === "GET") {
    pendingGetRequests.set(requestKey, requestPromise);
    requestPromise.then(
      () => pendingGetRequests.delete(requestKey),
      () => pendingGetRequests.delete(requestKey)
    );
  }

  return requestPromise;
}

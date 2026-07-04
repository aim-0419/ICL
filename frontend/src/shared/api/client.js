export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const pendingGetRequests = new Map();

function getRequestKey(path, method) {
  return `${method}:${API_BASE_URL}${path}`;
}

// 파일 역할: 프론트엔드의 모든 JSON API 요청을 공통 방식으로 처리합니다.
export async function apiRequest(path, options = {}) {
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

    const data = await response.json().catch(() => ({}));

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

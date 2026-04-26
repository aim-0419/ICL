import { API_BASE_URL } from "../../../shared/api/client.js";

function getApiOrigin() {
  if (typeof window === "undefined") return "";

  try {
    if (String(API_BASE_URL).startsWith("http://") || String(API_BASE_URL).startsWith("https://")) {
      return new URL(API_BASE_URL).origin;
    }
  } catch {
    return "";
  }

  return "";
}

export function resolveCommunityMediaUrl(path) {
  const source = String(path || "").trim();
  if (!source) return "";

  if (source.startsWith("http://") || source.startsWith("https://") || source.startsWith("blob:")) {
    return source;
  }

  if (!source.startsWith("/")) {
    return source;
  }

  const apiOrigin = getApiOrigin();
  if (apiOrigin) return `${apiOrigin}${source}`;
  return source;
}

export async function uploadCommunityAsset(file, kind) {
  if (!(file instanceof File)) {
    throw new Error("업로드할 파일을 먼저 선택해 주세요.");
  }

  const params = new URLSearchParams({ kind: String(kind || "") });

  const response = await fetch(`${API_BASE_URL}/community/uploads?${params.toString()}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name),
    },
    body: file,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || "파일 업로드에 실패했습니다.");
  }

  return String(data?.assetPath || "");
}

import { API_BASE_URL, resolveApiAssetUrl } from "../../../shared/api/client.js";

export function resolveCommunityMediaUrl(path) {
  return resolveApiAssetUrl(path);
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

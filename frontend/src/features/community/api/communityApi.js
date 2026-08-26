/**
 * [커뮤니티 서버 통신 담당]
 *
 * 이벤트, 후기, 문의 같은 커뮤니티 화면이 서버와 주고받는 요청을 모아 둔 파일입니다.
 * 글에 첨부하는 사진과 영상을 서버에 올리는 일도 여기서 처리합니다.
 */
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

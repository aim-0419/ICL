import { API_BASE_URL, apiRequest } from "../../../shared/api/client.js";

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

export function resolveAcademyMediaUrl(path) {
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

export async function listAcademyVideos() {
  const result = await apiRequest("/academy/videos");
  return Array.isArray(result?.videos) ? result.videos : [];
}

export async function listAcademyInstructors(searchText = "") {
  const q = String(searchText || "").trim();
  const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
  const result = await apiRequest(`/academy/instructors${suffix}`);
  return {
    items: Array.isArray(result?.items) ? result.items : [],
    exactMatch: Boolean(result?.exactMatch),
  };
}

export async function listAcademyProgress() {
  const result = await apiRequest("/academy/progress");
  return {
    items: Array.isArray(result?.items) ? result.items : [],
    chapterItems: Array.isArray(result?.chapterItems) ? result.chapterItems : [],
  };
}

export async function saveAcademyProgress(videoId, payload) {
  return apiRequest(`/academy/progress/${encodeURIComponent(String(videoId || "").trim())}`, {
    method: "PUT",
    body: payload,
  });
}

export async function saveAcademyChapterProgress(videoId, chapterId, payload) {
  return apiRequest(
    `/academy/progress/${encodeURIComponent(String(videoId || "").trim())}/chapters/${encodeURIComponent(
      String(chapterId || "").trim()
    )}`,
    {
      method: "PUT",
      body: payload,
    }
  );
}

export async function createAcademyVideo(payload) {
  return apiRequest("/academy/videos", {
    method: "POST",
    body: payload,
  });
}

export async function updateAcademyVideo(videoId, payload) {
  return apiRequest(`/academy/videos/${encodeURIComponent(String(videoId || "").trim())}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deleteAcademyVideo(videoId) {
  return apiRequest(`/academy/videos/${encodeURIComponent(String(videoId || "").trim())}`, {
    method: "DELETE",
  });
}

export async function listAcademyReviews(videoId) {
  const result = await apiRequest(`/academy/videos/${encodeURIComponent(String(videoId))}/reviews`);
  return Array.isArray(result?.reviews) ? result.reviews : [];
}

export async function createAcademyReview(videoId, payload) {
  return apiRequest(`/academy/videos/${encodeURIComponent(String(videoId))}/reviews`, {
    method: "POST",
    body: payload,
  });
}

export async function deleteAcademyReview(reviewId) {
  return apiRequest(`/academy/reviews/${encodeURIComponent(String(reviewId))}`, { method: "DELETE" });
}

export async function listAcademyQna(videoId) {
  const result = await apiRequest(`/academy/videos/${encodeURIComponent(String(videoId))}/qna`);
  return Array.isArray(result?.posts) ? result.posts : [];
}

export async function createAcademyQnaPost(videoId, payload) {
  return apiRequest(`/academy/videos/${encodeURIComponent(String(videoId))}/qna`, {
    method: "POST",
    body: payload,
  });
}

export async function createAcademyQnaReply(postId, payload) {
  return apiRequest(`/academy/qna/${encodeURIComponent(String(postId))}/replies`, {
    method: "POST",
    body: payload,
  });
}

export async function deleteAcademyQnaPost(postId) {
  return apiRequest(`/academy/qna/${encodeURIComponent(String(postId))}`, { method: "DELETE" });
}

export async function deleteAcademyQnaReply(replyId) {
  return apiRequest(`/academy/qna/replies/${encodeURIComponent(String(replyId))}`, { method: "DELETE" });
}

export async function uploadAcademyAsset(file, kind) {
  if (!(file instanceof File)) {
    throw new Error("업로드할 파일을 먼저 선택해 주세요.");
  }

  const response = await fetch(`${API_BASE_URL}/academy/uploads?kind=${encodeURIComponent(kind)}`, {
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

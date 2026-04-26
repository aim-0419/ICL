// 파일 역할: 프론트엔드 아카데미 화면에서 사용하는 백엔드 API 호출 함수를 모읍니다.
import { API_BASE_URL, apiRequest } from "../../../shared/api/client.js";

// 함수 역할: API 원본 주소 데이터를 조회해 호출자에게 반환합니다.
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

// 함수 역할: 아카데미 미디어 URL 상황에 맞는 값을 계산하거나 선택합니다.
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

// 함수 역할: 노출 가능한 강의와 차시 목록을 조회해 화면 표시용 데이터로 반환합니다.
export async function listAcademyVideos() {
  const result = await apiRequest("/academy/videos");
  return Array.isArray(result?.videos) ? result.videos : [];
}

// 함수 역할: 아카데미 강사 목록을 조회해 반환합니다.
export async function listAcademyInstructors(searchText = "") {
  const q = String(searchText || "").trim();
  const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
  const result = await apiRequest(`/academy/instructors${suffix}`);
  return {
    items: Array.isArray(result?.items) ? result.items : [],
    exactMatch: Boolean(result?.exactMatch),
  };
}

// 함수 역할: 아카데미 학습 진도 목록을 조회해 반환합니다.
export async function listAcademyProgress() {
  const result = await apiRequest("/academy/progress");
  return {
    items: Array.isArray(result?.items) ? result.items : [],
    chapterItems: Array.isArray(result?.chapterItems) ? result.chapterItems : [],
  };
}

// 함수 역할: 이전 단일 강의 진도 API와 호환되도록 차시 진도 저장 후 강의 전체 진도를 반환합니다.
export async function saveAcademyProgress(videoId, payload) {
  return apiRequest(`/academy/progress/${encodeURIComponent(String(videoId || "").trim())}`, {
    method: "PUT",
    body: payload,
  });
}

// 함수 역할: 회원의 특정 차시 시청 위치와 완료 여부를 저장합니다.
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

// 함수 역할: 아카데미 영상 재생 세션 데이터를 새로 생성합니다.
export async function createAcademyPlaybackSession(videoId, chapterId) {
  return apiRequest("/academy/playback/session", {
    method: "POST",
    body: {
      videoId: String(videoId || "").trim(),
      chapterId: String(chapterId || "").trim(),
    },
  });
}

// 함수 역할: 재생 중인 세션의 활동 시간을 갱신하고 토큰 유효성을 확인합니다.
export async function heartbeatAcademyPlaybackSession(token) {
  return apiRequest("/academy/playback/heartbeat", {
    method: "POST",
    body: { token: String(token || "").trim() },
  });
}

// 함수 역할: 관리자 입력값을 검증한 뒤 상품, 강의, 차시 데이터를 새로 등록합니다.
export async function createAcademyVideo(payload) {
  return apiRequest("/academy/videos", {
    method: "POST",
    body: payload,
  });
}

// 함수 역할: 기존 강의의 상품 정보, 노출 정보, 차시 목록을 수정합니다.
export async function updateAcademyVideo(videoId, payload) {
  return apiRequest(`/academy/videos/${encodeURIComponent(String(videoId || "").trim())}`, {
    method: "PUT",
    body: payload,
  });
}

// 함수 역할: 강의와 연결 상품을 삭제해 관련 차시도 함께 정리합니다.
export async function deleteAcademyVideo(videoId) {
  return apiRequest(`/academy/videos/${encodeURIComponent(String(videoId || "").trim())}`, {
    method: "DELETE",
  });
}

// 함수 역할: setAcademyVideoVisibility 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function setAcademyVideoVisibility(videoId, isHidden) {
  return apiRequest(`/academy/videos/${encodeURIComponent(String(videoId || "").trim())}/visibility`, {
    method: "PATCH",
    body: { isHidden: Boolean(isHidden) },
  });
}

// 함수 역할: 아카데미 후기 목록을 조회해 반환합니다.
export async function listAcademyReviews(videoId) {
  const result = await apiRequest(`/academy/videos/${encodeURIComponent(String(videoId))}/reviews`);
  return Array.isArray(result?.reviews) ? result.reviews : [];
}

// 함수 역할: 아카데미 후기 데이터를 새로 생성합니다.
export async function createAcademyReview(videoId, payload) {
  return apiRequest(`/academy/videos/${encodeURIComponent(String(videoId))}/reviews`, {
    method: "POST",
    body: payload,
  });
}

// 함수 역할: 아카데미 후기 데이터를 삭제합니다.
export async function deleteAcademyReview(reviewId) {
  return apiRequest(`/academy/reviews/${encodeURIComponent(String(reviewId))}`, { method: "DELETE" });
}

// 함수 역할: 아카데미 Q&A 목록을 조회해 반환합니다.
export async function listAcademyQna(videoId) {
  const result = await apiRequest(`/academy/videos/${encodeURIComponent(String(videoId))}/qna`);
  return Array.isArray(result?.posts) ? result.posts : [];
}

// 함수 역할: 로그인 회원이 작성한 아카데미 Q&A 목록과 답변 여부를 조회해 반환합니다.
export async function listMyAcademyQna() {
  const result = await apiRequest("/academy/qna/my");
  return Array.isArray(result?.items) ? result.items : [];
}

// 함수 역할: 아카데미 Q&A 게시글 데이터를 새로 생성합니다.
export async function createAcademyQnaPost(videoId, payload) {
  return apiRequest(`/academy/videos/${encodeURIComponent(String(videoId))}/qna`, {
    method: "POST",
    body: payload,
  });
}

// 함수 역할: 아카데미 Q&A 답변 데이터를 새로 생성합니다.
export async function createAcademyQnaReply(postId, payload) {
  return apiRequest(`/academy/qna/${encodeURIComponent(String(postId))}/replies`, {
    method: "POST",
    body: payload,
  });
}

// 함수 역할: 아카데미 Q&A 게시글 데이터를 삭제합니다.
export async function deleteAcademyQnaPost(postId) {
  return apiRequest(`/academy/qna/${encodeURIComponent(String(postId))}`, { method: "DELETE" });
}

// 함수 역할: 아카데미 Q&A 답변 데이터를 삭제합니다.
export async function deleteAcademyQnaReply(replyId) {
  return apiRequest(`/academy/qna/replies/${encodeURIComponent(String(replyId))}`, { method: "DELETE" });
}

// 함수 역할: 아카데미 업로드 파일 파일을 서버로 업로드합니다.
export async function uploadAcademyAsset(file, kind, videoId = "", chapterOrder = "") {
  if (!(file instanceof File)) {
    throw new Error("업로드할 파일을 먼저 선택해 주세요.");
  }

  const params = new URLSearchParams({ kind });
  if (videoId) params.set("videoId", String(videoId));
  if (chapterOrder) params.set("chapterOrder", String(chapterOrder));

  const response = await fetch(`${API_BASE_URL}/academy/uploads?${params.toString()}`, {
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

// 파일 역할: 아카데미 영상 보안 재생을 위한 세션, 토큰, 파일 경로 처리 로직을 담당합니다.
import { stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { query } from "../../../shared/db/mysql.js";
import {
  getAcademyPlaybackChapter,
  hasAcademyPreviewChapterAccess,
  hasAcademyVideoAccess,
} from "../academy.service.js";
import {
  HEARTBEAT_INTERVAL_SEC,
  PLAYBACK_SESSION_STATUS,
  PLAYBACK_TOKEN_TTL_SEC,
} from "./constants.js";
import { createHttpError, toSafeText, buildWatermarkText } from "./helpers.js";
import { signPlaybackToken, verifyPlaybackToken } from "./token.js";
import { resolveAcademyVideoFilePath, resolveVideoMimeType } from "./file-path.js";
import {
  getPlaybackSessionById,
  markExpiredPlaybackSessions,
  revokeConcurrentSessionsByUser,
  touchPlaybackSession,
} from "./session.repository.js";

// 재생 세션 유효성 검증 로직
// 함수 역할: 재생 세션 상태, 만료 시간, 토큰 소유자가 모두 유효한지 검사합니다.
function assertValidSessionState(sessionRow, tokenPayload, requestUserId = "") {
  if (!sessionRow?.id) {
    throw createHttpError(401, "재생 세션이 유효하지 않습니다.", "PLAYBACK_SESSION_NOT_FOUND");
  }

  if (sessionRow.status === PLAYBACK_SESSION_STATUS.revoked) {
    throw createHttpError(409, "다른 기기에서 재생이 시작되어 현재 재생이 중단되었습니다.", "PLAYBACK_SESSION_REVOKED");
  }

  if (sessionRow.status !== PLAYBACK_SESSION_STATUS.active) {
    throw createHttpError(401, "재생 세션이 만료되었습니다.", "PLAYBACK_SESSION_EXPIRED");
  }

  if (
    toSafeText(sessionRow.sessionKey) !== toSafeText(tokenPayload.sk) ||
    toSafeText(sessionRow.videoId) !== toSafeText(tokenPayload.vid) ||
    toSafeText(sessionRow.chapterId) !== toSafeText(tokenPayload.cid)
  ) {
    throw createHttpError(401, "재생 토큰 검증에 실패했습니다.", "PLAYBACK_TOKEN_MISMATCH");
  }

  const nowMs = Date.now();
  const tokenExpMs = Number(tokenPayload.exp) * 1000;
  const sessionExpMs = new Date(sessionRow.expiresAt).getTime();
  if (!Number.isFinite(tokenExpMs) || tokenExpMs <= nowMs || !Number.isFinite(sessionExpMs) || sessionExpMs <= nowMs) {
    throw createHttpError(401, "재생 토큰이 만료되었습니다.", "PLAYBACK_TOKEN_EXPIRED");
  }

  if (toSafeText(tokenPayload.uid) && requestUserId && requestUserId !== toSafeText(tokenPayload.uid)) {
    throw createHttpError(401, "다른 계정에서는 재생할 수 없습니다.", "PLAYBACK_USER_MISMATCH");
  }
}

// 재생 세션 발급 로직
// 함수 역할: 수강 권한을 확인한 뒤 단일 재생 세션과 재생 토큰을 발급합니다.
export async function issueAcademyPlaybackSession({
  user,
  videoId,
  chapterId = "",
  ipAddress = "",
  userAgent = "",
}) {
  const normalizedVideoId = toSafeText(videoId);
  const normalizedChapterId = toSafeText(chapterId);
  if (!normalizedVideoId) {
    throw createHttpError(400, "강의 정보가 올바르지 않습니다.");
  }

  await markExpiredPlaybackSessions();

  const chapter = await getAcademyPlaybackChapter(normalizedVideoId, normalizedChapterId);
  if (!chapter?.id) {
    throw createHttpError(404, "재생할 차시를 찾을 수 없습니다.");
  }

  if (!toSafeText(chapter.videoUrl)) {
    throw createHttpError(404, "재생 가능한 영상 파일이 없습니다.");
  }

  const canAccess = await hasAcademyVideoAccess(user, normalizedVideoId);
  if (!canAccess) {
    const canPreview = await hasAcademyPreviewChapterAccess(normalizedVideoId, chapter.id);
    if (!canPreview) {
      throw createHttpError(403, "재생 권한이 없는 차시입니다.");
    }
  }

  const requestUserId = toSafeText(user?.id);
  if (requestUserId) {
    await revokeConcurrentSessionsByUser(requestUserId, { chapterId: chapter.id });
  }

  const sessionId = randomUUID();
  const sessionKey = randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + PLAYBACK_TOKEN_TTL_SEC * 1000);

  await query(
    `INSERT INTO academy_playback_sessions (
      id,
      user_id,
      video_id,
      chapter_id,
      session_key,
      status,
      ip_address,
      user_agent,
      created_at,
      last_seen_at,
      expires_at,
      revoked_at,
      revoke_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?, NULL, NULL)`,
    [
      sessionId,
      requestUserId || null,
      normalizedVideoId,
      chapter.id,
      sessionKey,
      PLAYBACK_SESSION_STATUS.active,
      toSafeText(ipAddress).slice(0, 80) || null,
      toSafeText(userAgent).slice(0, 255) || null,
      expiresAt,
    ]
  );

  const token = signPlaybackToken({
    sid: sessionId,
    sk: sessionKey,
    uid: requestUserId || "",
    vid: normalizedVideoId,
    cid: chapter.id,
    exp: Math.floor(expiresAt.getTime() / 1000),
  });

  return {
    sessionId,
    token,
    playbackUrl: `/api/academy/playback/stream/${encodeURIComponent(chapter.id)}?token=${encodeURIComponent(token)}`,
    expiresAt: expiresAt.toISOString(),
    heartbeatIntervalSec: HEARTBEAT_INTERVAL_SEC,
    watermarkText: buildWatermarkText(user, chapter),
  };
}

// 재생 세션 heartbeat 갱신 로직
// 함수 역할: 재생 중인 세션의 활동 시간을 갱신하고 토큰 유효성을 확인합니다.
export async function heartbeatAcademyPlaybackSession({ token, user }) {
  await markExpiredPlaybackSessions();

  const payload = verifyPlaybackToken(token);
  if (!payload) {
    throw createHttpError(401, "재생 토큰이 유효하지 않습니다.", "PLAYBACK_TOKEN_INVALID");
  }

  const requestUserId = toSafeText(user?.id);
  const session = await getPlaybackSessionById(payload.sid);
  assertValidSessionState(session, payload, requestUserId);
  await touchPlaybackSession(session.id);

  return {
    ok: true,
    sessionId: session.id,
    expiresAt: session.expiresAt ? new Date(session.expiresAt).toISOString() : "",
  };
}

// 스트리밍 파일 해석 및 세션 갱신 로직
// 함수 역할: 재생 토큰과 차시 정보를 검증한 뒤 실제 영상 파일 스트림 정보를 반환합니다.
export async function resolveAcademyPlaybackStream({ chapterId, token, user }) {
  await markExpiredPlaybackSessions();

  const normalizedChapterId = toSafeText(chapterId);
  const payload = verifyPlaybackToken(token);
  if (!payload) {
    throw createHttpError(401, "재생 토큰이 유효하지 않습니다.", "PLAYBACK_TOKEN_INVALID");
  }

  if (normalizedChapterId !== payload.cid) {
    throw createHttpError(401, "재생 요청이 일치하지 않습니다.", "PLAYBACK_CHAPTER_MISMATCH");
  }

  const requestUserId = toSafeText(user?.id);
  const session = await getPlaybackSessionById(payload.sid);
  assertValidSessionState(session, payload, requestUserId);

  const chapter = await getAcademyPlaybackChapter(payload.vid, payload.cid);
  if (!chapter?.id || !toSafeText(chapter.videoUrl)) {
    throw createHttpError(404, "재생 파일을 찾을 수 없습니다.", "PLAYBACK_FILE_NOT_FOUND");
  }

  const localVideoFilePath = resolveAcademyVideoFilePath(chapter.videoUrl);
  if (!localVideoFilePath) {
    throw createHttpError(403, "보안 재생 경로가 아닌 파일입니다.", "PLAYBACK_FILE_PATH_INVALID");
  }

  let fileStat;
  try {
    fileStat = await stat(localVideoFilePath);
  } catch {
    throw createHttpError(404, "재생 파일을 찾을 수 없습니다.", "PLAYBACK_FILE_NOT_FOUND");
  }

  await touchPlaybackSession(session.id);

  return {
    filePath: localVideoFilePath,
    mimeType: resolveVideoMimeType(localVideoFilePath),
    fileSize: Number(fileStat?.size || 0),
    sessionId: session.id,
    chapterId: chapter.id,
    videoId: chapter.videoId,
  };
}


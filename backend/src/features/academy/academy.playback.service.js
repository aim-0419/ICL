import { stat } from "node:fs/promises";
import path from "node:path";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";
import { query, queryOne } from "../../shared/db/mysql.js";
import {
  getAcademyPlaybackChapter,
  hasAcademyPreviewChapterAccess,
  hasAcademyVideoAccess,
} from "./academy.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "../../..");
const ACADEMY_VIDEO_UPLOAD_ROOT = path.resolve(BACKEND_ROOT, "uploads", "academy", "videos");

const PLAYBACK_SESSION_STATUS = {
  active: "active",
  revoked: "revoked",
  expired: "expired",
};

const HEARTBEAT_INTERVAL_SEC = 15;
const PLAYBACK_TOKEN_TTL_SEC = Math.max(
  300,
  Math.round(Number(env.academyPlaybackTokenTtlSec) || 3600)
);
const PLAYBACK_TOKEN_SECRET = String(
  env.academyPlaybackTokenSecret || `${env.dbName}-academy-playback-secret`
).trim();

function toSafeText(value) {
  return String(value || "").trim();
}

function createHttpError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function encodeBase64Url(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function encodeBufferBase64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function signPayloadBase64(payloadBase64) {
  return createHmac("sha256", PLAYBACK_TOKEN_SECRET).update(payloadBase64).digest();
}

function signPlaybackToken(payload) {
  const payloadBase64 = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayloadBase64(payloadBase64);
  const signatureBase64 = encodeBufferBase64Url(signature);
  return `${payloadBase64}.${signatureBase64}`;
}

function verifyPlaybackToken(token) {
  const raw = toSafeText(token);
  if (!raw.includes(".")) return null;
  const [payloadBase64, signatureBase64] = raw.split(".");
  if (!payloadBase64 || !signatureBase64) return null;

  let decodedSignature;
  try {
    decodedSignature = Buffer.from(signatureBase64, "base64url");
  } catch {
    return null;
  }

  const expected = signPayloadBase64(payloadBase64);
  if (decodedSignature.length !== expected.length) return null;
  if (!timingSafeEqual(decodedSignature, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadBase64));
  } catch {
    return null;
  }

  const sid = toSafeText(payload?.sid);
  const sk = toSafeText(payload?.sk);
  const uid = toSafeText(payload?.uid);
  const vid = toSafeText(payload?.vid);
  const cid = toSafeText(payload?.cid);
  const exp = Number(payload?.exp || 0);

  if (!sid || !sk || !vid || !cid || !Number.isFinite(exp) || exp <= 0) return null;

  return { sid, sk, uid, vid, cid, exp };
}

function normalizePathCase(value) {
  return path.normalize(String(value || "")).toLowerCase();
}

function isPathInsideRoot(targetPath, rootPath) {
  const target = normalizePathCase(targetPath);
  const root = normalizePathCase(rootPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function resolveAcademyVideoFilePath(assetPath) {
  let normalizedPath = toSafeText(assetPath);

  if (/^https?:\/\//i.test(normalizedPath)) {
    try {
      normalizedPath = new URL(normalizedPath).pathname;
    } catch {
      return "";
    }
  }

  if (!normalizedPath.startsWith("/uploads/academy/videos/")) {
    return "";
  }

  const relative = normalizedPath.replace(/^\/+/, "");
  const absolute = path.resolve(BACKEND_ROOT, relative);

  if (!isPathInsideRoot(absolute, ACADEMY_VIDEO_UPLOAD_ROOT)) {
    return "";
  }

  return absolute;
}

function resolveVideoMimeType(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  return "application/octet-stream";
}

function buildWatermarkText(user, chapter) {
  const label =
    toSafeText(user?.loginId) ||
    toSafeText(user?.email) ||
    toSafeText(user?.name) ||
    toSafeText(user?.id);

  const curriculum = toSafeText(chapter?.lectureTitle);
  const chapterOrder = Math.max(1, Math.round(Number(chapter?.chapterOrder || 1)));
  const chapterLabel = `${chapterOrder}차시`;

  return [label, curriculum, chapterLabel].filter(Boolean).join(" · ");
}

async function markExpiredPlaybackSessions() {
  await query(
    `UPDATE academy_playback_sessions
     SET status = ?, revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP()), revoke_reason = COALESCE(revoke_reason, 'token_expired')
     WHERE status = ?
       AND expires_at <= UTC_TIMESTAMP()`,
    [PLAYBACK_SESSION_STATUS.expired, PLAYBACK_SESSION_STATUS.active]
  );
}

async function revokeConcurrentSessionsByUser(userId) {
  const normalizedUserId = toSafeText(userId);
  if (!normalizedUserId) return;

  await query(
    `UPDATE academy_playback_sessions
     SET status = ?, revoked_at = UTC_TIMESTAMP(), revoke_reason = 'concurrent_session'
     WHERE user_id = ?
       AND status = ?
       AND expires_at > UTC_TIMESTAMP()`,
    [PLAYBACK_SESSION_STATUS.revoked, normalizedUserId, PLAYBACK_SESSION_STATUS.active]
  );
}

async function getPlaybackSessionById(sessionId) {
  return queryOne(
    `SELECT
      id,
      user_id AS userId,
      video_id AS videoId,
      chapter_id AS chapterId,
      session_key AS sessionKey,
      status,
      ip_address AS ipAddress,
      user_agent AS userAgent,
      created_at AS createdAt,
      last_seen_at AS lastSeenAt,
      expires_at AS expiresAt,
      revoked_at AS revokedAt,
      revoke_reason AS revokeReason
     FROM academy_playback_sessions
     WHERE id = ?
     LIMIT 1`,
    [sessionId]
  );
}

function assertValidSessionState(sessionRow, tokenPayload, requestUserId = "") {
  if (!sessionRow?.id) {
    throw createHttpError(401, "?ъ깮 ?몄뀡???좏슚?섏? ?딆뒿?덈떎.", "PLAYBACK_SESSION_NOT_FOUND");
  }

  if (sessionRow.status === PLAYBACK_SESSION_STATUS.revoked) {
    throw createHttpError(409, "?ㅻⅨ 湲곌린?먯꽌 ?ъ깮???쒖옉?섏뼱 ?꾩옱 ?ъ깮??以묐떒?섏뿀?듬땲??", "PLAYBACK_SESSION_REVOKED");
  }

  if (sessionRow.status !== PLAYBACK_SESSION_STATUS.active) {
    throw createHttpError(401, "?ъ깮 ?몄뀡??留뚮즺?섏뿀?듬땲??", "PLAYBACK_SESSION_EXPIRED");
  }

  if (
    toSafeText(sessionRow.sessionKey) !== toSafeText(tokenPayload.sk) ||
    toSafeText(sessionRow.videoId) !== toSafeText(tokenPayload.vid) ||
    toSafeText(sessionRow.chapterId) !== toSafeText(tokenPayload.cid)
  ) {
    throw createHttpError(401, "?ъ깮 ?좏겙 寃利앹뿉 ?ㅽ뙣?덉뒿?덈떎.", "PLAYBACK_TOKEN_MISMATCH");
  }

  const nowMs = Date.now();
  const tokenExpMs = Number(tokenPayload.exp) * 1000;
  const sessionExpMs = new Date(sessionRow.expiresAt).getTime();
  if (!Number.isFinite(tokenExpMs) || tokenExpMs <= nowMs || !Number.isFinite(sessionExpMs) || sessionExpMs <= nowMs) {
    throw createHttpError(401, "?ъ깮 ?좏겙??留뚮즺?섏뿀?듬땲??", "PLAYBACK_TOKEN_EXPIRED");
  }

  if (toSafeText(tokenPayload.uid)) {
    if (requestUserId && requestUserId !== toSafeText(tokenPayload.uid)) {
      throw createHttpError(401, "?ㅻⅨ 怨꾩젙?먯꽌???ъ깮?????놁뒿?덈떎.", "PLAYBACK_USER_MISMATCH");
    }
  }
}

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
    throw createHttpError(400, "媛뺤쓽 ?뺣낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.");
  }

  await markExpiredPlaybackSessions();

  const chapter = await getAcademyPlaybackChapter(normalizedVideoId, normalizedChapterId);
  if (!chapter?.id) {
    throw createHttpError(404, "?ъ깮??李⑥떆瑜?李얠쓣 ???놁뒿?덈떎.");
  }

  if (!toSafeText(chapter.videoUrl)) {
    throw createHttpError(404, "?ъ깮 媛?ν븳 ?곸긽 ?뚯씪???놁뒿?덈떎.");
  }

  const canAccess = await hasAcademyVideoAccess(user, normalizedVideoId);
  if (!canAccess) {
    const canPreview = await hasAcademyPreviewChapterAccess(normalizedVideoId, chapter.id);
    if (!canPreview) {
      throw createHttpError(403, "?ъ깮 沅뚰븳???녿뒗 李⑥떆?낅땲??");
    }
  }

  const requestUserId = toSafeText(user?.id);
  if (requestUserId) {
    await revokeConcurrentSessionsByUser(requestUserId);
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

export async function heartbeatAcademyPlaybackSession({ token, user }) {
  await markExpiredPlaybackSessions();

  const payload = verifyPlaybackToken(token);
  if (!payload) {
    throw createHttpError(401, "?ъ깮 ?좏겙???좏슚?섏? ?딆뒿?덈떎.", "PLAYBACK_TOKEN_INVALID");
  }

  const requestUserId = toSafeText(user?.id);
  const session = await getPlaybackSessionById(payload.sid);
  assertValidSessionState(session, payload, requestUserId);

  await query(
    `UPDATE academy_playback_sessions
     SET last_seen_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [session.id]
  );

  return {
    ok: true,
    sessionId: session.id,
    expiresAt: session.expiresAt ? new Date(session.expiresAt).toISOString() : "",
  };
}

export async function resolveAcademyPlaybackStream({ chapterId, token, user }) {
  await markExpiredPlaybackSessions();

  const normalizedChapterId = toSafeText(chapterId);
  const payload = verifyPlaybackToken(token);
  if (!payload) {
    throw createHttpError(401, "?ъ깮 ?좏겙???좏슚?섏? ?딆뒿?덈떎.", "PLAYBACK_TOKEN_INVALID");
  }

  if (normalizedChapterId !== payload.cid) {
    throw createHttpError(401, "?ъ깮 ?붿껌???쇱튂?섏? ?딆뒿?덈떎.", "PLAYBACK_CHAPTER_MISMATCH");
  }

  const requestUserId = toSafeText(user?.id);
  const session = await getPlaybackSessionById(payload.sid);
  assertValidSessionState(session, payload, requestUserId);

  const chapter = await getAcademyPlaybackChapter(payload.vid, payload.cid);
  if (!chapter?.id || !toSafeText(chapter.videoUrl)) {
    throw createHttpError(404, "?ъ깮 ?뚯씪??李얠쓣 ???놁뒿?덈떎.", "PLAYBACK_FILE_NOT_FOUND");
  }

  const localVideoFilePath = resolveAcademyVideoFilePath(chapter.videoUrl);
  if (!localVideoFilePath) {
    throw createHttpError(403, "蹂댁븞 ?ъ깮 寃쎈줈媛 ?꾨땶 ?뚯씪?낅땲??", "PLAYBACK_FILE_PATH_INVALID");
  }

  let fileStat;
  try {
    fileStat = await stat(localVideoFilePath);
  } catch {
    throw createHttpError(404, "?ъ깮 ?뚯씪??李얠쓣 ???놁뒿?덈떎.", "PLAYBACK_FILE_NOT_FOUND");
  }

  await query(
    `UPDATE academy_playback_sessions
     SET last_seen_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [session.id]
  );

  return {
    filePath: localVideoFilePath,
    mimeType: resolveVideoMimeType(localVideoFilePath),
    fileSize: Number(fileStat?.size || 0),
    sessionId: session.id,
    chapterId: chapter.id,
    videoId: chapter.videoId,
  };
}


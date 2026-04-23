import { query, queryOne } from "../../../shared/db/mysql.js";
import { PLAYBACK_SESSION_STATUS } from "./constants.js";
import { toSafeText } from "./helpers.js";

// 만료 세션 상태 정리 쿼리
export async function markExpiredPlaybackSessions() {
  await query(
    `UPDATE academy_playback_sessions
     SET status = ?, revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP()), revoke_reason = COALESCE(revoke_reason, 'token_expired')
     WHERE status = ?
       AND expires_at <= UTC_TIMESTAMP()`,
    [PLAYBACK_SESSION_STATUS.expired, PLAYBACK_SESSION_STATUS.active]
  );
}

// 동시 접속 세션 종료 쿼리
export async function revokeConcurrentSessionsByUser(userId) {
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

// 세션 단건 조회 쿼리
export async function getPlaybackSessionById(sessionId) {
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

// 세션 heartbeat 갱신 쿼리
export async function touchPlaybackSession(sessionId) {
  await query(
    `UPDATE academy_playback_sessions
     SET last_seen_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [sessionId]
  );
}


// 파일 역할: 아카데미 영상 보안 재생을 위한 세션, 토큰, 파일 경로 처리 로직을 담당합니다.
import { query, queryOne } from "../../../shared/db/mysql.js";
import { PLAYBACK_SESSION_STATUS } from "./constants.js";
import { toSafeText } from "./helpers.js";

// 만료 세션 상태 정리 쿼리
// 함수 역할: 만료된 영상 재생 세션 상태를 표시하거나 갱신합니다.
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
// 함수 역할: 동시 접속 세션 by 회원 권한이나 세션을 회수합니다.
// 같은 차시를 30초 이내 재접속하는 경우(페이지 새로고침, 기기 전환)는 revoke 제외합니다.
export async function revokeConcurrentSessionsByUser(userId, { chapterId = "", gracePeriodSec = 30 } = {}) {
  const normalizedUserId = toSafeText(userId);
  if (!normalizedUserId) return;

  const normalizedChapterId = toSafeText(chapterId);

  await query(
    `UPDATE academy_playback_sessions
     SET status = ?, revoked_at = UTC_TIMESTAMP(), revoke_reason = 'concurrent_session'
     WHERE user_id = ?
       AND status = ?
       AND expires_at > UTC_TIMESTAMP()
       AND NOT (
         chapter_id = ?
         AND last_seen_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)
       )`,
    [PLAYBACK_SESSION_STATUS.revoked, normalizedUserId, PLAYBACK_SESSION_STATUS.active, normalizedChapterId, gracePeriodSec]
  );
}

// 세션 단건 조회 쿼리
// 함수 역할: 영상 재생 세션 by ID 데이터를 조회해 호출자에게 반환합니다.
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
// 함수 역할: 영상 재생 세션 값으로 안전하게 변환합니다.
export async function touchPlaybackSession(sessionId) {
  await query(
    `UPDATE academy_playback_sessions
     SET last_seen_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [sessionId]
  );
}


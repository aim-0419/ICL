/**
 * [알림 처리기]
 *
 * 만들어진 알림을 실제로 보내기까지의 과정을 관리합니다.
 *
 * - 회원 기기를 알림 받을 기기로 등록하거나 해제합니다.
 * - 보낼 알림을 대기열에 넣습니다.
 * - 보낼 때가 된 알림을 꺼내 발송하고, 실패하면 잠시 뒤 다시 시도합니다.
 * - 탈퇴했거나 알림을 끈 회원은 실패가 아니라 '제외'로 처리합니다.
 *
 * 현재 실제로 처리하는 것은 **앱 푸시뿐**입니다.
 * 문자와 카카오 알림톡은 대기열에 쌓이지만 아직 꺼내 보내는 연결이 없습니다.
 */
import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../shared/db/mysql.js";
import { sendFcmPush } from "./fcm.service.js";
// 스케줄러는 자동 알림 생성기를 이 모듈에서 가져갑니다.
export { generateAutomaticNotifications } from "./notification-automation.service.js";
import {
  applyQuietHours,
  buildDeliveryId,
  classifySendError,
  MAX_DELIVERY_ATTEMPTS,
  redactErrorMessage,
  resolveNextAttemptAt,
} from "./notification-rules.js";

// 워커가 한 번에 처리하는 최대 건수입니다. 한 번의 tick이 과도하게 길어지지 않도록 제한합니다.
// [현재 미사용] 한 번에 처리할 발송 건수 상한입니다. 이 파일 안에서만 쓰입니다.
export const DISPATCH_BATCH_LIMIT = 25;
// processing 상태로 남은 채 프로세스가 종료되면 이 시간 뒤에 다시 처리 대상으로 되돌립니다.
const STALE_PROCESSING_MINUTES = 10;

function createHttpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizePushToken(token) {
  const value = String(token || "").trim();
  if (!value || value.length < 20 || value.length > 512) {
    throw createHttpError("앱 푸시 토큰이 올바르지 않습니다.", 400);
  }
  return value;
}

function normalizePlatform(platform) {
  const value = String(platform || "android").trim().toLowerCase();
  return ["android", "ios", "web"].includes(value) ? value : "android";
}

function normalizeDeviceName(deviceName) {
  return String(deviceName || "").trim().slice(0, 120) || null;
}

export async function registerPushDevice({ userId, token, platform = "android", deviceName = "" } = {}) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) throw createHttpError("로그인이 필요합니다.", 401);

  const safeToken = normalizePushToken(token);
  const id = randomUUID();

  await query(
    `INSERT INTO studio_push_devices
       (id, user_id, token, platform, device_name, is_active, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       platform = VALUES(platform),
       device_name = VALUES(device_name),
       is_active = 1,
       last_seen_at = NOW(),
       updated_at = NOW()`,
    [id, safeUserId, safeToken, normalizePlatform(platform), normalizeDeviceName(deviceName)]
  );

  const row = await queryOne(
    `SELECT id, platform, device_name AS deviceName, is_active AS isActive, last_seen_at AS lastSeenAt
     FROM studio_push_devices
     WHERE token = ? AND user_id = ?
     LIMIT 1`,
    [safeToken, safeUserId]
  );

  return { ok: true, device: row || null };
}

export async function unregisterPushDevice({ userId, token } = {}) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) throw createHttpError("로그인이 필요합니다.", 401);

  const safeToken = normalizePushToken(token);
  const result = await query(
    `UPDATE studio_push_devices
     SET is_active = 0, updated_at = NOW()
     WHERE user_id = ? AND token = ?`,
    [safeUserId, safeToken]
  );

  return { ok: true, updated: Number(result?.affectedRows || 0) > 0 };
}

export async function enqueueNotificationDeliveries({
  notifications = [],
  channels = [],
  scheduledAt = null,
  status = "pending",
} = {}) {
  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const safeChannels = Array.isArray(channels) ? channels : [];
  if (!safeNotifications.length || !safeChannels.length) return { queuedCount: 0 };

  await withTransaction(async (conn) => {
    for (const notification of safeNotifications) {
      const notificationId = notification.id || randomUUID();
      await conn.execute(
        `INSERT INTO studio_notifications
           (id, user_id, type, title, message, status, scheduled_at, sent_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NOW())`,
        [
          notificationId,
          String(notification.userId || "").trim(),
          String(notification.type || "manual").trim().slice(0, 60),
          String(notification.title || "").trim().slice(0, 160),
          String(notification.message || "").trim(),
          status,
          scheduledAt,
        ]
      );

      for (const channel of safeChannels) {
        await conn.execute(
          `INSERT INTO studio_notification_deliveries
             (id, notification_id, channel, recipient_user_id, recipient_name, recipient_phone,
              template_code, status, attempts, next_attempt_at, scheduled_at, sent_at,
              provider_message_id, error_message, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, NULL, NULL, NOW(), NOW())`,
          [
            randomUUID(),
            notificationId,
            String(channel.channel || "sms").trim().slice(0, 20),
            String(notification.userId || "").trim() || null,
            notification.recipientName || null,
            notification.recipientPhone || null,
            channel.templateCode || null,
            channel.status || status,
            scheduledAt,
            scheduledAt,
          ]
        );
      }
    }
  });

  return { queuedCount: safeNotifications.length * safeChannels.length };
}

/**
 * 정지 기간이 끝난 수강권을 다시 사용 가능 상태로 되돌립니다.
 * 이미 처리한 정지 이력은 processed_at으로 걸러 반복 실행에도 중복 처리되지 않습니다.
 */
export async function restoreExpiredPassPauses({ limit = 300 } = {}) {
  const rows = await query(
    `SELECT id, pass_id AS passId
     FROM studio_pass_pauses
     WHERE processed_at IS NULL AND end_date < CURDATE()
     ORDER BY end_date ASC
     LIMIT ${Math.max(1, Math.min(1000, Math.round(Number(limit) || 300)))}`
  );

  let restoredPassCount = 0;
  for (const row of rows) {
    await withTransaction(async (conn) => {
      const [claimed] = await conn.execute(
        `UPDATE studio_pass_pauses SET processed_at = NOW() WHERE id = ? AND processed_at IS NULL`,
        [row.id]
      );
      if (Number(claimed?.affectedRows || 0) !== 1) return;
      const [updated] = await conn.execute(
        `UPDATE studio_passes SET status = 'active', updated_at = NOW() WHERE id = ? AND status = 'paused'`,
        [row.passId]
      );
      if (Number(updated?.affectedRows || 0) > 0) restoredPassCount += 1;
    });
  }

  return { restoredPassCount };
}

/**
 * 예약 시각이 도래한 대기 건을 발송 대상으로 확정하고,
 * 처리 도중 프로세스가 끊겨 processing으로 남은 건을 되돌립니다.
 */
export async function materializePendingNotifications({ limit = 300 } = {}) {
  const safeLimit = Math.max(1, Math.min(1000, Math.round(Number(limit) || 300)));

  const recovered = await query(
    `UPDATE studio_notification_deliveries
     SET status = 'retry',
         next_attempt_at = NOW(),
         updated_at = NOW()
     WHERE status = 'processing'
       AND updated_at < DATE_SUB(NOW(), INTERVAL ${STALE_PROCESSING_MINUTES} MINUTE)
       AND attempts < ${MAX_DELIVERY_ATTEMPTS}
     LIMIT ${safeLimit}`
  );

  const materialized = await query(
    `UPDATE studio_notification_deliveries
     SET next_attempt_at = COALESCE(next_attempt_at, scheduled_at, NOW()),
         updated_at = NOW()
     WHERE status = 'pending'
       AND next_attempt_at IS NULL
       AND (scheduled_at IS NULL OR scheduled_at <= NOW())
     LIMIT ${safeLimit}`
  );

  return {
    recoveredStaleCount: Number(recovered?.affectedRows || 0),
    materializedCount: Number(materialized?.affectedRows || 0),
  };
}

async function loadDeliveryContext(deliveryId) {
  const delivery = await queryOne(
    `SELECT d.id, d.notification_id AS notificationId, d.channel, d.attempts,
            d.recipient_user_id AS userId, d.template_code AS templateCode,
            n.title, n.message, n.type
     FROM studio_notification_deliveries d
     JOIN studio_notifications n ON n.id = d.notification_id
     WHERE d.id = ?
     LIMIT 1`,
    [deliveryId]
  );
  if (!delivery) return null;

  const member = await queryOne(
    `SELECT account_status AS accountStatus FROM users WHERE id = ? LIMIT 1`,
    [delivery.userId || ""]
  );
  // 대기열에 들어간 뒤 회원이 로그아웃했을 수 있으므로 발송 직전에 다시 조회합니다.
  // user_id 조건이 있어 토큰이 다른 회원에게 재등록된 경우에도 이 회원 기기만 나옵니다.
  const devices = await query(
    `SELECT id, token, platform
     FROM studio_push_devices
     WHERE user_id = ? AND is_active = 1 AND token IS NOT NULL AND TRIM(token) <> ''
     ORDER BY last_seen_at DESC`,
    [delivery.userId || ""]
  );

  return { delivery, member, devices };
}

async function finalizeDelivery({ deliveryId, status, providerMessageId = null, errorMessage = null, nextAttemptAt = null }) {
  await query(
    `UPDATE studio_notification_deliveries
     SET status = ?,
         sent_at = ${status === "sent" ? "NOW()" : "sent_at"},
         provider_message_id = ?,
         error_message = ?,
         next_attempt_at = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [status, providerMessageId, errorMessage ? redactErrorMessage(errorMessage) : null, nextAttemptAt, deliveryId]
  );
}

/** 알림 한 건의 채널 결과가 모두 정리되면 상위 알림 상태를 맞춥니다. */
async function syncNotificationStatus(notificationId) {
  const summary = await queryOne(
    `SELECT
       SUM(status = 'sent') AS sentCount,
       SUM(status IN ('pending','retry','processing')) AS openCount
     FROM studio_notification_deliveries
     WHERE notification_id = ?`,
    [notificationId]
  );
  if (Number(summary?.openCount || 0) > 0) return;

  const nextStatus = Number(summary?.sentCount || 0) > 0 ? "sent" : "failed";
  await query(
    `UPDATE studio_notifications
     SET status = ?, sent_at = ${nextStatus === "sent" ? "NOW()" : "sent_at"}
     WHERE id = ?`,
    [nextStatus, notificationId]
  );
}

/**
 * 발송 대기열에 쌓인 앱 푸시를 실제로 전송합니다.
 * 같은 건을 두 워커가 함께 집지 않도록 조건부 UPDATE로 원자적으로 선점합니다.
 */
export async function processDueNotificationDeliveries({
  limit = DISPATCH_BATCH_LIMIT,
  sender = sendFcmPush,
  maxAttempts = MAX_DELIVERY_ATTEMPTS,
  now = () => new Date(),
} = {}) {
  const batchLimit = Math.max(1, Math.min(DISPATCH_BATCH_LIMIT, Math.round(Number(limit) || DISPATCH_BATCH_LIMIT)));
  const attemptCeiling = Math.max(1, Math.min(MAX_DELIVERY_ATTEMPTS, Math.round(Number(maxAttempts) || MAX_DELIVERY_ATTEMPTS)));

  const candidates = await query(
    `SELECT id
     FROM studio_notification_deliveries
     WHERE channel = 'push'
       AND status IN ('pending','retry')
       AND attempts < ${attemptCeiling}
       AND (scheduled_at IS NULL OR scheduled_at <= NOW())
       AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
     ORDER BY COALESCE(next_attempt_at, scheduled_at, created_at) ASC
     LIMIT ${batchLimit}`
  );

  const result = {
    processedCount: 0,
    sentCount: 0,
    failedCount: 0,
    retryCount: 0,
    skippedCount: 0,
    configurationError: false,
  };

  for (const candidate of candidates) {
    const claim = await query(
      `UPDATE studio_notification_deliveries
       SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
       WHERE id = ? AND status IN ('pending','retry') AND attempts < ${attemptCeiling}`,
      [candidate.id]
    );
    if (Number(claim?.affectedRows || 0) !== 1) continue;

    result.processedCount += 1;
    const context = await loadDeliveryContext(candidate.id);
    if (!context) {
      await finalizeDelivery({ deliveryId: candidate.id, status: "failed", errorMessage: "알림 정보를 찾을 수 없습니다." });
      result.failedCount += 1;
      continue;
    }

    const { delivery, member, devices } = context;

    // 탈퇴·정지 회원과 기기 등록을 해제한 회원은 실패가 아니라 제외로 처리합니다.
    if (!member || String(member.accountStatus) !== "active") {
      await finalizeDelivery({ deliveryId: delivery.id, status: "skipped", errorMessage: "수신 대상 회원이 활성 상태가 아닙니다." });
      result.skippedCount += 1;
      await syncNotificationStatus(delivery.notificationId);
      continue;
    }
    if (!devices.length) {
      await finalizeDelivery({ deliveryId: delivery.id, status: "skipped", errorMessage: "활성화된 앱 푸시 기기가 없습니다." });
      result.skippedCount += 1;
      await syncNotificationStatus(delivery.notificationId);
      continue;
    }

    let sentMessageId = null;
    let lastError = null;
    let classification = null;

    for (const device of devices) {
      try {
        const sendResult = await sender({
          token: device.token,
          title: delivery.title,
          message: delivery.message,
          data: { path: "/mypage", type: String(delivery.type || "manual") },
        });
        sentMessageId = sentMessageId || String(sendResult?.msgId || "");
      } catch (error) {
        lastError = error;
        classification = classifySendError(error);
        if (classification.invalidToken) {
          // 토큰이 무효한 기기만 해제합니다. 다른 기기는 계속 시도합니다.
          await query(`UPDATE studio_push_devices SET is_active = 0, updated_at = NOW() WHERE id = ?`, [device.id]);
        }
        if (classification.configuration) break;
      }
    }

    if (sentMessageId !== null) {
      await finalizeDelivery({ deliveryId: delivery.id, status: "sent", providerMessageId: sentMessageId || null });
      result.sentCount += 1;
      await syncNotificationStatus(delivery.notificationId);
      continue;
    }

    // 자격증명·프로젝트 설정 문제는 수신자를 바꿔도 실패하므로 batch를 즉시 멈춥니다.
    if (classification?.configuration) {
      await finalizeDelivery({
        deliveryId: delivery.id,
        status: "pending",
        errorMessage: `발송 설정 오류: ${lastError?.message || classification.code}`,
        nextAttemptAt: null,
      });
      await query(
        `UPDATE studio_notification_deliveries SET attempts = GREATEST(attempts - 1, 0), updated_at = NOW() WHERE id = ?`,
        [delivery.id]
      );
      result.processedCount -= 1;
      result.configurationError = true;
      console.error("[notification-worker] 발송 설정 오류로 batch를 중단합니다:", classification.code);
      break;
    }

    // delivery.attempts는 위 claim에서 이미 증가한 값이라 그대로 사용합니다.
    const attemptsUsed = Number(delivery.attempts || 1);
    const nextAttemptAt = classification?.retryable ? resolveNextAttemptAt(attemptsUsed, now()) : null;

    if (nextAttemptAt) {
      await finalizeDelivery({
        deliveryId: delivery.id,
        status: "retry",
        errorMessage: lastError?.message || "앱 푸시 발송에 실패했습니다.",
        nextAttemptAt,
      });
      result.retryCount += 1;
      continue;
    }

    await finalizeDelivery({
      deliveryId: delivery.id,
      status: "failed",
      errorMessage: lastError?.message || "앱 푸시 발송에 실패했습니다.",
    });
    result.failedCount += 1;
    await syncNotificationStatus(delivery.notificationId);
  }

  return result;
}

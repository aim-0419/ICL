import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../shared/db/mysql.js";

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

import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { query, queryOne, withTransaction } from "../../shared/db/mysql.js";
import { decryptPii, encryptPii } from "../../shared/security/pii.js";
import { sendFcmPush } from "./fcm.service.js";
import { sendKakaoAlimtok, sendSmsAligo } from "./sms.service.js";

const CHANNELS = new Set(["sms", "kakao", "push"]);
const AUTO_TEMPLATE_MAP = {
  booking_confirmed: "class_waitlist",
  booking_waitlisted: "class_waitlist",
  waitlist_promoted: "class_waitlist",
  booking_cancelled: "class_cancelled",
  class_cancelled: "class_cancelled",
  pass_expire: "pass_expire",
  pass_count_expire: "pass_count_expire",
  class_reminder: "class_reminder",
  member_birthday: "member_birthday",
  locker_expire: "locker_expire",
  pass_pause_expire: "pass_pause_expire",
  pass_pause_resumed: "pass_pause_expire",
};

function normalizeChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  if (!CHANNELS.has(channel)) {
    const error = new Error("지원하지 않는 알림 채널입니다.");
    error.status = 400;
    throw error;
  }
  return channel;
}

function normalizeScheduledAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("예약 발송 시간이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }
  // mysql2가 연결 시간대(+09:00)에 맞춰 변환하도록 Date 객체를 그대로 전달합니다.
  return date;
}

async function getUserRecipient(userId) {
  if (!userId) return null;
  const row = await queryOne(`SELECT id, name, phone FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (!row) return null;
  return { userId: row.id, name: decryptPii(row.name), phone: decryptPii(row.phone) };
}

export async function queueNotificationBatch({
  channel,
  receivers,
  title = "",
  message,
  scheduledAt = null,
  type = "manual",
  templateCode = "",
}) {
  const normalizedChannel = normalizeChannel(channel);
  const safeReceivers = Array.isArray(receivers) ? receivers.filter(Boolean) : [];
  const safeMessage = String(message || "").trim();
  const safeTitle = String(title || "").trim();
  const safeScheduledAt = normalizeScheduledAt(scheduledAt);
  if (!safeReceivers.length) throw Object.assign(new Error("수신자가 없습니다."), { status: 400 });
  if (!safeMessage) throw Object.assign(new Error("메시지를 입력해 주세요."), { status: 400 });

  return withTransaction(async (conn) => {
    const deliveryIds = [];
    for (const receiver of safeReceivers) {
      const notificationId = randomUUID();
      const deliveryId = randomUUID();
      const userId = String(receiver.userId || receiver.id || "").trim();
      const receiverName = String(receiver.name || "").trim();
      const receiverPhone = String(receiver.phone || "").trim();
      await conn.execute(
        `INSERT INTO studio_notifications
          (id, user_id, type, title, message, status, scheduled_at, sent_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, NOW())`,
        [notificationId, userId, String(type || "manual"), safeTitle, safeMessage, safeScheduledAt]
      );
      await conn.execute(
        `INSERT INTO studio_notification_deliveries
          (id, notification_id, channel, recipient_user_id, recipient_name, recipient_phone,
           template_code, status, attempts, next_attempt_at, scheduled_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, ?, NOW(), NOW())`,
        [
          deliveryId,
          notificationId,
          normalizedChannel,
          userId || null,
          receiverName ? encryptPii(receiverName) : null,
          receiverPhone ? encryptPii(receiverPhone) : null,
          String(templateCode || "").trim() || null,
          safeScheduledAt,
        ]
      );
      deliveryIds.push(deliveryId);
    }
    return { queuedCount: deliveryIds.length, deliveryIds, scheduledAt: safeScheduledAt };
  });
}

async function markNotificationFromDeliveries(notificationId) {
  const summary = await queryOne(
    `SELECT
       SUM(status = 'sent') AS sentCount,
       SUM(status IN ('pending','processing','failed')) AS openCount,
       SUM(status = 'skipped') AS skippedCount
     FROM studio_notification_deliveries WHERE notification_id = ?`,
    [notificationId]
  );
  if (Number(summary?.openCount || 0) > 0) return;
  const status = Number(summary?.sentCount || 0) > 0 ? "sent" : "failed";
  await query(
    `UPDATE studio_notifications SET status = ?, sent_at = IF(? = 'sent', NOW(), sent_at) WHERE id = ?`,
    [status, status, notificationId]
  );
}

async function deliverPush(row) {
  if (!row.recipientUserId) {
    const error = new Error("앱 푸시를 받을 회원 번호가 없습니다.");
    error.code = "PUSH_USER_REQUIRED";
    throw error;
  }
  const devices = await query(
    `SELECT id, token FROM studio_push_devices WHERE user_id = ? AND is_active = 1`,
    [row.recipientUserId]
  );
  if (!devices.length) {
    const error = new Error("등록된 앱 푸시 기기가 없습니다.");
    error.code = "PUSH_DEVICE_NOT_FOUND";
    error.skip = true;
    throw error;
  }
  const results = [];
  for (const device of devices) {
    try {
      results.push(await sendFcmPush({
        token: device.token,
        title: row.title,
        message: row.message,
        data: { notificationId: row.notificationId, type: row.type },
      }));
    } catch (error) {
      if ([400, 404].includes(Number(error.status || 0))) {
        await query(`UPDATE studio_push_devices SET is_active = 0, updated_at = NOW() WHERE id = ?`, [device.id]);
      }
      throw error;
    }
  }
  return { provider: "fcm", msgId: results.map((item) => item.msgId).filter(Boolean).join(","), successCnt: results.length };
}

async function sendDelivery(row) {
  const receiver = [{
    phone: decryptPii(row.recipientPhone),
    name: decryptPii(row.recipientName),
    userId: row.recipientUserId,
  }];
  if (row.channel === "sms") return sendSmsAligo({ receivers: receiver, message: row.message, title: row.title });
  if (row.channel === "kakao") {
    return sendKakaoAlimtok({
      receivers: receiver,
      message: row.message,
      title: row.title,
      templateCode: row.templateCode || "",
    });
  }
  return deliverPush(row);
}

export async function processNotificationDelivery(deliveryId) {
  const claimed = await query(
    `UPDATE studio_notification_deliveries
     SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
     WHERE id = ? AND status IN ('pending','failed')
       AND (scheduled_at IS NULL OR scheduled_at <= NOW())
       AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())`,
    [deliveryId]
  );
  if (!Number(claimed?.affectedRows || 0)) return { processed: false };

  const row = await queryOne(
    `SELECT d.id, d.notification_id AS notificationId, d.channel,
            d.recipient_user_id AS recipientUserId, d.recipient_name AS recipientName,
            d.recipient_phone AS recipientPhone, d.template_code AS templateCode,
            d.attempts, n.type, n.title, n.message
     FROM studio_notification_deliveries d
     JOIN studio_notifications n ON n.id = d.notification_id
     WHERE d.id = ? LIMIT 1`,
    [deliveryId]
  );
  if (!row) return { processed: false };

  try {
    const result = await sendDelivery(row);
    await query(
      `UPDATE studio_notification_deliveries
       SET status = 'sent', sent_at = NOW(), provider_message_id = ?, error_message = NULL, updated_at = NOW()
       WHERE id = ?`,
      [String(result?.msgId || "").slice(0, 180) || null, deliveryId]
    );
    await query(
      `INSERT INTO studio_notification_logs
        (id, notification_id, channel, result_status, provider_message_id, error_message, created_at)
       VALUES (?, ?, ?, 'sent', ?, NULL, NOW())`,
      [randomUUID(), row.notificationId, row.channel, String(result?.msgId || "").slice(0, 120) || null]
    );
    await markNotificationFromDeliveries(row.notificationId);
    return { processed: true, sent: true, result };
  } catch (error) {
    const attempts = Number(row.attempts || 1);
    const maxAttempts = Math.max(1, Number(env.notificationMaxAttempts || 10));
    const skipped = Boolean(error?.skip);
    const exhausted = attempts >= maxAttempts;
    const status = skipped ? "skipped" : exhausted ? "exhausted" : "failed";
    const retryMinutes = Math.min(360, Math.max(1, 2 ** Math.min(attempts, 8)));
    await query(
      `UPDATE studio_notification_deliveries
       SET status = ?, next_attempt_at = ?, error_message = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        status,
        skipped || exhausted ? null : new Date(Date.now() + retryMinutes * 60_000),
        String(error?.message || "발송 실패").slice(0, 500),
        deliveryId,
      ]
    );
    await query(
      `INSERT INTO studio_notification_logs
        (id, notification_id, channel, result_status, provider_message_id, error_message, created_at)
       VALUES (?, ?, ?, 'failed', NULL, ?, NOW())`,
      [randomUUID(), row.notificationId, row.channel, String(error?.message || "발송 실패").slice(0, 255)]
    );
    if (skipped || exhausted) await markNotificationFromDeliveries(row.notificationId);
    return { processed: true, sent: false, skipped, error };
  }
}

export async function processDueNotificationDeliveries({ limit = 100 } = {}) {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(Number(limit || 100))));
  const rows = await query(
    `SELECT id FROM studio_notification_deliveries
     WHERE status IN ('pending','failed')
       AND (scheduled_at IS NULL OR scheduled_at <= NOW())
       AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
     ORDER BY COALESCE(scheduled_at, created_at) ASC
     LIMIT ${safeLimit}`
  );
  const results = [];
  for (const row of rows) results.push(await processNotificationDelivery(row.id));
  return { processedCount: results.filter((item) => item.processed).length, sentCount: results.filter((item) => item.sent).length };
}

async function resolveAutomaticChannels(notificationType) {
  const templateId = AUTO_TEMPLATE_MAP[String(notificationType || "")] || String(notificationType || "");
  const template = await queryOne(
    `SELECT push_enabled AS pushEnabled, sms_enabled AS smsEnabled,
            kakao_enabled AS kakaoEnabled, kakao_template_code AS kakaoTemplateCode
     FROM studio_notification_templates WHERE template_id = ? LIMIT 1`,
    [templateId]
  );
  const channels = [];
  if (template ? Boolean(Number(template.pushEnabled)) : true) channels.push({ channel: "push", templateCode: "" });
  if (template ? Boolean(Number(template.smsEnabled)) : false) channels.push({ channel: "sms", templateCode: "" });
  if (template ? Boolean(Number(template.kakaoEnabled)) : false) {
    channels.push({ channel: "kakao", templateCode: String(template.kakaoTemplateCode || "") });
  }
  return channels;
}

export async function materializePendingNotifications({ limit = 200 } = {}) {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(Number(limit || 200))));
  const notifications = await query(
    `SELECT n.id, n.user_id AS userId, n.type, n.scheduled_at AS scheduledAt
     FROM studio_notifications n
     LEFT JOIN studio_notification_deliveries d ON d.notification_id = n.id
     WHERE n.status = 'pending' AND d.id IS NULL
     ORDER BY n.created_at ASC LIMIT ${safeLimit}`
  );
  let createdCount = 0;
  for (const notification of notifications) {
    const recipient = await getUserRecipient(notification.userId);
    if (!recipient) {
      await query(`UPDATE studio_notifications SET status = 'failed' WHERE id = ?`, [notification.id]);
      continue;
    }
    const channels = await resolveAutomaticChannels(notification.type);
    if (!channels.length) {
      await query(`UPDATE studio_notifications SET status = 'sent', sent_at = NOW() WHERE id = ?`, [notification.id]);
      continue;
    }
    for (const delivery of channels) {
      await query(
        `INSERT INTO studio_notification_deliveries
          (id, notification_id, channel, recipient_user_id, recipient_name, recipient_phone,
           template_code, status, attempts, scheduled_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, NOW(), NOW())`,
        [
          randomUUID(), notification.id, delivery.channel, recipient.userId,
          encryptPii(recipient.name), encryptPii(recipient.phone), delivery.templateCode || null,
          notification.scheduledAt || null,
        ]
      );
      createdCount += 1;
    }
  }
  return { createdCount };
}

async function createAutoNotificationIfMissing({ userId, type, title, message, scheduledAt = null }) {
  const existing = await queryOne(
    `SELECT id FROM studio_notifications
     WHERE user_id = ? AND type = ? AND message = ? AND created_at >= CURRENT_DATE()
     LIMIT 1`,
    [userId, type, message]
  );
  if (existing) return false;
  await query(
    `INSERT INTO studio_notifications
      (id, user_id, type, title, message, status, scheduled_at, sent_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, NOW())`,
    [randomUUID(), userId, type, title, message, scheduledAt]
  );
  return true;
}

function renderAutomaticMessage(template, fallback, values = {}) {
  let message = String(template?.message || fallback || "");
  for (const [key, value] of Object.entries(values)) {
    message = message.replaceAll(`[[${key}]]`, String(value ?? ""));
  }
  return message;
}

export async function generateAutomaticNotifications() {
  const templates = await query(`SELECT * FROM studio_notification_templates`);
  const templateMap = new Map(templates.map((row) => [row.template_id, row]));
  let createdCount = 0;

  const passDays = Number(templateMap.get("pass_expire")?.param1 ?? 5);
  const expiringPasses = await query(
    `SELECT sp.user_id AS userId, sp.pass_name AS passName, u.name AS userName,
            DATEDIFF(sp.expires_at, CURRENT_DATE()) AS remainingDays
     FROM studio_passes sp
     JOIN users u ON u.id = sp.user_id
     WHERE sp.status = 'active' AND sp.expires_at IS NOT NULL
       AND DATEDIFF(sp.expires_at, CURRENT_DATE()) = ?`,
    [passDays]
  );
  for (const row of expiringPasses) {
    createdCount += Number(await createAutoNotificationIfMissing({
      userId: row.userId,
      type: "pass_expire",
      title: "수강권 만료 예정",
      message: renderAutomaticMessage(templateMap.get("pass_expire"), `${row.passName || "수강권"} 만료일까지 ${row.remainingDays}일 남았습니다.`, {
        회원명: decryptPii(row.userName), 수강권명: row.passName || "수강권", "수강권 잔여일": row.remainingDays,
      }),
    }));
  }

  const passCount = Number(templateMap.get("pass_count_expire")?.param1 ?? 5);
  const lowPasses = await query(
    `SELECT sp.user_id AS userId, sp.pass_name AS passName, sp.remaining_count AS remainingCount,
            u.name AS userName
     FROM studio_passes sp JOIN users u ON u.id = sp.user_id
     WHERE sp.status = 'active' AND sp.remaining_count = ?`,
    [passCount]
  );
  for (const row of lowPasses) {
    createdCount += Number(await createAutoNotificationIfMissing({
      userId: row.userId,
      type: "pass_count_expire",
      title: "수강권 잔여 횟수 안내",
      message: renderAutomaticMessage(templateMap.get("pass_count_expire"), `${row.passName || "수강권"} 잔여 횟수가 ${row.remainingCount}회 남았습니다.`, {
        회원명: decryptPii(row.userName), 수강권명: row.passName || "수강권", "수강권 잔여횟수": row.remainingCount,
      }),
    }));
  }

  const reminderHours = Math.max(1, Number(templateMap.get("class_reminder")?.param1 ?? 3));
  const reminders = await query(
    `SELECT sb.user_id AS userId, sc.title, sc.start_at AS startAt
     FROM studio_bookings sb
     JOIN studio_classes sc ON sc.id = sb.class_id
     WHERE sb.status = 'reserved' AND sc.status = 'scheduled'
       AND sc.start_at >= DATE_ADD(NOW(), INTERVAL ? HOUR)
       AND sc.start_at < DATE_ADD(NOW(), INTERVAL ? HOUR)`,
    [reminderHours, reminderHours + 1]
  );
  for (const row of reminders) {
    const startText = new Date(row.startAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    createdCount += Number(await createAutoNotificationIfMissing({
      userId: row.userId,
      type: "class_reminder",
      title: "수업 일정 알림",
      message: renderAutomaticMessage(templateMap.get("class_reminder"), `${startText} ${row.title || "수업"} 일정이 있습니다.`, {
        "수업 시작시간": startText, 수업명: row.title || "수업",
      }),
    }));
  }

  const birthdays = await query(
    `SELECT smp.user_id AS userId, u.name AS userName
     FROM studio_member_profiles smp JOIN users u ON u.id = smp.user_id
     WHERE smp.birth_date IS NOT NULL AND MONTH(smp.birth_date) = MONTH(CURRENT_DATE()) AND DAY(smp.birth_date) = DAY(CURRENT_DATE())`
  );
  for (const row of birthdays) {
    createdCount += Number(await createAutoNotificationIfMissing({
      userId: row.userId,
      type: "member_birthday",
      title: "생일 축하 안내",
      message: renderAutomaticMessage(templateMap.get("member_birthday"), "생일을 축하드립니다. 행복한 하루 보내세요!", {
        회원명: decryptPii(row.userName),
      }),
    }));
  }

  const lockerDays = Number(templateMap.get("locker_expire")?.param1 ?? 3);
  const lockers = await query(
    `SELECT sla.user_id AS userId, sl.locker_no AS lockerNo, u.name AS userName,
            DATEDIFF(sla.end_date, CURRENT_DATE()) AS remainingDays
     FROM studio_locker_assignments sla
     JOIN studio_lockers sl ON sl.id = sla.locker_id
     JOIN users u ON u.id = sla.user_id
     WHERE sla.status = 'active' AND sla.end_date IS NOT NULL
       AND DATEDIFF(sla.end_date, CURRENT_DATE()) = ?`,
    [lockerDays]
  );
  for (const row of lockers) {
    createdCount += Number(await createAutoNotificationIfMissing({
      userId: row.userId,
      type: "locker_expire",
      title: "락커 만료 예정",
      message: renderAutomaticMessage(templateMap.get("locker_expire"), `${row.lockerNo}번 락커 만료일까지 ${row.remainingDays}일 남았습니다.`, {
        회원명: decryptPii(row.userName), "락커 번호": row.lockerNo, "락커 종료일": row.remainingDays,
      }),
    }));
  }

  const pauseDays = Number(templateMap.get("pass_pause_expire")?.param1 ?? 3);
  const endingPauses = await query(
    `SELECT spp.user_id AS userId, spp.end_date AS endDate, sp.pass_name AS passName, u.name AS userName,
            DATEDIFF(spp.end_date, CURRENT_DATE()) AS remainingDays
     FROM studio_pass_pauses spp
     JOIN studio_passes sp ON sp.id = spp.pass_id
     JOIN users u ON u.id = spp.user_id
     WHERE spp.processed_at IS NULL
       AND DATEDIFF(spp.end_date, CURRENT_DATE()) = ?`,
    [pauseDays]
  );
  for (const row of endingPauses) {
    createdCount += Number(await createAutoNotificationIfMissing({
      userId: row.userId,
      type: "pass_pause_expire",
      title: "수강권 정지 종료 예정",
      message: renderAutomaticMessage(templateMap.get("pass_pause_expire"), `${row.passName || "수강권"} 정지 종료일까지 ${row.remainingDays}일 남았습니다.`, {
        회원명: decryptPii(row.userName),
        수강권명: row.passName || "수강권",
        "수강권 정지만료일": row.remainingDays,
        정지종료일: row.endDate ? new Date(row.endDate).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "",
        남은일수: row.remainingDays,
      }),
    }));
  }

  return { createdCount };
}

function calcInclusiveDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

export async function restoreExpiredPassPauses({ limit = 200 } = {}) {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(Number(limit || 200))));
  const rows = await query(
    `SELECT spp.id AS pauseId, spp.pass_id AS passId, spp.user_id AS userId,
            spp.start_date AS startDate, spp.end_date AS endDate,
            sp.pass_name AS passName, u.name AS userName
     FROM studio_pass_pauses spp
     JOIN studio_passes sp ON sp.id = spp.pass_id
     JOIN users u ON u.id = spp.user_id
     WHERE spp.processed_at IS NULL
       AND spp.end_date < CURRENT_DATE()
       AND sp.status = 'paused'
     ORDER BY spp.end_date ASC
     LIMIT ${safeLimit}`
  );

  let restoredPassPauseCount = 0;
  for (const row of rows) {
    const pauseDays = calcInclusiveDays(row.startDate, row.endDate);
    const changed = await withTransaction(async (conn) => {
      const [passResult] = await conn.execute(
        `UPDATE studio_passes
         SET status = 'active',
             expires_at = CASE
               WHEN expires_at IS NULL THEN NULL
               ELSE DATE_ADD(expires_at, INTERVAL ? DAY)
             END,
             updated_at = NOW()
         WHERE id = ? AND status = 'paused'`,
        [pauseDays, row.passId]
      );
      const [pauseResult] = await conn.execute(
        `UPDATE studio_pass_pauses
         SET processed_at = NOW()
         WHERE id = ? AND processed_at IS NULL`,
        [row.pauseId]
      );
      return Number(passResult?.affectedRows || 0) > 0 && Number(pauseResult?.affectedRows || 0) > 0;
    });
    if (!changed) continue;
    restoredPassPauseCount += 1;
    await createAutoNotificationIfMissing({
      userId: row.userId,
      type: "pass_pause_resumed",
      title: "수강권 정지 종료",
      message: `${row.passName || "수강권"} 정지 기간이 종료되어 사용 가능 상태로 변경되었습니다.`,
    });
  }

  return { restoredPassPauseCount };
}

export async function registerPushDevice({ userId, token, platform = "android", deviceName = "" }) {
  const safeToken = String(token || "").trim();
  if (!userId || !safeToken) throw Object.assign(new Error("푸시 토큰 정보가 올바르지 않습니다."), { status: 400 });
  const id = randomUUID();
  await query(
    `INSERT INTO studio_push_devices
      (id, user_id, token, platform, device_name, is_active, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform),
       device_name = VALUES(device_name), is_active = 1, last_seen_at = NOW(), updated_at = NOW()`,
    [id, userId, safeToken, String(platform || "android").slice(0, 20), String(deviceName || "").slice(0, 120)]
  );
  return { registered: true };
}

export async function unregisterPushDevice({ userId, token }) {
  await query(
    `UPDATE studio_push_devices SET is_active = 0, updated_at = NOW() WHERE user_id = ? AND token = ?`,
    [userId, String(token || "").trim()]
  );
  return { unregistered: true };
}

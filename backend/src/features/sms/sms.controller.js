// 파일 역할: 관리자 문자/알림톡 발송 요청, 발송 이력 조회, 발송 설정 확인 API를 처리합니다.
import * as notificationDispatch from "./notification-dispatch.service.js";
import { getFcmConfigurationStatus } from "./fcm.service.js";
import { query } from "../../shared/db/mysql.js";
import { env } from "../../config/env.js";

function parseHistoryLimit(value) {
  const parsed = Number(value || 100);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(500, Math.floor(parsed));
}

/**
 * POST /api/sms/send
 * body: { channel, receivers: [{phone, name, userId?}], message, title? }
 */
export async function sendSms(req, res, next) {
  try {
    const { channel = "sms", receivers, message, title = "" } = req.body || {};

    if (!Array.isArray(receivers) || receivers.length === 0) {
      return res.status(400).json({ message: "수신자가 없습니다." });
    }
    if (!String(message || "").trim()) {
      return res.status(400).json({ message: "메시지를 입력해 주세요." });
    }

    const queued = await notificationDispatch.queueNotificationBatch({
      channel,
      receivers,
      message: String(message),
      title: String(title),
      type: `manual_${channel}`,
      templateCode: req.body.templateCode || "",
    });
    const results = [];
    for (const deliveryId of queued.deliveryIds) {
      results.push(await notificationDispatch.processNotificationDelivery(deliveryId));
    }
    const sentCount = results.filter((item) => item.sent).length;
    const skippedCount = results.filter((item) => item.skipped).length;
    const failedCount = queued.queuedCount - sentCount - skippedCount;
    res.json({
      ok: failedCount === 0,
      queuedCount: queued.queuedCount,
      successCnt: sentCount,
      errorCnt: failedCount,
      skippedCnt: skippedCount,
      channel,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/sms/schedule - SMS·알림톡·앱 푸시를 DB 발송 대기열에 예약합니다. */
export async function scheduleMessage(req, res, next) {
  try {
    const { channel = "sms", receivers, message, title = "", scheduledAt, templateCode = "" } = req.body || {};
    if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) {
      return res.status(400).json({ message: "현재 이후의 예약 발송 시간을 입력해 주세요." });
    }
    const result = await notificationDispatch.queueNotificationBatch({
      channel,
      receivers,
      message,
      title,
      scheduledAt,
      type: `scheduled_${channel}`,
      templateCode,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sms/history
 * 최근 수동 발송 이력 조회 (수신자 이름 포함)
 */
export async function getSmsHistory(req, res, next) {
  try {
    const limit = parseHistoryLimit(req.query.limit);
    const rows = await query(
      `SELECT n.id, n.user_id AS userId, n.title, n.message, n.status,
              n.created_at AS createdAt,
              l.channel, l.result_status AS resultStatus,
              l.provider_message_id AS providerMsgId,
              u.name AS userName
       FROM studio_notifications n
       LEFT JOIN studio_notification_logs l ON l.notification_id = n.id
       LEFT JOIN users u ON u.id = n.user_id
       WHERE n.type LIKE 'manual_%'
       ORDER BY n.created_at DESC
       LIMIT ${limit}`
    );
    res.json({ items: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sms/auto-history
 * 자동 발송(알림) 이력 조회 - pass_expiry, class_reminder 등
 */
export async function getAutoHistory(req, res, next) {
  try {
    const limit = parseHistoryLimit(req.query.limit);
    const typeFilter = req.query.type ? String(req.query.type) : null;

    let whereClause = "WHERE n.type NOT LIKE 'manual_%' AND n.type NOT LIKE 'scheduled_%' AND n.type <> 'manual'";
    const params = [];
    if (typeFilter) {
      whereClause += " AND n.type = ?";
      params.push(typeFilter);
    }
    const rows = await query(
      `SELECT n.id, n.user_id AS userId, n.type, n.title, n.message, n.status,
              n.created_at AS sentAt,
              l.channel, l.result_status AS resultStatus,
              u.name AS userName
       FROM studio_notifications n
       LEFT JOIN studio_notification_logs l ON l.notification_id = n.id
       LEFT JOIN users u ON u.id = n.user_id
       ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT ${limit}`,
      params
    );
    res.json({ items: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sms/config
 * API 키 설정 여부 + 발신번호 반환 (테스트 모드 확인용)
 */
export async function getSmsConfig(req, res, next) {
  try {
    const fcm = getFcmConfigurationStatus();
    res.json({
      aligoConfigured: !!(env.aligoApiKey && env.aligoUserId && env.aligoSender),
      kakaoConfigured: !!(env.kakaoSenderKey && env.aligoApiKey && env.aligoUserId),
      sender: env.aligoSender || "",
      testMode: env.nodeEnv !== "production",
      fcmConfigured: fcm.configured,
      fcmProjectId: fcm.projectId,
      schedulerEnabled: env.notificationSchedulerEnabled,
    });
  } catch (error) {
    next(error);
  }
}

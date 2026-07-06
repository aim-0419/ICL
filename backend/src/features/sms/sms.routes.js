import express, { Router } from "express";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { requireAuth, isAdminUser } from "../../shared/middlewares/auth.js";
import { query } from "../../shared/db/mysql.js";
import { decryptPii, encryptPii, normalizePhone } from "../../shared/security/pii.js";
import * as studioService from "../studio/studio.service.js";
import { enqueueNotificationDeliveries } from "./notification-dispatch.service.js";

export const smsRoutes = Router();

const ALLOWED_CHANNELS = new Set(["sms", "kakao", "push"]);
const MAX_RECEIVERS = 100;
const MAX_MESSAGE_LENGTH = 2000;

function createHttpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sanitizeText(value, maxLength = 2000) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeChannel(value) {
  const channel = String(value || "sms").trim().toLowerCase();
  if (!ALLOWED_CHANNELS.has(channel)) throw createHttpError("지원하지 않는 발송 채널입니다.", 400);
  return channel;
}

function maskPhone(phone) {
  const value = normalizePhone(phone);
  if (value.length < 7) return "";
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function normalizeReceivers(receivers) {
  const list = Array.isArray(receivers) ? receivers : [];
  if (!list.length) throw createHttpError("수신자를 선택해 주세요.", 400);
  if (list.length > MAX_RECEIVERS) throw createHttpError(`한 번에 최대 ${MAX_RECEIVERS}명까지 발송할 수 있습니다.`, 400);

  const normalized = list.map((item) => {
    const phone = normalizePhone(item?.phone);
    if (phone.length < 10 || phone.length > 11) return null;
    return {
      userId: String(item?.userId || item?.id || "").trim(),
      name: sanitizeText(item?.name || item?.userName || phone, 80),
      phone,
    };
  }).filter(Boolean);

  if (!normalized.length) throw createHttpError("유효한 전화번호가 있는 수신자가 없습니다.", 400);
  return normalized;
}

async function canUseCommunication(user, permissionCode) {
  if (isAdminUser(user)) return true;
  const roleCode = await studioService.resolveUserStudioRole(user);
  return studioService.isRoleAllowed(roleCode, permissionCode);
}

async function requireCommunication(permissionCode) {
  return async function communicationGuard(req, res, next) {
    try {
      if (!(await canUseCommunication(req.authUser, permissionCode))) {
        return res.status(403).json({ message: "메시지 관리 권한이 필요합니다." });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

function getProviderConfig() {
  const aligoReady = Boolean(env.aligoApiKey && env.aligoUserId && env.aligoSender);
  const kakaoReady = Boolean(env.kakaoSenderKey && env.aligoApiKey && env.aligoUserId);
  const fcmReady = Boolean(env.fcmProjectId && env.fcmClientEmail && env.fcmPrivateKey);
  const aligoConfigured = aligoReady && !env.testSafeMode && env.allowExternalSmsSend;
  const kakaoConfigured = kakaoReady && !env.testSafeMode && env.allowExternalKakaoSend;
  const fcmConfigured = fcmReady && !env.testSafeMode && env.allowExternalPushSend;
  return {
    aligoConfigured,
    kakaoConfigured,
    fcmConfigured,
    providerReady: {
      sms: aligoReady,
      kakao: kakaoReady,
      push: fcmReady,
    },
    externalSendingEnabled: {
      sms: env.allowExternalSmsSend,
      kakao: env.allowExternalKakaoSend,
      push: env.allowExternalPushSend,
    },
    safetyMode: env.testSafeMode,
    sender: env.aligoSender ? maskPhone(env.aligoSender) : "",
    testMode: env.testSafeMode || (!aligoConfigured && !kakaoConfigured && !fcmConfigured),
  };
}

function isChannelConfigured(channel) {
  const config = getProviderConfig();
  if (channel === "sms") return config.aligoConfigured;
  if (channel === "kakao") return config.kakaoConfigured;
  return config.fcmConfigured;
}

async function saveManualMessage({ channel, title, message, templateCode, receivers, scheduledAt = null, configured }) {
  const notifications = receivers.map((receiver) => ({
    id: randomUUID(),
    userId: receiver.userId,
    type: "manual",
    title,
    message,
    recipientName: encryptPii(receiver.name),
    recipientPhone: encryptPii(receiver.phone),
  }));
  const status = configured ? "pending" : "failed";
  return enqueueNotificationDeliveries({
    notifications,
    channels: [{ channel, templateCode, status }],
    scheduledAt,
    status,
  });
}

smsRoutes.use(express.json({ limit: "256kb" }));
smsRoutes.use(requireAuth);

smsRoutes.get("/config", await requireCommunication("communication.read"), (req, res) => {
  res.json(getProviderConfig());
});

smsRoutes.post("/send", await requireCommunication("communication.write"), async (req, res, next) => {
  try {
    const channel = normalizeChannel(req.body?.channel);
    const title = sanitizeText(req.body?.title, 160);
    const message = sanitizeText(req.body?.message, MAX_MESSAGE_LENGTH);
    const templateCode = sanitizeText(req.body?.templateCode, 120) || null;
    if (!message) throw createHttpError("발송할 메시지를 입력해 주세요.", 400);
    const receivers = normalizeReceivers(req.body?.receivers);
    const configured = isChannelConfigured(channel);

    await saveManualMessage({ channel, title, message, templateCode, receivers, configured });

    res.json({
      ok: configured,
      queuedCount: configured ? receivers.length : 0,
      successCnt: 0,
      errorCnt: configured ? 0 : receivers.length,
      pendingCnt: configured ? receivers.length : 0,
      message: configured
        ? "발송 대기열에 저장되었습니다."
        : "외부 발송 설정이 없어 실패 이력으로 저장했습니다.",
    });
  } catch (error) {
    next(error);
  }
});

smsRoutes.post("/schedule", await requireCommunication("communication.write"), async (req, res, next) => {
  try {
    const channel = normalizeChannel(req.body?.channel);
    const title = sanitizeText(req.body?.title, 160);
    const message = sanitizeText(req.body?.message, MAX_MESSAGE_LENGTH);
    const templateCode = sanitizeText(req.body?.templateCode, 120) || null;
    if (!message) throw createHttpError("예약 발송할 메시지를 입력해 주세요.", 400);
    const scheduledAt = new Date(req.body?.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw createHttpError("현재 이후의 예약 일시를 선택해 주세요.", 400);
    }
    const receivers = normalizeReceivers(req.body?.receivers);
    const configured = isChannelConfigured(channel);

    const result = await saveManualMessage({
      channel,
      title,
      message,
      templateCode,
      receivers,
      scheduledAt,
      configured,
    });

    res.status(201).json({
      ok: configured,
      queuedCount: configured ? result.queuedCount : 0,
      errorCnt: configured ? 0 : receivers.length,
      providerConfigured: configured,
      message: configured
        ? "예약 발송이 저장되었습니다."
        : "외부 발송 설정이 없어 예약만 저장되었습니다.",
    });
  } catch (error) {
    next(error);
  }
});

smsRoutes.get("/history", await requireCommunication("communication.read"), async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const rows = await query(
      `SELECT
         d.id,
         d.notification_id AS notificationId,
         d.channel,
         d.status AS resultStatus,
         d.created_at AS sentAt,
         d.sent_at AS deliveredAt,
         d.recipient_name AS recipientName,
         d.recipient_phone AS recipientPhone,
         n.title,
         n.message,
         n.type
       FROM studio_notification_deliveries d
       INNER JOIN studio_notifications n ON n.id = d.notification_id
       WHERE n.type = 'manual'
       ORDER BY d.created_at DESC
       LIMIT ?`,
      [limit]
    );

    res.json({
      items: (Array.isArray(rows) ? rows : []).map((row) => ({
        id: row.id,
        notificationId: row.notificationId,
        channel: row.channel,
        resultStatus: row.resultStatus,
        sentAt: row.sentAt,
        deliveredAt: row.deliveredAt,
        title: row.title,
        message: row.message,
        type: row.type,
        userName: decryptPii(row.recipientName) || "-",
        maskedPhone: maskPhone(decryptPii(row.recipientPhone)),
      })),
    });
  } catch (error) {
    next(error);
  }
});

smsRoutes.get("/auto-history", await requireCommunication("communication.read"), async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const type = sanitizeText(req.query.type, 60);
    const params = [];
    let where = "WHERE n.type <> 'manual'";
    if (type) {
      where += " AND n.type = ?";
      params.push(type);
    }
    params.push(limit);

    const rows = await query(
      `SELECT
         d.id,
         d.notification_id AS notificationId,
         d.channel,
         d.status AS resultStatus,
         d.created_at AS sentAt,
         d.sent_at AS deliveredAt,
         d.recipient_user_id AS userId,
         d.recipient_name AS recipientName,
         n.title,
         n.message,
         n.type
       FROM studio_notification_deliveries d
       INNER JOIN studio_notifications n ON n.id = d.notification_id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT ?`,
      params
    );

    res.json({
      items: (Array.isArray(rows) ? rows : []).map((row) => ({
        id: row.id,
        notificationId: row.notificationId,
        channel: row.channel,
        resultStatus: row.resultStatus,
        sentAt: row.sentAt,
        deliveredAt: row.deliveredAt,
        userId: row.userId,
        userName: decryptPii(row.recipientName) || row.userId || "-",
        title: row.title,
        message: row.message,
        type: row.type,
      })),
    });
  } catch (error) {
    next(error);
  }
});

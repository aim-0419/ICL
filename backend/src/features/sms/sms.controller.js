import * as smsService from "./sms.service.js";
import * as studioService from "../studio/studio.service.js";
import * as authService from "../auth/auth.service.js";
import { SESSION_COOKIE_NAME } from "../../shared/constants.js";
import { query } from "../../shared/db/mysql.js";
import { env } from "../../config/env.js";

function getCookieValue(req, name) {
  const header = String(req.headers.cookie || "");
  if (!header) return "";
  const item = header.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

async function getAuthUser(req) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

function isAdmin(user) {
  const role = String(user?.role || "").toLowerCase();
  const grade = String(user?.userGrade || "").toLowerCase();
  return user?.isAdmin === true || user?.isAdmin === 1 || role === "admin" || grade === "admin0" || grade === "admin1";
}

/**
 * POST /api/sms/send
 * body: { channel, receivers: [{phone, name, userId?}], message, title? }
 */
export async function sendSms(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });

    const { channel = "sms", receivers, message, title = "" } = req.body || {};

    if (!Array.isArray(receivers) || receivers.length === 0) {
      return res.status(400).json({ message: "수신자가 없습니다." });
    }
    if (!String(message || "").trim()) {
      return res.status(400).json({ message: "메시지를 입력해 주세요." });
    }

    let result;
    if (channel === "kakao") {
      result = await smsService.sendKakaoAlimtok({
        receivers,
        message: String(message),
        title: String(title),
        templateCode: req.body.templateCode || "",
      });
    } else {
      result = await smsService.sendSmsAligo({
        receivers,
        message: String(message),
        title: String(title),
      });
    }

    // 발송 이력 DB 저장 (실패해도 발송 결과에 영향 없음)
    for (const r of receivers) {
      try {
        const notif = await studioService.createNotification({
          userId: r.userId || "",
          type: "manual_sms",
          title: String(title || "수동 문자"),
          message: String(message),
          status: "sent",
        });
        await studioService.appendNotificationLog({
          notificationId: notif.id,
          channel,
          resultStatus: "sent",
          providerMessageId: result.msgId,
        });
      } catch { /* 이력 저장 실패는 무시 */ }
    }

    res.json({ ok: true, ...result });
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
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });

    const limit = Math.min(500, Number(req.query.limit || 100));
    const rows = await query(
      `SELECT n.id, n.user_id AS userId, n.title, n.message, n.status,
              n.created_at AS createdAt,
              l.channel, l.result_status AS resultStatus,
              l.provider_message_id AS providerMsgId,
              u.name AS userName
       FROM studio_notifications n
       LEFT JOIN studio_notification_logs l ON l.notification_id = n.id
       LEFT JOIN users u ON u.id = n.user_id
       WHERE n.type = 'manual_sms'
       ORDER BY n.created_at DESC
       LIMIT ${Number(limit)}`,
      []
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
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });

    const limit = Math.min(500, Number(req.query.limit || 100));
    const typeFilter = req.query.type ? String(req.query.type) : null;

    let whereClause = "WHERE n.type NOT IN ('manual_sms', 'manual')";
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
       LIMIT ${Number(limit)}`,
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
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });

    res.json({
      aligoConfigured: !!(env.aligoApiKey && env.aligoUserId && env.aligoSender),
      kakaoConfigured: !!(env.kakaoSenderKey && env.aligoApiKey && env.aligoUserId),
      sender: env.aligoSender || "",
      testMode: env.nodeEnv !== "production",
    });
  } catch (error) {
    next(error);
  }
}

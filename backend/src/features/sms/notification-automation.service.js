// 운영 조건이 충족된 회원에게 보낼 자동 알림을 만들어 발송 대기열에 넣습니다.
// 이 파일은 FCM을 직접 호출하지 않습니다. 실제 전송은 dispatch 워커가 담당합니다.
import { query, withTransaction } from "../../shared/db/mysql.js";
import { getNotificationTemplates } from "../studio/studio.service.js";
import {
  applyQuietHours,
  buildAutoNotificationId,
  buildDeliveryId,
  renderTemplateMessage,
  seoulDateKey,
} from "./notification-rules.js";

// 수신 대상은 활성 계정이면서 활성 푸시 기기를 가진 회원으로 한정합니다.
// 회원이 마이페이지에서 알림을 끄면 기기가 비활성화되므로 별도 수신 거부 필드를 만들지 않습니다.
const ELIGIBLE_RECIPIENT_SQL = `
  u.account_status = 'active'
  AND EXISTS (
    SELECT 1 FROM studio_push_devices d
    WHERE d.user_id = u.id AND d.is_active = 1 AND d.token IS NOT NULL AND TRIM(d.token) <> ''
  )`;

function templateDays(template, fallback) {
  const value = Number(template?.param1);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/**
 * 후보 한 건을 알림과 푸시 발송 레코드로 저장합니다.
 * 알림 ID를 중복 방지 키로 사용하므로 같은 조건이 다시 산출돼도 한 번만 생성됩니다.
 */
/** 이미 만들어진 이벤트 알림에 앱 푸시 발송 레코드만 붙입니다. */
async function persistDeliveryOnly(candidate, { dryRun }) {
  if (dryRun) return { created: false, duplicate: false, dryRun: true };

  const inserted = await query(
    `INSERT IGNORE INTO studio_notification_deliveries
       (id, notification_id, channel, recipient_user_id, recipient_name, recipient_phone,
        template_code, status, attempts, next_attempt_at, scheduled_at, sent_at,
        provider_message_id, error_message, created_at, updated_at)
     VALUES (?, ?, 'push', ?, NULL, NULL, ?, 'pending', 0, ?, ?, NULL, NULL, NULL, NOW(), NOW())`,
    [
      candidate.deliveryId,
      candidate.existingNotificationId,
      candidate.userId,
      candidate.templateId,
      candidate.scheduledAt,
      candidate.scheduledAt,
    ]
  );
  const created = Number(inserted?.affectedRows || 0) === 1;
  return { created, duplicate: !created, dryRun: false };
}

async function persistCandidate(candidate, { dryRun }) {
  if (dryRun) return { created: false, duplicate: false, dryRun: true };

  let created = false;
  await withTransaction(async (conn) => {
    const [inserted] = await conn.execute(
      `INSERT IGNORE INTO studio_notifications
         (id, user_id, type, title, message, status, scheduled_at, sent_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, NOW())`,
      [
        candidate.notificationId,
        candidate.userId,
        candidate.templateId,
        candidate.title,
        candidate.message,
        candidate.scheduledAt,
      ]
    );
    if (Number(inserted?.affectedRows || 0) !== 1) return;

    await conn.execute(
      `INSERT IGNORE INTO studio_notification_deliveries
         (id, notification_id, channel, recipient_user_id, recipient_name, recipient_phone,
          template_code, status, attempts, next_attempt_at, scheduled_at, sent_at,
          provider_message_id, error_message, created_at, updated_at)
       VALUES (?, ?, 'push', ?, NULL, NULL, ?, 'pending', 0, ?, ?, NULL, NULL, NULL, NOW(), NOW())`,
      [
        candidate.deliveryId,
        candidate.notificationId,
        candidate.userId,
        candidate.templateId,
        candidate.scheduledAt,
        candidate.scheduledAt,
      ]
    );
    created = true;
  });

  return { created, duplicate: !created, dryRun: false };
}

function buildCandidate({ templateId, template, sourceType, sourceId, userId, memberName, scheduledFor, variables, scheduledAt }) {
  const notificationId = buildAutoNotificationId({ templateId, sourceType, sourceId, userId, scheduledFor });
  const message = renderTemplateMessage(template.message, { 회원명: memberName || "회원", ...variables });
  return {
    templateId,
    sourceType,
    sourceId,
    userId,
    notificationId,
    deliveryId: buildDeliveryId({ notificationId, channel: "push", userId }),
    title: "이끌림 필라테스",
    message,
    scheduledAt: applyQuietHours(scheduledAt, { templateId }),
    scheduledFor,
  };
}

async function runGenerator({ templateId, template, rows, mapRow, dryRun, eventDriven = false }) {
  const summary = {
    templateId,
    source: eventDriven ? "event" : "poll",
    candidateCount: rows.length,
    excludedCount: 0,
    notificationCount: 0,
    deliveryCount: 0,
    duplicateCount: 0,
    scheduledSample: null,
  };

  if (!template?.pushEnabled) {
    summary.excludedCount = rows.length;
    summary.skippedReason = "template_push_disabled";
    return summary;
  }

  for (const row of rows) {
    const candidate = mapRow(row);
    if (!candidate) {
      summary.excludedCount += 1;
      continue;
    }
    summary.scheduledSample = summary.scheduledSample || candidate.scheduledAt.toISOString();
    const persisted = eventDriven
      ? await persistDeliveryOnly(candidate, { dryRun })
      : await persistCandidate(candidate, { dryRun });
    if (persisted.dryRun) {
      if (!eventDriven) summary.notificationCount += 1;
      summary.deliveryCount += 1;
      continue;
    }
    if (persisted.created) {
      if (!eventDriven) summary.notificationCount += 1;
      summary.deliveryCount += 1;
    } else {
      summary.duplicateCount += 1;
    }
  }

  return summary;
}

function toDateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
}

/**
 * 자동 알림 8종의 대상을 산출해 대기열에 넣습니다.
 * dryRun을 켜면 DB에 쓰지 않고 산출 결과만 돌려줍니다.
 */
export async function generateAutomaticNotifications({ dryRun = false, now = new Date() } = {}) {
  const templates = await getNotificationTemplates();
  const summaries = [];
  const todayKey = seoulDateKey(now);

  // 1. 수강권 만료 D-N
  {
    const template = templates.pass_expire;
    const days = templateDays(template, 5);
    const rows = await query(
      `SELECT p.id, p.user_id AS userId, p.pass_name AS passName, p.expires_at AS expiresAt, u.name AS memberName
       FROM studio_passes p JOIN users u ON u.id = p.user_id
       WHERE p.status = 'active' AND p.expires_at IS NOT NULL
         AND DATE(p.expires_at) = DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND ${ELIGIBLE_RECIPIENT_SQL}`,
      [days]
    );
    summaries.push(await runGenerator({
      templateId: "pass_expire", template, rows, dryRun,
      mapRow: (row) => buildCandidate({
        templateId: "pass_expire", template, sourceType: "pass", sourceId: row.id,
        userId: row.userId, memberName: row.memberName, scheduledFor: toDateKey(row.expiresAt),
        variables: { "수강권명": row.passName, "수강권 잔여일": days },
        scheduledAt: now,
      }),
    }));
  }

  // 2. 수강권 잔여 횟수 임계값 도달
  {
    const template = templates.pass_count_expire;
    const threshold = templateDays(template, 5);
    const rows = await query(
      `SELECT p.id, p.user_id AS userId, p.pass_name AS passName, p.remaining_count AS remainingCount, u.name AS memberName
       FROM studio_passes p JOIN users u ON u.id = p.user_id
       WHERE p.status = 'active' AND p.remaining_count = ?
         AND (p.expires_at IS NULL OR p.expires_at >= NOW())
         AND ${ELIGIBLE_RECIPIENT_SQL}`,
      [threshold]
    );
    summaries.push(await runGenerator({
      templateId: "pass_count_expire", template, rows, dryRun,
      mapRow: (row) => buildCandidate({
        templateId: "pass_count_expire", template, sourceType: "pass_threshold", sourceId: `${row.id}:${threshold}`,
        userId: row.userId, memberName: row.memberName, scheduledFor: String(threshold),
        variables: { "수강권명": row.passName, "수강권 잔여횟수": row.remainingCount },
        scheduledAt: now,
      }),
    }));
  }

  // 3. 수강권 정지 만료 D-N
  {
    const template = templates.pass_pause_expire;
    const days = templateDays(template, 3);
    const rows = await query(
      `SELECT pp.id, pp.pass_id AS passId, pp.user_id AS userId, pp.end_date AS endDate,
              p.pass_name AS passName, u.name AS memberName
       FROM studio_pass_pauses pp
       JOIN studio_passes p ON p.id = pp.pass_id
       JOIN users u ON u.id = pp.user_id
       WHERE pp.processed_at IS NULL
         AND pp.end_date = DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND ${ELIGIBLE_RECIPIENT_SQL}`,
      [days]
    );
    summaries.push(await runGenerator({
      templateId: "pass_pause_expire", template, rows, dryRun,
      mapRow: (row) => buildCandidate({
        templateId: "pass_pause_expire", template, sourceType: "pass_pause", sourceId: row.id,
        userId: row.userId, memberName: row.memberName, scheduledFor: toDateKey(row.endDate),
        variables: { "수강권명": row.passName, "수강권 정지만료일": days },
        scheduledAt: now,
      }),
    }));
  }

  // 4·5. 예약대기 전환과 수업 취소는 예약 트랜잭션에서 이미 알림을 만들고 있습니다.
  // 폴링으로 전환 시점을 다시 추정하지 않고, 그 알림에 앱 푸시 발송 레코드만 붙입니다.
  for (const [templateId, notificationType] of [
    ["class_waitlist", "waitlist_promoted"],
    ["class_cancelled", "class_cancelled"],
  ]) {
    const template = templates[templateId];
    const rows = await query(
      `SELECT n.id, n.user_id AS userId, n.title, n.message
       FROM studio_notifications n
       JOIN users u ON u.id = n.user_id
       WHERE n.type = ? AND n.status = 'pending'
         AND n.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
         AND NOT EXISTS (
           SELECT 1 FROM studio_notification_deliveries d
           WHERE d.notification_id = n.id AND d.channel = 'push'
         )
         AND ${ELIGIBLE_RECIPIENT_SQL}`,
      [notificationType]
    );
    summaries.push(await runGenerator({
      templateId, template, rows, dryRun, eventDriven: true,
      mapRow: (row) => ({
        templateId,
        existingNotificationId: row.id,
        userId: row.userId,
        deliveryId: buildDeliveryId({ notificationId: row.id, channel: "push", userId: row.userId }),
        // 긴급 템플릿이라 야간에도 미루지 않습니다.
        scheduledAt: applyQuietHours(now, { templateId }),
      }),
    }));
  }

  // 6. 수업 시작 N시간 전 리마인더
  {
    const template = templates.class_reminder;
    const hours = templateDays(template, 3);
    const rows = await query(
      `SELECT b.id, b.user_id AS userId, c.title AS classTitle, c.start_at AS startAt, u.name AS memberName
       FROM studio_bookings b
       JOIN studio_classes c ON c.id = b.class_id
       JOIN users u ON u.id = b.user_id
       WHERE b.status = 'reserved' AND c.status = 'active'
         AND c.start_at > NOW()
         AND c.start_at <= DATE_ADD(NOW(), INTERVAL ? HOUR)
         AND ${ELIGIBLE_RECIPIENT_SQL}`,
      [hours]
    );
    summaries.push(await runGenerator({
      templateId: "class_reminder", template, rows, dryRun,
      mapRow: (row) => buildCandidate({
        templateId: "class_reminder", template, sourceType: "booking_reminder", sourceId: row.id,
        userId: row.userId, memberName: row.memberName, scheduledFor: new Date(row.startAt).toISOString(),
        variables: { "수업 시작시간": formatClassTime(row.startAt), "수업명": row.classTitle },
        scheduledAt: now,
      }),
    }));
  }

  // 7. 생일 당일 (서울 기준)
  {
    const template = templates.member_birthday;
    const rows = await query(
      `SELECT u.id AS userId, u.name AS memberName
       FROM studio_member_profiles mp
       JOIN users u ON u.id = mp.user_id
       WHERE mp.birth_date IS NOT NULL
         AND DATE_FORMAT(mp.birth_date, '%m-%d') = DATE_FORMAT(CURDATE(), '%m-%d')
         AND ${ELIGIBLE_RECIPIENT_SQL}`
    );
    summaries.push(await runGenerator({
      templateId: "member_birthday", template, rows, dryRun,
      mapRow: (row) => buildCandidate({
        templateId: "member_birthday", template, sourceType: "member_birthday", sourceId: row.userId,
        userId: row.userId, memberName: row.memberName, scheduledFor: todayKey.slice(0, 4),
        variables: {},
        scheduledAt: now,
      }),
    }));
  }

  // 8. 락커 만료 D-N
  {
    const template = templates.locker_expire;
    const days = templateDays(template, 3);
    const rows = await query(
      `SELECT la.id, la.user_id AS userId, la.end_date AS endDate, l.locker_no AS lockerNo, u.name AS memberName
       FROM studio_locker_assignments la
       JOIN studio_lockers l ON l.id = la.locker_id
       JOIN users u ON u.id = la.user_id
       WHERE la.status = 'active' AND la.end_date IS NOT NULL
         AND la.end_date = DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND ${ELIGIBLE_RECIPIENT_SQL}`,
      [days]
    );
    summaries.push(await runGenerator({
      templateId: "locker_expire", template, rows, dryRun,
      mapRow: (row) => buildCandidate({
        templateId: "locker_expire", template, sourceType: "locker_assignment", sourceId: row.id,
        userId: row.userId, memberName: row.memberName, scheduledFor: toDateKey(row.endDate),
        variables: { "락커 번호": row.lockerNo, "락커 종료일": days },
        scheduledAt: now,
      }),
    }));
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      generatedNotificationCount: acc.generatedNotificationCount + s.notificationCount,
      generatedDeliveryCount: acc.generatedDeliveryCount + s.deliveryCount,
      generatedDuplicateCount: acc.generatedDuplicateCount + s.duplicateCount,
    }),
    { generatedNotificationCount: 0, generatedDeliveryCount: 0, generatedDuplicateCount: 0 }
  );

  return { ...totals, templates: summaries, dryRun };
}

function formatClassTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { closeDatabase, ensureInitialized, query } from "../../src/shared/db/mysql.js";
import {
  enqueueNotificationDeliveries,
  materializePendingNotifications,
  processDueNotificationDeliveries,
  restoreExpiredPassPauses,
} from "../../src/features/sms/notification-dispatch.service.js";
import { generateAutomaticNotifications } from "../../src/features/sms/notification-automation.service.js";

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const createdUserIds = [];
const createdNotificationIds = [];

async function createMember({ active = true, withDevice = true } = {}) {
  const id = `wtest-${randomUUID()}`;
  await query(
    `INSERT INTO users (id, login_id, name, email, email_hash, password, phone, phone_hash, name_hash,
                        role, account_status, created_at)
     VALUES (?, ?, '워커테스트', ?, ?, 'x', '', '', '', 'user', ?, NOW())`,
    [id, `wtest_${id.slice(-12)}`, `${id}@example.invalid`, id, active ? "active" : "withdrawn"]
  );
  createdUserIds.push(id);
  if (withDevice) {
    await query(
      `INSERT INTO studio_push_devices (id, user_id, token, platform, device_name, is_active, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, 'android', 'worker-test', 1, NOW(), NOW(), NOW())`,
      [randomUUID(), id, `worker-test-token-${randomUUID()}`]
    );
  }
  return id;
}

async function enqueuePush(userId, title = "워커 테스트") {
  const notificationId = randomUUID();
  await enqueueNotificationDeliveries({
    notifications: [{ id: notificationId, userId, type: "manual", title, message: "본문" }],
    channels: [{ channel: "push", status: "pending" }],
  });
  createdNotificationIds.push(notificationId);
  const row = await query(
    `SELECT id FROM studio_notification_deliveries WHERE notification_id = ? AND channel = 'push' LIMIT 1`,
    [notificationId]
  );
  return { notificationId, deliveryId: row[0].id };
}

async function deliveryState(deliveryId) {
  const rows = await query(
    `SELECT status, attempts, next_attempt_at AS nextAttemptAt, sent_at AS sentAt,
            provider_message_id AS providerMessageId, error_message AS errorMessage
     FROM studio_notification_deliveries WHERE id = ?`,
    [deliveryId]
  );
  return rows[0];
}

function failingSender(code, httpStatus) {
  return async () => {
    const error = new Error("보내기 실패");
    error.code = code;
    error.status = httpStatus;
    throw error;
  };
}

after(async () => {
  if (!shouldRun) return;
  for (const id of createdNotificationIds) {
    await query(`DELETE FROM studio_notification_deliveries WHERE notification_id = ?`, [id]);
    await query(`DELETE FROM studio_notifications WHERE id = ?`, [id]);
  }
  for (const id of createdUserIds) {
    await query(`DELETE FROM studio_notification_deliveries WHERE recipient_user_id = ?`, [id]);
    await query(`DELETE FROM studio_notifications WHERE user_id = ?`, [id]);
    await query(`DELETE FROM studio_push_devices WHERE user_id = ?`, [id]);
    await query(`DELETE FROM users WHERE id = ?`, [id]);
  }
  await closeDatabase();
});

test("대기열의 앱 푸시를 발송하고 sent 상태로 정리한다", { skip: !shouldRun }, async () => {
  await ensureInitialized();
  const userId = await createMember();
  const { notificationId, deliveryId } = await enqueuePush(userId);

  const calls = [];
  const result = await processDueNotificationDeliveries({
    sender: async (payload) => {
      calls.push(payload);
      return { provider: "fcm", msgId: "projects/test/messages/1", successCnt: 1, errorCnt: 0 };
    },
  });

  assert.equal(calls.length, 1, "단일 토큰으로 한 번만 보내야 한다");
  assert.ok(calls[0].token);
  assert.equal(calls[0].data.path, "/mypage");
  assert.ok(result.sentCount >= 1);

  const state = await deliveryState(deliveryId);
  assert.equal(state.status, "sent");
  assert.equal(Number(state.attempts), 1);
  assert.ok(state.sentAt);

  const notification = await query(`SELECT status FROM studio_notifications WHERE id = ?`, [notificationId]);
  assert.equal(notification[0].status, "sent");
});

test("일시적 실패는 1분 뒤 재시도로 예약하고, 세 번째 실패에서 failed로 끝낸다", { skip: !shouldRun }, async () => {
  const userId = await createMember();
  const { deliveryId } = await enqueuePush(userId);
  const sender = failingSender("UNAVAILABLE", 503);

  await processDueNotificationDeliveries({ sender });
  let state = await deliveryState(deliveryId);
  assert.equal(state.status, "retry");
  assert.equal(Number(state.attempts), 1);
  assert.ok(state.nextAttemptAt, "다음 시도 시각이 있어야 한다");

  // 재시도 예약 시각이 미래이므로 지금은 다시 집히지 않아야 한다.
  const blocked = await processDueNotificationDeliveries({ sender });
  assert.equal(Number((await deliveryState(deliveryId)).attempts), 1, "예약 시각 전에는 재시도하지 않는다");
  assert.equal(blocked.processedCount, 0);

  await query(`UPDATE studio_notification_deliveries SET next_attempt_at = NOW() WHERE id = ?`, [deliveryId]);
  await processDueNotificationDeliveries({ sender });
  state = await deliveryState(deliveryId);
  assert.equal(state.status, "retry");
  assert.equal(Number(state.attempts), 2);

  await query(`UPDATE studio_notification_deliveries SET next_attempt_at = NOW() WHERE id = ?`, [deliveryId]);
  await processDueNotificationDeliveries({ sender });
  state = await deliveryState(deliveryId);
  assert.equal(state.status, "failed");
  assert.equal(Number(state.attempts), 3);
  assert.equal(state.nextAttemptAt, null);
});

test("무효 토큰은 재시도 없이 실패 처리하고 해당 기기를 비활성화한다", { skip: !shouldRun }, async () => {
  const userId = await createMember();
  const { deliveryId } = await enqueuePush(userId);

  await processDueNotificationDeliveries({ sender: failingSender("UNREGISTERED", 404) });

  const state = await deliveryState(deliveryId);
  assert.equal(state.status, "failed");
  assert.equal(Number(state.attempts), 1, "영구 실패는 재시도 횟수를 더 쓰지 않는다");

  const devices = await query(`SELECT is_active AS isActive FROM studio_push_devices WHERE user_id = ?`, [userId]);
  assert.equal(Number(devices[0].isActive), 0);
});

test("설정 오류는 시도 횟수를 소비하지 않고 batch를 중단한다", { skip: !shouldRun }, async () => {
  const userId = await createMember();
  const { deliveryId } = await enqueuePush(userId);

  const result = await processDueNotificationDeliveries({ sender: failingSender("FCM_AUTH_FAILED", 401) });
  assert.equal(result.configurationError, true);

  const state = await deliveryState(deliveryId);
  assert.equal(state.status, "pending");
  assert.equal(Number(state.attempts), 0, "설정 오류는 재시도 횟수를 쓰지 않는다");

  // 설정 오류 건은 대기열에 남으므로 이후 테스트가 집어가지 않도록 정리한다.
  await query(`UPDATE studio_notification_deliveries SET status = 'failed' WHERE id = ?`, [deliveryId]);
});

test("비활성 회원과 기기 없는 회원은 실패가 아니라 제외로 기록한다", { skip: !shouldRun }, async () => {
  const withdrawnUser = await createMember({ active: false });
  const noDeviceUser = await createMember({ withDevice: false });
  const a = await enqueuePush(withdrawnUser);
  const b = await enqueuePush(noDeviceUser);

  let sendCount = 0;
  const result = await processDueNotificationDeliveries({
    sender: async () => { sendCount += 1; return { msgId: "x" }; },
  });

  assert.equal(sendCount, 0, "제외 대상에는 발송 요청을 보내지 않는다");
  assert.ok(result.skippedCount >= 2);
  assert.equal((await deliveryState(a.deliveryId)).status, "skipped");
  assert.equal((await deliveryState(b.deliveryId)).status, "skipped");
});

test("같은 대기열을 두 워커가 동시에 처리해도 발송은 한 번만 일어난다", { skip: !shouldRun }, async () => {
  const userId = await createMember();
  const { deliveryId } = await enqueuePush(userId);

  let sendCount = 0;
  const sender = async () => {
    sendCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { msgId: "concurrent" };
  };

  await Promise.all([
    processDueNotificationDeliveries({ sender }),
    processDueNotificationDeliveries({ sender }),
  ]);

  assert.equal(sendCount, 1);
  assert.equal((await deliveryState(deliveryId)).status, "sent");
});

test("이미 발송한 건은 다시 처리하지 않는다", { skip: !shouldRun }, async () => {
  const userId = await createMember();
  await enqueuePush(userId);
  await processDueNotificationDeliveries({ sender: async () => ({ msgId: "first" }) });

  let secondRun = 0;
  await processDueNotificationDeliveries({ sender: async () => { secondRun += 1; return { msgId: "second" }; } });
  assert.equal(secondRun, 0);
});

test("중단된 processing 건을 복구하고 예약 시각이 지난 건을 발송 대상으로 만든다", { skip: !shouldRun }, async () => {
  const userId = await createMember();
  const { deliveryId } = await enqueuePush(userId);
  await query(
    `UPDATE studio_notification_deliveries
     SET status = 'processing', attempts = 1, updated_at = DATE_SUB(NOW(), INTERVAL 30 MINUTE)
     WHERE id = ?`,
    [deliveryId]
  );

  const result = await materializePendingNotifications({ limit: 50 });
  assert.ok(result.recoveredStaleCount >= 1);
  assert.equal((await deliveryState(deliveryId)).status, "retry");

  // 복구된 건이 이후 테스트의 대기열에 섞이지 않도록 정리한다.
  await query(`UPDATE studio_notification_deliveries SET status = 'failed' WHERE id = ?`, [deliveryId]);
});

test("자동 알림 dry-run은 DB에 쓰지 않고 두 번 실행해도 중복을 만들지 않는다", { skip: !shouldRun }, async () => {
  const before = await query(`SELECT COUNT(*) AS c FROM studio_notifications`);

  const dry = await generateAutomaticNotifications({ dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.templates.length, 8, "자동 알림 템플릿 8종을 모두 산출해야 한다");

  const after = await query(`SELECT COUNT(*) AS c FROM studio_notifications`);
  assert.equal(Number(after[0].c), Number(before[0].c), "dry-run은 알림을 만들지 않는다");

  const second = await generateAutomaticNotifications({ dryRun: true });
  assert.equal(second.templates.length, 8);
});

test("정지 기간이 끝난 수강권을 한 번만 복구한다", { skip: !shouldRun }, async () => {
  const userId = await createMember({ withDevice: false });
  const passId = randomUUID();
  await query(
    `INSERT INTO studio_passes (id, user_id, branch_id, pass_name, pass_type, remaining_count, total_count,
                                expires_at, status, created_at, updated_at)
     VALUES (?, ?, 'branch-1', '워커테스트권', 'group', 5, 10, NULL, 'paused', NOW(), NOW())`,
    [passId, userId]
  );
  const pauseId = randomUUID();
  await query(
    `INSERT INTO studio_pass_pauses (id, pass_id, user_id, start_date, end_date, reason, processed_at, created_at)
     VALUES (?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 10 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), '테스트', NULL, NOW())`,
    [pauseId, passId, userId]
  );

  const first = await restoreExpiredPassPauses({ limit: 50 });
  assert.ok(first.restoredPassCount >= 1);
  const pass = await query(`SELECT status FROM studio_passes WHERE id = ?`, [passId]);
  assert.equal(pass[0].status, "active");

  const second = await restoreExpiredPassPauses({ limit: 50 });
  const processed = await query(`SELECT processed_at AS processedAt FROM studio_pass_pauses WHERE id = ?`, [pauseId]);
  assert.ok(processed[0].processedAt, "처리 시각이 남아야 한다");
  assert.equal(second.restoredPassCount, 0, "두 번째 실행에서는 다시 복구하지 않는다");

  await query(`DELETE FROM studio_pass_pauses WHERE id = ?`, [pauseId]);
  await query(`DELETE FROM studio_passes WHERE id = ?`, [passId]);
});

test("대기열 생성 후 로그아웃하면 발송하지 않고 제외 처리한다", { skip: !shouldRun }, async () => {
  const userId = await createMember();
  const { deliveryId } = await enqueuePush(userId);

  // 로그아웃 시 이 기기의 등록이 해제되는 상황을 재현합니다.
  await query(`UPDATE studio_push_devices SET is_active = 0, updated_at = NOW() WHERE user_id = ?`, [userId]);

  let sendCount = 0;
  const result = await processDueNotificationDeliveries({
    sender: async () => { sendCount += 1; return { msgId: "should-not-send" }; },
  });

  assert.equal(sendCount, 0, "로그아웃한 기기에는 실제 발송 요청을 하지 않는다");
  const state = await deliveryState(deliveryId);
  assert.equal(state.status, "skipped");
  assert.equal(state.nextAttemptAt, null, "제외 건은 재시도 대상이 아니다");
  assert.ok(result.skippedCount >= 1);
  assert.equal(result.retryCount, 0);
});

test("공유 기기에서 사용자가 바뀌면 이전 사용자에게는 발송하지 않는다", { skip: !shouldRun }, async () => {
  const previousUser = await createMember();
  const nextUser = await createMember({ withDevice: false });

  const sharedToken = (await query(`SELECT token FROM studio_push_devices WHERE user_id = ?`, [previousUser]))[0].token;
  const { deliveryId } = await enqueuePush(previousUser, "이전 사용자 알림");

  // 이전 사용자 로그아웃 후 같은 기기에서 다른 사용자가 로그인한 상태를 재현합니다.
  await query(`UPDATE studio_push_devices SET is_active = 0 WHERE user_id = ?`, [previousUser]);
  await query(
    `INSERT INTO studio_push_devices (id, user_id, token, platform, device_name, is_active, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, 'android', 'shared', 1, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), is_active = 1, updated_at = NOW()`,
    [randomUUID(), nextUser, sharedToken]
  );

  let sendCount = 0;
  await processDueNotificationDeliveries({
    sender: async () => { sendCount += 1; return { msgId: "leak" }; },
  });

  assert.equal(sendCount, 0, "이전 사용자의 알림이 새 사용자 기기로 가면 안 된다");
  assert.equal((await deliveryState(deliveryId)).status, "skipped");

  const active = await query(`SELECT COUNT(*) AS c FROM studio_push_devices WHERE user_id = ? AND is_active = 1`, [previousUser]);
  assert.equal(Number(active[0].c), 0, "이전 사용자에게 남은 활성 기기가 없어야 한다");
});

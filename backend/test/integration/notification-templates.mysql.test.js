import test, { after } from "node:test";
import assert from "node:assert/strict";

import { closeDatabase, ensureInitialized, query } from "../../src/shared/db/mysql.js";
import {
  getNotificationTemplates,
  saveNotificationTemplate,
} from "../../src/features/studio/studio.service.js";

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const TEMPLATE_ID = "pass_expire";
let originalRow = null;

async function snapshotTemplateRow() {
  const rows = await query(`SELECT * FROM studio_notification_templates WHERE template_id = ?`, [TEMPLATE_ID]);
  return rows[0] || null;
}

after(async () => {
  if (!shouldRun) return;
  // 검증에 사용한 템플릿 행을 원래 상태로 되돌립니다.
  if (originalRow) {
    await query(
      `INSERT INTO studio_notification_templates
         (template_id, push_enabled, sms_enabled, kakao_enabled, kakao_template_code, message, param1, param2, skip_expired, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE push_enabled=VALUES(push_enabled), sms_enabled=VALUES(sms_enabled),
         kakao_enabled=VALUES(kakao_enabled), kakao_template_code=VALUES(kakao_template_code),
         message=VALUES(message), param1=VALUES(param1), param2=VALUES(param2),
         skip_expired=VALUES(skip_expired), updated_at=NOW()`,
      [
        TEMPLATE_ID,
        originalRow.push_enabled,
        originalRow.sms_enabled,
        originalRow.kakao_enabled,
        originalRow.kakao_template_code,
        originalRow.message,
        originalRow.param1,
        originalRow.param2,
        originalRow.skip_expired,
      ]
    );
  } else {
    await query(`DELETE FROM studio_notification_templates WHERE template_id = ?`, [TEMPLATE_ID]);
  }
  await closeDatabase();
});

test("템플릿 조회는 8종을 모두 돌려준다", { skip: !shouldRun }, async () => {
  await ensureInitialized();
  originalRow = await snapshotTemplateRow();

  const templates = await getNotificationTemplates();
  assert.equal(Object.keys(templates).length, 8);
  assert.equal(typeof templates[TEMPLATE_ID].pushEnabled, "boolean");
  assert.ok(String(templates[TEMPLATE_ID].message).length > 0);
});

test("push_enabled만 저장해도 기존 제목·본문과 다른 채널 설정이 유지된다", { skip: !shouldRun }, async () => {
  const before = (await getNotificationTemplates())[TEMPLATE_ID];

  await saveNotificationTemplate(TEMPLATE_ID, { pushEnabled: false });

  const afterDisable = (await getNotificationTemplates())[TEMPLATE_ID];
  assert.equal(afterDisable.pushEnabled, false, "푸시만 꺼져야 한다");
  assert.equal(afterDisable.message, before.message, "본문이 유지돼야 한다");
  assert.equal(afterDisable.param1, before.param1, "조건 값이 유지돼야 한다");
  assert.equal(afterDisable.smsEnabled, before.smsEnabled, "다른 채널 설정이 유지돼야 한다");
  assert.equal(afterDisable.kakaoEnabled, before.kakaoEnabled);
  assert.equal(afterDisable.kakaoTemplateCode, before.kakaoTemplateCode);

  await saveNotificationTemplate(TEMPLATE_ID, { pushEnabled: true });

  const afterEnable = (await getNotificationTemplates())[TEMPLATE_ID];
  assert.equal(afterEnable.pushEnabled, true, "원복되어야 한다");
  assert.equal(afterEnable.message, before.message);
});

test("전체 필드를 보내면 그대로 저장된다", { skip: !shouldRun }, async () => {
  const before = (await getNotificationTemplates())[TEMPLATE_ID];
  const nextMessage = `${before.message} (검증)`;

  await saveNotificationTemplate(TEMPLATE_ID, { ...before, message: nextMessage });
  const saved = (await getNotificationTemplates())[TEMPLATE_ID];
  assert.equal(saved.message, nextMessage);

  await saveNotificationTemplate(TEMPLATE_ID, { message: before.message });
  assert.equal((await getNotificationTemplates())[TEMPLATE_ID].message, before.message);
});

test("알 수 없는 템플릿 ID는 거부한다", { skip: !shouldRun }, async () => {
  await assert.rejects(
    () => saveNotificationTemplate("not_a_template", { pushEnabled: false }),
    (error) => Number(error?.status) === 400
  );
});

test("push_enabled 타입이 올바르지 않으면 거부한다", { skip: !shouldRun }, async () => {
  await assert.rejects(
    () => saveNotificationTemplate(TEMPLATE_ID, { pushEnabled: "yes" }),
    (error) => Number(error?.status) === 400
  );
  // 거부된 요청이 값을 바꾸지 않아야 합니다.
  assert.equal((await getNotificationTemplates())[TEMPLATE_ID].pushEnabled, true);
});

test("템플릿 저장은 알림·발송 레코드를 만들지 않는다", { skip: !shouldRun }, async () => {
  const before = await query(
    `SELECT (SELECT COUNT(*) FROM studio_notifications) AS n,
            (SELECT COUNT(*) FROM studio_notification_deliveries) AS d`
  );

  await saveNotificationTemplate(TEMPLATE_ID, { pushEnabled: false });
  await saveNotificationTemplate(TEMPLATE_ID, { pushEnabled: true });

  const after = await query(
    `SELECT (SELECT COUNT(*) FROM studio_notifications) AS n,
            (SELECT COUNT(*) FROM studio_notification_deliveries) AS d`
  );
  assert.equal(Number(after[0].n), Number(before[0].n), "알림이 생성되면 안 된다");
  assert.equal(Number(after[0].d), Number(before[0].d), "발송 레코드가 생성되면 안 된다");
});

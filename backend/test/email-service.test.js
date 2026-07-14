import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../src/config/env.js";
import { sendEmail, sendEmailVerificationCode } from "../src/shared/email/email.service.js";

test("외부 이메일 발송이 차단되면 성공으로 처리하지 않는다", async () => {
  const previousTestSafeMode = env.testSafeMode;
  const previousAllowExternalEmailSend = env.allowExternalEmailSend;

  env.testSafeMode = true;
  env.allowExternalEmailSend = false;

  try {
    const result = await sendEmail("e2e@example.test", "테스트", "<p>테스트</p>");
    assert.deepEqual(result, {
      sent: false,
      skipped: true,
      reason: "EMAIL_SEND_DISABLED",
    });

    await assert.rejects(
      () => sendEmailVerificationCode("e2e@example.test", "123456", 5),
      (error) => {
        assert.equal(error.status, 503);
        assert.equal(error.code, "EMAIL_DELIVERY_UNAVAILABLE");
        assert.equal(error.expose, true);
        return true;
      }
    );
  } finally {
    env.testSafeMode = previousTestSafeMode;
    env.allowExternalEmailSend = previousAllowExternalEmailSend;
  }
});

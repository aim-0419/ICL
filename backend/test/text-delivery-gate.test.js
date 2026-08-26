/**
 * 문자·알림톡 발송이 설정이 꺼진 상태에서 절대 나가지 않는지 확인합니다.
 *
 * 이 테스트의 목적은 "보내는 것"이 아니라 "안 보내는 것"을 보장하는 데 있습니다.
 * 실수로 실제 문자가 발송되면 비용과 신뢰 문제로 이어지므로,
 * 꺼져 있을 때는 대기열조차 건드리지 않아야 합니다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { processDueTextDeliveries } from "../src/features/sms/notification-dispatch.service.js";
import { env } from "../src/config/env.js";

test("기본 설정에서는 외부 발송이 꺼져 있다", () => {
  assert.equal(env.allowExternalSmsSend, false, "문자 외부 발송 기본값은 꺼짐이어야 합니다");
  assert.equal(env.allowExternalKakaoSend, false, "알림톡 외부 발송 기본값은 꺼짐이어야 합니다");
});

test("설정이 꺼져 있으면 발송기를 호출하지 않고 대기열도 건드리지 않는다", async () => {
  let senderCalls = 0;
  const spy = async () => {
    senderCalls += 1;
    return { msgId: "should-not-happen" };
  };

  for (const channel of ["sms", "kakao"]) {
    const result = await processDueTextDeliveries({
      channel,
      senders: { sms: spy, kakao: spy },
    });

    assert.equal(result.disabled, true, `${channel} 은 꺼진 상태여야 합니다`);
    assert.equal(result.processedCount, 0, `${channel} 대기열을 건드리면 안 됩니다`);
    assert.equal(result.sentCount, 0);
    assert.equal(result.failedCount, 0, "실패로 표시하면 나중에 켰을 때 재발송되지 않습니다");
  }

  assert.equal(senderCalls, 0, "발송기가 한 번도 호출되면 안 됩니다");
});

test("알 수 없는 채널은 아무 일도 하지 않는다", async () => {
  let senderCalls = 0;
  const spy = async () => {
    senderCalls += 1;
    return {};
  };

  const result = await processDueTextDeliveries({
    channel: "carrier-pigeon",
    senders: { sms: spy, kakao: spy },
  });

  assert.equal(result.processedCount, 0);
  assert.equal(senderCalls, 0);
});

test("푸시 처리와 문자 처리는 서로 다른 채널만 다룬다", async () => {
  // 문자 처리기가 push 채널을 건드리면 푸시가 두 번 발송될 수 있습니다.
  const result = await processDueTextDeliveries({ channel: "push" });
  assert.equal(result.processedCount, 0, "문자 처리기는 push 를 다루면 안 됩니다");
});

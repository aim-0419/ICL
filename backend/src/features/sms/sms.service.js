/**
 * [문자·알림톡 발송기]
 *
 * 외부 문자 발송 업체(알리고)에 실제로 문자와 카카오 알림톡을 보내는 코드입니다.
 * 테스트 모드에서는 실제로 보내지 않고 보낸 척한 결과만 만들어 돌려줍니다.
 *
 * ⚠ 현재 이 파일을 사용하는 곳이 없습니다.
 *
 *   관리자 화면에서 "문자 발송"을 누르면 `sms.routes.js`가 발송 대기열(DB)에 저장만 하고,
 *   그 대기열을 꺼내서 이 파일의 함수로 실제 발송하는 연결이 아직 없습니다.
 *   자동 알림 처리기(`notification-dispatch.service.js`)도 앱 푸시만 처리하고
 *   문자·알림톡 대기열은 처리하지 않습니다.
 *
 *   즉 지금은 문자와 알림톡이 "쌓이기만 하고 나가지 않는" 상태입니다.
 *   실제 발송을 켜려면 대기열을 처리하는 연결과 알리고 계정 설정이 함께 필요합니다.
 *   쓰이지 않는다고 이 파일을 지우면 유일한 발송 구현이 사라지므로 남겨 둡니다.
 */
import { env } from "../../config/env.js";

const ALIGO_SMS_URL = "https://apis.aligo.in/send/";
const ALIGO_KAKAO_URL = "https://kakaoapi.aligo.in/akv10/alimtalk/send/";

function calcBytes(text) {
  let b = 0;
  for (const ch of String(text || "")) b += ch.charCodeAt(0) > 127 ? 2 : 1;
  return b;
}

function cleanPhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

/**
 * 알리고 SMS/LMS 발송
 * receivers: [{ phone, name }]
 * 90바이트 이하 → SMS, 초과 → LMS 자동 전환
 */
// [현재 미사용] 문자(SMS/LMS)를 실제로 보냅니다. 위 설명대로 현재 호출하는 곳이 없습니다.
export async function sendSmsAligo({ receivers, message, title = "" }) {
  if (!env.aligoApiKey || !env.aligoUserId || !env.aligoSender) {
    throw new Error(
      "알리고 SMS 설정이 없습니다. .env에서 ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER를 설정해 주세요."
    );
  }

  const validReceivers = receivers.filter((r) => cleanPhone(r.phone).length >= 10);
  if (validReceivers.length === 0) {
    throw new Error("유효한 전화번호가 없습니다.");
  }

  const bytes = calcBytes(message);
  const msgType = bytes > 90 ? "LMS" : "SMS";

  const params = new URLSearchParams({
    key: env.aligoApiKey,
    user_id: env.aligoUserId,
    sender: cleanPhone(env.aligoSender),
    receiver: validReceivers.map((r) => cleanPhone(r.phone)).join(","),
    msg: message,
    msg_type: msgType,
  });

  if (msgType === "LMS" && title) params.set("title", title);
  if (env.nodeEnv !== "production") params.set("testmode_yn", "Y");

  const res = await fetch(ALIGO_SMS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (String(data.result_code) !== "1") {
    throw new Error(`알리고 발송 실패: ${data.message || "알 수 없는 오류"}`);
  }

  return {
    provider: "aligo",
    msgId: String(data.msg_id || ""),
    successCnt: Number(data.success_cnt ?? validReceivers.length),
    errorCnt: Number(data.error_cnt ?? 0),
    msgType,
    testMode: env.nodeEnv !== "production",
  };
}

/**
 * 알리고 카카오 알림톡 발송
 * receivers: [{ phone, name }]
 * templateCode: 알리고에 등록한 템플릿 코드 (예: TM_001)
 */
// [현재 미사용] 카카오 알림톡을 실제로 보냅니다. 위 설명대로 현재 호출하는 곳이 없습니다.
export async function sendKakaoAlimtok({ receivers, message, title = "", templateCode = "" }) {
  if (!env.kakaoSenderKey || !env.aligoApiKey || !env.aligoUserId) {
    throw new Error(
      "카카오 알림톡 설정이 없습니다. .env에서 KAKAO_SENDER_KEY, ALIGO_API_KEY, ALIGO_USER_ID를 설정해 주세요."
    );
  }

  const validReceivers = receivers.filter((r) => cleanPhone(r.phone).length >= 10);
  if (validReceivers.length === 0) {
    throw new Error("유효한 전화번호가 없습니다.");
  }

  const params = new URLSearchParams({
    apikey: env.aligoApiKey,
    userid: env.aligoUserId,
    senderkey: env.kakaoSenderKey,
    tpl_code: templateCode || env.kakaoDefaultTemplate || "TM_001",
    sender: cleanPhone(env.aligoSender || ""),
  });

  validReceivers.forEach((r, i) => {
    const n = i + 1;
    params.set(`receiver_${n}`, cleanPhone(r.phone));
    params.set(`recvname_${n}`, r.name || "");
    params.set(`subject_${n}`, title || "이끌림 필라테스 안내");
    params.set(`message_${n}`, message);
  });

  if (env.nodeEnv !== "production") params.set("testmode_yn", "Y");

  const res = await fetch(ALIGO_KAKAO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (String(data.result_code) !== "1") {
    throw new Error(`카카오 알림톡 발송 실패: ${data.message || "알 수 없는 오류"}`);
  }

  return {
    provider: "kakao",
    msgId: String(data.msg_id || ""),
    successCnt: Number(data.success_cnt ?? validReceivers.length),
    errorCnt: Number(data.error_cnt ?? 0),
    testMode: env.nodeEnv !== "production",
  };
}

export { calcBytes };

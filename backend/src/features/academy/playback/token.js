// 파일 역할: 아카데미 영상 보안 재생을 위한 세션, 토큰, 파일 경로 처리 로직을 담당합니다.
import { createHmac, timingSafeEqual } from "node:crypto";
import { PLAYBACK_TOKEN_SECRET } from "./constants.js";
import { toSafeText } from "./helpers.js";

// 함수 역할: base64 URL 값을 안전한 인코딩 형태로 변환합니다.
function encodeBase64Url(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

// 함수 역할: buffer base64 URL 값을 안전한 인코딩 형태로 변환합니다.
function encodeBufferBase64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

// 함수 역할: base64 URL 값을 원래 형태로 디코딩합니다.
function decodeBase64Url(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

// 함수 역할: 요청 데이터 base64에 서명해 변조 여부를 확인할 수 있게 합니다.
function signPayloadBase64(payloadBase64) {
  return createHmac("sha256", PLAYBACK_TOKEN_SECRET).update(payloadBase64).digest();
}

// 재생 토큰 서명 로직
// 함수 역할: 재생 세션 페이로드에 서명해 변조를 막는 토큰을 만듭니다.
export function signPlaybackToken(payload) {
  const payloadBase64 = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayloadBase64(payloadBase64);
  const signatureBase64 = encodeBufferBase64Url(signature);
  return `${payloadBase64}.${signatureBase64}`;
}

// 재생 토큰 검증 로직
// 함수 역할: 재생 토큰의 서명과 만료 시간을 검증하고 페이로드를 복원합니다.
export function verifyPlaybackToken(token) {
  const raw = toSafeText(token);
  if (!raw.includes(".")) return null;
  const [payloadBase64, signatureBase64] = raw.split(".");
  if (!payloadBase64 || !signatureBase64) return null;

  let decodedSignature;
  try {
    decodedSignature = Buffer.from(signatureBase64, "base64url");
  } catch {
    return null;
  }

  const expected = signPayloadBase64(payloadBase64);
  if (decodedSignature.length !== expected.length) return null;
  if (!timingSafeEqual(decodedSignature, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadBase64));
  } catch {
    return null;
  }

  const sid = toSafeText(payload?.sid);
  const sk = toSafeText(payload?.sk);
  const uid = toSafeText(payload?.uid);
  const vid = toSafeText(payload?.vid);
  const cid = toSafeText(payload?.cid);
  const exp = Number(payload?.exp || 0);

  if (!sid || !sk || !vid || !cid || !Number.isFinite(exp) || exp <= 0) return null;

  return { sid, sk, uid, vid, cid, exp };
}


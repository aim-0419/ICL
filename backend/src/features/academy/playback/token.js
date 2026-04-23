import { createHmac, timingSafeEqual } from "node:crypto";
import { PLAYBACK_TOKEN_SECRET } from "./constants.js";
import { toSafeText } from "./helpers.js";

function encodeBase64Url(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function encodeBufferBase64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function signPayloadBase64(payloadBase64) {
  return createHmac("sha256", PLAYBACK_TOKEN_SECRET).update(payloadBase64).digest();
}

// 재생 토큰 서명 로직
export function signPlaybackToken(payload) {
  const payloadBase64 = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayloadBase64(payloadBase64);
  const signatureBase64 = encodeBufferBase64Url(signature);
  return `${payloadBase64}.${signatureBase64}`;
}

// 재생 토큰 검증 로직
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


/**
 * [앱 푸시 발송기]
 *
 * 구글의 앱 알림 서비스(FCM)에 실제로 푸시 알림을 보내는 코드입니다.
 *
 * 앱을 지운 기기나 더 이상 쓰지 않는 기기는 발송이 실패하는데,
 * 그런 경우를 구분해서 해당 기기 등록을 정리할 수 있게 알려 줍니다.
 *
 * 발송에 필요한 열쇠 값이 설정되어 있지 않으면 실제로 보내지 않습니다.
 */
import { createSign } from "node:crypto";
import { env } from "../../config/env.js";

let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;

function toBase64Url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value))
    .toString("base64url");
}

function isConfigured() {
  return Boolean(env.fcmProjectId && env.fcmClientEmail && env.fcmPrivateKey);
}

async function getGoogleAccessToken() {
  if (!isConfigured()) {
    const error = new Error(
      "FCM 설정이 없습니다. FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY를 설정해 주세요."
    );
    error.code = "FCM_NOT_CONFIGURED";
    throw error;
  }

  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = toBase64Url({ alg: "RS256", typ: "JWT" });
  const payload = toBase64Url({
    iss: env.fcmClientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  });
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const assertion = `${unsignedToken}.${signer.sign(env.fcmPrivateKey, "base64url")}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const error = new Error(body.error_description || body.error || "FCM 인증 토큰 발급에 실패했습니다.");
    error.code = "FCM_AUTH_FAILED";
    throw error;
  }

  cachedAccessToken = String(body.access_token);
  cachedAccessTokenExpiresAt = Date.now() + Number(body.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

// [현재 미사용] 앱 푸시 설정이 갖춰졌는지 알려줍니다. 지금은 sms.routes.js 가 같은 판정을 직접 하고 있어 호출되지 않습니다.
export function getFcmConfigurationStatus() {
  return {
    configured: isConfigured(),
    projectId: env.fcmProjectId || "",
  };
}

export async function sendFcmPush({ token, title, message, data = {} }) {
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.fcmProjectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: String(token || ""),
          notification: {
            title: String(title || "이끌림 필라테스"),
            body: String(message || ""),
          },
          data: Object.fromEntries(
            Object.entries(data || {}).map(([key, value]) => [String(key), String(value ?? "")])
          ),
          android: { priority: "high" },
          apns: { headers: { "apns-priority": "10" } },
        },
      }),
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "FCM 앱 푸시 발송에 실패했습니다.");
    error.code = body?.error?.status || "FCM_SEND_FAILED";
    error.status = response.status;
    throw error;
  }
  return { provider: "fcm", msgId: String(body.name || ""), successCnt: 1, errorCnt: 0 };
}

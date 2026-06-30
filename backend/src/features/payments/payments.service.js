// 파일 역할: 결제 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { query, queryOne } from "../../shared/db/mysql.js";
import { decryptPii, emailHash, encryptPii, normalizeEmail, scrubStoredPii } from "../../shared/security/pii.js";
import { toSafeAmount as toAmountNumber } from "../../shared/utils/normalize.js";

const WEBHOOK_TIMESTAMP_TOLERANCE_SEC = 60 * 5;

function normalizeId(value) {
  return String(value || "").trim();
}

function getWebhookSecrets() {
  const secrets = [
    env.portoneWebhookSecret,
    ...String(env.portoneWebhookSecrets || "")
      .split(",")
      .map((secret) => secret.trim()),
  ]
    .map((secret) => String(secret || "").trim())
    .filter(Boolean);
  return [...new Set(secrets)];
}

function getHeader(headers, name) {
  const value = headers?.[name.toLowerCase()] ?? headers?.[name];
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function toRawBodyText(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody.toString("utf8");
  if (typeof rawBody === "string") return rawBody;
  if (rawBody && typeof rawBody === "object") return JSON.stringify(rawBody);
  return "";
}

function decodeWebhookSecret(secret) {
  const text = String(secret || "").trim();
  const encoded = text.startsWith("whsec_") ? text.slice("whsec_".length) : text;
  try {
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.length > 0) return decoded;
  } catch {
    // 아래 utf8 fallback 사용
  }
  return Buffer.from(text, "utf8");
}

function timingSafeBase64Compare(expected, actual) {
  const expectedBuffer = Buffer.from(String(expected || ""), "base64");
  const actualBuffer = Buffer.from(String(actual || ""), "base64");
  if (expectedBuffer.length === 0 || expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function verifyStandardWebhook(rawBodyText, headers) {
  const secrets = getWebhookSecrets();
  if (secrets.length === 0) {
    const error = new Error("PORTONE_WEBHOOK_SECRET 값이 설정되지 않았습니다.");
    error.status = 500;
    throw error;
  }

  const webhookId = getHeader(headers, "webhook-id");
  const webhookTimestamp = getHeader(headers, "webhook-timestamp");
  const webhookSignature = getHeader(headers, "webhook-signature");
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    const error = new Error("PortOne 웹훅 서명 헤더가 누락되었습니다.");
    error.status = 400;
    throw error;
  }

  const timestampSec = Number(webhookTimestamp);
  if (!Number.isFinite(timestampSec)) {
    const error = new Error("PortOne 웹훅 타임스탬프가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const nowSec = Date.now() / 1000;
  if (Math.abs(nowSec - timestampSec) > WEBHOOK_TIMESTAMP_TOLERANCE_SEC) {
    const error = new Error("PortOne 웹훅 타임스탬프 허용 시간을 초과했습니다.");
    error.status = 400;
    throw error;
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBodyText}`;
  const signatures = webhookSignature
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [version, signature] = part.split(",", 2);
      return { version, signature };
    })
    .filter((item) => item.version === "v1" && item.signature);

  for (const secret of secrets) {
    const expected = createHmac("sha256", decodeWebhookSecret(secret))
      .update(signedContent)
      .digest("base64");
    if (signatures.some((item) => timingSafeBase64Compare(expected, item.signature))) {
      return { webhookId, webhookTimestamp };
    }
  }

  const error = new Error("PortOne 웹훅 서명 검증에 실패했습니다.");
  error.status = 400;
  throw error;
}

function parseWebhookPayload(rawBodyText) {
  try {
    return JSON.parse(rawBodyText || "{}");
  } catch {
    const error = new Error("PortOne 웹훅 본문이 올바른 JSON이 아닙니다.");
    error.status = 400;
    throw error;
  }
}

function toPaymentStatus(portoneStatus) {
  const status = String(portoneStatus || "").trim().toUpperCase();
  if (status === "PAID") return "paid";
  if (status === "VIRTUAL_ACCOUNT_ISSUED") return "virtual_account_issued";
  if (status === "CANCELLED" || status === "CANCELED") return "refunded";
  if (status === "PARTIAL_CANCELLED" || status === "PARTIAL_CANCELED") return "partially_refunded";
  if (status === "FAILED") return "failed";
  if (status === "PAY_PENDING") return "pay_pending";
  if (status === "READY") return "ready";
  return status ? status.toLowerCase() : "";
}

function parseStoredPayload(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

// 함수 역할: paid 금액에서 필요한 항목만 골라냅니다.
function pickPaidAmount(portonePayment) {
  // PortOne 응답 구조 변화에 대비해 amount 필드를 유연하게 파싱
  const candidates = [
    portonePayment?.amount?.total,
    portonePayment?.amount?.paid,
    portonePayment?.amount,
    portonePayment?.paidAmount,
  ];
  return candidates.map(toAmountNumber).find((amount) => amount > 0) || 0;
}

// 함수 역할: status에서 필요한 항목만 골라냅니다.
function pickStatus(portonePayment) {
  return (
    portonePayment?.status ||
    portonePayment?.paymentStatus ||
    portonePayment?.transactionStatus ||
    ""
  );
}

// 함수 역할: portone 결제 데이터를 조회해 호출자에게 반환합니다.
async function getPortonePayment(paymentId) {
  if (!env.portoneApiSecret) {
    const error = new Error("PORTONE_API_SECRET 값이 설정되지 않았습니다.");
    error.status = 500;
    throw error;
  }

  const response = await fetch(
    `${env.portoneApiBaseUrl.replace(/\/$/, "")}/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `PortOne ${env.portoneApiSecret}`,
      },
    }
  );

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body?.message || "PortOne 결제 조회에 실패했습니다.");
    error.status = response.status || 502;
    throw error;
  }

  return body?.payment ?? body;
}

// 함수 역할: confirmPayment 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function confirmPayment(payload, authUser = null) {
  const paymentId = normalizeId(payload?.paymentId);
  const orderId = normalizeId(payload?.orderId);
  const requestedAmount = Math.round(toAmountNumber(payload?.amount));
  const userId = normalizeId(authUser?.id);
  const customerEmail = normalizeEmail(authUser?.email);

  if (!userId || !customerEmail) {
    const error = new Error("로그인이 필요합니다.");
    error.status = 401;
    throw error;
  }

  if (!paymentId || !orderId || requestedAmount <= 0) {
    const error = new Error("결제 검증에 필요한 paymentId/orderId/amount 값이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const payment = await getPortonePayment(paymentId);
  const paidAmount = Math.round(pickPaidAmount(payment));
  const status = pickStatus(payment);

  if (paidAmount !== requestedAmount) {
    const error = new Error(
      `결제 금액 검증 실패: 요청금액(${requestedAmount})과 승인금액(${paidAmount})이 다릅니다.`
    );
    error.status = 400;
    throw error;
  }

  if (String(status).toUpperCase() !== "PAID") {
    const error = new Error(`결제 상태가 완료가 아닙니다. 현재 상태: ${status || "UNKNOWN"}`);
    error.status = 400;
    throw error;
  }

  const existingByPayment = await queryOne(
    `SELECT order_id AS orderId, user_id AS userId, amount
     FROM payment_confirmations
     WHERE payment_id = ?
     LIMIT 1`,
    [paymentId]
  );
  if (existingByPayment && existingByPayment.orderId !== orderId) {
    const error = new Error("이미 다른 주문에 연결된 결제입니다.");
    error.status = 409;
    throw error;
  }
  if (existingByPayment && String(existingByPayment.userId) !== userId) {
    const error = new Error("이미 다른 회원에게 연결된 결제입니다.");
    error.status = 409;
    throw error;
  }

  const existingByOrder = await queryOne(
    `SELECT payment_id AS paymentId, user_id AS userId, amount
     FROM payment_confirmations
     WHERE order_id = ?
     LIMIT 1`,
    [orderId]
  );
  if (existingByOrder && existingByOrder.paymentId !== paymentId) {
    const error = new Error("이미 다른 결제가 연결된 주문입니다.");
    error.status = 409;
    throw error;
  }
  if (existingByOrder && String(existingByOrder.userId) !== userId) {
    const error = new Error("이미 다른 회원에게 연결된 주문입니다.");
    error.status = 409;
    throw error;
  }

  const insertResult = await query(
    `INSERT IGNORE INTO payment_confirmations (
      order_id,
      payment_id,
      user_id,
      customer_email,
      customer_email_hash,
      amount,
      status,
      payment_payload,
      confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      orderId,
      paymentId,
      userId,
      encryptPii(customerEmail),
      emailHash(customerEmail),
      paidAmount,
      String(status || "").toUpperCase(),
      encryptPii(JSON.stringify(payment || {})),
    ]
  );

  if (Number(insertResult?.affectedRows || 0) === 0) {
    const current = await queryOne(
      `SELECT order_id AS orderId, payment_id AS paymentId, user_id AS userId, amount
       FROM payment_confirmations
       WHERE order_id = ? OR payment_id = ?
       LIMIT 1`,
      [orderId, paymentId],
    );
    const isSameConfirmation = current
      && String(current.orderId) === orderId
      && String(current.paymentId) === paymentId
      && String(current.userId) === userId
      && Number(current.amount) === paidAmount;
    if (!isSameConfirmation) {
      const error = new Error("이미 다른 주문·회원·금액에 연결된 결제입니다.");
      error.status = 409;
      throw error;
    }
  }

  return {
    approved: true,
    approvedAt: new Date().toISOString(),
    paymentId,
    orderId,
    amount: paidAmount,
    status,
  };
}

export async function claimWebhookEvent({ webhookId, eventType, paymentId, rawBody }) {
  const insertResult = await query(
    `INSERT IGNORE INTO payment_webhook_events (
      webhook_id,
      event_type,
      payment_id,
      payload,
      process_status,
      process_message,
      received_at,
      processed_at,
      last_seen_at,
      attempts
    ) VALUES (?, ?, ?, ?, 'processing', '', NOW(), NULL, NOW(), 1)`,
    [
      webhookId,
      eventType || "",
      paymentId || null,
      encryptPii(rawBody || "{}"),
    ],
  );
  if (Number(insertResult?.affectedRows || 0) === 1) return { claimed: true, retry: false };

  const retryResult = await query(
    `UPDATE payment_webhook_events
     SET event_type = ?, payment_id = ?, payload = ?, process_status = 'processing',
         process_message = '', processed_at = NULL, last_seen_at = NOW(), attempts = attempts + 1
     WHERE webhook_id = ? AND process_status = 'failed'`,
    [eventType || "", paymentId || null, encryptPii(rawBody || "{}"), webhookId],
  );
  if (Number(retryResult?.affectedRows || 0) === 1) return { claimed: true, retry: true };

  await query(
    `UPDATE payment_webhook_events
     SET last_seen_at = NOW(), attempts = attempts + 1
     WHERE webhook_id = ? AND process_status <> 'failed'`,
    [webhookId],
  );

  const existing = await queryOne(
    `SELECT process_status AS processStatus, attempts
     FROM payment_webhook_events
     WHERE webhook_id = ?
     LIMIT 1`,
    [webhookId],
  );
  return { claimed: false, status: existing?.processStatus || "unknown", attempts: Number(existing?.attempts || 0) };
}

async function recordWebhookEvent({ webhookId, eventType, paymentId, rawBody, status, message }) {
  await query(
    `UPDATE payment_webhook_events
     SET event_type = ?, payment_id = ?, payload = ?, process_status = ?, process_message = ?,
         processed_at = IF(? IN ('processed', 'ignored', 'skipped'), NOW(), NULL), last_seen_at = NOW()
     WHERE webhook_id = ?`,
    [
      eventType || "",
      paymentId || null,
      encryptPii(rawBody || "{}"),
      status,
      String(message || "").slice(0, 500),
      status,
      webhookId,
    ],
  );
}

async function syncExistingPaymentConfirmation({ paymentId, payment, status, paidAmount }) {
  await query(
    `UPDATE payment_confirmations
     SET status = ?,
         amount = IF(? > 0, ?, amount),
         payment_payload = ?,
         confirmed_at = IF(? = 'PAID', NOW(), confirmed_at)
     WHERE payment_id = ? OR order_id = ?`,
    [
      status,
      paidAmount,
      paidAmount,
      encryptPii(JSON.stringify(payment || {})),
      status,
      paymentId,
      paymentId,
    ]
  );
}

async function syncExistingOrderStatus({ paymentId, status, paymentStatus, paidAmount }) {
  const order = await queryOne(
    `SELECT id, amount, payload
     FROM orders
     WHERE id = ?
     LIMIT 1`,
    [paymentId]
  );
  if (!order?.id) return "order-not-found";

  const orderAmount = Math.round(toAmountNumber(order.amount));
  if (paidAmount > 0 && orderAmount > 0 && paidAmount !== orderAmount) {
    return "order-amount-mismatch";
  }

  const payload = scrubStoredPii(parseStoredPayload(order.payload));
  const nextPayload = {
    ...payload,
    paymentId,
    paymentStatus: paymentStatus || payload.paymentStatus || status.toLowerCase(),
    paymentWebhookSyncedAt: new Date().toISOString(),
  };
  if (status === "PAID") {
    nextPayload.paymentConfirmedAt = nextPayload.paymentConfirmedAt || new Date().toISOString();
  }

  await query(
    `UPDATE orders
     SET payload = ?
     WHERE id = ?`,
    [JSON.stringify(nextPayload), order.id]
  );
  return "order-updated";
}

// 함수 역할: PortOne V2 웹훅을 검증하고 결제 상태를 로컬 데이터와 동기화합니다.
export async function handlePortoneWebhook({ rawBody, headers } = {}) {
  const rawBodyText = toRawBodyText(rawBody);
  const { webhookId } = verifyStandardWebhook(rawBodyText, headers || {});
  const webhook = parseWebhookPayload(rawBodyText);
  const eventType = String(webhook?.type || "").trim();
  const paymentId = normalizeId(webhook?.data?.paymentId || webhook?.paymentId);

  const claim = await claimWebhookEvent({ webhookId, eventType, paymentId, rawBody: rawBodyText });
  if (!claim.claimed) {
    return {
      ok: true,
      duplicate: true,
      webhookId,
      previousStatus: claim.status,
      attempts: claim.attempts,
    };
  }

  try {

    if (!eventType || !eventType.startsWith("Transaction.")) {
      await recordWebhookEvent({
        webhookId,
        eventType,
        paymentId,
        rawBody: rawBodyText,
        status: "ignored",
        message: "지원하지 않는 웹훅 이벤트입니다.",
      });
      return { ok: true, ignored: true, type: eventType || "unknown" };
    }

    if (!paymentId) {
      await recordWebhookEvent({
        webhookId,
        eventType,
        paymentId: "",
        rawBody: rawBodyText,
        status: "ignored",
        message: "paymentId 없는 결제 웹훅입니다.",
      });
      return { ok: true, ignored: true, type: eventType };
    }

    let payment = null;
    try {
      payment = await getPortonePayment(paymentId);
    } catch (error) {
      if (error.status === 404) {
        await recordWebhookEvent({
          webhookId,
          eventType,
          paymentId,
          rawBody: rawBodyText,
          status: "skipped",
          message: "PortOne 결제 단건 조회 결과가 없습니다.",
        });
        return { ok: true, skipped: true, type: eventType, paymentId };
      }
      throw error;
    }

    const status = String(pickStatus(payment) || "").toUpperCase();
    const paidAmount = Math.round(pickPaidAmount(payment));
    const paymentStatus = toPaymentStatus(status);

    await syncExistingPaymentConfirmation({ paymentId, payment, status, paidAmount });
    const orderSyncStatus = await syncExistingOrderStatus({
      paymentId,
      status,
      paymentStatus,
      paidAmount,
    });

    await recordWebhookEvent({
      webhookId,
      eventType,
      paymentId,
      rawBody: rawBodyText,
      status: "processed",
      message: `${status || "UNKNOWN"} / ${orderSyncStatus}`,
    });

    return {
      ok: true,
      type: eventType,
      paymentId,
      status,
      orderSyncStatus,
    };
  } catch (error) {
    await recordWebhookEvent({
      webhookId,
      eventType,
      paymentId,
      rawBody: rawBodyText,
      status: "failed",
      message: error?.message || "웹훅 처리 중 오류가 발생했습니다.",
    });
    throw error;
  }
}

export async function validateConfirmedPaymentForOrder(conn, input = {}) {
  const orderId = normalizeId(input.orderId);
  const paymentId = normalizeId(input.paymentId);
  const userId = normalizeId(input.userId);
  const customerEmail = normalizeEmail(input.customerEmail);
  const amount = Math.round(toAmountNumber(input.amount));

  if (!orderId || !paymentId || !userId || !customerEmail || amount <= 0) {
    const error = new Error("주문에 연결할 결제 검증 정보가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const [rows] = await conn.execute(
    `SELECT
      order_id AS orderId,
      payment_id AS paymentId,
      user_id AS userId,
      customer_email AS customerEmail,
      amount,
      status,
      confirmed_at AS confirmedAt,
      consumed_at AS consumedAt
     FROM payment_confirmations
     WHERE order_id = ?
     LIMIT 1
     FOR UPDATE`,
    [orderId]
  );
  const confirmation = Array.isArray(rows) ? rows[0] : null;

  if (!confirmation) {
    const error = new Error("서버에서 검증된 결제 기록이 없습니다.");
    error.status = 402;
    throw error;
  }

  if (String(confirmation.paymentId || "") !== paymentId) {
    const error = new Error("주문 결제 ID가 검증 기록과 일치하지 않습니다.");
    error.status = 400;
    throw error;
  }
  if (String(confirmation.userId || "") !== userId) {
    const error = new Error("결제 회원 정보가 일치하지 않습니다.");
    error.status = 403;
    throw error;
  }
  if (normalizeEmail(decryptPii(confirmation.customerEmail)) !== customerEmail) {
    const error = new Error("결제 고객 이메일이 일치하지 않습니다.");
    error.status = 403;
    throw error;
  }
  if (Math.round(toAmountNumber(confirmation.amount)) !== amount) {
    const error = new Error("주문 금액이 결제 검증 금액과 일치하지 않습니다.");
    error.status = 400;
    throw error;
  }
  if (String(confirmation.status || "").toUpperCase() !== "PAID") {
    const error = new Error("결제 완료 상태가 아닙니다.");
    error.status = 400;
    throw error;
  }

  if (confirmation.consumedAt) {
    const [orderRows] = await conn.execute(
      `SELECT id FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    );
    if (!Array.isArray(orderRows) || !orderRows[0]?.id) {
      const error = new Error("이미 사용된 결제 검증 기록입니다.");
      error.status = 409;
      throw error;
    }
  }

  return confirmation;
}

export async function markPaymentConfirmationConsumed(conn, orderId) {
  await conn.execute(
    `UPDATE payment_confirmations
     SET consumed_at = COALESCE(consumed_at, NOW()),
         order_created_at = COALESCE(order_created_at, NOW())
     WHERE order_id = ?`,
    [normalizeId(orderId)]
  );
}

// 함수 역할: portone 결제 권한이 있는지 참/거짓으로 판별합니다.
export async function cancelPortonePayment(paymentId, reason, cancelAmount = null) {
  if (!env.portoneApiSecret) {
    const error = new Error("PORTONE_API_SECRET 값이 설정되지 않았습니다.");
    error.status = 500;
    throw error;
  }

  const body = { reason: reason || "고객 요청 환불" };
  if (cancelAmount != null && cancelAmount > 0) {
    body.amount = Math.round(cancelAmount);
  }

  const response = await fetch(
    `${env.portoneApiBaseUrl.replace(/\/$/, "")}/payments/${encodeURIComponent(paymentId)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `PortOne ${env.portoneApiSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const resBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(resBody?.message || "PortOne 결제 취소에 실패했습니다.");
    error.status = response.status || 502;
    throw error;
  }

  return resBody;
}

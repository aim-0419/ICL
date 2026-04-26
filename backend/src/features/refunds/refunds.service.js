// 파일 역할: 환불 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../shared/db/mysql.js";
import { cancelPortonePayment } from "../payments/payments.service.js";

// 함수 역할: json 문자열이나 페이로드를 코드에서 쓰기 쉬운 구조로 파싱합니다.
function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// 함수 역할: 안전한 텍스트 값으로 안전하게 변환합니다.
function toSafeText(value) {
  return String(value || "").trim();
}

// 함수 역할: 금액 값으로 안전하게 변환합니다.
function toAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

// 함수 역할: already refunded 금액 상황에 맞는 값을 계산하거나 선택합니다.
function resolveAlreadyRefundedAmount(payload) {
  const source = parseJson(payload) || {};
  const candidates = [
    source.refundAmount,
    source.refundedAmount,
    source?.refund?.amount,
  ];
  return Math.max(0, ...candidates.map(toAmount));
}

// 함수 역할: 상품 ids 항목을 모아 반환합니다.
function collectProductIds(payload) {
  const source = parseJson(payload) || {};
  const ids = new Set();

  const add = (value) => {
    const normalized = toSafeText(value);
    if (normalized) ids.add(normalized);
  };

  if (Array.isArray(source.selectedProductIds)) {
    source.selectedProductIds.forEach(add);
  }
  if (Array.isArray(source.items)) {
    source.items.forEach((item) => add(item?.productId));
  }
  add(source.productId);

  return ids;
}

// 함수 역할: cancelled ids 문자열이나 페이로드를 코드에서 쓰기 쉬운 구조로 파싱합니다.
function parseCancelledIds(value) {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return new Set();
  return new Set(parsed.map(toSafeText).filter(Boolean));
}

// 함수 역할: 환불 request 데이터를 새로 생성합니다.
export async function createRefundRequest({
  userId,
  customerEmail,
  orderId,
  selectedProductIds,
  requestedAmount,
  reason,
}) {
  const normalizedOrderId = toSafeText(orderId);
  const normalizedEmail = toSafeText(customerEmail).toLowerCase();

  if (!normalizedOrderId || !userId) {
    const error = new Error("주문 ID와 사용자 정보가 필요합니다.");
    error.status = 400;
    throw error;
  }

  const order = await queryOne(
    `SELECT
      id,
      amount,
      customer_email AS customerEmail,
      payload,
      cancelled_product_ids AS cancelledProductIds
     FROM orders
     WHERE id = ?
     LIMIT 1`,
    [normalizedOrderId]
  );

  if (!order?.id) {
    const error = new Error("주문 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  const orderEmail = toSafeText(order.customerEmail).toLowerCase();
  if (orderEmail && orderEmail !== normalizedEmail) {
    const error = new Error("본인 주문만 환불 신청할 수 있습니다.");
    error.status = 403;
    throw error;
  }

  const existingPending = await queryOne(
    `SELECT id FROM refund_requests WHERE order_id = ? AND status = 'pending' LIMIT 1`,
    [normalizedOrderId]
  );
  if (existingPending?.id) {
    const error = new Error("이미 처리 중인 환불 신청이 있습니다.");
    error.status = 409;
    throw error;
  }

  const grossAmount = toAmount(order.amount);
  const alreadyRefunded = resolveAlreadyRefundedAmount(order.payload);
  const refundableAmount = Math.max(0, grossAmount - alreadyRefunded);
  if (refundableAmount <= 0) {
    const error = new Error("환불 가능한 금액이 없습니다.");
    error.status = 400;
    throw error;
  }

  const cancelledIds = parseCancelledIds(order.cancelledProductIds);
  const orderProductIds = collectProductIds(order.payload);
  const activeProductIds = [...orderProductIds].filter((id) => !cancelledIds.has(id));
  if (!activeProductIds.length) {
    const error = new Error("이미 전액 환불된 주문입니다.");
    error.status = 400;
    throw error;
  }

  const selectedIds = Array.isArray(selectedProductIds) && selectedProductIds.length
    ? selectedProductIds.map(toSafeText).filter((id) => activeProductIds.includes(id))
    : activeProductIds;

  if (!selectedIds.length) {
    const error = new Error("환불할 상품을 선택해 주세요.");
    error.status = 400;
    throw error;
  }

  const isFullRefundRequest = selectedIds.length === activeProductIds.length;
  const requested = toAmount(requestedAmount);
  const computedRequestedAmount = requested > 0
    ? Math.min(requested, refundableAmount)
    : isFullRefundRequest
      ? refundableAmount
      : Math.round(refundableAmount * (selectedIds.length / activeProductIds.length));

  const requestId = randomUUID();
  await query(
    `INSERT INTO refund_requests (
      id,
      order_id,
      user_id,
      customer_email,
      selected_product_ids,
      requested_amount,
      reason,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
    [
      requestId,
      normalizedOrderId,
      String(userId),
      normalizedEmail,
      JSON.stringify(selectedIds),
      computedRequestedAmount,
      toSafeText(reason) || null,
    ]
  );

  return {
    id: requestId,
    orderId: normalizedOrderId,
    status: "pending",
    requestedAmount: computedRequestedAmount,
    selectedProductIds: selectedIds,
  };
}

// 함수 역할: my 환불 requests 목록을 조회해 반환합니다.
export async function listMyRefundRequests(userId) {
  const rows = await query(
    `SELECT
      rr.id,
      rr.order_id AS orderId,
      rr.selected_product_ids AS selectedProductIds,
      rr.requested_amount AS requestedAmount,
      rr.reason,
      rr.status,
      rr.admin_note AS adminNote,
      rr.created_at AS createdAt,
      rr.resolved_at AS resolvedAt,
      o.order_name AS orderName,
      o.amount AS orderAmount
     FROM refund_requests rr
     LEFT JOIN orders o ON o.id = rr.order_id
     WHERE rr.user_id = ?
     ORDER BY rr.created_at DESC`,
    [String(userId)]
  );

  return rows.map((row) => ({
    ...row,
    selectedProductIds: parseJson(row.selectedProductIds) || [],
  }));
}

// 함수 역할: all 환불 requests 목록을 조회해 반환합니다.
export async function listAllRefundRequests({ status = "" } = {}) {
  const hasStatus = Boolean(toSafeText(status));
  const rows = await query(
    `SELECT
      rr.id,
      rr.order_id AS orderId,
      rr.user_id AS userId,
      rr.customer_email AS customerEmail,
      rr.selected_product_ids AS selectedProductIds,
      rr.requested_amount AS requestedAmount,
      rr.reason,
      rr.status,
      rr.admin_note AS adminNote,
      rr.created_at AS createdAt,
      rr.resolved_at AS resolvedAt,
      o.order_name AS orderName,
      o.amount AS orderAmount
     FROM refund_requests rr
     LEFT JOIN orders o ON o.id = rr.order_id
     ${hasStatus ? "WHERE rr.status = ?" : ""}
     ORDER BY rr.created_at DESC`,
    hasStatus ? [toSafeText(status)] : []
  );

  return rows.map((row) => ({
    ...row,
    selectedProductIds: parseJson(row.selectedProductIds) || [],
  }));
}

// 함수 역할: approveRefundRequest 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function approveRefundRequest(requestId, { adminNote = "", approvedAmount = null } = {}) {
  const refundRequest = await queryOne(
    `SELECT
      rr.id,
      rr.order_id AS orderId,
      rr.selected_product_ids AS selectedProductIds,
      rr.requested_amount AS requestedAmount,
      rr.reason,
      rr.status,
      o.amount AS orderAmount,
      o.payload AS orderPayload,
      o.cancelled_product_ids AS cancelledProductIds
     FROM refund_requests rr
     LEFT JOIN orders o ON o.id = rr.order_id
     WHERE rr.id = ?
     LIMIT 1`,
    [toSafeText(requestId)]
  );

  if (!refundRequest?.id) {
    const error = new Error("환불 신청을 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  if (refundRequest.status !== "pending") {
    const error = new Error("이미 처리된 환불 신청입니다.");
    error.status = 409;
    throw error;
  }

  const payload = parseJson(refundRequest.orderPayload) || {};
  const grossAmount = toAmount(refundRequest.orderAmount);
  const alreadyRefunded = resolveAlreadyRefundedAmount(payload);
  const refundableAmount = Math.max(0, grossAmount - alreadyRefunded);

  const normalizedApprovedAmount = toAmount(approvedAmount);
  const fallbackRequestedAmount = toAmount(refundRequest.requestedAmount);
  const cancelAmount = normalizedApprovedAmount > 0
    ? Math.min(normalizedApprovedAmount, refundableAmount)
    : Math.min(fallbackRequestedAmount, refundableAmount);

  if (cancelAmount <= 0) {
    const error = new Error("환불 가능한 금액이 없습니다.");
    error.status = 400;
    throw error;
  }

  const isFullRefund = cancelAmount >= refundableAmount;

  await cancelPortonePayment(
    refundRequest.orderId,
    toSafeText(refundRequest.reason) || "고객 요청 환불",
    isFullRefund ? null : cancelAmount
  );

  const productIdsToCancel = parseJson(refundRequest.selectedProductIds) || [];
  const existingCancelledIds = parseCancelledIds(refundRequest.cancelledProductIds);
  productIdsToCancel.forEach((productId) => {
    const normalized = toSafeText(productId);
    if (normalized) existingCancelledIds.add(normalized);
  });

  const totalRefunded = alreadyRefunded + cancelAmount;
  const history = Array.isArray(payload.refundHistory) ? [...payload.refundHistory] : [];
  history.push({
    amount: cancelAmount,
    reason: toSafeText(refundRequest.reason) || "고객 요청 환불",
    processedAt: new Date().toISOString(),
  });

  const nextPayload = {
    ...payload,
    refundAmount: totalRefunded,
    refundedAmount: totalRefunded,
    refund: {
      amount: totalRefunded,
      reason: history[history.length - 1].reason,
      lastRefundAmount: cancelAmount,
    },
    refundHistory: history,
    paymentStatus: totalRefunded >= grossAmount ? "refunded" : "partially_refunded",
  };

  await query(
    `UPDATE orders
     SET payload = ?, cancelled_product_ids = ?
     WHERE id = ?`,
    [
      JSON.stringify(nextPayload),
      JSON.stringify([...existingCancelledIds]),
      refundRequest.orderId,
    ]
  );

  await query(
    `UPDATE refund_requests
     SET status = 'approved', admin_note = ?, resolved_at = NOW()
     WHERE id = ?`,
    [toSafeText(adminNote) || null, refundRequest.id]
  );

  return {
    message: isFullRefund ? "전액 환불이 완료되었습니다." : "부분 환불이 완료되었습니다.",
    cancelAmount,
  };
}

// 함수 역할: rejectRefundRequest 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function rejectRefundRequest(requestId, { adminNote = "" } = {}) {
  const refundRequest = await queryOne(
    `SELECT id, status
     FROM refund_requests
     WHERE id = ?
     LIMIT 1`,
    [toSafeText(requestId)]
  );

  if (!refundRequest?.id) {
    const error = new Error("환불 신청을 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  if (refundRequest.status !== "pending") {
    const error = new Error("이미 처리된 환불 신청입니다.");
    error.status = 409;
    throw error;
  }

  await query(
    `UPDATE refund_requests
     SET status = 'rejected', admin_note = ?, resolved_at = NOW()
     WHERE id = ?`,
    [toSafeText(adminNote) || null, refundRequest.id]
  );

  return { message: "환불 신청이 거절되었습니다." };
}

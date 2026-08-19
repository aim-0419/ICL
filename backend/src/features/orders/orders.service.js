// 파일 역할: 주문 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../shared/db/mysql.js";
import {
  decryptOrderRow,
  decryptUserRow,
  emailHash,
  encryptPii,
  normalizeEmail,
  scrubStoredPii,
} from "../../shared/security/pii.js";
import {
  cancelPortonePayment,
  markPaymentConfirmationConsumed,
  validateConfirmedPaymentForOrder,
} from "../payments/payments.service.js";
import { computeServerOrderTotal } from "./order-pricing.js";
import { parsePayload } from "../../shared/utils/payload.js";
import {
  normalizeBirthYear,
  normalizeAgeGroup,
  resolveAgeGroupByBirthYear,
} from "../../shared/utils/normalize.js";

function toPublicOrder(row) {
  const order = decryptOrderRow(row);
  const publicPayload = scrubStoredPii(parsePayload(order?.payload));
  return {
    ...order,
    ...publicPayload,
    customerEmail: order?.customerEmail || "",
  };
}

// 함수 역할: 주문 목록을 조회해 반환합니다.
function inferStudioPassType(product) {
  const text = `${product?.name || ""} ${product?.description || ""} ${product?.period || ""}`.toLowerCase();
  if (text.includes("duet") || text.includes("듀엣")) return "duet";
  if (text.includes("private") || text.includes("개인")) return "private";
  if (text.includes("group") || text.includes("그룹")) return "group";
  return "";
}

function parseStudioPassCount(product) {
  const text = `${product?.name || ""} ${product?.description || ""} ${product?.period || ""}`;
  const countMatch = text.match(/(\d+)\s*회/);
  if (countMatch) return Math.max(1, Number(countMatch[1]));
  if (/무제한|unlimited/i.test(text)) return 9999;
  return 0;
}

function parsePeriodDays(periodText) {
  const text = String(periodText || "").trim();
  if (!text || /무제한|평생|unlimited|lifetime/i.test(text)) return null;
  const monthMatch = text.match(/(\d+)\s*(개월|month)/i);
  if (monthMatch) return Math.max(1, Number(monthMatch[1])) * 30;
  const dayMatch = text.match(/(\d+)\s*(일|day)/i);
  if (dayMatch) return Math.max(1, Number(dayMatch[1]));
  const numberMatch = text.match(/(\d+)/);
  return numberMatch ? Math.max(1, Number(numberMatch[1])) : null;
}

function addDaysSql(days) {
  if (!Number.isFinite(days) || days <= 0) return null;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function collectOrderProductQuantities(order) {
  const map = new Map();
  const add = (productId, quantity = 1) => {
    const id = String(productId || "").trim();
    if (!id) return;
    map.set(id, (map.get(id) || 0) + Math.max(1, Math.round(Number(quantity || 1))));
  };
  if (Array.isArray(order?.items)) order.items.forEach((item) => add(item?.productId, item?.quantity));
  if (Array.isArray(order?.selectedProductIds)) order.selectedProductIds.forEach((id) => add(id, 1));
  return map;
}

async function issueStudioPassesForPaidOrder(conn, paidOrder) {
  const userId = String(paidOrder?.customerUserId || paidOrder?.customer?.userId || "").trim();
  if (!userId) return;
  const productQuantities = collectOrderProductQuantities(paidOrder);
  if (productQuantities.size === 0) return;

  for (const [productId, quantity] of productQuantities.entries()) {
    const [productRows] = await conn.execute(
      `SELECT p.id, p.name, p.description, p.period, av.id AS academyVideoId
       FROM products p
       LEFT JOIN academy_videos av ON av.product_id = p.id
       WHERE p.id = ?
       LIMIT 1`,
      [productId]
    );
    const product = Array.isArray(productRows) ? productRows[0] : null;
    if (!product || product.academyVideoId) continue;

    const passType = inferStudioPassType(product);
    const baseCount = parseStudioPassCount(product);
    if (!passType || baseCount <= 0) continue;

    const totalCount = baseCount * quantity;
    const passId = `studio-pass-${paidOrder.id}-${product.id}`.slice(0, 180) || randomUUID();
    await conn.execute(
      `INSERT INTO studio_passes
        (id, user_id, pass_name, pass_type, remaining_count, total_count, expires_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
       ON DUPLICATE KEY UPDATE id = id`,
      [passId, userId, product.name || "Studio pass", passType, totalCount, totalCount, addDaysSql(parsePeriodDays(product.period))]
    );
  }
}
export async function listOrders() {
  const rows = await query(
    `SELECT id, order_name AS orderName, amount, customer_email AS customerEmail, payload, created_at AS createdAt
     FROM orders
     ORDER BY created_at DESC`
  );

  return rows.map(toPublicOrder);
}

// 함수 역할: 주문 by customer 이메일 목록을 조회해 반환합니다.
export async function listOrdersByCustomerEmail(customerEmail) {
  const normalizedEmail = normalizeEmail(customerEmail);
  const rows = await query(
    `SELECT id, order_name AS orderName, amount, customer_email AS customerEmail, payload, created_at AS createdAt
     FROM orders
     WHERE customer_email_hash = ?
     ORDER BY created_at DESC`,
    [emailHash(normalizedEmail)]
  );

  return rows.map(toPublicOrder);
}

// 함수 역할: 주문 데이터를 새로 생성합니다.
export async function createOrder(payload, authUser = null) {
  const normalizedOrderId = String(payload?.orderId || "").trim();
  const customerEmail = normalizeEmail(authUser?.email || payload?.customerEmail || "");
  const paymentId = String(payload?.paymentId || "").trim();
  const amountValue = Number(payload?.amount ?? 0);
  const amount = Number.isFinite(amountValue) ? Math.round(amountValue) : 0;

  if (!customerEmail) {
    const error = new Error("주문 고객 이메일을 확인할 수 없습니다.");
    error.status = 400;
    throw error;
  }

  if (!normalizedOrderId || !paymentId || amount <= 0) {
    const error = new Error("주문 생성에 필요한 결제 정보가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const customerFromDbRow = customerEmail
    ? await queryOne(
        `SELECT id, email, birth_year_encrypted AS birthYearEncrypted
         FROM users
         WHERE email_hash = ?
         LIMIT 1`,
        [emailHash(customerEmail)]
      )
    : null;
  const customerFromDb = decryptUserRow(customerFromDbRow);

  const payloadAgeGroup =
    normalizeAgeGroup(payload?.customerAgeGroup) ||
    normalizeAgeGroup(payload?.ageGroup) ||
    normalizeAgeGroup(payload?.customer?.ageGroup);
  const payloadBirthYear =
    normalizeBirthYear(payload?.customerBirthYear) ||
    normalizeBirthYear(payload?.birthYear) ||
    normalizeBirthYear(payload?.customer?.birthYear);
  const userBirthYear = normalizeBirthYear(customerFromDb?.birthYear);

  const resolvedBirthYear = payloadBirthYear || userBirthYear || null;
  const resolvedAgeGroup =
    payloadAgeGroup || resolveAgeGroupByBirthYear(resolvedBirthYear) || "미분류";

  const sanitizedItems = Array.isArray(payload?.items)
    ? payload.items
        .map((item) => ({
          productId: String(item?.productId || "").trim(),
          quantity: Math.max(1, Math.round(Number(item?.quantity ?? 1) || 1)),
        }))
        .filter((item) => item.productId)
    : undefined;

  const sanitizedSelectedProductIds = Array.isArray(payload?.selectedProductIds)
    ? payload.selectedProductIds.map((id) => String(id || "").trim()).filter(Boolean)
    : undefined;

  const order = {
    id: normalizedOrderId,
    createdAt: new Date().toISOString(),
    orderName: String(payload?.orderName || "").trim() || null,
    amount,
    paymentId,
    paymentMethod: String(payload?.paymentMethod || "").trim() || null,
    ...(sanitizedItems ? { items: sanitizedItems } : {}),
    ...(sanitizedSelectedProductIds ? { selectedProductIds: sanitizedSelectedProductIds } : {}),
    customerEmail: customerEmail || null,
    customerAgeGroup: resolvedAgeGroup,
    customerBirthYear: resolvedBirthYear,
    customerUserId: String(authUser?.id || customerFromDb?.id || "").trim() || null,
    customer: {
      ...(payload?.customer && typeof payload.customer === "object" ? payload.customer : {}),
      userId: String(authUser?.id || customerFromDb?.id || "").trim() || null,
      email: customerEmail || null,
      ageGroup: resolvedAgeGroup,
      birthYear: resolvedBirthYear,
    },
  };

  return withTransaction(async (conn) => {
    const [existingRows] = await conn.execute(
      `SELECT
        id,
        order_name AS orderName,
        amount,
        customer_email AS customerEmail,
        payload,
        created_at AS createdAt
       FROM orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [order.id]
    );
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    const existingOrder = decryptOrderRow(existing);

    if (existingOrder?.customerEmail && normalizeEmail(existingOrder.customerEmail) !== customerEmail) {
      const error = new Error("이미 다른 회원에게 연결된 주문입니다.");
      error.status = 409;
      throw error;
    }

    const confirmation = await validateConfirmedPaymentForOrder(conn, {
      orderId: order.id,
      paymentId: order.paymentId,
      userId: authUser?.id,
      customerEmail,
      amount: order.amount,
    });

    if (existing?.id) {
      await markPaymentConfirmationConsumed(conn, existing.id);
      return toPublicOrder(existing);
    }

    // 서버 권위 금액 검증. 여기서부터는 새 주문이다.
    //
    // 클라이언트가 보낸 금액(order.amount)은 신뢰하지 않는다. 상품 가격을 서버에서 직접 조회해
    // 정당한 결제액을 계산하고, 실제 승인·결제된 금액(confirmation.amount, PortOne 검증 완료)과 대조한다.
    // 가격원은 두 곳이다: 교육영상은 products, 스튜디오 수강권은 studio_pass_products.
    const productQuantities = collectOrderProductQuantities(order);
    const productIds = [...productQuantities.keys()];

    const priceMap = new Map();
    if (productIds.length > 0) {
      const placeholders = productIds.map(() => "?").join(", ");
      const [productRows] = await conn.execute(
        `SELECT id, price FROM products WHERE id IN (${placeholders})`,
        productIds,
      );
      for (const row of Array.isArray(productRows) ? productRows : []) {
        priceMap.set(String(row.id), Number(row.price));
      }
      const [passRows] = await conn.execute(
        `SELECT id, price FROM studio_pass_products WHERE id IN (${placeholders})`,
        productIds,
      );
      for (const row of Array.isArray(passRows) ? passRows : []) {
        if (!priceMap.has(String(row.id))) priceMap.set(String(row.id), Number(row.price));
      }
    }

    // 포인트 할인은 실제 보유 잔액 안으로 제한한다. 결제 흐름이 포인트를 실제 차감하지 않으므로
    // discountPoint 를 그대로 믿으면 잔액 없는 사용자가 유령 할인으로 결제액을 낮출 수 있다.
    const [[pointRow]] = await conn.execute(
      `SELECT points FROM users WHERE id = ? LIMIT 1`,
      [String(authUser?.id || "")],
    );
    const pointBalance = Number(pointRow?.points ?? 0);
    const requestedDiscount = Number(order?.discountPoint ?? 0);

    const pricing = computeServerOrderTotal({
      quantities: productQuantities,
      priceOf: (id) => (priceMap.has(String(id)) ? priceMap.get(String(id)) : null),
      discountPoint: requestedDiscount,
      pointBalance,
      paidAmount: Number(confirmation?.amount ?? order.amount),
    });

    if (!pricing.ok) {
      // 정당한 결제액과 실제 결제액이 다르다. 주문을 만들지 않고, 이미 승인된 결제는 취소를 시도한다.
      // 취소는 외부 결제 호출 게이트를 따르므로 개발/테스트(TEST_SAFE_MODE)에서는 호출 자체가 막힌다.
      // 그 경우에도 관리자가 인지할 수 있도록 반드시 로그를 남긴다.
      const detail = pricing.unresolved.length > 0
        ? `가격을 확인할 수 없는 상품(${pricing.unresolved.join(", ")})`
        : `기대 결제액 ${pricing.expectedAmount}원 vs 실제 결제액 ${Number(confirmation?.amount ?? order.amount)}원`;
      console.error(
        `[payment-amount] 주문 ${order.id} 금액 검증 실패: ${detail}. 결제 ${order.paymentId} 취소 시도.`,
      );
      try {
        await cancelPortonePayment(order.paymentId, "결제 금액 검증 실패로 자동 취소");
        console.error(`[payment-amount] 결제 ${order.paymentId} 취소 완료.`);
      } catch (cancelError) {
        console.error(
          `[payment-amount] 결제 ${order.paymentId} 취소 실패: ${cancelError?.message || cancelError}. 관리자 수동 확인 필요.`,
        );
      }
      const error = new Error("결제 금액이 상품 가격과 일치하지 않아 주문을 생성할 수 없습니다.");
      error.status = 400;
      throw error;
    }

    const confirmedAt =
      confirmation?.confirmedAt instanceof Date
        ? confirmation.confirmedAt.toISOString()
        : new Date(confirmation?.confirmedAt || Date.now()).toISOString();
    const paidOrder = {
      ...order,
      paymentStatus: "paid",
      paymentConfirmedAt: confirmedAt,
    };

    await conn.execute(
      `INSERT INTO orders (id, order_name, amount, customer_email, customer_email_hash, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         order_name = VALUES(order_name),
         amount = VALUES(amount),
         customer_email = VALUES(customer_email),
         customer_email_hash = VALUES(customer_email_hash),
         payload = VALUES(payload),
         created_at = NOW()`,
      [
        paidOrder.id,
        paidOrder.orderName ?? null,
        Number(paidOrder.amount ?? 0),
        encryptPii(paidOrder.customerEmail ?? null),
        emailHash(paidOrder.customerEmail),
        JSON.stringify(scrubStoredPii(paidOrder)),
      ]
    );

    await issueStudioPassesForPaidOrder(conn, paidOrder);
    await markPaymentConfirmationConsumed(conn, paidOrder.id);

    return paidOrder;
  });
}

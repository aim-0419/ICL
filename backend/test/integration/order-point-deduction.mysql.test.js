// 포인트 차감 통합 테스트. 실제 DB에서 createOrder 의 포인트 차감·멱등성을 검증한다.
//
// createOrder 는 검증된 결제 기록(payment_confirmations)을 전제하므로,
// PortOne 을 호출하지 않고 그 기록을 직접 seed 한 뒤 createOrder 를 부른다.
// RUN_DB_INTEGRATION_TESTS=1 일 때만 실행되며, 테스트 데이터는 고유 ID 로 만들고 끝나면 지운다.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { closeDatabase, ensureInitialized, query } from "../../src/shared/db/mysql.js";
import { createOrder } from "../../src/features/orders/orders.service.js";
import { encryptPii, emailHash } from "../../src/shared/security/pii.js";

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === "1";

const suffix = randomUUID().slice(0, 8);
const USER_ID = `pt-user-${suffix}`;
const USER_EMAIL = `pt-${suffix}@example.com`;
const PRODUCT_ID = `pt-prod-${suffix}`;
const PRODUCT_PRICE = 100000;
const created = { orders: [], payments: [] };

async function seedConfirmedPayment({ orderId, paymentId, amount }) {
  await query(
    `INSERT INTO payment_confirmations
       (order_id, payment_id, user_id, customer_email, customer_email_hash, amount, status, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PAID', NOW())`,
    [orderId, paymentId, USER_ID, encryptPii(USER_EMAIL), emailHash(USER_EMAIL), amount],
  );
  created.payments.push(orderId);
  created.orders.push(orderId);
}

function orderPayload({ orderId, paymentId, amount, discountPoint = 0 }) {
  return {
    orderId,
    paymentId,
    amount,
    orderName: "포인트 차감 테스트",
    customerEmail: USER_EMAIL,
    selectedProductIds: [PRODUCT_ID],
    discountPoint,
  };
}

async function getPoints() {
  const row = await query(`SELECT points FROM users WHERE id = ?`, [USER_ID]);
  return Number(row?.[0]?.points ?? 0);
}

async function countDeductions(orderId) {
  const row = await query(
    `SELECT COUNT(*) AS n FROM point_history WHERE order_id = ? AND amount < 0`,
    [orderId],
  );
  return Number(row?.[0]?.n ?? 0);
}

test("포인트 차감 통합", { skip: !shouldRun }, async (t) => {
  await ensureInitialized();

  // 테스트 사용자·상품 준비 (포인트 50000 보유)
  await query(
    `INSERT INTO users (id, login_id, password, name, email, email_hash, points, created_at)
     VALUES (?, ?, 'x', '테스트', ?, ?, 50000, NOW())
     ON DUPLICATE KEY UPDATE points = 50000`,
    [USER_ID, USER_ID, encryptPii(USER_EMAIL), emailHash(USER_EMAIL)],
  );
  await query(
    `INSERT INTO products (id, name, price) VALUES (?, '포인트 테스트 상품', ?)
     ON DUPLICATE KEY UPDATE price = VALUES(price)`,
    [PRODUCT_ID, PRODUCT_PRICE],
  );

  await t.test("포인트 사용 시 잔액이 실제로 줄고 이력이 남는다", async () => {
    const orderId = `pt-ord-${randomUUID().slice(0, 8)}`;
    const paymentId = `pt-pay-${randomUUID().slice(0, 8)}`;
    await seedConfirmedPayment({ orderId, paymentId, amount: 70000 }); // 100000 - 30000

    const before = await getPoints();
    await createOrder(orderPayload({ orderId, paymentId, amount: 70000, discountPoint: 30000 }), { id: USER_ID, email: USER_EMAIL });

    assert.equal(await getPoints(), before - 30000, "잔액이 30000 줄어야 한다");
    assert.equal(await countDeductions(orderId), 1, "차감 이력 1건");
  });

  await t.test("같은 주문 재제출은 이중 차감하지 않는다", async () => {
    const orderId = `pt-ord-${randomUUID().slice(0, 8)}`;
    const paymentId = `pt-pay-${randomUUID().slice(0, 8)}`;
    await seedConfirmedPayment({ orderId, paymentId, amount: 80000 }); // 100000 - 20000

    await createOrder(orderPayload({ orderId, paymentId, amount: 80000, discountPoint: 20000 }), { id: USER_ID, email: USER_EMAIL });
    const afterFirst = await getPoints();
    // 같은 orderId 로 재요청
    await createOrder(orderPayload({ orderId, paymentId, amount: 80000, discountPoint: 20000 }), { id: USER_ID, email: USER_EMAIL });

    assert.equal(await getPoints(), afterFirst, "재제출 후 잔액 불변");
    assert.equal(await countDeductions(orderId), 1, "차감 이력은 여전히 1건");
  });

  await t.test("잔액을 초과한 할인 결제는 거부되고 차감도 없다", async () => {
    // 현재 잔액을 넘는 할인 시도
    const current = await getPoints();
    const discount = current + 10000;
    const orderId = `pt-ord-${randomUUID().slice(0, 8)}`;
    const paymentId = `pt-pay-${randomUUID().slice(0, 8)}`;
    // 고객이 초과 할인받아 결제한 금액
    await seedConfirmedPayment({ orderId, paymentId, amount: PRODUCT_PRICE - discount });

    await assert.rejects(
      createOrder(orderPayload({ orderId, paymentId, amount: PRODUCT_PRICE - discount, discountPoint: discount }), { id: USER_ID, email: USER_EMAIL }),
    );
    assert.equal(await getPoints(), current, "거부 시 잔액 불변");
    assert.equal(await countDeductions(orderId), 0, "차감 이력 없음");
  });

  await t.test("포인트 미사용 정상 결제는 잔액에 영향이 없다", async () => {
    const current = await getPoints();
    const orderId = `pt-ord-${randomUUID().slice(0, 8)}`;
    const paymentId = `pt-pay-${randomUUID().slice(0, 8)}`;
    await seedConfirmedPayment({ orderId, paymentId, amount: PRODUCT_PRICE });

    await createOrder(orderPayload({ orderId, paymentId, amount: PRODUCT_PRICE, discountPoint: 0 }), { id: USER_ID, email: USER_EMAIL });

    assert.equal(await getPoints(), current, "잔액 불변");
    assert.equal(await countDeductions(orderId), 0, "차감 이력 없음");
  });
});

after(async () => {
  if (!shouldRun) return;
  for (const orderId of created.orders) {
    await query(`DELETE FROM point_history WHERE order_id = ?`, [orderId]).catch(() => {});
    await query(`DELETE FROM orders WHERE id = ?`, [orderId]).catch(() => {});
    await query(`DELETE FROM payment_confirmations WHERE order_id = ?`, [orderId]).catch(() => {});
  }
  await query(`DELETE FROM point_history WHERE user_id = ?`, [USER_ID]).catch(() => {});
  await query(`DELETE FROM products WHERE id = ?`, [PRODUCT_ID]).catch(() => {});
  await query(`DELETE FROM users WHERE id = ?`, [USER_ID]).catch(() => {});
  await closeDatabase();
});

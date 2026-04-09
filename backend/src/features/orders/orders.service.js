import { query } from "../../shared/db/mysql.js";

function parsePayload(payload) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

export async function listOrders() {
  const rows = await query(
    `SELECT id, order_name AS orderName, amount, customer_email AS customerEmail, payload, created_at AS createdAt
     FROM orders
     ORDER BY created_at DESC`
  );

  return rows.map((row) => ({
    ...row,
    ...parsePayload(row.payload),
  }));
}

export async function listOrdersByCustomerEmail(customerEmail) {
  const rows = await query(
    `SELECT id, order_name AS orderName, amount, customer_email AS customerEmail, payload, created_at AS createdAt
     FROM orders
     WHERE customer_email = ?
     ORDER BY created_at DESC`,
    [customerEmail]
  );

  return rows.map((row) => ({
    ...row,
    ...parsePayload(row.payload),
  }));
}

export async function createOrder(payload) {
  const normalizedOrderId = String(payload?.orderId || "").trim();
  const order = {
    id: normalizedOrderId || `order-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...payload,
  };

  await query(
    `INSERT INTO orders (id, order_name, amount, customer_email, payload, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       order_name = VALUES(order_name),
       amount = VALUES(amount),
       customer_email = VALUES(customer_email),
       payload = VALUES(payload),
       created_at = NOW()`,
    [
      order.id,
      order.orderName ?? null,
      Number(order.amount ?? 0),
      order.customerEmail ?? null,
      JSON.stringify(order),
    ]
  );

  return order;
}

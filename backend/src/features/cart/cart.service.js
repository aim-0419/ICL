import { query } from "../../shared/db/mysql.js";

async function getCartItems(userId) {
  const rows = await query(
    `SELECT product_id AS productId, quantity
     FROM cart_items
     WHERE user_id = ?
     ORDER BY updated_at DESC`,
    [userId]
  );
  return rows;
}

export async function getCart(userId = "guest") {
  const items = await getCartItems(userId);
  return { userId, items };
}

export async function addItem(userId = "guest", productId, quantity = 1) {
  const safeQuantity = Math.max(1, Number(quantity || 1));
  await query(
    `INSERT INTO cart_items (user_id, product_id, quantity, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       quantity = quantity + VALUES(quantity),
       updated_at = NOW()`,
    [userId, productId, safeQuantity]
  );
  return getCart(userId);
}

export async function updateItem(userId = "guest", productId, quantity = 1) {
  const safeQuantity = Math.max(1, Number(quantity || 1));
  await query(
    `INSERT INTO cart_items (user_id, product_id, quantity, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       quantity = VALUES(quantity),
       updated_at = NOW()`,
    [userId, productId, safeQuantity]
  );
  return getCart(userId);
}

export async function removeItem(userId = "guest", productId) {
  await query(`DELETE FROM cart_items WHERE user_id = ? AND product_id = ?`, [userId, productId]);
  return getCart(userId);
}

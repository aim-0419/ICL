// 파일 역할: 장바구니 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { query } from "../../shared/db/mysql.js";

// 함수 역할: 장바구니 항목 데이터를 조회해 호출자에게 반환합니다.
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

// 함수 역할: 장바구니 데이터를 조회해 호출자에게 반환합니다.
export async function getCart(userId = "guest") {
  const items = await getCartItems(userId);
  return { userId, items };
}

// 함수 역할: addItem 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
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

// 함수 역할: 항목 데이터를 수정합니다.
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

// 함수 역할: 항목 값을 제거하고 관련 상태를 정리합니다.
export async function removeItem(userId = "guest", productId) {
  await query(`DELETE FROM cart_items WHERE user_id = ? AND product_id = ?`, [userId, productId]);
  return getCart(userId);
}

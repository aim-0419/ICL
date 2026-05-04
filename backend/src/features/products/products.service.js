// 파일 역할: 상품 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../shared/db/mysql.js";

// 함수 역할: 상품 목록을 조회해 반환합니다.
export async function listProducts() {
  return query(
    `SELECT id, name, price, description, period
     FROM products
     ORDER BY name`
  );
}

// 함수 역할: 상품 데이터를 새로 생성합니다.
export async function createProduct(payload) {
  const id = `product-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const name = String(payload.name || "").trim();
  const price = Number(payload.price) || 0;
  const description = String(payload.description || "").trim() || null;
  const period = String(payload.period || "").trim() || null;

  if (!name) {
    const error = new Error("상품 이름을 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  await query(
    `INSERT INTO products (id, name, price, description, period) VALUES (?, ?, ?, ?, ?)`,
    [id, name, price, description, period]
  );

  return queryOne(`SELECT id, name, price, description, period FROM products WHERE id = ?`, [id]);
}

// 함수 역할: 상품 데이터를 수정합니다.
export async function updateProduct(productId, payload) {
  const existing = await queryOne(`SELECT id FROM products WHERE id = ?`, [productId]);
  if (!existing) {
    const error = new Error("상품 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  const name = String(payload.name || "").trim();
  const price = Number(payload.price) || 0;
  const description = String(payload.description || "").trim() || null;
  const period = String(payload.period || "").trim() || null;

  if (!name) {
    const error = new Error("상품 이름을 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  await query(
    `UPDATE products SET name = ?, price = ?, description = ?, period = ? WHERE id = ?`,
    [name, price, description, period, productId]
  );

  return queryOne(`SELECT id, name, price, description, period FROM products WHERE id = ?`, [productId]);
}

// 함수 역할: 상품 데이터를 삭제합니다.
export async function deleteProduct(productId) {
  const existing = await queryOne(`SELECT id FROM products WHERE id = ?`, [productId]);
  if (!existing) {
    const error = new Error("상품 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  await query(`DELETE FROM products WHERE id = ?`, [productId]);
  return { ok: true, id: productId };
}

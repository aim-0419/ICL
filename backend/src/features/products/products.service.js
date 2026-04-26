// 파일 역할: 상품 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { query } from "../../shared/db/mysql.js";

// 함수 역할: 상품 목록을 조회해 반환합니다.
export async function listProducts() {
  return query(
    `SELECT id, name, price, description, period
     FROM products
     ORDER BY name`
  );
}

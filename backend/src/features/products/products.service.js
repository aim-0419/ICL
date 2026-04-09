import { query } from "../../shared/db/mysql.js";

export async function listProducts() {
  return query(
    `SELECT id, name, price, description, period
     FROM products
     ORDER BY name`
  );
}

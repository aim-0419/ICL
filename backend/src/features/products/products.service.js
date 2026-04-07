import { db } from "../../shared/data/in-memory-db.js";

export function listProducts() {
  return db.products;
}

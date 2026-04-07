import { db } from "../../shared/data/in-memory-db.js";

export function listOrders() {
  return db.orders;
}

export function createOrder(payload) {
  const order = {
    id: `order-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...payload,
  };
  db.orders.unshift(order);
  return order;
}

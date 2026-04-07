import { db } from "../../shared/data/in-memory-db.js";

function getUserCart(userId) {
  let cart = db.carts.find((item) => item.userId === userId);
  if (!cart) {
    cart = { userId, items: [] };
    db.carts.push(cart);
  }
  return cart;
}

export function getCart(userId = "guest") {
  return getUserCart(userId);
}

export function addItem(userId = "guest", productId, quantity = 1) {
  const cart = getUserCart(userId);
  const item = cart.items.find((line) => line.productId === productId);

  if (item) {
    item.quantity += quantity;
  } else {
    cart.items.push({ productId, quantity });
  }

  return cart;
}

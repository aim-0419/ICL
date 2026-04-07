import * as cartService from "./cart.service.js";

export function getCart(req, res) {
  res.json(cartService.getCart(req.query.userId));
}

export function addItem(req, res) {
  const { productId, quantity } = req.body;
  res.status(201).json(cartService.addItem(req.query.userId, productId, Number(quantity ?? 1)));
}

import * as cartService from "./cart.service.js";

function pickUserId(req, res) {
  const userId = String(req.query.userId || "").trim();
  if (!userId) {
    res.status(400).json({ message: "userId가 필요합니다." });
    return null;
  }
  return userId;
}

export async function getCart(req, res, next) {
  try {
    const userId = pickUserId(req, res);
    if (!userId) return;
    res.json(await cartService.getCart(userId));
  } catch (error) {
    next(error);
  }
}

export async function addItem(req, res, next) {
  try {
    const userId = pickUserId(req, res);
    if (!userId) return;
    const { productId, quantity } = req.body;
    const result = await cartService.addItem(userId, productId, Number(quantity ?? 1));
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateItem(req, res, next) {
  try {
    const userId = pickUserId(req, res);
    if (!userId) return;
    const { quantity } = req.body;
    const result = await cartService.updateItem(
      userId,
      req.params.productId,
      Number(quantity ?? 1)
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function removeItem(req, res, next) {
  try {
    const userId = pickUserId(req, res);
    if (!userId) return;
    const result = await cartService.removeItem(userId, req.params.productId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

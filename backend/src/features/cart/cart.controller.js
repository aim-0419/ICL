// 파일 역할: 장바구니 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as cartService from "./cart.service.js";

// 함수 역할: 회원 ID에서 필요한 항목만 골라냅니다.
function pickUserId(req, res) {
  const userId = String(req.query.userId || "").trim();
  if (!userId) {
    res.status(400).json({ message: "userId가 필요합니다." });
    return null;
  }
  return userId;
}

// 함수 역할: 장바구니 데이터를 조회해 호출자에게 반환합니다.
export async function getCart(req, res, next) {
  try {
    const userId = pickUserId(req, res);
    if (!userId) return;
    res.json(await cartService.getCart(userId));
  } catch (error) {
    next(error);
  }
}

// 함수 역할: addItem 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
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

// 함수 역할: 항목 데이터를 수정합니다.
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

// 함수 역할: 항목 값을 제거하고 관련 상태를 정리합니다.
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

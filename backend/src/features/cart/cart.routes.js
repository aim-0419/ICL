/**
 * 장바구니(Cart) 기능
 * - 로그인한 사용자의 장바구니 상품 목록을 서버에 저장·관리
 * - 상품 추가 시 이미 담긴 상품이면 수량을 합산, 결제 완료 후 장바구니 자동 비움
 * - 프론트엔드 AppContext의 cart 상태와 동기화됨
 *
 * 엔드포인트:
 * GET    /api/cart/                    - 장바구니 목록 조회
 * POST   /api/cart/items               - 상품 추가
 * PUT    /api/cart/items/:productId    - 수량 변경
 * DELETE /api/cart/items/:productId   - 상품 제거
 */
// 파일 역할: 장바구니 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import { Router } from "express";
import * as cartController from "./cart.controller.js";

// 라우터 역할: 장바구니 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const cartRoutes = Router();

cartRoutes.get("/", cartController.getCart);
cartRoutes.post("/items", cartController.addItem);
cartRoutes.put("/items/:productId", cartController.updateItem);
cartRoutes.delete("/items/:productId", cartController.removeItem);

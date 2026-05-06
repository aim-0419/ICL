/**
 * 상품(Products) 기능
 * - 판매 상품 목록을 관리하는 기능 (강의 수강권, 번들 등)
 * - 상품은 결제·장바구니·주문 기능과 연결되며, 관리자만 생성·수정·삭제 가능
 * - 상품에는 이름, 가격, 설명, 수강기간(period) 필드가 있음
 *
 * 엔드포인트:
 * GET    /api/products/            - 전체 상품 목록 (비로그인 허용)
 * POST   /api/products/            - 상품 등록 (관리자)
 * PATCH  /api/products/:productId  - 상품 수정 (관리자)
 * DELETE /api/products/:productId  - 상품 삭제 (관리자)
 */
// 파일 역할: 상품 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import { Router } from "express";
import * as productsController from "./products.controller.js";

// 라우터 역할: 상품 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const productsRoutes = Router();

productsRoutes.get("/", productsController.getProducts);
productsRoutes.post("/", productsController.createProduct);
productsRoutes.patch("/:productId", productsController.updateProduct);
productsRoutes.delete("/:productId", productsController.deleteProduct);

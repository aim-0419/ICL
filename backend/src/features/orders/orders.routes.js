/**
 * 주문(Orders) 기능
 * - 결제 전 주문 레코드를 생성하고, 결제 완료 후 내역을 조회하는 기능
 * - 주문 생성(POST) → PortOne 결제 진행 → payments/confirm으로 최종 확정 순으로 흐름
 * - 주문 payload(JSON)에 상품 목록·금액·사용자 정보가 포함되며 환불 처리 시에도 참조됨
 * - cancelled_product_ids 컬럼으로 부분 환불된 상품을 추적
 *
 * 엔드포인트:
 * GET  /api/orders/  - 내 주문 목록 조회
 * POST /api/orders/  - 주문 생성 (결제 전 사전 등록)
 */
// 파일 역할: 주문 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import { Router } from "express";
import * as ordersController from "./orders.controller.js";

// 라우터 역할: 주문 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const ordersRoutes = Router();

ordersRoutes.get("/", ordersController.getOrders);
ordersRoutes.post("/", ordersController.createOrder);

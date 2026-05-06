/**
 * 환불(Refunds) 기능
 * - 사용자가 구매한 강의에 대해 환불 요청을 접수하는 기능
 * - 환불 흐름: 사용자 신청 → 관리자 검토 → 승인(PortOne 취소 API 호출) 또는 거절
 * - 승인 시 cancelled_product_ids에 해당 상품 기록, 학습 접근 권한 제거
 * - 관리자 페이지(/admin/refunds)에서 전체 환불 목록과 처리 상태 확인 가능
 *
 * 엔드포인트 (사용자):
 * POST /api/refunds/       - 환불 신청 (로그인)
 * GET  /api/refunds/me     - 내 환불 신청 목록
 *
 * 엔드포인트 (관리자):
 * GET  /api/refunds/admin                       - 전체 환불 신청 목록
 * POST /api/refunds/admin/:requestId/approve    - 환불 승인 (PortOne 취소 + DB 처리)
 * POST /api/refunds/admin/:requestId/reject     - 환불 거절
 */
// 파일 역할: 환불 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import express, { Router } from "express";
import * as refundsController from "./refunds.controller.js";

// 라우터 역할: 환불 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const refundsRoutes = Router();

// 사용자
refundsRoutes.post("/", express.json(), refundsController.requestRefund);
refundsRoutes.get("/me", refundsController.getMyRefundRequests);

// 관리자
refundsRoutes.get("/admin", refundsController.adminListRefundRequests);
refundsRoutes.post("/admin/:requestId/approve", express.json(), refundsController.adminApproveRefundRequest);
refundsRoutes.post("/admin/:requestId/reject", express.json(), refundsController.adminRejectRefundRequest);

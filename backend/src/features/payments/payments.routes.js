/**
 * 결제(Payments) 기능
 * - PortOne(포트원) V2 API와 연동해 결제 금액을 검증하고 주문을 확정
 * - 프론트에서 PortOne SDK로 결제 진행 → 성공 시 이 엔드포인트로 paymentId 전달
 * - 서버에서 PortOne API를 직접 호출해 금액 위변조 여부를 재검증한 뒤 강의 접근 권한 부여
 * - 결제 확정 후 장바구니 비움, 포인트 적립, 학습 진도 초기화 처리
 *
 * 엔드포인트:
 * POST /api/payments/confirm  - 결제 최종 확정 (PortOne 검증 포함)
 * POST /api/payments/webhook  - PortOne V2 결제 웹훅 수신
 */
// 파일 역할: 결제 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import { Router } from "express";
import * as paymentsController from "./payments.controller.js";
import { requireAuth } from "../../shared/middlewares/auth.js";
import { createRateLimiter } from "../../shared/middlewares/rate-limit.js";

// 라우터 역할: 결제 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const paymentsRoutes = Router();
const paymentConfirmRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => String(req.authUser?.id || req.ip || "unknown"),
});

paymentsRoutes.post("/confirm", requireAuth, paymentConfirmRateLimiter, paymentsController.confirm);
paymentsRoutes.post("/webhook", paymentsController.webhook);

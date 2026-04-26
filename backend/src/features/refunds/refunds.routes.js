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

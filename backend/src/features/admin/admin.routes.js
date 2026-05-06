/**
 * 관리자(Admin) 기능
 * - 대시보드: 전체 매출·환불 통계, 회원별 수강 현황, 강의별 수강 진도 집계
 * - 회원 관리: 회원 등급(member/staff/admin) 변경, 탈퇴 회원 복구
 * - 주문 환불: 관리자가 직접 주문 환불 처리 (PortOne 연동)
 * - 강의 선물: 특정 회원에게 강의 접근 권한 부여·취소 (video_grants)
 * - 페이지 오버라이드: 관리자 편집 모드에서 변경한 이미지·텍스트·위치·크기·클래스를
 *   DB에 저장해 새로고침 후에도 유지 (admin_page_overrides 테이블)
 * - 강의 등록: 새 강의 레코드 생성 (POST /lectures)
 *
 * 엔드포인트 (대시보드):
 * GET /api/admin/dashboard/users                   - 전체 회원 목록 + 구매 현황
 * GET /api/admin/dashboard/users/:userId/progress  - 특정 회원 수강 현황
 * GET /api/admin/dashboard/lectures/progress       - 강의별 수강 진도 집계
 * GET /api/admin/dashboard/sales                   - 기간별 매출 통계
 * GET /api/admin/dashboard/sales/refund-insights   - 매출/환불 인사이트
 *
 * 엔드포인트 (회원·주문 관리):
 * PATCH /api/admin/users/:userId/grade             - 회원 등급 변경
 * POST  /api/admin/users/:userId/restore           - 탈퇴 회원 복구
 * POST  /api/admin/orders/:orderId/refund          - 주문 환불 처리
 * POST  /api/admin/lectures                        - 강의 등록
 *
 * 엔드포인트 (영상 선물):
 * POST   /api/admin/users/:userId/video-grants         - 강의 선물 부여
 * GET    /api/admin/users/:userId/video-grants         - 선물 목록 조회
 * DELETE /api/admin/users/:userId/video-grants/:videoId - 선물 취소
 *
 * 엔드포인트 (페이지 오버라이드):
 * GET    /api/admin/page-overrides        - 전체 오버라이드 조회
 * POST   /api/admin/page-overrides        - 오버라이드 저장 (image/text/video/position/size/class)
 * DELETE /api/admin/page-overrides        - 특정 오버라이드 삭제
 * DELETE /api/admin/page-overrides/:type  - 타입별 전체 오버라이드 삭제
 */
// 파일 역할: 관리자 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import express, { Router } from "express";
import * as adminController from "./admin.controller.js";

// 라우터 역할: 관리자 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const adminRoutes = Router();

adminRoutes.get("/dashboard/users", adminController.getDashboardUsers);
adminRoutes.get("/dashboard/users/:userId/progress", adminController.getDashboardUserLearning);
adminRoutes.get("/dashboard/lectures/progress", adminController.getDashboardLectureProgress);
adminRoutes.get("/dashboard/sales", adminController.getDashboardSales);
adminRoutes.get("/dashboard/sales/refund-insights", adminController.getSalesRefundInsights);
adminRoutes.patch("/users/:userId/grade", adminController.updateUserGrade);
adminRoutes.post("/users/:userId/restore", adminController.restoreWithdrawnUser);
adminRoutes.post("/orders/:orderId/refund", express.json(), adminController.refundOrder);
adminRoutes.post("/lectures", adminController.createLecture);

adminRoutes.post("/users/:userId/video-grants", express.json(), adminController.giftVideos);
adminRoutes.get("/users/:userId/video-grants", adminController.listVideoGrants);
adminRoutes.delete("/users/:userId/video-grants/:videoId", adminController.revokeVideoGrant);

adminRoutes.get("/page-overrides", adminController.getPageOverrides);
adminRoutes.post("/page-overrides", express.json(), adminController.savePageOverride);
adminRoutes.delete("/page-overrides", express.json(), adminController.deletePageOverride);
adminRoutes.delete("/page-overrides/:type", adminController.deleteAllPageOverridesByType);

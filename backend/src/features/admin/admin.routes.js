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

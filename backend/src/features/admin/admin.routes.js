import express, { Router } from "express";
import * as adminController from "./admin.controller.js";

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

adminRoutes.get("/page-overrides", adminController.getPageOverrides);
adminRoutes.post("/page-overrides", express.json(), adminController.savePageOverride);
adminRoutes.delete("/page-overrides", express.json(), adminController.deletePageOverride);
adminRoutes.delete("/page-overrides/:type", adminController.deleteAllPageOverridesByType);

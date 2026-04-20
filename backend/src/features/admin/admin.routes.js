import { Router } from "express";
import * as adminController from "./admin.controller.js";

export const adminRoutes = Router();

adminRoutes.get("/dashboard/users", adminController.getDashboardUsers);
adminRoutes.get("/dashboard/users/:userId/progress", adminController.getDashboardUserLearning);
adminRoutes.get("/dashboard/lectures/progress", adminController.getDashboardLectureProgress);
adminRoutes.get("/dashboard/sales", adminController.getDashboardSales);
adminRoutes.patch("/users/:userId/grade", adminController.updateUserGrade);
adminRoutes.post("/lectures", adminController.createLecture);

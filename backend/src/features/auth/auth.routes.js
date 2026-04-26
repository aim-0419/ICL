// 파일 역할: 인증 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import { Router } from "express";
import * as authController from "./auth.controller.js";

// 라우터 역할: 인증 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const authRoutes = Router();

authRoutes.post("/signup", authController.signup);
authRoutes.post("/login", authController.login);
authRoutes.post("/logout", authController.logout);
authRoutes.get("/me", authController.me);
authRoutes.post("/find-id", authController.findLoginId);
authRoutes.post("/reset-password", authController.resetPassword);

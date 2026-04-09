import { Router } from "express";
import * as authController from "./auth.controller.js";

export const authRoutes = Router();

authRoutes.post("/signup", authController.signup);
authRoutes.post("/login", authController.login);
authRoutes.post("/logout", authController.logout);
authRoutes.get("/me", authController.me);
authRoutes.post("/find-id", authController.findLoginId);
authRoutes.post("/reset-password", authController.resetPassword);

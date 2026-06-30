// 파일 역할: 문자/알림톡 관련 API 주소를 controller 함수와 연결합니다.
import { Router } from "express";
import express from "express";
import * as smsController from "./sms.controller.js";
import { requireAdmin } from "../../shared/middlewares/auth.js";

export const smsRoutes = Router();

smsRoutes.use(requireAdmin);

smsRoutes.post("/send", express.json(), smsController.sendSms);
smsRoutes.post("/schedule", express.json(), smsController.scheduleMessage);
smsRoutes.get("/history", smsController.getSmsHistory);
smsRoutes.get("/auto-history", smsController.getAutoHistory);
smsRoutes.get("/config", smsController.getSmsConfig);

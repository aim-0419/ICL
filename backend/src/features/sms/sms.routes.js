import { Router } from "express";
import express from "express";
import * as smsController from "./sms.controller.js";

export const smsRoutes = Router();

smsRoutes.post("/send", express.json(), smsController.sendSms);
smsRoutes.get("/history", smsController.getSmsHistory);
smsRoutes.get("/auto-history", smsController.getAutoHistory);
smsRoutes.get("/config", smsController.getSmsConfig);

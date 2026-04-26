// 파일 역할: 결제 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import { Router } from "express";
import * as paymentsController from "./payments.controller.js";

// 라우터 역할: 결제 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const paymentsRoutes = Router();

paymentsRoutes.post("/confirm", paymentsController.confirm);

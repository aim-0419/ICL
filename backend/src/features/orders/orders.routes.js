// 파일 역할: 주문 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import { Router } from "express";
import * as ordersController from "./orders.controller.js";

// 라우터 역할: 주문 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const ordersRoutes = Router();

ordersRoutes.get("/", ordersController.getOrders);
ordersRoutes.post("/", ordersController.createOrder);

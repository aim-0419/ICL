// 파일 역할: 장바구니 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import { Router } from "express";
import * as cartController from "./cart.controller.js";

// 라우터 역할: 장바구니 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const cartRoutes = Router();

cartRoutes.get("/", cartController.getCart);
cartRoutes.post("/items", cartController.addItem);
cartRoutes.put("/items/:productId", cartController.updateItem);
cartRoutes.delete("/items/:productId", cartController.removeItem);

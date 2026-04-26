// 파일 역할: 상품 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import { Router } from "express";
import * as productsController from "./products.controller.js";

// 라우터 역할: 상품 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const productsRoutes = Router();

productsRoutes.get("/", productsController.getProducts);

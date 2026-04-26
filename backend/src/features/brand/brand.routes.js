// 파일 역할: 브랜드 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import express, { Router } from "express";
import * as brandController from "./brand.controller.js";

// 라우터 역할: 브랜드 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const brandRoutes = Router();

brandRoutes.get("/instructors", brandController.getInstructors);
brandRoutes.post("/instructors", express.json(), brandController.saveInstructor);
brandRoutes.put("/instructors/:id", express.json(), brandController.saveInstructor);
brandRoutes.delete("/instructors/:id", brandController.removeInstructor);

brandRoutes.get("/branches", brandController.getBranches);
brandRoutes.post("/branches", express.json(), brandController.saveBranch);
brandRoutes.put("/branches/:id", express.json(), brandController.saveBranch);
brandRoutes.delete("/branches/:id", brandController.removeBranch);

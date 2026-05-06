/**
 * 브랜드(Brand) 기능
 * - 이끌림 필라테스의 강사·지점 정보를 관리하는 기능
 * - 강사(Instructors): 프로필·커리어·이미지를 관리자가 등록·수정·삭제
 * - 지점(Branches): 지점명·주소·전화·주차·좌표·지도링크를 관리자가 등록·수정·삭제
 * - 조회는 비로그인 허용, 수정/삭제는 관리자 전용
 *
 * 엔드포인트 (강사):
 * GET    /api/brand/instructors        - 강사 목록 조회
 * POST   /api/brand/instructors        - 강사 등록 (관리자)
 * PUT    /api/brand/instructors/:id    - 강사 수정 (관리자)
 * DELETE /api/brand/instructors/:id    - 강사 삭제 (관리자)
 *
 * 엔드포인트 (지점):
 * GET    /api/brand/branches           - 지점 목록 조회
 * POST   /api/brand/branches           - 지점 등록 (관리자)
 * PUT    /api/brand/branches/:id       - 지점 수정 (관리자)
 * DELETE /api/brand/branches/:id       - 지점 삭제 (관리자)
 */
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

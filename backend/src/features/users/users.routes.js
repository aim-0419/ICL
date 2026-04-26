// 파일 역할: 회원 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import express, { Router } from "express";
import * as usersController from "./users.controller.js";

// 라우터 역할: 회원 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const usersRoutes = Router();

usersRoutes.get("/", usersController.getUsers);
usersRoutes.patch("/me", usersController.updateMe);
usersRoutes.post("/me/email-verification/request", usersController.requestEmailVerification);
usersRoutes.post("/me/email-verification/confirm", usersController.confirmEmailVerification);
usersRoutes.post(
  "/me/withdraw/phone-verification/request",
  express.json(),
  usersController.requestWithdrawPhoneVerification
);
usersRoutes.post(
  "/me/withdraw/phone-verification/confirm",
  express.json(),
  usersController.confirmWithdrawPhoneVerification
);
usersRoutes.post("/me/withdraw", express.json(), usersController.withdrawMe);
usersRoutes.get("/me/points", usersController.getMyPoints);
usersRoutes.post("/me/points/use", express.json(), usersController.usePoints);
usersRoutes.post("/me/points/earn", express.json(), usersController.earnPoints);
usersRoutes.get("/me/video-grants", usersController.getMyVideoGrants);

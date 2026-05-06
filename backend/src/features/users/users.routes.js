/**
 * 회원(Users) 기능
 * - 로그인한 사용자가 자신의 프로필(이름·이메일·전화번호·출생연도)을 수정
 * - 이메일 변경은 인증 코드 발송 → 확인 2단계로 처리
 * - 탈퇴: 전화번호 인증 후 탈퇴 처리, 계정은 30일 후 자동 파기
 * - 포인트: 적립/사용/잔액 조회 (주문·이벤트 연동)
 * - 영상 선물: 관리자가 선물한 강의 접근 권한 목록 조회
 * - 관리자 전용: 전체 회원 목록 조회 (GET /)
 *
 * 엔드포인트:
 * GET    /api/users/                                      - 전체 회원 목록 (관리자)
 * PATCH  /api/users/me                                    - 내 프로필 수정
 * POST   /api/users/me/email-verification/request        - 이메일 변경 인증 코드 발송
 * POST   /api/users/me/email-verification/confirm        - 이메일 변경 인증 코드 확인
 * POST   /api/users/me/withdraw/phone-verification/request - 탈퇴 전화 인증 코드 발송
 * POST   /api/users/me/withdraw/phone-verification/confirm - 탈퇴 전화 인증 코드 확인
 * POST   /api/users/me/withdraw                          - 회원 탈퇴
 * GET    /api/users/me/points                            - 포인트 잔액 조회
 * POST   /api/users/me/points/use                        - 포인트 사용
 * POST   /api/users/me/points/earn                       - 포인트 적립
 * GET    /api/users/me/video-grants                      - 선물 받은 강의 목록
 * PATCH  /api/users/me/marketing-agree                  - 마케팅 수신 동의 변경
 */
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
usersRoutes.patch("/me/marketing-agree", express.json(), usersController.updateMyMarketingAgree);

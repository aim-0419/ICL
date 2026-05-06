/**
 * 인증(Auth) 기능
 * - 회원가입: 이메일 인증 코드 발송 → 코드 확인 → 계정 생성 순으로 진행
 * - 로그인: 아이디/비밀번호 검증 후 세션 쿠키 발급 (IP당 5회 실패 시 15분 차단)
 * - 세션: 서버 sessions 테이블에 저장, GET /me로 현재 사용자 반환
 * - 계정 찾기: 이름+전화번호로 아이디 조회, 아이디+이메일로 비밀번호 재설정
 *
 * 엔드포인트:
 * POST /api/auth/signup                              - 회원가입 (이메일 인증 완료 후 호출)
 * POST /api/auth/signup/email-verification/request  - 가입용 이메일 인증 코드 발송
 * POST /api/auth/signup/email-verification/confirm  - 가입용 이메일 인증 코드 확인
 * POST /api/auth/login                              - 로그인 → 세션 쿠키 발급
 * POST /api/auth/logout                             - 로그아웃 → 세션 삭제
 * GET  /api/auth/me                                 - 현재 로그인 사용자 정보 반환
 * POST /api/auth/find-id                            - 이름+전화번호로 아이디 찾기
 * POST /api/auth/reset-password                     - 아이디+이메일로 임시 비밀번호 발급
 */
// 파일 역할: 인증 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import { Router } from "express";
import * as authController from "./auth.controller.js";

// 라우터 역할: 인증 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const authRoutes = Router();

authRoutes.post("/signup", authController.signup);
authRoutes.post("/signup/email-verification/request", authController.requestSignupEmailVerification);
authRoutes.post("/signup/email-verification/confirm", authController.confirmSignupEmailVerification);
authRoutes.post("/login", authController.login);
authRoutes.post("/logout", authController.logout);
authRoutes.get("/me", authController.me);
authRoutes.post("/find-id", authController.findLoginId);
authRoutes.post("/reset-password", authController.resetPassword);

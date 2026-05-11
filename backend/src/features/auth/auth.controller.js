// 파일 역할: 인증 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as authService from "./auth.service.js";
import { SESSION_COOKIE_NAME } from "../../shared/constants.js";

const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (record && now < record.resetAt && record.count >= MAX_LOGIN_ATTEMPTS) {
    const waitSec = Math.ceil((record.resetAt - now) / 1000);
    const error = new Error(`로그인 시도 횟수를 초과했습니다. ${waitSec}초 후 다시 시도해 주세요.`);
    error.status = 429;
    throw error;
  }
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now >= record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_BLOCK_MS });
  } else {
    record.count += 1;
  }
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

// 함수 역할: 쿠키 값 데이터를 조회해 호출자에게 반환합니다.
function getCookieValue(req, name) {
  const cookieHeader = String(req.headers.cookie || "");
  if (!cookieHeader) return "";

  const cookieItem = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!cookieItem) return "";
  return decodeURIComponent(cookieItem.slice(name.length + 1));
}

// 함수 역할: setSessionCookie 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(SESSION_COOKIE_NAME, encodeURIComponent(token), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 14,
  });
}

// 함수 역할: clearSessionCookie 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production";
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });
}

// 함수 역할: signup에 서명해 변조 여부를 확인할 수 있게 합니다.
export async function signup(req, res, next) {
  try {
    const result = await authService.signup(req.body);
    setSessionCookie(res, result.token);
    res.status(201).json({ user: result.user });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: login 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function login(req, res, next) {
  const ip = getClientIp(req);
  try {
    checkLoginRateLimit(ip);
    const result = await authService.login(req.body);
    clearLoginAttempts(ip);
    setSessionCookie(res, result.token);
    res.json({ user: result.user });
  } catch (error) {
    if (error.status !== 429) recordLoginFailure(ip);
    next(error);
  }
}

// 함수 역할: logout 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function logout(req, res, next) {
  try {
    const token = getCookieValue(req, SESSION_COOKIE_NAME);
    if (token) {
      await authService.deleteSession(token);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: me 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function me(req, res, next) {
  try {
    const token = getCookieValue(req, SESSION_COOKIE_NAME);
    if (!token) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const user = await authService.findUserBySessionToken(token);
    if (!user) {
      clearSessionCookie(res);
      res.status(401).json({ message: "세션이 만료되었습니다." });
      return;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 회원가입 이메일 인증번호를 발송합니다.
export async function requestSignupEmailVerification(req, res, next) {
  try {
    const result = await authService.requestSignupEmailVerification(req.body?.email);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 회원가입 이메일 인증번호를 확인합니다.
export async function confirmSignupEmailVerification(req, res, next) {
  try {
    const result = await authService.confirmSignupEmailVerification(req.body?.email, req.body?.code);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 로그인 ID 대상을 탐색해 반환합니다.
export async function findLoginId(req, res, next) {
  try {
    const loginId = await authService.findLoginId(req.body);
    res.json({ loginId });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: resetPassword 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function resetPassword(req, res, next) {
  try {
    const result = await authService.resetPassword(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

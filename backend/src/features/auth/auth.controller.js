// 파일 역할: 인증 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as authService from "./auth.service.js";
import { query, queryOne } from "../../shared/db/mysql.js";
import { SESSION_COOKIE_NAME } from "../../shared/constants.js";
import { resolveSessionToken } from "../../shared/middlewares/auth.js";

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_MINUTES = 15;
const MAX_SIGNUP_ATTEMPTS_PER_HOUR = 3;

async function checkLoginRateLimit(ip) {
  const row = await queryOne(
    `SELECT fail_count, blocked_until FROM login_rate_limits WHERE ip = ? LIMIT 1`,
    [ip]
  );
  if (!row?.blocked_until) return;
  const now = new Date();
  const blockedUntil = new Date(row.blocked_until);
  if (blockedUntil > now && row.fail_count >= MAX_LOGIN_ATTEMPTS) {
    const waitSec = Math.ceil((blockedUntil - now) / 1000);
    const error = new Error(`로그인 시도 횟수를 초과했습니다. ${waitSec}초 후에 시도해 주세요.`);
    error.status = 429;
    throw error;
  }
}

async function recordLoginFailure(ip) {
  const now = new Date();
  const row = await queryOne(
    `SELECT fail_count, blocked_until FROM login_rate_limits WHERE ip = ? LIMIT 1`,
    [ip]
  );
  const isExpiredOrNew = !row || !row.blocked_until || new Date(row.blocked_until) <= now;
  const newCount = isExpiredOrNew ? 1 : (row.fail_count || 0) + 1;
  const shouldBlock = newCount >= MAX_LOGIN_ATTEMPTS;
  const blockedUntil = shouldBlock ? new Date(now.getTime() + LOGIN_BLOCK_MINUTES * 60 * 1000) : null;

  await query(
    `INSERT INTO login_rate_limits (ip, fail_count, blocked_until, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       fail_count = VALUES(fail_count),
       blocked_until = VALUES(blocked_until),
       updated_at = NOW()`,
    [ip, newCount, blockedUntil]
  );
}

async function clearLoginAttempts(ip) {
  await query(`DELETE FROM login_rate_limits WHERE ip = ?`, [ip]);
}

async function checkSignupRateLimit(ip) {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const row = await queryOne(
    `SELECT attempt_count, window_start FROM signup_rate_limits WHERE ip = ? LIMIT 1`,
    [ip]
  );
  if (!row) return;
  if (new Date(row.window_start) > hourAgo && row.attempt_count >= MAX_SIGNUP_ATTEMPTS_PER_HOUR) {
    const error = new Error("같은 IP에서 너무 많은 회원가입 시도가 있었습니다. 잠시 후에 시도해 주세요.");
    error.status = 429;
    throw error;
  }
}

async function recordSignupAttempt(ip) {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await query(
    `INSERT INTO signup_rate_limits (ip, attempt_count, window_start, updated_at)
     VALUES (?, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       attempt_count = IF(window_start <= ?, 1, attempt_count + 1),
       window_start = IF(window_start <= ?, NOW(), window_start),
       updated_at = NOW()`,
    [ip, hourAgo, hourAgo]
  );
}

// 함수 역할: 로그인 성공 후 세션 쿠키를 브라우저에 저장합니다.
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

// 함수 역할: 로그아웃 또는 세션 만료 시 세션 쿠키를 제거합니다.
function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production";
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });
}

// 함수 역할: 회원가입 요청을 처리하고 가입 직후 로그인 세션을 생성합니다.
export async function signup(req, res, next) {
  const ip = req.ip || "unknown";
  try {
    await checkSignupRateLimit(ip);
    const result = await authService.signup(req.body);
    await recordSignupAttempt(ip).catch(() => {});
    setSessionCookie(res, result.token);
    res.status(201).json({ user: result.user });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 로그인 요청을 처리하고 세션 쿠키를 발급합니다.
export async function login(req, res, next) {
  const ip = req.ip || "unknown";
  try {
    await checkLoginRateLimit(ip);
    const result = await authService.login(req.body);
    await clearLoginAttempts(ip);
    setSessionCookie(res, result.token);
    res.json({ user: result.user });
  } catch (error) {
    if (error.status !== 429) await recordLoginFailure(ip).catch(() => {});
    next(error);
  }
}

// 함수 역할: 현재 세션을 삭제하고 로그아웃 상태로 전환합니다.
export async function logout(req, res, next) {
  try {
    const token = resolveSessionToken(req);
    if (token) {
      await authService.deleteSession(token);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 현재 세션 쿠키로 로그인 사용자 정보를 조회합니다.
export async function me(req, res, next) {
  try {
    const token = resolveSessionToken(req);
    if (!token) {
      res.json({ user: null });
      return;
    }

    const user = await authService.findUserBySessionToken(token);
    if (!user) {
      clearSessionCookie(res);
      res.json({ user: null });
      return;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 회원가입용 이메일 인증번호 발송을 요청합니다.
export async function requestSignupEmailVerification(req, res, next) {
  try {
    const result = await authService.requestSignupEmailVerification(req.body?.email);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 회원가입용 이메일 인증번호를 확인합니다.
export async function confirmSignupEmailVerification(req, res, next) {
  try {
    const result = await authService.confirmSignupEmailVerification(req.body?.email, req.body?.code);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 이름과 연락처로 로그인 ID를 찾습니다.
export async function findLoginId(req, res, next) {
  try {
    const loginId = await authService.findLoginId(req.body);
    res.json({ loginId });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 비밀번호 재설정용 이메일 인증번호 발송을 요청합니다.
export async function requestPasswordResetEmailVerification(req, res, next) {
  try {
    const result = await authService.requestPasswordResetVerification(
      req.body?.loginId,
      req.body?.email
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 인증된 사용자 요청으로 비밀번호를 재설정합니다.
export async function resetPassword(req, res, next) {
  try {
    const result = await authService.resetPassword(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

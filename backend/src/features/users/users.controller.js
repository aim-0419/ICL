import * as authService from "../auth/auth.service.js";
import * as usersService from "./users.service.js";

const SESSION_COOKIE_NAME = "icl_session";

// 요청 쿠키에서 특정 값 추출 유틸리티
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

// 로그아웃/탈퇴 시 세션 쿠키 제거 처리
function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production";
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });
}

// 인증 사용자 강제 조회 및 실패 응답 처리
async function getRequiredAuthUser(req, res) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) {
    res.status(401).json({ message: "로그인이 필요합니다." });
    return null;
  }

  const authUser = await authService.findUserBySessionToken(token);
  if (!authUser?.id) {
    clearSessionCookie(res);
    res.status(401).json({ message: "세션이 만료되었습니다." });
    return null;
  }

  return authUser;
}

export async function getUsers(req, res, next) {
  try {
    res.json(await usersService.listUsers());
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req, res, next) {
  try {
    const authUser = await getRequiredAuthUser(req, res);
    if (!authUser) return;

    const updatedUser = await usersService.updateMyProfile(authUser.id, req.body || {});
    res.json({ user: updatedUser });
  } catch (error) {
    next(error);
  }
}

export async function requestEmailVerification(req, res, next) {
  try {
    const authUser = await getRequiredAuthUser(req, res);
    if (!authUser) return;

    const result = await usersService.requestEmailVerificationCode(authUser.id, req.body?.email);
    res.json({
      message: "인증번호를 발송했습니다. (개발환경에서는 응답에 debugCode가 포함됩니다.)",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmEmailVerification(req, res, next) {
  try {
    const authUser = await getRequiredAuthUser(req, res);
    if (!authUser) return;

    const result = await usersService.confirmEmailVerificationCode(
      authUser.id,
      req.body?.email,
      req.body?.code
    );
    res.json({
      message: "이메일 인증이 완료되었습니다.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

// 탈퇴용 휴대폰 인증번호 발송 API 핸들러
export async function requestWithdrawPhoneVerification(req, res, next) {
  try {
    const authUser = await getRequiredAuthUser(req, res);
    if (!authUser) return;

    const result = await usersService.requestWithdrawPhoneVerificationCode(authUser.id, req.body?.phone);
    res.json({
      message: "휴대폰 인증번호를 발송했습니다. (개발환경에서는 응답에 debugCode가 포함됩니다.)",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

// 탈퇴용 휴대폰 인증번호 확인 API 핸들러
export async function confirmWithdrawPhoneVerification(req, res, next) {
  try {
    const authUser = await getRequiredAuthUser(req, res);
    if (!authUser) return;

    const result = await usersService.confirmWithdrawPhoneVerificationCode(
      authUser.id,
      req.body?.phone,
      req.body?.code
    );
    res.json({
      message: "휴대폰 인증이 완료되었습니다.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

// 회원 탈퇴 처리 API 핸들러
export async function withdrawMe(req, res, next) {
  try {
    const authUser = await getRequiredAuthUser(req, res);
    if (!authUser) return;

    const result = await usersService.withdrawMyAccount(authUser.id, req.body || {});
    clearSessionCookie(res);
    res.json({
      message: `회원 탈퇴가 완료되었습니다. 탈퇴 데이터는 ${result.retentionDays || 90}일 동안 보관 후 폐기됩니다.`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyPoints(req, res, next) {
  try {
    const authUser = await getRequiredAuthUser(req, res);
    if (!authUser) return;
    const points = await usersService.getUserPoints(authUser.id);
    const history = await usersService.getPointHistory(authUser.id);
    res.json({ points, history });
  } catch (error) {
    next(error);
  }
}

export async function usePoints(req, res, next) {
  try {
    const authUser = await getRequiredAuthUser(req, res);
    if (!authUser) return;

    const { amount, reason, orderId } = req.body || {};
    const safeAmount = -Math.abs(Number(amount) || 0);
    if (safeAmount === 0) {
      return res.status(400).json({ message: "사용할 포인트를 입력해 주세요." });
    }

    const current = await usersService.getUserPoints(authUser.id);
    if (current < Math.abs(safeAmount)) {
      return res.status(400).json({ message: "포인트가 부족합니다." });
    }

    const result = await usersService.adjustPoints(
      authUser.id,
      safeAmount,
      reason || "포인트 사용",
      orderId
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function earnPoints(req, res, next) {
  try {
    const authUser = await getRequiredAuthUser(req, res);
    if (!authUser) return;

    const { amount, reason, orderId } = req.body || {};
    const safeAmount = Math.abs(Number(amount) || 0);
    if (safeAmount === 0) {
      return res.status(400).json({ message: "적립할 포인트를 입력해 주세요." });
    }

    const result = await usersService.adjustPoints(
      authUser.id,
      safeAmount,
      reason || "포인트 적립",
      orderId
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

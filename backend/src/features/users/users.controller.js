import * as authService from "../auth/auth.service.js";
import * as usersService from "./users.service.js";

const SESSION_COOKIE_NAME = "icl_session";

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

export async function getUsers(req, res, next) {
  try {
    res.json(await usersService.listUsers());
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req, res, next) {
  try {
    const token = getCookieValue(req, SESSION_COOKIE_NAME);
    if (!token) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const authUser = await authService.findUserBySessionToken(token);
    if (!authUser?.id) {
      res.status(401).json({ message: "세션이 만료되었습니다." });
      return;
    }

    const updatedUser = await usersService.updateMyProfile(authUser.id, req.body || {});
    res.json({ user: updatedUser });
  } catch (error) {
    next(error);
  }
}

export async function requestEmailVerification(req, res, next) {
  try {
    const token = getCookieValue(req, SESSION_COOKIE_NAME);
    if (!token) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const authUser = await authService.findUserBySessionToken(token);
    if (!authUser?.id) {
      res.status(401).json({ message: "세션이 만료되었습니다." });
      return;
    }

    const result = await usersService.requestEmailVerificationCode(authUser.id, req.body?.email);
    res.json({
      message: "인증번호를 발송했습니다. (현재 개발 단계에서는 서버 로그에서 확인할 수 있습니다.)",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmEmailVerification(req, res, next) {
  try {
    const token = getCookieValue(req, SESSION_COOKIE_NAME);
    if (!token) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const authUser = await authService.findUserBySessionToken(token);
    if (!authUser?.id) {
      res.status(401).json({ message: "세션이 만료되었습니다." });
      return;
    }

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

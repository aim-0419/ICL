import * as authService from "../../features/auth/auth.service.js";
import { SESSION_COOKIE_NAME } from "../constants.js";

export function resolveSessionToken(req) {
  const header = String(req.headers.cookie || "");
  if (!header) return "";

  const item = header
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE_NAME}=`));

  return item ? decodeURIComponent(item.slice(SESSION_COOKIE_NAME.length + 1)) : "";
}

export async function resolveSessionUser(req) {
  const token = resolveSessionToken(req);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

export function isAdminUser(user) {
  if (!user) return false;

  const grade = String(user.userGrade || "").trim().toLowerCase();
  if (grade === "admin0" || grade === "admin1") return true;

  const role = String(user.role || "").trim().toLowerCase();
  return role === "admin" || user.isAdmin === true || user.isAdmin === 1;
}

export function isStudioStaffUser(user) {
  if (!user) return false;

  const role = String(user.studioRole || "").trim().toLowerCase();
  const status = String(user.studioStaffStatus || "active").trim().toLowerCase();
  return status === "active" && ["owner", "manager", "staff", "instructor", "teacher"].includes(role);
}

export async function requireAuth(req, res, next) {
  try {
    const user = await resolveSessionUser(req);
    if (!user?.id) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }

    req.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAdmin(req, res, next) {
  try {
    const user = await resolveSessionUser(req);
    if (!user?.id) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }

    if (!isAdminUser(user)) {
      return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    }

    req.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAdminOrStudioStaff(req, res, next) {
  try {
    const user = await resolveSessionUser(req);
    if (!user?.id) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }

    if (!isAdminUser(user) && !isStudioStaffUser(user)) {
      return res.status(403).json({ message: "관리자 또는 스튜디오 스태프 권한이 필요합니다." });
    }

    req.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

// 테스트 코드에서 인증 조회 함수를 주입해 동일한 권한 규칙을 검증할 수 있게 합니다.
export function createAuthMiddlewares(findUser) {
  async function auth(req, res, next) {
    try {
      const token = resolveSessionToken(req);
      const user = token ? await findUser(token) : null;
      if (!user?.id) {
        return res.status(401).json({ message: "로그인이 필요합니다." });
      }

      req.authUser = user;
      next();
    } catch (error) {
      next(error);
    }
  }

  async function admin(req, res, next) {
    try {
      const token = resolveSessionToken(req);
      const user = token ? await findUser(token) : null;
      if (!user?.id) {
        return res.status(401).json({ message: "로그인이 필요합니다." });
      }

      if (!isAdminUser(user)) {
        return res.status(403).json({ message: "관리자 권한이 필요합니다." });
      }

      req.authUser = user;
      next();
    } catch (error) {
      next(error);
    }
  }

  return { requireAuth: auth, requireAdmin: admin };
}

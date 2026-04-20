import * as authService from "../auth/auth.service.js";
import * as adminService from "./admin.service.js";

const SESSION_COOKIE_NAME = "icl_session";
const DASHBOARD_RANGE_DAYS = {
  all: 0,
  today: 1,
  "7d": 7,
  "30d": 30,
};
const SALES_PERIODS = new Set(["day", "week", "month", "year"]);

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

function resolveUserGrade(user) {
  const grade = String(user?.userGrade || "")
    .trim()
    .toLowerCase();
  if (grade === "admin0" || grade === "admin1" || grade === "member" || grade === "vip" || grade === "vvip") {
    return grade;
  }

  const normalizedRole = String(user?.role || "")
    .trim()
    .toLowerCase();
  const adminFlag = user?.isAdmin === true || user?.isAdmin === 1 || user?.isAdmin === "1";
  if (adminFlag || normalizedRole === "admin") return "admin0";
  if (normalizedRole === "admin1") return "admin1";
  if (normalizedRole === "vip") return "vip";
  if (normalizedRole === "vvip") return "vvip";
  return "member";
}

function canAccessAdminDashboard(user) {
  const grade = resolveUserGrade(user);
  return grade === "admin0" || grade === "admin1";
}

function canManageUserGrades(user) {
  return resolveUserGrade(user) === "admin0";
}

function canCreateLecture(user) {
  const grade = resolveUserGrade(user);
  return grade === "admin0" || grade === "admin1";
}

async function getAuthenticatedUser(req) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

async function requireAdminDashboardAccess(req, res) {
  const authUser = await getAuthenticatedUser(req);

  if (!authUser?.id) {
    res.status(401).json({ message: "로그인이 필요합니다." });
    return null;
  }

  if (!canAccessAdminDashboard(authUser)) {
    res.status(403).json({ message: "관리자만 접근할 수 있습니다." });
    return null;
  }

  return authUser;
}

function resolveDashboardRange(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (Object.prototype.hasOwnProperty.call(DASHBOARD_RANGE_DAYS, normalized)) {
    return normalized;
  }
  return "all";
}

function resolveSalesPeriod(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return SALES_PERIODS.has(normalized) ? normalized : "month";
}

function resolveIsoDateQuery(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  return normalized;
}

export async function getDashboardUsers(req, res, next) {
  try {
    const authUser = await requireAdminDashboardAccess(req, res);
    if (!authUser) return;

    const users = await adminService.listDashboardUsers();
    res.json({
      userGrades: adminService.listUserGrades(),
      users,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDashboardUserLearning(req, res, next) {
  try {
    const authUser = await requireAdminDashboardAccess(req, res);
    if (!authUser) return;

    const userId = String(req.params.userId || "").trim();
    if (!userId) {
      res.status(400).json({ message: "회원 정보가 올바르지 않습니다." });
      return;
    }

    const range = resolveDashboardRange(req.query.range);
    const result = await adminService.getUserLearningProgress(userId, range);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getDashboardLectureProgress(req, res, next) {
  try {
    const authUser = await requireAdminDashboardAccess(req, res);
    if (!authUser) return;

    const range = resolveDashboardRange(req.query.range);
    const lectures = await adminService.listLectureLearningReports(range);
    res.json({ lectures, range });
  } catch (error) {
    next(error);
  }
}

export async function getDashboardSales(req, res, next) {
  try {
    const authUser = await requireAdminDashboardAccess(req, res);
    if (!authUser) return;

    const period = resolveSalesPeriod(req.query.period);
    const startDate = resolveIsoDateQuery(req.query.startDate);
    const endDate = resolveIsoDateQuery(req.query.endDate);
    const result = await adminService.getSalesDashboard({
      period,
      startDate,
      endDate,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateUserGrade(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!canManageUserGrades(authUser)) {
      res.status(403).json({ message: "관리자0 권한이 필요합니다." });
      return;
    }

    const targetUserId = String(req.params.userId || "").trim();
    const nextGrade = String(req.body?.userGrade || "")
      .trim()
      .toLowerCase();

    if (!targetUserId) {
      res.status(400).json({ message: "변경할 회원 ID가 필요합니다." });
      return;
    }

    if (!adminService.isValidUserGrade(nextGrade)) {
      res.status(400).json({ message: "변경할 회원 등급 값이 올바르지 않습니다." });
      return;
    }

    if (authUser.id === targetUserId && nextGrade !== "admin0") {
      res.status(400).json({ message: "현재 로그인한 관리자0 계정은 관리자0 등급을 유지해야 합니다." });
      return;
    }

    const updatedUser = await adminService.updateUserGrade(targetUserId, nextGrade);
    res.json({ user: updatedUser });
  } catch (error) {
    next(error);
  }
}

export async function createLecture(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!canCreateLecture(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const created = await adminService.createLecture(req.body || {});
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

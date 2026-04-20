import * as authService from "../auth/auth.service.js";
import * as ordersService from "./orders.service.js";

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

function resolveUserGrade(user) {
  const grade = String(user?.userGrade || "")
    .trim()
    .toLowerCase();
  if (grade === "admin0" || grade === "admin1") return grade;

  const role = String(user?.role || "")
    .trim()
    .toLowerCase();
  const adminFlag = user?.isAdmin === true || user?.isAdmin === 1 || user?.isAdmin === "1";
  if (adminFlag || role === "admin") return "admin0";
  if (role === "admin1") return "admin1";
  return "member";
}

function canAccessAllOrders(user) {
  const grade = resolveUserGrade(user);
  return grade === "admin0" || grade === "admin1";
}

async function getAuthenticatedUser(req) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

export async function getOrders(req, res, next) {
  try {
    const customerEmail = String(req.query.email || "").trim();
    const authUser = await getAuthenticatedUser(req);

    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (customerEmail) {
      const normalizedRequestedEmail = customerEmail.toLowerCase();
      const normalizedUserEmail = String(authUser.email || "")
        .trim()
        .toLowerCase();

      if (!canAccessAllOrders(authUser) && normalizedRequestedEmail !== normalizedUserEmail) {
        res.status(403).json({ message: "본인 주문 내역만 조회할 수 있습니다." });
        return;
      }

      res.json(await ordersService.listOrdersByCustomerEmail(customerEmail));
      return;
    }

    if (!canAccessAllOrders(authUser)) {
      res.json(await ordersService.listOrdersByCustomerEmail(authUser.email || ""));
      return;
    }

    res.json(await ordersService.listOrders());
  } catch (error) {
    next(error);
  }
}

export async function createOrder(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    res.status(201).json(await ordersService.createOrder(req.body, authUser));
  } catch (error) {
    next(error);
  }
}

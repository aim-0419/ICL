// 파일 역할: 주문 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as authService from "../auth/auth.service.js";
import * as ordersService from "./orders.service.js";
import { sendPurchaseConfirmation } from "../../shared/email/email.service.js";

const SESSION_COOKIE_NAME = "icl_session";

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

// 함수 역할: 회원 등급 상황에 맞는 값을 계산하거나 선택합니다.
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

// 함수 역할: access all 주문 권한이 있는지 참/거짓으로 판별합니다.
function canAccessAllOrders(user) {
  const grade = resolveUserGrade(user);
  return grade === "admin0" || grade === "admin1";
}

// 함수 역할: 인증된 회원 데이터를 조회해 호출자에게 반환합니다.
async function getAuthenticatedUser(req) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

// 함수 역할: 주문 데이터를 조회해 호출자에게 반환합니다.
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

// 함수 역할: 주문 데이터를 새로 생성합니다.
export async function createOrder(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const order = await ordersService.createOrder(req.body, authUser);
    res.status(201).json(order);
    void sendPurchaseConfirmation(order);
  } catch (error) {
    next(error);
  }
}

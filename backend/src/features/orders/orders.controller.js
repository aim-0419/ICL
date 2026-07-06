// 파일 역할: 주문 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as ordersService from "./orders.service.js";
import { sendPurchaseConfirmation } from "../../shared/email/email.service.js";
import { resolveSessionUser, isAdminUser } from "../../shared/middlewares/auth.js";

const getAuthenticatedUser = resolveSessionUser;
const canAccessAllOrders = isAdminUser;

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
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const order = await ordersService.createOrder(req.body, authUser);
    res.status(201).json(order);
    void sendPurchaseConfirmation(order);
  } catch (error) {
    next(error);
  }
}

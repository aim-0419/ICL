// 파일 역할: 결제 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as paymentsService from "./payments.service.js";
import { resolveSessionUser } from "../../shared/middlewares/auth.js";

// 함수 역할: 결제 최종 확정을 검증하고 승인 결과를 반환합니다.
export async function confirm(req, res, next) {
  try {
    const authUser = req.authUser || await resolveSessionUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    const result = await paymentsService.confirmPayment(req.body, authUser);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: PortOne V2 웹훅을 수신하고 결제 상태를 동기화합니다.
export async function webhook(req, res, next) {
  try {
    const result = await paymentsService.handlePortoneWebhook({
      rawBody: req.body,
      headers: req.headers,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// 파일 역할: 결제 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as paymentsService from "./payments.service.js";

// 함수 역할: confirm 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function confirm(req, res, next) {
  try {
    const result = await paymentsService.confirmPayment(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

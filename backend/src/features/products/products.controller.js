// 파일 역할: 상품 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as productsService from "./products.service.js";

// 함수 역할: 상품 데이터를 조회해 호출자에게 반환합니다.
export async function getProducts(req, res, next) {
  try {
    res.json(await productsService.listProducts());
  } catch (error) {
    next(error);
  }
}

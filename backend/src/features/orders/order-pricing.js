// 파일 역할: 주문 결제 금액을 서버에서 권위 있게 재계산하는 순수 함수 모음입니다.
//
// 배경: 결제 금액을 클라이언트가 정하는 취약점이 있었다. products.price 가 결제 흐름 어디에서도
// 조회되지 않아, 125만원 상품을 100원으로 조작해 결제·구매할 수 있었다.
// 이 모듈은 상품 가격과 보유 포인트로 "정당한 결제액"을 서버가 직접 계산해, 실제 결제액과 대조한다.
//
// DB 접근은 orders.service.js 가 담당하고, 여기에는 계산 규칙만 둔다(테스트 용이).

// 함수 역할: 상품별 단가와 수량으로 정가 합계를 구한다.
//
// priceOf(productId) 는 원 단위 정수 또는 null(가격 못 찾음)을 돌려주는 함수다.
// 하나라도 가격을 못 찾으면 unresolved 에 담아, 호출측이 그 주문을 거부하도록 한다.
// 가격을 모르면 정당한 결제액을 계산할 수 없고, 그 상태로 통과시키면 위조 상품ID 우회가 열린다.
export function sumListPrice(quantities, priceOf) {
  let listTotal = 0;
  const unresolved = [];

  for (const [productId, rawQty] of quantities.entries()) {
    const qty = Math.max(1, Math.round(Number(rawQty) || 1));
    const price = priceOf(productId);
    if (price == null || !Number.isFinite(Number(price))) {
      unresolved.push(productId);
      continue;
    }
    listTotal += Math.round(Number(price)) * qty;
  }

  return { listTotal, unresolved };
}

// 함수 역할: 포인트 할인을 실제 보유 잔액 안으로 제한한다.
//
// 결제 흐름은 포인트를 실제로 차감하지 않고 payload.discountPoint 로 결제액만 줄인다.
// 검증이 없으면 잔액이 0인 사용자가 discountPoint 를 크게 넣어 결제액을 낮출 수 있다.
// 보유 잔액을 상한으로 두어 유령 할인을 막는다.
export function clampDiscount(requestedDiscount, pointBalance) {
  const requested = Math.max(0, Math.round(Number(requestedDiscount) || 0));
  const balance = Math.max(0, Math.round(Number(pointBalance) || 0));
  return Math.min(requested, balance);
}

// 함수 역할: 정당한 결제액과 검증 결과를 계산한다.
//
// expectedAmount = max(0, 정가합 − 허용 할인)
// ok 는 실제 결제액(paidAmount)이 expectedAmount 와 같고, 가격 미해소 상품이 없을 때만 참이다.
export function computeServerOrderTotal({ quantities, priceOf, discountPoint = 0, pointBalance = 0, paidAmount }) {
  const { listTotal, unresolved } = sumListPrice(quantities, priceOf);
  const allowedDiscount = clampDiscount(discountPoint, pointBalance);
  const expectedAmount = Math.max(0, listTotal - allowedDiscount);
  const paid = Math.round(Number(paidAmount) || 0);

  return {
    listTotal,
    allowedDiscount,
    expectedAmount,
    unresolved,
    ok: unresolved.length === 0 && expectedAmount === paid,
  };
}

# 결제 금액 검증 hotfix — 2026-08-19 (프롬프트 H2)

브랜치 `hotfix/payment-amount-validation` (main `d942ddd` 기준 분기). push·main 병합 안 함.
Play 대응(fix/play-store-compliance) 변경은 섞지 않았다.

## 취약점 (프롬프트 C 확인)

결제 금액을 클라이언트가 정한다. `products.price` 가 결제 흐름 어디에서도 조회되지 않았다.
125만원 상품을 담고 요청 amount 를 100원으로 변조 → PortOne 100원 결제 →
`confirmPayment` 의 `paidAmount === requestedAmount` 통과(둘 다 클라 유래) → 100원 주문 생성 + 상품 접근권 부여.

## 결제 흐름 (수정 위치 판단 근거)

1. `CartPage` 가 `orderPayload`(selectedProductIds, amount, discountPoint) 구성
2. `requestExternalPayment` → PortOne SDK 결제 → `POST /api/payments/confirm` **{paymentId, orderId, amount}만** 전송. 상품 목록 없음
3. 성공 시 `POST /api/orders`(createOrder) — **여기에 상품 목록·discountPoint 가 들어온다**

→ 상품 목록이 있는 **createOrder 가 서버 권위 검증의 유일한 지점**이다. confirm 단계는 상품을 모른다.

## 수정 (#1 서버 권위 금액 재계산) — 적용

**신규** `backend/src/features/orders/order-pricing.js` (순수 함수, DB 무관):
- `sumListPrice` 정가 합계 + 가격 미해소 상품 수집
- `clampDiscount` 포인트 할인을 실제 잔액 상한으로 제한
- `computeServerOrderTotal` 정당 결제액 계산 + 실결제액 대조

**수정** `backend/src/features/orders/orders.service.js` `createOrder` 트랜잭션:
- 새 주문 경로에서만 실행(기존 주문 재제출은 조기 반환으로 건너뜀 → 기존 데이터 호환 유지)
- 상품ID·수량은 기존 `collectOrderProductQuantities` 재사용
- 가격원 **두 곳** 조회: `products.price`(영상) + `studio_pass_products.price`(수강권)
- 포인트 할인은 `users.points` 잔액을 상한으로 제한(유령 할인 차단). 결제 흐름이 포인트를 실제
  차감하지 않으므로 discountPoint 를 그대로 믿으면 잔액 0 사용자가 결제액을 낮출 수 있어서다.
- 서버 계산액 ≠ 실결제액(`confirmation.amount`, PortOne 검증 완료) 또는 가격 미해소 상품 존재 시:
  - 주문 미생성(트랜잭션 롤백 → throw)
  - 이미 승인된 결제는 `cancelPortonePayment` 로 취소 시도
  - 취소는 외부 결제 게이트(`assertExternalPaymentCallsAllowed`)를 따르므로 TEST_SAFE_MODE 에서는
    호출 자체가 막힌다. 그 경우에도 `console.error` 로 관리자 인지용 로그를 남긴다(취소 실패 로그 포함)

응답 구조는 바꾸지 않았다. 정상 경로는 그대로 통과한다.

## 수정 (#2 PortOne V2 사전 등록) — 미적용, 확인 필요

PortOne V2 결제 금액 사전 등록은 결제 요청 전 서버가 예상 금액을 등록해 PortOne 단계에서
강제하는 방식으로, #1(사후 검증+취소)보다 근본적이다. 다만:
- 적용하려면 결제 요청 **전** 프론트가 서버 사전등록 API 를 호출하는 흐름 변경이 필요하다.
  "결제 로직 리팩토링 금지 / 최소 변경 / API 응답 구조 변경 금지" 제약과 충돌한다.
- 이 세션에서 PortOne 공식 문서로 정확한 API·지원 범위를 확인하지 못했다.

지시(추측 구현 금지, 확인 안 되면 #1만 적용하고 #2는 "확인 필요" 보고)에 따라 미적용.
→ 후속: PortOne V2 `pre-register`(결제 정보 사전 등록) API 지원 여부·시그니처를 공식 문서로 확인 후 별도 작업.

## 회귀 방지 테스트

**신규** `backend/test/order-pricing.test.js` 9건. 순수 로직 전수:
- 정가×수량 합계 / 미해소 상품 수집 / 포인트 잔액 상한
- 정상 결제 통과 / **125만원→100원 조작 거부** / 정상 포인트 할인 통과 /
  **유령 포인트 거부** / 미해소 상품 섞이면 거부 / 수강권도 동일 규칙

검증 결과:
- `order-pricing.test.js` 9/9 통과
- `npm run check` 전체 72/72 통과 (회귀 없음)
- 심은 SQL(`products`/`studio_pass_products`/`users.points`)은 코드베이스 기존 파라미터 IN·price 조회
  관례와 동일 패턴. 파라미터 IN 이라 abuse-check 때의 콜레이션 문제(JSON_TABLE 두 컬럼 비교)는 없다.

## 검증하지 못한 것 (정직한 한계)

**end-to-end 주문 생성 검증은 이 환경에서 불가능하다.** createOrder 는 `payment_confirmations`
레코드를 전제하는데, 그 레코드는 confirmPayment 가 PortOne 실제 응답을 받아야 생성된다.
PortOne 호출은 외부 결제라 H2 제약(ALLOW_EXTERNAL_PAYMENT_CALLS 금지, TEST_SAFE_MODE 유지)상
켤 수 없다. 또한 이 hotfix 브랜치는 main 기반이라 개발 터널 스크립트(develop 전용)가 없어
개발 DB 라이브 조회도 이 브랜치에서는 막힌다.

→ 순수 로직과 전체 단위 테스트, SQL 패턴 정합성까지는 검증했으나, **실제 주문 생성 경로에서
정상 주문이 통과하고 조작 주문이 거부되는 end-to-end 확인은 스테이징에서 별도로 해야 한다.**

## 배포 전 사용자 확인 사항

1. **스테이징 end-to-end 검증** — PortOne 연결된 스테이징에서 (a)정상 결제 통과, (b)금액 조작 거부,
   (c)정상 포인트 할인 통과, (d)취소 실패 시 로그가 남는지 확인. 운영 직접 배포 금지.
2. **가격 미해소 = 거부** 정책 확인 — 현재 어떤 상품ID든 products/studio_pass_products 에서 가격을
   못 찾으면 주문을 거부한다. cart_items 는 products FK 라 영상 결제는 항상 해소되지만, 스튜디오
   수강권이나 향후 다른 상품 유형이 이 두 테이블 밖 가격을 쓴다면 정상 주문이 막힐 수 있다.
   운영 주문의 상품ID가 모두 이 두 테이블에서 해소되는지 확인 필요(프롬프트 H1 쿼리로 점검 가능).
3. **포인트 미차감 선행 버그** — 이 hotfix 는 discountPoint 를 잔액 상한으로 제한할 뿐, 결제 시
   포인트를 실제 차감하지 않는 기존 동작은 그대로다. 같은 포인트를 여러 주문에 재사용할 수 있는
   별개 버그가 남아 있다. H2 범위 밖이라 손대지 않았다. 별도 처리 권장.
4. **취소 금액** — 현재 전액 취소를 시도한다(cancelAmount 미지정). 부분 결제 시나리오는 없다고 보나
   운영 정책과 일치하는지 확인.
5. **프롬프트 C Medium(앱 영상구매 서버 차단)** 은 지시대로 이 hotfix 에 넣지 않았다. 별도.

## 커밋

이 브랜치에 커밋만 함. push·main 병합은 별도 승인 사항.

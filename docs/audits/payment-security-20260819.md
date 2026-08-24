# 결제 서버 검증 감사 — 2026-08-19 (프롬프트 C)

브랜치 `fix/play-store-compliance`. 정적 분석만 수행, 코드·결제 API 미변경.
실행 전 확인: 저장소·브랜치 일치, HomePage 폴더 미접근.

## 요약

웹훅 서명·중복 방지·소유권·권한·트랜잭션은 견고하다. 그러나 **주문 금액을 서버가 상품 가격으로
재계산하지 않고 클라이언트 값을 그대로 신뢰**하는 취약점이 있다. 결제 정책(리더 앱)은 UI 숨김뿐이고
서버 차단이 없으나, Play 정책상 즉시 리젝 사유는 아니다(사유는 아래 12번 참조).

## 점검 결과

| # | 점검 항목 | 구현 | 근거 | 취약 시 시나리오 | 심각도 |
|---|---|---|---|---|---|
| 1 | 결제 금액을 서버 상품가와 대조 | **미흡** | `orders.service.js:142-143` amount=`payload.amount`; `payments.service.js:236` 는 요청 amount와 PortOne 승인액만 대조 | 아래 상세 | **High** |
| 2 | 웹훅 서명 검증 | ✅ | `payments.service.js:58-113` HMAC-SHA256 + 타임스탬프 tolerance + timing-safe 비교 | — | — |
| 3 | 중복 승인 차단 | ✅ | `payments.service.js:251-330` payment_confirmations UNIQUE + `INSERT IGNORE` + 재확인 | — | — |
| 4 | 결제자=주문 소유자 검증 | ✅ | `payments.service.js:262,607` userId/email 대조, `orders.service.js:235` 기존 주문 소유자 확인 | — | — |
| 5 | 상태 변경 트랜잭션 | ✅ | `orders.service.js:216 withTransaction` + `FOR UPDATE`(`:228,592`) | — | — |
| 6 | 환불 API 관리자 검증 | ✅ | 라우트 `admin.routes.js:45 requireAdminOrStudioStaff` + 컨트롤러 `admin.controller.js:906 isAdminUser` 이중 | — | — |
| 7 | 시청권한 부여가 결제 후 | ✅ | `video-progress.service.js:1216` 결제 완료 주문의 selectedProductIds 기반. 주문은 결제 확정 후에만 INSERT | — | — |
| 8 | 실패·이탈 시 주문 정리 | ✅ | 주문은 `paymentStatus:"paid"`로만 생성(`orders.service.js:260`). PENDING 주문 미생성이라 정리 대상 없음 | — | — |
| 9 | 결제 진입점 단일 | ✅ | `requestExternalPayment` 호출은 `CartPage.jsx:179` 한 곳뿐(전수) | — | — |
| 10 | 앱 영상구매 차단 위치·방식 | **UI만** | `AcademyDetailPage.jsx:257/294`, `AcademyPage.jsx:1116`, `App.jsx:133`(cart→NativePurchaseNotice). **서버에 native 차단 없음** | 아래 상세 | Medium |
| 11 | 스튜디오 결제 구현·앱 사용 | 미구현 | 앱 내 스튜디오 PG 결제 없음. `StudioReservationPage.jsx:284` "센터로 연락" 안내뿐 | — (해당없음) | — |
| 12 | 앱 내 웹 구매 유도 문구 | ✅ 제거됨 | 프롬프트 B에서 제거. 현재 웹 구매 유도 문구 0건 | — | — |

## High — 주문 금액 클라이언트 신뢰

**금액이 흐르는 세 지점에서 상품 가격(`products.price`)을 한 번도 조회하지 않는다.**

1. 결제창 호출: `CartPage.jsx:179` 클라이언트가 amount 계산
2. 결제 확정: `payments.service.js:236` — `paidAmount !== requestedAmount` 검증. **둘 다 클라이언트 유래.**
   PortOne 실제 승인액과 요청액이 같은지만 볼 뿐, "그 금액이 정당한 상품가인가"는 보지 않는다.
3. 주문 생성: `orders.service.js:143` `amount = payload.amount` 그대로 저장. `validateConfirmedPaymentForOrder`(`:620`)도 payment_confirmations의 amount와 대조할 뿐 상품가 재계산 없음.

**공격 시나리오**: 공격자가 125만원 수강권 상품을 장바구니에 담고, 결제 요청 amount를 100원으로 조작한다.
PortOne에서 100원을 실제 결제한다(브라우저 SDK라 amount는 클라이언트 제어). confirm에 100원을 보내면
`paidAmount(100)===requestedAmount(100)`으로 통과, 주문이 100원으로 생성되고 상품 접근권이 부여된다.
서버 어디에도 "이 productId들의 합이 100원인가"를 검증하는 코드가 없어 **정가 상품을 임의 금액에 구매**할 수 있다.

권장(구현은 승인 후): confirm/createOrder에서 `selectedProductIds`로 `products.price` 합을 서버 조회해
결제액과 대조. 수량·쿠폰·포인트가 있으면 그 계산도 서버에서 재수행.

## Medium — 앱 영상구매 서버 차단 부재

앱(`isNativeApp`)에서 구매 UI는 숨기지만 `/api/orders`·`/api/payments/confirm`에 native 판별이나
상품 종류(영상) 차단이 없다. 앱 사용자가 API를 직접 호출하면 영상 구매가 서버에서 완료된다.

- Play 관점: 오프라인 서비스는 외부 PG 예외지만 **디지털 영상은 Play 결제 대상**이다. 리더 앱 전략(앱에서
  판매 안 함)을 택했으면 서버도 앱 경로의 영상 결제를 차단해야 전략이 완결된다. 현재는 UI 우회로 구멍이 남는다.
- 다만 이는 심사 자동 리젝보다는 정책 정합성 문제다. 실제 결제가 외부 PG로 빠지는 것을 리뷰어가
  포착하면 3.1.1(Apple)·Play 결제정책 지적 대상이 될 수 있다.

## 미해결 항목 / 다음 세션

1. **High 금액 재계산** — 구현은 결제 로직 변경이라 별도 승인 필요. 프롬프트 C는 감사 전용(코드 수정 없음).
2. **Medium 앱 서버 차단** — confirm/orders에 native+영상 상품 차단 추가 여부 결정 필요.
3. payment-config.js git 추적 해제(0단계 A)는 여전히 미처리(공개 식별자라 후순위).
4. 다음 프롬프트: D(Play 정책 자산 감사) 또는 E(실기기 QA).

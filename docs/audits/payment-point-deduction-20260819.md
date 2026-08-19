# 포인트 차감 누락 hotfix — 2026-08-19 (프롬프트 H3)

브랜치 `hotfix/payment-amount-validation`. H2(금액 검증)에 이어 같은 브랜치에 커밋. push·main 병합 안 함.

## 배경 (실제 금전 손실)

H2 에서 "범위 밖"으로 남긴 포인트 미차감이 실손실로 확인됐다.
- CartPage 가 discountPoint 를 payload 로 보내기만 하고 `/me/points/use` 는 프론트 전체에서 0건 호출
- createOrder 는 잔액을 읽기만 하고 adjustPoints 를 결제 흐름에서 부르지 않음
- 결과: 포인트로 할인받아도 잔액이 줄지 않아 매 주문마다 재사용 가능
- H2 의 잔액 상한 검증은 유령 포인트만 막고 재사용은 막지 못함

## 사전 확인 결과

1. **적립(earn)도 결제 흐름에서 누락.** orders.service 에 적립 호출 없고 프론트도 `points/earn` 미호출.
   → 단, 적립 누락은 고객이 받을 포인트를 못 받는 문제로 **회사 금전 손실이 아니며**, 차감 구현과
   독립적이라 이 hotfix 의 범위를 키우지 않는다. **차감만 고치고 적립 누락은 별도 이슈로 남긴다**(아래 후속).
2. **point_history.order_id 에 UNIQUE 없음** (INDEX(user_id)만). DB 제약으로 멱등성 확보 불가.
   → 스키마 변경 없이 기존 잠금으로 멱등성 확보(아래).

## 수정 (backend/src/features/orders/orders.service.js)

H2 가 만든 createOrder 검증 지점의 **같은 트랜잭션 안**에서 차감한다.

- **잔액 조회에 FOR UPDATE 추가.** 같은 사용자의 동시 주문이 사용자 행에서 직렬화되어 이중 사용 불가.
- 검증 통과(pricing.ok) 후 `allowedDiscount > 0` 이면:
  - `UPDATE users SET points = points - ? WHERE id = ? AND points >= ?` (조건부, 음수 방지)
  - affectedRows ≠ 1 이면(경합으로 잔액 부족) 주문 미생성 + 결제 취소 시도 + 로그 후 거부(H2 실패 경로와 동일)
  - `INSERT INTO point_history (... amount<0 ..., order_id)` 로 차감 이력 기록
- **adjustPoints 재사용 안 함**: 그 함수는 트랜잭션 커넥션을 못 받아 이 트랜잭션 밖에서 동작한다.
  같은 conn 으로 차감·이력을 원자적으로 처리해, 주문 INSERT 실패 시 함께 롤백된다.
- **order 객체에 discountPoint 를 실었다.** 기존 createOrder 는 discountPoint 를 버려 저장 payload 에
  남지 않았다. 이제 저장되어, 미차감 탐지 쿼리(payload.discountPoint 기준)가 이후 주문에도 동작한다.
  (이 누락이 실제로 통합 테스트에서 첫 실패를 유발했고, 그 덕에 잡았다.)

### 멱등성 (가장 중요)

- 같은 orderId 재요청은 createOrder 의 **기존 주문 조기 반환**(`if (existing?.id) return`)을 타며,
  이 지점은 차감 코드 **이전**이라 재제출 시 차감이 실행되지 않는다.
- 그 조기 반환 앞의 orders 행 SELECT 가 이미 **FOR UPDATE** 라, 동시 같은 orderId 요청도 직렬화된다.
  첫 요청이 주문을 만들면 둘째는 대기 후 기존 주문을 보고 조기 반환한다.
- 따라서 **스키마 변경(order_id UNIQUE) 없이** 멱등성이 확보된다. 통합 테스트로 실측 확인함.

### 스키마 변경 제안 (미적용)

멱등성은 위 잠금으로 이미 확보되므로 필수는 아니나, 방어 심화용으로
`point_history` 에 `UNIQUE KEY (order_id, amount 방향)` 또는 `(order_id, reason)` 제약을 두면
어떤 경로로도 같은 주문의 차감 이력이 중복 삽입되지 않는다. **적용은 사용자 승인 사항이라 제안만 한다.**

## 회귀 테스트

**단위** `test/order-pricing.test.js` (+3, 총 12): 차감액=적용 할인액 / 미사용 시 0 / 잔액 초과 거부.
**통합** `test/integration/order-point-deduction.mysql.test.js` (신규, RUN_DB_INTEGRATION_TESTS=1):
- 포인트 사용 시 잔액 실제 감소 + 이력 1건
- 같은 주문 재제출 시 이중 차감 없음(잔액 불변, 이력 1건 유지)
- 잔액 초과 할인 결제 거부 + 차감 없음
- 포인트 미사용 정상 결제 무영향

검증 결과:
- 통합 테스트 **5/5 통과** (개발 DB homepage_dev 대상, PortOne 없이 payment_confirmations 직접 seed,
  고유 ID 로 생성 후 정리). createOrder 실제 실행으로 차감·멱등성 실측.
- 단위 `npm run check` **75/75 통과** (회귀 없음).

## 미차감 주문 탐지 쿼리 (운영 실행용)

프롬프트 H1 의 정가 대조 쿼리와 짝을 이룬다. H1 문서(payment-abuse-check-20260819.md)는
Play 대응 브랜치에 있으므로, 여기에 함께 싣는다. 개발 스키마에서 실행 검증 완료(시드 2건, 120,000원 탐지).

```sql
-- payload.discountPoint > 0 이지만 차감 이력이 없는 주문
SELECT
  o.id AS order_id,
  CAST(JSON_EXTRACT(o.payload, '$.discountPoint') AS SIGNED) AS discount_point,
  o.created_at
FROM orders o
WHERE CAST(JSON_EXTRACT(o.payload, '$.discountPoint') AS SIGNED) > 0
  AND NOT EXISTS (
    SELECT 1 FROM point_history ph
    WHERE ph.order_id = o.id COLLATE utf8mb4_unicode_ci
      AND ph.amount < 0
  );

-- 누적 손실 합계
SELECT COALESCE(SUM(CAST(JSON_EXTRACT(o.payload, '$.discountPoint') AS SIGNED)), 0) AS total_loss
FROM orders o
WHERE CAST(JSON_EXTRACT(o.payload, '$.discountPoint') AS SIGNED) > 0
  AND NOT EXISTS (
    SELECT 1 FROM point_history ph
    WHERE ph.order_id = o.id COLLATE utf8mb4_unicode_ci AND ph.amount < 0
  );
```

주의:
- `COLLATE utf8mb4_unicode_ci` 필수(order_id 콜레이션 불일치 회피).
- **hotfix 이전 주문 중 payload 에 discountPoint 가 저장된 것**만 잡는다. 이전 createOrder 는
  discountPoint 를 저장하지 않았을 수 있으므로, 그런 주문은 H1 의 정가 대조 쿼리
  (`orders.amount < 정가합`)로 교차 확인해야 한다.
- 운영 조회는 운영 읽기 권한 환경에서 실행(이 환경은 운영 접근 불가, H1 문서 참조).

## 배포 전 사용자 확인 사항

1. **스테이징 end-to-end** — PortOne 연결 환경에서 포인트 사용 결제가 잔액을 실제로 줄이는지,
   재제출이 이중 차감하지 않는지 확인. 운영 직접 배포 금지.
2. **과거 손실 집계** — 위 탐지 쿼리를 운영에서 실행해 미차감 손실 규모를 파악. H1 정가 대조와 교차.
3. **적립(earn) 누락은 미해결** — 이 hotfix 는 차감만 고쳤다. 결제 완료 시 포인트 적립이 호출되지
   않는 문제는 그대로다. 회사 손실은 아니나 고객 대상 기능 결손이므로 별도 처리 권장.
4. **point_history UNIQUE 제약** — 위 제안 채택 여부 결정(스키마 변경이라 승인 필요).
5. discountPoint 를 저장 payload 에 넣었다. 기존 주문 조회 화면이 이 필드를 문제없이 무시하는지 확인
   (신규 필드 추가라 하위 호환되나 형식상 점검).

## 커밋

이 브랜치에 커밋. push·main 병합은 별도 승인.

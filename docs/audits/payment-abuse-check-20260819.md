# 운영 주문 악용 여부 조회 — 2026-08-19 (프롬프트 H1)

프롬프트 C에서 확인된 결제 금액 위변조 취약점의 과거 악용 여부 조회 시도.
브랜치 `fix/play-store-compliance`. 읽기 전용, 코드·데이터 미변경.

## 결론 (먼저)

**운영 DB(icl_pilates)를 조회하지 못했다.** 이 환경에 운영 접근 경로가 없다.
따라서 **악용 여부는 미판정**이다. 대신 운영에서 그대로 실행할 수 있는 정가 대조 SELECT를
개발 스키마에 대고 검증해 첨부한다. 실제 판정은 이 쿼리를 운영 읽기 권한이 있는 환경에서 실행해야 한다.

## 운영 접근 불가 — 근거

승인은 있었으나(H1 명시), 이 환경에 접근 수단이 없다. 없는 접근을 뚫지 않았다.

| 필요 | 상태 |
|---|---|
| 운영 `backend/.env` (icl_pilates 자격증명) | 이 ICL 폴더에 없음 (환경분리 원칙상 미복사) |
| 운영 RDS 네트워크 경로 | 없음. 터널 설정은 개발 인스턴스·개발 RDS만 지정 |
| SSM 역할 권한 | 개발 인스턴스 전용. 운영 EC2 대상 권한 없음 |
| 개발 DB 계정의 운영 조회 | 차단됨 (`productionDatabaseAccessDenied: true`) |

운영에 닿으려면 (1)운영 자격증명 + (2)운영 RDS 경로가 둘 다 필요한데, 확보하려면
`HomePage/backend/.env`(H1이 "절대 건드리지 마라"고 못박은 구버전 폴더)를 읽거나 IAM 역할을 넓혀야 한다.
둘 다 승인 범위 밖이라 하지 않았다. 결과를 지어내지 않는다.

## payload 구조 (개발 DB 실측)

- 주문은 `orders.payload`(JSON)에 상품 목록을 담는다. 두 형태:
  - `selectedProductIds`: 상품ID 배열. **수량 개념 없음(각 1)**
  - `items`: `{productId, quantity}` 배열 (수량 포함) — 개발 샘플엔 없었으나 코드가 지원(`orders.service.js:68`)
- 정상 할인은 `payload.discountPoint`(사용 포인트, 원)로 기록된다. 쿠폰은 미구현(CartPage "사용가능 0").
- 상품 가격원이 **둘**이다: 영상=`products.price`, 스튜디오 수강권=`studio_pass_products.price`.

## 정가 대조 쿼리 (운영 실행용, 개발 검증 완료)

```sql
SELECT
  o.id AS order_id,
  o.amount AS paid,
  COUNT(jt.pid) AS item_count,
  SUM(CASE WHEN pr.price IS NOT NULL OR sp.price IS NOT NULL THEN 1 ELSE 0 END) AS resolved_count,
  COALESCE(SUM(COALESCE(pr.price, sp.price, 0)), 0) AS list_sum,
  COALESCE(CAST(JSON_EXTRACT(o.payload, '$.discountPoint') AS SIGNED), 0) AS discount_point,
  COALESCE(SUM(COALESCE(pr.price, sp.price, 0)), 0)
    - COALESCE(CAST(JSON_EXTRACT(o.payload, '$.discountPoint') AS SIGNED), 0) AS expected,
  o.created_at
FROM orders o
LEFT JOIN JSON_TABLE(o.payload, '$.selectedProductIds[*]'
  COLUMNS (pid VARCHAR(64) PATH '$')) jt ON TRUE
LEFT JOIN products pr            ON pr.id = jt.pid COLLATE utf8mb4_unicode_ci
LEFT JOIN studio_pass_products sp ON sp.id = jt.pid COLLATE utf8mb4_unicode_ci
GROUP BY o.id, o.amount, o.payload, o.created_at
HAVING item_count > 0
   AND resolved_count = item_count     -- 모든 상품ID가 가격을 찾은 주문만 신뢰
   AND expected <> paid;               -- 불일치만
```

검증에서 확인된 필수 처리:
- `COLLATE utf8mb4_unicode_ci` 필수. 없으면 `ER_CANT_AGGREGATE_2COLLATIONS`로 실패한다.
- 두 가격원(`products` + `studio_pass_products`)을 합치지 않으면, 수강권 주문이 정가합 0으로 나와 **대량 오탐**.
- `resolved_count = item_count` 조건으로, 삭제·개명되어 가격을 못 찾는 상품이 섞인 주문을 제외한다.

## 판정 기준 (운영 실행 시)

| 패턴 | 해석 |
|---|---|
| `expected == paid` | 정상 |
| `paid > expected` | **악용 아님.** `selectedProductIds`가 수량을 1로 뭉개서 수량>1 주문은 초과로 보인다. (개발 실측: 25,000×3=75,000이 이 형태로 나옴) |
| `paid < expected`, 특히 극단적 저액(정가의 1% 등) | **악용 의심.** 취약점(클라 금액 신뢰)의 직접 증거 |

즉 운영에서는 위 쿼리 결과 중 **`paid < expected` 행만** 실제 조사 대상이다.
`items` 형태 주문은 수량을 반영해야 정확하므로, 운영에 `items` 주문이 있으면 아래를 병행한다.

```sql
-- items 형태 보정: 수량까지 반영한 정가합
LEFT JOIN JSON_TABLE(o.payload, '$.items[*]'
  COLUMNS (pid VARCHAR(64) PATH '$.productId', qty INT PATH '$.quantity')) jt2 ON TRUE
-- list_sum 에 COALESCE(pr.price, sp.price,0) * jt2.qty 합산
```

## 개발 DB 실행 결과 (참고 — 악용 판단 근거 아님)

개발 시드 데이터 12건에 실행: 전상품 해소 5건 중 불일치 1건(`paid 75,000 > expected 25,000`).
이는 수량 3짜리 주문이 `selectedProductIds`로 뭉개진 **오탐**이며 저액 결제 아님.
**개발 데이터라 악용과 무관하다.** 운영 판정 근거로 쓰지 않는다.

## 미해결 / 다음 세션

1. **운영 실제 조회 미수행** — 운영 읽기 권한이 있는 환경에서 위 쿼리를 실행해야 판정 가능.
   실행 주체 후보: (a) 사용자가 운영 서버에서 직접, (b) 운영 `.env`+RDS 경로가 있는 환경.
2. `paid < expected` 행이 나오면 그 주문의 상품·시각·사용자(마스킹)를 표로 정리하고 즉시 보고.
3. 근본 수정은 프롬프트 H2(결제 금액 검증 hotfix)에서 다룬다. 조회 결과와 무관하게 취약점 자체는 존재한다.

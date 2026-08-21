# 교육영상 환불 및 결제 경로 전수 조사 (2026-08-21)

- 배경: 수강권 환불(S-7)에서 ① 클라이언트 금액 그대로 저장 ② 정상 신청 시 0원 저장 두 결함이 확인돼(`ddacfc1` 수정), **같은 패턴이 다른 결제 경로에도 있는지** 확인했다
- 브랜치: `hotfix/payment-amount-validation`
- 검증 수준: **Level 1(정적 분석)** — 코드 경로 추적. 수정 대상이 없어 실 API 검증은 수행하지 않았다
- **결론: 수정 없음.** 영상 환불은 수강권과 구조가 달라 조작 취약점이 없고, 나머지 결제 경로에서도 추가 취약점을 찾지 못했다

## 1. 교육영상 환불 — 안전 (수정 불필요)

### 1-1. 왜 안전한가: 이중 상한 클램프

환불 금액은 클라이언트가 보내지만, **서버가 주문 DB 금액으로 계산한 상한(`refundableAmount`)을 두 단계에서 강제**한다. 상한은 요청 본문이 아니라 `orders.amount`와 기환불액에서 나온다.

```
refundableAmount = orders.amount − 이미 환불된 금액   (서버가 DB에서 계산)
```

**① 신청 단계** — `backend/src/features/refunds/refunds.service.js` `createRefundRequest`

```js
const computedRequestedAmount =
  requested > 0
    ? Math.min(requested, refundableAmount)        // 클라이언트 값은 상한을 넘지 못함
    : isFullRefundRequest
    ? refundableAmount                             // 금액 미전송 시 서버가 전액 계산
    : Math.round(refundableAmount * (selectedIds.length / activeProductIds.length));
```

**② 승인 단계** — 같은 파일 `approveRefundRequest`

```js
const cancelAmount =
  normalizedApprovedAmount > 0
    ? Math.min(normalizedApprovedAmount, refundableAmount)   // 관리자 입력도 상한 강제
    : Math.min(fallbackRequestedAmount, refundableAmount);   // 신청액도 다시 클램프
```

신청 시점에 통과한 금액이라도 승인 시점에 다시 검증하므로, 그 사이 다른 환불이 처리돼 잔액이 줄었더라도 초과 지급되지 않는다.

**③ 관리자 직접 환불** — `backend/src/features/admin/admin.controller.js:944-948` 은 클램프 대신 **초과 시 400 거부**로 같은 결과를 만든다.

### 1-2. 수강권과의 구조 비교

| 항목 | 교육영상 환불 | 수강권 환불(수정 전) |
|---|---|---|
| 금액 출처 | 클라이언트 `requestedAmount` | 클라이언트 `refundAmount` |
| 서버 상한 검증 | **있음** — `Math.min(요청액, refundableAmount)` | **없음** — 그대로 INSERT |
| 금액 미전송 시 | 전액 또는 상품 개수 비례로 **서버 계산** | **0원 저장**(소비자 피해) |
| 승인 단계 재검증 | **있음**(이중 클램프) | 없음(상태만 변경) |
| 상한 산출 근거 | `orders.amount` − 기환불액 (DB) | — |
| 판정 | **안전** | 취약 → `ddacfc1` |

두 결함(조작·0원) 모두 영상 환불에는 존재하지 않는다.

### 1-3. calculateVideoRefundAmount 배선은 보안이 아니라 정책 사안이다

- 이 브랜치에는 `backend/src/features/academy/academy.refund-rules.js` **파일 자체가 없다**(도입 커밋 `de8169b` 가 `fix/play-store-compliance` 에만 존재). 수강권 때와 같은 상황이다.
- 그러나 **수강권과 달리 배선이 시급하지 않다.** 이유:
  1. **조작 위험이 없다.** 상한이 서버 DB 값으로 강제되므로, 계산 함수가 없어도 과다 환불을 요구할 수 없다. 수강권은 상한 자체가 없어 위조가 그대로 통했다.
  2. **0원 저장 같은 소비자 피해가 없다.** 금액을 보내지 않아도 서버가 전액/비례로 채운다.
  3. 두 방식의 차이는 **환불액을 얼마나 정교하게 깎느냐**다. 현재는 *상품 개수* 비례로 계산하고, `calculateVideoRefundAmount` 는 *시청하지 않은 챕터* 비례로 계산한다.
  4. 현재 방식은 시청분을 차감하지 않으므로 **소비자에게 유리한(더 많이 환불되는) 방향**이다. 즉 미배선으로 손해를 보는 쪽은 소비자가 아니라 사업자다.
- 따라서 이 사안은 "취약점 수정"이 아니라 **"환불 정책을 어느 수준으로 정교화할 것인가"** 라는 사업 판단이며, 보안 hotfix 범위에 넣지 않았다. 배선 시 실제 환불액이 줄어드는 방향이라 약관·고지와의 정합성 검토가 함께 필요하다.

## 2. 결제 경로 전수 확인 (9개)

"클라이언트가 보낸 금액을 서버가 검증 없이 저장하는" 패턴을 기준으로 확인했다.

| # | 경로 | 금액 출처 | 서버 검증 | 판정 |
|---|---|---|---|---|
| 1 | 주문 결제 금액 (`orders.service.js`) | 클라이언트 | `computeServerOrderTotal` 로 상품가 기준 재계산·불일치 거부 | **안전** (`8f71400`) |
| 2 | 수강권 환불 (`studio.service.js`) | 클라이언트 | 서버가 결제금액·사용횟수·기간으로 법정 계산, 요청값 미사용 | **안전** (`ddacfc1`) |
| 3 | 영상 환불 신청 (`refunds.service.js`) | 클라이언트 | `Math.min(요청액, refundableAmount)` | **안전** |
| 4 | 영상 환불 승인 (`refunds.service.js`) | 관리자 입력 | `Math.min(승인액, refundableAmount)` 재검증 | **안전** |
| 5 | 관리자 주문 환불 (`admin.controller.js:944`) | 관리자 입력 | 초과 시 400 거부 | **안전** |
| 6 | 포인트 사용 (`users.controller.js:186`) | 클라이언트 | 잔액 검사 + 세션 사용자 기준 + `GREATEST(0, …)` | **안전** (단, §3-1) |
| 7 | 포인트 적립 (`users.controller.js:215`) | 관리자 입력 | 관리자 전용 403 검사 | **안전** (단, §3-2) |
| 8 | 수강권 발급·연장·양도·일시정지 (`studio.controller.js`) | 관리자 입력 | 전부 `/admin/` 경로 + `pass.write` 권한 — 회원 호출 불가 | **안전**(관리자 업무 입력) |
| 9 | 쿠폰·프로모션 | — | — | **미구현** (코드 검색 결과 0건) |

지출·미수금 기록(`createStudioExpense`, `createArrears`) 등 나머지 금액 입력도 모두 관리자 권한 경로이며, 관리자가 매출·지출을 기록하는 정상 업무 흐름이다.

## 3. 부수 발견 — 미조치, 별도 판단 대기

이번 조사 범위(클라이언트 금액 위조) 밖이라 **수정하지 않았다.**

### 3-1. 포인트 사용 동시성 — 미조치, 별도 판단 대기

`users.controller.js:197-207` 에서 잔액 확인(`getUserPoints`)과 차감(`adjustPoints`)이 **한 트랜잭션으로 묶여 있지 않다.** 동시에 여러 요청을 보내면 같은 잔액을 근거로 여러 번 통과할 수 있다.

- 실제 잔액은 `UPDATE users SET points = GREATEST(0, points + ?)` 덕분에 음수가 되지 않는다.
- 다만 `point_history` 에는 차감 기록이 중복으로 남아 **이력과 잔액이 어긋날 수 있다.**
- 조치안(미적용): 잔액 확인과 차감을 `withTransaction` + `SELECT … FOR UPDATE` 로 묶는다.

### 3-2. 포인트 적립 대상 오류 — 미조치, 별도 판단 대기

`users.controller.js:230-235` 의 `adjustPoints(authUser.id, …)` 는 적립 대상이 **관리자 자기 자신**이다. 대상 회원을 지정하는 파라미터가 없어 관리자가 다른 회원에게 포인트를 적립할 수 없다.

- 권한 우회는 아니지만(관리자 전용 API), 기능이 의도대로 동작하지 않는다.
- 조치안(미적용): 대상 `userId` 를 파라미터로 받고 관리자 권한과 감사 로그를 함께 둔다.
- `full-test-20260821.md` 의 F-7 과 동일 항목이다.

## 미해결 항목

1. `calculateVideoRefundAmount` 배선 여부 — 정책 판단 대기 (§1-3)
2. 포인트 사용 동시성 (§3-1) — 미조치
3. 포인트 적립 대상 오류 (§3-2) — 미조치
4. `hotfix/payment-amount-validation` 미병합 — 주문 금액·포인트 차감·수강권 환불 3건이 운영 미반영

## 다음에 해야 할 일

1. 이 브랜치의 main 병합 승인 여부 결정
2. 영상 환불을 시청분 기준으로 정교화할지 정책 결정 (약관·고지 정합성 포함)
3. 포인트 관련 2건의 조치 여부 결정

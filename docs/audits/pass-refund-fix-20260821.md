# 수강권 환불 금액 서버 검증 (S-7) — 2026-08-21

- 대상: `docs/audits/full-test-20260821.md` 의 **S-7** — 수강권 환불액을 클라이언트 값 그대로 저장
- 브랜치: `hotfix/payment-amount-validation` (기존 결제 수정 `8f71400`·`c190f9c` 에 이어 추가 커밋)
- 환경: 개발 DB(`homepage_dev`), `TEST_SAFE_MODE=true`, 외부 결제 호출 차단(`ALLOW_EXTERNAL_PAYMENT_CALLS=false`). 실제 PG 환불 API 미호출
- 검증 수준: **Level 3(API/DB 연동)**

## 1. 흐름 파악 결과

| 질문 | 답 |
|---|---|
| 누가 실행하는가 | **회원 신청 → 관리자 승인** 2단계. `POST /studio/passes/refund-requests`(회원) → `PATCH /studio/admin/pass-refunds/:id`(관리자) |
| 금액이 어디서 만들어지는가 | 클라이언트 요청 본문 `refundAmount`. `normalizePassRefundRequest` 는 숫자 변환·음수 거부만 하고 **값을 그대로 통과** |
| 어디로 흘러 저장되는가 | `studio_pass_refunds.refund_amount` 에 그대로 INSERT. 승인 단계는 **금액을 재계산하지 않고** 상태만 `approved` 로 변경 |
| 왜 미호출이었나 | `calculatePassRefundAmount` 는 커밋 `de8169b` 가 **함수·테스트·환불정책 페이지만 추가하고 서비스 배선을 하지 않은** 상태였다. 미완성이나 대체가 아니라 **단순 누락** |

### 실측한 취약 동작 (수정 전)

| 시나리오 | 결과 |
|---|---|
| 회원 정상 신청 (프론트가 `{passId, reason}` 만 전송) | **0원으로 저장** — 화면이 금액을 안 보내 `?? 0` 이 적용되는 버그 |
| 금액 조작 (`refundAmount: 9999999`) | **9,999,999원 그대로 저장** (법정 기준 600,000원) |
| 관리자 대행 신청 (회원 수강권 + 금액 입력) | **404 "본인 소유의 수강권을 찾을 수 없습니다"** — 컨트롤러(`studio.controller.js:1078-1081`)가 `userId` 를 세션 사용자로 덮어써서, 관리자 화면의 금액 입력 기능은 **이미 동작하지 않는 상태** |

## 2. 법정 기준 대조 — 일치 (중단 사유 없음)

`docs/APP_STORE_REVIEW_GUIDE.md` 의 환불 정책 절과 대조한 결과, `calculatePassRefundAmount` 는
**환불액 = 총 결제금액 − 실제 이용분 − 위약금(총액의 10% 이내)** 을 그대로 구현한다.

- 이용분: 횟수제면 사용 횟수 비율, 기간제면 경과 일수 비율. 둘 다 있으면 횟수 우선
- 위약금: 총액의 10% 상한이며 남은 금액을 넘겨 청구하지 않음. 사업자 귀책(`businessFault`)이면 0
- 계산 규칙을 임의로 수정하지 않았다

## 3. 적용한 수정 (승인받은 방식: 클라이언트 값 무시)

### 3-1. 계산 함수 이식 — 브랜치 전제 차이

**작업 중 확인한 사실**: 지시서가 가리킨 `calculatePassRefundAmount:54` 는 `fix/play-store-compliance` 기준이며, **main 과 이 hotfix 브랜치에는 함수 자체가 없었다**(도입 커밋 `de8169b` 가 fix 브랜치에만 존재). 따라서 배선에 앞서 계산 로직을 이 브랜치로 가져왔다.

- `backend/src/features/studio/studio.refund-rules.js` 에 `PASS_CANCELLATION_PENALTY_RATE` 와 `calculatePassRefundAmount` 를 **원문 그대로** 추가(법률 근거 주석 포함)
- `de8169b` 를 통째로 cherry-pick 하지 않은 이유: 그 커밋은 프론트 환불정책 페이지·푸터·라우트 변경을 함께 담고 있어 "결제 성격만" 이라는 이번 hotfix 범위를 벗어난다

### 3-2. 서버 권위 계산 배선

`backend/src/features/studio/studio.service.js` 의 `requestPassRefund`:

- 수강권 조회에 `total_count`·`remaining_count`·`created_at`·`expires_at` 추가 (기존 `FOR UPDATE` 잠금 유지)
- `studio_pass_payments` 에서 `SUM(amount)` 로 총 결제금액 조회
- 유효기간·경과일수를 발급일 기준으로 환산해 `calculatePassRefundAmount` 호출
- **서버 계산값을 저장**하고 요청 본문의 `refundAmount` 는 사용하지 않음

결제금액을 단순 합산해도 되는 근거(개발 DB 실데이터 확인): `payment_type` 은 신규결제·재결제·양도·업그레이드·미수금·체험뿐으로 **환불/조정 타입이 없고 음수 금액 0건**이며, 수강권당 결제 기록이 1건이다. 결제 기록이 없는 수강권은 `totalAmount=0` 이 되어 계산 함수가 `refundAmount: 0, basis:"none"` 을 돌려준다.

### 3-3. 하지 않은 것

- **관리자 재량 금액 입력**: 승인받은 대로 이번 수정에 포함하지 않았다. 현재 404 로 동작하지 않으므로 서버 계산 도입에 걸림돌이 없다. 동작하지 않는 입력란이 혼란을 주므로 **프론트에서 제거하는 별도 작업을 제안**한다(`AdminMemberListPage.jsx:1821-1827`). 대행 신청을 정식 기능으로 살리려면 전용 엔드포인트와 감사 로그가 필요하며 스키마 설계가 선행돼야 한다
- DB 스키마 변경 없음, API 응답 구조 변경 없음

## 4. 검증 결과

| 항목 | 결과 |
|---|---|
| 백엔드 테스트 | **85/85 통과** (기준 75 + 신규 10, 실패 0) |
| 조작 차단 (실 API) | `refundAmount: 9999999` 전송 → **600,000원 저장** ✅ |
| 회원 정상 경로 (실 API) | 금액 미전송 → **600,000원 저장** ✅ (0원 버그 동시 해결) |
| 미사용 수강권 (실 API) | 10회 전부 잔여 → **900,000원**(위약금 10%만 차감) ✅ |
| 승인 흐름 (실 API) | 승인 200 → `status=approved`, 수강권 `refunded` ✅ |
| 관리자 목록 조회 | 200, 응답 필드 구조 불변(`refundAmount` 포함) ✅ |
| 기존 이력 호환 | 개발 DB에 기존 환불 이력 **0건**. 컬럼·조회 로직 변경이 없어 과거 데이터 표시에 영향 없음 |

테스트 시나리오(10건): 조작 차단, 금액 미전송, 횟수제 계산, 미사용, 기간제, 위약금 상한, 잔액 초과 방지, 사업자 귀책, 결제기록 없음, 사유 필수.

## 5. 정리

검증용 seed(회원 2·수강권 1·결제기록 1·환불요청)를 전량 삭제하고 **잔존 0을 확인**했다. 임시 스크립트도 제거했다.

## 미해결 항목

1. **관리자 대행 환불이 404 로 동작하지 않음** — 관리자 화면의 금액 입력란이 죽은 UI 상태. 제거 또는 정식 구현 결정 필요
2. **영상(아카데미) 환불**은 이번 범위 밖 — `academy.refund-rules.js` 의 `calculateVideoRefundAmount` 도 fix 브랜치에만 있고 배선 여부 미확인
3. 이 hotfix 브랜치 **미병합** — 주문 금액 검증(`8f71400`)·포인트 차감(`c190f9c`)과 함께 운영 미반영 상태
4. 승인 단계에서 금액을 다시 검증하지는 않는다(신청 시점 서버 계산값을 그대로 확정). 신청 후 승인까지 사이에 수강권 사용이 늘어나면 실제 이용분과 차이가 생길 수 있음 — 정책 판단 필요

## 다음에 해야 할 일

1. `hotfix/payment-amount-validation` 의 main 병합 승인 여부 결정 (3개 커밋: 주문 금액·포인트·수강권 환불)
2. 관리자 금액 입력란 제거 또는 대행 환불 정식 구현 결정
3. 영상 환불 계산(`calculateVideoRefundAmount`) 배선 여부 점검
4. 승인 시점 재계산 정책 결정 (미해결 4)

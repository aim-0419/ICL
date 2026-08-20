# 스테이징 e2e 실행 가능 여부 조사 — 2026-08-19

브랜치 `hotfix/payment-amount-validation` (main 기반). 조사 전용, 코드·데이터·설정 미변경, 미커밋.
실제 결제 미실행, ALLOW_EXTERNAL_PAYMENT_CALLS 미변경, 운영 키·운영 DB 미사용.

## 한 줄 결론

**지금 이 환경에서 e2e 는 불가능하다.** 이 hotfix 브랜치는 main 기반이라 테스트 환경 도구
(`.env.test`, `start:test`, `env:check:test`, 테스트 DB 부트스트랩 흐름)가 없고, PortOne 테스트 채널
키도 없다. 다만 **핵심 hotfix 로직(금액 검증·포인트 차감)의 e2e 검증에는 웹훅 수신이 필요하지 않다**
(아래 4 참조). 준비물만 갖추면 확인 가능하다.

## 1. homepage_test 환경 구성

| 항목 | 상태 |
|---|---|
| `backend/.env.test` | **없음** (이 브랜치에 미존재) |
| `backend/.env.test.example` | 있음 (템플릿) |
| `start:test` / `env:check:test` 스크립트 | **없음** (main 기반 브랜치라 환경분리 도구 부재. develop 계열에만 있음) |
| 로컬 MySQL | **가동 중** (Windows 서비스 MySQL80, 3306 리스닝). 단 `mysql` CLI 는 PATH 에 없음 |
| homepage_test DB / 접속 자격증명 | 이 환경에 없음 (`.env.test` 부재) |

**PortOne 변수 (변수명·설정여부만, 값 미출력):**

코드가 읽는 변수: `PORTONE_API_BASE_URL`, `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`, `PORTONE_WEBHOOK_SECRETS`.

`.env.test.example` 기준:
- `PORTONE_API_BASE_URL` = 설정됨
- `PORTONE_API_SECRET` = **빈 값**
- `PORTONE_WEBHOOK_SECRET` = **빈 값**
- `PORTONE_WEBHOOK_SECRETS` = **빈 값**
- `TEST_SAFE_MODE`, `ALLOW_EXTERNAL_PAYMENT_CALLS` = 선언됨

**테스트/운영 채널 구분:** 불가능. 서버 측 `PORTONE_API_SECRET` 이 비어 있어 채널 자체가 미설정이다.
프론트 `frontend/public/payment-config.js` 에는 클라이언트 채널 식별자(storeId/channelKey)가 있으나
(값 미확인), 이는 배포용 설정으로 테스트 채널이라는 근거가 없다. e2e 에는 별도 **테스트 채널**이 필요하다.

**안전 플래그 코드 로직:** `env.js:113` 에서 `allowExternalPaymentCalls = !testSafeMode && readBoolean(...)`.
즉 `TEST_SAFE_MODE=true` 면 `ALLOW_EXTERNAL_PAYMENT_CALLS` 값과 무관하게 외부 결제 호출이 **항상 차단**된다.
스모크 테스트로 확인: TEST_SAFE_MODE=true → `allowExternalPaymentCalls=false`.

## 2. hotfix 코드 기동 확인

DB 연결·listen 없이 앱 조립만 확인(스모크):
- `createApp()` 이 **정상 조립**됨 (라우트 등록 완료). hotfix 변경(orders.service, order-pricing)이
  로드 오류 없이 기동 가능.
- 완전 기동 추가 요건: `homepage_test` DB + 접속 자격증명, `ACADEMY_PLAYBACK_TOKEN_SECRET`,
  `PII_ENCRYPTION_KEY`. (스모크에서 이 둘 미설정 시 시작 차단됨을 확인)

## 3. e2e 실행에 더 필요한 것

1. **PortOne 테스트 채널 개설** — 테스트 모드 storeId/channelKey(프론트) + `PORTONE_API_SECRET`(서버) 한 쌍.
   실결제 없이 결제 시뮬레이션이 되어야 함. 현재 서버 시크릿 빈 값, 프론트는 배포용(테스트 근거 없음).
2. **`.env.test` 작성** — DB 접속(homepage_test), `ACADEMY_PLAYBACK_TOKEN_SECRET`, `PII_ENCRYPTION_KEY`,
   위 PortOne 테스트 키. `TEST_SAFE_MODE` 는 결제를 실제로 태우려면 정책 판단 필요(아래 주의).
3. **homepage_test DB 준비** — 로컬 MySQL80 에 스키마 부트스트랩 + 테스트 계정. 이 브랜치엔 부트스트랩
   스크립트 흐름이 없어, develop 계열 도구를 쓰거나 수동 준비 필요.
4. **프론트 빌드** — `npm run build` (vite) 사용 가능. 결제 채널키가 테스트 채널이어야 함.
5. **결제 진입 계정/상품** — 로그인 계정 + 가격이 있는 상품(products) 최소 1건.

**주의 (모순 지점):** 실제 PortOne 결제를 태우려면 `ALLOW_EXTERNAL_PAYMENT_CALLS=true` +
`TEST_SAFE_MODE=false` 가 되어야 서버가 PortOne API 를 호출한다. 이는 이 작업의 제약
("ALLOW_EXTERNAL_PAYMENT_CALLS 켜지 마라", "TEST_SAFE_MODE 유지")과 충돌한다.
→ **실 결제 e2e 는 이 조사 작업 범위 밖이며, 별도 스테이징 환경 + 사용자 승인이 있어야 한다.**
TEST_SAFE_MODE 를 켠 채로는 confirm 이 PortOne 을 호출하지 못해 e2e 가 성립하지 않는다.

## 4. 웹훅 수신 도달성

- 라우트 배선됨: `POST /api/payments/webhook` (app.js:136,159). CSRF/상태변경 rate skip 에서 웹훅 경로 제외 처리됨.
- 로컬 백엔드는 외부에서 도달 불가. PortOne 웹훅은 공개 HTTPS URL 로 POST 하므로, 웹훅 경로를
  검증하려면 공개 스테이징 배포 또는 터널(ngrok/cloudflared) 필요.
- **다만 이 hotfix 검증에는 웹훅 수신이 필요 없다.** hotfix 로직(금액 검증·포인트 차감)은
  `POST /confirm` → `createOrder` 동기 경로에 있고, confirm 은 서버가 PortOne 결제를 **끌어와**
  검증한다(inbound 웹훅 아님). 웹훅은 hotfix 가 건드리지 않은 비동기 동기화 경로다.
  → 웹훅 도달성은 hotfix e2e 의 선결 조건이 아니다. 웹훅 경로 자체를 테스트하려는 경우에만 필요.

## 권장 e2e 경로 (준비 완료 시)

실 결제 대신 **PortOne 테스트 채널**로:
1. 테스트 채널 키 주입(.env.test + 프론트 payment-config 테스트값), homepage_test DB 준비.
2. `ALLOW_EXTERNAL_PAYMENT_CALLS=true`, `TEST_SAFE_MODE=false` (스테이징 한정, 사용자 승인 하에).
3. 프론트에서 상품 결제 → confirm → createOrder 흐름으로:
   - 정상 결제: 주문 생성 + 포인트 사용 시 잔액 감소
   - 금액 조작(요청 amount 변조): 주문 거부 + 결제 취소 시도 로그
   - 재제출: 이중 차감 없음
4. 이 4개는 이미 개발 DB 통합 테스트(order-point-deduction.mysql.test.js)로 코드 레벨 검증됨.
   스테이징 e2e 는 PortOne 실연동 경로까지 포함해 재확인하는 의미.

## 이 환경에서 확인한 것 / 못 한 것

- 확인: 앱 조립 정상, TEST_SAFE_MODE 의 외부결제 차단 로직, 웹훅 라우트 배선, 로컬 MySQL 가동,
  hotfix 로직의 개발 DB 통합 테스트 통과(별도 문서).
- 못 함: 실 PortOne 연동 e2e (테스트 채널·공개 스테이징·플래그 전환 필요, 모두 이 작업 범위 밖).

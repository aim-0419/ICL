# TEST_ENV_SETUP.md

## 문서 목적

이 문서는 `테스트 진행해` 명령을 안전하게 실행하기 위한 테스트 전용 환경 구성 기준을 정의한다.

전체 자동 E2E 테스트는 실제 DB, 실제 외부 발송, 실제 결제/환불 호출에 영향을 줄 수 있으므로 테스트 전용 환경이 확인된 경우에만 진행한다.

## 핵심 원칙

- 운영 DB에서 E2E 테스트 금지
- 실제 사용자 데이터가 있는 DB에서 E2E 테스트 금지
- 실제 이메일/SMS/카카오/FCM 발송 금지
- 실제 결제/환불 API 호출 금지
- 테스트 업로드 파일은 테스트 전용 경로 사용
- 테스트 완료 후 정리 가능한 데이터만 생성
- 테스트 데이터에는 명확한 prefix 사용

## 테스트 모드 구분

### 비파괴 테스트 모드

코드 정적 분석, 빌드, 문법 검사, 문서/보안 정적 점검처럼 실제 데이터를 변경하지 않는 테스트에 사용한다.

```text
TEST_SAFE_MODE=true
ALLOW_E2E_DATA_MUTATION=false
```

의미:

- 외부 이메일/SMS/카카오/FCM 발송 금지
- 결제/환불 외부 API 호출 금지
- 스케줄러 실행 금지
- DB 쓰기 E2E 금지
- 정적 분석, 빌드, 문법검사, 비파괴 점검만 가능

### 전체 E2E 테스트 모드

테스트 전용 DB에서만 회원가입, 예약, 게시글, 영상 등록처럼 DB 생성/수정/삭제가 필요한 브라우저 E2E에 사용한다.

```text
TEST_SAFE_MODE=true
ALLOW_E2E_DATA_MUTATION=true
```

의미:

- 외부 이메일/SMS/카카오/FCM 발송은 계속 차단
- 결제/환불 외부 API 호출은 계속 차단
- 스케줄러는 계속 비활성화
- 테스트 전용 DB에 한해서 DB 쓰기 테스트 허용
- 운영 DB에서는 절대 금지

주의: `TEST_SAFE_MODE=true`는 외부 발송, 결제/환불 외부 호출, 스케줄러 같은 외부 부작용을 차단하는 설정이다. `ALLOW_E2E_DATA_MUTATION=true`는 테스트 전용 DB에서만 DB 쓰기 E2E를 허용하는 설정이며, production이거나 DB 이름이 test/e2e/qa 성격으로 확인되지 않으면 코드에서 자동으로 false 처리한다.

현재 `allowE2eDataMutation`은 전체 E2E 실행 전 환경 정책을 판정하기 위한 설정값이다. 개별 CRUD API를 강제로 막는 가드는 이번 정책 정합성 패치 범위에 포함하지 않는다.

## 필수 환경 조건

아래 값은 전체 E2E 테스트 전용 환경을 구성할 때의 목표 기준이다.

```text
NODE_ENV=development 또는 test
TEST_SAFE_MODE=true
DB_INIT_MODE=safe
DB_NAME=homepage_test
ACADEMY_PUBLISH_SCHEDULER_ENABLED=false
ALLOW_EXTERNAL_EMAIL_SEND=false
ALLOW_EXTERNAL_SMS_SEND=false
ALLOW_EXTERNAL_KAKAO_SEND=false
ALLOW_EXTERNAL_PUSH_SEND=false
ALLOW_EXTERNAL_PAYMENT_CALLS=false
ALLOW_E2E_DATA_MUTATION=true
```

`ALLOW_E2E_DATA_MUTATION=true`는 테스트 전용 DB에서만 허용한다.

## 테스트 DB 기준

테스트 DB는 아래 조건을 만족해야 한다.

- 운영 DB와 다른 DB
- 실제 사용자 데이터 없음
- 테스트 중 데이터 생성/수정/삭제 가능
- 필요 시 초기화 가능
- DB 이름이 테스트 전용임을 식별 가능
- 예: `homepage_test`, `homepage_e2e`, `homepage_local_test`

금지되는 DB:

- 운영 DB
- 운영 복제 DB
- 실제 사용자 데이터가 있는 개발 DB
- 백업 없는 DB
- 소유권이 불명확한 DB

## Mock/Sandbox 기준

- SMTP는 실제 발송 금지 또는 테스트 SMTP 사용
- SMS/카카오/FCM은 mock 또는 비활성화
- PortOne 결제/환불은 sandbox/mock만 허용
- 운영 결제키로 테스트 금지
- 외부 호출 허용 플래그는 기본 `false` 유지

## 업로드 테스트 기준

- 테스트 업로드 전용 경로 사용
- 운영 업로드 폴더 사용 금지
- 테스트 후 정리 가능해야 함
- 업로드 파일명 또는 경로에 `test` prefix 사용 권장
- 이미지/영상 테스트 파일은 더미 파일 사용

## 브라우저 E2E 기준

- 테스트 전용 계정 사용
- 테스트 전용 관리자 계정 사용
- 실제 회원/운영 관리자 계정 사용 금지
- 테스트 데이터 prefix 사용
- Console Error / Network Error 확인
- 모바일 viewport 확인

## 실행 전 체크리스트

- [ ] 테스트 DB가 운영 DB와 분리되어 있다.
- [ ] 테스트 DB에 실제 사용자 데이터가 없다.
- [ ] TEST_SAFE_MODE=true다.
- [ ] DB_INIT_MODE=safe다.
- [ ] 외부 이메일 발송이 차단되어 있다.
- [ ] 외부 SMS/카카오/FCM 발송이 차단되어 있다.
- [ ] 결제/환불 외부 API가 차단되어 있다.
- [ ] 스케줄러가 비활성화되어 있다.
- [ ] 업로드 테스트 경로가 테스트 전용이다.
- [ ] ALLOW_E2E_DATA_MUTATION=true는 테스트 DB에서만 설정했다.
- [ ] TEST_SAFE_MODE=true와 ALLOW_E2E_DATA_MUTATION=true 조합이 코드에서 허용되는지 확인했다.
- [ ] 테스트 완료 후 생성 데이터와 업로드 파일을 정리할 수 있다.
- [ ] 브라우저 E2E에 사용할 테스트 전용 계정이 준비되어 있다.

## 테스트 진행 가능 판정

- 모든 조건 만족: `테스트 진행해` 가능
- 테스트 DB 미확정: 비파괴 테스트만 가능
- `env.allowE2eDataMutation=false`: 전체 DB 쓰기 E2E 보류
- 외부 호출 위험: 테스트 진행 금지
- 운영 DB 위험: 테스트 진행 금지

## 테스트 전용 환경 구성 기준

### Backend .env.test

- 실제 `backend/.env.test` 파일은 Git에 올리지 않는다.
- `NODE_ENV=test`이면 백엔드는 `backend/.env.test`를 우선 읽고, 없는 값은 `backend/.env`의 기본값으로 보완한다.
- `ENV_FILE`을 사용할 경우 backend 폴더 내부 파일만 허용한다.
- production 실행에서는 임의 `ENV_FILE`에 의존하지 않는다.

필수 안전값:

```text
NODE_ENV=test
TEST_SAFE_MODE=true
DB_INIT_MODE=safe
UPLOAD_ROOT=uploads-test
ALLOW_E2E_DATA_MUTATION=false
ALLOW_EXTERNAL_EMAIL_SEND=false
ALLOW_EXTERNAL_SMS_SEND=false
ALLOW_EXTERNAL_KAKAO_SEND=false
ALLOW_EXTERNAL_PUSH_SEND=false
ALLOW_EXTERNAL_PAYMENT_CALLS=false
ACADEMY_PUBLISH_SCHEDULER_ENABLED=false
NOTIFICATION_SCHEDULER_ENABLED=false
```

### 전체 E2E 전환 조건

- 테스트 DB 이름은 `homepage_test`처럼 `test`, `e2e`, `qa` 성격이 명확해야 한다.
- `ALLOW_E2E_DATA_MUTATION=true`는 테스트 DB가 확정된 뒤에만 사용한다.
- 외부 발송, 결제, 환불, scheduler는 전체 E2E에서도 계속 차단한다.
- 업로드 테스트는 `backend/uploads-test` 또는 별도 테스트 폴더만 사용한다.

### 테스트 계정 준비 계획

- 관리자 테스트 계정
- 일반회원 테스트 계정
- 교육회원 테스트 계정
- 필라테스 회원 테스트 계정
- 수강권 보유 회원 테스트 계정
- 예약 가능 회원 테스트 계정
- 권한 없음/접근 차단 확인용 계정

비밀번호는 문서와 로그에 원문으로 기록하지 않는다.

## End of TEST_ENV_SETUP.md

## E2E 환불 테스트 데이터 기준

현재 환불 기능은 두 종류의 테이블을 사용한다.

- 교육영상/주문 환불: `refund_requests`
- 필라테스 수강권 환불: `studio_pass_refunds`

테스트 DB에는 단일 `refunds` 테이블을 만들지 않는다. `homepage_test`에서 환불 테스트를 준비할 때는 `backend/scripts/seed-e2e-test-data.js`가 `e2e_` prefix의 환불 요청만 생성/갱신해야 한다.

필수 조건:

- `NODE_ENV=test`
- `TEST_SAFE_MODE=true`
- `DB_INIT_MODE=safe`
- `DB_NAME=homepage_test`
- `DB_USER=homepage_test_user`
- `ALLOW_E2E_DATA_MUTATION=true`
- 외부 이메일, SMS, 카카오, FCM, 결제/환불 API 호출 차단

환불 seed는 실제 결제 취소나 외부 환불 API를 호출하지 않는다. 전체 E2E에서 환불 승인/거절까지 테스트하려면 PortOne은 mock 또는 sandbox로만 검증한다.

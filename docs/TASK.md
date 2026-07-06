# TASK.md

## studio_staff_profiles.user_id 보정 및 권한 API 재테스트

완료:

- `studio_staff_profiles.user_id` 컬럼과 조회 인덱스를 스키마 정의에 추가했습니다.
- `homepage_test` 테스트 DB에만 `user_id` 컬럼과 인덱스를 보정했습니다.
- E2E seed에서 스튜디오 스태프 계정과 `studio_staff_profiles.user_id` 연결을 보강했습니다.
- E2E seed 재실행 결과 테스트 계정, 영상, 수강권, 예약, 게시판/문의, 환불 기준 데이터가 준비되었습니다.
- 권한 API 재테스트 결과 비회원은 401, 일반회원은 403, 관리자는 200으로 응답했습니다.

검증:

- `node --check backend/src/shared/db/mysql.js` 통과
- `node --check backend/scripts/seed-e2e-test-data.js` 통과
- backend/frontend `npm audit` 취약점 0건
- frontend build 성공

주의:

- 이번 보정은 `homepage_test` 테스트 DB 기준으로만 확인했습니다.
- 운영 DB 반영은 별도 승인된 migration 절차로 검토해야 합니다.
- 전체 자동 테스트는 다음 프리플라이트에서 blocker 감소 여부를 다시 확인한 뒤 진행합니다.

## 현재 목표

나중에 사용자가 “테스트 진행해”라고 입력하면 Codex가 docs/WORKFLOW.md 기준으로 1단계부터 17단계까지 자동 진행할 수 있도록 한다.

## 현재 문서 구조 상태

- 문서 구조 분리 완료
- 문서 검증 완료
- 자동 테스트/수정/코드정리/리팩토링 주의사항 반영 중
- docs 폴더 중심 문서 구조 정리 완료
- 보안 강화 기준 문서 연결 중
- 다음 실행 가능 명령: 테스트 진행해

## 진행 모드

autonomous_mode: false

설명:

- false: 일반 작업에서는 단계별 보고 후 사용자 승인을 기다린다.
- true: docs/WORKFLOW.md의 완료 조건을 만족하면 다음 단계로 자동 진행한다.
- 사용자가 “테스트 진행해”라고 입력한 경우에는 이번 실행에 한해 autonomous_mode를 true로 간주한다.

## 자동 실행 명령어

아래 명령어가 입력되면 전체 자동 워크플로우를 실행한다.

- 테스트 진행해
- 전체 테스트 진행해
- 자동 테스트 진행해
- AGENTS.md 기준으로 전체 테스트 진행해

## 현재 단계

docs 문서 구조 정리 완료

## 허용된 작업

- Markdown 문서 생성
- Markdown 문서 정리
- AGENTS.md 내용 분리
- docs/WORKFLOW.md 생성/수정
- docs/PROJECT_RULES.md 생성/수정
- docs/SECURITY_HARDENING.md 생성/수정
- docs/TASK.md 생성/수정

## 금지된 작업

- 코드 수정
- DB 수정
- 환경변수 수정
- 배포 설정 수정
- 실제 데이터 삭제
- Git 커밋
- Git add
- 테스트 계정 비밀번호 노출

## 실행 전 주의사항

- 작업 시작 시 `git status --short`를 확인한다.
- 기존 git 변경사항을 보호한다.
- 작업 전부터 존재하던 변경사항과 이번 작업 변경사항을 구분한다.
- Git add/commit은 사용자 요청 없이는 금지한다.
- 즉시 중단 조건을 준수한다.
- 사용 여부가 불확실한 코드는 삭제하지 않는다.
- 삭제 여부가 애매하면 “삭제 후보”로 보고한다.
- 코드 정리와 리팩토링 후에는 빌드와 주요 기능 재테스트를 수행한다.
- 브라우저 직접 확인을 못 한 경우 확인하지 못했다고 보고한다.
- 최종 보고서에는 docs/WORKFLOW.md의 테스트 수준 판정을 포함한다.
- 테스트하지 않은 항목은 “미확인”으로 표시한다.
- “문제없음”은 확인 가능한 범위에서만 사용한다.

## 이후 “테스트 진행해” 실행 시 허용되는 작업

- 기능 테스트
- UI 테스트
- API 테스트
- DB 테스트
- 보안 테스트
- 보안 강화 검토
- 모바일 테스트
- 이미지/영상 테스트
- 배포 테스트
- 불필요한 코드 정리
- 중복 컴포넌트 공통화
- 중복 API 로직 정리
- 리팩토링
- 한글 주석 보강
- 최종 테스트
- 결과 보고
- 테스트 수준 판정 포함

## 이후 “테스트 진행해” 실행 시에도 중단해야 하는 작업

- DB 스키마 변경
- 실제 데이터 삭제
- 결제/환불 핵심 로직 변경
- 인증/권한 구조 대규모 변경
- 운영 배포 설정 변경
- 환경변수 변경
- 위험한 파일 삭제
- 사용 여부가 불확실한 코드 삭제
- 민감정보 노출 가능성이 있는 작업
- 실제 사용자 데이터에 영향을 줄 수 있는 작업
- 기능 변경 가능성이 큰 리팩토링

## 보안 강화 상태

보안 기준 문서: docs/SECURITY_HARDENING.md

“테스트 진행해” 실행 시 보안 테스트와 보안 강화 검토를 필수로 포함한다.

보안 문제가 발견되면 docs/WORKFLOW.md와 docs/SECURITY_HARDENING.md의 즉시 중단 조건을 따른다.

## 보안상 사용자 확인이 필요한 작업

- DB 스키마 변경
- 운영 DB 권한 변경
- 환경변수 변경
- 서버/nginx 운영 설정 변경
- 결제/환불 로직 변경
- 인증/권한 구조 대규모 변경
- 실제 데이터 삭제

## 최종 검증 기준

문서 생성/수정 후 반드시 아래를 확인한다.

- AGENTS.md 존재
- docs/WORKFLOW.md 존재
- docs/PROJECT_RULES.md 존재
- docs/SECURITY_HARDENING.md 존재
- docs/TASK.md 존재
- docs/QA_DEPLOY_CHECKLIST.md 유지
- README.md 유지
- Markdown 코드블록 정상 닫힘
- 테스트 계정 비밀번호 마스킹
- 코드 파일 미수정
- Git 커밋 없음
- Git add 없음
- README.md 미수정
- docs/QA_DEPLOY_CHECKLIST.md 미수정
- 작업 전 변경사항과 이번 작업 변경사항 구분 보고

## 완료 보고 형식

작업 완료 후 아래 형식으로 보고한다.

### 생성/수정한 문서

AGENTS.md:

docs/WORKFLOW.md:

docs/PROJECT_RULES.md:

docs/SECURITY_HARDENING.md:

docs/TASK.md:

### “테스트 진행해” 명령 처리 방식

자동 실행 여부:

실행 단계:

중단 조건:

코드 정리 포함 여부:

리팩토링 포함 여부:

### 코드 수정 여부

코드 수정:

DB 수정:

환경변수 수정:

배포 설정 수정:

### 민감정보 처리

테스트 계정 비밀번호 마스킹 여부:

민감정보 노출 여부:

### 다음에 사용자가 입력할 수 있는 실행 프롬프트

테스트 진행해

## 테스트 진행 전 안전 조건

`테스트 진행해` 실행 전에는 아래 조건을 먼저 확인한다.

- `TEST_SAFE_MODE=true` 사용을 권장한다.
- `ACADEMY_PUBLISH_SCHEDULER_ENABLED=false` 상태를 유지한다.
- `ALLOW_EXTERNAL_EMAIL_SEND=false` 상태를 유지한다.
- `ALLOW_EXTERNAL_SMS_SEND=false` 상태를 유지한다.
- `ALLOW_EXTERNAL_KAKAO_SEND=false` 상태를 유지한다.
- `ALLOW_EXTERNAL_PUSH_SEND=false` 상태를 유지한다.
- `ALLOW_EXTERNAL_PAYMENT_CALLS=false` 상태를 유지한다.
- 테스트 전용 DB가 확인되지 않으면 DB 변경 E2E 테스트를 진행하지 않는다.
- DB 변경 E2E 테스트는 `ALLOW_E2E_DATA_MUTATION=true`가 명시된 경우에만 진행한다.
- 운영 DB, 운영 SMTP, 운영 SMS/카카오/FCM, 운영 결제/환불 키가 사용될 가능성이 있으면 즉시 중단하고 보고한다.

최종 보고서에는 테스트 안전 모드 사용 여부와 미확인 항목을 반드시 포함한다.

## 전체 테스트 실행 전 남은 조건

현재 전체 자동 E2E 테스트를 진행하려면 아래 조건이 추가로 필요하다.

- 테스트 전용 DB 확정
- `backend/.env.test.example`을 기준으로 실제 `backend/.env.test` 또는 로컬 테스트 환경 구성
- `frontend/.env.test.example`을 기준으로 테스트용 프론트 환경 구성
- `TEST_SAFE_MODE=true`
- 외부 발송/결제 차단
- 업로드 테스트 경로 확정
- `ALLOW_E2E_DATA_MUTATION=true`는 테스트 DB에서만 허용
- `TEST_SAFE_MODE=true`와 `ALLOW_E2E_DATA_MUTATION=true` 조합이 코드에서 DB 쓰기 E2E를 허용하도록 정책 정합성 확보

현재 판정:

- 테스트 DB 미확정 상태이므로 전체 자동 E2E 테스트는 아직 보류한다.
- 비파괴 테스트는 가능하다.
- 현재 백엔드 구현은 `TEST_SAFE_MODE=true`와 `ALLOW_E2E_DATA_MUTATION=true`를 분리해 판정한다. `ALLOW_E2E_DATA_MUTATION=true`는 production이 아니고 DB 이름이 test/e2e/qa 성격으로 확인될 때만 유효하다.
- 테스트 전용 DB와 mock/sandbox 환경, 코드 정책 정합성이 확정되면 전체 테스트 실행 가능 여부를 다시 판단한다.

## 테스트 모드 정책

비파괴 테스트 모드:

- `TEST_SAFE_MODE=true`
- `ALLOW_E2E_DATA_MUTATION=false`
- DB 쓰기 금지
- 외부 호출 금지
- 비파괴 테스트만 가능

전체 E2E 테스트 모드:

- `TEST_SAFE_MODE=true`
- `ALLOW_E2E_DATA_MUTATION=true`
- 테스트 전용 DB에서만 허용
- 외부 발송/결제/스케줄러는 계속 차단
- DB 쓰기 테스트 가능
- 운영 DB에서는 절대 금지

## 현재 E2E 안전장치 상태

해결된 항목:

- `TEST_SAFE_MODE=true`와 `ALLOW_E2E_DATA_MUTATION=true` 정책 충돌을 코드에서 분리했다.
- `TEST_SAFE_MODE=true`는 외부 발송, 결제/환불 외부 호출, 스케줄러 차단 용도로 유지한다.
- `ALLOW_E2E_DATA_MUTATION=true`는 production이 아니고 DB 이름이 test/e2e/qa 성격으로 확인될 때만 유효하다.

남은 Blocker:

- 테스트 전용 DB 실제 구성 확인 필요
- 업로드 테스트 전용 경로 확인 필요
- 브라우저 E2E 실행 환경 확인 필요
- `allowE2eDataMutation`은 현재 전체 E2E 전 환경 정책 판정값이며, 개별 CRUD API 강제 차단 가드는 별도 작업으로 검토한다.

## 현재 테스트 환경 준비 상태

완료된 준비:

- 백엔드가 `NODE_ENV=test`에서 `backend/.env.test`를 우선 읽을 수 있도록 구성한다.
- 업로드 물리 저장 경로를 `UPLOAD_ROOT`로 분리한다.
- 테스트 예시 환경 파일에 `UPLOAD_ROOT=uploads-test`를 명시한다.
- Playwright 기본 설정과 비파괴 smoke 테스트 skeleton을 둔다.
- 서버 자동 시작 없이 base URL 기반으로 브라우저 테스트를 실행하도록 한다.

아직 사용자가 준비해야 할 항목:

- 실제 `backend/.env.test` 작성
- 실제 `frontend/.env.test` 작성
- `homepage_test` 같은 테스트 전용 DB 생성 및 권한 확인
- 테스트 계정 seed 또는 수동 생성
- 업로드 테스트 폴더 정리 정책 확정

현재 판단:

- 테스트 DB가 확정되기 전에는 전체 자동 E2E를 실행하지 않는다.
- 비파괴 정적 분석, 문법 검사, 빌드 검증은 가능하다.

## 테스트 DB 스키마 bootstrap 상태

완료된 항목:

- `homepage_test` 테스트 DB 연결 확인 완료
- 테스트 DB 스키마 bootstrap 완료
- bootstrap 후 테스트 DB 테이블 69개 확인
- bootstrap 중 금지된 쓰기 SQL 실제 실행 없음
- bootstrap 중 앱 테이블 데이터 직접 조회 없음

남은 항목:

- 테스트 계정 seed 준비 필요
- 테스트 계정 seed 후 프리플라이트 재점검 필요
- 전체 자동 E2E 테스트는 테스트 계정 seed와 안전 재점검 전까지 보류

## E2E seed 준비 상태

완료된 항목:

- `backend/scripts/seed-e2e-test-data.js` 준비 완료
- seed 스크립트 문법 검사 완료
- seed 스크립트에 테스트 DB 전용 안전장치 적용

보류된 항목:

- `backend/.env.test`에 `E2E_TEST_PASSWORD`가 없어 seed 실행 전 중단됨
- 테스트 계정과 E2E 최소 데이터는 아직 생성되지 않음

다음 작업:

- 사용자가 `backend/.env.test`에 `E2E_TEST_PASSWORD`를 직접 추가
- seed 재실행
- seed 성공 후 프리플라이트 재점검

## End of TASK.md

## E2E seed 재실행 결과

상태:

- `E2E_TEST_PASSWORD` 존재 확인 완료
- E2E seed 실행 시도 완료
- E2E seed 실패
- 테스트 계정/테스트 데이터 준비 완료로 표시하지 않음

실패 원인:

- `events.image` 컬럼이 NULL을 허용하지 않아 seed transaction이 실패함
- seed 스크립트는 실패 시 rollback을 수행하도록 구성되어 있음

다음 단계:

- `backend/scripts/seed-e2e-test-data.js`에서 E2E 이벤트의 테스트 이미지 경로를 NULL이 아닌 `e2e_`/`test_e2e_` 성격의 더미 경로로 수정 필요
- 수정 후 node --check 및 seed 재실행 필요
- seed 성공 전까지 전체 E2E 테스트는 보류
## E2E seed 보정 및 재실행 완료

상태:

- E2E_TEST_PASSWORD 확인 완료
- E2E seed 스크립트 보정 완료
- E2E seed 재실행 성공
- 테스트 계정 및 최소 테스트 데이터 준비 완료
- 전체 테스트는 프리플라이트 통과 전까지 보류

보정 내용:

- `events.image` 필수 컬럼에 테스트용 placeholder 경로를 저장하도록 수정
- 이벤트 upsert 시 image 값도 함께 갱신하도록 수정
- 실제 파일 업로드나 외부 URL 사용 없이 테스트 경로 문자열만 사용

생성/갱신된 테스트 데이터:

- 테스트 계정
- 교육 영상 및 접근 권한
- 스튜디오 수강권, 수업, 예약
- 후기, 이벤트, 문의, 문의 답변
- 테스트 주문 데이터

다음 단계:

- 프리플라이트 재실행
- 브라우저 E2E 환경 확인
- 제한된 E2E 실행 여부 판단
## 업로드 placeholder 경로 보정 및 제한된 E2E 준비 상태

상태:

- E2E 이벤트 seed 이미지 URL을 서버 정적 prefix에 맞게 `/uploads/e2e/event-placeholder.png`로 보정했다.
- 테스트 전용 물리 파일을 `backend/uploads-test/e2e/event-placeholder.png`에 준비했다.
- `backend/uploads-test/`는 Git 추적 제외 상태를 유지한다.
- `frontend/e2e/README.md`의 깨진 한글 문서를 UTF-8 기준 안내 문서로 정리했다.
- 보정된 placeholder 경로로 E2E seed를 재실행했고 `homepage_test` 기준 테스트 데이터 준비를 다시 확인했다.
- 다음 단계는 프리플라이트 재실행 후 제한된 브라우저 E2E 실행 여부를 판단하는 것이다.

주의:

- 전체 E2E는 테스트 DB, 테스트 업로드 경로, 외부 발송/결제 차단 상태가 다시 확인되기 전까지 보류한다.
- 운영 DB, 운영 업로드 경로, 외부 발송/결제 API를 사용하지 않는다.
## 환불 기준 보정 및 E2E seed 보강 상태

완료:

- 현재 코드의 환불 기준 테이블을 `refund_requests`, `studio_pass_refunds`로 정리했다.
- 단일 `refunds` 테이블은 현재 코드 기준 필수 테이블이 아님을 문서화했다.
- `backend/scripts/seed-e2e-test-data.js`에 교육영상/주문 환불 seed를 추가했다.
- `backend/scripts/seed-e2e-test-data.js`에 필라테스 수강권 환불 seed를 추가했다.
- `homepage_test` 테스트 DB에 E2E prefix 환불 데이터 seed를 성공했다.

seed 결과:

- 교육영상/주문 환불 요청: `refund_requests` 기준 준비 완료
- 필라테스 수강권 환불 요청: `studio_pass_refunds` 기준 준비 완료
- 실제 결제/환불 외부 API 호출 없음
- 운영 DB 접속 없음

다음 단계:

- 프리플라이트를 재실행해 전체 테스트 blocker가 줄었는지 확인한다.
- 전체 E2E 전에는 외부 발송/결제 차단 상태와 Playwright 실행 방식을 다시 확인한다.

# E2E 테스트 안내

## 목적

이 폴더는 전체 자동 E2E 테스트를 준비하기 위한 Playwright 기반 테스트 영역입니다. 현재는 화면 진입과 기본 렌더링을 확인하는 smoke 테스트를 우선 제공합니다.

## 실행 전 조건

- 테스트 전용 DB만 사용합니다.
- backend는 `NODE_ENV=test`, `TEST_SAFE_MODE=true`, `DB_INIT_MODE=safe`, `UPLOAD_ROOT=uploads-test` 기준으로 실행합니다.
- `ALLOW_E2E_DATA_MUTATION=true`는 `homepage_test` 같은 테스트 전용 DB에서만 사용합니다.
- 이메일, SMS, 카카오, FCM, 결제, 환불 외부 호출은 모두 차단한 상태여야 합니다.
- 서버는 사용자가 테스트 환경으로 직접 실행합니다. 이 테스트 문서는 서버를 자동으로 시작하지 않습니다.
- 운영 DB, 운영 계정, 운영 업로드 폴더로 E2E를 실행하지 않습니다.

## 현재 포함된 테스트

- `smoke.spec.js`: base URL에 접속해 페이지가 기본 렌더링되는지 확인합니다.
- `native-app.spec.js`: 앱 shell, 회원용 하단 내비게이션, 웹 구매 안내, 가로 넘침, Console/Network 오류를 확인합니다.
- 데스크톱, 태블릿, 모바일 viewport 기준으로 실행할 수 있는 구조를 준비합니다.

## 앱 E2E 실행

앱 미리보기 서버를 먼저 실행한 뒤 별도 터미널에서 테스트합니다.

```bash
cd frontend
npm run dev:app

# 별도 터미널
set PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174
npm run test:e2e:app
```

PowerShell에서는 `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5174'` 형식을 사용합니다. 이 테스트는 API를 mock하며 실제 DB, 파일 업로드, 외부 푸시 또는 결제를 호출하지 않습니다.

## 아직 추가해야 할 테스트

- 로그인/로그아웃
- 관리자 권한 접근
- 일반회원 권한 접근
- 교육영상 조회/재생
- 필라테스 예약 조회/예약/취소
- 이미지/영상 업로드
- 결제/환불 mock 플로우
- 관리자 CRUD 주요 플로우

## 주의사항

- 실제 운영 데이터로 테스트하지 않습니다.
- 실제 결제, 문자, 메일, 푸시 발송을 실행하지 않습니다.
- 업로드 테스트는 `backend/uploads-test` 같은 테스트 전용 경로에서만 수행합니다.
- 실패한 테스트가 데이터 변경을 남기지 않도록 테스트 데이터 prefix를 사용합니다.

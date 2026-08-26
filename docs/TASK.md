# TASK.md

## 3차 작업: 개발 DB 검증과 잔여 정리 (2026-08-26)

개발 DB 터널을 열어 그동안 미확인으로 남아 있던 항목을 확인했습니다.

확인한 것:

- 연결 전 안전 확인에서 `productionDatabaseAccessDenied: true` 를 받았습니다. 개발 DB 계정은 운영 DB에 접근할 수 없습니다.
- 관리자 설정 라우트 27개가 실제 DB 연결 상태에서 모두 401을 반환했습니다. 500이나 404는 없습니다.
- 서비스 계층의 SQL 8종이 실제 스키마에서 정상 동작합니다. `studio_info` 의 사용 여부 컬럼들도 실제로 존재합니다.
- 삭제 후보 이미지 3개가 DB 어디에서도 참조되지 않는 것을 확인했습니다. 텍스트 컬럼 341개, 테이블 69개를 전수 검사했습니다.
- 자동 알림 스케줄러가 배선된 상태로 기동되며 `disabled by safety settings` 로 안전하게 꺼져 있는 것을 확인했습니다.

정리한 것:

- 미참조 이미지 3개를 삭제했습니다. 웹 배포물이 9.7MB에서 5.3MB로 줄었습니다.
- 이미지 무결성 테스트의 검사 범위를 저장소에 함께 배포되는 자산으로 한정했습니다. 사용자 업로드는 실행 환경에 따라 있을 수도 없을 수도 있어 오탐을 냈습니다.

권한 검증 완료 (2026-08-26):

- 개발 DB에 개발 전용 관리자·일반회원 계정을 만들고 실제 HTTP 로그인 상태로 확인했습니다.
- 비로그인 401, 일반회원 403, 관리자 200 이 각각 8/8 일치했습니다.
- 관리자 응답의 키가 프론트엔드 기대와 일치하는 것도 확인했습니다.
- 계정은 `npm run db:seed:dev:accounts` 로 만들며 고정된 두 계정만 갱신합니다. 기존 회원 데이터는 건드리지 않습니다.

여전히 미확인:

- 쓰기 동작의 실제 결과. 공유 개발 DB 데이터를 바꾸지 않기 위해 읽기만 확인했습니다.
- 로컬에서 실행할 때 `/uploads/` 이미지가 404가 납니다. 업로드 파일이 개발 서버에 있고 로컬 폴더는 비어 있기 때문이며, 코드 문제가 아닙니다.

확인이 필요한 데이터 문제:

- 개발 DB의 기구 소개 페이지 override 한 건이 존재하지 않는 업로드 파일을 가리킵니다.
  (`/uploads/community/images/1783304716587-...jpg`) 개발 서버에 그 파일이 있는지 확인이 필요합니다.
- 홈 화면은 override 이미지가 없을 때 깨진 이미지를 그대로 노출합니다. 기구 소개 화면은 대체 처리가 되어 있습니다. 홈에도 같은 대체 처리를 넣을지 검토가 필요합니다.


## 2차 작업: 취약점, 브라우저 검증, 기능 추가 (2026-08-25)

의존성 (승인 후 진행):

- react-router / react-router-dom 6.30.4 → 7.18.2. Open redirect → XSS 취약점 2건 해소.
  - 이 저장소는 선언형 API만 쓰고 데이터 라우터 API(`createBrowserRouter`, loader, `json()`, `defer()`)를 쓰지 않아 파괴적 변경 노출이 적었다. splat 라우트는 최상위 `path="*"` 하나뿐이고 절대경로다.
  - 초기 번들 gzip 73.8 → 78.0 kB (+4.2 kB).
- body-parser 1.20.5 → 1.20.6. express 4.22.2가 `~1.20.5`를 요구하므로 express 변경 없이 적용됐다.
- 결과: frontend·backend 모두 `npm audit` production 0건, backend는 dev 포함 0건.
- frontend의 dev 전용 취약점 4건(tar, postcss, nanoid, brace-expansion)은 `@capacitor/cli`와 `vite`의 전이 의존성이며 이번 변경 전에도 lockfile에 있었다. 빌드 도구라 사용자에게 배포되지 않는다.

브라우저 검증 (Level 2 → 부분 Level 4):

- Playwright로 실제 렌더링을 확인했다. 백엔드 없이 정적 빌드 기준이다.
- 추가한 테스트: `e2e/public-image-assets.spec.js`(이미지 무결성), `e2e/native-bottom-padding.spec.js`(앱 하단 여백 회귀), `e2e/routing-regression.spec.js`(라우팅 회귀).
- 결과: 이미지 무결성 데스크톱·모바일 10/10, 라우팅 8/8, 앱 모드 기존 스펙 포함 30/30, backend 단위 테스트 91/91.
- `e2e/smoke.spec.js` 6건 실패는 백엔드 미기동 때문이다. 실패한 요청 12건이 전부 `/api/`·`/uploads/`이고 그 외 0건임을 확인했다.

기능 추가:

- 업로드 이미지 자동 최적화 (`backend/src/shared/media/image-optimizer.js`). 커뮤니티·공지·아카데미 업로드에 적용. 실제 원본 기준 12.30MB → 0.12MB. 규칙은 `docs/PROJECT_RULES.md`.
- 이미지 지연 로딩. img 28개 중 26개에 `loading="lazy" decoding="async"` 적용, 히어로 2개는 `fetchpriority="high"` 유지·추가.
- Android App Link. `cap:sync:prod`가 `autoVerify` intent-filter를 넣고 `cap:sync:dev`가 제거한다. `npm run assetlinks`로 검증 파일 생성. 절차는 `docs/development/mobile-app-setup.md`.

확인 결과 구현이 필요 없던 항목:

- **수업 리마인더 푸시는 이미 전 구간 구현되어 있다.** `class_reminder` 템플릿, `notification-automation.service.js`, `notification.scheduler.js`, `fcm.service.js`, 디스패치, 통합 테스트가 모두 존재한다. 막고 있는 것은 코드가 아니라 `NOTIFICATION_SCHEDULER_ENABLED=false`, `ALLOW_EXTERNAL_PUSH_SEND=false`, 빈 FCM 자격증명, `google-services.json` 부재다.

미확인 (환경 문제로 진행하지 못함):

- **Level 3 API/DB 검증 보류.** 개발 DB SSM 터널의 로컬 포트 13306을 다른 프로젝트(WeeklyReportAutomation)의 로컬 MySQL 8.4.10이 점유해 터널이 열리지 않는다. 터널 스크립트는 운영으로 향하는 터널을 막기 위해 13306을 강제하므로 포트를 바꾸지 않았다.
- 그 결과 관리자 라우트 27개의 실응답과 권한별 200/403, 삭제 후보 이미지의 DB 참조 확인이 여전히 미확인이다.
- 이 충돌로 ICL 개발 백엔드가 무관한 로컬 MySQL에 접속을 시도했고, `db:check:dev:isolation`이 인증 거부로 막았다. 격리 검사가 의도대로 동작한 사례다.


## 웹/AAB 실사용 점검과 후속 작업 (2026-08-24)

검증한 것:

- 웹 프로덕션 빌드 성공.
- `cap:sync:prod` 성공. cleartext 제거와 운영 API(`https://icl-pilates.com/api`) 번들 반영 확인.
- **Android 릴리스 AAB 빌드 성공.** 기존 "JDK 미설치로 미확인" 판정을 갱신합니다. 이 PC에 JDK 21, Android SDK platform 36, build-tools 36이 설치되어 있습니다.
- 네이티브 폴더를 순정 상태로 되돌린 뒤 `configure-native.mjs`만으로 버전·서명 설정이 복원되고, 주입한 `versionName`이 병합된 매니페스트까지 반영되는 것을 확인했습니다.
- 일회용 테스트 키로 서명 경로 전 구간(서명 주입 → 서명된 AAB → 프리플라이트 검출)을 확인한 뒤 키와 설정을 삭제했습니다.

수정한 것:

- 사용자 노출 이미지 20장을 webp로 변환했습니다. 35.06MB → 1.54MB(95.6% 감소). 원본은 `frontend/_original-assets/`에 보존합니다. 릴리스 AAB는 44.6MB → 11.8MB로 줄었습니다.
- 네이티브 앱 버전·서명 원본을 `frontend/app-version.json`과 `frontend/keystore.properties`로 옮기고, `cap:sync` 때마다 재주입하도록 했습니다. 이전에는 gitignore된 `android/`에만 있어 재생성하면 사라졌습니다.
- `cap:check`를 실제 프리플라이트로 다시 만들었습니다. 미서명 AAB, 버전 형식, keystore 누락을 잡습니다.
- 이용약관·개인정보 전문을 `/terms`, `/privacy` 고정 URL로 열 수 있게 하고 푸터에 링크를 넣었습니다. 이전에는 회원가입 모달 안에만 있었습니다.
- 앱에서 하단 탐색이 숨는 화면(영상 플레이어·관리자·회원가입)의 하단 72px 유령 여백을 해제했습니다.
- 관리자 설정 라우트 27개를 등록했습니다. 컨트롤러·서비스는 이미 구현되어 있었고 등록만 빠져 있었습니다. 자세한 내용은 `docs/audits/known-limitations.md`.

미확인 (반드시 남은 검증):

- 브라우저 직접 실행, Console/Network 에러 확인을 하지 못했습니다.
- 관리자 설정 API의 DB 연결 응답과 권한별 200/403 동작은 미확인입니다. 라우터 스모크 테스트로 401 도달까지만 확인했습니다.
- webp 교체 후 실제 화면(강사소개·수업소개·수료증 인쇄)을 눈으로 확인하지 못했습니다.
- 실기기 검증, 실제 푸시, 스토어 심사는 여전히 외부 자산이 필요합니다.

남은 외부 차단 요소:

- `google-services.json` / `GoogleService-Info.plist` 없음 → 앱 푸시 미작동.
- 릴리스 keystore 미생성 → AAB 미서명. 생성 절차는 `docs/development/mobile-app-setup.md`.

삭제 후보 (사용 여부가 불확실해 삭제하지 않음):

- `frontend/public/assets/images/intro/수업소개 메인 이미지.png` — `intro-main.png`와 sha1 동일한 중복본, 코드 참조 0건.
- `frontend/public/assets/images/home/certificate-template-clean.png` — 코드 참조 0건.
- `frontend/public/assets/images/home/이끌림 수료증 최종.png` — 코드 참조 0건.

세 파일 합계 약 4.5MB입니다. DB에 저장된 페이지 override가 참조할 가능성이 있어 확인 후 삭제해야 합니다.

## 웹·Android·iOS 공통 코드 전환 상태

완료:

- 기존 React 웹 코드를 Capacitor 8 Android/iOS 앱으로 동기화할 수 있는 구조를 구성했습니다.
- 앱 전용 상단바, 하단 내비게이션, safe area, 오프라인 안내, Android back, 딥링크 처리를 추가했습니다.
- 앱에서는 구매한 교육영상 시청과 필라테스 예약을 유지하고 신규 디지털 영상 구매·장바구니는 웹 이용 안내로 전환했습니다.
- HttpOnly 세션 쿠키, 절대 API 주소, 업로드 URL 변환, Capacitor CORS origin을 앱 환경에 맞게 보강했습니다.
- Firebase Messaging 토큰 등록/해제와 마이페이지 푸시 설정 UI를 연결했습니다.
- 앱 build, Capacitor sync, desktop/mobile 375/tablet 768 Playwright E2E를 검증했습니다.

외부 준비 필요:

- Android `google-services.json`, iOS `GoogleService-Info.plist`, APNs 설정
- Android JDK/SDK와 release keystore
- macOS/Xcode, Apple 인증서와 Provisioning Profile
- 실제 Android/iPhone에서 푸시, 세션, 예약, 영상 재생 검증
- 앱 아이콘, 스플래시, 스토어 스크린샷과 등록 문구

현재 판정:

- 웹 및 앱용 React 번들: 검증 완료
- Capacitor Android/iOS 프로젝트 동기화: 검증 완료
- Android 네이티브 compile: 현재 PC의 JDK 미설치로 미확인
- iOS archive/TestFlight: Windows 환경이므로 미확인
- 실제 FCM Push와 스토어 심사: 네이티브 키·계정 준비 전까지 미확인

상세 절차는 `docs/development/mobile-app-setup.md`를 따릅니다.

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

## origin/merge push 이후 main 병합 전 상태

현재 상태:

- `origin/merge` push 완료
- 로컬 `merge`와 `origin/merge` 동기화 완료
- `main` push 및 `main` merge는 아직 진행하지 않음
- 운영 배포는 진행하지 않음
- 전체 테스트는 `homepage_test` 테스트 전용 환경 기준으로 통과
- `main` 브랜치 반영은 GitHub Actions 자동 배포를 트리거할 수 있음
- 따라서 `main` merge는 운영 배포 승인으로 간주해야 함

main merge 전 필수 확인:

- 운영 `.env` 검토
- 운영 DB migration 필요 여부 확인
- `studio_staff_profiles.user_id` 운영 DB 반영 여부 확인
- nginx `/api` 프록시 확인
- nginx `/uploads` 정적 서빙 또는 프록시 확인
- PM2 restart/reload 방식 확인
- GitHub Actions deploy workflow 확인
- 실제 운영 `UPLOAD_ROOT` 확인
- Email/SMS/Kakao/FCM/Payment allow flag 운영 설정 확인
- scheduler 운영 정책 확인
- 결제/환불 sandbox 또는 제한 검증
- 배포 후 smoke test 계획
- rollback 계획

권장 다음 단계:

- GitHub에서 `merge` -> `main` Draft PR 생성
- PR 설명에 테스트 환경, 테스트 수준, 미확인 항목, 운영 배포 주의사항 명시
- 운영 배포 담당자 승인 전 main merge 금지

## PR 제목 추천

Preferred:

- `chore: prepare integrated studio/admin update for staging review`

Alternatives:

- `feat: integrate studio, admin, security, and E2E test updates`
- `chore: prepare merge branch changes for deployment review`

## PR 본문 초안

```md
## Summary

This PR prepares the integrated homepage, academy, admin, studio management, security hardening, and E2E test environment updates for review.

Key areas included:

- AI workflow and QA documentation reorganization
- Safe test environment and Playwright E2E scaffolding
- Backend startup safety guards
- External side effect guards for email, SMS, Kakao, FCM, and PortOne calls
- Studio management and admin safety fixes
- Test DB bootstrap and E2E seed scripts
- Frontend auth guard cleanup, SEO text cleanup, and missing asset fallback

## Deployment Trigger Warning

Merging this PR into `main` may trigger GitHub Actions deployment.

Do not merge into `main` until production deployment readiness is confirmed.

Before merge, confirm:

- Production `.env` values
- Production DB migration requirements
- `studio_staff_profiles.user_id` production DB migration status
- nginx `/api` proxy
- nginx `/uploads` static serving or proxy
- PM2 restart/reload process
- GitHub Actions deploy workflow behavior
- Production `UPLOAD_ROOT`
- Email/SMS/Kakao/FCM/Payment allow flags
- Scheduler production policy
- Payment/refund sandbox or limited production verification
- Post-deploy smoke test plan
- Rollback plan

## Test Environment Validation

Validated using test-only environment:

- DB: `homepage_test`
- `NODE_ENV=test`
- `TEST_SAFE_MODE=true`
- `DB_INIT_MODE=safe`
- `ALLOW_E2E_DATA_MUTATION=true`
- `UPLOAD_ROOT=uploads-test`
- External Email/SMS/Kakao/FCM/Payment calls blocked
- Scheduler disabled

No production DB, production API, production URL, production upload folder, or production external service call was used during E2E validation.

## Test Results

Completed:

- Level 1 static analysis
- Level 2 build/execution verification
- Level 3 API/DB validation on `homepage_test`
- Level 4 browser E2E validation with Playwright

Not completed:

- Level 5 staging/production deployment verification
- Level 6 operational stability verification
- Real payment/refund production verification
- Real external notification delivery verification
- Production mobile device validation
- Load testing

## Important Notes

- `main` merge should be treated as production deployment approval.
- This PR should preferably be opened as a Draft PR first.
- Do not merge until production environment checks are complete.
- Actual `.env`, upload files, DB dumps, logs, secrets, keys, and tokens must not be included.

## DB / Migration Notice

The test DB was patched for:

- `studio_staff_profiles.user_id`

Before production deployment, confirm whether production DB requires the same schema migration.

Do not rely on startup auto-migration for production schema changes.

## Risk

Medium to High until production deployment checks are completed, because this branch contains backend safety guards, studio/admin updates, E2E scaffolding, and deployment-relevant documentation.

## Deployment Recommendation

1. Open Draft PR from `merge` to `main`.
2. Review changed files and deployment workflow.
3. Verify production env, DB migration, nginx, PM2, uploads, scheduler, external integrations, and rollback.
4. Run staging or controlled deployment smoke test if possible.
5. Merge only after explicit production deployment approval.
```

## Files changed 리뷰 체크리스트

우선 검토 파일:

- `.github/workflows/deploy.yml`
- `deploy/nginx-prod.conf`
- `frontend/nginx.conf`
- `backend/src/config/env.js`
- `backend/src/shared/db/mysql.js`
- `backend/src/server.js`
- `backend/src/app.js`
- `backend/src/features/payments/payments.service.js`
- `backend/src/shared/email/email.service.js`
- `backend/src/features/sms/*`
- `backend/src/features/studio/*`
- `backend/scripts/bootstrap-test-db.js`
- `backend/scripts/seed-e2e-test-data.js`
- `docs/QA_DEPLOY_CHECKLIST.md`
- `.gitignore`
- `.env.example / .env.test.example`

리뷰 포인트:

- 실제 secret 포함 여부
- 운영 URL 하드코딩 여부
- 운영 DB 자동 변경 가능성
- 외부 발송/결제 실제 호출 가능성
- main merge 자동 배포 트리거 여부
- uploads 운영 경로 영향
- scheduler 운영 영향
- nginx `/api`와 `/uploads`
- PM2 restart/reload 방식

## 운영 배포 전 B blocker 보완 상태

확인된 blocker:

- GitHub Actions deploy job이 `main` 배포 때마다 `deploy/seed-overrides.sql`을 운영 DB에 자동 적용할 수 있었음.
- `deploy/seed-overrides.sql`은 `admin_page_overrides`, `events` 테이블에 `INSERT IGNORE`를 수행하며, MySQL conditional comment 형태의 `ALTER TABLE ... DISABLE/ENABLE KEYS`와 `LOCK TABLES WRITE`를 포함한다.
- 따라서 운영 배포마다 자동 실행되면 페이지 편집 override와 이벤트 데이터가 의도치 않게 운영 DB에 반영될 수 있다.

보완 완료:

- `.github/workflows/deploy.yml`에서 `deploy/seed-overrides.sql` 자동 실행을 기본 차단했다.
- 운영 `.env`에 `APPLY_DEPLOY_SEED_OVERRIDES=true`가 명시되어 있고 SQL 파일이 존재할 때만 seed override가 실행된다.
- 명시적 seed 실행 시 실패를 숨기지 않고 배포 로그에서 실패가 드러나도록 처리한다.

운영 env 필수 확인:

- `NODE_ENV=production`
- `DB_INIT_MODE=safe`
- `TEST_SAFE_MODE` 운영 정책 확인
- `ALLOW_E2E_DATA_MUTATION=false` 또는 미설정
- `UPLOAD_ROOT`가 운영 업로드 경로와 일치
- `CORS_ORIGIN`이 운영 도메인으로 제한
- `JWT_SECRET`, `PII_ENCRYPTION_KEY`, `ACADEMY_PLAYBACK_TOKEN_SECRET` 등 secret이 운영 서버에만 설정
- `APPLY_DEPLOY_SEED_OVERRIDES`는 기본 미설정 또는 `false`

외부 부작용 운영 정책:

- 최초 운영 배포 전에는 이메일, SMS, 카카오, FCM, PortOne 결제/환불 allow flag를 기본 차단으로 두고 smoke test 후 필요한 항목만 승인한다.
- `ACADEMY_PUBLISH_SCHEDULER_ENABLED`, `NOTIFICATION_SCHEDULER_ENABLED`도 최초 배포 전 기본 차단 후 수동 검증을 거쳐 활성화한다.

아직 남은 확인:

- 운영 서버에서 `sudo nginx -t` 확인
- 운영 서버에서 `pm2 list` 및 backend 프로세스 상태 확인
- 운영 `/api` proxy 확인
- 운영 `/uploads` 정적 경로 확인
- 운영 외부 발송/결제/scheduler 활성화 여부 최종 승인

현재 main merge 판단:

- seed override 자동 적용 blocker는 보완됨.
- 운영 서버 nginx/PM2/uploads와 운영 env allow flag 최종 확인 전까지 main merge는 아직 보류한다.

# ICL Pilates HOMEPAGE

이끌림 필라테스의 홈페이지, 교육영상, 관리자, 스튜디오 예약 관리 기능을 함께 제공하는 통합 웹 서비스입니다.

## 주요 기능

- 브랜드 홈페이지와 소개 페이지
- 회원가입, 로그인, 마이페이지
- 교육영상 목록, 구매, 재생, 진도 관리
- 관리자 교육영상 등록, 수정, 삭제
- 주문, 결제, 환불, 포인트 관리
- 이벤트, 후기, 문의 게시판
- 필라테스 스튜디오 일정, 예약, 수강권, 강사, 회원, 매출 관리
- SMS, 카카오 알림톡, 앱 푸시 연동 준비 구조

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React 18, Vite, React Router |
| Backend | Node.js, Express |
| Database | MySQL |
| 결제 | PortOne V2 |
| 영상/이미지 | 서버 업로드, 보안 재생 링크 |
| 배포 | EC2, nginx, PM2 |
| 모바일 앱 | Capacitor 8, Android, iOS, Firebase Messaging |

## 디렉터리 구조

```text
HomePage/
├── AGENTS.md
├── README.md
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/
│   │   ├── features/
│   │   │   ├── academy/
│   │   │   ├── admin/
│   │   │   ├── auth/
│   │   │   ├── brand/
│   │   │   ├── cart/
│   │   │   ├── community/
│   │   │   ├── orders/
│   │   │   ├── payments/
│   │   │   ├── products/
│   │   │   ├── refunds/
│   │   │   ├── sms/
│   │   │   ├── studio/
│   │   │   └── users/
│   │   └── shared/
│   └── test/
├── deploy/
├── docs/
│   ├── README.md
│   ├── WORKFLOW.md
│   ├── PROJECT_RULES.md
│   ├── SECURITY_HARDENING.md
│   ├── TASK.md
│   ├── QA_DEPLOY_CHECKLIST.md
│   ├── architecture/
│   ├── development/
│   ├── deployment/
│   ├── integrations/
│   ├── operations/
│   ├── ui-ux/
│   └── audits/
└── frontend/
    ├── src/
    │   ├── app/
    │   ├── features/
    │   │   ├── academy/
    │   │   ├── admin/
    │   │   ├── auth/
    │   │   ├── brand/
    │   │   ├── cart/
    │   │   ├── community/
    │   │   ├── home/
    │   │   ├── mypage/
    │   │   ├── payment/
    │   │   └── studio/
    │   └── shared/
    └── public/
```

## 로컬 실행

### 1. 백엔드

```bash
cd backend
npm install
npm run db:provision:dev:local
npm run db:check:dev:isolation
npm run env:check:dev
npm run dev
```

개발 API 주소는 `http://localhost:4001`이며 `homepage_dev` 전용 DB만 사용합니다. 운영 API는 기본 `4000`이고 운영 DB와 개발 DB를 혼용하지 않습니다.

### 2. 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

기본 프론트엔드 주소는 `http://localhost:5173`입니다.

### 3. Android/iOS 앱

웹과 앱은 동일한 React 기능 코드와 Express API를 사용합니다. 앱용 화면 미리보기와 네이티브 동기화는 다음 명령으로 실행합니다.

```bash
cd frontend
npm run dev:app
npm run build:app:dev
npm run cap:sync:dev
npm run android:reverse:dev
npm run cap:check
```

실기기 푸시, Android 서명, iOS 인증서와 스토어 제출 준비는 [모바일 앱 구성 및 릴리스 가이드](docs/development/mobile-app-setup.md)를 따릅니다. 환경별 API·DB 구조는 [개발·테스트·운영 환경 분리](docs/architecture/environment-separation.md)를 먼저 확인합니다.

## 테스트

### 백엔드 테스트

```bash
cd backend
npm run check
```

### 프론트엔드 빌드

```bash
cd frontend
npm run build
```

### 배포 전 최소 검증 순서

```bash
cd backend
npm run check

cd ../frontend
npm run build
```

추가로 서버가 켜진 상태에서는 `/api/health`, `/uploads` 정적 경로, 주요 관리자/사용자 화면을 브라우저에서 직접 확인합니다.

## 환경변수

운영 환경에서는 `backend/.env.example`을 기준으로 필요한 값을 설정합니다.

중요한 환경변수:

- DB 접속 정보
- PortOne 결제 키
- PII 암호화 키
- 교육영상 재생 토큰 키
- SMTP 메일 설정
- Aligo SMS 설정
- 카카오 알림톡 설정
- FCM 앱 푸시 설정
- CORS 허용 도메인

비밀번호, API 키, 토큰은 코드나 문서에 원문으로 기록하지 않습니다.

## 작업 문서

- `docs/README.md`: 목적별 문서 목록과 권장 읽기 순서
- `AGENTS.md`: Codex와 Claude Code가 따라야 하는 프로젝트 작업 지침
- `docs/WORKFLOW.md`: `테스트 진행해` 명령 실행 시 따르는 1단계~17단계 자동 워크플로우
- `docs/PROJECT_RULES.md`: 프로젝트 고유 개발, QA, 보안, 권한, UI, DB, API 규칙
- `docs/TASK.md`: 현재 작업 상태와 자동 실행 모드
- `docs/QA_DEPLOY_CHECKLIST.md`: 배포 전 기능, 보안, UI, API, DB 점검 체크리스트
- `docs/development/mobile-app-setup.md`: Android/iOS 환경 구성, Firebase Push, 빌드와 스토어 릴리스 가이드
- `docs/architecture/environment-separation.md`: Web/Android/iOS의 개발·테스트·운영 API와 DB 분리 기준
- `docs/audits/known-limitations.md`: 구현 계약과 화면 연결 상태가 추가 확인 필요한 항목

## 개발 원칙

- 기능을 추가할 때 기존 사용자 흐름을 깨지 않습니다.
- UI에 보이는 버튼과 입력칸은 실제 기능과 연결합니다.
- 관리자 기능과 일반 사용자 기능을 명확히 구분합니다.
- 교육 회원과 스튜디오 회원의 데이터 의미를 혼동하지 않습니다.
- 파일 업로드, 결제, 환불, 예약 기능은 실제 DB 반영까지 확인합니다.
- 한글 문서와 주석은 UTF-8로 관리합니다.

## 코드 정리 기준

- 확실히 사용하지 않는 import, 변수, 함수만 제거합니다.
- 컴포넌트와 API wrapper는 실제 라우트, 테스트, 호출부를 확인한 뒤 정리합니다.
- `tmp/`, `qa-screenshots/`, `qa-artifacts/`, `frontend/test-results/`는 브라우저 테스트 산출물이므로 커밋하지 않습니다.
- 임시 QA 스크립트에 테스트 계정이나 민감 정보가 들어간 경우 저장소에 남기지 않습니다.
- 복잡한 권한, 결제, 환불, 예약, 업로드 로직에는 비개발자도 이해할 수 있는 한글 주석을 남깁니다.

## 배포 전 확인

배포 전에는 반드시 `docs/QA_DEPLOY_CHECKLIST.md`를 기준으로 점검합니다.

최소 확인 항목:

- 프론트엔드 빌드 성공
- 백엔드 테스트 성공
- 로그인/로그아웃 정상
- 관리자 권한 정상
- 교육영상 구매/재생 정상
- 필라테스 예약/취소 정상
- 결제/환불 흐름 정상
- 이미지/영상 업로드 정상
- 모바일 주요 화면 깨짐 없음
- 콘솔 및 네트워크 반복 오류 없음

## main 브랜치 자동 배포 주의사항

이 프로젝트는 `main` 브랜치 반영 시 GitHub Actions 배포 워크플로우가 실행될 수 있습니다.
따라서 `main` 브랜치로 직접 push하거나 PR을 merge하는 행위는 운영 배포 승인으로 취급합니다.

`main` merge 전에는 반드시 다음을 확인합니다.

- 운영 `.env`와 GitHub Secrets
- 운영 DB migration 필요 여부
- `studio_staff_profiles.user_id` 운영 DB 반영 여부
- nginx `/api` 프록시와 `/uploads` 정적 경로
- PM2 restart/reload 방식
- 실제 운영 `UPLOAD_ROOT`
- Email/SMS/Kakao/FCM/Payment 운영 allow flag
- scheduler 운영 정책
- 결제/환불 sandbox 또는 제한 검증
- 배포 후 smoke test 계획
- rollback 계획

`homepage_test` 기준 테스트 통과는 개발/테스트 환경 검증 결과이며, 운영 배포 가능 판정을 의미하지 않습니다.

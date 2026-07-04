# ICL Pilates HOMEPAGE

이끌림 필라테스의 홈페이지, 교육영상, 관리자, 스튜디오 예약 관리 기능을 함께 제공하는 통합 웹 서비스입니다.

## 주요 기능

- 브랜드 홈페이지와 소개 페이지
- 회원가입, 로그인, 마이페이지
- 교육영상 목록, 구매, 재생, 진도 관리
- 관리자 교육영상 등록, 수정, 삭제
- 주문, 결제, 환불, 포인트 관리
- 이벤트, 후기, 문의 게시판
- 스튜디오메이트형 필라테스 일정, 예약, 수강권, 강사, 회원, 매출 관리
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
| 모바일 확장 | Capacitor 기반 앱 패키징 준비 |

## 디렉터리 구조

```text
HomePage/
├── AGENTS.md
├── QA_DEPLOY_CHECKLIST.md
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
npm run dev
```

기본 API 주소는 `http://localhost:4000`입니다.

### 2. 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

기본 프론트엔드 주소는 `http://localhost:5173`입니다.

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

- `AGENTS.md`: Codex와 Claude Code가 따라야 하는 프로젝트 작업 지침
- `QA_DEPLOY_CHECKLIST.md`: 배포 전 기능, 보안, UI, API, DB 점검 체크리스트

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

배포 전에는 반드시 `QA_DEPLOY_CHECKLIST.md`를 기준으로 점검합니다.

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

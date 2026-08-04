# 로컬 개발 환경

## 요구 환경

- Node.js 22 계열
- npm
- MySQL 8 계열
- Android 개발 시 Android Studio, JDK와 Android SDK
- iOS 개발 시 macOS와 Xcode

## 환경변수

- 백엔드: `backend/.env.example`
- 테스트 백엔드: `backend/.env.test.example`
- 프론트엔드: `frontend/.env.example`
- 테스트 프론트엔드: `frontend/.env.test.example`
- 네이티브 앱: `frontend/.env.app.example`

예시 파일을 복사해 로컬 전용 파일을 만들고 실제 키와 비밀번호는 Git에 포함하지 않습니다.

## 개발 서버

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

- 기본 API: `http://localhost:4000`
- 기본 웹: `http://localhost:5173`
- 같은 공유기의 다른 기기에서 확인할 때는 방화벽과 Vite host 설정을 확인하고 PC의 사설 IP로 접속합니다.

## 안전한 기본 검증

```bash
cd backend
npm run check
```

```bash
cd frontend
npm run build
```

브라우저 E2E와 DB 쓰기 테스트는 `docs/TEST_ENV_SETUP.md`의 테스트 DB, 외부 부작용 차단, 업로드 경로 분리 조건을 충족한 뒤 실행합니다.

## 주의사항

- 운영 DB나 운영 API를 로컬 테스트에 사용하지 않습니다.
- 실제 결제, 이메일, 문자, 알림톡과 푸시는 명시적인 승인 없이 호출하지 않습니다.
- `backend/uploads`, 로그, DB dump와 실제 `.env`는 소스 자산으로 정리하거나 커밋하지 않습니다.
- `main` 반영은 자동 배포를 시작할 수 있으므로 개발 검증과 배포 승인을 구분합니다.

> 최종 점검: 2026-07-29

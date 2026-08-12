# 로컬 개발 환경

## 요구 환경

- Node.js 22 계열
- npm
- MySQL 8 계열
- Android 개발 시 Android Studio, JDK와 Android SDK
- iOS 개발 시 macOS와 Xcode

## 환경변수

- 개발 백엔드: `backend/.env.development.example` → `backend/.env.development`
- 운영 백엔드: `backend/.env.example` → 운영 서버의 `backend/.env`
- 테스트 백엔드: `backend/.env.test.example`
- 프론트엔드: `frontend/.env.example`
- 테스트 프론트엔드: `frontend/.env.test.example`
- 개발 네이티브 앱: `frontend/.env.app.development.example`
- 운영 네이티브 앱: `frontend/.env.app.production.example`

예시 파일을 복사해 로컬 전용 파일을 만들고 실제 키와 비밀번호는 Git에 포함하지 않습니다.

AWS 개발 RDS를 사용할 때는 `DB_SSL_MODE=verify_identity`와 RDS CA bundle의 절대 경로를 `DB_SSL_CA`에 설정합니다. 로컬 MySQL/Docker에서만 `DB_SSL_MODE=disabled`를 사용합니다.

웹과 Android/iOS는 환경별 Backend를 공유합니다. 개발 클라이언트는 `homepage_dev`, 운영 클라이언트는 `icl_pilates`를 사용하는 API에만 연결합니다. 자세한 구조는 [`../architecture/environment-separation.md`](../architecture/environment-separation.md)를 확인합니다.

## 개발 서버

```bash
cd backend
npm install
npm run db:provision:dev:local
npm run db:check:dev:isolation
npm run env:check:dev
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

- 개발 API: `http://localhost:4001`
- 기본 웹: `http://localhost:5173`
- 같은 공유기의 다른 기기에서 확인할 때는 방화벽과 Vite host 설정을 확인하고 PC의 사설 IP로 접속합니다.

## Docker 개발 환경

Docker를 사용하는 경우에도 운영 DB 이름을 재사용하지 않습니다. `.env.docker.example`을 `.env.docker`로 복사해 로컬 전용 값을 입력한 뒤 아래 순서로 실행합니다.

```bash
docker compose --env-file .env.docker up -d mysql
docker compose --env-file .env.docker --profile bootstrap run --rm db-bootstrap
docker compose --env-file .env.docker up -d
```

- MySQL host port: `3307`
- DB: `homepage_dev`
- DB user: `homepage_dev_user`
- Web: `http://localhost:8080`
- 업로드 볼륨: `backend-uploads-dev`

`db-bootstrap`은 빈 `homepage_dev`에서만 실행되며, 완료 후 Backend는 다시 `DB_INIT_MODE=safe`로 실행됩니다. 백업·복구 절차는 [`../operations/backup-recovery.md`](../operations/backup-recovery.md)를 따릅니다.

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

> 최종 점검: 2026-08-11

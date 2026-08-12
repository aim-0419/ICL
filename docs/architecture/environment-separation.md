# 개발·테스트·운영 환경 분리

웹, Android, iOS는 서로 다른 데이터베이스를 갖는 제품이 아니다. 같은 환경의 클라이언트는 하나의 API와 데이터베이스를 공유하고, 개발·테스트·운영 환경 사이의 API와 데이터베이스를 물리적으로 분리한다.

## 환경 구조

| 환경 | 클라이언트 | Backend | Database | Upload | 외부 부작용 |
| --- | --- | --- | --- | --- | --- |
| Development | 개발 Web, Android, iOS | 개발 API, 기본 `4001` | `homepage_dev` | `backend/uploads-dev` | 기본 차단 |
| Test | Playwright, API/DB 자동 테스트 | 테스트 API | `homepage_test` | `backend/uploads-test` | 차단 또는 mock |
| Production | 운영 Web, Android, iOS | 운영 API, 기본 `4000` | `icl_pilates` | 운영 uploads | 승인된 항목만 허용 |

개발 앱이 운영 API로 연결되거나 개발 백엔드가 운영 DB로 연결되면 시작 단계에서 실패하도록 환경 검증을 적용한다. 클라이언트가 DB에 직접 연결하는 구조는 허용하지 않는다.

개발 Web의 Vite proxy도 `VITE_DEV_API_ALLOWED_HOSTS`에 명시한 개발 host만 허용한다.

## 환경 파일

| 용도 | Backend | Frontend/App |
| --- | --- | --- |
| 개발 | `backend/.env.development` | 웹은 Vite proxy, 앱은 `frontend/.env.app.development` 또는 example |
| 테스트 | `backend/.env.test` | `frontend/.env.test` |
| 운영 | `backend/.env` | `frontend/.env.app.production` 또는 example |

실제 환경 파일은 Git에 커밋하지 않는다. `*.example`에는 placeholder와 안전한 기본 정책만 둔다.

## 로컬 개발 시작

최초 한 번만 격리된 로컬 개발 DB를 준비한다.

```bash
cd backend
npm run db:provision:dev:local
npm run db:check:dev:isolation
```

이 명령은 `homepage_dev`와 전용 DB 계정을 준비하고 `backend/.env.development`를 생성한다. 기존 `icl_pilates`의 스키마 정의만 복사하며 사용자·예약·결제 같은 데이터 행은 복사하지 않는다. 이미 존재하는 개발 DB의 테이블 구성이 불완전하면 자동 복구하거나 삭제하지 않고 중단한다.

Docker를 사용할 때는 `.env.docker.example`을 기반으로 별도 비밀값 파일을 만들고 `docker-compose.yml`의 `homepage_dev` 스택을 사용한다. Docker 개발 스택은 운영 DB 이름, 운영 업로드 경로, 외부 발송·결제 호출을 허용하지 않는다.

`db:check:dev:isolation`은 개발 DB 연결과 전용 계정 권한을 read-only로 확인한다. 운영 DB 조회가 차단되지 않거나 전역 데이터 권한이 발견되면 실패한다.

```bash
# Terminal 1: development API, http://localhost:4001
cd backend
npm run env:check:dev
npm run dev

# Terminal 2: development web, http://localhost:5173
cd frontend
npm run dev
```

`npm run dev`는 `backend/.env.development`만 읽는다. 운영용 `backend/.env`로 fallback하지 않는다.

## Android/iOS 개발

```bash
cd frontend

# 개발 API를 사용하는 native bundle
npm run cap:sync:dev

# Android emulator가 PC의 localhost:4001을 사용하도록 연결
npm run android:reverse:dev

# Android Studio 열기
npx cap open android
```

Android emulator를 먼저 실행한 뒤 reverse 명령을 실행한다. 여러 기기가 연결된 경우 `ANDROID_SERIAL`로 대상 기기를 지정한다. iOS Simulator는 macOS에서 개발 API에 접근한다. 실제 Android/iPhone 기기에서는 `localhost` 대신 TLS가 적용된 개발 API 도메인을 사용해야 한다.

운영 앱 동기화는 반드시 다음 명령을 사용한다.

```bash
npm run cap:sync:prod
```

운영 앱 환경은 HTTPS API와 승인된 딥링크 host만 허용하며 localhost와 사설 IP를 거부한다.

## 여러 컴퓨터에서 개발

회사 Windows와 집의 macOS가 같은 개발 데이터를 사용해야 하면 AWS에 개발 전용 API와 개발 전용 DB를 둔다.

- 개발 EC2/서비스: 운영 EC2와 별도 경로, 포트, PM2 이름 사용
- 개발 DB: 운영 DB와 별도 인스턴스 또는 최소한 별도 DB·전용 계정·전용 보안그룹 사용
- MySQL `3306`을 인터넷 전체에 공개하지 않음
- 개발 DB 인바운드는 개발 백엔드 보안그룹에서만 허용
- 개발 웹·앱은 개발 API의 HTTPS 주소만 사용
- 운영 데이터 dump를 개발 DB로 반복 복사하지 않음
- 필요한 테스트 데이터는 가명 seed나 승인된 익명화 데이터로 생성

`.github/workflows/deploy-development.yml`은 수동 실행 전용 예시다. AWS의 개발 인스턴스, DNS, 인증서, GitHub `DEV_EC2_*` secrets와 `~/ICL-dev/backend/.env.development`가 준비되기 전에는 실행하지 않는다. 워크플로우는 DB를 생성하거나 운영 DB를 변경하지 않는다.

AWS 개발 RDS를 사용할 때 `backend/.env.development`에는 실제 값을 로컬에서 직접 입력하고 Git에 올리지 않는다.

```env
DB_HOST=<development-rds-endpoint>
DB_PORT=3306
DB_NAME=homepage_dev
DB_USER=homepage_dev_user
DB_PASSWORD=<secret>
DB_SSL_MODE=verify_identity
DB_SSL_CA=/home/<development-user>/global-bundle.pem
```

RDS host를 사용하면서 `DB_SSL_MODE=verify_identity`와 CA 파일이 준비되지 않으면 Backend는 시작을 차단한다. 로컬 MySQL 또는 Docker만 `DB_SSL_MODE=disabled`를 사용한다. 개발 RDS 보안 그룹은 개발 EC2 보안 그룹에서 오는 `3306`만 허용하며 노트북이나 인터넷에 직접 공개하지 않는다.

`deploy/nginx-dev.conf.example`의 `dev.example.com`과 인증서 경로는 실제 개발 서브도메인으로 교체한다. 개발 nginx는 `4001`과 `uploads-dev`만 연결해야 하며 운영 `4000` 또는 운영 uploads를 참조하면 안 된다.

## 배포 전 차단 확인

```bash
cd backend
npm run env:check:dev
npm run env:check:test
npm run env:check:prod

cd ../frontend
npm run test:env-isolation
npm run validate:app:dev
npm run validate:app:prod
```

각 backend 검사는 해당 실제 환경 파일이 준비된 컴퓨터에서 실행한다. 값은 로그나 문서에 출력하지 않는다.

## 운영 안전 원칙

- 운영 DB 이름은 `icl_pilates`, 개발 DB 이름은 `homepage_dev`, 자동 테스트 DB 이름은 `homepage_test`로 고정한다.
- 개발 DB 계정에는 `homepage_dev` 외 DB 권한을 부여하지 않는다.
- `DB_INIT_MODE=safe`를 기본으로 하고 서버 시작 시 schema/data 변경을 금지한다.
- 운영 배포에서 개발·테스트 환경 파일을 복사하거나 읽지 않는다.
- 운영 앱과 웹은 운영 API만 사용하며 DB에는 직접 연결하지 않는다.
- 스키마 변경은 검토된 migration을 환경별로 별도 승인하여 적용한다.
- 개발 DB 백업과 운영 DB 백업은 이름, 저장 경로, 보존 정책을 분리한다.

> 최종 점검: 2026-08-12. AWS 개발 EC2와 RDS 연결·TLS·전용 DB 계정 권한은 수동 검증했으며, Backend 환경 파일 작성과 애플리케이션 실행 검증은 배포 전 남아 있다.

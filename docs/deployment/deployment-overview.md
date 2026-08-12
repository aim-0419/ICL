# 배포 구조와 점검 순서

## 배포 흐름

1. Pull Request에서 백엔드 검증과 프론트엔드 build를 수행합니다.
2. `main` 브랜치 push가 EC2 배포 작업을 시작할 수 있습니다.
3. EC2에서 저장소를 `origin/main` 상태로 맞춥니다.
4. 프론트엔드를 build하고 백엔드 의존성을 설치합니다.
5. PM2가 백엔드 환경변수를 갱신해 재시작합니다.
6. nginx 설정을 검사한 뒤 정상일 때만 reload합니다.

PR 생성과 갱신만으로는 배포하지 않지만, main merge는 운영 배포 승인으로 취급합니다.

## 개발 배포 분리

- 운영 배포는 `.github/workflows/deploy.yml`, 운영 경로 `~/ICL`, PM2 `icl-backend`, API 기본 포트 `4000`을 사용합니다.
- 개발 배포 예시는 수동 실행 전용 `.github/workflows/deploy-development.yml`, 개발 경로 `~/ICL-dev`, PM2 `icl-backend-dev`, API 기본 포트 `4001`을 사용합니다. 배포 전에 개발 DB 계정의 운영 DB 접근 차단을 읽기 전용으로 확인하고, 재시작 후 개발 환경 health 응답까지 검사합니다.
- 개발 Backend는 `backend/.env.development`와 `homepage_dev`만 허용합니다.
- 운영 Backend는 `backend/.env`와 `icl_pilates`만 허용합니다.
- 두 환경은 EC2 경로만이 아니라 DB 계정, DB 권한, 업로드 경로, DNS/TLS, nginx와 GitHub Secrets까지 분리합니다.
- 개발 nginx 예시는 전용 개발 서브도메인과 TLS 인증서를 요구하며 `4001`과 `uploads-dev`만 연결합니다.
- 개발 워크플로우는 DB를 자동 생성하지 않으며 AWS 개발 인프라가 준비된 뒤에만 수동 실행합니다.

세부 구조는 [`../architecture/environment-separation.md`](../architecture/environment-separation.md)를 따릅니다.

## DB 변경 통제

- 서버 시작 시 스키마 bootstrap, alter, data repair는 운영에서 기본 차단합니다.
- `deploy/seed-overrides.sql`은 `APPLY_DEPLOY_SEED_OVERRIDES=true`일 때만 의도적으로 실행합니다.
- 운영 migration은 백업 또는 snapshot, SQL 검토, 승인과 rollback 계획이 필요합니다.
- DROP, TRUNCATE, 무조건 DELETE를 자동 배포에 포함하지 않습니다.

## 운영 환경 확인

값을 출력하지 않고 설정 여부만 확인합니다.

- `NODE_ENV=production`
- `DB_INIT_MODE=safe`
- `ALLOW_E2E_DATA_MUTATION=false`
- DB 접속 정보와 암호화 키
- CORS 허용 origin
- 운영 업로드 루트
- Email, SMS, Kakao, FCM, Payment 허용 정책
- Academy publish scheduler 정책

## nginx, PM2와 업로드

- `/api`가 PM2 백엔드 포트로 프록시되는지 확인합니다.
- `/uploads` alias와 백엔드 `UPLOAD_ROOT`가 같은 실제 경로를 가리켜야 합니다.
- 교육영상 원본 경로의 직접 접근 차단을 유지합니다.
- `pm2 restart ... --update-env` 이후 health API와 로그를 확인합니다.
- nginx는 `nginx -t` 성공 후에만 reload합니다.

## 배포 전후

- 배포 전: [`../QA_DEPLOY_CHECKLIST.md`](../QA_DEPLOY_CHECKLIST.md)
- 배포 후: 로그인, 권한, 메인 자산, `/api/health`, `/uploads`, 예약 조회를 smoke test합니다.
- 실패 시: 직전 정상 커밋, 환경변수와 DB migration의 rollback 경로를 사용합니다.

> 최종 점검: 2026-08-11, 운영·개발 배포 설정 기준입니다.

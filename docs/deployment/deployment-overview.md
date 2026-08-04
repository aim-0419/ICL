# 배포 구조와 점검 순서

## 배포 흐름

1. Pull Request에서 백엔드 검증과 프론트엔드 build를 수행합니다.
2. `main` 브랜치 push가 EC2 배포 작업을 시작할 수 있습니다.
3. EC2에서 저장소를 `origin/main` 상태로 맞춥니다.
4. 프론트엔드를 build하고 백엔드 의존성을 설치합니다.
5. PM2가 백엔드 환경변수를 갱신해 재시작합니다.
6. nginx 설정을 검사한 뒤 정상일 때만 reload합니다.

PR 생성과 갱신만으로는 배포하지 않지만, main merge는 운영 배포 승인으로 취급합니다.

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

> 최종 점검: 2026-07-29, `.github/workflows/deploy.yml`과 `deploy/nginx-prod.conf` 기준입니다.

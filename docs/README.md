# 문서 안내

이 디렉터리는 ICL HomePage의 개발, 운영, 배포, 통합 연동 문서를 목적별로 관리합니다.

## 작업 전 필수 문서

AI 에이전트와 개발자는 다음 순서로 문서를 확인합니다.

1. [`../AGENTS.md`](../AGENTS.md)
2. [`WORKFLOW.md`](WORKFLOW.md)
3. [`PROJECT_RULES.md`](PROJECT_RULES.md)
4. [`SECURITY_HARDENING.md`](SECURITY_HARDENING.md)
5. [`TASK.md`](TASK.md)
6. [`QA_DEPLOY_CHECKLIST.md`](QA_DEPLOY_CHECKLIST.md)

## 문서 분류

| 문서 | 목적 | 대상 독자 | 현재 상태 | 관련 코드 영역 |
| --- | --- | --- | --- | --- |
| [`architecture/system-overview.md`](architecture/system-overview.md) | 전체 시스템·인증·데이터·배포 흐름 설명 | 개발자, 운영자 | 현재 코드 기준 | `frontend/src`, `backend/src`, `deploy` |
| [`architecture/feature-structure.md`](architecture/feature-structure.md) | 기능별 프론트엔드·백엔드 위치 안내 | 개발자, 기획자 | 현재 코드 기준 | `frontend/src/features`, `backend/src/features` |
| [`development/local-setup.md`](development/local-setup.md) | 로컬 실행과 안전한 검증 절차 | 개발자 | 사용 가능 | `package.json`, env example |
| [`development/code-safety.md`](development/code-safety.md) | 데이터와 권한을 보호하는 변경 원칙 | 개발자, QA | 사용 가능 | DB, 예약, 결제, 권한 |
| [`development/mobile-app-setup.md`](development/mobile-app-setup.md) | Capacitor Android/iOS 구성과 릴리스 준비 | 앱 개발자, 운영자 | 실기기 검증 필요 | `frontend/android`, `frontend/ios`, Capacitor |
| [`integrations/notifications.md`](integrations/notifications.md) | SMS, 카카오 알림톡, FCM 연동 준비 | 백엔드 개발자, 운영자 | 운영 키 검증 필요 | `backend/src/features/sms` |
| [`operations/backup-recovery.md`](operations/backup-recovery.md) | 격리 환경 백업·복구 훈련 | 운영자, DB 담당자 | 실행 전 승인 필요 | `backend/scripts`, MySQL |
| [`deployment/deployment-overview.md`](deployment/deployment-overview.md) | GitHub Actions, EC2, nginx, PM2 배포 흐름 | 운영자, DevOps | 현재 설정 기준 | `.github/workflows`, `deploy` |
| [`ui-ux/admin-ui-guide.md`](ui-ux/admin-ui-guide.md) | 관리자 화면의 공통 UI 원칙 | 프론트엔드, UX, QA | 적용 기준 | `frontend/src/features/admin`, `frontend/styles.css` |
| [`audits/known-limitations.md`](audits/known-limitations.md) | 연결 공백과 추가 검증 항목 기록 | 개발자, QA, 기획자 | 후속 작업 필요 | Studio API, Push, 지점 범위 |

## 관리 원칙

- 문서는 UTF-8로 저장합니다.
- 실제 비밀번호, 토큰, API 키, DB 접속값을 기록하지 않습니다.
- 코드와 일치하지 않는 계획은 완료된 기능처럼 표현하지 않습니다.
- 경로를 이동하면 `README.md`, `AGENTS.md`, `docs/` 안의 참조도 함께 갱신합니다.
- 검증하지 못한 내용은 `미확인` 또는 `추가 확인 필요`로 표시합니다.

> 최종 점검: 2026-07-29

# 확인이 필요한 기능 계약

이 문서는 현재 저장소를 정적으로 대조해 확인한 연결 공백과 추가 검증 항목을 기록합니다. 미구현 기능을 정상 작동하는 기능처럼 표시하지 않기 위한 감사 기록이며, 승인 없이 API나 DB를 추가하는 근거로 사용하지 않습니다.

## Studio API 연결 공백

### 해결: 관리자 설정 라우트 등록 (2026-08-24)

`frontend/src/features/studio/api/studioApi.js`의 호출과 `backend/src/features/studio/studio.routes.js`를 다시 대조한 결과, 아래 기능은 **컨트롤러와 서비스가 이미 구현되어 있었고 라우트 등록만 빠져 있었습니다.** 관리자 설정 화면에서 호출하면 404로 실패하던 구간입니다.

| 구분 | 등록한 라우트 | 이전 판정 | 현재 |
| --- | --- | --- | --- |
| 미수금 전체 목록 | `GET /studio/admin/arrears` | `ROUTE_MISSING` | `RESOLVED` |
| 체크인 취소 | `PATCH /studio/admin/checkins/:checkinId/cancel` | `ROUTE_MISSING` | `RESOLVED` |
| 시설 기본정보 | `GET/PUT /studio/admin/settings/info` | `ROUTE_MISSING` | `RESOLVED` |
| 룸 설정·CRUD | `GET /settings/rooms`, `PUT /settings/rooms/enabled`, `POST/PUT/DELETE /rooms` | `ROUTE_MISSING` | `RESOLVED` |
| 역할 설정·CRUD | `GET /settings/roles`, `PUT /settings/roles/enabled`, `POST/PUT/DELETE /roles` | `ROUTE_MISSING` | `RESOLVED` |
| 회원 등급 | `GET /member-grades`, `PUT /member-grades/enabled`, `POST/PUT/DELETE` | `ROUTE_MISSING` | `RESOLVED` |
| 수업 카테고리 | `GET/POST /class-categories`, `PUT/DELETE /class-categories/:categoryId` | `ROUTE_MISSING` | `RESOLVED` |
| 알림 템플릿 | `/studio/admin/notification-templates` | `RESOLVED` | 아래 참고 |
| 메시지 템플릿 | `GET/POST /message-templates`, `PUT/DELETE /message-templates/:templateId` | `ROUTE_MISSING` | `RESOLVED` |

확인한 내용:

- DB 스키마 변경은 필요하지 않았습니다. `studio_rooms`, `studio_roles`, `studio_member_grades`, `studio_class_categories`, `studio_info`, `studio_message_templates`는 이미 정의되어 있고, `studio_info.rooms_enabled` / `roles_enabled` / `member_grades_enabled`도 멱등 `ALTER TABLE` 마이그레이션으로 추가됩니다.
- 인증·권한은 기존 컨트롤러의 세션 인증과 `settings.read` / `settings.write` 권한을 그대로 사용합니다.
- `PUT /member-grades/enabled`는 `PUT /member-grades/:gradeId`보다 먼저 등록해야 `enabled`가 경로 파라미터로 잡히지 않습니다. 등록 순서를 그렇게 맞췄습니다.
- 응답 형태가 프론트 기대와 일치하는지 대조했습니다. 예: `getRoomSettings` → `{ roomsEnabled, rooms }`, `getMemberGradeSettings` → `{ memberGradesEnabled, grades }`.

검증 범위 (2026-08-26 개발 DB 연결 후 갱신):

- 개발 DB(`homepage_dev`)에 연결한 상태에서 백엔드를 실행해 27개 경로가 모두 401을 반환하는 것을 확인했습니다. 500이나 404는 없었습니다. 미등록 대조 경로는 404를 유지했습니다.
- 서비스 계층의 실제 SQL이 개발 DB 스키마에서 정상 동작하는 것을 확인했습니다. 시설 기본정보, 룸 설정, 역할 설정, 회원 등급, 수업 구분, 메시지 템플릿, 알림 템플릿, 미수금 목록 8종이 모두 기대한 형태로 응답했습니다.
- `studio_info.rooms_enabled` / `roles_enabled` / `member_grades_enabled` 컬럼이 실제로 존재하고 조회되는 것을 확인했습니다. 스키마 변경이 필요 없다는 판단이 맞았습니다.
- 연결 전 안전 확인: `productionDatabaseAccessDenied: true`. 개발 DB 계정은 운영 DB에 접근할 수 없습니다.

권한별 동작 (2026-08-26 확인 완료):

개발 DB에 개발 전용 관리자·일반회원 계정을 만들어 실제 HTTP 로그인 상태로 확인했습니다. 읽기 라우트 8종을 세 가지 상태에서 호출한 결과입니다.

| 상태 | 기대 | 결과 |
| --- | --- | --- |
| 비로그인 | 401 | 8 / 8 |
| 일반회원(member) | 403 | 8 / 8 |
| 관리자(admin0) | 200 | 8 / 8 |

관리자 응답의 형태가 프론트엔드가 기대하는 키와 일치하는 것도 함께 확인했습니다. `settings/rooms` → `{ roomsEnabled, rooms }`, `member-grades` → `{ memberGradesEnabled, grades }`, `class-categories` → `{ categories }`, `message-templates` → `{ templates }`, `arrears` → `{ arrears }`, `settings/info` → `{ info }`.

개발 계정은 `backend/scripts/seed-development-accounts.mjs` 로 만듭니다. 계정 정보는 저장소에 두지 않고 환경변수로 주입합니다.

```bash
cd backend
DEV_ADMIN_LOGIN_ID=... DEV_ADMIN_PASSWORD=... DEV_MEMBER_LOGIN_ID=... DEV_MEMBER_PASSWORD=... npm run db:seed:dev:accounts
```

이 스크립트는 고정된 두 계정만 갱신하므로 기존 회원 데이터를 건드리지 않습니다. 비밀번호는 대소문자·숫자·특수문자를 포함한 12자 이상이어야 합니다.

쓰기 동작 (2026-08-26 확인 완료):

개발 DB에서 생성 → 조회 → 수정 → 조회 → 삭제 → 조회 순서로 확인했습니다. 만든 레코드만 다루고 기존 데이터는 조회만 했으며, 끝난 뒤 원래 상태로 되돌렸습니다.

- 룸, 역할, 회원 등급, 수업 구분, 메시지 템플릿 5종의 CRUD 30항목 통과
- 사용 여부 플래그 3종과 시설 기본정보 저장 통과 (변경 후 원복까지 확인)
- 잘못된 입력 거부 4항목 통과
- 관리자 화면 10개가 브라우저에서 정상 렌더링 (console 오류 없음, 서버 오류 없음)
- 검증 후 DB 상태를 대조해 잔여 레코드가 없고 설정값이 원래대로인 것을 확인했습니다.

이 과정에서 발견해 고친 결함은 아래 "쓰기 검증에서 발견한 결함" 항목을 참고하세요.

## 쓰기 검증에서 발견한 결함 (2026-08-26 수정 완료)

**룸·역할·회원 등급 사용 여부 토글이 500으로 실패했습니다.**

원인은 `studio_info.phones` 컬럼의 기본값이 깨져 있는 것이었습니다. 이스케이프가 중첩 적용되어 유효하지 않은 JSON이 되었고, `phones` 를 명시하지 않는 INSERT 는 모두 `ER_INVALID_JSON_TEXT` 로 실패합니다.

```
DEFAULT = _utf8mb4'_utf8mb4\\\'[]\\\''
```

같은 테이블을 쓰는 `saveSalesPin` 은 이미 `phones` 를 직접 넣어 이 문제를 우회하고 있었습니다. 토글 3종은 라우트가 등록되어 있지 않아 아무도 실행하지 못했기 때문에 드러나지 않았습니다.

조치: 토글 3종도 `phones` 를 명시하도록 고쳤습니다. 스키마는 건드리지 않았습니다.

> **남은 권고:** 근본 원인인 컬럼 기본값 자체는 그대로입니다. `phones` 를 생략하는 INSERT 를 새로 추가하면 같은 문제가 다시 생깁니다. 기본값을 바로잡는 것은 스키마 변경이라 별도 승인이 필요합니다.

함께 고친 입력 검증 공백:

- 이름이 빈 값이어도 룸·역할·등급·수업 구분이 생성되었습니다. 이제 400으로 거부합니다.
- 존재하지 않는 id 로 수정·삭제해도 200을 반환했습니다. 이제 404를 반환합니다.
- 사용 여부에 boolean 이 아닌 값을 넣어도 참으로 취급되었습니다. 이제 400으로 거부합니다.

## 권한과 범위

- Push device 등록·해제 controller가 다른 회원 API와 동일한 세션 해석 경로를 사용하는지는 브라우저/API 재검증이 필요합니다. 판정: `PERMISSION_INCOMPLETE`.
- 지점별 데이터는 여러 API에서 `branchId`를 사용하지만, 일부 fallback과 집계가 모든 도메인에 일관되게 적용되는지는 API별 확인이 필요합니다.
- 영상 선물의 기간 변경은 확인되지만 회수와 회수 이력 계약은 현재 정적 검색에서 확인하지 못했습니다. 판정: `FRONTEND_PARTIAL`.

## 테스트와 운영

- 프론트엔드에는 전용 lint, typecheck, unit test 스크립트가 없고 build와 Playwright 중심으로 검증합니다.
- Android 네이티브 compile과 iOS archive는 각 플랫폼의 SDK와 서명 자산이 필요합니다.
- 실제 Email, SMS, Kakao, FCM, Payment와 운영 DB는 안전 모드 테스트 결과만으로 검증 완료라고 판정할 수 없습니다.
- 동적 페이지 override나 DB에 저장된 public URL 때문에 정적 참조가 없는 이미지도 바로 삭제하지 않습니다.

## 갱신 기준

연결 공백을 구현하거나 계약을 제거할 때 프론트 API 래퍼, 백엔드 route, 권한, DB, UI 상태와 E2E를 함께 검증한 뒤 이 문서를 갱신합니다.

> 최종 점검: 2026-07-29, 정적 route/API 대조 기준입니다.

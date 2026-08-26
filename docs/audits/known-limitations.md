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

검증 범위:

- 라우터만 마운트한 스모크 테스트로 27개 경로가 모두 404가 아닌 401을 반환하는 것을 확인했습니다(등록 + 인증 가드 도달). 미등록 대조 경로는 404를 유지했습니다.
- **DB 연결·실데이터 응답·권한별 200/403 동작은 미확인입니다.** 개발 DB 연결 후 재검증이 필요합니다.

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

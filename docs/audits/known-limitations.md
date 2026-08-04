# 확인이 필요한 기능 계약

이 문서는 현재 저장소를 정적으로 대조해 확인한 연결 공백과 추가 검증 항목을 기록합니다. 미구현 기능을 정상 작동하는 기능처럼 표시하지 않기 위한 감사 기록이며, 승인 없이 API나 DB를 추가하는 근거로 사용하지 않습니다.

## Studio API 연결 공백

`frontend/src/features/studio/api/studioApi.js`에는 호출 래퍼가 있지만 `backend/src/features/studio/studio.routes.js`에서 같은 계약을 확인하지 못한 그룹입니다.

| 구분 | 프론트엔드 계약 | 현재 판정 |
| --- | --- | --- |
| 미수금 전체 목록 | `GET /studio/admin/arrears` | `ROUTE_MISSING` |
| 체크인 취소 | `PATCH /studio/admin/checkins/:id/cancel` | `ROUTE_MISSING` |
| 시설 기본정보 | `GET/PUT /studio/admin/settings/info` | `ROUTE_MISSING` |
| 룸 설정·CRUD | `/studio/admin/settings/rooms`, `/rooms` | `ROUTE_MISSING` |
| 역할 설정·CRUD | `/studio/admin/settings/roles`, `/roles` | `ROUTE_MISSING` |
| 회원 등급 | `/studio/admin/member-grades` | `ROUTE_MISSING` |
| 수업 카테고리 | `/studio/admin/class-categories` | `ROUTE_MISSING` |
| 알림 템플릿 | `/studio/admin/notification-templates` | `ROUTE_MISSING` |
| 메시지 템플릿 | `/studio/admin/message-templates` | `ROUTE_MISSING` |

관련 화면은 실패 시 오류 또는 빈 상태를 표시해야 하며, 백엔드 구현은 별도 요구사항과 권한·DB 계약 승인이 필요합니다.

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

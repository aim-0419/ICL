# 묶음 6 결과 — 코드 정리 · 리팩토링 (2026-08-20)

- 범위: docs/WORKFLOW.md 권장 실행 단위 묶음 6 (STEP 13 코드 정리 · STEP 14 리팩토링)
- 브랜치: `fix/play-store-compliance` / 작업 전 git status: **클린** (HEAD ab4e919)
- 커밋: 하지 않음 (지시 없음 — 변경분은 작업 트리에 있음)
- 제약 준수: 결제·권한·재생토큰 로직 미공통화, UI·API 응답 구조 무변경, 불확실 항목은 삭제 후보로만 보고

## STEP 13. 코드 정리 — 실행 내역

탐지 방법: ① 엔트리(main.jsx / server.js+scripts) 기준 import 그래프로 고아 파일 탐지,
② ESLint(no-unused-vars + react/jsx-uses-vars) 임시 구성으로 미사용 심볼 전수 스캔,
③ 각 항목마다 전체 검색·문자열 참조·테스트 참조·동적 참조 확인 후 삭제.

### 삭제 실행 (14파일, 참조 0 확정분만)

| 파일 | 정리 내용 |
|---|---|
| `shared/utils/index.js` | **파일 삭제** — 아무도 import하지 않는 barrel (format.js는 전부 직접 import) |
| `mypage/pages/MyPage.jsx` | 미사용 import 5개(Link·deleteAcademyVideo·updateAcademyVideo·uploadAcademyAsset·formatDateTime), isAdminStaff import+isAdmin 변수, toSafeNumber 함수, **포인트 잔재 체인 전체**(pointPage state·pointHistoryRows·pointTotalPages·clamp effect — 포인트 시스템 미사용 확인됨), stale 주석 1줄 |
| `brand/pages/BrandPages.jsx` | 미사용 컴포넌트 BrandPageLayout + PageHero import, IntroPage의 **미렌더 instructors state+fetch** (불필요 API 호출 1건 제거 — InstructorsPage 쪽은 유지) |
| `home/pages/HomePage.jsx` | 미사용 상수 SERVICE_POINTS(6항목 배열) |
| `community/pages/CommunityPages.jsx` | 값이 읽히지 않는 writeStatus state + setter 호출 |
| `admin/pages/AdminStudioPassPage.jsx` | 미호출 함수 handleDelete·toggleSelect + 연쇄 미사용 import(deleteAdminPassProduct), navigate |
| `admin/pages/AdminDashboardPage·AdminProductPage·AdminRefundPage·AdminVideoGiftPage.jsx` | 미사용 Link import |
| `admin/pages/AdminMessagesPage·AdminNoticePage·AdminOperationsPage.jsx` | 미사용 navigate 변수 + useNavigate import |
| `shared/components/AdminImageEditor.jsx` | 미호출 함수 placeCaretAtEnd·insertLineBreakAtCaret |

- console.log/debug: 프론트 소비자·관리자 코드에서 **0건** (이미 클린). 백엔드 console.log는 의도된 서버 로그라 미변경.
- 임시 테스트 코드: 저장소에 커밋된 잔재 0건 (_qa·bak·original 등 없음).

### 삭제 후보 — 보고만 (사용자 판단 필요)

| 후보 | 근거 | 판단 보류 이유 |
|---|---|---|
| `backend/src/features/sms/sms.controller.js` | 어디서도 import 안 됨. sms.routes.js가 동일 5개 엔드포인트(/send·/schedule·/history·/auto-history·/config)를 인라인으로 재구현해 **완전 대체 확정** | 파일 단위 삭제 + "SMS 연동 준비 구조"가 프로젝트 명시 범위라 사용자 확인 후 삭제 권장 |
| `frontend/shared/utils/status.js` | import 0건. 단, 같은 로직(환불 상태 라벨 맵)이 AdminRefundPage·AdminSalesDashboardPage에 **인라인 중복** — 죽은 코드가 아니라 "미채택 공통 유틸" | 삭제보다 STEP 14 채택 후보(아래)로 처리하는 것이 맞음 |

### 유지 판정 (고아처럼 보이나 삭제 금지)

| 파일 | 판정 근거 |
|---|---|
| `backend .../academy.refund-rules.js` | `test/studio-refund-rules.test.js`가 import (테스트 참조) + 환불(결제 인접) 영역 |
| `backend .../sms/notification.scheduler.js` | 알림 큐 소비 워커. env 플래그(NOTIFICATION_SCHEDULER_ENABLED) 존재 — 연동 준비 코드. **단, 배선 누락 발견(미해결 항목 1)** |
| `backend .../sms/sms.service.js` | 알리고 SMS/알림톡 실발송 연동 코드. dispatch는 현재 FCM만 발송 — 미배선 준비 코드로 판단, 삭제 금지 기준(연동 준비) 해당 |

### 최근 변경 영역 취급

이미지 최적화(4b6a73f)·접근성(80c349c)·영상 재생(6693944)·SEO(5ec5e0d)·면책 고지(0d28f24) 파일 중
정리 대상은 eslint가 확정한 미사용 심볼만 건드림. resolveApiUrl·aria-label·::after·이미지 경로는 무변경.
public 이미지 자산은 DB/localStorage 저장 경로 참조 가능성(admin-defaults 별칭 맵) 때문에 전부 미변경.

## STEP 14. 리팩토링 — 후보 보고 (실행 안 함)

원칙("영향 범위가 크면 자동 진행하지 말고 보고")에 따라 아래는 실행하지 않고 보고한다.
결제·권한·재생토큰 관련은 제약대로 후보에서 제외했다.

| # | 후보 | 내용 | 예상 영향 |
|---|---|---|---|
| 1 | 환불 상태 라벨 공통화 | AdminRefundPage·AdminSalesDashboardPage의 인라인 라벨 맵을 `shared/utils/status.js`(기존재) 채택으로 교체 | 중 — 관리자 2페이지. 라벨 문자열이 완전 동일함은 확인했으나 필터 옵션 배열 형태가 달라 부분 채택이 됨. UI 문자열 불변 검증 필수 |
| 2 | 모달 닫기 버튼 소형 공통화 | MyPage의 `refund-modal-close` × 버튼 4회 반복 → 공통 ModalCloseButton | 소 — 마크업 동일(aria-label만 다름). 시각 무변화 |
| 3 | sms.controller.js 제거(후보 1과 연계) | 라우트 대체 확정 후 파일 삭제 | 소 — 위 삭제 후보와 동일 |

이미 공통화되어 있는 것(추가 작업 불필요): MyPage 페이지네이션(renderSimplePager), 날짜·금액 포맷(shared/utils/format.js), 안전 고지(ExerciseSafetyNotice), API 절대경로 헬퍼(resolveApiAssetUrl/resolveApiUrl).

## 검증 결과

| 항목 | 결과 |
|---|---|
| ESLint 재스캔 | 실질 경고 0 (잔여 1건은 `catch (_)` 스타일 표기, 1건은 미설치 룰 주석 참조 — 코드 문제 아님) |
| `npm run build` | ✅ 통과 (정리 중 2회 확인) |
| 렌더 스모크 (Playwright, 375px) | 홈·수업소개·강사진·후기·이벤트·아카데미·로그인 **7페이지 렌더 OK, JS 에러 0건** |
| 로그인 필요 화면(MyPage·관리자) | 렌더 스모크 미수행 — 제거 심볼이 해당 파일 내 미참조임은 ESLint로 확정(참조가 남았다면 빌드·렌더에서 즉시 오류) |

테스트 수준: Level 2(빌드) + 공개 화면 한정 Level 4(브라우저 렌더).

## 미해결 항목

1. **알림 스케줄러 배선 누락(버그 의심)**: `NOTIFICATION_SCHEDULER_ENABLED` env 플래그와 워커 코드는 있으나 `server.js`가 이를 시작하지 않음 — 플래그를 켜도 자동 알림이 발송되지 않는다. 배선 추가 여부는 기능 결정 사항.
2. `sms.service.js`(알리고 발송)가 dispatch에 연결되지 않음 — SMS/알림톡 실발송은 현재 불가(FCM만 배선). 연동 시점 결정 필요.
3. 삭제 후보 2건(sms.controller.js, status.js 처리 방향) 사용자 판단 대기.
4. styles.css(3.2만 줄)의 미사용 CSS 정리는 동적 클래스 조합 위험으로 이번에 미착수.
5. 로그인 필요 화면(MyPage·관리자 8페이지)의 브라우저 회귀는 미수행 — 빌드·정적 근거로만 확인.

## 다음 묶음이 해야 할 일 (묶음 7: 문서 · 최종 회귀 · 결과 보고)

1. **최종 회귀(STEP 16)에서 MyPage와 관리자 변경 페이지 8곳의 로그인 후 화면 렌더·핵심 동작을 반드시 확인**할 것 (이번 묶음의 검증 공백).
2. 이 문서의 삭제 후보 2건에 대한 사용자 결정을 받아 반영할 것.
3. 미해결 1·2(알림 배선)는 기능 결정이 나면 별도 작업으로 분리할 것.
4. 이 정리 변경분(13파일 수정 + 1파일 삭제)의 커밋 여부를 사용자에게 확인할 것.

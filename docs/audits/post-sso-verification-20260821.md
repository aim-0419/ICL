# SSO 재인증 후 통합 검증 (2026-08-21)

- 목적: `full-test-20260821.md`·`security-tier1-20260821.md` 에서 DB 미연결로 남았던 미검증 항목을 실측
- 환경: 개발 서버 + 개발 DB(`homepage_dev`), `TEST_SAFE_MODE=true`, 외부 발송·결제 호출 전부 차단. 운영 미접근
- 코드 변경: **없음** (검증 전용). git add/commit/push 없음
- 검증 수준: **Level 3(API/DB 연동) + Level 4(브라우저 E2E)** 도달
- A 검증 브랜치: `hotfix/security-tier1` / C 검증 브랜치: `fix/play-store-compliance`

## 결과 요약

| 구분 | 항목 | 결과 | 근거 | 비고 |
|---|---|---|---|---|
| A | ① 공개 Q&A 비로그인 조회 | **정상** | HTTP 200, 제목·본문·답변 1건 모두 노출 | 기능 후퇴 없음 |
| A | ② 타인 비밀 Q&A (비로그인) | **정상** | `hidden:true`, `title:"비공개 질문입니다."`, `content:""`, **replies 0건** | S-1 차단 확인 |
| A | ② 타인 비밀 Q&A (타인 로그인) | **정상** | 동일하게 마스킹 + replies 0건 | |
| A | ③ 본인 비밀 Q&A | **정상** | 제목·본문·답변 전문 모두 노출 (`replyCount:1`) | 정상 경로 유지 |
| A | ④ 본인 영상 재생 | **정상** | `HTTP 206`, 2048 bytes, `video/mp4` (Range 지원) | 정상 경로 유지 |
| A | ④ 토큰 URL 비로그인 사용 | **정상(차단됨)** | `HTTP 401 PLAYBACK_USER_MISMATCH` | S-6 차단 확인. 수정 전엔 통과 |
| A | ④ 토큰 URL 타인 사용 | **정상(차단됨)** | `HTTP 401` | |
| A | ⑤ 미리보기 토큰(uid 없음) | **정상** | 비로그인 세션 발급 200(토큰 `uid:""`) → 재생 `HTTP 206` | 회귀 없음 |
| A | ⑥ rate limit 정상 요청 | **정상** | 세션 발급 5회 연속 200 | 차단 안 됨 |
| A | ⑥ XFF 위조 (nginx 뒤) | **정상(차단됨)** | 위조값 매회 변경에도 Remaining 179→176 연속 감소 = 동일 버킷 | S-2 우회 불가 |
| B | ⑦ 로그인·마이페이지·주문·예약 | **정상** | 로그인 200, `/auth/me`·`/orders`·`/cart`·`/academy/progress`·`/studio/classes` 전부 200 | |
| B | ⑧ 관리자 로그인·화면 진입 | **정상** | 관리자 로그인 200, `/admin/members` 200(2.6MB), 대시보드·매출·상품·환불 화면 렌더 OK | |
| B | ⑨ 주요 API 정상 응답 | **정상** | 회원 API 7종·관리자 API 6종 200 | 미인증 401은 기존 확인 |
| B | ⑩ DB 정합성 | **정상** | 주문 API 1건 = DB 1건, id·금액 일치. Q&A 2건 DB 일치 | 삼자 일치 |
| C | ⑪ MyPage | **정상** | 렌더 584자, **JS 에러 0** | 정리 회귀 없음 |
| C | ⑫ 관리자 8페이지 | **정상** | 대시보드·상품·환불·영상선물·메시지·게시판·운영·회원목록 전부 렌더, **JS 에러 0** | |
| C | ⑬ AdminImageEditor·AdminStudioPass | **정상** | 렌더 OK, JS 에러 0 | 미호출 함수 제거 영향 없음 |
| C | ⑭ BrandPages 4종 | **정상** | 소개·강사진·시설·오시는길 렌더, JS 에러 0 | `BrandPageLayout`·fetch 제거 영향 없음 |
| D | ⑮ 미등록 API | **문제** | 관리자 인증 상태에서 **11종 404** | 아래 §2 |

**총 14페이지 브라우저 검증 결과 JS 에러 0건**, 콘솔 에러는 전부 미등록 API(404) 응답에서 파생된 것으로 코드 정리와 무관합니다.

## 1. 보안 Tier 1 실 API 검증 (A) — 회귀 없음

세 수정 모두 **취약 경로는 차단되고 정상 경로는 그대로 열려 있음**을 실제 HTTP 응답으로 확인했습니다.

- 검증 중 발견한 주의점: 최초 본인 재생이 `404 PLAYBACK_FILE_NOT_FOUND` 였는데, 이는 **인증·토큰·소유권 검사를 모두 통과한 뒤** 로컬 `uploads-dev` 에 영상 파일이 없어 난 것이었습니다. 테스트 영상을 배치한 뒤 재검증해 `206` 정상 재생을 확인했습니다(개발 EC2에 실제 영상 파일이 없는 것은 별개 이슈로 8/20 QA에서도 동일하게 확인됨).

## 2. 미등록 API로 죽어 있는 관리자 기능 (D) — 문제

관리자로 로그인한 상태에서 실측했으므로 **인증 실패(401)가 아니라 라우트 자체가 없는 404** 입니다. 화면은 열리지만 데이터를 불러오지 못해 **빈 화면**이 됩니다(본문 216~461자).

| 화면 | 경로 | 죽은 기능 | 호출 API (404) |
|---|---|---|---|
| 설정 - 기본정보 | `/admin/settings/basic` | 스튜디오 기본정보 조회·저장 | `GET/PUT /studio/admin/settings/info` |
| 설정 - 룸 관리 | `/admin/settings/rooms` | 룸 목록·추가·수정·삭제 | `/studio/admin/settings/rooms`, `/studio/admin/rooms` |
| 설정 - 역할 관리 | `/admin/settings/roles` | 역할 목록·권한 설정 | `/studio/admin/settings/roles`, `/studio/admin/roles` |
| 설정 - 회원등급 | `/admin/settings/member-grades` | 등급 조회·추가·삭제 | `/studio/admin/member-grades` |
| 설정 - 수업 카테고리 | `/admin/settings/class-categories` | 카테고리 조회·추가·삭제 | `/studio/admin/class-categories` |
| 메시지 관리 | `/admin/messages` | 메시지 템플릿 조회·저장·삭제 | `/studio/admin/message-templates` |
| 운영 관리 | `/admin/operations` | 미수금 목록 조회 | `/studio/admin/arrears` |
| 회원 목록 | `/admin/member-list` | 회원 메모 조회·작성 | `/studio/admin/memos` |
| 스튜디오 매출 | `/admin/studio/sales` | 지출 등록·조회 | `/studio/admin/expenses` |

브라우저 실측에서도 설정 5개 화면이 열리자마자 해당 404가 발생하는 것을 네트워크 로그로 확인했습니다. 컨트롤러 함수는 `studio.controller.js` 에 구현되어 있으나 `studio.routes.js` 에 라우트 등록이 빠진 상태입니다(수정하지 않음).

## 3. 검증에 사용한 seed 데이터 — 전량 삭제 완료

| 종류 | 내용 |
|---|---|
| 회원 3명 | `vfy_owner`(작성자·구매자), `vfy_other`(타인), `vfy_admin`(관리자) |
| 주문 1건 | 영상 구매 (재생 토큰 발급용) |
| Q&A 4건 | 비밀글 1 + 공개글 1, 각각 답변 1건 |
| 미리보기 챕터 1건 | ⑤ 검증용 (`is_preview=1`) |
| 재생 세션 7건 | 검증 중 발급분 |

**삭제 결과**: `users 0 / orders 0 / qnaPosts 0 / qnaReplies 0 / chapters 0` — **잔존 0 확인**. 로컬에 배치한 테스트 영상 파일과 임시 검증 스크립트 4개도 삭제했습니다. 최종 `git status` 클린.

## 미해결 항목

1. **D의 미등록 API 11종** — 관리자 설정·메시지·운영·메모·지출 기능이 동작하지 않음. 라우트 등록 또는 화면 비활성화 결정 필요
2. **보안 Tier 2 미수정** — S-3(타인 업로드 파일 삭제), S-4(스태프 권한 플래그 미검사), S-5(강사의 전 회원 PII 열람), S-7(수강권 환불 금액 미검증), S-8(매출 PIN 평문)
3. **`hotfix/security-tier1` 미병합** — 운영에 취약점이 남아 있는 상태
4. **개발 EC2에 실제 영상 파일 부재** — dev 환경에서 영상 재생 e2e를 하려면 파일 업로드 필요
5. `frontend/_original-assets/` 미추적 폴더 잔존 — 이미지 최적화 원본 보관용, 보호 규칙에 따라 손대지 않음

## 다음 세션이 해야 할 일

1. **`hotfix/security-tier1` 의 main 병합 승인 여부 결정** — 실 API 검증까지 끝났으므로 배포 판단 가능. 병합 전 `docs/QA_DEPLOY_CHECKLIST.md` 확인 필요(main push = 운영 배포)
2. 병합 후 **`fix/play-store-compliance` 에도 동일 수정 반영** 여부 결정(같은 취약점 존재)
3. **D의 11종 처리 방침 결정** — 라우트를 등록해 기능을 살릴지, 화면을 감출지
4. Tier 2 수정 계획 — S-3·S-4는 DB 스키마 검토가 필요하므로 승인 절차 선행

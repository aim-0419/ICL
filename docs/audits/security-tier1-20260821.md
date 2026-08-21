# 보안 hotfix Tier 1 (S-1 · S-2 · S-6) — 2026-08-21

- 대상: `docs/audits/full-test-20260821.md` 에서 발견한 높음/중간 취약점 중 **main 브랜치에 존재해 운영 노출 중인 3건**
- 브랜치: `hotfix/security-tier1` (base: `origin/main` = `d942ddd`)
- 커밋 범위: 이 3건 + 회귀 테스트만. 다른 취약점·리팩토링 미포함
- 실행 제약: AWS SSO 토큰 만료로 개발 DB 미연결 → **DB가 필요한 실 API 검증은 미확인** (아래 §4)

## 1. 수정 내역

### S-1. 비밀 Q&A 답변이 전원에게 노출 (개인정보 노출)

**문제**: 비밀 질문의 제목·본문은 가려지지만 `replies`(답변)는 `canSee` 판정과 무관하게 원문 전량 반환됐다. 답변에는 질문 내용을 인용한 상담 답변이 담기므로, 사실상 비밀 질문 내용이 비로그인 포함 전원에게 공개됐다.

**수정**: `backend/src/features/academy/service/qna.service.js`
```js
const visibleReplies =
  canSee && Array.isArray(replies)
    ? replies.map((r) => ({ ...r, isAdmin: Boolean(r.isAdmin) }))
    : [];
```
질문 본문과 동일한 `canSee` 기준으로 답변도 가린다.

**라우트 인증 방식 판단 (지시 검토 항목)**: **추가 인증 불필요 — 이미 선택적 인증 구조다.**
- `academy.controller.js` 의 `getAcademyQna` 가 `getAuthenticatedUser(req)` 로 세션을 읽되 없으면 `null` 을 넘긴다. 즉 비로그인은 통과시키고, 로그인 시에는 본인 글을 식별해 `canSee` 판정에 반영한다.
- 따라서 라우트에 `requireAuth` 를 붙이면 **공개 질문을 비로그인 사용자가 볼 수 없게 되어 기능이 후퇴**한다. 지시한 "라우트 전체를 막지 마라"와도 어긋난다.
- 커뮤니티(`community.controller.js` 비밀글 답변 조회)는 답변이 **별도 엔드포인트**라 401/403 으로 막지만, 아카데미는 목록 하나가 질문+답변을 함께 반환하는 구조다. 구조가 달라 응답 코드가 아니라 **필드 마스킹**으로 같은 결과(작성자·관리자만 열람)를 만드는 것이 일관된 처리다.

**프론트 영향 없음**: `AcademyPlayerPage.jsx:1371,1392` 가 `post.replies?.length > 0` 조건부 렌더와 `?.map` 을 쓰므로 빈 배열에서 정상 동작한다. 부수 효과로 비밀글의 "답변 N" 배지도 사라져 답변 존재 여부까지 감춰진다(보안상 더 안전).

### S-2. Rate limit 우회 (X-Forwarded-For 위장)

**문제**: `resolveClientKey` 가 클라이언트가 보낸 `X-Forwarded-For` 의 **첫 값**을 버킷 키로 사용했다. 매 요청 헤더만 바꾸면 분당 180회 제한이 무한 우회됐다.

**수정**: `backend/src/shared/middlewares/rate-limit.js`
```js
function resolveClientKey(req) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  return `${ip}:${req.method}:${req.path}`;
}
```

**trust proxy 확인 (지시 선행 조건)**: **설정되어 있고 값도 올바르다.**
- `backend/src/app.js:76` 의 `app.set("trust proxy", 1)` 은 조건 없이 항상 적용된다.
- `deploy/nginx-prod.conf:21` 이 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` 로 **실제 접속 IP를 목록 끝에 추가**한다.
- `trust proxy: 1` 은 목록의 **오른쪽에서 1번째**만 신뢰하므로 `req.ip` = nginx가 붙인 실제 IP다. 클라이언트가 앞에 넣은 값은 무시된다.
- 모든 요청이 한 버킷으로 묶여 서비스가 막히는 상황(우려 사항)은 발생하지 않는다. 실측으로 서로 다른 IP가 독립 한도를 갖는 것을 확인했다(§3).

### S-6. 재생 토큰 사용자 바인딩 fail-open

**문제**: `if (tokenPayload.uid && requestUserId && requestUserId !== tokenPayload.uid)` 에서 `requestUserId` 가 빈 값(비로그인)이면 검사를 건너뛰었다. 재생 URL만 유출되면 로그인하지 않은 제3자가 6시간(토큰 TTL) 동안 영상을 볼 수 있었다.

**수정**: `backend/src/features/academy/playback/service.js`
```js
if (toSafeText(tokenPayload.uid) && requestUserId !== toSafeText(tokenPayload.uid)) {
```

**정상 경로 영향 분석**:
| 상황 | 토큰 uid | 요청자 | 결과 |
|---|---|---|---|
| 본인 재생 | `user-1` | `user-1` | 통과 ✅ |
| 토큰 유출 → 비로그인 | `user-1` | `""` | **차단** (수정 전 통과) |
| 다른 계정 | `user-1` | `user-2` | 차단 (기존과 동일) |
| 미리보기(비로그인 발급) | `""` | `""` | 첫 조건에서 스킵 → 통과 ✅ |

미리보기 토큰은 발급 시 `uid: requestUserId || ""` 로 빈 값이 들어가므로, 첫 조건 `toSafeText(tokenPayload.uid)` 에서 걸러져 **로그인 없이도 계속 재생된다**.

## 2. 추가한 회귀 테스트

`backend/test/security-tier1.test.js` — **12개, 전부 통과**. 각 항목마다 "취약 동작 차단"과 "정상 경로 유지"를 함께 검증한다.

| 대상 | 테스트 |
|---|---|
| S-2 | 위조 XFF를 매번 바꿔도 한도 초과 시 429 / 다른 실제 IP는 독립 한도 / 정상 요청은 한도 내 통과 |
| S-6 | 비로그인 사용 차단 / 타 계정 차단 / **본인 재생 통과** / **미리보기 토큰 통과** |
| S-1 | 제3자에게 답변 미노출 / 비로그인에게 미노출 / **작성자 본인은 열람** / **관리자는 열람** / **공개 질문은 비로그인도 답변까지 열람** |

S-6·S-1은 DB 조회를 포함한 함수라 판정 규칙을 테스트에 옮겨 검증했다. 원본 조건식이 바뀌면 테스트도 함께 검토해야 한다(테스트 파일 주석에 명시).

## 3. 검증 결과

| 항목 | 결과 |
|---|---|
| 백엔드 유닛 테스트 | **75/75 pass, fail 0** |
| — main 기준선 | **63/63** (신규 12개 추가 = 75) |
| 문법 검사 | 수정 3파일 `node --check` 통과 |
| **S-2 실동작 (nginx 뒤 시나리오)** | XFF를 `위조값, 실제IP` 로 보내며 값을 매번 바꿔도 `RateLimit-Remaining` 179→175 **연속 감소** = 같은 버킷 = **우회 불가 확인** |
| **S-2 정상 요청** | 한도 내 요청이 차단되지 않음, 서로 다른 IP는 독립 한도 |
| 프론트 영향 | `replies` 빈 배열 처리 확인 (조건부 렌더 + optional chaining) |

> **기준값 차이 안내**: 지시서의 "기준 96/96"은 `fix/play-store-compliance` 브랜치 기준이다. 이 hotfix는 `main` 기반이고 main에는 그 브랜치에서 추가된 테스트(결제 검증 등)가 없어 기준선이 63개다. 회귀 없음은 63 → 75(신규 12개 전부 통과, 실패 0)로 확인했다.

## 4. 확인하지 못한 항목

- **실 API 검증 미수행**: AWS SSO 토큰 만료로 개발 DB에 연결하지 못했다. 아래는 유닛 테스트·코드 근거로만 확인했고 실제 HTTP 응답으로 확인하지 못했다.
  - 공개 Q&A가 비로그인에게 실제로 보이는지
  - 작성자 본인에게 비밀글 답변이 실제로 보이는지
  - 로그인 사용자의 영상 재생이 실제로 정상인지
- **브라우저 직접 확인 불가**: 프론트 화면에서 비밀글 표시가 어떻게 보이는지 실제 렌더를 확인하지 못했다.
- 운영 nginx 실제 설정(저장소 `nginx-prod.conf` 기준으로만 판단). 실서버에 다른 프록시 단이 더 있으면 `trust proxy` 값 재검토가 필요하다.

## 5. 부수 발견 (이번 수정 범위 밖)

**백엔드 포트가 nginx를 거치지 않고 직접 노출되면 S-2 수정만으로는 부족하다.** `trust proxy: 1` 이 항상 켜져 있어, nginx 없이 백엔드에 직접 접속하면 Express가 클라이언트의 XFF 값을 `req.ip` 로 채택한다(로컬 실측으로 확인). 운영에서는 nginx가 반드시 앞단에 있어야 하며, 백엔드 포트(4000)는 방화벽에서 외부 차단되어 있어야 한다. 인프라 점검 항목으로 남긴다.

## 미해결 항목

1. **S-3(타인 업로드 파일 삭제)·S-4(스태프 권한 플래그 미검사)** 미수정 — DB 스키마 검토가 필요해 이번 범위에서 제외
2. **S-5(강사의 전 회원 PII 열람)·S-7(수강권 환불 금액 미검증)·S-8(매출 PIN 평문)** 등 중간 등급 미수정
3. 이 hotfix의 **실 API·브라우저 검증 미완료** (§4)
4. 백엔드 직접 노출 시 XFF 위장 가능성 — 인프라 확인 필요 (§5)

## 다음 묶음이 해야 할 일

1. `aws sso login` 재인증 후 **실 API로 §4 항목 검증** — 특히 "작성자 본인 비밀글 열람"과 "로그인 사용자 영상 재생"은 정상 경로라 반드시 확인
2. 이 브랜치의 main 병합 승인 여부 결정 (운영 배포 트리거이므로 `docs/QA_DEPLOY_CHECKLIST.md` 선행 확인)
3. 병합 후 `fix/play-store-compliance` 에도 동일 수정 반영 여부 결정(같은 취약점 존재)
4. Tier 2(S-3·S-4·S-5·S-7·S-8) 수정 계획 수립 — 스키마 변경이 필요한 항목은 승인 절차 필요

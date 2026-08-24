# Android 핵심 기능 검증 (백엔드 연결) — 2026-08-20 (프롬프트 E2)

브랜치 `fix/play-store-compliance`. 코드 미변경. 에뮬레이터 Pixel 8(API 36).
연결: 앱(dev 빌드) → adb reverse 4001 → **개발 EC2 백엔드(실제 dev 서버, 영상 파일 보유)** → homepage_dev.
보유 계정은 homepage_dev 에 직접 seed(테스트 후 삭제, 잔존 0).

**실제 수행 여부:** 실제 결제 **미수행**. 실제 SMS·알림톡 발송 **미수행**. 운영 환경 미접근.

## 🔴 핵심 발견 — 앱에서 교육영상 재생 불가 (운영 영향)

| 영역 | 항목 | 결과 | 근거 | 심각도 |
|---|---|---|---|---|
| A 영상 | **영상 바이트 재생** | **문제(HIGH)** | `<video>` 로드 실패: `Unable to open asset URL: https://localhost/api/academy/playback/stream/…` | **High** |

**근본 원인:** 백엔드가 재생 URL 을 **상대경로**로 반환한다.
`backend/src/features/academy/playback/service.js:144` → `playbackUrl: "/api/academy/playback/stream/{chapter}?token=…"`.
프론트는 이를 그대로 `<video src>` 에 넣는다(`AcademyPlayerPage.jsx:965` `securePlaybackSource = playbackSession.playbackUrl`).

- 웹: 앱과 API 가 같은 origin 이라 `/api/…` 가 정상 해석됨.
- **앱(Capacitor WebView, origin `https://localhost`)**: `<video src="/api/…">` 가 `https://localhost/api/…` 로
  해석되어 **로컬 에셋으로 열려다 실패**한다. API 호출은 CapacitorHttp(base=http://localhost:4001)로 가지만,
  `<video>` 는 네이티브 로딩이라 base 를 타지 않는다.
- **운영도 동일**: 앱 origin 은 `https://localhost` 로 고정(capacitor.config, server.url 없음). 운영에서도
  `<video src="/api/…">` 는 `https://localhost/api/…` 가 되어 icl-pilates.com 을 가리키지 못한다 → **재생 불가**.
- 대조: 포스터/썸네일은 `resolveAcademyMediaUrl`(API base 접두)로 절대경로를 만들어 정상. **영상 src 만 누락**.

리더 앱 전략상 앱의 핵심이 "보유 영상 시청"인데 그 기능이 앱에서 동작하지 않는다. **출시 전 수정 필수.**
(수정 방향 예: playbackUrl 을 절대경로로 반환하거나, 프론트에서 API base 를 접두. 코드 수정은 이 QA 범위 밖.)

## 나머지 결과

| 영역 | 항목 | 결과 | 근거 |
|---|---|---|---|
| A 영상 | 로그인(보유 계정) | **정상** | e2_qa_owner 로그인 성공, 하단탭 로그인→마이 전환 |
| A | 보유 영상 목록·상세 표시 | **정상** | 아카데미에 "테스트용" 표시, 상세에 "영상 수강하기" 버튼(구매 아님) |
| A | 재생 토큰·세션 발급 | **정상** | `POST /api/academy/playback/heartbeat` 200, sessionId·expiresAt 발급 |
| A | 워터마크(사용자 식별) | **정상** | 플레이어에 "e2_qa_owner · 테스트용 · 1차시" 오버레이 |
| A | 배속·진도 UI | **정상** | 0.75x~2x, 강의 진도 0% 렌더 |
| A | 재생/일시정지/탐색/전체화면/백그라운드 정지/이어보기 | **미확인** | 영상 바이트가 로드되지 않아 재생 조작 자체 불가(위 HIGH 버그에 종속) |
| A | 미보유 영상 직접 재생 차단 | **정상(구조)** | `/uploads/academy/videos` 는 `denyDirectVideoAccess`(app.js:179)로 토큰 필수. 재생 토큰은 소유자에게만 발급 |
| A | 재생 토큰 만료 | **부분** | 토큰 exp 발급 확인. 만료 후 거부는 시간 경과 필요로 미확인 |
| B 예약 | 예약 페이지 로딩 | **정상** | 수강권 없을 때 "보유 수강권 없음 + 센터 문의"(장덕/효천) 안내 |
| B | 수강권 인식 | **정상** | 수강권 seed 후 "예약 가능 10회 · 보유 수강권 1개" 표시 |
| B | 예약 캘린더(일/주/월)·스케줄 | **정상** | 이번 주 일자 카드, "장덕점 수업 스케줄" 렌더 |
| B | 예약 생성/취소/정원·수강권 상태 버튼 | **미확인** | 개발 DB 에 **예약 가능한 미래 수업 0건**(이번 주 모두 0개). 미래 수업 seed 필요 |
| B | 앱 재시작 후 예약 상태 유지 | **미확인** | 예약 생성 자체를 못 해 확인 불가 |
| C 결제 | 앱 내 결제 가능 경로 | **없음(정상)** | 교육영상은 앱에서 "수강하기"만(구매 차단). 수강권은 예약 화면에서 "센터로 연락" 안내 → **앱에 결제 진입점 없음** |
| D 푸시 | 알림 권한 요청 UI / 거부 후 동작 | **정상(부분)** | 실행 시 권한 다이얼로그 강제 없음, 크래시 없음 |
| D | 푸시 미설정(google-services 없음) 오류·크래시 | **정상** | FATAL 로그 0건. 푸시 초기화가 안전하게 건너뜀 |

## 요약

- **가장 중요한 결과: 앱에서 교육영상이 재생되지 않는다(HIGH, 운영 영향).** 재생 URL 이 상대경로라
  앱 WebView origin(`https://localhost`)에 붙어 API 서버를 못 가리킨다. 리더 앱의 핵심 기능이 막힌다.
  플레이어 진입·소유권·토큰·워터마크·진도 UI 는 모두 정상이므로, 수정 지점은 **영상 src 의 절대경로화** 하나다.
- **예약**은 UI·수강권 인식·캘린더까지 정상. 다만 개발 DB 에 미래 수업이 없어 예약 생성/취소는 미검증.
- **결제**: 앱에 결제 진입점이 없음(리더 앱 전략과 일치). Play 결제 정책 리스크 없음.
- **푸시**: 미설정 상태에서 크래시·강제 권한 없음.

## 미해결 / 필요 조건

1. **영상 재생 URL 절대경로화** — 코드 수정 필요(별도). 이 QA 는 수정하지 않음.
2. **예약 생성/취소 검증** — 개발 DB 에 예약 가능한 미래 수업(studio_classes + 영업시간 + room) seed 필요.
3. **재생/탐색/전체화면/백그라운드 정지/이어보기** — 1번 수정 후 재검증.
4. **토큰 만료 거부** — 만료 시점 경과 후 확인.

## 정리

- seed 데이터(e2_qa_owner 계정·주문·결제확정·수강권·재생세션) 삭제 완료(잔존 0).
- 개발 EC2 API 터널·DB 터널·adb reverse 제거 완료. 에뮬레이터는 실행 중.

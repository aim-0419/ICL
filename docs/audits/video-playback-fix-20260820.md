# 영상 재생 URL 수정 보고서 (2026-08-20)

- 대상: 앱(WebView)에서 교육영상 재생 실패 — 출시 차단 HIGH 버그
- 근거 QA: [android-core-qa-20260820.md](android-core-qa-20260820.md)
- 브랜치: `fix/play-store-compliance` (커밋하지 않음 — 지시에 따름)
- 검증 환경: Windows 로컬 + Android 에뮬레이터(Pixel, API 36) + 개발 DB(SSM 터널) + 로컬 백엔드(4001)

---

## 1. 원인 (검증 완료)

| # | 사실 | 근거 |
|---|---|---|
| 1 | 백엔드가 재생 URL을 상대경로로 반환 | `backend/src/features/academy/playback/service.js:144` → `/api/academy/playback/stream/{chapterId}?token=…` |
| 2 | 앱 WebView origin이 `https://localhost` → `<video>`가 `https://localhost/api/…`로 해석 | E2 로그 `Unable to open asset URL: https://localhost/api/academy/playback/stream/…` |
| 3 | `<video>`는 네이티브 미디어 로더라 CapacitorHttp base(절대 API 주소)를 타지 않음 | Capacitor 동작 특성 |
| 4 | 기존 헬퍼 `resolveApiAssetUrl`은 `/uploads/`만 절대화 → `/api/` 경로엔 무효 | `frontend/src/shared/api/client.js:27` |
| 5 | 수정 지점 2곳: 선언형 src + 명령형 `videoElement.src` | `AcademyPlayerPage.jsx:965`(현 966), `:732`(현 733-736) |

## 2. 해결 방식 비교·결정

| 안 | 내용 | 판단 |
|---|---|---|
| (a) 공유 헬퍼 확장 | `resolveApiAssetUrl` 허용목록에 `/api/` 추가 | 기존 호출부 4곳(academyApi·communityApi·HomePage·defaultPageOverrides) 전수 조사 결과 `/api/`를 넘기는 곳 0곳이라 당장은 무해하나, 공유 미디어 헬퍼의 계약이 넓어짐 |
| **(b) 전용 헬퍼 신설** ✅ 채택 | `resolveApiUrl(path)` 신설 — `/api/` 경로만 절대화 | **최소 변경·부작용 0.** 기존 헬퍼 미변경, 재생 URL 2곳만 감쌈 |
| (c) 백엔드 절대 URL 반환 | 서버가 `PUBLIC_API_ORIGIN` env로 origin 조립 | env 신설 + API 응답 구조 변경 + 배포 설정 의존 → 가장 침습적 |

사용자 승인: **(b)**.

## 3. 변경 내용 (2파일, 커밋 안 함)

### `frontend/src/shared/api/client.js` (+12줄)
```js
// 서버가 상대 경로(`/api/...`)로 반환하는 API 엔드포인트 URL을 앱에서 절대 주소로 변환합니다.
// <video>·<audio> 등 네이티브 로더는 CapacitorHttp base를 타지 않아 origin이 필요합니다.
// 웹에서는 API base가 상대(`/api`)라 getApiOrigin()이 ""를 반환 → 상대 경로 그대로 유지됩니다.
export function resolveApiUrl(value) { … }
```
- `getApiOrigin()` 재사용: 웹(`VITE_API_BASE_URL=/api`) → `""` 반환 → **접두 없음(웹 동작 불변)**. 앱(절대 base) → origin 접두.
- `blob:`/`data:`/절대 URL/비`/api/` 경로는 그대로 통과.

### `frontend/src/features/academy/pages/AcademyPlayerPage.jsx` (2지점 + import)
- `:733-736` 명령형: `const url = resolveApiUrl(String(playbackSession?.playbackUrl || "").trim());`
- `:966` 선언형: `const securePlaybackSource = resolveApiUrl(String(playbackSession?.playbackUrl || "").trim());`
- 재생 권한·토큰 검증 로직 미변경 (URL 해석만 수정).

## 4. 추가 점검 결과 (지시 4항)

| 항목 | 결과 | 근거 |
|---|---|---|
| HTTP Range 지원 | ✅ 지원 | 핸들러가 `res.sendFile` 사용(`academy.controller.js:162`) → Express가 206/Content-Range 자동 처리, `Accept-Ranges: bytes` 명시(`:157`). 실측: seek 정상 동작 |
| 크로스오리진 로딩 | ✅ 문제없음 | 플레이어에 canvas/drawImage/crossOrigin 없음(워터마크=DOM 오버레이) → 일반 `<video>` 미디어 로드는 CORS 불요·taint 없음. 실측 재생 성공 |
| 토큰 쿼리 인코딩 | ✅ 무손상 | origin을 앞에 붙이기만 함(문자열 불변). 웹 실측 srcAttr 토큰 = 세션 응답 토큰 동일 |

## 5. 검증 결과

### 앱 (에뮬레이터, 개발 DB + 로컬 백엔드 4001)
개발 EC2에는 해당 영상의 실제 파일이 없어(스텁, `duration_sec=0` / stream 404 `PLAYBACK_FILE_NOT_FOUND`) **재생 바이트 검증은 로컬 백엔드 + 유효 MP4(8초)** 로 수행. URL 해석 검증에는 영향 없음.

| 시나리오 | 결과 | 증거 |
|---|---|---|
| 재생 시작 | ✅ | 프레임 렌더·8초 완주, 진도 0→100%·완강 기록 |
| 기존 버그 소멸 | ✅ | logcat에 `https://localhost/api` **0건** (E2에서는 발생) |
| 탐색(seek) | ✅ | 스크러버 탭 → 위치 이동·해당 프레임 표시 (Range 서빙) |
| 전체화면 전환/복귀 | ✅ | 전체화면 렌더 확인, BACK으로 복귀 |
| 백그라운드 정지 | ✅ | 재생→HOME 5초→복귀: `0:01`에서 정지(진행 없음) |
| 이어보기 | ✅(제한적) | 재진입 시 중간 프레임 표시. 로직은 URL 수정과 무관 |
| 챕터 전환 유지 | N/A | 개발 DB에 실파일 영상 1개(단일 차시)뿐 — 명령형 경로(`:733`)가 세션 URL 갱신을 처리함은 코드로 확인 |
| 미보유 차단 회귀 | ✅ | 토큰 없는 stream → 400, `/uploads/academy/videos/` 직접 → 403 (`denyDirectVideoAccess`) |

### 웹 (Vite 5174 + 프록시, Playwright 실측)
| 항목 | 결과 |
|---|---|
| `getApiOrigin()` 웹 반환값 | `""` (base가 상대 `/api`) → **절대화 미적용** |
| `<video src>` 속성 | `/api/academy/playback/stream/…` **상대경로 그대로 유지** |
| currentSrc | 페이지 origin으로 해석(`localhost:5174/api/…`) → 프록시 경유 정상 |
| 재생 | `readyState=4`, `duration=8.1s`, play 후 `currentTime=2.46s` 진행 — **웹 재생 정상** |
| 비로그인 차단 | 플레이어 접근 시 `/login` 리디렉트 |
| 요청 실패 | 0건 |

### 운영 영향 예측
- 운영 앱: `VITE_API_BASE_URL=https://<운영 도메인>` (`.env.app.production.example`) → `resolveApiUrl`이 운영 origin을 접두 → 해결.
- 운영 웹: base 상대 → 동작 불변(회귀 없음).

## 6. 중단 지점 해당 여부
- 부작용 범위 넓음: 해당 없음 (전용 헬퍼, 호출부 2곳)
- 웹 회귀: **없음** (실측)
- Range 미지원: 해당 없음 (sendFile 자동 지원 + 실측 seek 정상)
- 미보유 차단 우회: **없음** (400/403 유지)

## 7. 남은 항목 / 권고
1. **개발 EC2에 실제 영상 파일 업로드** — dev 환경 e2e에서 재생 바이트까지 확인하려면 `uploads-dev(EC2 UPLOAD_ROOT)/academy/videos/aee3ab32-…-ch1.mp4` 실파일 필요 (이번엔 로컬 백엔드로 대체 검증).
2. 다중 차시 영상 등록 후 **챕터 전환 재생 유지** 실측 1회 권장 (코드 경로는 커버됨).
3. 이 수정은 앱 출시 차단 해소용 — 커밋/배포 시점은 지시에 따름.

## 8. 정리 상태
- seed 데이터(계정 1·주문 1·재생세션 5·차시진도 1) 전부 삭제, 잔존 0 확인
- 임시 QA 스크립트(backend/frontend `_qa_*.mjs`) 및 로컬 테스트 MP4 삭제
- 로컬 백엔드·Vite·SSM 터널(api/db) 종료, adb reverse 제거
- git 변경분: 수정 2파일만 (`client.js`, `AcademyPlayerPage.jsx`) — 미커밋

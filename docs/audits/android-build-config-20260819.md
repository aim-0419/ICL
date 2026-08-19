# Android 빌드 설정 정비 결과 — 2026-08-19 (프롬프트 A)

브랜치 `fix/play-store-compliance`. 커밋하지 않은 작업 트리 상태로 남긴다.
시작 시 `git status --short`: 미추적 문서 2건(`AI_PROMPTS_ANDROID.md`, `APP_STORE_REVIEW_GUIDE.md`)뿐, 둘 다 건드리지 않았다.

## 1. versionCode / versionName 주입 — 완료

- 원본 파일 신설: `frontend/app-version.json` (Git 추적) — 현재 `versionCode 1 / versionName "1.0"`.
- `configure-native.mjs`에 `configureAndroidAppVersion()` 추가. sync 때마다 `android/app/build.gradle`의
  하드코딩 값을 교체한다. `android/`가 재생성돼도 버전이 유지되는 구조.
- 환경변수 `APP_VERSION_CODE` / `APP_VERSION_NAME`이 있으면 파일보다 우선(CI 대비, CI 설정은 건드리지 않음).
- **실패 경로 검증 완료**: 파일 없음 → exit 1 / `versionCode 0` → 예외로 sync 중단. 조용히 1로 떨어지지 않는다.

## 2. 릴리즈 AAB 빌드 스크립트 — 완료

- `frontend/scripts/build-android-release.mjs` + `npm run build:android:aab`.
- 흐름: **keystore.properties 확인(최우선) → cap sync production → gradlew bundleRelease → 산출물 보고**.
- keystore 확인을 맨 앞에 둔 이유: 없으면 몇 분짜리 sync를 돌린 뒤에야 쓸모없는 미서명 AAB가 나온다.
- **현 상태 검증 완료**: keystore가 없으므로 "서명 키가 설정되지 않았습니다 + 부록 1 안내" 메시지와 exit 1. 이것이 현재의 정상 동작이다.

## 3. 딥링크 scheme — 근거 확보, iclpilates 로 통일

| 위치 | 값 | 근거 |
|---|---|---|
| AndroidManifest intent-filter | `iclpilates` | configure-native 주입 (`:86-92`) |
| iOS CFBundleURLSchemes | `iclpilates` | configure-native 주입 (`:58-79`) |
| JS 딥링크 처리 | `iclpilates:` **및** `com.iclpilates.app:` 수용 | `runtime.js:4` |
| strings.xml `custom_url_scheme` | `com.iclpilates.app` → **iclpilates 로 변경** | 아래 |

판단 근거:
- `custom_url_scheme`을 참조하는 코드가 **없다** — 앱 소스, 앱 매니페스트, Capacitor 8 라이브러리 전체 grep 0건. Capacitor 구버전 템플릿 잔재다.
- **PortOne 결제 복귀는 커스텀 스킴을 쓰지 않는다.** `requestExternalPayment.js:118` `redirectUrl: config.successUrl`
  = `${origin}/success` — 웹 URL 리다이렉트다. `appScheme` 파라미터 미사용. 게다가 앱에서는 결제 진입 자체가
  `NativePurchaseNotice`로 차단되므로 결제 복귀 경로에 스킴이 관여하지 않는다.
- 따라서 이 변경은 동작 변경이 아니라 **표기 정리**다. 실사용 3곳(iclpilates)과 일치시켰고,
  `runtime.js`의 `com.iclpilates.app:` 수용은 방어적 폴백으로 유지했다.

## 4. AAB 용량 분석 — R8 판정: 실익 낮음, 적용 보류 권고

`app-release.aab` 44.6MB의 비압축 구성:

| 구역 | 비압축 크기 | 비중 |
|---|---|---|
| base/assets (웹 자산) | **42.99 MB** | ~81% |
| base/dex | 9.43 MB | ~18% |
| base/res + lib + root 등 | ~1.0 MB | ~2% |

assets/public 1MB 이상 (상위):

| 크기 | 파일 |
|---|---|
| 12.30 MB | admin-defaults/instructors/instructor-05.jpg |
| 6.88 MB | images/home/certificate-template-a4.png |
| 4.24 MB | instructor-06.jpg |
| 2.54 / 2.14 MB | instructor-01/02.jpg |
| 1.83 MB | 메인 히어로 PNG |
| 1.56 / 1.54 / 1.54 / 1.37 MB | 수료증·인트로 PNG류 |

- 소스맵(.map): **없음**. 네이티브 lib: 0.02MB로 무시 가능.
- **판정**: 용량의 81%가 웹 자산(대부분 이미지)이고 dex는 18%다. R8(minify)로 줄일 수 있는 것은
  dex 일부(최대 수 MB)뿐인데, Capacitor/WebView/Firebase 리플렉션 파손 위험을 감수할 가치가 없다.
  **minifyEnabled 미적용 유지 권고.** 실효적 감량은 이미지 최적화다:
  강사 사진 5장 리사이즈+WebP 변환만으로 ~20MB, 수료증·히어로 PNG까지 하면 ~30MB 감량 여지.
  특히 `instructor-05.jpg` 12.3MB는 원본 크기 그대로 번들된 것으로 보인다.
- 지시대로 minifyEnabled 는 **적용하지 않았다**.

## 5. allowBackup=false — 적용 완료

- 근거: WebView 저장소에 세션 쿠키가 남는데 자동 백업이 이를 기기 밖(Google 백업)으로 복사하면
  세션 탈취 표면이 생긴다. 개인정보·결제·예약 데이터를 다루는 앱이라 백업 편의보다 위험이 크다.
- `configure-native.mjs`의 매니페스트 처리에서 `allowBackup="true"→"false"` 치환. sync 재생성에도 유지된다.

## 검증

| 항목 | 결과 |
|---|---|
| `cap:sync:dev` 후 주입 확인 | versionCode/Name 주입, allowBackup=false, custom_url_scheme=iclpilates 모두 반영 |
| `bundleRelease` | **성공** |
| 크기 | **44.59 MB** (기준 44.6 MB, 변화 없음 — 설정 변경뿐이므로 예상대로) |

## 미해결 항목

1. **keystore 미생성** — 미서명 상태 지속. 사용자 직접 수행(부록 1), 프롬프트 F에서 배선 검증.
2. **이미지 최적화 미실시** — 4절 판정에 따라 R8 대신 이미지 감량이 실효적. 별도 작업 필요.
3. `google-services.json` 없음 — 푸시 비활성 지속.
4. minifyEnabled 최종 결정 — 본 문서 4절 판정(보류 권고)을 사용자가 승인하면 종결.
5. 작업 트리 미커밋 — 공통 제약(commit 금지)에 따라 변경분이 작업 트리에만 있다.

## 다음 세션이 해야 할 일

- 프롬프트 B는 완료됨(`legal-notice-20260819.md` 참조). **프롬프트 C(결제 서버 검증 감사)** 진행.
- 이 문서의 변경분 커밋 여부를 사용자에게 확인 (파일 목록: `frontend/app-version.json` 신규,
  `frontend/scripts/configure-native.mjs`, `frontend/scripts/build-android-release.mjs` 신규,
  `frontend/package.json`).
- 이미지 최적화를 별도 프롬프트로 등록할지 사용자에게 제안.

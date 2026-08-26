# 모바일 앱 구성 및 릴리스 가이드

이 문서는 기존 React 웹 서비스를 Capacitor로 패키징하여 Android와 iOS 앱으로 운영하는 방법을 정리한다. 웹과 앱은 동일한 React 기능 코드와 Express API를 사용하고, 네이티브 앱에서만 필요한 화면 구조와 기기 기능은 런타임 분기로 처리한다.

> 상태 기준: 이 문서에서는 현재 상태를 `코드 준비 완료`, `외부 설정 필요`, `실기기 검증 필요`, `Windows 검증 불가`, `출시 전 확인 필요`로 구분한다. 코드가 존재한다는 사실만으로 스토어 출시나 실기기 동작을 완료로 판정하지 않는다.

## 구성 원칙

- 웹, Android, iOS는 회원, 교육영상, 예약, 마이페이지 도메인 로직을 공유한다.
- 로그인 코드는 기존 HttpOnly 세션 쿠키를 사용하며 Capacitor HTTP/Cookie 브리지가 활성화되어 있다. 네이티브 세션 유지와 로그아웃은 실기기 검증이 필요하다.
- 앱은 구매한 교육영상 시청과 필라테스 예약을 제공하는 회원용 앱으로 운영한다.
- 디지털 교육영상의 신규 구매와 장바구니는 웹에서만 제공한다.
- 앱 하단 내비게이션은 홈, 수업 예약, 교육영상, 마이페이지로 구성한다.
- 앱 푸시는 Firebase Cloud Messaging 토큰을 기존 `/api/studio/me/push-devices` API에 등록하도록 구현되어 있다. Firebase/APNs 설정과 실제 토큰 등록·수신은 외부 설정 및 실기기 검증이 필요하다.
- API와 업로드 파일 주소는 앱 빌드에서 반드시 HTTPS 절대 주소를 사용한다.

## 웹과 앱 기능 범위

| 기능 | 웹 | Android/iOS 앱 | 현재 판정 |
| --- | --- | --- | --- |
| 회원가입, 로그인, 로그아웃 | 지원 | 지원 코드 존재 | 실기기 세션 검증 필요 |
| 마이페이지, 주문·수강 이력 | 지원 | 지원 코드 존재 | 실제 API·실기기 검증 필요 |
| 구매한 교육영상 재생·진도 | 지원 | 지원 코드 존재 | 실기기 영상 재생 검증 필요 |
| 교육영상 신규 구매·장바구니 | 지원 | 웹 이용 안내 | 코드 준비 완료, 스토어 정책 확인 필요 |
| 필라테스 일정 조회·예약·취소 | 지원 | 지원 코드 존재 | 실제 API·실기기 검증 필요 |
| 앱 푸시 권한·기기 토큰 등록 | 해당 없음 | 지원 코드 존재 | Firebase/APNs 외부 설정 및 실기기 검증 필요 |
| 관리자 기능 | 지원 | 라우트는 유지하지만 데스크톱 웹 운영 권장 | 앱 출시 범위에서 제외 권장 |

앱에서 웹 결제 기능을 숨기는 것은 Apple과 Google의 디지털 콘텐츠 결제 정책 검토 범위를 줄이기 위한 제품 정책이다. 실제 스토어 심사 통과 여부는 최종 바이너리, 메타데이터, 계정 유형과 심사 결과에 따라 달라진다.

## 환경 설정

개발과 운영 앱은 서로 다른 환경 템플릿을 사용한다. 실제 비밀키는 프론트엔드 환경변수에 넣지 않는다.

```env
# 개발: frontend/.env.app.development.example
VITE_APP_ENV=development
VITE_API_BASE_URL=http://localhost:4001/api

# 운영: frontend/.env.app.production.example
VITE_APP_ENV=production
VITE_API_BASE_URL=https://서비스도메인/api
```

백엔드는 앱 origin을 허용해야 한다.

```env
MOBILE_APP_ORIGINS=https://localhost,capacitor://localhost
```

위 origin은 현재 `capacitor.config.json`의 `hostname: localhost`, Android `https` scheme, iOS `capacitor` scheme과 대응한다. hostname 또는 scheme을 바꾸면 Capacitor 설정과 백엔드 allowlist를 함께 변경해야 한다.

- 운영 API는 유효한 TLS 인증서를 사용하는 HTTPS여야 한다.
- 개발 앱은 개발 API만 사용하며 운영 host가 감지되면 build/sync를 중단한다.
- 세션 쿠키의 `Secure`, `SameSite`, CORS credentials 설정을 실기기에서 확인한다.
- `VITE_API_BASE_URL`에 운영이 아닌 임시 URL이나 localhost를 넣은 상태로 스토어 빌드를 만들지 않는다.

## 개발 및 검증 명령

```bash
cd frontend

# 네이티브 앱 화면을 브라우저에서 미리보기
npm run dev:app

# 개발 API용 앱 웹 번들 생성
npm run build:app:dev

# Android/iOS 프로젝트에 번들과 플러그인 동기화
npm run cap:sync:dev

# Android emulator에서 PC의 개발 API 4001 연결
npm run android:reverse:dev

# Firebase 네이티브 설정 파일 존재 확인
npm run cap:check

# 네이티브 앱 브라우저 E2E
npm run test:e2e:app
```

`cap:sync:dev`는 개발 API를 사용하고 로컬 네트워크 접근을 허용한다. `cap:sync:prod`는 HTTPS 운영 API와 승인된 앱 링크 host를 검증하고 개발 전용 cleartext 설정을 제거한다. 동기화 과정은 Android/iOS 폴더가 없으면 먼저 생성하고, iOS 푸시 delegate, 커스텀 URL scheme, Android 딥링크와 알림 아이콘 설정을 다시 적용한다. 네이티브 폴더는 `.gitignore`에 포함된 생성물이므로 새 개발 환경에서는 이 명령으로 복원한다.

Android emulator는 실행 후 `npm run android:reverse:dev`를 사용한다. 실제 기기는 localhost에 접근할 수 없으므로 HTTPS 개발 API가 필요하다. iOS build와 실제 iPhone 검증은 macOS/Xcode에서 수행한다.

`cap:check`는 두 Firebase 설정 파일의 존재만 검사한다. keystore, APNs, 인증서, SDK 버전, 서명과 스토어 출시 준비까지 검증하는 명령은 아니다.

## Firebase Push 준비

실기기 푸시 전에 Firebase 프로젝트를 만들고 아래 파일을 각 네이티브 프로젝트에 둔다.

- Android: `frontend/android/app/google-services.json`
- iOS: `frontend/ios/App/App/GoogleService-Info.plist`

추가 준비:

- iOS APNs 인증 키를 Firebase에 등록한다.
- Xcode에서 Push Notifications와 Background Modes의 Remote notifications capability를 확인한다.
- 백엔드 운영 환경에 FCM 서비스 계정 설정을 입력한다.
- 실제 발송은 운영 승인 후 `ALLOW_EXTERNAL_PUSH_SEND` 정책에 따라 활성화한다.
- Firebase 설정 파일, APNs 키, 서비스 계정 키는 Git에 커밋하지 않는다.

## 딥링크

- 앱 내부 커스텀 scheme: `iclpilates://` (`configure-native.mjs`로 적용)
- 허용 HTTPS host: `VITE_APP_LINK_HOSTS`
- 앱은 허용된 경로만 내부 라우트로 변환한다 (`src/shared/platform/runtime.js`).

### Android App Link (https 링크로 앱 열기)

`cap:sync:prod`가 `VITE_APP_LINK_HOSTS`의 host로 `android:autoVerify="true"` intent-filter를 매니페스트에 넣는다. **개발 빌드에는 넣지 않는다** — 개발 빌드가 운영 도메인을 가로채면 실기기에서 웹 확인이 막히기 때문이다. `cap:sync:dev`를 돌리면 자동으로 제거된다.

검증 파일은 아래로 만든다.

```bash
cd frontend
npm run assetlinks                                  # keystore.properties 의 릴리스 키에서 지문 추출
npm run assetlinks -- --fingerprint AA:BB:...:ZZ    # 지문을 직접 지정
```

결과는 `frontend/public/.well-known/assetlinks.json`에 생성되고 빌드 시 `dist/`로 복사되어 nginx가 그대로 서빙한다. 각 host에서 `https://<host>/.well-known/assetlinks.json`이 열려야 한다.

> **Play 앱 서명을 쓰면 업로드 키 지문이 아니다.** Google이 최종 배포본을 다시 서명하므로 Play Console의 "앱 서명 키 인증서" SHA-256을 `--fingerprint`로 넣어야 한다. 업로드 키 지문을 넣으면 링크 검증이 조용히 실패한다.

`cap:check`가 이 파일의 존재와 지문 형식을 확인한다.

### iOS Universal Link (https 링크로 앱 열기)

Android App Link와 같은 구조로 준비되어 있다. `cap:sync:prod`가 아래 둘을 자동으로 처리한다.

- `ios/App/App/App.entitlements`에 `applinks:<host>` 권한을 만든다.
- Xcode 프로젝트가 그 파일을 쓰도록 `CODE_SIGN_ENTITLEMENTS` 설정을 넣는다.

**개발 빌드에는 넣지 않는다.** 개발 빌드가 운영 도메인을 가로채면 실기기에서 웹 확인이 막히기 때문이며, `cap:sync:dev`를 돌리면 자동으로 제거된다.

검증 파일은 Apple Team ID로 만든다. Apple Developer 사이트의 Membership 페이지에서 확인할 수 있는 10자리 값이다.

```bash
cd frontend
npm run aasa -- --team-id ABCDE12345
```

결과는 `frontend/public/.well-known/apple-app-site-association`에 생성되고 빌드 시 `dist/`로 복사된다.

> **배포 서버 설정이 반드시 필요하다.** 이 파일은 확장자가 없어서 nginx가 `application/json`으로 내려보내지 않는다. 실제로 확인해 보면 Content-Type이 비어서 나가고, iOS는 이 경우 링크 검증에 실패한다. 아래 블록을 `deploy/nginx-prod.conf`의 `location /` **앞에** 추가해야 한다.
>
> ```nginx
> location = /.well-known/apple-app-site-association {
>   default_type application/json;
>   add_header Cache-Control "public, max-age=3600";
> }
> ```
>
> Android의 `assetlinks.json`은 확장자가 있어 이 설정이 필요 없다.

`cap:check`가 이 파일의 존재와 appID 형식을 확인하고, Content-Type 설정이 필요하다는 점을 함께 알린다.

### iOS 앱 버전

Android와 마찬가지로 `frontend/app-version.json`이 원본이다. `cap:sync`가 Xcode 프로젝트의 `MARKETING_VERSION`(사용자에게 보이는 버전)과 `CURRENT_PROJECT_VERSION`(빌드 번호)에 그 값을 넣는다. `ios/` 폴더도 `.gitignore` 대상이라 재생성해도 버전이 사라지지 않게 하기 위해서다.

## Android 릴리스

### 버전과 서명의 원본 위치

`frontend/android/`는 `.gitignore`된 생성물이라 재생성하면 손으로 넣은 설정이 사라집니다. 그래서 버전과 서명은 저장소에 남는 파일을 원본으로 두고, `cap:sync` 때마다 `scripts/configure-native.mjs`가 네이티브 프로젝트에 다시 주입합니다.

| 항목 | 원본 파일 | Git |
| --- | --- | --- |
| versionCode / versionName | `frontend/app-version.json` | 추적함 |
| 릴리스 서명 | `frontend/keystore.properties` | **커밋 금지** (`.gitignore` 등록) |
| 서명 템플릿 | `frontend/keystore.properties.example` | 추적함 |
| 생성 결과 | `frontend/android/app/icl-release.gradle` | 생성물 |

`configure-native.mjs`는 순정 `build.gradle`에도 `apply from: 'icl-release.gradle'` 한 줄을 보장하므로, 네이티브 폴더를 통째로 지우고 다시 만들어도 버전과 서명이 복원됩니다.

> `keystore.properties`가 없으면 서명 설정을 **아예 만들지 않습니다.** 잘못된 키로 서명되는 것보다 미서명으로 남아 `cap:check`에서 걸리는 편이 안전하기 때문입니다.

### keystore 생성 (최초 1회, 사용자가 직접 실행)

비밀번호가 로그에 남지 않도록 대화형으로 실행합니다.

```bash
keytool -genkeypair -v   -keystore icl-release.jks   -alias icl-release   -keyalg RSA -keysize 2048 -validity 10000
```

- 생성한 `.jks`는 저장소 밖 안전한 위치에 두고 비밀번호와 함께 오프라인 백업한다.
- **이 키를 잃어버리면 같은 패키지명(`com.iclpilates.app`)으로 앱을 갱신할 수 없다.**
- `frontend/keystore.properties.example`을 `frontend/keystore.properties`로 복사해 경로와 비밀번호를 채운다.

### 버전 올리기

Play에 올릴 때마다 `frontend/app-version.json`의 `versionCode`를 1 이상 올린다. 같은 값으로 다시 올리면 Play가 거부한다.

### 릴리스 순서

```bash
cd frontend
npm run cap:sync:prod          # 앱 번들 빌드 + 네이티브 동기화 + 버전/서명 주입
cd android && ./gradlew bundleRelease
cd .. && npm run cap:check     # 프리플라이트: Firebase, 버전, 서명, AAB 서명 검사
```

`cap:check`는 아래를 확인하고 하나라도 걸리면 종료코드 1로 막는다.

- Firebase 설정 파일 존재 (`google-services.json`, `GoogleService-Info.plist`)
- `app-version.json`의 versionCode/versionName 형식
- `keystore.properties` 존재와 각 값, keystore 파일 실재 여부
- `icl-release.gradle` 생성 여부와 `build.gradle` 적용 여부
- **빌드된 AAB가 실제로 서명됐는지** (`jarsigner -verify` 출력 문구로 판정. 미서명 jar에도 종료코드 0이 나오므로 종료코드로 판정하면 안 된다)

산출물은 `frontend/android/app/build/outputs/bundle/release/app-release.aab`.

### R8(minifyEnabled)에 대해

현재 `minifyEnabled false`다. Capacitor는 `capacitor.plugins.json`을 읽어 플러그인을 **리플렉션으로** 로드하므로, keep 규칙 없이 R8을 켜면 플러그인이 제거되어 **실기기에서만** 실패한다.

`configure-native.mjs`가 필요한 keep 규칙을 `proguard-rules.pro`에 미리 넣어 두지만, 플래그는 켜지 않는다. 켜려면 실기기에서 로그인·예약·영상 재생·푸시를 모두 확인할 수 있는 상태에서 `icl-release.gradle`에 `minifyEnabled true`를 추가하고 재검증한다. 실기기 검증 없이 켜지 않는다.

### 실기기 확인

Android Studio에서 debug 빌드로 실제 기기 로그인·예약·영상 재생·푸시를 확인한 뒤 서명된 AAB를 만든다. keystore와 비밀번호는 저장소에 넣지 않는다.

## iOS 릴리스

필요 조건:

- macOS와 Xcode
- Apple Developer Program 계정
- App ID, 인증서, Provisioning Profile
- Firebase `GoogleService-Info.plist`와 APNs 설정
- 앱 아이콘, 스플래시, 버전, 개인정보 사용 설명 확정

검증 순서:

```bash
npm run cap:sync:prod
npm run cap:check
npx cap open ios
```

Windows에서는 iOS compile, archive, 실기기 서명 검증을 수행할 수 없다. macOS에서 Archive와 TestFlight 검수를 완료해야 한다.

## 스토어 제출 전 필수 확인

- 개인정보처리방침, 이용약관, 고객지원 URL이 실제로 접근된다.
- 계정 생성 기능이 있으면 앱 안에서 회원 탈퇴 절차가 동작한다.
- 심사용 계정과 심사 메모를 준비한다.
- 앱에서 디지털 교육영상 신규 구매 버튼과 가격이 노출되지 않는다.
- 로그인, 로그아웃, 세션 유지, 영상 재생, 예약·취소를 실기기에서 확인한다.
- 푸시 거부 상태에서도 앱이 정상 동작한다.
- 오프라인 배너와 네트워크 복구를 확인한다.
- 모바일 375px, 태블릿 768px에서 가로 스크롤과 버튼 겹침이 없다.
- Android back, iOS safe area, 딥링크를 확인한다.
- 앱 아이콘, 스플래시, 스토어 스크린샷과 설명을 최종 확정한다.

## 현재 자동 검증 범위와 외부 준비 항목

코드 준비 완료:

- 웹 빌드와 앱 빌드
- Capacitor Android/iOS 프로젝트 생성·동기화 스크립트
- 앱 shell, 하단 내비게이션, 결제 안내, 반응형 E2E
- API 절대 주소와 업로드 URL 변환
- CORS의 Capacitor origin 처리
- Firebase 설정 파일 존재 검사

외부 설정 필요:

- Firebase 프로젝트와 네이티브 설정 파일
- APNs 키, Apple 인증서와 Provisioning Profile
- Android release keystore
- 앱 아이콘과 스토어 등록 이미지·문구
- Play Console/App Store Connect 제출과 심사

실기기 검증 필요:

- Android/iPhone의 로그인·세션 유지·로그아웃
- 푸시 권한, 토큰 등록, 수신과 딥링크 이동
- 예약·취소, 영상 재생, 네트워크 복구

Windows 검증 불가:

- Xcode 기반 iOS compile, archive, 서명과 TestFlight 검수

출시 전 확인 필요:

- 네이티브 프로젝트 생성·동기화와 Android debug/release 빌드
- Android keystore 및 iOS 인증서 서명
- Universal Link/Android App Link 서버·네이티브 연결
- 실제 스토어 정책과 심사 결과

> 최종 점검: 2026-08-12. 네이티브 SDK, 서명 자산과 실기기 항목은 코드 검증만으로 완료 판정하지 않습니다.

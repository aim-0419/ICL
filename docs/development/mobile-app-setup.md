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

- 앱 내부 커스텀 scheme: `iclpilates://` (`configure-native.mjs`로 적용되는 코드 준비 완료)
- 허용 HTTPS host: `VITE_APP_LINK_HOSTS`
- 앱은 허용된 경로만 내부 라우트로 변환한다.

Universal Link와 Android App Link는 아직 외부 설정이 필요한 단계다. 현재 자동 설정은 커스텀 scheme까지만 적용한다. HTTPS 링크를 완전히 활성화하려면 iOS Associated Domains와 Android HTTPS intent filter를 구성하고, 릴리스 서명 정보가 확정된 뒤 서버에 다음 파일을 배포해야 한다.

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

Team ID, 앱 서명 인증서 SHA-256이 없으면 위 파일의 최종 값을 만들 수 없다.

## Android 릴리스

필요 조건:

- JDK와 Android Studio 설치
- Android SDK 설치
- Firebase `google-services.json`
- 릴리스 keystore와 안전한 비밀번호 관리
- 앱 아이콘, 스플래시, 버전 코드 확정

JDK와 Android SDK의 세부 버전은 저장소 문서에 고정되어 있지 않다. 설치된 Capacitor/Gradle 요구사항과 Android Studio가 제안하는 호환 버전을 릴리스 전에 확인한다.

검증 순서:

```bash
npm run cap:sync:prod
npm run cap:check
npx cap open android
```

Android Studio에서 debug 빌드, 실제 기기 로그인·예약·영상 재생·푸시를 확인한 뒤 서명된 AAB를 만든다. keystore와 비밀번호는 저장소에 넣지 않는다.

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

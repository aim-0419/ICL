# 문자·알림톡·앱 푸시 연동 안내

알림 기능은 현재 DB 발송 대기열, 예약 스케줄러, 실패 재시도, 발송 이력까지 연결되어 있습니다. 아래 공급자 설정을 넣으면 같은 코드로 실제 발송할 수 있습니다.

## 1. 알리고 SMS

`backend/.env`에 다음 값을 입력합니다.

```env
ALIGO_API_KEY=알리고_API_키
ALIGO_USER_ID=알리고_아이디
ALIGO_SENDER=알리고에_사전등록한_발신번호
```

개발 환경(`NODE_ENV=development`)은 알리고 테스트 모드로 요청합니다. 실제 발송은 운영 환경에서 이루어집니다.

## 2. 카카오 알림톡

알리고에서 카카오 채널과 발신 프로필을 연결하고 메시지 템플릿 심사를 먼저 완료합니다.

```env
KAKAO_SENDER_KEY=알리고_발신프로필키
KAKAO_DEFAULT_TEMPLATE=기본_승인_템플릿_코드
```

자동 알림별 템플릿 코드는 관리자 `설정 > 알림 설정` 화면에서 따로 입력할 수 있습니다. 카카오 승인 문구와 실제 발송 문구가 다르면 카카오에서 거절하므로 두 문구를 동일하게 관리해야 합니다.

## 3. 앱 푸시(FCM)

Firebase 프로젝트의 서비스 계정 JSON에서 아래 세 값을 `backend/.env`에 입력합니다.

```env
FCM_PROJECT_ID=project_id
FCM_CLIENT_EMAIL=client_email
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

앱에는 Firebase 콘솔에서 내려받은 설정 파일이 필요합니다.

- Android: `google-services.json`
- iOS: `GoogleService-Info.plist`와 APNs 인증 키, Xcode의 Push Notifications capability 활성화

Capacitor 푸시 플러그인은 설치되어 있습니다. 앱에서 로그인하면 알림 권한을 요청하고 FCM 토큰을 `/api/studio/me/push-devices`에 자동 등록하며, 로그아웃할 때 토큰을 비활성화합니다.

네이티브 폴더를 새로 만든 뒤 `npm run cap:sync`를 실행하면 iOS의 푸시 토큰 전달 코드도 자동으로 보정됩니다.

## 4. 스케줄러

```env
NOTIFICATION_SCHEDULER_ENABLED=true
NOTIFICATION_SCHEDULER_INTERVAL_SEC=30
NOTIFICATION_MAX_ATTEMPTS=10
```

스케줄러는 예약 발송, 수강권 만료, 잔여 횟수, 수업 시작, 생일, 락커 만료 알림을 생성합니다. 실패한 건은 지수 간격으로 재시도하며 최대 횟수를 넘으면 `exhausted` 상태로 남깁니다.

## 5. 주요 저장 테이블

- `studio_notifications`: 사용자에게 보여줄 원본 알림
- `studio_notification_deliveries`: SMS·알림톡·푸시별 발송 상태와 재시도 정보
- `studio_notification_logs`: 공급자 발송 결과 이력
- `studio_notification_templates`: 자동 알림 채널, 문구, 알림톡 승인 코드
- `studio_push_devices`: 회원별 앱 FCM 토큰

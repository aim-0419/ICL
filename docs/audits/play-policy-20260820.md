# Play Console 정책 자산 감사 — 2026-08-20 (프롬프트 D)

브랜치 `fix/play-store-compliance`. 조사 전용, 코드 미변경. 개인정보 실제 값 미출력(컬럼명·항목명만).
기준: `docs/APP_STORE_REVIEW_GUIDE.md` 3장 Google Play 체크리스트.

## 종합 판정표

| 항목 | 현재 상태 | Play 요구사항 | 판정 | 근거 | 조치 |
|---|---|---|---|---|---|
| Data safety 자료 | 항목·목적·제3자·암호화 파악 완료(아래 A) | 양식 제출 필수 | **자료 준비됨, 제출 미완** | 아래 A표 | 계정 발급 후 A표를 양식에 전사 |
| Health 선언 | 진도·예약·출석 기록, 신체측정치 없음 | 해당 시 선언 | **선언 대상 아님(근거 필요)** | 아래 B | App content 에 "건강데이터 미수집" 취지로 정확히 응답 |
| 권한 최소화 | INTERNET·ACCESS_NETWORK_STATE·POST_NOTIFICATIONS·WAKE_LOCK·c2dm.RECEIVE. 위치·미디어·AD_ID 없음 | 최소 권한 | **충족** | 병합 매니페스트 | 없음 (제거 후보 없음) |
| 마케팅 문구(의료/최상급) | 소비자 화면에 위반 표현 없음 | 허위 건강주장·최상급 금지 | **충족** | 아래 D | 스토어 등록 문구 작성 시 유지 |
| 스토어 자산 | 512x512 아이콘·피처그래픽·스크린샷·설명 없음 | 전부 필수 | **미준비** | 아래 E | 업로드 전 제작 |

---

## A. Data safety 양식 자료

### 수집 항목 · 목적 · 암호화

| 데이터 | 컬럼/출처 | 수집 목적 | 저장 암호화 | 전송 암호화 | 삭제 요청 가능 |
|---|---|---|---|---|---|
| 이름 | users.name (암호화 저장) | 계정 관리·고객지원 | ✅ AES-256-GCM | ✅ HTTPS | ✅ 탈퇴 시 |
| 이메일 | users.email, orders.customer_email | 계정 관리·결제·알림 | ✅ | ✅ | ✅ |
| 전화번호 | users.phone (암호화) | 본인확인·알림 발송 | ✅ | ✅ | ✅ |
| 생년(월일) | users.birth_year_encrypted, studio_member_profiles.birth_date | 연령대 분류·회원관리 | ✅ | ✅ | ✅ |
| 성별 | studio_member_profiles.gender | 회원 관리 | ✖ 평문 | ✅ | ✅ |
| 주소 | studio_member_profiles.address, address_detail | 스튜디오 회원 관리 | ✖ 평문 | ✅ | ✅ |
| 비밀번호 | users.password (해시) | 인증 | ✅ 해시(단방향) | ✅ | ✅ |
| 결제/주문 내역 | orders, payment_confirmations | 결제 처리·구매내역 | 부분(이메일 암호화) | ✅ | 법정 보존 후 파기 |
| 예약·수강·출석 | studio_bookings, academy_progress, studio_checkins | 앱 기능(예약·수강 관리) | ✖ | ✅ | ✅ |
| 문의 내용 | inquiry_posts.title/content | 고객지원 | ✖ | ✅ | ✅ |
| 푸시 토큰·기기정보 | studio_push_devices.token | 알림 발송 | ✖ | ✅ | ✅(알림 해제/탈퇴) |
| IP·User-Agent | academy_playback_sessions.ip_address/user_agent, login/signup_rate_limits(IP) | 부정사용 방지·영상 보안재생 | ✖ | ✅ | 로그성(기간 후 자동정리) |

주의: 성별·주소·예약·문의·기기정보는 **평문 저장**이다. Data safety 에서 "암호화 저장" 항목을
일괄 예로 신고하면 실제와 불일치해 반려 위험. 위 표 그대로 항목별 구분 신고 필요.

### 제3자 전송 (코드 연동 확인됨)

| 수신자 | 전송 데이터 | 목적 | 국가 |
|---|---|---|---|
| AWS | 서비스 이용기록·접속로그(호스팅) | 인프라 운영 | 미국 |
| Google Firebase Cloud Messaging | 푸시 토큰·기기 식별정보 | 알림 발송 | 미국 |
| PortOne(+토스페이먼츠) | 결제·주문 정보 | 결제 처리 | 국내(PG) |
| Aligo | 전화번호 | SMS 발송 | 국내 |
| Kakao(알림톡, Aligo 경유) | 전화번호·메시지 | 알림톡 발송 | 국내 |
| 이메일(SMTP) | 이메일 주소 | 이메일 발송 | 설정에 따름 |

※ 처리방침 국외이전 섹션(AWS·Firebase 미국)은 이미 반영됨(legal-notice 감사 참조). Data safety 문구와 일치시킬 것.

---

## B. Health apps 선언 대상 여부 — **선언 대상 아님**

수집/저장하는 것:
- academy_progress, academy_chapter_progress → **영상 강의 학습 진도**(교육 데이터)
- studio_bookings, studio_checkins → **수업 예약·출석**(활동 기록)
- academy_certificates → 수료증

수집하지 않는 것(전수 검색으로 확인):
- 심박수·운동강도·칼로리 등 운동 측정치 **없음**
- 체중·신장·체지방·InBody 등 신체 측정치 **없음** (weight/height/bmi/inbody 컬럼 0건)
- Health Connect·건강기록 연동 **없음**

**판정 근거:** 이 앱은 필라테스 **수업 예약 + 교육영상 수강** 앱이다. "건강/피트니스"
카테고리 선택은 방어 가능하나, Google 이 요구하는 **민감 건강데이터 선언(Health Connect,
건강기록)** 대상은 아니다. 신체·건강 측정 데이터를 다루지 않기 때문이다.
과대 신고(건강데이터 취급으로 표기)도 반려 사유이므로, App content 에는
"운동 측정·건강 데이터 미수집, 예약·학습 진도만 저장"으로 정확히 응답한다.

---

## C. 권한 최소화 — 충족

병합 매니페스트(빌드 산출물) 권한 전체:
- `INTERNET`, `ACCESS_NETWORK_STATE` — 기본 통신
- `POST_NOTIFICATIONS`, `WAKE_LOCK`, `com.google.android.c2dm.permission.RECEIVE` — Firebase 푸시(라이브러리 병합)
- `com.iclpilates.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` — Android 자동 생성

- **위치·사진/미디어 권한 없음.** `AD_ID` 권한 **없음**(0건) → Data safety 에 "광고 ID 미수집" 신고 가능.
- 제거(tools:node="remove") 후보 **없음**: 남은 권한은 모두 푸시에 실사용된다.
- manifest-merger 리포트 존재: `android/app/build/outputs/logs/manifest-merger-{debug,release}-report.txt`

---

## D. 마케팅 문구 — 소비자 화면 위반 없음

- 의료 표현(치료·교정·통증·재활): 소비자 화면 검색 결과 **위반 문구 없음**.
  유일 매치는 `ExerciseSafetyNotice.jsx`의 **면책 고지**("의료 행위나 치료를 제공하지 않습니다…
  통증이 있으면 의사와 상담")로, 건강 주장이 아니라 **부정·주의 고지**라 오히려 권장 요소.
- 최상급(최고·1위·유일·최상): 소비자 화면 **0건**. (앞선 Play 대응 PR 에서 브랜드·홈·아카데미 순화 완료)
- 관리자 화면의 "beta/유일/최고"는 소비자 비노출.
- **확인불가:** 스토어 등록정보(짧은/자세한 설명) 문안은 아직 없어 별도 검수 필요.

---

## E. 스토어 등록 자산 — 미준비

| 자산 | 상태 |
|---|---|
| 런처 아이콘 | 존재(mipmap 각 밀도). **커스텀/기본 Capacitor 여부 시각 확인 필요(확인불가)** |
| 512x512 Play 아이콘 | **없음** (iOS용 AppIcon-512@2x 만 존재, Play 용 아님) |
| 피처 그래픽 1024x500 | **없음** |
| 스크린샷 | **없음**. Playwright 로 주요 화면 자동 캡처 가능(앱 셸 렌더 확인됨) |
| 짧은 설명(80자)/자세한 설명(4000자) | **없음** |
| fastlane/metadata 폴더 | **없음** |

전송 중 암호화: 운영 API `https://icl-pilates.com/api` (HTTPS) 확인.

---

## Play Console 업로드 전 반드시 해결 (우선순위)

**P0 — 없으면 업로드/등록 불가**
1. **스토어 자산 제작** — 512x512 아이콘, 1024x500 피처그래픽, 스크린샷(최소 2장), 짧은/자세한 설명
2. **Data safety 양식 제출** — 위 A표 전사. 특히 평문 저장 항목과 암호화 항목을 **정확히 구분** 신고
3. **개인정보처리방침 공개 URL** — 이미 라우트 신설됨(/privacy). 배포 후 활성 URL 확정

**P1 — 반려 위험**
4. **App content 건강데이터 응답** — B판정대로 "건강 측정데이터 미수집"으로 정확히 (과대·과소 모두 반려)
5. **Data safety ↔ 처리방침 문구 일치** — 제3자·국외이전·수탁사(Aligo·Kakao 포함) 정합
6. **콘텐츠 등급(IARC) 설문** — 비게임

**P2 — 검수**
7. 스토어 등록 문안의 의료/최상급 표현 검수(현재 앱 내부는 clean)
8. 런처 아이콘이 브랜드 커스텀인지 시각 확인

## 확인불가 항목
- 런처 아이콘 커스텀 여부(시각 확인 필요)
- 스토어 등록정보 문안(아직 미작성)
- Data safety 실제 제출 내용(Play Console 계정 필요)
- 성별/주소 등 평문 저장 항목의 실제 암호화 정책 결정(제품 판단 필요)

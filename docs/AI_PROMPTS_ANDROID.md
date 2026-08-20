# AI_PROMPTS_ANDROID.md

Android(Google Play) 출시를 위한 AI 에이전트 작업 프롬프트 모음이다.

- 대상 앱: `com.iclpilates.app` (Capacitor 8.4.0 + React/Vite)
- 관련 문서: `AGENTS.md`, `docs/PROJECT_RULES.md`, `docs/SECURITY_HARDENING.md`, `docs/APP_STORE_REVIEW_GUIDE.md`
- 작업 브랜치: `fix/play-store-compliance`

---

## 작업 디렉토리 (반드시 먼저 확인)

정본 저장소는 **ICL** 이다.

```
C:\Users\eldorado\Desktop\폴더\회사 폴더\
├── ICL       ← 정본. 모든 작업은 여기서 한다
└── HomePage  ← 2026-07-31 구버전 체크아웃. 건드리지 않는다
```

두 폴더는 같은 원격(`aim-0419/ICL`)을 바라보는 별개 체크아웃이다.
`HomePage` 는 `wip/checkpoint-before-full-reorganization-20260731` 에 머물러 있고
미커밋 변경 63건이 방치돼 있다. Android 출시 작업이 끝난 뒤 별도로 정리한다.

워크트리가 14개 존재하며 대부분 `prunable` 상태다. `git worktree list` 로 확인할 수 있다.
작업 전 경로 확인을 생략하면 엉뚱한 트리에 변경이 쌓인다.

모든 프롬프트에 `[실행 전 확인 — 필수]` 블록이 포함돼 있다. 지우지 않는다.

---

## 진행 현황

| 단계 | 프롬프트 | 상태 | keystore 필요 | 계정 필요 |
|---|---|---|---|---|
| 0 | 릴리즈 빌드 사전 감사 | ✅ 완료 (2026-08-19) | — | — |
| 1 | A. 빌드 설정 정비 | ✅ 완료 (2026-08-19) | ❌ | ❌ |
| 1 | B. 법적 표시 정비 | ✅ 완료 (2026-08-19, 커밋 a65a1d7) | ❌ | ❌ |
| 2 | C. 결제 서버 검증 감사 | ✅ 완료 (2026-08-19) — **🔴 취약점 발견** | ❌ | ❌ |
| 긴급 | H1. 운영 주문 악용 여부 조회 | ⚠️ 쿼리 완성, **운영 접근 경로 없어 미판정** — 사용자가 직접 실행 | ❌ | ❌ |
| 긴급 | H2. 결제 금액 검증 hotfix | ✅ 완료 + 실 PortOne e2e 검증 (커밋 8f71400, c190f9c) — **미배포** | ❌ | ❌ |
| 긴급 | H3. 포인트 차감 누락 수정 | ✅ 완료 (H2 브랜치에 포함) — **미배포** | ❌ | ❌ |
| 2 | D. Play 정책 자산 감사 | ✅ 완료 (2026-08-20) | ❌ | ❌ |
| **3** | **G. 이미지·자산 최적화** | **⬅ 다음 실행** | ❌ | ❌ |
| 4 | E. 실기기 QA | G 완료 후 (이미지 교체가 화면에 영향) | ❌ | ❌ |
| 5 | I. 스토어 등록 자산 제작 | E 완료 후 | ❌ | ❌ |
| 4 | F. 서명 및 업로드 준비 | 계정 발급 후 | ✅ | ✅ |

---

## 0단계 감사에서 확정된 사실

수정 전 기준선이다. 이후 작업의 비교 대상으로 쓴다.

| 항목 | 값 |
|---|---|
| targetSdk / compileSdk | 36 (2026-08-31 마감 충족) |
| minSdk | 24 |
| AGP / Gradle | 8.13.0 / 8.14.3 |
| `bundleRelease` | 성공 (미서명) |
| `app-release.aab` | **44.6 MB** ← 크기 비교 기준 |
| signingConfig | 조건부 배선 존재 (`keystore.properties` 있을 때 활성) |
| keystore 파일 | 없음 → 미서명의 직접 원인 |
| `versionCode` / `versionName` | `1` / `"1.0"` 하드코딩 |
| `minifyEnabled` | false |
| `allowBackup` | true |
| `usesCleartextTraffic` | 환경별 제어 존재 (dev sync만 주입, prod는 제거) |
| `google-services.json` | 없음 → 푸시 비활성 |
| `POST_NOTIFICATIONS` | 라이브러리 매니페스트 병합으로 존재 (동작 이상 없음) |
| 딥링크 scheme | **불일치** — Manifest `iclpilates` / strings.xml `com.iclpilates.app` |
| `payment-config.js` | git 추적 중. PortOne V2 공개 클라이언트 식별자 → **재발급 불필요** |
| 백엔드 비밀키 번들 인라인 | 없음 (확인 완료) |
| 사업자 | 법인 (사업자등록번호 중간 2자리 85), 대표 정지윤 |
| 개인정보처리방침 | SignupPage 모달만 존재 → **프롬프트 B에서 해결됨** |
| 딥링크 scheme | **프롬프트 A에서 `iclpilates` 로 통일 완료** |
| versionCode | **프롬프트 A에서 `frontend/app-version.json` 주입으로 해결** |
| allowBackup | **프롬프트 A에서 false 적용** |
| AAB 구성 | 웹 자산 42.99MB(81%) / dex 9.43MB(18%) |
| 최대 이미지 | `instructor-05.jpg` **12.3MB** — 강사 사진 5장 + 수료증 정리 시 ~30MB 감량 여지 |
| **앱 결제 정책** | **리더 앱 전략** — 앱에서 교육영상 가격·구매 버튼 숨김, 보유 영상 시청만 허용 |

### 확정된 판단

- **PortOne storeId/channelKey 재발급 불필요.** 브라우저 노출을 전제로 설계된 공개 식별자다. 실제 방어선은 백엔드 검증(프롬프트 C)에 있다.
- **git 이력 재작성(filter-branch, BFG) 금지.** 공개 식별자라 실익이 없고 브랜치 이력 재작성은 고위험이다.
- **minifyEnabled 보류.** Capacitor 앱은 용량 대부분이 웹 자산이라 R8 실익이 불분명하다. 프롬프트 A의 용량 분석 결과로 판단한다.
- **Google Play 계정은 조직(Organization)으로 등록.** 법인이므로 D-U-N-S 발급이 필요하고, Apple 조직 계정과 같은 번호를 쓴다.

---

## 세션 운영 규칙

1. **프롬프트마다 새 세션을 연다.** 이어 붙이면 뒤로 갈수록 앞 지시를 잊는다.
2. 각 프롬프트는 첫 줄에서 관련 문서를 다시 읽게 되어 있다. 임의로 지우지 않는다.
3. 결과는 `docs/audits/` 에 저장한다. 다음 세션은 그 파일을 읽고 이어받는다.
4. 중단 지점에서 멈추면 사용자에게 가져온다.

### 사용자에게 반드시 가져와야 하는 경우

- 중단 지점에 걸려 멈춘 경우
- 빌드가 실패한 경우
- "확인불가" 항목이 5개 이상인 경우
- 결제 관련 취약점이 발견된 경우
- 판단 근거가 불충분해 에이전트가 결정을 미룬 경우

그 외 정상 결과는 그냥 다음 프롬프트로 진행한다.

### 모든 프롬프트 공통 제약

```
작업 저장소는 C:/Users/eldorado/Desktop/폴더/회사 폴더/ICL 이다.
나란히 있는 HomePage 폴더는 구버전 체크아웃이므로 절대 건드리지 마라.
현재 브랜치는 fix/play-store-compliance 다. main 으로 병합하지 마라.
git add / commit / push 를 하지 마라.
  단, 개별 프롬프트가 커밋을 명시적으로 요구하면 그 프롬프트가 우선한다.
  (예: H2 는 hotfix 브랜치에 커밋까지 수행한다. push 와 main 병합은 여전히 별도 승인)
.env 내용, API Key, Secret, Token, 비밀번호 원문을 출력하지 마라. [REDACTED] 처리해라.
민감정보가 의심되면 값을 출력하지 말고 "민감정보 존재 가능성"으로만 보고해라.
운영 서버 / 운영 DB(icl_pilates) / 운영 키에 접근하지 마라. 개발 환경 기준으로만 작업해라.
git 이력 재작성(filter-branch, BFG, rebase -i)을 하지 마라.
작업 시작 시 git status --short 를 기록하고, 작업 전부터 있던 변경사항은 건드리지 마라.
```

---

# 프롬프트 A. 빌드 설정 정비 (완료)

keystore 없이 진행 가능하다. 서명은 프롬프트 F에서 처리한다.

```
[실행 전 확인 — 필수]
아래를 먼저 실행하고 결과를 출력해라.
  pwd
  git rev-parse --show-toplevel
  git branch --show-current
  git status --short
결과가 아래와 다르면 즉시 멈추고 사용자에게 보고해라. 다른 폴더에서 작업하지 마라.
  저장소 : C:/Users/eldorado/Desktop/폴더/회사 폴더/ICL
  브랜치 : fix/play-store-compliance
※ 나란히 있는 HomePage 폴더는 2026-07-31 시점의 구버전 체크아웃이다. 절대 건드리지 마라.

AGENTS.md, docs/PROJECT_RULES.md, docs/AI_PROMPTS_ANDROID.md 를 읽어라.
0단계 감사 결과를 기준으로 빌드 설정을 정비한다.

[작업 범위]

1. versionCode / versionName 주입 방안 구현
   - frontend/android/ 는 .gitignore 대상이므로 configure-native.mjs 경유로 주입해라.
   - 환경변수 또는 별도 설정 파일에서 읽도록 하고, 값이 없으면 빌드가
     실패하도록 처리해라. 조용히 1로 떨어지면 안 된다.
   - .github/ CI 설정은 건드리지 마라. 필요하면 제안만 해라.

2. 릴리즈 AAB 빌드 스크립트를 frontend/package.json 에 추가
   - cap sync prod → bundleRelease 흐름
   - 실행 전 keystore.properties 존재 여부를 검사하고,
     없으면 "서명 키 미설정" 취지의 명확한 에러 메시지를 내고 중단해라.
   - keystore 가 아직 없는 현 상태에서 스크립트 자체는 정상 동작해야 한다.
     (미설정 에러 메시지가 나오는 것까지가 정상)

3. 딥링크 scheme 불일치 해결 — 결제 복귀와 직결되므로 신중히
   - AndroidManifest 의 android:scheme="iclpilates" 와
     strings.xml 의 custom_url_scheme="com.iclpilates.app" 중
     실제로 사용되는 쪽을 소스에서 추적해라.
   - PortOne 결제 리다이렉트(redirectUrl / appScheme 파라미터)에 어떤 scheme 이
     지정돼 있는지 requestExternalPayment.js 및 결제 관련 소스 전체에서 확인해라.
   - frontend/ios 의 URL scheme 설정도 함께 확인해 3자가 일치하는지 대조해라.
   - 어느 쪽으로 통일할지 근거와 함께 제안해라. 근거가 불충분하면 멈춰라.
   ※ 이 값이 어긋나면 결제 후 앱으로 복귀하지 못한다. 추측으로 정하지 마라.

4. AAB 용량 분석 — minifyEnabled 판단 근거 수집
   - app-release.aab 44.6MB 의 구성을 base/assets, base/lib, base/res,
     base/dex 별 크기로 분석해라.
   - assets/public 안에서 1MB 이상인 파일을 크기순으로 나열해라.
   - 폰트, 이미지, 소스맵(.map), 미사용 라이브러리 포함 여부를 확인해라.
   - "R8 적용의 실익이 있는가"를 판정해라.
     dex 비중이 작으면 minifyEnabled 는 리스크만 크고 실익이 없다.
   - 판정만 하고 minifyEnabled 는 적용하지 마라.

5. allowBackup 을 false 로 변경
   - 개인정보/결제/예약 데이터를 다루므로 false 가 적절한지 판단하고
     근거와 함께 적용해라. configure-native.mjs 경유로 처리해라.

[이번 세션에서 하지 않을 것]
- minifyEnabled / shrinkResources 적용 (4번 판정 후 별도 결정)
- keystore 생성 (사용자가 직접 수행, 프롬프트 F)
- payment-config.js git 추적 해제 (별도 처리)
- network_security_config 신설 (현행 환경별 제어로 충분, 후순위)

[검증]
- 각 수정 후 bundleRelease 가 성공하는지 확인해라.
- 수정 전 44.6MB 대비 크기 변화를 보고해라.
- 실패하면 원인을 보고하고 멈춰라. 임의로 우회하지 마라.

[중단 지점]
- 딥링크 scheme 판단 근거가 불충분한 경우
- versionCode 주입이 기존 configure-native.mjs 구조와 충돌하는 경우
- 빌드 실패
- .gitignore 또는 환경변수 파일 변경이 필요한 경우

[결과 저장]
docs/audits/android-build-config-YYYYMMDD.md
"미해결 항목"과 "다음 세션이 해야 할 일"을 반드시 포함해라.

[공통 제약]
docs/AI_PROMPTS_ANDROID.md 의 "모든 프롬프트 공통 제약" 을 따라라.
```

---

# 프롬프트 B. 법적 표시 정비

A와 병행 가능하다. Play Console 제출을 막는 항목이다.

```
[실행 전 확인 — 필수]
아래를 먼저 실행하고 결과를 출력해라.
  pwd
  git rev-parse --show-toplevel
  git branch --show-current
  git status --short
결과가 아래와 다르면 즉시 멈추고 사용자에게 보고해라. 다른 폴더에서 작업하지 마라.
  저장소 : C:/Users/eldorado/Desktop/폴더/회사 폴더/ICL
  브랜치 : fix/play-store-compliance
※ 나란히 있는 HomePage 폴더는 2026-07-31 시점의 구버전 체크아웃이다. 절대 건드리지 마라.

AGENTS.md, docs/PROJECT_RULES.md, docs/APP_STORE_REVIEW_GUIDE.md 를 읽어라.

[배경]
- 개인정보처리방침과 이용약관이 SignupPage.jsx 내부 모달로만 존재하고
  독립 URL 라우트가 없다.
- Google Play 는 공개 접근 가능한 활성 URL(PDF 불가)을 요구한다.
  URL 이 없으면 Data safety 양식 작성 자체가 막힌다.
- SiteFooter.jsx 에 통신판매업 신고번호가 없다. (전자상거래법 제10조)

[작업]

1. 현재 약관 전문이 어디에 정의돼 있는지 확인하고
   재사용 가능한 구조인지 판단해라. (SignupPage.jsx 의 TERMS 상수 등)

2. 독립 라우트를 신설해라.
   - /privacy (개인정보처리방침)
   - /terms (서비스 이용약관)
   - 로그인 없이 접근 가능해야 한다.
   - SignupPage 의 모달은 유지하되 동일 원본을 공유하게 해서
     두 곳의 내용이 어긋나지 않게 해라.

3. 계정 삭제 관련 확인
   - 현재 회원탈퇴 기능의 위치를 찾아라.
   - 실제 데이터 삭제인지, status 컬럼만 바꾸는 비활성화인지
     backend 소스로 확인해라. (Play 는 비활성화만으로는 불충분)
   - 앱을 삭제한 사용자도 접근 가능한 웹 삭제 요청 페이지가 있는가.
     없다면 라우트 신설을 제안해라. 구현은 승인 후에 해라.
   - 전자상거래법상 거래기록 5년 보존과의 충돌을 어떻게 처리할지 확인해라.

4. SiteFooter.jsx 정비
   - 개인정보처리방침 / 이용약관 링크 추가
   - 통신판매업 신고번호 표기 자리 추가
     ※ 실제 신고번호 값은 모르므로 임의로 채우지 마라.
       플레이스홀더와 함께 "사용자 입력 필요"로 표시해라.
   - 현재 하드코딩된 사업자 정보(대표, 사업자등록번호, 지점 주소, 전화)를
     관리자 설정(DB)에서 관리하는 방안을 검토하고 제안만 해라. 구현은 하지 마라.

5. 개인정보처리방침 내용 점검 — 누락 항목만 지적
   · 수집 항목과 목적
   · 보유 및 이용 기간
   · 제3자 제공 (PortOne, SMS/알림톡 업체 등)
   · 처리위탁
   · 국외이전 (Firebase, AWS — 이전받는 자, 국가, 항목, 목적, 거부 방법)
   · 정보주체 권리와 행사 방법
   · 개인정보 보호책임자 연락처
   · 파기 절차 및 방법
   · 만 14세 미만 처리 방침

[제약]
- 사업자 정보, 신고번호 등 실제 값을 추측해서 채우지 마라.
- 법률 문안을 창작하지 마라. 구조와 누락 항목만 다뤄라.
  누락 항목은 "법률 검토 필요"로 표시해라.
- docs/AI_PROMPTS_ANDROID.md 의 공통 제약을 따라라.

[결과 저장]
docs/audits/legal-notice-YYYYMMDD.md
```

---

# 프롬프트 C. 결제 서버 검증 감사

독립 실행 가능. 코드 수정 없음. 0단계 A 발견사항의 실질적 후속이다.

```
[실행 전 확인 — 필수]
아래를 먼저 실행하고 결과를 출력해라.
  pwd
  git rev-parse --show-toplevel
  git branch --show-current
  git status --short
결과가 아래와 다르면 즉시 멈추고 사용자에게 보고해라. 다른 폴더에서 작업하지 마라.
  저장소 : C:/Users/eldorado/Desktop/폴더/회사 폴더/ICL
  브랜치 : fix/play-store-compliance
※ 나란히 있는 HomePage 폴더는 2026-07-31 시점의 구버전 체크아웃이다. 절대 건드리지 마라.

결제 보안 감사를 수행해라. 코드를 수정하지 마라.

[배경]
frontend/public/payment-config.js 의 storeId/channelKey 는 PortOne V2 의
공개 클라이언트 식별자로, 브라우저에 노출되는 것이 정상 설계다.
따라서 실제 방어선은 백엔드 검증에 있다. 그 방어선이 존재하는지 확인한다.

[점검]
1. 결제 승인 처리에서 금액을 어디서 가져오는가.
   클라이언트가 보낸 amount 를 신뢰하는가, 서버 DB 의 주문 금액과 대조하는가.
   대조한다면 코드 위치를 파일:라인으로 제시해라.
2. PortOne 웹훅 수신 엔드포인트가 있는가. 서명 검증을 하는가.
3. 동일 paymentId 의 중복 승인을 차단하는가.
4. 결제 요청자와 주문 소유자의 일치를 검증하는가.
   (타인의 주문을 결제 완료 처리할 수 있는가)
5. 결제 상태 변경이 트랜잭션으로 묶여 있는가.
6. 환불 API 가 관리자 권한을 서버에서 검증하는가.
7. 수강권 차감 / 영상 시청권한 부여가 결제 승인 확인 후에 일어나는가.
8. 결제 실패 / 중도 이탈 시 주문 상태가 어떻게 정리되는가.

[추가 점검 — 앱 결제 정책]
프롬프트 A 에서 앱이 "리더 앱" 전략을 쓰고 있음이 확인됐다.
(AcademyDetailPage.jsx:257,294 / AcademyPage.jsx:1116 — 앱에서 가격·구매 버튼 숨김)

9. 결제 진입점이 CartPage 하나뿐인지 전수 확인해라.
   장바구니를 거치지 않는 결제 경로가 따로 있는가.
10. 앱(isNativeApp)에서 교육영상 구매가 차단되는 지점을 전부 나열해라.
    UI 숨김만인가, 서버에서도 차단하는가.
    UI만 숨겼다면 앱에서 API 를 직접 호출해 구매가 가능한지 확인해라.
11. 스튜디오 수강권 / 수업 예약 결제가 구현돼 있는가.
    구현돼 있다면 어느 경로이고, 앱에서 사용 가능한가.
    (오프라인 서비스는 Play 결제 예외 대상이라 앱에서 외부 PG 사용이 허용된다)
12. 앱 내에 웹사이트 구매를 유도하는 문구·링크가 있는지 검사해라.
    (한국 스토어프론트에서 Apple 은 금지. Play 는 2026-12-31 정책 적용 전까지 보수적으로 본다)

[출력]
| 점검 항목 | 구현 여부 | 근거 파일:라인 | 취약 시 시나리오 | 심각도 |

미구현 항목은 공격 시나리오를 구체적으로 서술해라.

[제약]
- 실제 결제 API 를 호출하지 마라. 정적 분석으로만 판단해라.
- ALLOW_EXTERNAL_PAYMENT_CALLS 를 켜지 마라.
- docs/AI_PROMPTS_ANDROID.md 의 공통 제약을 따라라.

[결과 저장]
docs/audits/payment-security-YYYYMMDD.md
```

---

# 🔴 프롬프트 H1. 운영 주문 악용 여부 조회 (읽기 전용)

프롬프트 C 에서 확인된 결제 금액 위변조 취약점의 과거 악용 여부를 확인한다.
**사용자가 운영 DB 읽기 전용 조회를 승인했다.** 이 승인은 이 작업에만 유효하다.

```
[실행 전 확인 — 필수]
아래를 먼저 실행하고 결과를 출력해라.
  pwd
  git rev-parse --show-toplevel
  git branch --show-current
  git status --short
결과가 아래와 다르면 즉시 멈추고 사용자에게 보고해라. 다른 폴더에서 작업하지 마라.
  저장소 : C:/Users/eldorado/Desktop/폴더/회사 폴더/ICL
※ 나란히 있는 HomePage 폴더는 2026-07-31 시점의 구버전 체크아웃이다. 절대 건드리지 마라.

[승인 범위 — 엄격히 지켜라]
사용자가 운영 DB(icl_pilates) 읽기 전용 조회를 승인했다.
- SELECT 만 실행해라.
- INSERT / UPDATE / DELETE / DDL / 트랜잭션 변경을 절대 실행하지 마라.
- 스키마를 변경하지 마라.
- 조회가 끝나면 연결을 즉시 종료해라.
- 이 승인은 이 작업에만 유효하다. 다음 작업의 기본 환경은 다시 개발 환경이다.

[배경]
결제 금액이 클라이언트 값으로 저장된다.
orders.amount 에 조작된 금액이 그대로 기록되므로 과거 악용을 조회로 탐지할 수 있다.
- orders.service.js:142  amount = payload.amount  (클라이언트 값)
- payments.service.js:236  paidAmount vs requestedAmount (둘 다 클라 유래)
- products.price 는 결제 흐름에서 조회되지 않음

[작업]
1. orders 의 payload 구조를 먼저 파악해라. (상품ID·수량이 어떤 키에 담기는지)
   샘플 1~2건만 확인하고, 개인정보 필드는 출력하지 마라.

2. 정가 대조 쿼리를 작성해라.
   각 주문의 payload 상품 목록으로 products.price 합계를 구하고
   orders.amount 와 비교해 차액이 있는 주문을 찾아라.
   쿠폰·포인트 할인이 있다면 정상 할인과 조작을 구분할 수 있는지 검토해라.

3. 아래를 집계해 보고해라.
   - 전체 주문 건수와 기간
   - 정가 합계와 결제액이 불일치하는 주문 건수
   - 불일치 금액 분포 (특히 정가 대비 1% 미만 같은 극단값)
   - 해당 주문의 생성 시각 분포 (특정 시점에 몰렸는지)
   - 동일 사용자가 반복했는지 여부

4. 악용 정황이 있으면 해당 주문의 상품·수량·결제액·시각을 표로 정리해라.

[출력]
| 주문ID | 상품 | 정가 합계 | 실결제액 | 차액 | 생성 시각 | 판정 |
사용자 식별정보는 마스킹해라. 이메일 원문, 이름, 전화번호를 출력하지 마라.
사용자 구분이 필요하면 익명 일련번호(A, B, C…)를 부여해라.

[판정 기준]
- 정가와 일치 → 정상
- 쿠폰·포인트로 설명되는 차액 → 정상
- 설명되지 않는 차액, 특히 극단적 저액 → 악용 의심

[중단 지점]
- payload 구조가 주문마다 달라 정가 대조가 불가능한 경우
- 쿠폰·포인트 이력 테이블이 없어 정상 할인과 구분이 안 되는 경우
- 악용 정황이 발견된 경우 → 즉시 보고하고 멈춰라

[결과 저장]
docs/audits/payment-abuse-check-YYYYMMDD.md
악용 정황이 없으면 "탐지 결과 없음"도 명확히 기록해라.

[제약]
- 코드를 수정하지 마라.
- 운영 데이터를 변경하지 마라.
- git add / commit / push 를 하지 마라.
  단, 개별 프롬프트가 커밋을 명시적으로 요구하면 그 프롬프트가 우선한다.
  (예: H2 는 hotfix 브랜치에 커밋까지 수행한다. push 와 main 병합은 여전히 별도 승인)
```

---

# 🔴 프롬프트 H2. 결제 금액 검증 hotfix

**사용자가 별도 hotfix 브랜치 배포를 승인했다.** main 병합과 push 는 여전히 별도 승인 사항이다.

```
[실행 전 확인 — 필수]
아래를 먼저 실행하고 결과를 출력해라.
  pwd
  git rev-parse --show-toplevel
  git branch --show-current
  git status --short
결과가 아래와 다르면 즉시 멈추고 사용자에게 보고해라. 다른 폴더에서 작업하지 마라.
  저장소 : C:/Users/eldorado/Desktop/폴더/회사 폴더/ICL
※ 나란히 있는 HomePage 폴더는 2026-07-31 시점의 구버전 체크아웃이다. 절대 건드리지 마라.

[배경]
결제 금액을 클라이언트가 정하는 취약점이 운영(main)에 노출돼 있다.
products.price 가 결제 흐름 어디에서도 조회되지 않는다.

공격 시나리오:
장바구니에 125만원 수강권을 담고 요청 amount 를 100원으로 변조
→ PortOne 브라우저 SDK 가 100원 결제
→ confirmPayment 의 paidAmount === requestedAmount 통과 (둘 다 클라 유래)
→ 100원짜리 주문 생성 + 상품 접근권 부여

[선행 조건 — 클린 트리]
이 작업은 main 에서 새 브랜치를 따므로 작업 트리가 비어 있어야 한다.
앞선 프롬프트(A / C / H1)의 결과가 미커밋 상태로 남아 있으면
그것들을 fix/play-store-compliance 에 먼저 커밋한 뒤 이 작업을 시작해라.
stash 나 신규 워크트리로 우회하지 마라.

[브랜치]
1. 작업 트리가 클린한지 먼저 확인해라. 미커밋 변경이 있으면 멈추고 보고해라.
   이 프롬프트는 공통 제약의 커밋 금지 규칙에서 예외다. 커밋을 수행한다.
2. main 에서 hotfix/payment-amount-validation 브랜치를 생성해라.
   git checkout -b hotfix/payment-amount-validation main
3. 이 hotfix 에는 결제 금액 검증만 담아라.
   Play 대응 작업(fix/play-store-compliance)의 변경을 섞지 마라.
4. main 에 병합하지 마라. push 하지 마라. 커밋까지만 하고 보고해라.

[수정 설계]

1. 서버 권위 금액 재계산 — 필수
   - 클라이언트가 보낸 amount 를 신뢰하지 마라. 검증용으로만 쓰거나 아예 무시해라.
   - 상품ID와 수량으로 products.price 를 조회해 서버가 합계를 계산해라.
     기존 collectOrderProductQuantities() 를 재사용할 수 있는지 검토해라.
   - 쿠폰·포인트 할인이 있다면 그 계산도 서버로 옮겨라.
     쿠폰 유효성(기간, 사용여부, 소유자, 중복사용)을 서버에서 검증해라.
   - 서버 계산액과 PortOne paidAmount 를 대조해라.
   - 불일치 시: 주문을 생성하지 말고, 이미 승인된 결제는 취소(환불)를 시도해라.
     취소 실패 시 반드시 로그를 남기고 관리자가 인지할 수 있게 해라.

2. PortOne V2 결제 금액 사전 등록 — 적용 가능하면 함께
   - PortOne V2 에 결제 금액 사전 등록(pre-registration) 기능이 있는지 확인해라.
     있다면 결제 요청 전 서버가 예상 금액을 등록해 PortOne 단계에서 강제하도록 해라.
   - 사전 등록이 있으면 조작된 금액은 결제 자체가 성립하지 않아
     사후 환불 처리가 불필요해진다. 1번보다 근본적인 방어다.
   - PortOne 문서로 실제 지원 여부와 API 를 확인해라. 추측으로 구현하지 마라.
     확인이 안 되면 1번만 적용하고 2번은 "확인 필요"로 보고해라.

3. 회귀 방지
   - 조작 시나리오를 재현하는 테스트를 추가해라.
     (요청 amount 를 상품가와 다르게 보냈을 때 거부되는지)
   - 정상 결제 경로가 그대로 동작하는지 확인해라.
   - 쿠폰·포인트 적용 정상 케이스도 테스트해라.

[하지 말 것]
- 프롬프트 C 의 Medium 항목(앱 영상구매 서버 차단)은 이번 hotfix 에 넣지 마라.
  금전 취약점이 아니라 스토어 정책 이슈이므로 분리한다.
- 결제 로직을 리팩토링하지 마라. 금액 검증 추가에 필요한 최소 변경만 해라.
- API 응답 구조를 바꾸지 마라. 기존 클라이언트가 깨진다.
- 실제 결제·환불 API 를 호출하지 마라. TEST_SAFE_MODE 를 유지해라.
  ALLOW_EXTERNAL_PAYMENT_CALLS 를 켜지 마라.

[검증]
- backend 테스트 전체 통과
- 조작 시나리오 테스트가 실패(거부)로 나오는지 확인
- 정상 결제 흐름 회귀 확인
- 개발 환경에서만 검증해라. 운영 환경에 배포하지 마라.

[중단 지점]
- 작업 트리가 클린하지 않은 경우
- 쿠폰·포인트 계산 구조가 복잡해 서버 이관 범위가 커지는 경우
- PortOne 사전 등록 API 확인이 안 되는 경우
- 기존 주문 데이터와 호환이 깨질 가능성이 있는 경우
- 테스트 실패

[결과 저장]
docs/audits/payment-amount-hotfix-YYYYMMDD.md
배포 전 사용자가 확인해야 할 사항을 마지막에 정리해라.

[공통 제약]
docs/AI_PROMPTS_ANDROID.md 의 "모든 프롬프트 공통 제약" 을 따라라.
단, 이 작업의 브랜치는 hotfix/payment-amount-validation 이다.
```

---

# 프롬프트 D. Play Console 정책 자산 감사

독립 실행 가능. 코드 수정 없음. 계정 발급 후 Data safety 양식에 그대로 옮겨 쓸 자료를 만든다.

```
[실행 전 확인 — 필수]
아래를 먼저 실행하고 결과를 출력해라.
  pwd
  git rev-parse --show-toplevel
  git branch --show-current
  git status --short
결과가 아래와 다르면 즉시 멈추고 사용자에게 보고해라. 다른 폴더에서 작업하지 마라.
  저장소 : C:/Users/eldorado/Desktop/폴더/회사 폴더/ICL
  브랜치 : fix/play-store-compliance
※ 나란히 있는 HomePage 폴더는 2026-07-31 시점의 구버전 체크아웃이다. 절대 건드리지 마라.

docs/APP_STORE_REVIEW_GUIDE.md 의 "3. Google Play 체크리스트" 를 기준으로
현재 코드베이스가 무엇을 갖췄고 무엇이 없는지 감사해라. 코드를 수정하지 마라.

[점검]

A. Data safety 양식 작성용 자료 수집
   - backend 소스에서 수집하는 개인정보 항목 전체를 추출해라
     (회원/예약/주문/수강권/문의 테이블 컬럼 기준)
   - 각 항목의 수집 목적을 분류해라
     (계정 관리 / 앱 기능 / 분석 / 고객지원 / 결제 등)
   - 제3자로 전송되는 데이터 목록
     (Firebase, PortOne, SMS·알림톡 업체, 이메일 발송 등)
   - 전송 중 암호화 여부, 저장 시 암호화 여부
   - 사용자가 삭제 요청 가능한 항목
   - 결과를 Play Console Data safety 양식에 그대로 옮길 수 있는 표로 정리해라.

B. Health apps 선언 대상 여부
   - 운동 기록, 진도, 신체정보를 저장하는 기능이 있는지 확인해라
   - 있다면 어떤 데이터인지 목록화해라
   - "Health and fitness app" 으로 선언해야 하는지 판정하고 근거를 제시해라
   - 과소 신고와 과대 신고 모두 반려 사유이므로 근거를 명확히 해라

C. 권한 최소화
   - 최종 병합 매니페스트의 권한 목록 전체를 확인해라
     (frontend/android/app/build/outputs/logs/manifest-merger-*-report.txt)
   - 위치, 사진/미디어, AD_ID 권한이 라이브러리를 통해 병합됐는지
   - 사용하지 않는 권한이 있으면 tools:node="remove" 제거 후보로 제시해라
     (제거 자체는 하지 마라)

D. 마케팅 문구 검사
   - 전체 소스와 스토어 설명 후보 문안에서 검색
     "치료" "교정" "완치" "통증" "재활" → 허위 건강 주장 후보
     "최고" "1위" "유일" "최상" → 최상급 표현 금지 위반 후보
   - 각 발견 위치와 대체 표현을 제안해라

E. 스토어 등록 자산 준비 상태
   - 앱 아이콘(512x512), 그래픽 이미지(1024x500) 존재 여부
   - 스크린샷 확보 가능 여부 (Playwright 로 자동 생성 가능한지 검토)
   - 짧은 설명(80자) / 자세한 설명(4000자) 초안 존재 여부

[출력]
| 항목 | 현재 상태 | Play 요구사항 | 판정 | 근거 파일 | 조치 |

마지막에 "Play Console 업로드 전 반드시 해결" 목록을 우선순위로 정리해라.

[제약]
- 개인정보 실제 값을 출력하지 마라. 컬럼명과 항목명만 다뤄라.
- 확인 못 한 항목은 "확인불가"로 표시하고 필요한 정보를 명시해라.
- docs/AI_PROMPTS_ANDROID.md 의 공통 제약을 따라라.

[결과 저장]
docs/audits/play-policy-YYYYMMDD.md
```

---

# 프롬프트 G. 이미지·자산 최적화

프롬프트 A 의 용량 분석 후속. R8 대신 이쪽이 실효적이다. 독립 실행 가능.

```
[실행 전 확인 — 필수]
아래를 먼저 실행하고 결과를 출력해라.
  pwd
  git rev-parse --show-toplevel
  git branch --show-current
  git status --short
결과가 아래와 다르면 즉시 멈추고 사용자에게 보고해라. 다른 폴더에서 작업하지 마라.
  저장소 : C:/Users/eldorado/Desktop/폴더/회사 폴더/ICL
  브랜치 : fix/play-store-compliance
※ 나란히 있는 HomePage 폴더는 2026-07-31 시점의 구버전 체크아웃이다. 절대 건드리지 마라.

AGENTS.md, docs/PROJECT_RULES.md, docs/AI_PROMPTS_ANDROID.md 를 읽어라.

[배경]
AAB 44.6MB 중 웹 자산이 42.99MB(81%)를 차지한다. dex 는 9.43MB(18%)뿐이라
R8 은 실익이 낮아 보류됐다. 실효적 감량 수단은 이미지 최적화다.
instructor-05.jpg 한 장이 12.3MB 이고, 강사 사진 5장과 수료증 PNG 정리만으로
약 30MB 감량 여지가 확인됐다.

이것은 앱 크기 문제만이 아니다. 같은 이미지를 웹에서도 로드하므로
모바일 웹 성능(LCP)에 직접 영향을 준다.

[작업]

1. 자산 인벤토리
   - frontend/public 및 dist 에서 100KB 이상인 이미지를 크기순으로 전부 나열해라.
   - 각 파일의 실제 픽셀 크기, 포맷, 화면에서 렌더링되는 표시 크기를 함께 조사해라.
   - 실제 표시 크기보다 과도하게 큰 원본을 골라내라.
   - 어디에서도 참조되지 않는 미사용 이미지를 찾아라.
     삭제 전 docs/PROJECT_RULES.md 의 "삭제 전 필수 확인" 절차를 따라라.
     확신이 없으면 삭제하지 말고 "삭제 후보"로만 보고해라.

2. 최적화 방안 제안 — 적용 전에 먼저 보고해라
   - 리사이즈 목표 해상도 (2x 디스플레이 기준)
   - 포맷 전환 (WebP / AVIF) 과 브라우저 호환 범위
     ※ Android WebView 최소 버전(minSdk 24)에서 지원되는지 확인해라
   - 압축 품질 기준
   - 예상 감량치를 파일별로 제시해라

3. 승인 후 적용
   - 원본은 삭제하지 말고 별도 보관 경로를 제안해라.
   - 이미지 교체 후 실제 화면에서 화질 저하가 없는지 확인해라.
     특히 강사 사진과 수료증은 브랜드 이미지에 직결된다.
   - lazy loading 미적용 이미지가 있으면 적용 후보로 보고해라.

4. 검증
   - npm run build 후 dist 크기 비교
   - bundleRelease 후 AAB 크기 비교 (기준: 44.59MB)
   - 주요 화면 3개의 LCP 변화 측정

[중단 지점]
- 이미지 삭제 여부가 불확실한 경우
- 화질 저하가 눈에 띄는 경우
- WebP/AVIF 가 대상 WebView 에서 미지원인 경우
- 감량 효과가 예상의 절반에 미치지 못하는 경우

[결과 저장]
docs/audits/asset-optimization-YYYYMMDD.md

[공통 제약]
docs/AI_PROMPTS_ANDROID.md 의 "모든 프롬프트 공통 제약" 을 따라라.
```

---

# 프롬프트 E. Android 실기기 QA

프롬프트 A 완료 후 실행한다.

```
[실행 전 확인 — 필수]
아래를 먼저 실행하고 결과를 출력해라.
  pwd
  git rev-parse --show-toplevel
  git branch --show-current
  git status --short
결과가 아래와 다르면 즉시 멈추고 사용자에게 보고해라. 다른 폴더에서 작업하지 마라.
  저장소 : C:/Users/eldorado/Desktop/폴더/회사 폴더/ICL
  브랜치 : fix/play-store-compliance
※ 나란히 있는 HomePage 폴더는 2026-07-31 시점의 구버전 체크아웃이다. 절대 건드리지 마라.

AGENTS.md, docs/WORKFLOW.md, docs/PROJECT_RULES.md 를 읽어라.

[작업]
Android 앱 빌드로 실기기 또는 에뮬레이터에서 QA 를 수행해라.
웹 브라우저 테스트가 아니라 앱 환경 테스트다.
기존 스크립트를 활용해라: npm run cap:sync:dev / npm run test:e2e:app

[A. 앱 고유 동작 — 웹에서는 검증 불가]
- 앱 최초 실행 → 스플래시 → 첫 화면 진입 시간과 화면 깜빡임
- 백그라운드 전환 후 복귀 시 세션 유지 여부
- 기기 뒤로가기 버튼 동작 (각 화면. 앱이 즉시 종료되면 안 된다)
- 딥링크 진입 동작 (프롬프트 A 에서 통일한 scheme 기준)
- 네트워크 끊김 상태 화면 (@capacitor/network 사용 중)
- 네트워크 복구 시 자동 재시도
- 키보드 상승 시 입력창 가림 (로그인, 예약, 문의)
- 상태바 / 노치 / 제스처 네비게이션 영역 침범
  ※ capacitor.config.json 의 SystemBars insetsHandling: disable 설정 때문에
    safe-area 처리가 CSS 쪽에 있는지 반드시 확인해라
- 화면 회전 시 레이아웃

[B. 결제 플로우 — 앱 환경 특유]
- PortOne 결제창이 앱 WebView 안에서 정상적으로 열리는지
- 결제 앱(카드사/간편결제) 호출 후 앱으로 복귀되는지
- 복귀 후 결제 결과가 화면에 반영되는지
- 결제 도중 앱 종료 시 처리
※ 실제 결제를 하지 마라. TEST_SAFE_MODE 및 테스트 키 환경에서만 확인하고,
  실결제가 필요한 항목은 "실기기 수동 확인 필요"로 남겨라.

[C. 영상 재생]
- 앱 WebView 에서 교육영상 재생
- 전체화면 전환
- 백그라운드 전환 시 재생 중지
- 진도 저장이 앱에서도 동작하는지
- 권한 없는 영상의 직접 재생 차단

[D. 접근성 — 현재 프로젝트 규칙에 없는 영역]
- TalkBack 켠 상태로 로그인 → 예약까지 도달 가능한지
- 아이콘 전용 버튼의 aria-label 누락 개수
- 터치 타겟 48x48dp 이상 여부
- 시스템 글꼴 최대 크기에서 레이아웃 유지
※ Play Console Pre-launch report 가 접근성 경고를 내면 심사가 지연될 수 있다.

[E. 성능]
- 릴리즈 AAB 크기
- 콜드 스타트 시간
- 화면 전환 프레임 드랍
- 영상 재생 중 메모리 사용량

[출력]
| 영역 | 테스트 항목 | 결과 | 재현 조건 | 심각도 | 근거 |
결과는 정상 / 문제 / 미확인 중 하나.

[제약]
- 코드를 수정하지 마라. QA 결과만 보고해라.
- 실기기/에뮬레이터로 확인하지 못한 항목은 "실기기 확인 불가"로 명시해라.
  추측으로 정상 처리하지 마라.
- 실제 결제, 실제 SMS/알림톡 발송 수행 여부를 반드시 명시해라.
- docs/AI_PROMPTS_ANDROID.md 의 공통 제약을 따라라.

[결과 저장]
docs/audits/android-device-qa-YYYYMMDD.md
```

---

# 프롬프트 I. 스토어 등록 자산 제작

프롬프트 D 에서 "스토어 자산 미준비"로 확인된 항목을 만든다. E 완료 후 실행한다.

```
[실행 전 확인 — 필수]
아래를 먼저 실행하고 결과를 출력해라.
  pwd
  git rev-parse --show-toplevel
  git branch --show-current
  git status --short
결과가 아래와 다르면 즉시 멈추고 사용자에게 보고해라. 다른 폴더에서 작업하지 마라.
  저장소 : C:/Users/eldorado/Desktop/폴더/회사 폴더/ICL
  브랜치 : fix/play-store-compliance
※ 나란히 있는 HomePage 폴더는 2026-07-31 시점의 구버전 체크아웃이다. 절대 건드리지 마라.

AGENTS.md, docs/PROJECT_RULES.md, docs/APP_STORE_REVIEW_GUIDE.md,
docs/audits/play-policy-20260820.md 를 읽어라.

[배경]
Play Console 업로드에 필요한 시각 자산과 문안이 하나도 없다.
Playwright 가 이미 구성돼 있고 mobile-375 / android-412 프로젝트가 정의돼 있으므로
스크린샷은 자동 생성이 가능하다.

[작업]

1. 스크린샷 자동 생성
   - frontend/playwright.config.js 의 기존 모바일 프로젝트를 활용해라.
   - Play 요구: 휴대전화 스크린샷 최소 2장(권장 4~8장),
     각 변 320~3840px, 세로 비율 권장.
   - 촬영 대상 화면을 선정해 제안하고 승인받은 뒤 촬영해라.
     후보: 홈, 수업 예약 캘린더, 교육영상 목록, 영상 상세, 마이페이지
   - 촬영 전 데모 데이터를 채워라. 빈 화면은 심사에서 감점이다.
   - 개인정보가 화면에 노출되지 않게 해라. 실명·연락처·이메일은 더미로 교체.

2. 앱 아이콘 (512x512 PNG)
   - 현재 런처 아이콘이 Capacitor 기본 템플릿인지 커스텀인지 확인해라.
     frontend/android/app/src/main/res/mipmap-* 를 검사해라.
   - 기본 템플릿이면 그 사실을 보고해라. 브랜드 아이콘 제작은 디자인 판단이므로
     임의로 만들지 말고 사용자에게 필요 사항을 정리해 제시해라.

3. 피처 그래픽 (1024x500 PNG)
   - 제작이 필요한 사양과 구성 요소를 정리해 제시해라.
   - 임의로 디자인하지 마라. 요구사항 정리까지만 해라.

4. 스토어 문안 초안
   - 짧은 설명 80자 이내
   - 자세한 설명 4000자 이내
   - docs/audits/play-policy-20260820.md 의 금지 표현 검사 결과를 반영해라.
     "치료" "교정" "완치" "통증" "재활" 등 의료 주장 금지.
     "최고" "1위" "유일" 등 최상급 표현 금지.
   - 실제 기능만 서술해라. 미구현 기능을 적지 마라.
   - 초안임을 명시하고 사용자 검수를 전제로 작성해라.

5. 산출물 정리
   - 생성한 자산을 한 폴더에 모으고 규격을 표로 정리해라.
   - Play Console 입력란별로 어느 파일을 쓰는지 매핑해라.

[제약]
- 스크린샷에 개인정보를 노출하지 마라.
- 실제 회원 데이터를 사용하지 마라. 개발/테스트 데이터만 써라.
- 브랜드 디자인을 임의로 창작하지 마라. 요구사항 정리와 자동 촬영까지만 해라.
- 미구현 기능을 스토어 문안에 적지 마라.
- docs/AI_PROMPTS_ANDROID.md 의 공통 제약을 따라라.

[결과 저장]
docs/audits/store-assets-YYYYMMDD.md
```

---

# 프롬프트 F. 서명 및 업로드 준비

**Google Play 개발자 계정 발급 + keystore 생성 후**에 실행한다.

```
[실행 전 확인 — 필수]
아래를 먼저 실행하고 결과를 출력해라.
  pwd
  git rev-parse --show-toplevel
  git branch --show-current
  git status --short
결과가 아래와 다르면 즉시 멈추고 사용자에게 보고해라. 다른 폴더에서 작업하지 마라.
  저장소 : C:/Users/eldorado/Desktop/폴더/회사 폴더/ICL
  브랜치 : fix/play-store-compliance
※ 나란히 있는 HomePage 폴더는 2026-07-31 시점의 구버전 체크아웃이다. 절대 건드리지 마라.

AGENTS.md, docs/AI_PROMPTS_ANDROID.md 를 읽어라.

[전제]
사용자가 keystore 를 직접 생성했고 keystore.properties 를 배치한 상태다.

[작업]
1. keystore.properties 가 .gitignore 에 포함돼 있는지 확인해라.
   포함돼 있지 않으면 추가를 제안하고 멈춰라.
2. keystore 파일이 저장소 안에 있으면 즉시 경고하고 멈춰라.
3. signingConfig 배선이 정상 동작하는지 검증해라.
   (configure-native.mjs 의 조건부 주입)
4. bundleRelease 를 실행하고 서명된 AAB 가 생성되는지 확인해라.
5. 서명 검증:
   - AAB 를 APK 로 변환하지 않고 검증 가능한 방법으로 서명 존재를 확인해라
   - 서명 인증서의 지문(SHA-1, SHA-256)을 출력해라
     ※ 지문은 공개 정보이므로 출력해도 된다. 비밀번호는 출력하지 마라.
6. 최종 AAB 크기를 44.6MB 기준선과 비교해 보고해라.
7. Firebase 를 사용하려면 SHA 지문을 Firebase 콘솔에 등록해야 한다.
   등록 절차를 안내해라. (실행은 사용자가 한다)

[출력]
- 서명 검증 결과
- SHA-1 / SHA-256 지문
- 최종 AAB 경로와 크기
- Play Console 업로드 전 남은 체크리스트

[제약]
- keystore 를 생성하거나 재생성하지 마라.
- keystore 비밀번호를 출력하거나 로그에 남기지 마라.
- docs/AI_PROMPTS_ANDROID.md 의 공통 제약을 따라라.

[결과 저장]
docs/audits/android-signing-YYYYMMDD.md
```

---

# 부록 1. keystore 생성 절차 (사용자 직접 수행)

**AI 에이전트에게 시키지 마라.** 분실 시 같은 패키지명으로 앱 업데이트가 영구히 불가능하다.

## 시점

Google Play 개발자 계정 발급 후, 첫 업로드 직전. 미리 만들면 방치되다 분실하기 쉽다.

## Play App Signing

**반드시 사용한다.** 업로드 키를 분실해도 Google 에 재설정을 요청할 수 있다. 사용하지 않으면 분실 시 복구 수단이 없다. 첫 AAB 업로드 시 자동 등록된다.

## 생성

```
keytool -genkeypair -v ^
  -keystore icl-upload.jks ^
  -storetype JKS ^
  -keyalg RSA -keysize 2048 -validity 10000 ^
  -alias icl-upload
```

실행 전 확인:

```
where keytool
```

없으면 Android Studio 의 JDK 경로를 사용한다. (`...\Android Studio\jbr\bin`)

## 생성 후 필수 조치

- `icl-upload.jks` 를 **프로젝트 폴더 밖**에 보관한다. 저장소 안에 두지 않는다.
- 파일과 비밀번호를 **최소 2곳**에 백업한다. (비밀번호 관리자 + 오프라인 매체)
- `keystore.properties` 에 경로·비밀번호를 기록하되 `.gitignore` 포함을 확인한다.
- keystore 파일과 비밀번호를 AI 에이전트에게 보여주지 않는다.

## 확인

```
keytool -list -v -keystore icl-upload.jks -alias icl-upload
```

---

# 부록 2. Google Play 개발자 계정

## 계정 유형: 조직(Organization)

사업자등록번호 중간 2자리가 85 → 법인이므로 조직 계정으로 등록한다.

| | 개인 | 조직 ← 선택 |
|---|---|---|
| 등록 즉시 가능 | O | X (D-U-N-S 대기) |
| 12명 × 14일 비공개 테스트 | **필수** | 미적용으로 알려짐 |
| 개발자명 노출 | 대표 개인 실명 | 사업자/브랜드명 |
| 나중에 전환 | 사실상 불가 | — |
| 총 소요 | 3~5주 | 2~4주 |

※ "조직 계정은 12명/14일 면제"는 공식 문서에 명시된 문구가 아니다. 공식 문서는 "2023-11-13 이후 생성된 개인 계정에 적용"이라고만 기술한다. Play Console 등록 후 실제 요구사항을 확인해야 한다.

## 선행 작업

1. **D-U-N-S 번호 신청** — 무료, 발급 1~4주. **가장 먼저 착수한다.** Apple 조직 계정에도 같은 번호를 쓴다.
2. 조직 웹사이트와 담당자 연락처 준비 (OTP 검증 있음)
3. 등록비 $25 (1회성)
4. 결제 수단 검증 최대 5일

## 계정 없이도 가능한 작업

프롬프트 A ~ E 전부. 계정이 막는 것은 다음뿐이다.

- Play App Signing 등록
- 내부/비공개 테스트 트랙 배포
- Pre-launch report (자동 접근성·크래시 검사)
- 심사 제출

---

# 부록 3. 보류 항목

판단이 끝나지 않았거나 후순위로 밀린 항목이다.

| 항목 | 사유 | 재검토 시점 |
|---|---|---|
| `minifyEnabled` / `shrinkResources` | **보류 확정.** dex 비중 18%뿐이라 R8 실익이 낮고 Capacitor/Firebase 리플렉션 파손 위험만 큼 | 재검토 불필요. 감량은 프롬프트 G로 |
| `payment-config.js` git 추적 해제 | 공개 식별자라 긴급도 낮음. 배포 시 주입 구조로 전환 | 프롬프트 C 결과 확인 후 |
| `network_security_config.xml` (debug 한정) | 현행 환경별 제어로 릴리즈는 이미 안전 | A 완료 후 |
| `POST_NOTIFICATIONS` 명시 선언 | 라이브러리 병합으로 이미 동작 중. 명시화는 안전장치 | A 완료 후 |
| `google-services.json` 배치 | 푸시 기능 사용 시점에 Firebase 콘솔에서 발급 | 프롬프트 F |
| 사업자 정보 DB 이관 | 현재 SiteFooter 하드코딩. 지점 추가 시 필요 | 프롬프트 B 제안 확인 후 |

---

# 부록 4. 하지 말아야 할 것

- **git 이력 재작성** (filter-branch, BFG, rebase -i) — 공개 식별자라 실익 없음, 위험만 큼
- **PortOne storeId/channelKey 재발급** — 공개 클라이언트 식별자, 사고 아님
- **AI 에이전트에게 keystore 생성 위임**
- **main 브랜치 병합** — GitHub Actions 운영 배포 트리거. 사용자 명시 승인 필요
- **운영 DB(icl_pilates) / 운영 키 접근**
- **실제 결제·환불·SMS·알림톡 발송** — TEST_SAFE_MODE 유지
- **법률 문안 창작** — 누락 지적까지만. 문안은 법률 검토 필요

---

## End of AI_PROMPTS_ANDROID.md

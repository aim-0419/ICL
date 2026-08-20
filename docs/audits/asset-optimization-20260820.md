> # ⚠️ 원본 백업 필수 — 저장소 밖으로 별도 백업할 것
>
> 이번 최적화의 변환 전 원본 11개는 `frontend/_original-assets/` 에 보관돼 있고 **.gitignore 처리**되어
> Git 에 올라가지 않는다. 즉 **이 폴더는 커밋되지 않으므로, 저장소를 새로 clone 하거나 이 폴더가
> 삭제되면 원본이 사라진다.** 화질 재조정이나 인쇄용 고해상도가 나중에 필요할 수 있으니,
> **작업자가 지금 이 폴더를 USB·클라우드 등 저장소 밖 안전한 위치로 반드시 별도 백업해야 한다.**
> (특히 강사 사진 원본과 수료증 인쇄본은 브랜드·인쇄 용도로 재사용 가능성이 있다.)

---

# 이미지·자산 최적화 감사 — 2026-08-20 (프롬프트 G)

브랜치 `fix/play-store-compliance`. **1·2단계(인벤토리·제안)만 수행. 적용은 승인 후.**
작업 시작 시 git status: `M docs/AI_PROMPTS_ANDROID.md`(사용자 진행표 갱신, 미변경 유지),
`?? play-policy-20260820.md`, `?? staging-readiness-20260819.md`(이전 산출물).

## 1. 자산 인벤토리 (frontend/public, 100KB↑)

### 과대 원본 — 사용 중, 리사이즈 대상

| 파일 | 현재 | 크기 | 사용처 | 화면 표시 | 판정 |
|---|---|---|---|---|---|
| admin-defaults/instructors/instructor-05.jpg | 4543×6815 | **12.3MB** | 강사소개 기본 이미지(defaultPageOverrides) | 카드/프로필 ~수백 px | 극단적 과대 |
| images/home/certificate-template-a4.png | 2480×3508 | **6.88MB** | 수료증 모달(MyPage `<img>`) | 모달 표시 ~700px | 인쇄해상도, **다운로드 없음** → 과대 |
| admin-defaults/instructors/instructor-06.jpg | 3037×4555 | 4.24MB | 강사소개 기본 | 카드 | 과대 |
| admin-defaults/instructors/instructor-01.jpg | 3072×4096 | 2.54MB | 강사소개 기본 | 카드 | 과대 |
| admin-defaults/instructors/instructor-02.jpg | 3072×4096 | 2.14MB | 강사소개 기본 | 카드 | 과대 |
| images/home/main-hero/…상단 이미지.png | 1935×813 | 1.83MB | 홈 히어로 | 전폭 | PNG→WebP |
| images/intro/intro-main.png | 1717×916 | 1.54MB | 수업소개 히어로 | 전폭 | PNG→WebP |
| admin-defaults/intro/director-photo.jpg | 2480×3508 | 0.86MB | 대표 사진 기본 | 프로필 | 과대 |

### 미사용 — 삭제 후보 (0 참조, 동적/admin-default 참조도 0)

| 파일 | 크기 | 근거 |
|---|---|---|
| images/intro/**수업소개 메인 이미지.png** | 1.54MB | **intro-main.png 와 md5 완전 동일(중복)**. 코드 0참조 |
| images/home/certificate-template-clean.png | 1.56MB | 코드 0참조, defaultPageOverrides 없음 |
| images/home/이끌림 수료증 최종.png | 1.37MB | 코드 0참조 |

미사용 합계 **~4.47MB**. PROJECT_RULES "삭제 전 필수 확인"의 전체검색·동적참조·public참조를
모두 수행해 0참조를 확인했으나, **확신 100%가 아니므로 삭제 후보로만 보고**한다(특히 수료증 2종은
대체 템플릿일 가능성 — 사용자 확인 필요). 중복(수업소개 메인)은 삭제 안전.

## 2. 최적화 제안 (적용 전 — 승인 필요)

### 포맷: WebP (AVIF 아님)

- **WebView minSdk 24(Android 7.0)에서 WebP 완전 지원** — WebP 는 Android 4.0(API 14)부터,
  무손실·알파 포함은 4.2.1부터 WebView 네이티브 지원. minSdk 24 는 문제없음.
- **AVIF 는 배제** — Android WebView 의 AVIF 지원은 **Android 12(API 31)+** 라 minSdk 24 미달 기기에서
  깨진다. 중단 지점("WebP/AVIF 미지원") 회피를 위해 WebP 로 통일.

### 리사이즈 목표 (2x 디스플레이 기준)

| 용도 | 목표 폭 | 근거 |
|---|---|---|
| 강사/대표 사진(카드·프로필) | ~1200px | 표시 ~400-600px × 2 |
| 수료증 템플릿(모달) | ~1200px | 기존 clean/최종 변형이 1086px → 그 수준이면 충분 |
| 히어로(홈·수업소개) | ~1600px | 전폭 표시, 모바일·데스크톱 커버 |

품질: 사진 WebP q80, 그래픽/텍스트 포함 이미지 q85. 종횡비 유지.

### 파일별 예상 감량

| 파일 | 현재 | 예상 후 | 감량 |
|---|---|---|---|
| instructor-05.jpg | 12.3MB | ~0.2MB | ~98% |
| certificate-template-a4.png | 6.88MB | ~0.2MB | ~97% |
| instructor-06.jpg | 4.24MB | ~0.15MB | ~96% |
| instructor-01/02.jpg | 4.68MB(합) | ~0.3MB(합) | ~94% |
| main-hero.png | 1.83MB | ~0.15MB | ~92% |
| intro-main.png | 1.54MB | ~0.13MB | ~92% |
| director-photo.jpg | 0.86MB | ~0.12MB | ~86% |
| 미사용 3종 삭제 | 4.47MB | 0 | 100% |

**예상 총 감량 ~34MB** (리사이즈+WebP ~29MB + 미사용 삭제 ~4.5MB). APP_STORE_REVIEW_GUIDE·프롬프트 A의
"~30MB 여지"와 부합. AAB 44.59MB → **~12-14MB 수준** 기대.

### 적용에 필요한 도구 (현재 미설치)

- 변환 도구 없음(sharp·cwebp·ImageMagick 모두 없음). `/c/WINDOWS/system32/convert` 는 NTFS 변환기라 **사용 금지**.
- 제안: `npm i -D sharp` (크로스플랫폼, 시스템 의존성 없음)로 스크립트 변환. **의존성 추가라 승인 필요.**

### 부가 — lazy loading

- `<img>` 중 **loading 속성 없는 것 25건**, `loading="lazy"` 적용 6건. 첫 화면 밖 이미지에 lazy 적용 후보.
  적용 시 목록 스크롤 성능·초기 로드 개선. (별도 검토)

## 3. 적용 절차 (승인 후)

1. `npm i -D sharp` (승인 시)
2. 원본은 삭제하지 않고 `frontend/_original-assets/`(gitignore) 등으로 별도 보관 후 변환
3. 코드 참조 경로 갱신(WebP 확장자). 강사 사진·수료증은 브랜드 직결이라 교체 후 화면 화질 확인
4. 미사용 3종은 사용자 확인 후 삭제
5. 검증: `npm run build` dist 크기 비교 → `bundleRelease` AAB 크기 비교(기준 44.59MB) → 주요 화면 3개 LCP

## 중단 — 여기서 멈춤 (승인 요청)

프롬프트 2단계("적용 전 먼저 보고")·3단계("승인 후 적용")에 따라 인벤토리·제안까지만 하고 멈춘다.
**적용하려면 (a) sharp 의존성 추가, (b) 미사용 3종 삭제 여부 확정이 필요하다.** 승인 주시면 적용·검증한다.


---

# 3단계 적용 결과 (2026-08-20)

## 실행 요약

- `npm i -D sharp` 승인대로 설치(libvips 8.18.3). 변환 스크립트 `frontend/scripts/optimize-images.mjs` 로
  남겨 재사용 가능(MANIFEST 만 수정해 재실행).
- 원본 11개를 `frontend/_original-assets/` 로 백업(gitignore). **저장소 밖 별도 백업은 작업자 몫**(위 경고).
- 승인대로 **미사용 3종 중 중복(`수업소개 메인 이미지.png`)만 삭제**. `certificate-template-clean.png`,
  `이끌림 수료증 최종.png` 는 **보류(삭제·변환 모두 제외)**.

## 변환 방식 (참조 안전성)

| 구분 | 방식 | 이유 |
|---|---|---|
| admin-default 8종(강사01–06·대표·기구05) | **in-place JPEG 리사이즈**(파일명·확장자 유지) | `defaultPageOverrides.js` 에 업로드경로→기본값 별칭 매핑이 있어, 확장자 변경 시 DB/localStorage 저장 경로가 깨질 수 있음. 파일명 유지로 참조 무변경 |
| 수료증a4·인트로·홈히어로 3종 | **WebP 변환 + 리사이즈** | 코드 참조가 명시적 1곳뿐이라 안전. 확장자 변경 후 참조 갱신 |
| 홈 히어로 파일명 | 한글 → `home-hero-main.webp` (지시 A) | URL 인코딩·CDN 호환 |

## 파일별 결과

| 파일 | 전 | 후 | 감량 |
|---|---|---|---|
| instructor-05.jpg | 12.30MB(4543×6815) | 0.12MB(1200×1800) | 99% |
| certificate-template-a4 → .webp | 6.88MB(2480×3508) | 0.05MB(1200×1697) | 99% |
| instructor-06.jpg | 4.24MB | 0.11MB | 97% |
| instructor-01/02.jpg | 4.68MB(합) | 0.18MB(합) | 96% |
| main-hero(한글) → home-hero-main.webp | 1.83MB | 0.07MB | 96% |
| intro-main → .webp | 1.54MB | 0.08MB | 95% |
| director-photo.jpg | 0.86MB | 0.15MB | 82% |
| equipment-05.jpg, instructor-03/04.jpg | 소폭 | 소폭 | — |
| **수업소개 메인 이미지.png(중복) 삭제** | 1.54MB | 0 | 100% |
| **변환 합계** | 33.39MB | 0.97MB | **32.42MB↓** |

## 코드 참조 갱신 (누락 0 — 전수 검색 확인)

- `MyPage.jsx`: certificate a4 → `.webp`
- `BrandPages.jsx`: intro-main → `.webp`
- `HomePage.jsx`: 히어로 → `home-hero-main.webp`(영문)
- 옛 경로(`certificate-template-a4.png`, `intro/intro-main.png`, 한글 히어로, `수업소개 메인 이미지`)
  전체 참조 **0건** 재확인. 새 WebP 3개 파일 존재 확인.

## C. lazy loading

- **적용(약 18곳)**: 첫 화면 밖 콘텐츠·썸네일 — MyPage(영상썸네일·수료증모달), CommunityPages(목록 4),
  CartPage(장바구니 썸네일), AcademyPlayerPage(썸네일), Admin(공지·선물·매출 썸네일),
  HomePage 소셜 로고(네이버·인스타), BrandPages CTA 로고.
- **제외(LCP·above-the-fold, 근거)**:
  - `HomePage` 히어로(`home-hero-main.webp`) — **홈 LCP**. lazy 금지
  - `HomePage` 히어로 섹션 내 로고 — 첫 화면 상단
  - `BrandPages` 인트로 히어로(`intro-main.webp`) — **수업소개 LCP**
  - `SiteHeader` 로고 — 모든 페이지 최상단 상시 노출
  - `NativeAppRuntime` 스플래시 로고 — 앱 실행 첫 화면
  - `AcademyDetailPage`/`AcademyPage` — 이미 동적/lazy 처리됨

## 검증

| 항목 | 기준 | 결과 |
|---|---|---|
| `npm run build` | — | 성공, **dist 이미지 6.92MB** (이전 ~44MB) |
| `bundleRelease` AAB | 44.59MB | **11.30MB** (**33.3MB↓, 75%**) |
| LCP 홈 / 수업소개 / 강사소개 | — | **456ms / 148ms / 136ms** (모두 "좋음" <2500ms. 정적 프리뷰·모바일 뷰포트 기준) |
| 화질 육안(강사05·히어로) | 저하 없어야 | **저하 없음** — 피부·머리카락·기구·자연광 디테일 선명. WebP q82/JPEG q80 적정 |

감량 효과 32.4MB(직접)·33.3MB(AAB)로 **예상 ~34MB의 절반을 크게 상회**. 중단 지점 해당 없음.

## 미해결 / 후속

- **원본 저장소 밖 백업(작업자 필수, 위 경고)**.
- 보류한 수료증 2종(clean·최종)의 최종 사용/삭제 여부 결정.
- 커밋하지 않음(공통 제약). package.json 의 sharp(devDependency) 포함 여부는 커밋 시 결정.

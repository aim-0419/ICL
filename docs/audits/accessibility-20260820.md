# 접근성 보강 보고서 (2026-08-20)

- 프롬프트: J. 접근성 보강 (Play pre-launch report 경고 예방)
- 범위: 소비자(비로그인·일반회원) 화면. 관리자 화면 제외
- 브랜치: `fix/play-store-compliance` (커밋하지 않음 — 공통 제약)
- 검증: `npm run build` 통과, Playwright 시각 스모크(모바일 412px)로 레이아웃 무변화 확인

## 핵심 수치

| 항목 | 보강 전 | 보강 후 |
|---|---|---|
| **소비자 파일 aria-label 개수** | **60** | **81 (+21)** |
| 접근성 이름 없는 아이콘 전용 버튼 | 7 | **0** |
| alt 없는 img | 0 (이미 완비) | 0 |
| 라벨 미연결 소비자 input/textarea | 15 | **0** (aria-label 13 + htmlFor/id 2) |
| 48dp 미만 터치 타겟(파악분) | 6종 | **0** (히트영역 확장) |
| 키보드 포커스 미비 | 2건 | **0** (:focus-visible 아웃라인) |

측정 방식: 정적 태그 파서로 소비자 JSX 27개 파일 전수 스캔(중괄호·따옴표 인식, 멀티라인 태그 지원). 프롬프트 E의 "버튼 214개 중 aria-label 47개"는 런타임 전 페이지 합산이며, 격차 대부분은 텍스트 버튼(라벨 불필요)이었음.

## 1. 아이콘 전용 버튼 aria-label (8곳 적용)

| 파일:라인(적용 후) | 아이콘 | 추가한 라벨 |
|---|---|---|
| SignupPage.jsx:200 | ✕ | `약관 창 닫기` |
| HomePage.jsx:630 | 로고 img | `메인 페이지로 이동` (img alt로 이름은 있었으나 명시) |
| MyPage.jsx:1020 | ‹ | `이전 페이지` |
| MyPage.jsx:1033 | › | `다음 페이지` |
| MyPage.jsx:1822 | × | `회원 탈퇴 안내 닫기` |
| MyPage.jsx:1902 | × | `환불 요청 창 닫기` |
| MyPage.jsx:1966 | × | `수강권 환불 창 닫기` |
| MyPage.jsx:2005 | × | `수료증 창 닫기` |

이미 라벨이 있던 곳(변경 없음): 헤더 로고·장바구니·햄버거·맨위로, 푸터 SNS 3종, 예약 캘린더 탭/지점 탭, StudioReservationPage 환불 모달 닫기.

## 2. img alt / form label 연결

- **img alt**: 소비자 범위 누락 **0건** — 기존 코드가 이미 전부 alt 보유(장식용 `aria-hidden` 포함). 추가 작업 없음.
- **input/textarea 15건 보강**:
  - htmlFor/id 연결(가시 label 인접): SignupPage 이메일(`signup-email`), MyPage 탈퇴 비밀번호(`withdraw-password`)
  - aria-label 추가(placeholder만 있던 13건): SignupPage 인증번호, MyPage 이메일·인증번호, CartPage 포인트, CommunityPages 댓글 작성자·내용·답변·답변수정, AcademyDetailPage 후기, AcademyPlayerPage 질문 제목·내용·답변, StudioReservationPage 환불 사유
  - **제외(관리자 UI)**: AcademyPage 교육영상 등록 폼 2건 — "교육 영상 관리" 섹션이라 범위 외

## 3. 터치 타겟 48dp (승인받아 적용)

방식: 시각 크기 불변 — `::after` 가상 요소로 히트 영역만 `max(100%, 48px)` 중앙 확장 (styles.css 말미 블록). SignupPage ✕는 인라인 스타일이라 패딩 확장 + 음수 마진 상쇄.

| 요소 | 이전 | 적용 후 실측 |
|---|---|---|
| SignupPage 약관 닫기 ✕ | ~18×26px | **49×48px** (Playwright 실측), 모달 헤더 레이아웃 무변화 확인 |
| `.refund-modal-close` ×4 | ~25×25px | ::after 48×48 |
| `.mypage-redesign-pager button` | 30×30px | ::after 48×48 |
| `.mobile-nav-toggle` | 40×40px | **::after 48×48 실측**, 시각 40×40 유지 |
| `.scroll-top-fab` | 46×46px | ::after 48×48 (fixed 요소라 position 재정의 없이 적용) |
| `.academy-video-cart-button` | 높이 30px | ::after로 세로 48 확보 |

### 3-1. 히트영역 겹침 판정 (Playwright 좌표 실측, 커밋 전 수행)

실제 styles.css를 로드한 픽스처(MyPage와 동일 DOM)와 실페이지에서 각 요소의 실효 히트영역(요소 rect ∪ ::after rect)을 실측하고 `elementFromPoint` + 실클릭으로 판정했다.

**페이지네이션 — 겹침·오전달 확인 후 해소**:
- 최초 상태: 버튼 30px + 간격 6px에 48px 확장 → 인접 쌍 모두 **가로 12px × 세로 48px 겹침**
- **클릭 오전달 실확인**: `‹` 시각 버튼 오른쪽 끝(-1px) 클릭 시 뒤 형제 `1` 버튼이 동작 (뒤 형제의 ::after가 앞 버튼 시각 영역 3px를 덮음 — DOM 순서 스태킹)
- **해소**: `.mypage-redesign-pager button::after { width: calc(100% + 6px); }` — 가로 확장을 간격 이내(±3px)로 제한. 레이아웃·시각 무변경
- **재실측**: 히트영역 36×48px, 인접 쌍 겹침 0, `‹` 오른쪽 끝 클릭 → `‹` 정상 동작. 간격 중앙은 각 버튼이 자기 쪽 절반만 소유
- 트레이드오프: 가로 히트폭 36px < 48dp. 단 WCAG 2.5.8(AA) 타겟 간격 기준(24px 원 비교차)은 충족(중심 간격 36px > 24px)

**나머지 요소 — 겹침 없음 (좌표 판정)**:
| 요소 | 판정 |
|---|---|
| `.refund-modal-close` | 히트 48×48, 아래 textarea와 겹침 없음. 헤더 제목은 비클릭 |
| `.mobile-nav-toggle` | 히트 48×48, 장바구니 링크와 겹침 0px(정확히 접함), 접근성 토글과 겹침 없음 |
| `.scroll-top-fab` | 확장 1px/측(46→48). 우하단 고정 플로팅으로 1px 내 클릭 요소 없음 — 기하적으로 겹침 불가 |
| `.academy-video-cart-button` | 세로 확장 ±9px이 클릭 가능한 부모 카드와 겹침. 버튼이 위에 그려져 해당 밴드는 버튼이 수신 — 대형 타겟(카드)에서 소형 타겟(버튼)으로의 의도된 확장이며 소형 컨트롤 간 오전달 아님. 인접 태그·별점은 비클릭 |
| SignupPage ✕ | 패딩 방식(실제 박스 49×48). 헤더 제목만 인접(비클릭) |

## 4. 키보드 포커스 (outline: none 감사)

styles.css `outline: none` 67건 전수 분류 → 관리자 44건(범위 외), 소비자 23건:
- **21건 정상**: `:focus`/`:focus-visible`에 border-color·box-shadow 대체 표시 존재 (checkout·검색·문의·후기·마이페이지 폼 등)
- **2건 보강 적용**:
  - `.refund-reason-input`/`.refund-amount-input` — `:focus-visible { outline: 2px solid #8d6841 }` 추가. ※정정: 조사 초기 ":focus 규칙 없음"으로 보고했으나 멀티라인 셀렉터(styles.css:14148)에 border 변화가 이미 있었음. 다만 알파 0.3→0.7 변화는 대비가 약해 아웃라인 보강이 유효
  - `.sunlit-nav-menu button:focus-visible` — 배경 10% 틴트뿐이라 동일 아웃라인 추가
- `:focus-visible`이라 마우스·터치 사용자에게는 표시되지 않음 → 시각 디자인 영향 없음

## 5. 검증

- `npm run build` ✅ 통과 (변경 후 2회)
- Playwright(모바일 412px): 회원가입 약관 모달 ✕ 정렬·레이아웃 무변화, aria-label·히트영역 실측 확인
- 기능 로직 무변경 — 속성 추가와 CSS만

## 변경 파일 (미커밋)

| 파일 | 변경 |
|---|---|
| frontend/src/features/auth/pages/SignupPage.jsx | aria-label 1, htmlFor/id 1, aria-label(인증번호) 1, ✕ 터치영역 |
| frontend/src/features/home/pages/HomePage.jsx | 로고 버튼 aria-label |
| frontend/src/features/mypage/pages/MyPage.jsx | aria-label 7, htmlFor/id 1 |
| frontend/src/features/academy/pages/AcademyDetailPage.jsx | aria-label 1 |
| frontend/src/features/academy/pages/AcademyPlayerPage.jsx | aria-label 3 |
| frontend/src/features/cart/pages/CartPage.jsx | aria-label 1 |
| frontend/src/features/community/pages/CommunityPages.jsx | aria-label 4 |
| frontend/src/features/studio/pages/StudioReservationPage.jsx | aria-label 1 |
| frontend/styles.css | 터치 타겟 확장 블록 + :focus-visible 2건 |

## 남은 항목 / 권고

1. 히트영역 확장 대상 외 소형 클릭 요소가 더 있을 수 있음(styles.css 내 48px 미만 치수 선언 430건 중 클릭 요소 여부 미분류분) — pre-launch report 실행 후 경고 항목만 추가 대응 권장. 페이지네이션 가로 히트폭(36px)도 pre-launch가 경고하면 간격 확대(레이아웃 변경) 재검토
2. 관리자 화면 접근성은 범위 외로 미착수 (pre-launch 크롤러 미도달)
3. 색 대비(contrast)·스크린리더 순서 등은 본 프롬프트 범위 외

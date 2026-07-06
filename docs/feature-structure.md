# 기능별 코드 분류 안내

이 문서는 비개발자도 현재 코드가 어떤 역할을 하는지 빠르게 이해할 수 있도록 기능 단위로 정리한 안내서입니다.

## 전체 구조

- `frontend/src/features`: 사용자가 브라우저에서 보는 화면을 기능별로 모아둔 곳입니다.
- `frontend/src/shared`: 여러 화면이 공통으로 쓰는 로그인 상태, 공통 헤더, API 요청 도구를 모아둔 곳입니다.
- `backend/src/features`: 서버 API를 기능별로 모아둔 곳입니다.
- `backend/src/shared`: DB 연결, 개인정보 암호화, 공통 상수처럼 여러 API가 함께 쓰는 서버 공통 코드입니다.

## 프론트엔드 기능

- `home`: 이끌림필라테스 홈페이지 메인 화면입니다.
- `brand`: 지점 소개, 강사 소개, 시설 안내처럼 브랜드 소개 화면입니다.
- `academy`: 교육 영상 목록, 상세, 플레이어, 강의 진도 화면입니다.
- `auth`: 로그인, 회원가입, 아이디 찾기, 비밀번호 재설정 화면입니다.
- `cart`: 교육 상품 장바구니 화면입니다.
- `community`: 이벤트, 후기, 문의 게시판 화면입니다.
- `mypage`: 회원이 본인의 수강권, 예약, 구매 내역, 개인정보를 확인하는 화면입니다.
- `payment`: 결제 성공/실패 결과 화면입니다.
- `studio`: 스튜디오 예약·수강권 관련 API 호출 함수를 모아둔 영역입니다.
- `admin`: 관리자가 쓰는 운영 화면입니다. 일정, 수업, 회원, 강사, 수강권, 메시지, 게시판, 설정, 매출 화면이 이곳에 있습니다.

## 백엔드 기능

- `auth`: 로그인, 회원가입, 세션 확인, 계정 찾기 API입니다.
- `users`: 회원 정보 조회·수정, 관리자 회원 조회, 포인트, 탈퇴 처리 API입니다.
- `academy`: 교육 영상, 차시, 진도, 수료증, 강의 Q&A API입니다.
- `products`: 교육 상품 등록·수정·삭제 API입니다.
- `cart`: 장바구니 API입니다.
- `orders`: 주문 내역 API입니다.
- `payments`: 결제 검증 및 결제 완료 처리 API입니다.
- `refunds`: 환불 신청과 관리자 환불 처리 API입니다.
- `community`: 이벤트, 후기, 문의 게시판 API입니다.
- `brand`: 홈페이지 브랜드 소개 데이터 API입니다.
- `admin`: 관리자 대시보드, 회원/매출/페이지 편집 등 관리자 전용 API입니다.
- `studio`: 스튜디오 일정, 예약, 회원 프로필, 수강권, 강사, 운영 설정 API입니다.
- `sms`: 문자·알림톡 발송, 발송 이력, 발송 설정 확인 API입니다.

## 스튜디오메이트형 관리자 화면

- 일정 관리는 `AdminSchedulePage.jsx`와 `backend/src/features/studio`가 담당합니다.
- 수업 목록 관리는 `AdminClassListPage.jsx`가 담당합니다.
- 회원 관리는 `AdminMemberListPage.jsx`와 `studio_member_profiles`, `studio_passes`, `studio_member_memos` 테이블이 함께 담당합니다.
- 강사 관리는 `AdminInstructorPage.jsx`, `studio_staff_profiles`, `studio_staff_work_hours`, `studio_role_permissions`가 담당합니다.
- 수강권 상품 관리는 `AdminStudioPassPage.jsx`, `studio_pass_products`, `studio_goods`가 담당합니다.
- 메시지 관리는 `AdminMessagesPage.jsx`, `backend/src/features/sms`, `studio_notifications`, `studio_notification_logs`가 담당합니다.
- 게시판 관리는 `AdminNoticePage.jsx`, `studio_notices`가 담당합니다.
- 운영 설정은 `AdminSettings*Page.jsx` 파일들과 `studio_info`, `studio_rooms`, `studio_roles`, `studio_member_grades`, `studio_class_categories`, `studio_notification_templates`가 담당합니다.

## 유지보수 기준

- 앞으로 새 화면을 만들 때는 먼저 `features` 아래의 기능 폴더를 확인합니다.
- 여러 화면에서 공통으로 쓰는 함수만 `shared`에 둡니다.
- 특정 기능에서만 쓰는 API 호출 함수는 해당 기능 폴더 안에 둡니다.
- 화면에 보이는 버튼은 반드시 실제 동작, 검증, 에러 메시지를 연결합니다.
- 외부 결제·문자처럼 실제 사업자 API가 필요한 기능은 테스트 모드와 실제 연동 범위를 명확히 구분합니다.

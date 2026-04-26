// 파일 역할: 회원 등급을 정규화하고 관리자 권한 여부를 판별하는 공통 규칙을 담습니다.
// 상수 역할: 회원 등급 코드와 화면 표시명을 매핑합니다.
export const USER_GRADE_LABELS = {
  admin0: "관리자 0",
  admin1: "관리자 1",
  member: "일반회원",
  vip: "VIP회원",
  vvip: "VVIP회원",
};

// 상수 역할: 관리 화면에서 선택 가능한 회원 등급 목록을 정의합니다.
export const USER_GRADE_OPTIONS = ["admin0", "admin1", "member", "vip", "vvip"];

// 함수 역할: normalize 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

// 과거 role/is_admin 구조와 새 userGrade 구조를 모두 흡수해 최종 권한을 계산한다.
// 함수 역할: 회원 등급 데이터를 조회해 호출자에게 반환합니다.
export function getUserGrade(user) {
  const explicitGrade = normalize(user?.userGrade);
  if (USER_GRADE_OPTIONS.includes(explicitGrade)) {
    return explicitGrade;
  }

  const role = normalize(user?.role);
  const adminFlag = user?.isAdmin === true || user?.isAdmin === 1 || user?.isAdmin === "1";

  if (explicitGrade === "admin0" || role === "admin" || adminFlag) return "admin0";
  if (explicitGrade === "admin1" || role === "admin1") return "admin1";
  if (explicitGrade === "vip" || role === "vip") return "vip";
  if (explicitGrade === "vvip" || role === "vvip") return "vvip";
  return "member";
}

// 함수 역할: 관리자 스태프 조건에 해당하는지 참/거짓으로 판별합니다.
export function isAdminStaff(user) {
  const grade = getUserGrade(user);
  return grade === "admin0" || grade === "admin1";
}

// 컴포넌트 역할: canEditPage 화면을 렌더링하고 필요한 API 호출과 사용자 입력 상태를 관리합니다.
export function canEditPage(user) {
  return getUserGrade(user) === "admin0";
}

// 함수 역할: manage 회원 등급 권한이 있는지 참/거짓으로 판별합니다.
export function canManageUserGrades(user) {
  return getUserGrade(user) === "admin0";
}

// 함수 역할: register 강의 권한이 있는지 참/거짓으로 판별합니다.
export function canRegisterLecture(user) {
  return isAdminStaff(user);
}

// 함수 역할: 회원 등급 label 값을 화면에 보여주기 좋은 문구로 변환합니다.
export function formatUserGradeLabel(grade) {
  return USER_GRADE_LABELS[normalize(grade)] || USER_GRADE_LABELS.member;
}

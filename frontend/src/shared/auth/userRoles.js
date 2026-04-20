export const USER_GRADE_LABELS = {
  admin0: "관리자 0",
  admin1: "관리자 1",
  member: "일반회원",
  vip: "VIP회원",
  vvip: "VVIP회원",
};

export const USER_GRADE_OPTIONS = ["admin0", "admin1", "member", "vip", "vvip"];

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

// 과거 role/is_admin 구조와 새 userGrade 구조를 모두 흡수해 최종 권한을 계산한다.
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

export function isAdminStaff(user) {
  const grade = getUserGrade(user);
  return grade === "admin0" || grade === "admin1";
}

export function canEditPage(user) {
  return getUserGrade(user) === "admin0";
}

export function canManageUserGrades(user) {
  return getUserGrade(user) === "admin0";
}

export function canRegisterLecture(user) {
  return isAdminStaff(user);
}

export function formatUserGradeLabel(grade) {
  return USER_GRADE_LABELS[normalize(grade)] || USER_GRADE_LABELS.member;
}

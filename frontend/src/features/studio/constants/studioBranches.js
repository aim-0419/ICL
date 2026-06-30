// 파일 역할: 필라테스 예약·관리 화면에서 공통으로 사용하는 지점 목록입니다.
// DB의 branches.id와 맞춰 사용합니다. 기존 데이터는 branch-1(장덕점)을 기본값으로 봅니다.
export const STUDIO_BRANCHES = [
  { id: "branch-1", name: "장덕점" },
  { id: "branch-2", name: "효천점" },
];

export const DEFAULT_STUDIO_BRANCH_ID = STUDIO_BRANCHES[0].id;

export function getStudioBranchName(branchId) {
  return STUDIO_BRANCHES.find((branch) => branch.id === branchId)?.name || "장덕점";
}

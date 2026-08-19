// 파일 역할: 수강권 상품을 화면에 표시할 때 쓰는 공통 표기 규칙입니다.
// 카드 목록과 상세 보기가 같은 규칙을 쓰도록 한 곳에 모읍니다.

// 함수 역할: 수강권 정원을 "정원:강사" 비율 표기로 바꿉니다.
//
// studio_pass_products.capacity 는 수업 정원, 즉 수강생 수입니다.
// 강사는 항상 1명이므로 오른쪽은 언제나 1이고, 1:1 · 2:1 · 6:1 처럼 표시됩니다.
// 스키마 주석도 `수업 정원 (1:1=1, 2:1=2, 6:1=6)` 으로 같은 규칙을 적어 두었습니다.
export function formatCapacityRatio(capacity) {
  const students = Number(capacity);
  if (!Number.isFinite(students) || students < 1) return "1:1";
  return `${Math.floor(students)}:1`;
}

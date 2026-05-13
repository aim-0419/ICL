// 파일 역할: 아카데미 화면에서 사용하는 강의 관련 유틸 함수를 제공합니다.

// 함수 역할: discount rate 데이터를 조회해 호출자에게 반환합니다.
export function getDiscountRate(originalPrice, salePrice) {
  if (!originalPrice || originalPrice <= salePrice) return 0;
  return Math.round(((originalPrice - salePrice) / originalPrice) * 100);
}

// 함수 역할: 아카데미 영상 재생 소스 by 강의 영상 ID 데이터를 조회해 호출자에게 반환합니다.
export function getAcademyPlaybackSourceByVideoId() {
  return "";
}

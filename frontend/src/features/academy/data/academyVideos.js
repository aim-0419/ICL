// 파일 역할: 아카데미 화면에서 기본으로 사용하는 강의 데이터와 조회 유틸을 제공합니다.
// 상수 역할: 백엔드 데이터가 없을 때 사용할 기본 아카데미 강의 목록입니다.
export const ACADEMY_VIDEOS = [
  {
    id: "video-1",
    productId: "video-1",
    title: "코어 정렬과 호흡 패턴 입문",
    instructor: "ICL Academy",
    category: "입문",
    originalPrice: 189000,
    salePrice: 129000,
    rating: 4.9,
    reviews: 530,
    badge: "",
    image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "video-2",
    productId: "video-2",
    title: "기구 필라테스 큐잉 언어 마스터",
    instructor: "이끌림 교육팀",
    category: "초급",
    originalPrice: 229000,
    salePrice: 159000,
    rating: 5.0,
    reviews: 100,
    badge: "New",
    image: "https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "video-3",
    productId: "video-3",
    title: "초급 회원 체형 분석 실전 워크숍",
    instructor: "Master Instructor",
    category: "입문",
    originalPrice: 99000,
    salePrice: 69300,
    rating: 4.8,
    reviews: 72,
    badge: "New",
    image: "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "video-4",
    productId: "video-4",
    title: "소그룹 수업 운영 시나리오 설계",
    instructor: "Studio Coaching",
    category: "중급",
    originalPrice: 149000,
    salePrice: 89000,
    rating: 4.7,
    reviews: 61,
    badge: "Hot",
    image: "https://images.unsplash.com/photo-1506629905607-c36a594d95f3?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "video-5",
    productId: "video-5",
    title: "누구나 빠르게 시작하는 레슨 가이드",
    instructor: "Neo Team",
    category: "입문",
    originalPrice: 16500,
    salePrice: 9900,
    rating: 5.0,
    reviews: 8,
    badge: "New",
    image: "https://images.unsplash.com/photo-1574680178050-55c6a6a96e0a?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "video-6",
    productId: "video-6",
    title: "리포머 자동 교정 큐 실습",
    instructor: "윤코치",
    category: "초급",
    originalPrice: 55000,
    salePrice: 5500,
    rating: 4.8,
    reviews: 43,
    badge: "",
    image: "https://images.unsplash.com/photo-1599058917765-a780eda07a3e?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "video-7",
    productId: "video-7",
    title: "코칭 대본으로 완성하는 바이브 코딩",
    instructor: "코트브릿지",
    category: "중급",
    originalPrice: 55000,
    salePrice: 38500,
    rating: 4.9,
    reviews: 25,
    badge: "",
    image: "https://images.unsplash.com/photo-1524863479829-916d8e77f114?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "video-8",
    productId: "video-8",
    title: "매출로 연결되는 상담 스크립트",
    instructor: "ICL Business",
    category: "고급",
    originalPrice: 154000,
    salePrice: 77000,
    rating: 5.0,
    reviews: 14,
    badge: "Hot",
    image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "video-9",
    productId: "video-9",
    title: "필라테스 스튜디오 운영툴 기초",
    instructor: "AhaLinux",
    category: "중급",
    originalPrice: 27500,
    salePrice: 8250,
    rating: 4.7,
    reviews: 12,
    badge: "New",
    image: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "video-10",
    productId: "video-10",
    title: "썸네일/홍보 디자인으로 매출 높이기",
    instructor: "Sunny Studio",
    category: "고급",
    originalPrice: 8800,
    salePrice: 4400,
    rating: 4.6,
    reviews: 30,
    badge: "",
    image: "https://images.unsplash.com/photo-1549060279-7e168fcee0c2?auto=format&fit=crop&w=1200&q=80",
  },
];

// 함수 역할: discount rate 데이터를 조회해 호출자에게 반환합니다.
export function getDiscountRate(originalPrice, salePrice) {
  if (!originalPrice || originalPrice <= salePrice) return 0;
  return Math.round(((originalPrice - salePrice) / originalPrice) * 100);
}

// 함수 역할: 아카데미 강의 영상 by ID 데이터를 조회해 호출자에게 반환합니다.
export function getAcademyVideoById(videoId) {
  return ACADEMY_VIDEOS.find((video) => video.id === videoId);
}

// 함수 역할: 아카데미 영상 재생 소스 by 강의 영상 ID 데이터를 조회해 호출자에게 반환합니다.
export function getAcademyPlaybackSourceByVideoId() {
  return "";
}

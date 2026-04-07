export const db = {
  users: [],
  sessions: [],
  carts: [],
  orders: [],
  products: [
    {
      id: "starter",
      name: "Starter Guide Pack",
      price: 129000,
      description: "기초 해부학, 자세 분석, 수업 도입 스크립트를 담은 입문 패키지",
      period: "90일",
    },
    {
      id: "cueing",
      name: "Cueing & Sequencing Master",
      price: 219000,
      description: "회원 반응을 끌어내는 큐잉 언어와 시퀀스 설계 노하우 집중 과정",
      period: "180일",
    },
    {
      id: "premium",
      name: "Premium Academy Bundle",
      price: 349000,
      description: "강사 교육, 회원 상담, 스튜디오 운영 가이드를 한 번에 묶은 통합 번들",
      period: "365일",
    },
  ],
};

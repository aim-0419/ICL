import { useState } from "react";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";

function CommunityPageLayout({ kicker, title, description, cards }) {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page">
        <section className="content-hero">
          <p className="section-kicker">{kicker}</p>
          <h1>{title}</h1>
          <p className="section-text">{description}</p>
        </section>
        <section className="content-grid">
          {cards.map((card) => (
            <article className="content-card" key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

export function CommunityReviewsPage() {
  return (
    <CommunityPageLayout
      kicker="커뮤니티 · 후기"
      title="회원 후기"
      description="수업 경험과 교육 콘텐츠 만족도를 중심으로 후기 내용을 확인할 수 있습니다."
      cards={[
        {
          title: "개인 레슨 후기",
          description: "체형 교정 효과와 컨디션 변화에 대한 실제 경험을 공유합니다.",
        },
        {
          title: "교육 영상 후기",
          description: "강사/수강생 관점에서 콘텐츠 활용성과 학습 효과를 소개합니다.",
        },
      ]}
    />
  );
}

export function CommunityInquiryPage() {
  return (
    <CommunityPageLayout
      kicker="커뮤니티 · 문의하기"
      title="문의하기"
      description="수업 상담, 결제 문의, 제휴 문의 등 필요한 안내를 빠르게 받으실 수 있습니다."
      cards={[
        {
          title: "상담 채널",
          description: "전화 / 이메일 / 카카오채널",
        },
        {
          title: "운영 시간",
          description: "평일 10:00 - 18:00",
        },
      ]}
    />
  );
}

export function CommunityEventsPage() {
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");

  const categories = ["전체", "진행중", "예정", "종료", "교육", "프로모션"];
  const events = [
    {
      id: "event-1",
      title: "신규 회원 웰컴 패키지 증정 이벤트",
      date: "2026-04-05",
      likes: 48,
      status: "진행중",
      category: "프로모션",
    },
    {
      id: "event-2",
      title: "강사용 큐잉 가이드 봄 시즌 할인",
      date: "2026-03-28",
      likes: 31,
      status: "진행중",
      category: "교육",
    },
    {
      id: "event-3",
      title: "5월 오프라인 워크숍 사전 신청",
      date: "2026-04-20",
      likes: 22,
      status: "예정",
      category: "교육",
    },
    {
      id: "event-4",
      title: "리뉴얼 오픈 기념 상담 혜택",
      date: "2026-03-15",
      likes: 64,
      status: "종료",
      category: "프로모션",
    },
    {
      id: "event-5",
      title: "회원 추천 리워드 프로그램",
      date: "2026-04-01",
      likes: 19,
      status: "진행중",
      category: "프로모션",
    },
    {
      id: "event-6",
      title: "강사 역량 업 세미나 모집 안내",
      date: "2026-05-09",
      likes: 15,
      status: "예정",
      category: "교육",
    },
  ];

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredEvents = events.filter((event) => {
    if (selectedCategory !== "전체") {
      const categoryMatched =
        event.status === selectedCategory || event.category === selectedCategory;
      if (!categoryMatched) return false;
    }

    if (!normalizedQuery) return true;
    const searchableText = `${event.title} ${event.status} ${event.category}`.toLowerCase();
    return searchableText.includes(normalizedQuery);
  });

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page events-page">
        <section className="content-hero">
          <p className="section-kicker">커뮤니티 · 이벤트</p>
          <h1>이벤트</h1>
          <p className="section-text">
            진행중/예정/종료 이벤트를 한 눈에 확인하고 원하는 혜택을 빠르게 찾을 수 있습니다.
          </p>
        </section>

        <section className="events-toolbar">
          <div className="events-filter-chips" role="tablist" aria-label="이벤트 카테고리">
            {categories.map((category) => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`event-filter-chip${active ? " active" : ""}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              );
            })}
          </div>
          <label className="events-search-box">
            <span className="visually-hidden">이벤트 검색</span>
            <input
              type="search"
              placeholder="이벤트 검색"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
        </section>

        <section className="event-grid" aria-live="polite">
          {filteredEvents.length ? (
            filteredEvents.map((eventItem) => (
              <article className="event-card" key={eventItem.id}>
                <div className="event-card-media" role="img" aria-label={`${eventItem.title} 이미지 영역`}>
                  <span>{eventItem.category}</span>
                  <strong>{eventItem.status}</strong>
                </div>
                <div className="event-card-copy">
                  <h3>{eventItem.title}</h3>
                  <div className="event-card-meta">
                    <time>{eventItem.date}</time>
                    <span>관심 {eventItem.likes}</span>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <article className="event-empty-state">
              <h3>검색 결과가 없습니다.</h3>
              <p>다른 카테고리를 선택하거나 검색어를 다시 입력해 주세요.</p>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}

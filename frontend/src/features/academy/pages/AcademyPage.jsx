// 교육 영상 목록 페이지:
// 카테고리 탭 + 검색어로 목록을 필터링하고,
// 카드 클릭 시 상세 페이지로 이동합니다.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { ACADEMY_VIDEOS, getDiscountRate } from "../data/academyVideos.js";

export function AcademyPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [query, setQuery] = useState("");
  const categories = ["전체", "입문", "초급", "중급", "고급"];

  const normalizedQuery = query.trim().toLowerCase();
  // 카테고리/검색어를 동시에 반영한 목록 계산
  const filteredVideos = ACADEMY_VIDEOS.filter((video) => {
    if (selectedCategory !== "전체" && video.category !== selectedCategory) return false;
    if (!normalizedQuery) return true;
    return `${video.title} ${video.instructor} ${video.category}`.toLowerCase().includes(normalizedQuery);
  });

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page academy-catalog-page">
        <section className="content-hero">
          <p className="section-kicker">Academy · 교육 영상</p>
          <h1>교육 가이드 영상</h1>
          <p className="section-text">입문부터 고급까지, 단계별 영상 교육 상품을 확인해보세요.</p>
        </section>

        <section className="academy-catalog-toolbar">
          <div className="academy-catalog-tabs" role="tablist" aria-label="교육 영상 카테고리">
            {categories.map((category) => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  className={`academy-tab${active ? " active" : ""}`}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              );
            })}
          </div>
          <label className="academy-catalog-search">
            <span className="visually-hidden">교육 영상 검색</span>
            <input
              type="search"
              placeholder="강의명 / 강사 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </section>

        <section className="academy-catalog-grid" aria-live="polite">
          {filteredVideos.length ? (
            filteredVideos.map((video) => {
              const discountRate = getDiscountRate(video.originalPrice, video.salePrice);
              const normalizedBadge = (video.badge || "").toLowerCase();
              const badgeTone =
                normalizedBadge === "hot" ? "is-hot" : normalizedBadge === "new" ? "is-new" : "";
              const showBadge = badgeTone !== "";

              return (
                <article
                  className="academy-video-card interactive"
                  key={video.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/academy/${video.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/academy/${video.id}`);
                    }
                  }}
                >
                  <div className="academy-video-thumb">
                    <img src={video.image} alt={video.title} />
                  </div>
                  <div className="academy-video-body">
                    <h3>{video.title}</h3>
                    <p className="academy-video-instructor">{video.instructor}</p>
                    <div className="academy-video-pricing">
                      <span className="academy-price-old">{store.formatCurrency(video.originalPrice)}</span>
                      <strong className="academy-price-sale">{store.formatCurrency(video.salePrice)}</strong>
                      {discountRate > 0 ? <em>얼리버드 {discountRate}%</em> : null}
                    </div>
                    <div className="academy-video-meta-row">
                      <div className="academy-video-meta">
                        <span>★ {video.rating}</span>
                        <span>({video.reviews})</span>
                      </div>
                      <div className="academy-video-tags">
                        {showBadge ? (
                          <span className={`academy-tag academy-badge ${badgeTone}`}>{video.badge}</span>
                        ) : null}
                        <span className="academy-tag outline">{video.category}</span>
                      </div>
                      <button
                        type="button"
                        className="ghost-button small-ghost academy-video-cart-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          store.addToCart(video.productId, 1);
                          alert("장바구니에 담았습니다.");
                        }}
                      >
                        장바구니 담기
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <article className="academy-empty-state">
              <h3>검색 결과가 없습니다.</h3>
              <p>검색어를 바꾸거나 다른 카테고리를 선택해 주세요.</p>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}

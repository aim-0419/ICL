// 파일 역할: 메인 홈 화면에서 브랜드 소개, 최신 소식, 추천 강의, 후기를 보여주는 페이지 컴포넌트입니다.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDiscountRate } from "../../academy/data/academyVideos.js";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { apiRequest } from "../../../shared/api/client.js";


const SOCIAL_SOURCE_NAME_MAP = {
  youtube: "YouTube",
  blog: "Naver Blog",
  instagram: "Instagram",
};

const DEFAULT_SOCIAL_ITEMS = [
  {
    source: "youtube",
    label: "유튜브 최신 영상",
    title: "최신 영상을 불러오는 중입니다.",
    url: "https://www.youtube.com/@ICL-PILATES/videos",
    publishedAt: "",
    thumbnail: "",
  },
  {
    source: "blog",
    label: "네이버 블로그 최신 글",
    title: "최신 게시글을 불러오는 중입니다.",
    url: "https://blog.naver.com/icl_pilates",
    publishedAt: "",
    thumbnail: "",
  },
  {
    source: "instagram",
    label: "인스타 최신 게시글",
    title: "최신 게시글을 불러오는 중입니다.",
    url: "https://www.instagram.com/icl.pilates/",
    publishedAt: "",
    thumbnail: "",
  },
];

// 함수 역할: 소셜 썸네일 error 사용자 이벤트를 처리합니다.
function handleSocialThumbnailError(event) {
  const image = event.currentTarget;
  const wrapper = image.closest(".social-thumb-link");
  if (wrapper) wrapper.style.display = "none";
}

// 함수 역할: 소셜 게시일 날짜 값을 화면에 보여주기 좋은 문구로 변환합니다.
function formatSocialPublishedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// 컴포넌트 역할: 유튜브, 블로그, 인스타그램 소스별 아이콘을 렌더링합니다.
function SocialSourceIcon({ source }) {
  if (source === "youtube") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M23.2 7.2a3.1 3.1 0 0 0-2.2-2.2C19 4.5 12 4.5 12 4.5s-7 0-9 .5A3.1 3.1 0 0 0 .8 7.2 32.9 32.9 0 0 0 .3 12c0 1.6.2 3.2.5 4.8A3.1 3.1 0 0 0 3 19c2 .5 9 .5 9 .5s7 0 9-.5a3.1 3.1 0 0 0 2.2-2.2c.3-1.6.5-3.2.5-4.8s-.2-3.2-.5-4.8M9.8 15.7V8.3L16 12z"
        />
      </svg>
    );
  }

  if (source === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="3.6"
          y="3.6"
          width="16.8"
          height="16.8"
          rx="5"
          ry="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        />
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.8" y="2.8" width="18.4" height="18.4" rx="3.5" ry="3.5" fill="currentColor" />
      <path d="M7.7 7.2h3.6l5 9.6h-3.7z" fill="#fff" />
      <path d="M11.4 7.2h3.5l-5.1 9.6H6.3z" fill="#fff" />
    </svg>
  );
}

// 함수 역할: 소셜 항목 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeSocialItems(apiItems) {
  const sourceMap = new Map(
    (Array.isArray(apiItems) ? apiItems : [])
      .map((item) => (item?.source ? [String(item.source).toLowerCase(), item] : null))
      .filter(Boolean)
  );

  return DEFAULT_SOCIAL_ITEMS.map((fallbackItem) => {
    const fromApi = sourceMap.get(fallbackItem.source);
    return {
      ...fallbackItem,
      ...(fromApi || {}),
      source: fallbackItem.source,
      label: String(fromApi?.label || fallbackItem.label),
      title: String(fromApi?.title || fallbackItem.title),
      url: String(fromApi?.url || fallbackItem.url),
      publishedAt: formatSocialPublishedDate(fromApi?.publishedAt),
      thumbnail: String(fromApi?.thumbnail || ""),
      isLive: Boolean(fromApi?.isLive),
    };
  });
}

// 컴포넌트 역할: 메인 홈 화면에서 브랜드 소개, 최신 소식, 추천 강의, 후기를 보여주는 페이지 컴포넌트입니다.
export function HomePage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [socialItems, setSocialItems] = useState(() => DEFAULT_SOCIAL_ITEMS);
  const [latestReviews, setLatestReviews] = useState([]);

  useEffect(() => {
    fetch("/api/academy/reviews/latest?limit=3", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const rows = Array.isArray(data?.reviews) ? data.reviews : [];
        if (rows.length > 0) setLatestReviews(rows);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    apiRequest("/community/social/latest")
      .then((result) => {
        if (!mounted) return;
        setSocialItems(normalizeSocialItems(result?.items));
      })
      .catch(() => {
        if (!mounted) return;
        setSocialItems(DEFAULT_SOCIAL_ITEMS);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const featuredVideos = useMemo(() => {
    const videos = Array.isArray(store.academyVideos) ? store.academyVideos : [];
    const newVideos = videos.filter((video) => (video.badge || "").toLowerCase() === "new").slice(0, 2);
    const hotVideos = videos.filter((video) => (video.badge || "").toLowerCase() === "hot").slice(0, 2);
    return [...newVideos, ...hotVideos];
  }, [store.academyVideos]);

  return (
    <div className="site-shell">
      <SiteHeader />

      <main className="home-main">
        <section className="hero-panel" id="hero">
          <div className="hero-center">
            <div className="hero-star">✶</div>
            <h1>이끌림 필라테스는 다릅니다.</h1>
            <p className="hero-text">
              고급스러운 공간 경험과 실전 중심 교육 콘텐츠를 함께 제안합니다.
              스튜디오 소개부터 교육 영상 판매까지 한 흐름으로 이어집니다.
            </p>
            <button
              className="pill-button white"
              type="button"
              onClick={() => navigate("/community/inquiry")}
            >
              상담 문의하기
            </button>
          </div>
          <div className="hero-image">
            <div className="img-placeholder"><span>비어있는 이미지 1입니다</span></div>
          </div>
        </section>

        <section className="intro-panel bright-panel section-block" id="story">
          <div className="section-intro center">
            <div className="section-star">✶</div>
            <p className="section-kicker">이끌림</p>
            <h2>특별한 시작</h2>
            <p className="section-text narrow">
              회원에게는 프리미엄 필라테스 경험을,
              강사와 예비 창업자에게는 실전형 교육 콘텐츠를 제공합니다.
              오프라인과 온라인 수익 구조를 동시에 설계할 수 있습니다.
            </p>
          </div>
          <div className="mosaic-grid">
            <div className="mosaic-card tall">
              <div className="img-placeholder"><span>비어있는 이미지 2입니다</span></div>
            </div>
            <div className="mosaic-card short offset-down">
              <div className="img-placeholder"><span>비어있는 이미지 3입니다</span></div>
            </div>
            <div className="mosaic-card tall">
              <div className="img-placeholder"><span>비어있는 이미지 4입니다</span></div>
            </div>
            <div className="mosaic-card wide offset-up">
              <div className="img-placeholder"><span>비어있는 이미지 5입니다</span></div>
            </div>
          </div>
        </section>

        <section className="feature-panel dark-panel section-block" id="features">
          <div className="feature-layout">
            <div className="feature-image">
              <div className="img-placeholder"><span>비어있는 이미지 6입니다</span></div>
            </div>
            <div className="feature-copy">
              <h2 className="feature-title">이끌림을 선택하는 3가지 이유</h2>
              <button className="ghost-button" type="button" onClick={() => navigate("/academy")}>
                교육 상품 보러가기
              </button>

              <article className="reason-item">
                <span>special feature 01.</span>
                <h3>프리미엄 무드의 브랜딩</h3>
                <p>
                  차분한 아이보리와 골드 포인트로 고급스러운 첫인상을 전달합니다.
                  상담 문의 전환에 유리한 구조를 고려했습니다.
                </p>
              </article>

              <article className="reason-item">
                <span>special feature 02.</span>
                <h3>오프라인과 온라인의 결합</h3>
                <p>
                  스튜디오 소개와 교육 영상 판매가 같은 브랜드 경험 안에서 이어집니다.
                </p>
              </article>

              <article className="reason-item">
                <span>special feature 03.</span>
                <h3>실결제로 확장 가능한 구조</h3>
                <p>
                  실결제 체크아웃 흐름이 포함되어 있어 실제 판매 사이트로 바로 확장할 수 있습니다.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="status-panel section-block" data-admin-bg-editable>
          <div className="section-intro center on-dark">
            <div className="section-star">✶</div>
            <p className="section-kicker">브랜드 운영 현황</p>
            <h2>브랜드 운영 현황</h2>
          </div>
          <div className="status-grid">
            {socialItems.map((item) => (
              <article className="status-card social-feed-card" key={item.source}>
                <div className="social-card-source">
                  <span className={`social-source-badge ${item.source}`}>
                    <SocialSourceIcon source={item.source} />
                    <em>{SOCIAL_SOURCE_NAME_MAP[item.source] || item.source}</em>
                  </span>
                </div>
                {item.source === "youtube" && item.thumbnail ? (
                  <a
                    className="social-thumb-link"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`${item.label} 썸네일`}
                  >
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      loading="lazy"
                      onError={handleSocialThumbnailError}
                    />
                  </a>
                ) : null}
                <p>{item.label}</p>
                <strong>
                  <a
                    className="social-title-link"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {item.title}
                  </a>
                </strong>
                <div className="status-card-meta">
                  {item.publishedAt ? (
                    <span>{item.publishedAt}</span>
                  ) : item.isLive ? (
                    <span>연동됨</span>
                  ) : (
                    <span>업데이트 대기</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="academy-panel bright-panel section-block" id="academy">
          <div className="section-intro center">
            <div className="section-star">✶</div>
            <p className="section-kicker">아카데미 · 교육 영상</p>
            <h2>교육 가이드 영상</h2>
            <p className="section-text narrow">
              교육 영상 페이지와 동일한 상품 중 NEW 2개, HOT 2개를 먼저 확인할 수 있습니다.
            </p>
          </div>

          <div className="home-academy-head-actions">
            <button className="ghost-button" type="button" onClick={() => navigate("/academy")}>
              교육 영상 전체보기
            </button>
          </div>

          <div className="academy-catalog-grid home-academy-grid">
            {featuredVideos.map((video, videoIndex) => {
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
                    {video.image
                      ? <img src={video.image} alt={video.title} />
                      : <div className="img-placeholder"><span>비어있는 이미지 {videoIndex + 1}</span></div>
                    }
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
                        onClick={async (event) => {
                          event.stopPropagation();
                          try {
                            await store.addToCart(video.productId, 1);
                            alert("장바구니에 담았습니다.");
                          } catch (error) {
                            alert(error.message);
                          }
                        }}
                      >
                        장바구니 담기
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="reviews-panel bright-panel section-block" id="reviews">
          <div className="section-intro center">
            <div className="section-star">✶</div>
            <p className="section-kicker">후기</p>
            <h2>함께하고 있는 회원 후기</h2>
            <p className="section-text narrow">
              공간의 무드, 수업의 전문성, 교육 콘텐츠의 실용성이 하나의 브랜드 경험으로 연결됩니다.
            </p>
          </div>

          <div className="review-gallery">
            {latestReviews.length > 0 ? (
              latestReviews.map((review, reviewIndex) => (
                <article className="review-card image-first" key={review.id}>
                  <div className="img-placeholder"><span>비어있는 이미지 {reviewIndex + 1}</span></div>
                  <div className="review-copy">
                    <div className="review-stars" aria-label={`${review.rating}점`}>
                      {"★".repeat(Math.min(5, Math.max(0, Number(review.rating) || 0)))}
                      {"☆".repeat(5 - Math.min(5, Math.max(0, Number(review.rating) || 0)))}
                    </div>
                    <p>{review.content}</p>
                    <strong>{review.userName}</strong>
                  </div>
                </article>
              ))
            ) : (
              <>
                <article className="review-card image-first">
                  <div className="img-placeholder"><span>비어있는 이미지 7입니다</span></div>
                  <div className="review-copy">
                    <p>시설과 분위기가 명확한 콘셉트로 잡혀 있어 몰입감이 정말 좋았어요.</p>
                    <strong>개인 레슨 회원</strong>
                  </div>
                </article>
                <article className="review-card image-first">
                  <div className="img-placeholder"><span>비어있는 이미지 8입니다</span></div>
                  <div className="review-copy">
                    <p>교육 영상과 현장 수업이 바로 연결되어 복습 자료로도 활용하기 좋습니다.</p>
                    <strong>예비 필라테스 강사</strong>
                  </div>
                </article>
                <article className="review-card image-first">
                  <div className="img-placeholder"><span>비어있는 이미지 9입니다</span></div>
                  <div className="review-copy">
                    <p>오프라인 홍보와 온라인 판매가 자연스럽게 이어져 운영 효율이 올라갔어요.</p>
                    <strong>스튜디오 운영자</strong>
                  </div>
                </article>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

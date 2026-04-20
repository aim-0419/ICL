import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ACADEMY_VIDEOS, getDiscountRate } from "../../academy/data/academyVideos.js";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { apiRequest } from "../../../shared/api/client.js";

const IMAGE_FALLBACK_POOL = [
  "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1506629905607-c36a594d95f3?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1600&q=80",
];

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

function getHash(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function attachImageFallback(event) {
  const image = event.currentTarget;
  const attempt = Number(image.dataset.fallbackAttempt || "0");
  if (attempt >= IMAGE_FALLBACK_POOL.length) {
    image.onerror = null;
    return;
  }

  const seed = `${image.alt || ""}|${image.dataset.originalSrc || image.currentSrc || image.src || ""}`;
  const baseIndex = getHash(seed) % IMAGE_FALLBACK_POOL.length;
  const fallbackIndex = (baseIndex + attempt) % IMAGE_FALLBACK_POOL.length;

  if (!image.dataset.originalSrc) {
    image.dataset.originalSrc = image.currentSrc || image.src || "";
  }
  image.dataset.fallbackAttempt = String(attempt + 1);
  image.src = IMAGE_FALLBACK_POOL[fallbackIndex];
}

function handleSocialThumbnailError(event) {
  const image = event.currentTarget;
  const wrapper = image.closest(".social-thumb-link");
  if (wrapper) wrapper.style.display = "none";
}

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

export function HomePage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [socialItems, setSocialItems] = useState(() => DEFAULT_SOCIAL_ITEMS);

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
    const newVideos = ACADEMY_VIDEOS.filter((video) => (video.badge || "").toLowerCase() === "new").slice(
      0,
      2
    );
    const hotVideos = ACADEMY_VIDEOS.filter((video) => (video.badge || "").toLowerCase() === "hot").slice(
      0,
      2
    );
    return [...newVideos, ...hotVideos];
  }, []);

  return (
    <div className="site-shell">
      <SiteHeader />

      <main className="home-main">
        <section className="hero-panel" id="hero">
          <div className="hero-center">
            <div className="hero-star">✶</div>
            <h1>이끌림 필라테스는 다릅니다.</h1>
            <p className="hero-text">
              이끌림 필라테스는 고급스러운 공간 경험과 실전 중심 교육 콘텐츠를 함께 제안합니다.
              스튜디오 소개부터 수강생용 가이드 영상 판매까지 한 흐름으로 이어집니다.
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
            <img
              src="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1600&q=80"
              alt="필라테스 수업 장면"
              onError={attachImageFallback}
            />
          </div>
        </section>

        <section className="intro-panel bright-panel section-block" id="story">
          <div className="section-intro center">
            <div className="section-star">✶</div>
            <p className="section-kicker">이끌림</p>
            <h2>특별한 시작</h2>
            <p className="section-text narrow">
              회원에게는 프리미엄 필라테스 경험을, 강사와 예비 창업자에게는 실전형 교육 콘텐츠를
              제공합니다. 오프라인과 온라인 수익 구조를 동시에 설계할 수 있는 브랜드형 홈페이지입니다.
            </p>
          </div>
          <div className="mosaic-grid">
            <div className="mosaic-card tall">
              <img
                src="https://images.unsplash.com/photo-1574680178050-55c6a6a96e0a?auto=format&fit=crop&w=1200&q=80"
                alt="매트 필라테스 동작"
                onError={attachImageFallback}
              />
            </div>
            <div className="mosaic-card short offset-down">
              <img
                src="https://images.unsplash.com/photo-1549060279-7e168fcee0c2?auto=format&fit=crop&w=1200&q=80"
                alt="발끝 정렬 자세"
                onError={attachImageFallback}
              />
            </div>
            <div className="mosaic-card tall">
              <img
                src="https://images.unsplash.com/photo-1593079831268-3381b0db4a77?auto=format&fit=crop&w=1200&q=80"
                alt="상체 정렬 시범"
                onError={attachImageFallback}
              />
            </div>
            <div className="mosaic-card wide offset-up">
              <img
                src="https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=1200&q=80"
                alt="옆구리 스트레칭"
                onError={attachImageFallback}
              />
            </div>
          </div>
        </section>

        <section className="feature-panel dark-panel section-block" id="features">
          <div className="feature-layout">
            <div className="feature-image">
              <img
                src="https://images.unsplash.com/photo-1506629905607-c36a594d95f3?auto=format&fit=crop&w=1200&q=80"
                alt="스튜디오 수업 모습"
                onError={attachImageFallback}
              />
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
                  차분한 아이보리와 골드 포인트를 바탕으로 고급스러운 첫인상을 전달합니다.
                  <br />
                  상담 문의 전환에 유리한 구조를 고려했습니다.
                </p>
              </article>

              <article className="reason-item">
                <span>special feature 02.</span>
                <h3>오프라인과 온라인의 결합</h3>
                <p>
                  스튜디오 소개뿐 아니라 교육 가이드 영상 판매까지 같은 브랜드 경험 안에서
                  이어지도록 설계했습니다.
                </p>
              </article>

              <article className="reason-item">
                <span>special feature 03.</span>
                <h3>실결제로 확장 가능한 구조</h3>
                <p>
                  토스페이먼츠 연동을 고려한 체크아웃 흐름이 들어 있어 실제 판매 사이트로
                  확장하기 좋습니다.
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
            {featuredVideos.map((video) => {
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
                    <img src={video.image} alt={video.title} onError={attachImageFallback} />
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
              공간의 무드와 수업의 전문성, 그리고 교육 콘텐츠의 실용성까지 자연스럽게 연결되는
              브랜드 경험을 전달합니다.
            </p>
          </div>

          <div className="review-gallery">
            <article className="review-card image-first">
              <img
                src="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80"
                alt="후기 이미지 1"
                onError={attachImageFallback}
              />
              <div className="review-copy">
                <p>시설과 분위기가 명확한 콘셉트로 잡혀 있어 몰입감이 정말 좋았어요.</p>
                <strong>개인 레슨 회원</strong>
              </div>
            </article>
            <article className="review-card image-first">
              <img
                src="https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=900&q=80"
                alt="후기 이미지 2"
                onError={attachImageFallback}
              />
              <div className="review-copy">
                <p>교육 영상과 현장 수업이 바로 연결되어 복습 자료로도 활용하기 좋습니다.</p>
                <strong>예비 필라테스 강사</strong>
              </div>
            </article>
            <article className="review-card image-first">
              <img
                src="https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=900&q=80"
                alt="후기 이미지 3"
                onError={attachImageFallback}
              />
              <div className="review-copy">
                <p>오프라인 홍보와 온라인 판매가 자연스럽게 이어져 운영 효율이 올라갔어요.</p>
                <strong>스튜디오 운영자</strong>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}

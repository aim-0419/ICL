import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ACADEMY_VIDEOS, getDiscountRate } from "../../academy/data/academyVideos.js";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

const IMAGE_FALLBACK_POOL = [
  "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1506629905607-c36a594d95f3?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1600&q=80",
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

export function HomePage() {
  const navigate = useNavigate();
  const store = useAppStore();

  useEffect(() => {
    if (window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView({ behavior: "smooth" });
    }
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

      <main>
        <section className="hero-panel" id="hero">
          <div className="hero-center">
            <div className="hero-star">✳</div>
            <h1>ICL Pilates is different.</h1>
            <p className="hero-text">
              이끌림 필라테스는 고급스러운 공간 경험과 실전 중심 교육 콘텐츠를 함께 제안합니다.
              스튜디오 홍보부터 수강생용 가이드 영상 판매까지 한 흐름으로 이어집니다.
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
            <div className="section-star">✳</div>
            <p className="section-kicker">Brand</p>
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
                alt="발끝 정렬을 보여주는 필라테스"
                onError={attachImageFallback}
              />
            </div>
            <div className="mosaic-card tall">
              <img
                src="https://images.unsplash.com/photo-1593079831268-3381b0db4a77?auto=format&fit=crop&w=1200&q=80"
                alt="필라테스 자세를 보여주는 상체"
                onError={attachImageFallback}
              />
            </div>
            <div className="mosaic-card wide offset-up">
              <img
                src="https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=1200&q=80"
                alt="옆구리 스트레칭 필라테스"
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
                alt="스튜디오에서 필라테스 하는 모습"
                onError={attachImageFallback}
              />
            </div>
            <div className="feature-copy">
              <h2 className="feature-title">이끌림을 선택하는 3가지 이유</h2>
              <button
                className="ghost-button"
                type="button"
                onClick={() => navigate("/academy")}
              >
                교육 상품 보러가기
              </button>

              <article className="reason-item">
                <span>special feature 01.</span>
                <h3>프리미엄 무드의 브랜딩</h3>
                <p>
                  차분한 아이보리와 골드 포인트를 바탕으로 고급스러운 첫인상을 전달합니다.<br></br>
                  상담 문의 전환에 유리한 구조를 고려했습니다.
                </p>
              </article>

              <article className="reason-item">
                <span>special feature 02.</span>
                <h3>오프라인과 온라인의 결합</h3>
                <p>
                  스튜디오 소개뿐 아니라 교육 가이드 영상 판매까지 같은 브랜드 경험 안에서 이어지도록 설계했습니다.
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
            <div className="section-star">✳</div>
            <p className="section-kicker">Brand Status</p>
            <h2>브랜드 운영 현황</h2>
          </div>
          <div className="status-grid">
            <article className="status-card">
              <div className="status-icon">↗</div>
              <p>상담 전환 중심 구조</p>
              <strong>프리미엄 랜딩 구성</strong>
            </article>
            <article className="status-card">
              <div className="status-icon">⌘</div>
              <p>교육 상품 판매</p>
              <strong>영상 3종 즉시 선택</strong>
            </article>
            <article className="status-card">
              <div className="status-icon">◎</div>
              <p>실결제 확장 가능</p>
              <strong>토스페이먼츠 연동</strong>
            </article>
          </div>
        </section>

        <section className="academy-panel bright-panel section-block" id="academy">
          <div className="section-intro center">
            <div className="section-star">✳</div>
            <p className="section-kicker">Academy · 교육 영상</p>
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
            <div className="section-star">✳</div>
            <p className="section-kicker">Reviews</p>
            <h2>함께하고 있는 회원 후기</h2>
            <p className="section-text narrow">
              공간의 무드와 수업의 전문성, 그리고 교육 콘텐츠의 실용성까지 자연스럽게
              연결되는 브랜드 경험을 전달합니다.
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
                <p>“상담 전부터 브랜드 무드가 명확해서 신뢰감이 높았어요.”</p>
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
                <p>“교육 영상이 현장 티칭에 바로 연결돼서 복습 자료로도 좋았습니다.”</p>
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
                <p>“오프라인 홍보와 온라인 판매가 자연스럽게 이어져 운영에 도움이 됐어요.”</p>
                <strong>스튜디오 운영자</strong>
              </div>
            </article>
          </div>
        </section>

      </main>
    </div>
  );
}

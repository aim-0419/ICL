import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { getDiscountRate } from "../data/academyVideos.js";
import { resolveAcademyMediaUrl } from "../api/academyApi.js";

const DETAIL_SUMMARY = {
  입문: {
    level: "입문",
    duration: "4주 과정",
    lessons: "총 12강",
    summary:
      "기초 체형 이해부터 수업 도입 멘트까지 단계적으로 익히는 입문 과정입니다. 실제 수업 현장에서 바로 활용할 수 있는 문장과 동작 흐름 위주로 구성되어 있습니다.",
    curriculum: [
      "기본 정렬 체크 포인트",
      "호흡 큐잉 적용법",
      "첫 수업 진행 스크립트",
      "회원 피드백 대응법",
    ],
  },
  초급: {
    level: "초급",
    duration: "8주 과정",
    lessons: "총 20강",
    summary:
      "큐잉 언어를 고도화하고 시퀀스를 설계하는 초급-중급 연계 과정입니다. 체형별 보완 전략과 수정 지시 문장을 집중적으로 다룹니다.",
    curriculum: [
      "리포머/체어 핵심 큐잉",
      "시퀀스 설계 구조",
      "체형별 교정 플로우",
      "실전 코칭 케이스 스터디",
    ],
  },
  중급: {
    level: "중급",
    duration: "6주 과정",
    lessons: "총 16강",
    summary:
      "수강 만족도를 재등록으로 연결하는 운영 코칭 과정입니다. 상담-수업-후속관리 흐름을 현장 기준으로 정리합니다.",
    curriculum: [
      "수업 운영 KPI 설계",
      "재등록 전환 스크립트",
      "상담 프로세스 표준화",
      "운영 체크리스트 실습",
    ],
  },
  고급: {
    level: "고급",
    duration: "5주 과정",
    lessons: "총 14강",
    summary:
      "브랜드 운영과 교육 콘텐츠 판매를 결합한 확장 과정입니다. 홍보-상담-결제-수강관리까지 한 흐름으로 다룹니다.",
    curriculum: [
      "브랜드 메시지 설계",
      "콘텐츠 판매 페이지 구성",
      "초기 매출 구조 설계",
      "결제 이후 수강 관리",
    ],
  },
};

function resolveFallbackChapter(video) {
  return [
    {
      id: `${video.id}-ch-1`,
      chapterOrder: 1,
      title: "1차시",
      videoUrl: video.videoUrl || "",
    },
  ];
}

export function AcademyDetailPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const store = useAppStore();
  const videos = Array.isArray(store.academyVideos) ? store.academyVideos : [];
  const video = videos.find((item) => String(item.id) === String(videoId));

  if (!video) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main className="content-page academy-detail-page">
          <section className="academy-empty-state">
            <h3>강의 정보를 찾을 수 없습니다.</h3>
            <p>목록으로 돌아가 다른 교육 영상을 확인해 주세요.</p>
            <Link className="pill-button" to="/academy">
              목록으로 돌아가기
            </Link>
          </section>
        </main>
      </div>
    );
  }

  const detail = DETAIL_SUMMARY[video.category] || DETAIL_SUMMARY["입문"];
  const discountRate = getDiscountRate(video.originalPrice, video.salePrice);
  const normalizedBadge = (video.badge || "").toLowerCase();
  const badgeTone = normalizedBadge === "hot" ? "is-hot" : normalizedBadge === "new" ? "is-new" : "";
  const showBadge = badgeTone !== "";
  const relatedVideos = videos
    .filter((item) => item.id !== video.id && item.category === video.category)
    .slice(0, 3);
  const chapters = Array.isArray(video.chapters) && video.chapters.length ? video.chapters : resolveFallbackChapter(video);

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page academy-detail-page">
        <section className="academy-detail-head">
          <p className="section-kicker">아카데미 상세보기</p>
          <h1>{video.title}</h1>
          <p className="section-text">{video.instructor}</p>
        </section>

        <section className="academy-detail-layout">
          <div className="academy-detail-media">
            <img src={resolveAcademyMediaUrl(video.image)} alt={video.title} />
          </div>
          <article className="academy-detail-info">
            <div className="academy-video-tags">
              {showBadge ? <span className={`academy-tag academy-badge ${badgeTone}`}>{video.badge}</span> : null}
              <span className="academy-tag outline">{video.category}</span>
              <span className="academy-tag outline">{chapters.length}차시</span>
            </div>

            <div className="academy-video-meta">
              <span>★{video.rating}</span>
              <span>리뷰 {video.reviews}건</span>
            </div>

            <div className="academy-video-pricing academy-detail-pricing">
              <span className="academy-price-old">{store.formatCurrency(video.originalPrice)}</span>
              <strong className="academy-price-sale">{store.formatCurrency(video.salePrice)}</strong>
              {discountRate > 0 ? <em>할인 {discountRate}%</em> : null}
            </div>

            <p className="academy-detail-summary">{detail.summary}</p>

            <dl className="academy-detail-spec">
              <div>
                <dt>레벨</dt>
                <dd>{detail.level}</dd>
              </div>
              <div>
                <dt>수강 기간</dt>
                <dd>{video.period || detail.duration}</dd>
              </div>
              <div>
                <dt>강의 수</dt>
                <dd>{chapters.length}차시</dd>
              </div>
            </dl>

            <div className="academy-detail-actions">
              <button
                type="button"
                className="pill-button"
                onClick={async () => {
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
              <button type="button" className="ghost-button" onClick={() => navigate(`/academy/player/${video.id}`)}>
                바로 수강하기
              </button>
            </div>
          </article>
        </section>

        <section className="academy-detail-extra">
          <article className="academy-detail-curriculum">
            <h2>차시 구성</h2>
            <ul>
              {chapters.map((chapter) => (
                <li key={chapter.id || `${video.id}-${chapter.chapterOrder}`}>
                  {chapter.chapterOrder || 1}차시 · {chapter.title || "차시"}
                </li>
              ))}
            </ul>
          </article>

          <article className="academy-detail-curriculum">
            <h2>커리큘럼 미리보기</h2>
            <ul>
              {detail.curriculum.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="academy-detail-related">
            <h2>같은 카테고리 추천 강의</h2>
            <div className="academy-related-grid">
              {relatedVideos.map((item) => (
                <Link className="academy-related-card" key={item.id} to={`/academy/${item.id}`}>
                  <img src={resolveAcademyMediaUrl(item.image)} alt={item.title} />
                  <strong>{item.title}</strong>
                  <span>{store.formatCurrency(item.salePrice)}</span>
                </Link>
              ))}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

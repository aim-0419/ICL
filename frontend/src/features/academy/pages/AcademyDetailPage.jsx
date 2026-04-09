import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import {
  ACADEMY_VIDEOS,
  getAcademyVideoById,
  getDiscountRate,
} from "../data/academyVideos.js";

const DETAIL_SUMMARY = {
  입문: {
    level: "입문",
    duration: "4주 과정",
    lessons: "총 12강",
    summary:
      "필라테스 기본 정렬, 호흡, 큐잉의 핵심을 빠르게 익히는 입문형 가이드입니다. 실제 수업에서 바로 적용할 수 있는 문장과 루틴 중심으로 구성했습니다.",
    curriculum: ["기본 정렬 체크포인트", "호흡 패턴 적용법", "첫 수업 진행 스크립트", "회원 피드백 대응법"],
  },
  초급: {
    level: "초급",
    duration: "8주 과정",
    lessons: "총 20강",
    summary:
      "큐잉 언어를 고도화하고 시퀀스를 설계하는 초급-중간 과정입니다. 회원 체형/목표별 변형 전략과 수정 큐를 중심으로 다룹니다.",
    curriculum: ["리포머/체어 고급 큐잉", "시퀀스 전개 구조", "체형별 교정 전략", "실전 코칭 케이스 스터디"],
  },
  중급: {
    level: "중급",
    duration: "6주 과정",
    lessons: "총 16강",
    summary:
      "수업 만족도를 매출로 연결하는 운영형 콘텐츠입니다. 수강 유지율, 재등록 전환, 상담/응대 프로세스를 함께 설계합니다.",
    curriculum: ["수업 운영 KPI 설계", "재등록 전환 스크립트", "상담 프로세스 표준화", "운영 체크리스트 실습"],
  },
  고급: {
    level: "고급",
    duration: "5주 과정",
    lessons: "총 14강",
    summary:
      "브랜딩과 콘텐츠 판매를 결합한 창업 확장형 과정입니다. 홍보-상담-결제까지 이어지는 실무 흐름을 실제 사례로 학습합니다.",
    curriculum: ["브랜드 포지셔닝", "홍보 콘텐츠 제작", "초기 매출 구조 설계", "결제/고객관리 자동화"],
  },
};

export function AcademyDetailPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const store = useAppStore();
  const video = getAcademyVideoById(videoId);

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

  const detail = DETAIL_SUMMARY[video.category] || DETAIL_SUMMARY.입문;
  const discountRate = getDiscountRate(video.originalPrice, video.salePrice);
  const normalizedBadge = (video.badge || "").toLowerCase();
  const badgeTone = normalizedBadge === "hot" ? "is-hot" : normalizedBadge === "new" ? "is-new" : "";
  const showBadge = badgeTone !== "";
  const relatedVideos = ACADEMY_VIDEOS.filter(
    (item) => item.id !== video.id && item.category === video.category
  ).slice(0, 3);

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page academy-detail-page">
        <section className="academy-detail-head">
          <p className="section-kicker">Academy · 상세보기</p>
          <h1>{video.title}</h1>
          <p className="section-text">{video.instructor}</p>
        </section>

        <section className="academy-detail-layout">
          <div className="academy-detail-media">
            <img src={video.image} alt={video.title} />
          </div>
          <article className="academy-detail-info">
            <div className="academy-video-tags">
              {showBadge ? (
                <span className={`academy-tag academy-badge ${badgeTone}`}>{video.badge}</span>
              ) : null}
              <span className="academy-tag outline">{video.category}</span>
            </div>

            <div className="academy-video-meta">
              <span>★ {video.rating}</span>
              <span>리뷰 {video.reviews}개</span>
            </div>

            <div className="academy-video-pricing academy-detail-pricing">
              <span className="academy-price-old">{store.formatCurrency(video.originalPrice)}</span>
              <strong className="academy-price-sale">{store.formatCurrency(video.salePrice)}</strong>
              {discountRate > 0 ? <em>할인 {discountRate}%</em> : null}
            </div>

            <p className="academy-detail-summary">{detail.summary}</p>

            <dl className="academy-detail-spec">
              <div>
                <dt>난이도</dt>
                <dd>{detail.level}</dd>
              </div>
              <div>
                <dt>수강 기간</dt>
                <dd>{detail.duration}</dd>
              </div>
              <div>
                <dt>강의 수</dt>
                <dd>{detail.lessons}</dd>
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
              <button type="button" className="ghost-button" onClick={() => navigate("/academy")}>
                목록으로
              </button>
            </div>
          </article>
        </section>

        <section className="academy-detail-extra">
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
                  <img src={item.image} alt={item.title} />
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

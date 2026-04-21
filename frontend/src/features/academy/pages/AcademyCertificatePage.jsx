import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { resolveAcademyMediaUrl } from "../api/academyApi.js";

const DETAIL_SUMMARY = {
  입문: { duration: "4주 과정", lessons: "총 12강" },
  초급: { duration: "8주 과정", lessons: "총 20강" },
  중급: { duration: "6주 과정", lessons: "총 16강" },
  고급: { duration: "5주 과정", lessons: "총 14강" },
};

function formatCertDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export function AcademyCertificatePage() {
  const { videoId } = useParams();
  const store = useAppStore();

  const allVideos = Array.isArray(store.academyVideos) ? store.academyVideos : [];
  const video = allVideos.find((v) => String(v.id) === String(videoId));

  const progress = useMemo(
    () => (Array.isArray(store.academyProgress) ? store.academyProgress : []).find(
      (p) => String(p.videoId) === String(videoId)
    ),
    [store.academyProgress, videoId]
  );

  const chapterProgress = useMemo(
    () => (Array.isArray(store.academyChapterProgress) ? store.academyChapterProgress : []).filter(
      (p) => String(p.videoId) === String(videoId)
    ),
    [store.academyChapterProgress, videoId]
  );

  const completedChapters = chapterProgress.filter((p) => p.completed).length;
  const totalChapters = Array.isArray(video?.chapters) ? video.chapters.length : completedChapters;
  const completedAt = progress?.lastWatchedAt || new Date().toISOString();
  const detail = DETAIL_SUMMARY[video?.category] || DETAIL_SUMMARY["입문"];

  if (!store.currentUser) {
    return (
      <div className="site-shell">
        <SiteHeader subpage />
        <main className="content-page">
          <section className="academy-player-empty">
            <h1>로그인이 필요합니다.</h1>
            <Link className="pill-button" to="/login">로그인</Link>
          </section>
        </main>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="site-shell">
        <SiteHeader subpage />
        <main className="content-page">
          <section className="academy-player-empty">
            <h1>강의 정보를 찾을 수 없습니다.</h1>
            <Link className="pill-button" to="/mypage">마이페이지로</Link>
          </section>
        </main>
      </div>
    );
  }

  if (!progress?.completed) {
    return (
      <div className="site-shell">
        <SiteHeader subpage />
        <main className="content-page">
          <section className="academy-player-empty">
            <p className="section-kicker">수료증</p>
            <h1>아직 수강을 완료하지 않았습니다.</h1>
            <p className="section-text">모든 차시를 완료하면 수료증을 발급받을 수 있습니다.</p>
            <div className="academy-player-empty-actions">
              <Link className="pill-button" to={`/academy/player/${videoId}`}>이어보기</Link>
              <Link className="ghost-button" to="/mypage">마이페이지</Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="content-page certificate-page">
        <div className="certificate-actions no-print">
          <button type="button" className="pill-button" onClick={() => window.print()}>
            수료증 출력/저장
          </button>
          <Link className="ghost-button" to="/mypage">마이페이지</Link>
        </div>

        <div className="certificate-wrap">
          <div className="certificate-card">
            <div className="certificate-header">
              <p className="certificate-brand">ICL 필라테스 아카데미</p>
              <h1 className="certificate-title">수 료 증</h1>
            </div>

            <div className="certificate-body">
              <div className="certificate-student-block">
                <p className="certificate-label">수료자</p>
                <p className="certificate-value name">{store.currentUser.name} 님</p>
              </div>

              <div className="certificate-divider" />

              <div className="certificate-course-block">
                <div className="certificate-thumb-wrap">
                  {video.image ? (
                    <img src={resolveAcademyMediaUrl(video.image)} alt={video.title} className="certificate-thumb" />
                  ) : null}
                </div>
                <div className="certificate-course-info">
                  <p className="certificate-label">수료 과정</p>
                  <p className="certificate-value course-title">{video.title}</p>
                  <p className="certificate-meta">
                    강사: {video.instructor} · 과정: {video.category} · {detail.duration}
                  </p>
                  <p className="certificate-meta">
                    이수 차시: {totalChapters > 0 ? `${completedChapters}/${totalChapters}차시` : `${completedChapters}차시`}
                    {video.period ? ` · 수강 기간: ${video.period}` : ""}
                  </p>
                </div>
              </div>

              <div className="certificate-statement">
                <p>
                  위 분은 ICL 필라테스 아카데미의 <strong>{video.title}</strong> 과정을
                  성실히 이수하였음을 증명합니다.
                </p>
              </div>

              <div className="certificate-date-block">
                <p className="certificate-label">수료일</p>
                <p className="certificate-value">{formatCertDate(completedAt)}</p>
              </div>
            </div>

            <div className="certificate-footer">
              <div className="certificate-seal">
                <div className="seal-circle">
                  <span>ICL</span>
                  <span>PILATES</span>
                </div>
              </div>
              <div className="certificate-issuer">
                <p className="certificate-issuer-name">ICL 필라테스 아카데미</p>
                <p className="certificate-issuer-sub">원장 (인)</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

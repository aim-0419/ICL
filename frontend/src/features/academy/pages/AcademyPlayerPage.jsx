import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import {
  getAcademyPlaybackSourceByVideoId,
  getAcademyVideoById,
} from "../data/academyVideos.js";
import { getPurchasedVideos } from "../lib/purchases.js";

export function AcademyPlayerPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const store = useAppStore();

  const purchasedVideos = getPurchasedVideos(store.orders, store.currentUser?.email || "");
  const purchasedVideoIdSet = new Set(purchasedVideos.map((video) => String(video.id)));
  const activeVideo = getAcademyVideoById(videoId);
  const canPlay = Boolean(activeVideo && purchasedVideoIdSet.has(String(activeVideo.id)));

  if (purchasedVideos.length === 0) {
    return (
      <div className="site-shell">
        <SiteHeader subpage />
        <main className="content-page academy-player-page">
          <section className="academy-player-empty">
            <p className="section-kicker">Video Player</p>
            <h1>구매한 영상이 없습니다</h1>
            <p className="section-text">교육 영상 구매 후 마이페이지에서 바로 재생할 수 있습니다.</p>
            <div className="academy-player-empty-actions">
              <button className="pill-button" type="button" onClick={() => navigate("/academy")}>
                교육 영상 보러가기
              </button>
              <button className="ghost-button" type="button" onClick={() => navigate("/mypage")}>
                마이페이지로
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!canPlay) {
    return (
      <div className="site-shell">
        <SiteHeader subpage />
        <main className="content-page academy-player-page">
          <section className="academy-player-empty">
            <p className="section-kicker">Access Denied</p>
            <h1>재생 권한이 없는 영상입니다</h1>
            <p className="section-text">구매한 영상 목록에서 재생할 영상을 선택해 주세요.</p>
            <div className="academy-player-list">
              {purchasedVideos.map((video) => (
                <Link key={video.id} className="academy-player-list-item" to={`/academy/player/${video.id}`}>
                  <img src={video.image} alt={video.title} />
                  <div>
                    <strong>{video.title}</strong>
                    <span>{video.instructor}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="content-page academy-player-page">
        <section className="content-hero academy-player-hero">
          <p className="section-kicker">My Video Player</p>
          <h1>{activeVideo.title}</h1>
          <p className="section-text">
            {activeVideo.instructor} · {activeVideo.category}
          </p>
        </section>

        <section className="academy-player-layout">
          <article className="academy-player-main">
            <div className="academy-player-video-wrap">
              <video
                key={activeVideo.id}
                className="academy-player-video"
                controls
                controlsList="nodownload"
                preload="metadata"
                poster={activeVideo.image}
              >
                <source
                  src={getAcademyPlaybackSourceByVideoId(activeVideo.id)}
                  type="video/mp4"
                />
              </video>
            </div>
            <p className="academy-player-note">
              현재는 개발용 스트리밍 소스를 사용 중이며, 추후 실제 수강 영상으로 교체됩니다.
            </p>
          </article>

          <aside className="academy-player-sidebar">
            <h2>내 구매 영상</h2>
            <div className="academy-player-list">
              {purchasedVideos.map((video) => {
                const isActive = video.id === activeVideo.id;
                return (
                  <Link
                    key={video.id}
                    className={`academy-player-list-item ${isActive ? "active" : ""}`}
                    to={`/academy/player/${video.id}`}
                  >
                    <img src={video.image} alt={video.title} />
                    <div>
                      <strong>{video.title}</strong>
                      <span>{video.instructor}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

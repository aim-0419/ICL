import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { isAdminStaff } from "../../../shared/auth/userRoles.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { resolveAcademyMediaUrl } from "../api/academyApi.js";
import { getAcademyPlaybackSourceByVideoId } from "../data/academyVideos.js";
import { getPurchasedVideos } from "../lib/purchases.js";

const AUTO_SAVE_INTERVAL_SECONDS = 10;

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR");
}

function resolveFallbackChapter(video) {
  return {
    id: `${video.id}-ch-1`,
    chapterOrder: 1,
    title: "1차시",
    description: "",
    videoUrl: video.videoUrl || getAcademyPlaybackSourceByVideoId(video.id),
    durationSec: 0,
    isPreview: false,
  };
}

function formatSeconds(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}시간 ${m % 60}분 ${s % 60}초`;
  if (m > 0) return `${m}분 ${s % 60}초`;
  return `${s}초`;
}

function getLatestWatchedChapter(chapters) {
  const watched = chapters
    .filter((chapter) => chapter.lastWatchedAt)
    .sort((a, b) => new Date(b.lastWatchedAt || 0).getTime() - new Date(a.lastWatchedAt || 0).getTime());
  return watched[0] || chapters[0] || null;
}

export function AcademyPlayerPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const store = useAppStore();
  const videoRef = useRef(null);
  const lastSavedTimeRef = useRef(0);
  const isSavingRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const resumeChoiceRef = useRef("auto"); // 'auto' | 'resume' | 'restart'

  const [activeChapterId, setActiveChapterId] = useState("");
  const [resumeDialog, setResumeDialog] = useState(null); // { chapterId, resumeTime }
  const [isProgressLoading, setIsProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadProgress() {
      if (!store.currentUser?.id) {
        setIsProgressLoading(false);
        return;
      }

      try {
        setIsProgressLoading(true);
        setProgressError("");
        await store.refreshAcademyProgress?.();
      } catch (error) {
        if (!mounted) return;
        setProgressError(error?.message || "학습 진도를 불러오지 못했습니다.");
      } finally {
        if (mounted) setIsProgressLoading(false);
      }
    }

    loadProgress();

    return () => {
      mounted = false;
    };
  }, [store.currentUser?.id]);

  const lectureProgressMap = useMemo(
    () =>
      new Map(
        (Array.isArray(store.academyProgress) ? store.academyProgress : []).map((item) => [
          String(item.videoId || ""),
          item,
        ])
      ),
    [store.academyProgress]
  );

  const chapterProgressMap = useMemo(
    () =>
      new Map(
        (Array.isArray(store.academyChapterProgress) ? store.academyChapterProgress : []).map((item) => [
          `${String(item.videoId || "")}::${String(item.chapterId || "")}`,
          item,
        ])
      ),
    [store.academyChapterProgress]
  );

  const allVideos = Array.isArray(store.academyVideos) ? store.academyVideos : [];
  const baseVideos = isAdminStaff(store.currentUser)
    ? allVideos
    : getPurchasedVideos(store.orders, store.currentUser?.email || "", allVideos);

  const purchasedVideos = useMemo(
    () =>
      baseVideos.map((video) => {
        const lectureProgress = lectureProgressMap.get(String(video.id)) || {};
        const baseChapters = Array.isArray(video.chapters) && video.chapters.length
          ? video.chapters
          : [resolveFallbackChapter(video)];

        const chapters = baseChapters
          .map((chapter, index) => {
            const chapterId = String(chapter.id || `${video.id}-ch-${index + 1}`);
            const key = `${String(video.id)}::${chapterId}`;
            const progress = chapterProgressMap.get(key) || {};

            return {
              ...chapter,
              id: chapterId,
              chapterOrder: Number(chapter.chapterOrder || index + 1),
              title: String(chapter.title || `${index + 1}차시`),
              videoUrl:
                chapter.videoUrl ||
                chapter.videoPath ||
                video.videoUrl ||
                getAcademyPlaybackSourceByVideoId(video.id),
              currentTime: Number(progress.currentTime || 0),
              duration: Number(progress.duration || chapter.durationSec || 0),
              progressPercent: Number(progress.progressPercent || 0),
              completed: Boolean(progress.completed),
              lastWatchedAt: String(progress.lastWatchedAt || ""),
            };
          })
          .sort((a, b) => Number(a.chapterOrder || 0) - Number(b.chapterOrder || 0));

        return {
          ...video,
          currentTime: Number(lectureProgress.currentTime || 0),
          duration: Number(lectureProgress.duration || 0),
          progressPercent: Number(lectureProgress.progressPercent || 0),
          completed: Boolean(lectureProgress.completed),
          lastWatchedAt: String(lectureProgress.lastWatchedAt || ""),
          chapters,
        };
      }),
    [baseVideos, lectureProgressMap, chapterProgressMap]
  );

  const activeVideo = purchasedVideos.find((video) => String(video.id) === String(videoId));
  const canPlay = Boolean(activeVideo);

  const activeChapter = useMemo(() => {
    if (!activeVideo) return null;
    if (!activeChapterId) return activeVideo.chapters[0] || null;
    return activeVideo.chapters.find((chapter) => chapter.id === activeChapterId) || activeVideo.chapters[0] || null;
  }, [activeVideo, activeChapterId]);

  useEffect(() => {
    if (!activeVideo) {
      setActiveChapterId("");
      return;
    }
    resumeChoiceRef.current = "auto";
    const latestChapter = getLatestWatchedChapter(activeVideo.chapters);
    setActiveChapterId(latestChapter?.id || activeVideo.chapters[0]?.id || "");
  }, [activeVideo?.id]);

  useEffect(() => {
    lastSavedTimeRef.current = Number(activeChapter?.currentTime || 0);
    resumeAppliedRef.current = false;
  }, [activeVideo?.id, activeChapter?.id, activeChapter?.currentTime]);

  const syncProgress = useCallback(
    async ({ force = false, completed = false } = {}) => {
      const videoElement = videoRef.current;
      if (!(videoElement instanceof HTMLVideoElement) || !activeVideo || !activeChapter || isSavingRef.current) {
        return;
      }

      const currentTime = Math.max(0, Math.round(Number(videoElement.currentTime || 0)));
      const duration = Math.max(0, Math.round(Number(videoElement.duration || 0)));
      if (!force && !completed && Math.abs(currentTime - lastSavedTimeRef.current) < AUTO_SAVE_INTERVAL_SECONDS) {
        return;
      }

      isSavingRef.current = true;

      try {
        if (typeof store.saveAcademyChapterProgress === "function") {
          const saved = await store.saveAcademyChapterProgress(activeVideo.id, activeChapter.id, {
            currentTime,
            duration,
            completed,
          });
          lastSavedTimeRef.current = Number(saved?.currentTime ?? currentTime);
        } else {
          const saved = await store.saveAcademyProgress?.(activeVideo.id, {
            chapterId: activeChapter.id,
            currentTime,
            duration,
            completed,
          });
          lastSavedTimeRef.current = Number(saved?.currentTime ?? currentTime);
        }
      } catch {
        // 저장 실패 시 재생은 유지하고 다음 자동 저장 시점에 재시도한다.
      } finally {
        isSavingRef.current = false;
      }
    },
    [activeVideo, activeChapter, store]
  );

  function handleChapterClick(chapter) {
    if (chapter.id === activeChapterId) return;
    if (chapter.currentTime > 5) {
      setResumeDialog({ chapterId: chapter.id, resumeTime: chapter.currentTime });
    } else {
      resumeChoiceRef.current = "restart";
      setActiveChapterId(chapter.id);
    }
  }

  function handleResumeChoice(choice) {
    resumeChoiceRef.current = choice;
    setActiveChapterId(resumeDialog.chapterId);
    setResumeDialog(null);
  }

  if (isProgressLoading && purchasedVideos.length === 0) {
    return (
      <div className="site-shell">
        <SiteHeader subpage />
        <main className="content-page academy-player-page">
          <section className="academy-player-empty">
            <p className="section-kicker">교육 영상 플레이어</p>
            <h1>학습 정보를 불러오는 중입니다.</h1>
          </section>
        </main>
      </div>
    );
  }

  if (purchasedVideos.length === 0) {
    return (
      <div className="site-shell">
        <SiteHeader subpage />
        <main className="content-page academy-player-page">
          <section className="academy-player-empty">
            <p className="section-kicker">교육 영상 플레이어</p>
            <h1>수강 가능한 강의가 없습니다.</h1>
            <p className="section-text">강의를 구매하면 마이페이지에서 바로 이어서 학습할 수 있습니다.</p>
            <div className="academy-player-empty-actions">
              <button className="pill-button" type="button" onClick={() => navigate("/academy")}>
                강의 보러가기
              </button>
              <button className="ghost-button" type="button" onClick={() => navigate("/mypage")}>
                마이페이지
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!canPlay || !activeChapter) {
    return (
      <div className="site-shell">
        <SiteHeader subpage />
        <main className="content-page academy-player-page">
          <section className="academy-player-empty">
            <p className="section-kicker">수강 권한</p>
            <h1>선택한 강의를 재생할 수 없습니다.</h1>
            <p className="section-text">수강 가능한 강의 목록에서 다시 선택해 주세요.</p>
            <div className="academy-player-list">
              {purchasedVideos.map((video) => (
                <Link key={video.id} className="academy-player-list-item" to={`/academy/player/${video.id}`}>
                  <img src={resolveAcademyMediaUrl(video.image)} alt={video.title} />
                  <div>
                    <strong>{video.title}</strong>
                    <span>{video.progressPercent}% 학습</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  const chapterLastWatchedText = formatDateTime(activeChapter.lastWatchedAt);
  const lectureLastWatchedText = formatDateTime(activeVideo.lastWatchedAt);
  const playbackSource =
    resolveAcademyMediaUrl(activeChapter.videoUrl) ||
    resolveAcademyMediaUrl(activeVideo.videoUrl) ||
    getAcademyPlaybackSourceByVideoId(activeVideo.id);

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="content-page academy-player-page">
        <section className="content-hero academy-player-hero">
          <p className="section-kicker">교육 영상 플레이어</p>
          <h1>{activeVideo.title}</h1>
          <p className="section-text">
            {activeVideo.instructor} · {activeVideo.category}
          </p>
        </section>

        <section className="academy-player-layout">
          <article className="academy-player-main">
            <div className="academy-player-video-wrap">
              <video
                ref={videoRef}
                key={`${activeVideo.id}-${activeChapter.id}`}
                className="academy-player-video"
                controls
                controlsList="nodownload"
                preload="metadata"
                poster={resolveAcademyMediaUrl(activeVideo.image)}
                onLoadedMetadata={() => {
                  const videoElement = videoRef.current;
                  if (!(videoElement instanceof HTMLVideoElement) || resumeAppliedRef.current) return;

                  const choice = resumeChoiceRef.current;
                  if (choice === "resume" || choice === "auto") {
                    const resumeTime = Math.max(0, Math.round(Number(activeChapter.currentTime || 0)));
                    if (resumeTime > 5) {
                      const safeTime = Math.min(
                        resumeTime,
                        Math.max(0, Math.floor(Number(videoElement.duration || 0)) - 2)
                      );
                      videoElement.currentTime = safeTime;
                    }
                  }

                  resumeAppliedRef.current = true;
                }}
                onTimeUpdate={() => {
                  void syncProgress();
                }}
                onPause={() => {
                  void syncProgress({ force: true });
                }}
                onEnded={() => {
                  void syncProgress({ force: true, completed: true });
                }}
              >
                <source src={playbackSource} type="video/mp4" />
              </video>
            </div>

            <div className="academy-player-note-stack">
              <p className="academy-player-note">
                강의 진도 {activeVideo.progressPercent}%{activeVideo.completed ? " · 완강" : ""}
                {lectureLastWatchedText ? ` · 마지막 수강 ${lectureLastWatchedText}` : ""}
              </p>
              <p className="academy-player-note">
                현재 차시: {activeChapter.title} · 진도 {activeChapter.progressPercent}%
                {activeChapter.completed ? " · 학습 완료" : ""}
                {chapterLastWatchedText ? ` · 마지막 재생 ${chapterLastWatchedText}` : ""}
              </p>
            </div>

            {progressError ? <p className="academy-player-note">진도 동기화 알림: {progressError}</p> : null}
          </article>

          <aside className="academy-player-sidebar">
            <section className="academy-player-chapter-board">
              <h3>차시 목록</h3>
              <div className="academy-player-chapter-list">
                {activeVideo.chapters.map((chapter) => {
                  const isActiveChapter = chapter.id === activeChapter.id;
                  return (
                    <button
                      key={chapter.id}
                      type="button"
                      className={`academy-player-chapter-item ${isActiveChapter ? "active" : ""}`}
                      onClick={() => handleChapterClick(chapter)}
                    >
                      <strong>
                        {chapter.chapterOrder}차시 · {chapter.title}
                      </strong>
                      <span>
                        진도 {chapter.progressPercent}%{chapter.completed ? " · 완료" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="academy-player-sidebar-lectures">
              <h3>내 수강 강의</h3>
              <div className="academy-player-list">
                {purchasedVideos.map((video) => {
                  const isActive = video.id === activeVideo.id;
                  return (
                    <Link
                      key={video.id}
                      className={`academy-player-list-item ${isActive ? "active" : ""}`}
                      to={`/academy/player/${video.id}`}
                    >
                      <img src={resolveAcademyMediaUrl(video.image)} alt={video.title} />
                      <div>
                        <strong>{video.title}</strong>
                        <span>
                          진도 {video.progressPercent}%{video.completed ? " · 완강" : ""}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </aside>
        </section>
      </main>

      {resumeDialog ? (
        <div className="resume-dialog-overlay" onClick={() => setResumeDialog(null)}>
          <div className="resume-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="resume-dialog-info">
              <strong>{formatSeconds(resumeDialog.resumeTime)}</strong> 까지 시청한 기록이 있습니다.
            </p>
            <p>어디서부터 재생할까요?</p>
            <div className="resume-dialog-actions">
              <button
                className="pill-button small"
                type="button"
                onClick={() => handleResumeChoice("resume")}
              >
                이어서 재생
              </button>
              <button
                className="ghost-button small-ghost"
                type="button"
                onClick={() => handleResumeChoice("restart")}
              >
                처음부터 보기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

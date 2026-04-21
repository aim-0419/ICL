import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { isAdminStaff } from "../../../shared/auth/userRoles.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import {
  resolveAcademyMediaUrl,
  listAcademyQna,
  createAcademyQnaPost,
  createAcademyQnaReply,
  deleteAcademyQnaPost,
  deleteAcademyQnaReply,
} from "../api/academyApi.js";
import { getAcademyPlaybackSourceByVideoId } from "../data/academyVideos.js";
import { collectPurchasedVideoProductIds, getPreviewAccessibleVideos } from "../lib/purchases.js";

const AUTO_SAVE_INTERVAL_SECONDS = 10;
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];
const RESUME_MIN_SECONDS = 5;
const RESUME_END_BUFFER_SECONDS = 1;

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

function shouldOfferResume(currentTime, duration) {
  const watchedSec = Math.max(0, Math.round(Number(currentTime || 0)));
  if (watchedSec <= RESUME_MIN_SECONDS) return false;

  const durationSec = Math.max(0, Math.round(Number(duration || 0)));
  // 마지막(완강) 지점이면 다음 재생은 처음부터 시작한다.
  if (durationSec > 0 && watchedSec >= Math.max(0, durationSec - RESUME_END_BUFFER_SECONDS)) {
    return false;
  }

  return true;
}

function formatTotalDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}초`;
  const totalMinutes = Math.floor(s / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`;
  if (hours > 0) return `${hours}시간`;
  return `${totalMinutes}분`;
}

function calcCourseTotalSec(chapters) {
  return (Array.isArray(chapters) ? chapters : []).reduce(
    (sum, ch) => sum + Math.max(0, Number(ch.durationSec || ch.duration || 0)),
    0
  );
}

function calcCourseRemainingSec(chapters) {
  return (Array.isArray(chapters) ? chapters : []).reduce((sum, ch) => {
    if (ch.completed) return sum;
    const dur = Math.max(0, Number(ch.durationSec || ch.duration || 0));
    const watched = Math.max(0, Number(ch.currentTime || 0));
    return sum + Math.max(0, dur - watched);
  }, 0);
}

function parseStudyPeriodDays(periodText) {
  if (!periodText) return null;
  const text = String(periodText).trim();
  if (/무제한|평생|unlimited|lifetime/i.test(text)) return null;
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function calcEnrollmentExpiry(orders, videoProductId, periodText) {
  const periodDays = parseStudyPeriodDays(periodText);
  if (periodDays === null) return { type: "unlimited" };

  const normalizedProductId = String(videoProductId || "").trim();
  if (!normalizedProductId) return { type: "period", text: periodText };

  const matchingOrders = (Array.isArray(orders) ? orders : []).filter((order) => {
    const ids = new Set();
    const addId = (v) => { const s = String(v || "").trim(); if (s) ids.add(s); };
    if (Array.isArray(order.selectedProductIds)) order.selectedProductIds.forEach(addId);
    if (Array.isArray(order.items)) order.items.forEach((i) => addId(i?.productId));
    addId(order.productId);
    try {
      const payload = typeof order.payload === "string" ? JSON.parse(order.payload) : (order.payload || {});
      if (Array.isArray(payload.selectedProductIds)) payload.selectedProductIds.forEach(addId);
      if (Array.isArray(payload.items)) payload.items.forEach((i) => addId(i?.productId));
      addId(payload.productId);
    } catch {}
    return ids.has(normalizedProductId);
  });

  if (matchingOrders.length === 0) return { type: "period", text: periodText };

  const orderDates = matchingOrders
    .map((o) => new Date(o.createdAt || o.paidAt || ""))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (orderDates.length === 0) return { type: "period", text: periodText };

  const startDate = orderDates[0];
  const expiryDate = new Date(startDate.getTime() + periodDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const expiryLabel = expiryDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  return { type: "timed", expiryDate, expiryLabel, daysLeft };
}

export function AcademyPlayerPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const store = useAppStore();
  const videoRef = useRef(null);
  const lastSavedTimeRef = useRef(0);
  const isSavingRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const resumeChoiceRef = useRef("restart"); // 'resume' | 'restart'

  const [activeChapterId, setActiveChapterId] = useState("");
  const [resumeDialog, setResumeDialog] = useState(null); // { chapterId, resumeTime }
  const [isProgressLoading, setIsProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState("");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [autoNextCountdown, setAutoNextCountdown] = useState(null); // null | number
  const autoNextTimerRef = useRef(null);

  // Q&A state
  const [qnaList, setQnaList] = useState([]);
  const [qnaLoading, setQnaLoading] = useState(false);
  const [qnaForm, setQnaForm] = useState({ title: "", content: "", isSecret: false });
  const [qnaSubmitting, setQnaSubmitting] = useState(false);
  const [qnaError, setQnaError] = useState("");
  const [replyForms, setReplyForms] = useState({}); // { [postId]: string }
  const [replySubmitting, setReplySubmitting] = useState({}); // { [postId]: bool }
  const [expandedPosts, setExpandedPosts] = useState({}); // { [postId]: bool }

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

  const isAdminUser = isAdminStaff(store.currentUser);
  const allVideos = Array.isArray(store.academyVideos) ? store.academyVideos : [];
  const purchasedProductIds = useMemo(
    () =>
      collectPurchasedVideoProductIds(
        isAdminUser ? [] : store.orders,
        isAdminUser ? "" : store.currentUser?.email || ""
      ),
    [isAdminUser, store.orders, store.currentUser?.email]
  );

  const purchasedOnlyVideos = useMemo(
    () =>
      isAdminUser
        ? allVideos
        : allVideos.filter((video) =>
            purchasedProductIds.has(String(video.productId || video.id))
          ),
    [isAdminUser, allVideos, purchasedProductIds]
  );

  const previewVideos = useMemo(
    () => (isAdminUser ? [] : getPreviewAccessibleVideos(allVideos)),
    [isAdminUser, allVideos]
  );

  const baseVideos = useMemo(() => {
    if (isAdminUser) return allVideos;

    const deduped = new Map();
    [...purchasedOnlyVideos, ...previewVideos].forEach((video) => {
      const key = String(video?.id || video?.productId || "");
      if (!key || deduped.has(key)) return;
      deduped.set(key, video);
    });
    return [...deduped.values()];
  }, [isAdminUser, allVideos, purchasedOnlyVideos, previewVideos]);

  const playableVideos = useMemo(
    () =>
      baseVideos.map((video) => {
        const productKey = String(video.productId || video.id);
        const isPurchased = isAdminUser || purchasedProductIds.has(productKey);
        const lectureProgress = lectureProgressMap.get(String(video.id)) || {};
        const allChapters = Array.isArray(video.chapters) && video.chapters.length
          ? video.chapters
          : [resolveFallbackChapter(video)];
        const baseChapters = isPurchased
          ? allChapters
          : allChapters.filter((chapter) => Boolean(chapter?.isPreview));

        if (!baseChapters.length) return null;

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
          isPurchased,
          isPreviewOnly: !isPurchased,
          currentTime: Number(lectureProgress.currentTime || 0),
          duration: Number(lectureProgress.duration || 0),
          progressPercent: Number(lectureProgress.progressPercent || 0),
          completed: Boolean(lectureProgress.completed),
          lastWatchedAt: String(lectureProgress.lastWatchedAt || ""),
          chapters,
        };
      }).filter(Boolean),
    [baseVideos, isAdminUser, purchasedProductIds, lectureProgressMap, chapterProgressMap]
  );

  const activeVideo = playableVideos.find((video) => String(video.id) === String(videoId));
  const canPlay = Boolean(activeVideo);

  const activeChapter = useMemo(() => {
    if (!activeVideo) return null;
    if (!activeChapterId) return activeVideo.chapters[0] || null;
    return activeVideo.chapters.find((chapter) => chapter.id === activeChapterId) || activeVideo.chapters[0] || null;
  }, [activeVideo, activeChapterId]);

  useEffect(() => {
    if (!activeVideo) {
      setActiveChapterId("");
      setResumeDialog(null);
      return;
    }

    const latestChapter = getLatestWatchedChapter(activeVideo.chapters);
    const nextChapterId = latestChapter?.id || activeVideo.chapters[0]?.id || "";
    const resumeTime = Math.max(0, Math.round(Number(latestChapter?.currentTime || 0)));
    const resumeDuration = Math.max(
      0,
      Math.round(Number(latestChapter?.duration || latestChapter?.durationSec || 0))
    );

    // 페이지 재진입 시에는 자동 이어보기 대신 사용자에게 선택을 받는다.
    resumeChoiceRef.current = "restart";
    setActiveChapterId(nextChapterId);
    if (nextChapterId && shouldOfferResume(resumeTime, resumeDuration)) {
      setResumeDialog({ chapterId: nextChapterId, resumeTime });
    } else {
      setResumeDialog(null);
    }
  }, [activeVideo?.id]);

  useEffect(() => {
    lastSavedTimeRef.current = Number(activeChapter?.currentTime || 0);
    resumeAppliedRef.current = false;
  }, [activeVideo?.id, activeChapter?.id, activeChapter?.currentTime]);

  const syncProgress = useCallback(
    async ({ force = false, completed = false } = {}) => {
      const videoElement = videoRef.current;
      if (
        !(videoElement instanceof HTMLVideoElement) ||
        !activeVideo ||
        !activeChapter ||
        isSavingRef.current ||
        !store.currentUser?.id
      ) {
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

  function applyPlaybackRate(rate) {
    setPlaybackRate(rate);
    if (videoRef.current instanceof HTMLVideoElement) {
      videoRef.current.playbackRate = rate;
    }
  }

  function clearAutoNext() {
    if (autoNextTimerRef.current) {
      clearInterval(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    setAutoNextCountdown(null);
  }

  function startAutoNext(nextChapter) {
    let count = 5;
    setAutoNextCountdown(count);
    autoNextTimerRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearAutoNext();
        resumeChoiceRef.current = "restart";
        setActiveChapterId(nextChapter.id);
      } else {
        setAutoNextCountdown(count);
      }
    }, 1000);
  }

  useEffect(() => {
    return () => clearAutoNext();
  }, []);

  // Q&A 로드
  const loadQna = useCallback(async (videoId) => {
    setQnaLoading(true);
    setQnaError("");
    try {
      const posts = await listAcademyQna(videoId);
      setQnaList(posts);
    } catch {
      setQnaError("Q&A를 불러오지 못했습니다.");
    } finally {
      setQnaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeVideo?.id) loadQna(activeVideo.id);
  }, [activeVideo?.id, loadQna]);

  async function handleQnaSubmit(e) {
    e.preventDefault();
    if (!store.currentUser) return alert("로그인이 필요합니다.");
    setQnaSubmitting(true);
    setQnaError("");
    try {
      await createAcademyQnaPost(activeVideo.id, qnaForm);
      setQnaForm({ title: "", content: "", isSecret: false });
      await loadQna(activeVideo.id);
    } catch (err) {
      setQnaError(err.message || "질문 등록에 실패했습니다.");
    } finally {
      setQnaSubmitting(false);
    }
  }

  async function handleReplySubmit(postId) {
    const content = replyForms[postId] || "";
    if (!content.trim()) return;
    setReplySubmitting((prev) => ({ ...prev, [postId]: true }));
    try {
      await createAcademyQnaReply(postId, { content });
      setReplyForms((prev) => ({ ...prev, [postId]: "" }));
      await loadQna(activeVideo.id);
    } catch (err) {
      alert(err.message || "답변 등록에 실패했습니다.");
    } finally {
      setReplySubmitting((prev) => ({ ...prev, [postId]: false }));
    }
  }

  async function handleDeleteQnaPost(postId) {
    if (!confirm("질문을 삭제하시겠습니까?")) return;
    try {
      await deleteAcademyQnaPost(postId);
      await loadQna(activeVideo.id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDeleteQnaReply(replyId) {
    if (!confirm("답변을 삭제하시겠습니까?")) return;
    try {
      await deleteAcademyQnaReply(replyId);
      await loadQna(activeVideo.id);
    } catch (err) {
      alert(err.message);
    }
  }

  function handleChapterClick(chapter) {
    if (chapter.id === activeChapterId) return;
    const resumeTime = Math.max(0, Math.round(Number(chapter.currentTime || 0)));
    const resumeDuration = Math.max(0, Math.round(Number(chapter.duration || chapter.durationSec || 0)));

    if (shouldOfferResume(resumeTime, resumeDuration)) {
      setResumeDialog({ chapterId: chapter.id, resumeTime });
    } else {
      resumeChoiceRef.current = "restart";
      setActiveChapterId(chapter.id);
    }
  }

  function handleResumeChoice(choice) {
    if (!resumeDialog) return;

    const selectedChapterId = resumeDialog.chapterId;
    const selectedResumeTime = Math.max(0, Math.round(Number(resumeDialog.resumeTime || 0)));

    resumeChoiceRef.current = choice;
    setResumeDialog(null);

    if (selectedChapterId !== activeChapterId) {
      setActiveChapterId(selectedChapterId);
      return;
    }

    const videoElement = videoRef.current;
    if (!(videoElement instanceof HTMLVideoElement)) return;

    if (choice === "resume" && selectedResumeTime > 5) {
      const duration = Number(videoElement.duration || 0);
      const safeResumeTime = Number.isFinite(duration) && duration > 0
        ? Math.min(selectedResumeTime, Math.max(0, Math.floor(duration) - 2))
        : selectedResumeTime;
      videoElement.currentTime = safeResumeTime;
      return;
    }

    if (choice === "restart") {
      videoElement.currentTime = 0;
    }
  }

  if (isProgressLoading && playableVideos.length === 0) {
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

  if (playableVideos.length === 0) {
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

  // 수강기한 만료 차단 (관리자 제외)
  if (canPlay && activeVideo && activeVideo.isPurchased && !isAdminUser) {
    const expiry = calcEnrollmentExpiry(
      store.orders,
      activeVideo.productId || activeVideo.id,
      activeVideo.period
    );
    if (expiry?.type === "timed" && expiry.daysLeft <= 0) {
      return (
        <div className="site-shell">
          <SiteHeader subpage />
          <main className="content-page academy-player-page">
            <section className="academy-player-empty">
              <p className="section-kicker">수강 기한 만료</p>
              <h1>수강 기한이 종료되었습니다.</h1>
              <p className="section-text">
                {activeVideo.title}의 수강 기한({expiry.expiryLabel})이 지났습니다.
                재수강을 원하시면 강의를 다시 구매해 주세요.
              </p>
              <div className="academy-player-empty-actions">
                <button className="pill-button" type="button" onClick={() => navigate(`/academy/${activeVideo.id}`)}>
                  강의 상세보기
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
              {playableVideos.map((video) => (
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

  const totalSec = calcCourseTotalSec(activeVideo.chapters);
  const remainingSec = calcCourseRemainingSec(activeVideo.chapters);
  const expiryInfo = activeVideo.isPurchased
    ? calcEnrollmentExpiry(
        store.orders,
        activeVideo.productId || activeVideo.id,
        activeVideo.period
      )
    : null;

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
          <div className="academy-player-meta-bar">
            {totalSec > 0 ? (
              <span className="academy-player-meta-item">
                총 학습 {formatTotalDuration(totalSec)}
              </span>
            ) : null}
            {remainingSec > 30 && !activeVideo.completed ? (
              <span className="academy-player-meta-item">
                잔여 {formatTotalDuration(remainingSec)}
              </span>
            ) : null}
            {activeVideo.completed ? (
              <span className="academy-player-meta-item is-complete">완강</span>
            ) : null}
            {expiryInfo?.type === "unlimited" ? (
              <span className="academy-player-meta-item">무제한 수강</span>
            ) : expiryInfo?.type === "timed" ? (
              <span
                className={`academy-player-meta-item academy-expiry-badge ${
                  expiryInfo.daysLeft <= 0
                    ? "is-expired"
                    : expiryInfo.daysLeft <= 7
                    ? "is-urgent"
                    : expiryInfo.daysLeft <= 30
                    ? "is-warning"
                    : ""
                }`}
              >
                {expiryInfo.daysLeft <= 0
                  ? "수강 기한 만료"
                  : `수강 만료 ${expiryInfo.expiryLabel} (${expiryInfo.daysLeft}일 남음)`}
              </span>
            ) : expiryInfo?.type === "period" ? (
              <span className="academy-player-meta-item">수강 기한 {expiryInfo.text}</span>
            ) : null}
          </div>
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

                  videoElement.playbackRate = playbackRate;

                  const choice = resumeChoiceRef.current;
                  if (choice === "resume") {
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
                  clearAutoNext();
                  void syncProgress({ force: true });
                }}
                onEnded={() => {
                  void syncProgress({ force: true, completed: true });
                  const currentIndex = activeVideo.chapters.findIndex((ch) => ch.id === activeChapter.id);
                  const nextChapter = activeVideo.chapters[currentIndex + 1] || null;
                  if (nextChapter) {
                    startAutoNext(nextChapter);
                  }
                }}
              >
                <source src={playbackSource} type="video/mp4" />
              </video>
            </div>

            <div className="academy-player-controls-bar">
              <div className="playback-rate-group">
                <span className="playback-rate-label">배속</span>
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`playback-rate-btn ${playbackRate === rate ? "active" : ""}`}
                    onClick={() => applyPlaybackRate(rate)}
                  >
                    {rate === 1 ? "1x" : `${rate}x`}
                  </button>
                ))}
              </div>
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

            {/* 자동 다음 차시 카운트다운 */}
            {autoNextCountdown !== null ? (
              <div className="auto-next-bar">
                <span>다음 차시 자동 재생 {autoNextCountdown}초 후...</span>
                <button type="button" className="ghost-button small-ghost" onClick={clearAutoNext}>
                  취소
                </button>
              </div>
            ) : null}
          </article>

          <aside className="academy-player-sidebar">
            <section className="academy-player-chapter-board">
              <h3>차시 목록</h3>
              <div className="academy-player-chapter-list">
                {activeVideo.chapters.map((chapter) => {
                  const isActiveChapter = chapter.id === activeChapter.id;
                  const chapterDurSec = Number(chapter.durationSec || chapter.duration || 0);
                  return (
                    <button
                      key={chapter.id}
                      type="button"
                      className={`academy-player-chapter-item ${isActiveChapter ? "active" : ""} ${chapter.completed ? "is-completed" : ""}`}
                      onClick={() => handleChapterClick(chapter)}
                    >
                      <div className="chapter-item-header">
                        <strong>
                          {chapter.chapterOrder}차시 · {chapter.title}
                        </strong>
                        {chapterDurSec > 0 ? (
                          <span className="chapter-item-duration">{formatTotalDuration(chapterDurSec)}</span>
                        ) : null}
                      </div>
                      <div className="chapter-item-status">
                        {chapter.completed ? (
                          <span className="chapter-status-label is-done">완료</span>
                        ) : chapter.progressPercent > 0 ? (
                          <span className="chapter-status-label">
                            {chapter.progressPercent}%
                            {chapter.currentTime > 5
                              ? ` · ${formatSeconds(chapter.currentTime)}까지 시청`
                              : ""}
                          </span>
                        ) : (
                          <span className="chapter-status-label is-new">미수강</span>
                        )}
                      </div>
                      {chapter.progressPercent > 0 ? (
                        <div className="chapter-progress-bar">
                          <div
                            className={`chapter-progress-fill ${chapter.completed ? "is-complete" : ""}`}
                            style={{ width: `${Math.min(100, Math.max(0, chapter.progressPercent))}%` }}
                          />
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="academy-player-sidebar-lectures">
              <h3>{isAdminUser ? "강의 목록" : "수강/미리보기 강의"}</h3>
              <div className="academy-player-list">
                {playableVideos.map((video) => {
                  const isActive = video.id === activeVideo.id;
                  const videoExpiry = video.isPurchased
                    ? calcEnrollmentExpiry(
                        store.orders,
                        video.productId || video.id,
                        video.period
                      )
                    : null;
                  const videoTotalSec = calcCourseTotalSec(video.chapters || []);
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
                          {videoTotalSec > 0 ? ` · ${formatTotalDuration(videoTotalSec)}` : ""}
                        </span>
                        {!video.isPurchased ? (
                          <span className="academy-list-expiry is-preview">미리보기</span>
                        ) : null}
                        {videoExpiry?.type === "timed" ? (
                          <span
                            className={`academy-list-expiry ${
                              videoExpiry.daysLeft <= 0
                                ? "is-expired"
                                : videoExpiry.daysLeft <= 7
                                ? "is-urgent"
                                : videoExpiry.daysLeft <= 30
                                ? "is-warning"
                                : ""
                            }`}
                          >
                            {videoExpiry.daysLeft <= 0
                              ? "만료됨"
                              : `D-${videoExpiry.daysLeft}`}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </aside>
        </section>

        {/* Q&A 섹션 */}
        <section className="academy-qna-section">
          <h2>강의 Q&A</h2>

          {store.currentUser ? (
            <form className="qna-post-form" onSubmit={handleQnaSubmit}>
              <input
                className="qna-input"
                type="text"
                placeholder="질문 제목"
                value={qnaForm.title}
                onChange={(e) => setQnaForm((prev) => ({ ...prev, title: e.target.value }))}
                required
              />
              <textarea
                className="qna-textarea"
                placeholder="질문 내용을 입력하세요"
                rows={4}
                value={qnaForm.content}
                onChange={(e) => setQnaForm((prev) => ({ ...prev, content: e.target.value }))}
                required
              />
              <div className="qna-form-footer">
                <label className="qna-secret-check">
                  <input
                    type="checkbox"
                    checked={qnaForm.isSecret}
                    onChange={(e) => setQnaForm((prev) => ({ ...prev, isSecret: e.target.checked }))}
                  />
                  비공개 질문
                </label>
                <button type="submit" className="pill-button small" disabled={qnaSubmitting}>
                  {qnaSubmitting ? "등록 중..." : "질문 등록"}
                </button>
              </div>
              {qnaError ? <p className="qna-error">{qnaError}</p> : null}
            </form>
          ) : (
            <p className="qna-login-notice">질문을 등록하려면 로그인해 주세요.</p>
          )}

          <div className="qna-list">
            {qnaLoading ? (
              <p className="qna-loading">불러오는 중...</p>
            ) : qnaList.length === 0 ? (
              <p className="qna-empty">아직 등록된 질문이 없습니다.</p>
            ) : (
              qnaList.map((post) => {
                const isExpanded = expandedPosts[post.id];
                const isMyPost = store.currentUser && String(post.userId) === String(store.currentUser.id);
                const isAdmin = isAdminStaff(store.currentUser);

                return (
                  <div key={post.id} className="qna-post">
                    <div
                      className="qna-post-header"
                      onClick={() => setExpandedPosts((prev) => ({ ...prev, [post.id]: !prev[post.id] }))}
                    >
                      <div className="qna-post-meta">
                        <span className="qna-post-author">{post.isSecret && !isMyPost && !isAdmin ? "비공개" : post.userName}</span>
                        {post.isSecret ? <span className="qna-secret-badge">비공개</span> : null}
                        <span className="qna-post-date">{new Date(post.createdAt).toLocaleDateString("ko-KR")}</span>
                        {post.replies?.length > 0 ? <span className="qna-reply-count">답변 {post.replies.length}</span> : null}
                      </div>
                      <strong className="qna-post-title">{post.title}</strong>
                      <span className="qna-toggle">{isExpanded ? "▲" : "▼"}</span>
                    </div>

                    {isExpanded ? (
                      <div className="qna-post-body">
                        {post.hidden ? (
                          <p className="qna-hidden-notice">비공개 질문입니다.</p>
                        ) : (
                          <p className="qna-post-content">{post.content}</p>
                        )}

                        {(isMyPost || isAdmin) ? (
                          <button type="button" className="qna-delete-btn" onClick={() => handleDeleteQnaPost(post.id)}>
                            질문 삭제
                          </button>
                        ) : null}

                        <div className="qna-replies">
                          {post.replies?.map((reply) => {
                            const isMyReply = store.currentUser && String(reply.userId) === String(store.currentUser.id);
                            return (
                              <div key={reply.id} className={`qna-reply ${reply.isAdmin ? "is-admin" : ""}`}>
                                <div className="qna-reply-meta">
                                  <span className="qna-reply-author">
                                    {reply.isAdmin ? "강사/관리자" : reply.userName}
                                  </span>
                                  <span className="qna-post-date">{new Date(reply.createdAt).toLocaleDateString("ko-KR")}</span>
                                </div>
                                <p className="qna-reply-content">{reply.content}</p>
                                {(isMyReply || isAdmin) ? (
                                  <button type="button" className="qna-delete-btn" onClick={() => handleDeleteQnaReply(reply.id)}>
                                    삭제
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>

                        {store.currentUser ? (
                          <div className="qna-reply-form">
                            <textarea
                              className="qna-textarea small"
                              placeholder="답변을 입력하세요"
                              rows={3}
                              value={replyForms[post.id] || ""}
                              onChange={(e) => setReplyForms((prev) => ({ ...prev, [post.id]: e.target.value }))}
                            />
                            <button
                              type="button"
                              className="ghost-button small-ghost"
                              disabled={replySubmitting[post.id]}
                              onClick={() => handleReplySubmit(post.id)}
                            >
                              {replySubmitting[post.id] ? "등록 중..." : "답변 등록"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {resumeDialog ? (
        <div className="resume-dialog-overlay" onClick={() => setResumeDialog(null)}>
          <div className="resume-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="resume-dialog-info">
              <strong>{formatSeconds(resumeDialog.resumeTime)}</strong> 까지 시청한 기록이 있습니다.
            </p>
            <p>이어서 재생하시겠습니까?</p>
            <div className="resume-dialog-actions">
              <button
                className="pill-button small"
                type="button"
                onClick={() => handleResumeChoice("resume")}
              >
                예
              </button>
              <button
                className="ghost-button small-ghost"
                type="button"
                onClick={() => handleResumeChoice("restart")}
              >
                아니요
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

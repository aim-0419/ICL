// 파일 역할: 강의 목록과 관리자 강의 등록/수정 기능을 함께 제공하는 아카데미 페이지 컴포넌트입니다.
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "../../../shared/components/PageLayout.jsx";
import { useSeoMeta } from "../../../shared/hooks/useSeoMeta.js";
import { canRegisterLecture } from "../../../shared/auth/userRoles.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { getDiscountRate } from "../data/academyVideos.js";
import { 
  createAcademyVideo,
  deleteAcademyVideo,
  listAcademyInstructors,
  resolveAcademyMediaUrl,
  setAcademyVideoVisibility,
  updateAcademyVideo,
  uploadAcademyAsset,
} from "../api/academyApi.js";

const DEFAULT_CATEGORY_TABS = ["전체", "입문", "초급", "중급", "고급"];
const LECTURE_CATEGORIES = ["입문", "초급", "중급", "고급"];
const LECTURE_BADGES = ["", "New", "Hot"];
const MAX_VIDEO_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

// 함수 역할: 강의 등록 폼의 기본 입력값을 생성합니다.
function createEmptyLectureForm() {
  return {
    id: "",
    title: "",
    instructor: "",
    category: "입문",
    salePrice: "",
    originalPrice: "",
    period: "",
    badge: "",
    publishDate: "",
    publishTime: "",
    description: "",
  };
}

// 함수 역할: 안전한 number 값으로 안전하게 변환합니다.
function toSafeNumber(value, fallback = 0) {
  const parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

// 컴포넌트 역할: 교육영상 썸네일이 없거나 로딩 실패해도 카드가 깨져 보이지 않도록 대체 화면을 표시합니다.
function AcademyVideoThumbnail({ video }) {
  const [hasImageError, setHasImageError] = useState(false);
  const title = video?.title || "교육 영상";
  const imageSrc = resolveAcademyMediaUrl(video?.image);
  const shouldShowImage = Boolean(imageSrc) && !hasImageError;

  return (
    <div className="academy-video-thumb">
      {shouldShowImage ? (
        <img
          src={imageSrc}
          alt={`${title} 썸네일`}
          loading="lazy"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <div className="academy-video-thumb-fallback" aria-label={`${title} 썸네일 없음`}>
          <span>16:9</span>
          <strong>{title}</strong>
        </div>
      )}
    </div>
  );
}

// 함수 역할: 교육 영상 1개 등록에 필요한 내부 영상 파일 상태를 생성합니다.
function createEmptyVideoInput() {
  return {
    id: "",
    durationSec: 0,
    existingVideoPath: "",
    file: null,
  };
}

// 함수 역할: 재생 시간을 관리자 화면에 보여주기 좋은 문구로 변환합니다.
function formatDurationSeconds(secondsValue) {
  const totalSec = Math.max(0, Math.round(Number(secondsValue) || 0));
  if (!totalSec) return "--:--";
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return `${hours}시간 ${restMinutes}분 ${seconds}초`;
  }
  return `${minutes}분 ${seconds}초`;
}

// 함수 역할: 업로드한 파일 크기를 사람이 읽기 좋은 단위로 변환합니다.
function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "--";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

// 함수 역할: publish at to 폼 문자열이나 페이로드를 코드에서 쓰기 쉬운 구조로 파싱합니다.
function parsePublishAtToForm(publishAt) {
  const source = String(publishAt || "").trim();
  if (!source) return { publishDate: "", publishTime: "" };

  const parsed = parsePublishAtDate(source);
  if (parsed) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    const hour = String(parsed.getHours()).padStart(2, "0");
    const minute = String(parsed.getMinutes()).padStart(2, "0");
    return {
      publishDate: `${year}-${month}-${day}`,
      publishTime: `${hour}:${minute}`,
    };
  }

  const normalized = source
    .replace("T", " ")
    .replace(/\.\d+$/, "")
    .replace(/Z$/, "")
    .trim();
  const [datePart = "", timePart = ""] = normalized.split(" ");
  return { publishDate: datePart, publishTime: timePart ? timePart.slice(0, 5) : "" };
}

// 함수 역할: publish at 날짜 문자열이나 페이로드를 코드에서 쓰기 쉬운 구조로 파싱합니다.
function parsePublishAtDate(publishAt) {
  const source = String(publishAt || "").trim();
  if (!source) return null;

  const directParsed = new Date(source);
  if (!Number.isNaN(directParsed.getTime())) {
    return directParsed;
  }

  const normalized = source.replace(" ", "T").replace(/\.\d+$/, "");
  const candidates = [
    normalized,
    normalized.length === 16 ? `${normalized}:00` : normalized,
    normalized.endsWith("Z") ? normalized : `${normalized}Z`,
  ];

  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

// 함수 역할: publish schedule label 값을 화면에 보여주기 좋은 문구로 변환합니다.
function formatPublishScheduleLabel(publishAt) {
  const parsed = parsePublishAtDate(publishAt);
  if (!parsed) return "일시 미확인";
  return parsed.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 컴포넌트 역할: 강의 목록과 관리자 강의 등록/수정 기능을 함께 제공하는 아카데미 페이지 컴포넌트입니다.
export function AcademyPage() {
  useSeoMeta({
    title: "교육 영상",
    description: "이끌림 필라테스 교육 영상. 필라테스 입문부터 전문가 과정까지 온라인으로 수강하세요.",
  });
  const navigate = useNavigate();
  const store = useAppStore();
  const canCreateLecture = canRegisterLecture(store.currentUser);

  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [query, setQuery] = useState("");

  const [lectureForm, setLectureForm] = useState(createEmptyLectureForm());
  const [videoInput, setVideoInput] = useState(createEmptyVideoInput());
  const [videoMeta, setVideoMeta] = useState({ durationSec: 0, fileSize: 0 });
  const [isVideoDragActive, setIsVideoDragActive] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [autoThumbnailFile, setAutoThumbnailFile] = useState(null);
  const [detailImageFile, setDetailImageFile] = useState(null);
  const [detailText, setDetailText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState({ type: "", text: "" });
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [isReservedPanelOpen, setIsReservedPanelOpen] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState("");
  const [deletingVideoId, setDeletingVideoId] = useState("");
  const [visibilityVideoId, setVisibilityVideoId] = useState("");
  const [instructorLookup, setInstructorLookup] = useState({
    checked: false,
    exactMatch: false,
    items: [],
    message: "",
    loading: false,
  });

  function resetLectureEditorState() {
    setLectureForm(createEmptyLectureForm());
    setVideoInput(createEmptyVideoInput());
    setVideoMeta({ durationSec: 0, fileSize: 0 });
    setIsVideoDragActive(false);
    setImageFile(null);
    setAutoThumbnailFile(null);
    setDetailImageFile(null);
    setDetailText("");
    setEditingVideoId("");
    setInstructorLookup({
      checked: false,
      exactMatch: false,
      items: [],
      message: "",
      loading: false,
    });
  }

  const videos = Array.isArray(store.academyVideos) ? store.academyVideos : [];

  const categories = useMemo(() => {
    const dynamic = new Set(videos.map((video) => String(video.category || "").trim()).filter(Boolean));
    const combined = [...DEFAULT_CATEGORY_TABS];

    for (const category of dynamic) {
      if (!combined.includes(category)) {
        combined.push(category);
      }
    }

    return combined;
  }, [videos]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredVideos = videos.filter((video) => {
    if (selectedCategory !== "전체" && video.category !== selectedCategory) return false;
    if (!normalizedQuery) return true;
    return `${video.title} ${video.instructor} ${video.category}`.toLowerCase().includes(normalizedQuery);
  });
  const reservedVideos = useMemo(() => {
    const nowMs = Date.now();
    const dedupMap = new Map();

    for (const video of videos) {
      const publishDate = parsePublishAtDate(video.publishAt);
      if (!publishDate || publishDate.getTime() <= nowMs) continue;

      const key = [
        String(video.title || "").trim(),
        String(video.instructor || "").trim(),
        publishDate.toISOString(),
      ].join("|");

      if (!dedupMap.has(key)) {
        dedupMap.set(key, { ...video, publishDate });
      }
    }

    return [...dedupMap.values()]
      .map((video) => {
        const publishDate = parsePublishAtDate(video.publishAt);
        return { ...video, publishDate };
      })
      .sort((a, b) => a.publishDate.getTime() - b.publishDate.getTime());
  }, [videos]);
  const isEditMode = Boolean(editingVideoId);

  async function extractVideoMetadata(file) {
    if (!(file instanceof File)) return { durationSec: 0, thumbnailFile: null };

    return new Promise((resolve) => {
      const video = document.createElement("video");
      const objectUrl = URL.createObjectURL(file);

      function cleanup() {
        URL.revokeObjectURL(objectUrl);
        video.removeAttribute("src");
        video.load();
      }

      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        const durationSec = Number.isFinite(video.duration) ? Math.max(0, Math.round(video.duration)) : 0;
        const captureTime = Math.min(Math.max(0.1, durationSec > 2 ? 1 : 0.1), Math.max(0.1, video.duration || 0.1));

        video.currentTime = captureTime;
        video.onseeked = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const context = canvas.getContext("2d");
            context?.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              cleanup();
              resolve({
                durationSec,
                thumbnailFile: blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-thumbnail.jpg`, { type: "image/jpeg" }) : null,
              });
            }, "image/jpeg", 0.86);
          } catch {
            cleanup();
            resolve({ durationSec, thumbnailFile: null });
          }
        };
      };

      video.onerror = () => {
        cleanup();
        resolve({ durationSec: 0, thumbnailFile: null });
      };

      video.src = objectUrl;
    });
  }

  async function handleVideoFileSelected(file) {
    if (!(file instanceof File)) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["mp4", "mov"].includes(extension || "")) {
      setFormMessage({ type: "error", text: "영상 파일은 MP4 또는 MOV 형식만 등록할 수 있습니다." });
      return;
    }
    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      setFormMessage({ type: "error", text: "영상 파일은 최대 5GB까지만 등록할 수 있습니다." });
      return;
    }

    setFormMessage({ type: "", text: "" });
    setVideoInput((prev) => ({ ...prev, file }));
    setVideoMeta({ durationSec: 0, fileSize: file.size });

    const metadata = await extractVideoMetadata(file);
    setVideoInput((prev) => ({ ...prev, durationSec: metadata.durationSec }));
    setVideoMeta({ durationSec: metadata.durationSec, fileSize: file.size });
    setAutoThumbnailFile(metadata.thumbnailFile);
  }

  async function handleLookupInstructor() {
    const keyword = String(lectureForm.instructor || "").trim();
    if (!keyword) {
      setInstructorLookup({
        checked: true,
        exactMatch: false,
        items: [],
        message: "강사명을 입력한 뒤 조회해 주세요.",
        loading: false,
      });
      return;
    }

    try {
      setInstructorLookup((prev) => ({ ...prev, loading: true, message: "" }));
      const result = await listAcademyInstructors(keyword);
      setInstructorLookup({
        checked: true,
        exactMatch: Boolean(result?.exactMatch),
        items: Array.isArray(result?.items) ? result.items : [],
        message: result?.exactMatch
          ? "등록된 강사명입니다."
          : "일치하는 기존 강사명이 없습니다. 신규 강사명으로 등록 가능합니다.",
        loading: false,
      });
    } catch (error) {
      setInstructorLookup({
        checked: true,
        exactMatch: false,
        items: [],
        message: error?.message || "강사 조회에 실패했습니다.",
        loading: false,
      });
    }
  }

  async function handleCreateLecture(event) {
    event.preventDefault();
    if (!canCreateLecture) return;

    const title = String(lectureForm.title || "").trim();
    const salePrice = Math.max(0, Math.round(toSafeNumber(lectureForm.salePrice, 0)));
    const originalPriceInput = Math.round(toSafeNumber(lectureForm.originalPrice, salePrice));
    const originalPrice = Math.max(salePrice, originalPriceInput);
    const publishDate = String(lectureForm.publishDate || "").trim();
    const publishTime = String(lectureForm.publishTime || "").trim();
    const hasPublishDate = Boolean(publishDate);
    const hasPublishTime = Boolean(publishTime);

    if (!title) {
      setFormMessage({ type: "error", text: "영상 제목을 입력해 주세요." });
      return;
    }

    if ((hasPublishDate && !hasPublishTime) || (!hasPublishDate && hasPublishTime)) {
      setFormMessage({ type: "error", text: "예약 등록은 날짜와 시간을 모두 입력해 주세요." });
      return;
    }

    try {
      setIsSubmitting(true);
      setFormMessage({ type: "", text: "" });

      const thumbnailFile = imageFile || autoThumbnailFile;
      const uploadedImagePath = thumbnailFile ? await uploadAcademyAsset(thumbnailFile, "image") : "";
      const uploadedDetailImagePath = detailImageFile ? await uploadAcademyAsset(detailImageFile, "image") : "";
      const detailDescription = String(detailText || "").trim();

      const pendingVideoId = isEditMode
        ? String(editingVideoId || lectureForm.id || "").trim()
        : crypto.randomUUID();

      let resolvedVideoPath = String(videoInput.existingVideoPath || "").trim();
      if (videoInput.file instanceof File) {
        resolvedVideoPath = await uploadAcademyAsset(videoInput.file, "video", pendingVideoId, 1);
      }

      if (!resolvedVideoPath) {
        throw new Error("교육 영상 파일을 등록해 주세요.");
      }

      const uploadedChapters = [
        {
          ...(videoInput.id ? { id: String(videoInput.id) } : {}),
          title,
          description: String(lectureForm.description || "").trim(),
          durationSec: Math.max(0, Math.round(Number(videoInput.durationSec || videoMeta.durationSec || 0))),
          isPreview: false,
          videoPath: resolvedVideoPath,
        },
      ];

      if (isEditMode) {
        const updated = await updateAcademyVideo(editingVideoId, {
          title,
          instructor: String(lectureForm.instructor || "").trim(),
          category: lectureForm.category,
          salePrice,
          originalPrice,
          period: String(lectureForm.period || "").trim(),
          badge: lectureForm.badge,
          publishAt: hasPublishDate && hasPublishTime ? `${publishDate} ${publishTime}:00` : "",
          description: String(lectureForm.description || "").trim(),
          detailDescription,
          ...(uploadedDetailImagePath ? { detailImagePath: uploadedDetailImagePath } : {}),
          ...(uploadedImagePath ? { imagePath: uploadedImagePath } : {}),
          chapters: uploadedChapters,
          videoPath: uploadedChapters[0]?.videoPath || "",
        });

        await Promise.all([store.refreshAcademyVideos?.(), store.refreshProducts?.()]);
        resetLectureEditorState();
        setFormMessage({
          type: "success",
          text: `교육 영상 수정이 완료되었습니다. (${updated?.title || title})`,
        });
        return;
      }

      const created = await createAcademyVideo({
        id: pendingVideoId,
        title,
        instructor: String(lectureForm.instructor || "").trim(),
        category: lectureForm.category,
        salePrice,
        originalPrice,
        period: String(lectureForm.period || "").trim(),
        badge: lectureForm.badge,
        publishAt: hasPublishDate && hasPublishTime ? `${publishDate} ${publishTime}:00` : "",
        description: String(lectureForm.description || "").trim(),
        detailDescription,
        detailImagePath: uploadedDetailImagePath,
        imagePath: uploadedImagePath,
        videoPath: uploadedChapters[0]?.videoPath || "",
        chapters: uploadedChapters,
      });

      await Promise.all([store.refreshAcademyVideos?.(), store.refreshProducts?.()]);
      resetLectureEditorState();
      setFormMessage({
        type: "success",
        text: `교육 영상 등록이 완료되었습니다. (${created?.title || title})`,
      });
    } catch (error) {
      setFormMessage({
        type: "error",
        text: error?.message || (isEditMode ? "교육 영상 수정에 실패했습니다." : "교육 영상 등록에 실패했습니다."),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleStartEditLecture(video) {
    const target = video || {};
    const publishInputs = parsePublishAtToForm(target.publishAt);
    const sourceChapters = Array.isArray(target.chapters) ? target.chapters : [];
    const sourceVideo = sourceChapters[0] || {};
    const durationSec = Math.max(0, Math.round(Number(sourceVideo.durationSec ?? sourceVideo.duration ?? 0)));

    setEditingVideoId(String(target.id || ""));
    setLectureForm({
      id: String(target.id || ""),
      title: String(target.title || ""),
      instructor: String(target.instructor || ""),
      category: LECTURE_CATEGORIES.includes(String(target.category || "")) ? target.category : "입문",
      salePrice: String(Math.max(0, Math.round(toSafeNumber(target.salePrice, 0)))),
      originalPrice: String(Math.max(0, Math.round(toSafeNumber(target.originalPrice, target.salePrice)))),
      period: String(target.period || ""),
      badge: LECTURE_BADGES.includes(String(target.badge || "")) ? target.badge : "",
      publishDate: publishInputs.publishDate,
      publishTime: publishInputs.publishTime,
      description: String(target.description || ""),
    });
    setVideoInput({
      id: String(sourceVideo.id || ""),
      durationSec,
      existingVideoPath: String(sourceVideo.videoUrl || sourceVideo.videoPath || target.videoPath || ""),
      file: null,
    });
    setVideoMeta({ durationSec, fileSize: 0 });
    setImageFile(null);
    setAutoThumbnailFile(null);
    setDetailImageFile(null);
    setDetailText(String(target.detailDescription || target.detailText || ""));
    setInstructorLookup({
      checked: false,
      exactMatch: false,
      items: [],
      message: "",
      loading: false,
    });
    setFormMessage({ type: "", text: "" });
    setIsCreatePanelOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteLecture(video) {
    const videoId = String(video?.id || "").trim();
    if (!videoId) return;

    const confirmed = window.confirm(`"${video?.title || videoId}" 교육 영상을 삭제하시겠습니까?`);
    if (!confirmed) return;

    setDeletingVideoId(videoId);
    try {
      await deleteAcademyVideo(videoId);
      await Promise.all([store.refreshAcademyVideos?.(), store.refreshProducts?.()]);

      if (editingVideoId === videoId) {
        resetLectureEditorState();
        setIsCreatePanelOpen(false);
      }
      setFormMessage({ type: "success", text: "교육 영상 삭제가 완료되었습니다." });
    } catch (error) {
      setFormMessage({ type: "error", text: error?.message || "교육 영상 삭제에 실패했습니다." });
    } finally {
      setDeletingVideoId("");
    }
  }

  async function handleToggleVideoHidden(video) {
    const videoId = String(video?.id || "").trim();
    if (!videoId) return;

    const nextHidden = !Boolean(video?.isHidden);
    const confirmed = window.confirm(
      nextHidden
        ? `"${video?.title || videoId}" 교육 영상을 숨기시겠습니까?\n일반 회원 목록에서 보이지 않게 됩니다.`
        : `"${video?.title || videoId}" 교육 영상 숨김을 해제하시겠습니까?`
    );
    if (!confirmed) return;

    setVisibilityVideoId(videoId);
    try {
      await setAcademyVideoVisibility(videoId, nextHidden);
      await store.refreshAcademyVideos?.();

      if (editingVideoId === videoId && nextHidden) {
        resetLectureEditorState();
        setIsCreatePanelOpen(false);
      }
      setFormMessage({
        type: "success",
        text: nextHidden ? "교육 영상을 숨김 처리했습니다." : "교육 영상 숨김을 해제했습니다.",
      });
    } catch (error) {
      setFormMessage({
        type: "error",
        text: error?.message || "교육 영상 숨김 상태 변경에 실패했습니다.",
      });
    } finally {
      setVisibilityVideoId("");
    }
  }

  return (
    <PageLayout mainClass="content-page academy-catalog-page">
        <section className="content-hero">
          <p className="section-kicker">ICL 교육 영상</p>
          <h1>교육 가이드 영상</h1>
          <p className="section-text">입문부터 고급까지, 체계적인 교육 영상을 확인해 보세요.</p>
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
          <div className="academy-catalog-search-row">
            <label className="academy-catalog-search">
              <span className="visually-hidden">교육 영상 검색</span>
              <input
                type="search"
                placeholder="영상명 / 강사 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {canCreateLecture ? (
              <>
                <button
                  type="button"
                  className={`ghost-button small-ghost academy-reserved-toggle${isReservedPanelOpen ? " active" : ""}`}
                  onClick={() => setIsReservedPanelOpen((prev) => !prev)}
                >
                  {isReservedPanelOpen
                    ? "예약 목록 닫기"
                    : `예약 등록 확인 (${reservedVideos.length})`}
                </button>
                <button
                  type="button"
                  className={`ghost-button small-ghost academy-create-toggle${isCreatePanelOpen ? " active" : ""}`}
                  onClick={() => {
                    setFormMessage({ type: "", text: "" });
                    setIsCreatePanelOpen((prev) => {
                      const next = !prev;
                      if (!next) resetLectureEditorState();
                      return next;
                    });
                  }}
                >
                  {isCreatePanelOpen ? "교육 영상 편집 닫기" : "교육 영상 등록"}
                </button>
              </>
            ) : null}
          </div>
        </section>

        {canCreateLecture && isReservedPanelOpen ? (
          <section className="dashboard-card academy-reserved-panel">
            <div className="academy-reserved-head">
              <h2>예약 등록 교육 영상</h2>
              <span className="academy-reserved-count">{reservedVideos.length}건</span>
            </div>

            {reservedVideos.length ? (
              <div className="academy-reserved-list">
                {reservedVideos.map((video) => (
                  <article key={video.id} className="academy-reserved-item">
                    <div className="academy-reserved-copy">
                      <strong>{video.title}</strong>
                      <p>
                        {video.instructor} · {video.category}
                        {video.isHidden ? " · 숨김 상태" : ""}
                      </p>
                    </div>
                    <div className="academy-reserved-meta">
                      <time dateTime={String(video.publishAt || "")}>
                        {formatPublishScheduleLabel(video.publishAt)}
                      </time>
                      <button
                        type="button"
                        className="ghost-button small-ghost"
                        onClick={() => handleStartEditLecture(video)}
                        disabled={deletingVideoId === video.id}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="ghost-button small-ghost academy-reserved-delete-btn"
                        onClick={() => handleDeleteLecture(video)}
                        disabled={deletingVideoId === video.id}
                      >
                        {deletingVideoId === video.id ? "삭제 중..." : "삭제"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="academy-admin-help-text">현재 예약 등록된 교육 영상이 없습니다.</p>
            )}
          </section>
        ) : null}

        {canCreateLecture && isCreatePanelOpen ? (
          <section className="academy-admin-register">
            <div className="academy-admin-register-head">
              <div>
                <h2>{isEditMode ? "교육 영상 수정" : "교육 영상 등록"}</h2>
                <p>새로운 교육 영상을 등록하고 수강생들에게 제공해보세요.</p>
              </div>
              <nav aria-label="현재 위치">아카데미 &gt; 교육 영상 관리 &gt; {isEditMode ? "교육 영상 수정" : "교육 영상 등록"}</nav>
            </div>

            <form className="admin-lecture-form academy-register-form" onSubmit={handleCreateLecture}>
              <section className="academy-register-section">
                <div className="academy-register-section-title">
                  <span aria-hidden="true">◎</span>
                  <strong>기본 정보</strong>
                </div>
                <div className="academy-register-section-body academy-register-basic-grid">
                  <div className="academy-admin-instructor-block academy-register-field">
                    <span>강사명</span>
                    <div className="academy-admin-instructor-row">
                      <input
                        type="text"
                        value={lectureForm.instructor}
                        onChange={(event) => {
                          setLectureForm((prev) => ({ ...prev, instructor: event.target.value }));
                          setInstructorLookup({
                            checked: false,
                            exactMatch: false,
                            items: [],
                            message: "",
                            loading: false,
                          });
                        }}
                        placeholder="강사명을 입력하고 조회"
                      />
                      <button
                        type="button"
                        className="academy-register-secondary-button academy-admin-instructor-check"
                        onClick={handleLookupInstructor}
                        disabled={instructorLookup.loading}
                      >
                        {instructorLookup.loading ? "조회 중..." : "조회"}
                      </button>
                      {instructorLookup.checked ? (
                        <span
                          className={`academy-admin-instructor-state ${
                            instructorLookup.exactMatch ? "is-ok" : "is-miss"
                          }`}
                          title={instructorLookup.message}
                          aria-label={instructorLookup.message}
                        >
                          {instructorLookup.exactMatch ? "✓" : "!"}
                        </span>
                      ) : null}
                    </div>
                    {instructorLookup.message ? (
                      <small
                        className={`academy-admin-instructor-message ${
                          instructorLookup.exactMatch ? "is-ok" : "is-miss"
                        }`}
                      >
                        {instructorLookup.message}
                      </small>
                    ) : null}
                    {instructorLookup.items.length > 0 ? (
                      <div className="academy-admin-instructor-tags">
                        {instructorLookup.items.map((name) => (
                          <button
                            key={name}
                            type="button"
                            className="academy-admin-instructor-tag"
                            onClick={() => {
                              setLectureForm((prev) => ({ ...prev, instructor: name }));
                              setInstructorLookup((prev) => ({
                                ...prev,
                                checked: true,
                                exactMatch: true,
                                message: "등록된 강사명입니다.",
                              }));
                            }}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <label className="academy-register-field">
                    <span>카테고리</span>
                    <select
                      value={lectureForm.category}
                      onChange={(event) => setLectureForm((prev) => ({ ...prev, category: event.target.value }))}
                    >
                      {LECTURE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="academy-register-field academy-register-price-field">
                    <span>판매가</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={lectureForm.salePrice}
                      onChange={(event) =>
                        setLectureForm((prev) => ({
                          ...prev,
                          salePrice: event.target.value.replace(/[^0-9]/g, ""),
                        }))
                      }
                      placeholder="판매가를 입력하세요"
                    />
                    <em>원</em>
                  </label>

                  <label className="academy-register-field academy-register-price-field">
                    <span>정가 (선택)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={lectureForm.originalPrice}
                      onChange={(event) =>
                        setLectureForm((prev) => ({
                          ...prev,
                          originalPrice: event.target.value.replace(/[^0-9]/g, ""),
                        }))
                      }
                      placeholder="정가를 입력하세요"
                    />
                    <em>원</em>
                  </label>

                  <label className="academy-register-field">
                    <span>수강기간</span>
                    <input
                      type="text"
                      value={lectureForm.period}
                      onChange={(event) => setLectureForm((prev) => ({ ...prev, period: event.target.value }))}
                      placeholder="수강기간을 입력하세요. 예: 90일"
                    />
                  </label>

                  <label className="academy-register-field">
                    <span>예약 등록일자</span>
                    <input
                      type="date"
                      value={lectureForm.publishDate}
                      onChange={(event) => setLectureForm((prev) => ({ ...prev, publishDate: event.target.value }))}
                    />
                  </label>

                  <label className="academy-register-field">
                    <span>배지</span>
                    <select
                      value={lectureForm.badge}
                      onChange={(event) => setLectureForm((prev) => ({ ...prev, badge: event.target.value }))}
                    >
                      {LECTURE_BADGES.map((badge) => (
                        <option key={badge || "none"} value={badge}>
                          {badge || "배지를 선택하세요"}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="academy-register-field">
                    <span>예약 등록시간</span>
                    <input
                      type="time"
                      value={lectureForm.publishTime}
                      onChange={(event) => setLectureForm((prev) => ({ ...prev, publishTime: event.target.value }))}
                    />
                  </label>

                  <label className="academy-register-field academy-register-id-field">
                    <span>강의 ID (선택)</span>
                    <input
                      type="text"
                      value={lectureForm.id}
                      disabled={isEditMode}
                      onChange={(event) => setLectureForm((prev) => ({ ...prev, id: event.target.value }))}
                      placeholder={isEditMode ? "수정 모드에서는 변경할 수 없습니다." : "비우면 자동 생성됩니다."}
                    />
                  </label>
                </div>
              </section>

              <section className="academy-register-section">
                <div className="academy-register-section-title">
                  <span aria-hidden="true">▣</span>
                  <strong>영상 정보</strong>
                  <small>영상 1개를 업로드하면 길이와 파일 용량이 자동으로 입력됩니다.</small>
                </div>
                <div className="academy-register-section-body academy-register-video-grid">
                  <div className="academy-register-video-left">
                    <div className="academy-register-field">
                      <span>영상 파일</span>
                      <label
                        className={`academy-register-upload-box academy-register-video-upload-box${isVideoDragActive ? " is-dragging" : ""}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setIsVideoDragActive(true);
                        }}
                        onDragLeave={() => setIsVideoDragActive(false)}
                        onDrop={(event) => {
                          event.preventDefault();
                          setIsVideoDragActive(false);
                          handleVideoFileSelected(event.dataTransfer.files?.[0]);
                        }}
                      >
                        <input
                          type="file"
                          accept=".mp4,.mov,video/mp4,video/quicktime"
                          onChange={(event) => handleVideoFileSelected(event.target.files?.[0])}
                        />
                        <strong>{videoInput.file ? videoInput.file.name : "교육 영상을 업로드하세요"}</strong>
                        <small>드래그 앤 드롭 또는 클릭해서 파일 선택 · MP4, MOV / 최대 5GB</small>
                      </label>
                    </div>

                    <div className="academy-register-thumb-row">
                      <div className="academy-register-field">
                        <span>썸네일 이미지 (선택)</span>
                        <label className="academy-register-thumbnail-box">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => setImageFile(event.target.files?.[0] || null)}
                          />
                          <span aria-hidden="true">▧</span>
                          <small>{imageFile ? imageFile.name : "권장 사이즈: 1280x720px (16:9)"}</small>
                        </label>
                      </div>
                      <div className="academy-register-thumb-actions">
                        <label className="academy-register-secondary-button">
                          썸네일 업로드
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => setImageFile(event.target.files?.[0] || null)}
                          />
                        </label>
                        <button type="button" className="academy-register-secondary-button" onClick={() => setImageFile(null)}>
                          기본 썸네일 사용
                        </button>
                      </div>
                    </div>
                  </div>

                  <aside className="academy-register-upload-guide">
                    <p>영상이 업로드되면 재생 시간과 썸네일이 자동으로 생성됩니다.</p>
                    <p>썸네일을 업로드하지 않으면 영상 첫 프레임을 기본 썸네일로 사용합니다.</p>
                    <p>안정적인 업로드를 위해 권장 업로드 사이즈는 1920x1080px (16:9) 입니다.</p>
                  </aside>

                  <div className="academy-register-video-meta">
                    <strong>영상 정보 (자동 입력)</strong>
                    <div>
                      <label className="academy-register-field">
                        <span>영상 길이</span>
                        <input type="text" value={formatDurationSeconds(videoMeta.durationSec || videoInput.durationSec)} readOnly />
                      </label>
                      <label className="academy-register-field">
                        <span>파일 용량</span>
                        <input type="text" value={formatFileSize(videoMeta.fileSize || videoInput.file?.size)} readOnly />
                      </label>
                    </div>
                  </div>

                  <label className="academy-register-field academy-register-title-field">
                    <span>영상 제목</span>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={lectureForm.title}
                      onChange={(event) => setLectureForm((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="영상 제목을 입력하세요"
                    />
                    <small>{String(lectureForm.title || "").length}/100</small>
                  </label>
                </div>
              </section>

              <section className="academy-register-section">
                <div className="academy-register-section-title">
                  <span aria-hidden="true">▦</span>
                  <strong>영상 설명</strong>
                </div>
                <div className="academy-register-section-body">
                  <label className="academy-register-field academy-register-description-field">
                    <span>영상 설명</span>
                    <textarea
                      rows={4}
                      maxLength={1000}
                      value={lectureForm.description}
                      onChange={(event) => setLectureForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="영상에 대한 설명을 입력하세요."
                    />
                    <small>{String(lectureForm.description || "").length}/1000</small>
                  </label>
                </div>
              </section>

              <section className="academy-register-section">
                <div className="academy-register-section-title">
                  <span aria-hidden="true">▧</span>
                  <strong>(선택) 추가 정보</strong>
                </div>
                <div className="academy-register-section-body academy-register-extra-grid">
                  <label className="academy-register-field academy-register-detail-image">
                    <span>상세 이미지 (선택)</span>
                    <label className="academy-register-upload-box">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => setDetailImageFile(event.target.files?.[0] || null)}
                      />
                      <strong>이미지 업로드</strong>
                      <small>{detailImageFile ? detailImageFile.name : "JPG, PNG 파일만 가능"}</small>
                    </label>
                  </label>
                  <label className="academy-register-field academy-register-detail-copy">
                    <span>상세 내용 (선택)</span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={detailText}
                      onChange={(event) => setDetailText(event.target.value)}
                      placeholder="교육 구성, 준비사항, 주의사항, 추천 대상 등을 입력하세요."
                    />
                    <small>{String(detailText || "").length}/2000</small>
                  </label>
                </div>
              </section>

              <p className="academy-admin-help-text">수강기간은 구매일이 아니라 첫 영상 수강일을 기준으로 시작됩니다.</p>
              <p className="academy-admin-help-text">예약 일시를 비워두면 즉시 등록됩니다.</p>

              {formMessage.text ? <p className={`admin-form-message ${formMessage.type}`}>{formMessage.text}</p> : null}

              <div className="academy-register-actions">
                <button
                  type="button"
                  className="academy-register-cancel"
                  onClick={() => {
                    resetLectureEditorState();
                    setIsCreatePanelOpen(false);
                  }}
                >
                  취소
                </button>
                <button className="academy-register-submit" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (isEditMode ? "수정 중..." : "등록 중...") : isEditMode ? "수정하기" : "등록하기"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="academy-catalog-grid" aria-live="polite">
          {filteredVideos.length ? (
            filteredVideos.map((video) => {
              const discountRate = getDiscountRate(video.originalPrice, video.salePrice);
              const normalizedBadge = (video.badge || "").toLowerCase();
              const badgeTone = normalizedBadge === "hot" ? "is-hot" : normalizedBadge === "new" ? "is-new" : "";
              const showBadge = badgeTone !== "";
              const isDeleting = deletingVideoId === String(video.id);
              const isTogglingVisibility = visibilityVideoId === String(video.id);

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
                  <AcademyVideoThumbnail video={video} />
                  <div className="academy-video-body">
                    <h3>{video.title}</h3>
                    <p className="academy-video-instructor">{video.instructor}</p>
                    <div className="academy-video-pricing">
                      <span className="academy-price-old">{store.formatCurrency(video.originalPrice)}</span>
                      <strong className="academy-price-sale">{store.formatCurrency(video.salePrice)}</strong>
                      {discountRate > 0 ? <em>할인 {discountRate}%</em> : null}
                    </div>
                    <div className="academy-video-meta-row">
                      <div className="academy-video-meta">
                        <span>★ {video.rating}</span>
                        <span>({video.reviews})</span>
                      </div>
                      <div className="academy-video-tags">
                        {showBadge ? <span className={`academy-tag academy-badge ${badgeTone}`}>{video.badge}</span> : null}
                        <span className="academy-tag outline">{video.category}</span>
                        {canCreateLecture && video.isHidden ? <span className="academy-tag academy-hidden-tag">숨김</span> : null}
                      </div>
                      {!canCreateLecture ? (
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
                      ) : null}
                    </div>
                    {canCreateLecture ? (
                      <div className="academy-video-admin-actions">
                        <button
                          type="button"
                          className="ghost-button small-ghost academy-video-admin-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStartEditLecture(video);
                          }}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="ghost-button small-ghost academy-video-admin-btn danger"
                          disabled={isDeleting || isTogglingVisibility}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteLecture(video);
                          }}
                        >
                          {isDeleting ? "삭제 중..." : "삭제"}
                        </button>
                        <button
                          type="button"
                          className="ghost-button small-ghost academy-video-admin-btn"
                          disabled={isDeleting || isTogglingVisibility}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleVideoHidden(video);
                          }}
                        >
                          {isTogglingVisibility ? "처리 중..." : video.isHidden ? "숨김 해제" : "숨김"}
                        </button>
                      </div>
                    ) : null}
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
    </PageLayout>
  );
}

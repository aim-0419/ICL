import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { canRegisterLecture } from "../../../shared/auth/userRoles.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { getDiscountRate } from "../data/academyVideos.js";
import {
  createAcademyVideo,
  listAcademyInstructors,
  resolveAcademyMediaUrl,
  uploadAcademyAsset,
} from "../api/academyApi.js";

const DEFAULT_CATEGORY_TABS = ["전체", "입문", "초급", "중급", "고급"];
const LECTURE_CATEGORIES = ["입문", "초급", "중급", "고급"];
const LECTURE_BADGES = ["", "New", "Hot"];

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createEmptyChapter(index) {
  return {
    key: `chapter-${Date.now()}-${index}`,
    title: `${index + 1}차시`,
    description: "",
    durationSec: "",
    isPreview: false,
    file: null,
  };
}

function normalizeFileName(file) {
  if (!(file instanceof File)) return "";
  return String(file.name || "").trim();
}

export function AcademyPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const canCreateLecture = canRegisterLecture(store.currentUser);

  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [query, setQuery] = useState("");

  const [lectureForm, setLectureForm] = useState({
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
  });
  const [chapterInputs, setChapterInputs] = useState([createEmptyChapter(0)]);
  const [imageFile, setImageFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState({ type: "", text: "" });
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [instructorLookup, setInstructorLookup] = useState({
    checked: false,
    exactMatch: false,
    items: [],
    message: "",
    loading: false,
  });

  const dragSrcIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  function handleChapterDragStart(index) {
    dragSrcIndexRef.current = index;
  }

  function handleChapterDragOver(event, index) {
    event.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  }

  function handleChapterDrop(event, dropIndex) {
    event.preventDefault();
    const srcIndex = dragSrcIndexRef.current;
    if (srcIndex === null || srcIndex === dropIndex) {
      setDragOverIndex(null);
      return;
    }
    setChapterInputs((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(srcIndex, 1);
      updated.splice(dropIndex, 0, moved);
      return updated;
    });
    dragSrcIndexRef.current = null;
    setDragOverIndex(null);
  }

  function handleChapterDragEnd() {
    dragSrcIndexRef.current = null;
    setDragOverIndex(null);
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

  function updateChapter(index, patch) {
    setChapterInputs((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch,
            }
          : item
      )
    );
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
      setFormMessage({ type: "error", text: "커리큘럼명을 입력해 주세요." });
      return;
    }

    if ((hasPublishDate && !hasPublishTime) || (!hasPublishDate && hasPublishTime)) {
      setFormMessage({ type: "error", text: "예약 등록은 날짜와 시간을 모두 입력해 주세요." });
      return;
    }

    if (!chapterInputs.some((chapter) => chapter.file instanceof File)) {
      setFormMessage({ type: "error", text: "최소 1개 이상의 차시 영상을 등록해 주세요." });
      return;
    }

    try {
      setIsSubmitting(true);
      setFormMessage({ type: "", text: "" });

      const uploadedChapters = [];
      for (const [index, chapter] of chapterInputs.entries()) {
        if (!(chapter.file instanceof File)) continue;
        const uploadedVideoPath = await uploadAcademyAsset(chapter.file, "video");
        uploadedChapters.push({
          title: String(chapter.title || "").trim() || `${index + 1}차시`,
          description: String(chapter.description || "").trim(),
          durationSec: Math.max(0, Math.round(toSafeNumber(chapter.durationSec, 0))),
          isPreview: Boolean(chapter.isPreview),
          videoPath: uploadedVideoPath,
        });
      }

      if (!uploadedChapters.length) {
        throw new Error("업로드된 차시 영상이 없습니다.");
      }

      const uploadedImagePath = imageFile ? await uploadAcademyAsset(imageFile, "image") : "";

      const created = await createAcademyVideo({
        id: String(lectureForm.id || "").trim(),
        title,
        instructor: String(lectureForm.instructor || "").trim(),
        category: lectureForm.category,
        salePrice,
        originalPrice,
        period: String(lectureForm.period || "").trim(),
        badge: lectureForm.badge,
        publishAt: hasPublishDate && hasPublishTime ? `${publishDate} ${publishTime}:00` : "",
        description: String(lectureForm.description || "").trim(),
        imagePath: uploadedImagePath,
        videoPath: uploadedChapters[0]?.videoPath || "",
        chapters: uploadedChapters,
      });

      await Promise.all([store.refreshAcademyVideos?.(), store.refreshProducts?.()]);

      setLectureForm({
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
      });
      setChapterInputs([createEmptyChapter(0)]);
      setImageFile(null);
      setInstructorLookup({
        checked: false,
        exactMatch: false,
        items: [],
        message: "",
        loading: false,
      });

      setFormMessage({
        type: "success",
        text: `커리큘럼 등록이 완료되었습니다. (${created?.title || title})`,
      });
    } catch (error) {
      setFormMessage({ type: "error", text: error?.message || "커리큘럼 등록에 실패했습니다." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page academy-catalog-page">
        <section className="content-hero">
          <p className="section-kicker">ICL 교육 영상</p>
          <h1>교육 가이드 영상</h1>
          <p className="section-text">입문부터 고급까지, 체계적인 커리큘럼을 확인해 보세요.</p>
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
                placeholder="커리큘럼명 / 강사 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {canCreateLecture ? (
              <button
                type="button"
                className={`ghost-button small-ghost academy-create-toggle${isCreatePanelOpen ? " active" : ""}`}
                onClick={() => {
                  setFormMessage({ type: "", text: "" });
                  setIsCreatePanelOpen((prev) => !prev);
                }}
              >
                {isCreatePanelOpen ? "강의 등록 닫기" : "강의 등록"}
              </button>
            ) : null}
          </div>
        </section>

        {canCreateLecture && isCreatePanelOpen ? (
          <section className="dashboard-card academy-admin-create">
            <h2>커리큘럼 등록</h2>
            <form className="admin-lecture-form" onSubmit={handleCreateLecture}>
              <div className="academy-admin-form-grid">
                <label>
                  강의 ID (선택)
                  <input
                    type="text"
                    value={lectureForm.id}
                    onChange={(event) => setLectureForm((prev) => ({ ...prev, id: event.target.value }))}
                    placeholder="비우면 자동 생성"
                  />
                </label>

                <label>
                  커리큘럼명
                  <input
                    type="text"
                    required
                    value={lectureForm.title}
                    onChange={(event) => setLectureForm((prev) => ({ ...prev, title: event.target.value }))}
                  />
                </label>

                <div className="academy-admin-instructor-block">
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
                      className="ghost-button small-ghost academy-admin-instructor-check"
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

                <label>
                  카테고리
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

                <label>
                  판매가
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
                  />
                </label>

                <label>
                  정가
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
                  />
                </label>

                <label>
                  수강기간
                  <input
                    type="text"
                    value={lectureForm.period}
                    onChange={(event) => setLectureForm((prev) => ({ ...prev, period: event.target.value }))}
                    placeholder="예: 90일"
                  />
                </label>

                <label>
                  예약 등록일자
                  <input
                    type="date"
                    value={lectureForm.publishDate}
                    onChange={(event) => setLectureForm((prev) => ({ ...prev, publishDate: event.target.value }))}
                  />
                </label>

                <label>
                  예약 등록시간
                  <input
                    type="time"
                    value={lectureForm.publishTime}
                    onChange={(event) => setLectureForm((prev) => ({ ...prev, publishTime: event.target.value }))}
                  />
                </label>

                <label>
                  배지
                  <select
                    value={lectureForm.badge}
                    onChange={(event) => setLectureForm((prev) => ({ ...prev, badge: event.target.value }))}
                  >
                    {LECTURE_BADGES.map((badge) => (
                      <option key={badge || "none"} value={badge}>
                        {badge || "없음"}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  썸네일 이미지
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setImageFile(event.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <section className="academy-admin-chapter-section">
                <div className="academy-admin-chapter-head">
                  <strong>커리큘럼 차시 구성</strong>
                  <button
                    type="button"
                    className="ghost-button small-ghost"
                    onClick={() => setChapterInputs((prev) => [...prev, createEmptyChapter(prev.length)])}
                  >
                    차시 추가
                  </button>
                </div>

                <div className="academy-admin-chapter-list">
                  {chapterInputs.map((chapter, index) => (
                    <div
                      key={chapter.key}
                      className={`academy-admin-chapter-row${dragOverIndex === index ? " is-drag-over" : ""}`}
                      draggable
                      onDragStart={() => handleChapterDragStart(index)}
                      onDragOver={(e) => handleChapterDragOver(e, index)}
                      onDrop={(e) => handleChapterDrop(e, index)}
                      onDragEnd={handleChapterDragEnd}
                    >
                      <span className="chapter-drag-handle" title="드래그하여 순서 변경" aria-hidden="true">
                        ⠿
                      </span>
                      <span className="chapter-order-badge">{index + 1}차시</span>
                      <label>
                        차시명
                        <input
                          type="text"
                          value={chapter.title}
                          onChange={(event) => updateChapter(index, { title: event.target.value })}
                          placeholder={`${index + 1}차시`}
                        />
                      </label>

                      <label>
                        영상 길이(초)
                        <input
                          type="text"
                          inputMode="numeric"
                          value={chapter.durationSec}
                          onChange={(event) =>
                            updateChapter(index, { durationSec: event.target.value.replace(/[^0-9]/g, "") })
                          }
                          placeholder="예: 1200"
                        />
                      </label>

                      <label className="academy-admin-chapter-preview">
                        <input
                          type="checkbox"
                          checked={Boolean(chapter.isPreview)}
                          onChange={(event) => updateChapter(index, { isPreview: event.target.checked })}
                        />
                        미리보기 허용
                      </label>

                      <label className="academy-admin-chapter-description">
                        차시 설명
                        <textarea
                          rows={2}
                          value={chapter.description}
                          onChange={(event) => updateChapter(index, { description: event.target.value })}
                        />
                      </label>

                      <label>
                        영상 파일
                        <input
                          type="file"
                          accept="video/*"
                          onChange={(event) => updateChapter(index, { file: event.target.files?.[0] || null })}
                        />
                        {chapter.file ? (
                          <small className="academy-admin-file-name">{normalizeFileName(chapter.file)}</small>
                        ) : null}
                      </label>

                      <button
                        type="button"
                        className="academy-admin-chapter-remove"
                        disabled={chapterInputs.length <= 1}
                        onClick={() =>
                          setChapterInputs((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                        }
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <label>
                커리큘럼 소개
                <textarea
                  rows={4}
                  value={lectureForm.description}
                  onChange={(event) => setLectureForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </label>

              <p className="academy-admin-help-text">
                수강기간은 구매일이 아니라 첫 영상 수강일을 기준으로 시작됩니다.
              </p>
              <p className="academy-admin-help-text">예약 일시를 비워두면 즉시 등록됩니다.</p>

              {formMessage.text ? <p className={`admin-form-message ${formMessage.type}`}>{formMessage.text}</p> : null}

              <button className="pill-button small" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "등록 중..." : "커리큘럼 등록"}
              </button>
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
                    <img src={resolveAcademyMediaUrl(video.image)} alt={video.title} />
                  </div>
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
            })
          ) : (
            <article className="academy-empty-state">
              <h3>검색 결과가 없습니다.</h3>
              <p>검색어를 바꾸거나 다른 카테고리를 선택해 주세요.</p>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}

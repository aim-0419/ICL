import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout.jsx";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { apiRequest } from "../../../shared/api/client.js";

const ROLE_SUFFIX = {
  admin0: " 스튜디오 오너님",
  admin1: " 관리자",
  staff: " 스태프",
  instructor: " 강사",
};

const TARGET_LABEL = { active: "유효", expired: "만료", both: "전체" };

function toDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}. ${m}. ${day}. (${days[d.getDay()]}) ${h}:${min}`;
}

function toPeriodPart(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}. ${m}. ${day} ${h}:${min}`;
}

function formatPeriod(notice) {
  if (notice.postTiming === "unlimited") return "제한없음";
  if (notice.postTiming === "none") return "미설정";
  const start = toPeriodPart(notice.startAt);
  const end = toPeriodPart(notice.endAt);
  if (!start && !end) return "-";
  return `${start} ~\n${end}`;
}

function formatAuthor(notice) {
  const name = notice.authorName || "-";
  const suffix = ROLE_SUFFIX[notice.authorRole] || "";
  return name + suffix;
}

function toInputDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  title: "",
  content: "",
  popupEnabled: false,
  pinned: false,
  targetActive: true,
  targetExpired: false,
  postTiming: "now",
  startDate: "",
  endDate: "",
  images: [],
};

export function AdminNoticePage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [view, setView] = useState("list");
  const [editingNotice, setEditingNotice] = useState(null);

  // 목록 상태
  const [notices, setNotices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // 폼 상태
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadNotices = useCallback(
    async (search = searchQuery, pageNum = page) => {
      setLoading(true);
      setErrorMessage("");
      try {
        const params = new URLSearchParams({ page: pageNum, pageSize: PAGE_SIZE });
        if (search.trim()) params.set("search", search.trim());
        const result = await apiRequest(`/studio/admin/notices?${params}`);
        setNotices(Array.isArray(result?.notices) ? result.notices : []);
        setTotal(Number(result?.total ?? 0));
      } catch (error) {
        setErrorMessage(error.message || "공지 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, page]
  );

  useEffect(() => {
    if (view === "list") {
      loadNotices(searchQuery, page);
    }
  }, [view, page]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingNotice(null);
    setFormError("");
    setView("form");
  }

  function openEdit(notice) {
    setForm({
      title: notice.title || "",
      content: notice.content || "",
      popupEnabled: Boolean(notice.popupEnabled),
      pinned: Boolean(notice.pinned),
      targetActive: notice.target === "active" || notice.target === "both",
      targetExpired: notice.target === "expired" || notice.target === "both",
      postTiming: notice.postTiming || "now",
      startDate: toInputDate(notice.startAt),
      endDate: toInputDate(notice.endAt),
      images: Array.isArray(notice.images) ? notice.images : [],
    });
    setEditingNotice(notice);
    setFormError("");
    setView("form");
  }

  function goBack() {
    setView("list");
    setEditingNotice(null);
    loadNotices(searchQuery, page);
  }

  async function handleDelete() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`선택한 공지 ${ids.length}건을 삭제하시겠습니까?`)) return;
    try {
      await apiRequest("/studio/admin/notices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setSelectedIds(new Set());
      loadNotices(searchQuery, page);
    } catch (error) {
      alert(error.message || "삭제에 실패했습니다.");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.title.trim()) { setFormError("제목을 입력해 주세요."); return; }
    if (!form.targetActive && !form.targetExpired) { setFormError("공지 대상을 하나 이상 선택해 주세요."); return; }

    const target =
      form.targetActive && form.targetExpired ? "both"
      : form.targetActive ? "active"
      : "expired";

    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      popupEnabled: form.popupEnabled,
      pinned: form.pinned,
      target,
      postTiming: form.postTiming,
      startAt: form.postTiming === "scheduled" && form.startDate ? new Date(form.startDate).toISOString() : null,
      endAt: (form.postTiming === "now" || form.postTiming === "scheduled") && form.endDate ? new Date(form.endDate).toISOString() : null,
      images: form.images,
    };

    setSubmitting(true);
    setFormError("");
    try {
      if (editingNotice) {
        await apiRequest(`/studio/admin/notices/${editingNotice.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("/studio/admin/notices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      goBack();
    } catch (error) {
      setFormError(error.message || "저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const allChecked = notices.length > 0 && selectedIds.size === notices.length;

  function toggleAll(checked) {
    setSelectedIds(checked ? new Set(notices.map((n) => n.id)) : new Set());
  }

  function toggleOne(id, checked) {
    const next = new Set(selectedIds);
    checked ? next.add(id) : next.delete(id);
    setSelectedIds(next);
  }


  /* ── 목록 뷰 ── */
  if (view === "list") {
    return (
      <AdminLayout appClass="admin-notice-app" userName={currentUserName}>
        <div className="admin-notice-content">
            {/* 페이지 헤더 */}
            <div className="admin-notice-page-header">
              <h1 className="admin-notice-h1">게시판</h1>
            </div>

                {/* 툴바 */}
                <div className="admin-notice-toolbar">
                  <span className="admin-notice-count">총 {total.toLocaleString("ko-KR")}개</span>
                  <button
                    type="button"
                    className="admin-notice-del-btn"
                    disabled={selectedIds.size === 0}
                    onClick={handleDelete}
                  >
                    삭제
                  </button>
                </div>

                {/* 검색 */}
                <div className="admin-notice-search-row">
                  <form
                    className="admin-notice-search-form"
                    onSubmit={(e) => { e.preventDefault(); setPage(1); loadNotices(searchQuery, 1); }}
                  >
                    <input
                      type="search"
                      placeholder="제목 or 작성자"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </form>
                </div>

                {errorMessage ? <p className="admin-notice-error-msg">{errorMessage}</p> : null}

                {/* 테이블 */}
                <div className="admin-notice-table-wrap">
                  <table className="admin-notice-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={(e) => toggleAll(e.target.checked)}
                          />
                        </th>
                        <th className="admin-notice-col-date">작성일시</th>
                        <th className="admin-notice-col-title">제목</th>
                        <th className="admin-notice-col-target">회원</th>
                        <th className="admin-notice-col-popup">팝업</th>
                        <th className="admin-notice-col-author">작성자</th>
                        <th className="admin-notice-col-period">게시기간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="admin-notice-empty">불러오는 중...</td>
                        </tr>
                      ) : notices.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="admin-notice-empty">등록된 공지사항이 없습니다.</td>
                        </tr>
                      ) : (
                        notices.map((notice) => (
                          <tr key={notice.id} className={selectedIds.has(notice.id) ? "selected" : ""}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(notice.id)}
                                onChange={(e) => toggleOne(notice.id, e.target.checked)}
                              />
                            </td>
                            <td className="admin-notice-col-date">{toDateTime(notice.createdAt)}</td>
                            <td className="admin-notice-col-title">
                              <button
                                type="button"
                                className="admin-notice-title-link"
                                onClick={() => openEdit(notice)}
                              >
                                {notice.pinned ? <span className="admin-notice-pin-badge">고정</span> : null}
                                {notice.title}
                              </button>
                            </td>
                            <td className="admin-notice-col-target">{TARGET_LABEL[notice.target] || "-"}</td>
                            <td className="admin-notice-col-popup">
                              {notice.popupEnabled ? <span className="admin-notice-popup-y">Y</span> : null}
                            </td>
                            <td className="admin-notice-col-author">{formatAuthor(notice)}</td>
                            <td className="admin-notice-col-period" style={{ whiteSpace: "pre-line" }}>
                              {formatPeriod(notice)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 페이지네이션 */}
                {totalPages > 1 && (
                  <div className="admin-notice-pagination">
                    <button
                      type="button"
                      className="pg-arrow"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      &#8249;
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`pg-num${p === page ? " active" : ""}`}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="pg-arrow"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      &#8250;
                    </button>
                  </div>
                )}
            {/* FAB */}
            <button
              type="button"
              className="admin-notice-fab"
              onClick={openCreate}
              aria-label="새 공지 작성"
            >
              +
            </button>
        </div>
      
      </AdminLayout>
    );
  }

  /* ── 작성/수정 폼 뷰 ── */
  return (
    <AdminLayout appClass="admin-notice-app" userName={currentUserName}>
      <form className="admin-notice-form-wrapper" onSubmit={handleSubmit}>
        {/* 페이지 헤더 + 폼 필드 영역 */}
        <div className="admin-notice-form-page">
          <div className="admin-notice-page-header">
            <h1 className="admin-notice-h1">게시판</h1>
          </div>

          <div className="admin-notice-form-body">
              {/* 공지설정 */}
              <div className="admin-notice-form-row">
                <span className="admin-notice-form-label">공지설정</span>
                <div className="admin-notice-form-field">
                  <label className="admin-notice-check-label">
                    <input
                      type="checkbox"
                      checked={form.popupEnabled}
                      onChange={(e) => setForm((f) => ({ ...f, popupEnabled: e.target.checked }))}
                    />
                    팝업사용
                  </label>
                  <label className="admin-notice-check-label">
                    <input
                      type="checkbox"
                      checked={form.pinned}
                      onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
                    />
                    상단고정
                  </label>
                </div>
              </div>

              {/* 공지대상 */}
              <div className="admin-notice-form-row">
                <span className="admin-notice-form-label">공지대상</span>
                <div className="admin-notice-form-field">
                  <label className="admin-notice-check-label">
                    <input
                      type="checkbox"
                      checked={form.targetActive}
                      onChange={(e) => setForm((f) => ({ ...f, targetActive: e.target.checked }))}
                    />
                    유효회원
                  </label>
                  <label className="admin-notice-check-label">
                    <input
                      type="checkbox"
                      checked={form.targetExpired}
                      onChange={(e) => setForm((f) => ({ ...f, targetExpired: e.target.checked }))}
                    />
                    만료회원
                  </label>
                </div>
              </div>

              {/* 게시기간 */}
              <div className="admin-notice-form-row align-top">
                <span className="admin-notice-form-label">게시기간</span>
                <div className="admin-notice-form-field col">
                  {/* 지금 */}
                  <div className="admin-notice-timing-option">
                    <label className="admin-notice-radio-label">
                      <input
                        type="radio"
                        name="postTiming"
                        value="now"
                        checked={form.postTiming === "now"}
                        onChange={() => setForm((f) => ({ ...f, postTiming: "now" }))}
                      />
                      지금
                    </label>
                    {form.postTiming === "now" && (
                      <div className="admin-notice-dt-wrap" style={{ marginLeft: 8 }}>
                        <span className="admin-notice-dt-label">게시 종료일</span>
                        <input
                          type="date"
                          className="admin-notice-dt-input"
                          value={form.endDate}
                          onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>
                  {/* 예약 */}
                  <div className="admin-notice-timing-option">
                    <label className="admin-notice-radio-label">
                      <input
                        type="radio"
                        name="postTiming"
                        value="scheduled"
                        checked={form.postTiming === "scheduled"}
                        onChange={() => setForm((f) => ({ ...f, postTiming: "scheduled" }))}
                      />
                      예약
                    </label>
                    {form.postTiming === "scheduled" && (
                      <div className="admin-notice-dt-range" style={{ marginLeft: 8 }}>
                        <div className="admin-notice-dt-wrap">
                          <span className="admin-notice-dt-label">게시 시작일</span>
                          <input
                            type="date"
                            className="admin-notice-dt-input"
                            value={form.startDate}
                            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                          />
                        </div>
                        <span className="admin-notice-dt-sep">~</span>
                        <div className="admin-notice-dt-wrap">
                          <span className="admin-notice-dt-label">게시 종료일</span>
                          <input
                            type="date"
                            className="admin-notice-dt-input"
                            value={form.endDate}
                            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  {/* 미설정 */}
                  <label className="admin-notice-radio-label">
                    <input
                      type="radio"
                      name="postTiming"
                      value="none"
                      checked={form.postTiming === "none"}
                      onChange={() => setForm((f) => ({ ...f, postTiming: "none" }))}
                    />
                    미설정
                    <span className="admin-notice-radio-hint">(공지사항이 노출되지 않습니다.)</span>
                  </label>
                  {/* 제한없음 */}
                  <label className="admin-notice-radio-label">
                    <input
                      type="radio"
                      name="postTiming"
                      value="unlimited"
                      checked={form.postTiming === "unlimited"}
                      onChange={() => setForm((f) => ({ ...f, postTiming: "unlimited" }))}
                    />
                    제한없음
                  </label>
                </div>
              </div>

              {/* 제목 */}
              <div className="admin-notice-form-row">
                <span className="admin-notice-form-label">제목</span>
                <div className="admin-notice-form-field">
                  <input
                    type="text"
                    className="admin-notice-title-input"
                    placeholder="제목을 입력해주세요."
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
              </div>

              {/* 내용 */}
              <div className="admin-notice-form-row align-top admin-notice-content-row">
                <span className="admin-notice-form-label">내용</span>
                <div className="admin-notice-form-field col">
                  <textarea
                    className="admin-notice-content-input"
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  />
                  <div className="admin-notice-photo-row">
                    <button
                      type="button"
                      className="admin-notice-photo-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      사진 추가
                    </button>
                    <span className="admin-notice-photo-hint">
                      사진 첨부 최대 갯수 : 3개 , 이미지 최대 사이즈 : 10MB , 확장자 : jpg , jpeg , png, gif
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif"
                      multiple
                      hidden
                    />
                  </div>
                  {form.images.length > 0 && (
                    <div className="admin-notice-photo-preview">
                      {form.images.map((src) => (
                        <div key={src} className="admin-notice-photo-thumb">
                          <img src={src} alt="첨부" />
                          <button
                            type="button"
                            className="admin-notice-photo-remove"
                            onClick={() => setForm((f) => ({ ...f, images: f.images.filter((i) => i !== src) }))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {formError && <p className="admin-notice-form-error">{formError}</p>}
          </div>
        </div>

        {/* 하단 버튼 바 — content 바깥, form의 직접 자식 */}
        <div className="admin-notice-form-footer">
          <button type="button" className="admin-notice-back-btn" onClick={goBack}>
            &#8249; 뒤로가기
          </button>
          <button type="submit" className="admin-notice-submit-btn" disabled={submitting}>
            {submitting ? "저장 중..." : editingNotice ? "수정" : "등록"}
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}

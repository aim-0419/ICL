import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import {
  listAdminNotices,
  getAdminNotice,
  createAdminNotice,
  updateAdminNotice,
  deleteAdminNotices,
  uploadNoticeImage,
} from "../../studio/api/studioApi.js";

const NAV_ITEMS = [
  { label: "← 교육관리", path: "/admin" }, { label: "일정", path: "/admin/studio" },
  { label: "수업", path: "/admin/classes" },
  { label: "회원", path: "/admin/member-list" },
  { label: "강사", path: "/admin/instructors" },
  { label: "수강권", path: "/admin/passes" },
  { label: "메시지", path: "/admin/messages" },
  { label: "게시판", path: "/admin/board", active: true },
  { label: "설정", path: "/admin/settings" },
  { label: "매출", path: "/admin/sales" },
];

const EMPTY_FORM = {
  id: "",
  title: "",
  content: "",
  images: [],
  popupEnabled: false,
  pinned: false,
  targetActive: true,
  targetExpired: false,
  postTiming: "now",
  startAt: "",
  endAt: "",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}. (${WEEKDAYS[d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDateShort(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDateRange(notice) {
  const { postTiming, startAt, endAt, createdAt } = notice;
  if (postTiming === "none") return "미설정";
  if (postTiming === "unlimited") return "제한없음";
  const s = fmtDateShort(postTiming === "now" ? createdAt : startAt);
  const e = endAt ? fmtDateShort(endAt) : "";
  return e ? `${s} ~ ${e}` : s;
}

function getTargetLabel(target) {
  if (target === "both") return "전체";
  if (target === "expired") return "만료";
  return "유효";
}

function getAuthorLabel(notice) {
  const roleMap = { owner: "스튜디오 오너", manager: "매니저", instructor: "강사" };
  const rolePart = roleMap[notice.authorRole] || notice.authorRole || "";
  return notice.authorName ? `${notice.authorName}${rolePart ? ` ${rolePart}` : ""}` : "관리자";
}

function toLocalDatetime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PAGE_SIZE = 20;

export function AdminNoticePage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [view, setView] = useState("list");
  const [notices, setNotices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [tab, setTab] = useState("notice"); // "notice" | "studiomate"
  const [viewingNotice, setViewingNotice] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadNotices = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAdminNotices({ search: searchQuery, page, pageSize: PAGE_SIZE });
      setNotices(result.notices);
      setTotal(result.total);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "목록을 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, page]);

  useEffect(() => { loadNotices(); }, [loadNotices]);

  function showMessage(type, text) {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 3000);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setView("form");
  }

  function openEdit(notice) {
    setForm({
      id: notice.id,
      title: notice.title,
      content: notice.content || "",
      images: Array.isArray(notice.images) ? notice.images : [],
      popupEnabled: Boolean(notice.popupEnabled),
      pinned: Boolean(notice.pinned),
      targetActive: notice.target === "active" || notice.target === "both",
      targetExpired: notice.target === "expired" || notice.target === "both",
      postTiming: notice.postTiming || "now",
      startAt: toLocalDatetime(notice.startAt),
      endAt: toLocalDatetime(notice.endAt),
    });
    setView("form");
  }

  async function openDetail(noticeOrId) {
    const id = typeof noticeOrId === "string" ? noticeOrId : noticeOrId.id;
    try {
      const full = await getAdminNotice(id);
      setViewingNotice(full);
      setView("detail");
    } catch (err) {
      showMessage("error", err.message || "게시글을 불러오지 못했습니다.");
    }
  }

  async function handleSave() {
    if (!form.title.trim()) { setMessage({ type: "error", text: "제목을 입력해 주세요." }); return; }
    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const target = form.targetActive && form.targetExpired ? "both"
        : form.targetExpired ? "expired" : "active";
      const payload = {
        title: form.title.trim(),
        content: form.content,
        images: form.images,
        popupEnabled: form.popupEnabled,
        pinned: form.pinned,
        target,
        postTiming: form.postTiming,
        startAt: form.postTiming === "scheduled" ? form.startAt || null : null,
        endAt: (form.postTiming === "now" || form.postTiming === "scheduled") ? form.endAt || null : null,
      };
      if (form.id) {
        await updateAdminNotice(form.id, payload);
        showMessage("success", "게시글이 수정되었습니다.");
      } else {
        await createAdminNotice(payload);
        showMessage("success", "게시글이 등록되었습니다.");
      }
      setView("list");
      await loadNotices();
    } catch (err) {
      setMessage({ type: "error", text: err.message || "저장에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedIds.size) return;
    if (!window.confirm(`선택한 ${selectedIds.size}개를 삭제할까요?`)) return;
    try {
      await deleteAdminNotices([...selectedIds]);
      setSelectedIds(new Set());
      await loadNotices();
      showMessage("success", "삭제되었습니다.");
    } catch (err) {
      showMessage("error", err.message || "삭제에 실패했습니다.");
    }
  }

  function toggleAll() {
    if (selectedIds.size === notices.length && notices.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notices.map((n) => n.id)));
    }
  }

  function toggleId(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setF(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function handleImageAdd(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (form.images.length >= 3) { setMessage({ type: "error", text: "사진은 최대 3개까지 첨부할 수 있습니다." }); return; }
    setMessage({ type: "", text: "" });
    try {
      const result = await uploadNoticeImage(file);
      setF({ images: [...form.images, result.url] });
    } catch (err) {
      setMessage({ type: "error", text: err.message || "이미지 업로드에 실패했습니다." });
    }
  }

  function removeImage(idx) {
    setF({ images: form.images.filter((_, i) => i !== idx) });
  }

  return (
    <div className="admin-notice-app">
      <header className="admin-schedule-topbar">
        <button className="admin-schedule-logo" type="button" onClick={() => navigate("/")}>
          <span>ICL</span>
        </button>
        <nav className="admin-schedule-nav">
          {NAV_ITEMS.map((item) => (
            <Link key={item.label} className={item.active ? "active" : ""} to={item.path}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="admin-schedule-search">
          <span aria-hidden="true">검색</span>
          <input
            type="search"
            placeholder="제목 검색"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
        <button className="admin-schedule-profile" type="button" onClick={() => navigate("/admin")}>
          {currentUserName}
        </button>
      </header>

      <div className="admin-notice-body">
        {message.text && (
          <div className={`admin-notice-msg${message.type === "error" ? " error" : ""}`}>{message.text}</div>
        )}

        {/* ── 목록 ─────────────────────────────────────────────── */}
        {view === "list" && (
          <>
            <div className="admin-notice-page-title">게시판</div>
            <div className="admin-notice-tabs">
              <button type="button" className={tab === "notice" ? "active" : ""} onClick={() => { setTab("notice"); setView("list"); }}>공지사항</button>
              <button type="button" className={tab === "studiomate" ? "active" : ""} onClick={() => setTab("studiomate")}>스튜디오메이트 공지</button>
            </div>

            {tab === "studiomate" ? (
              <div className="admin-notice-empty">스튜디오메이트 공지가 없습니다.</div>
            ) : (<>
            <div className="admin-notice-toolbar">
              <span className="admin-notice-count">총 {total}개</span>
              <button
                type="button"
                className="admin-notice-del-btn"
                disabled={!selectedIds.size}
                onClick={handleDelete}
              >삭제</button>
            </div>

            {loading ? (
              <div className="admin-notice-empty">불러오는 중...</div>
            ) : notices.length === 0 ? (
              <div className="admin-notice-empty">등록된 공지사항이 없습니다.</div>
            ) : (
              <div className="admin-notice-table-wrap">
                <table className="admin-notice-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={selectedIds.size === notices.length && notices.length > 0}
                          onChange={toggleAll}
                        />
                      </th>
                      <th>작성일시</th>
                      <th>제목</th>
                      <th>회원</th>
                      <th>팝업</th>
                      <th>작성자</th>
                      <th>게시기간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notices.map((notice) => (
                      <tr key={notice.id} onClick={() => openDetail(notice)} className={selectedIds.has(notice.id) ? "selected" : ""}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(notice.id)}
                            onChange={() => toggleId(notice.id)}
                          />
                        </td>
                        <td className="admin-notice-col-date">{fmtDate(notice.createdAt)}</td>
                        <td className="admin-notice-col-title">
                          {notice.pinned && <span className="admin-notice-pin-badge">고정</span>}
                          {notice.title}
                        </td>
                        <td className="admin-notice-col-target">{getTargetLabel(notice.target)}</td>
                        <td className="admin-notice-col-popup">{notice.popupEnabled ? <span className="admin-notice-popup-y">Y</span> : ""}</td>
                        <td className="admin-notice-col-author">{getAuthorLabel(notice)}</td>
                        <td className="admin-notice-col-period">{fmtDateRange(notice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="admin-pass-pagination">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i + 1}
                    type="button"
                    className={page === i + 1 ? "active" : ""}
                    onClick={() => setPage(i + 1)}
                  >{i + 1}</button>
                ))}
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
              </div>
            )}

            {tab === "notice" && <button type="button" className="admin-notice-fab" onClick={openCreate}>+</button>}
          </>)}
        </>
        )}

        {/* ── 작성 / 수정 폼 ─────────────────────────────────────── */}
        {view === "form" && (
          <div className="admin-notice-form-wrap">
            <div className="admin-notice-page-title">게시판</div>
            <div className="admin-notice-tabs">
              <button type="button" className={tab === "notice" ? "active" : ""} onClick={() => { setTab("notice"); setView("list"); }}>공지사항</button>
              <button type="button" className={tab === "studiomate" ? "active" : ""} onClick={() => setTab("studiomate")}>스튜디오메이트 공지</button>
            </div>

            <div className="admin-notice-form">
              {/* 공지설정 */}
              <div className="admin-notice-form-row">
                <div className="admin-notice-form-label">공지설정</div>
                <div className="admin-notice-form-field">
                  <label className="admin-notice-check-label">
                    <input
                      type="checkbox"
                      checked={form.popupEnabled}
                      onChange={(e) => setF({ popupEnabled: e.target.checked })}
                    />
                    팝업사용
                  </label>
                  <label className="admin-notice-check-label">
                    <input
                      type="checkbox"
                      checked={form.pinned}
                      onChange={(e) => setF({ pinned: e.target.checked })}
                    />
                    상단고정
                  </label>
                </div>
              </div>

              {/* 공지대상 */}
              <div className="admin-notice-form-row">
                <div className="admin-notice-form-label">공지대상</div>
                <div className="admin-notice-form-field">
                  <label className="admin-notice-check-label">
                    <input
                      type="checkbox"
                      checked={form.targetActive}
                      onChange={(e) => setF({ targetActive: e.target.checked })}
                    />
                    유효회원
                  </label>
                  <label className="admin-notice-check-label">
                    <input
                      type="checkbox"
                      checked={form.targetExpired}
                      onChange={(e) => setF({ targetExpired: e.target.checked })}
                    />
                    만료회원
                  </label>
                </div>
              </div>

              {/* 게시기간 */}
              <div className="admin-notice-form-row">
                <div className="admin-notice-form-label">게시기간</div>
                <div className="admin-notice-form-field col">
                  <label className="admin-notice-radio-label">
                    <input type="radio" name="postTiming" value="now" checked={form.postTiming === "now"} onChange={() => setF({ postTiming: "now" })} />
                    지금
                    <div className="admin-notice-dt-wrap">
                      <span className="admin-notice-dt-label">게시 종료일</span>
                      <input
                        type="datetime-local"
                        className="admin-notice-dt-input"
                        value={form.endAt}
                        onChange={(e) => setF({ endAt: e.target.value })}
                        disabled={form.postTiming !== "now"}
                      />
                    </div>
                  </label>
                  <label className="admin-notice-radio-label">
                    <input type="radio" name="postTiming" value="scheduled" checked={form.postTiming === "scheduled"} onChange={() => setF({ postTiming: "scheduled" })} />
                    예약
                    <div className="admin-notice-dt-wrap">
                      <span className="admin-notice-dt-label">게시 시작일</span>
                      <input
                        type="datetime-local"
                        className="admin-notice-dt-input"
                        value={form.startAt}
                        onChange={(e) => setF({ startAt: e.target.value })}
                        disabled={form.postTiming !== "scheduled"}
                      />
                    </div>
                    <span className="admin-notice-dt-sep">~</span>
                    <div className="admin-notice-dt-wrap">
                      <span className="admin-notice-dt-label">게시 종료일</span>
                      <input
                        type="datetime-local"
                        className="admin-notice-dt-input"
                        value={form.endAt}
                        onChange={(e) => setF({ endAt: e.target.value })}
                        disabled={form.postTiming !== "scheduled"}
                      />
                    </div>
                  </label>
                  <label className="admin-notice-radio-label">
                    <input type="radio" name="postTiming" value="none" checked={form.postTiming === "none"} onChange={() => setF({ postTiming: "none" })} />
                    미설정 <span className="admin-notice-radio-hint">(공지사항이 노출되지 않습니다.)</span>
                  </label>
                  <label className="admin-notice-radio-label">
                    <input type="radio" name="postTiming" value="unlimited" checked={form.postTiming === "unlimited"} onChange={() => setF({ postTiming: "unlimited" })} />
                    제한없음
                  </label>
                </div>
              </div>

              {/* 제목 */}
              <div className="admin-notice-form-row">
                <div className="admin-notice-form-label">제목</div>
                <div className="admin-notice-form-field">
                  <input
                    type="text"
                    className="admin-notice-title-input"
                    placeholder="제목을 입력해주세요."
                    value={form.title}
                    onChange={(e) => setF({ title: e.target.value })}
                  />
                </div>
              </div>

              {/* 내용 */}
              <div className="admin-notice-form-row align-top">
                <div className="admin-notice-form-label">내용</div>
                <div className="admin-notice-form-field">
                  <textarea
                    className="admin-notice-content-input"
                    placeholder="내용을 입력해주세요."
                    value={form.content}
                    onChange={(e) => setF({ content: e.target.value })}
                  />
                </div>
              </div>

              {/* 사진 추가 */}
              <div className="admin-notice-photo-row">
                <label className="admin-notice-photo-btn" style={{ cursor: form.images.length >= 3 ? "not-allowed" : "pointer", opacity: form.images.length >= 3 ? 0.45 : 1 }}>
                  사진 추가
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif"
                    style={{ display: "none" }}
                    disabled={form.images.length >= 3}
                    onChange={handleImageAdd}
                  />
                </label>
                <span className="admin-notice-photo-hint">사진 첨부 최대 개수 : 3개 , 이미지 최대 사이즈 : 10MB , 확장자 : jpg , jpeg , png, gif</span>
              </div>
              {form.images.length > 0 && (
                <div className="admin-notice-photo-preview">
                  {form.images.map((url, idx) => (
                    <div key={idx} className="admin-notice-photo-thumb">
                      <img src={url} alt={`첨부 ${idx + 1}`} />
                      <button type="button" className="admin-notice-photo-remove" onClick={() => removeImage(idx)}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {message.type === "error" && message.text && (
                <div className="admin-notice-form-error">{message.text}</div>
              )}
            </div>

            <div className="admin-notice-form-footer">
              <button type="button" className="admin-notice-back-btn" onClick={() => setView("list")}>← 뒤로가기</button>
              <button type="button" className="admin-notice-submit-btn" onClick={handleSave} disabled={saving}>
                {saving ? "저장 중..." : form.id ? "수정 완료" : "등록"}
              </button>
            </div>
          </div>
        )}

        {/* ── 상세 ─────────────────────────────────────────────── */}
        {view === "detail" && viewingNotice && (
          <div className="admin-notice-detail-wrap">
            <div className="admin-notice-page-title">게시판</div>
            <div className="admin-notice-tabs">
              <button type="button" className={tab === "notice" ? "active" : ""} onClick={() => { setTab("notice"); setView("list"); }}>공지사항</button>
              <button type="button" className={tab === "studiomate" ? "active" : ""} onClick={() => setTab("studiomate")}>스튜디오메이트 공지</button>
            </div>

            <div className="admin-notice-detail-toolbar">
              <button type="button" className="admin-notice-list-btn" onClick={() => setView("list")}>目 목록</button>
            </div>

            <div className="admin-notice-detail-card">
              <div className="admin-notice-detail-head">
                <div className="admin-notice-detail-title-row">
                  <span className="admin-notice-detail-title">{viewingNotice.title}</span>
                  <span className="admin-notice-detail-meta-right">
                    {getAuthorLabel(viewingNotice)}
                    <span className="admin-notice-detail-date">{fmtDate(viewingNotice.createdAt)}</span>
                  </span>
                </div>
                <div className="admin-notice-detail-chips">
                  {viewingNotice.popupEnabled && <span>공지설정: 팝업사용</span>}
                  {viewingNotice.pinned && <span>상단고정</span>}
                  {viewingNotice.postTiming !== "none" && viewingNotice.postTiming !== "unlimited" && (
                    <span>게시기간: {fmtDateRange(viewingNotice)}</span>
                  )}
                  {viewingNotice.postTiming === "unlimited" && <span>게시기간: 제한없음</span>}
                  <span>공지대상: {viewingNotice.target === "both" ? "유효회원 · 만료회원" : viewingNotice.target === "expired" ? "만료회원" : "유효회원"}</span>
                </div>
              </div>
              <div className="admin-notice-detail-divider" />
              <div className="admin-notice-detail-content">
                {viewingNotice.content
                  ? viewingNotice.content.split("\n").map((line, i) => (
                      <React.Fragment key={i}>{line}<br /></React.Fragment>
                    ))
                  : <span className="admin-notice-detail-empty">내용이 없습니다.</span>
                }
              </div>
              {Array.isArray(viewingNotice.images) && viewingNotice.images.length > 0 && (
                <div className="admin-notice-photo-preview" style={{ padding: "0 24px 24px" }}>
                  {viewingNotice.images.map((url, idx) => (
                    <div key={idx} className="admin-notice-photo-thumb">
                      <img src={url} alt={`첨부 ${idx + 1}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="admin-notice-detail-actions">
              <button type="button" className="admin-notice-edit-btn" onClick={() => openEdit(viewingNotice)}>수정</button>
              <button
                type="button"
                className="admin-notice-del-btn"
                onClick={async () => {
                  if (!window.confirm("이 게시글을 삭제할까요?")) return;
                  try {
                    await deleteAdminNotices([viewingNotice.id]);
                    setView("list");
                    await loadNotices();
                    showMessage("success", "삭제되었습니다.");
                  } catch (err) {
                    showMessage("error", err.message || "삭제에 실패했습니다.");
                  }
                }}
              >삭제</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

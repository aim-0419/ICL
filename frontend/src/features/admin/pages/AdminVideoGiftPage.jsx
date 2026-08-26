// 파일 역할: 관리자가 특정 회원에게 강의 수강권을 지급하거나 회수하는 페이지 컴포넌트입니다.
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PageLayout } from "../../../shared/components/PageLayout.jsx";
import { AdminDashboardNav } from "../components/AdminDashboardNav.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { apiRequest } from "../../../shared/api/client.js";
import { resolveAcademyMediaUrl } from "../../academy/api/academyApi.js";
import { getDiscountRate } from "../../academy/data/academyVideos.js";

const DURATION_OPTIONS = [
  { value: "1d", label: "1일" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "unlimited", label: "무제한" },
];

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

function isGrantExpired(expiresAt) {
  return Boolean(expiresAt) && new Date(String(expiresAt).replace(" ", "T")) < new Date();
}

// 컴포넌트 역할: 관리자가 특정 회원에게 강의 수강권을 지급하거나 회수하는 페이지 컴포넌트입니다.
export function AdminVideoGiftPage() {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const store = useAppStore();
  const hasRecipient = Boolean(userId);
  const userName = String(location.state?.userName || "");
  const userEmail = String(location.state?.userEmail || "");
  const recipientLabel = userName || userEmail || userId || "선택한 회원";

  const allVideos = useMemo(
    () => (Array.isArray(store.academyVideos) ? store.academyVideos : []),
    [store.academyVideos]
  );

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [durationType, setDurationType] = useState("unlimited");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showConfirm, setShowConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState(hasRecipient ? "gift" : "history");
  const [grantHistory, setGrantHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyUpdatingId, setHistoryUpdatingId] = useState("");

  const isAllSelected = allVideos.length > 0 && selectedIds.size === allVideos.length;
  const selectedVideos = useMemo(
    () => allVideos.filter((video) => selectedIds.has(String(video.id))),
    [allVideos, selectedIds]
  );
  const selectedDurationLabel =
    DURATION_OPTIONS.find((option) => option.value === durationType)?.label || durationType;
  async function loadGrantHistory() {
    try {
      setHistoryLoading(true);
      setHistoryError("");
      const result = await apiRequest("/admin/video-grants");
      setGrantHistory(Array.isArray(result?.grants) ? result.grants : []);
    } catch (error) {
      setHistoryError(error.message || "영상 선물 내역을 불러오지 못했습니다.");
      setGrantHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleHistoryDurationChange(grantId, nextDurationType) {
    const previousHistory = grantHistory;

    setGrantHistory((current) =>
      current.map((grant) =>
        grant.id === grantId ? { ...grant, durationType: nextDurationType } : grant
      )
    );
    setHistoryUpdatingId(grantId);
    setHistoryError("");

    try {
      const result = await apiRequest(`/admin/video-grants/${encodeURIComponent(grantId)}`, {
        method: "PATCH",
        body: { durationType: nextDurationType },
      });
      const updatedGrant = result?.grant || {};
      setGrantHistory((current) =>
        current.map((grant) =>
          grant.id === grantId
            ? {
                ...grant,
                durationType: updatedGrant.durationType || nextDurationType,
                expiresAt: updatedGrant.expiresAt ?? null,
              }
            : grant
        )
      );
    } catch (error) {
      setGrantHistory(previousHistory);
      setHistoryError(error.message || "선물 기간을 수정하지 못했습니다.");
    } finally {
      setHistoryUpdatingId("");
    }
  }

  useEffect(() => {
    if (activeTab === "history") loadGrantHistory();
  }, [activeTab]);

  function toggleSelectAll() {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVideos.map((v) => String(v.id))));
    }
  }

  function toggleVideo(videoId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  }

  function handleSubmit() {
    if (!hasRecipient) {
      setMessage({ type: "error", text: "회원 목록에서 선물할 회원을 먼저 선택해 주세요." });
      return;
    }
    if (!selectedIds.size) {
      setMessage({ type: "error", text: "선물할 영상을 하나 이상 선택해 주세요." });
      return;
    }
    setMessage({ type: "", text: "" });
    setShowConfirm(true);
  }

  async function handleConfirmSubmit() {
    setSubmitting(true);
    setMessage({ type: "", text: "" });

    try {
      const result = await apiRequest(`/admin/users/${encodeURIComponent(userId)}/video-grants`, {
        method: "POST",
        body: { videoIds: [...selectedIds], durationType },
      });

      setMessage({ type: "success", text: result?.message || "영상이 선물되었습니다." });
      setSelectedIds(new Set());
      setShowConfirm(false);
      if (activeTab === "history") await loadGrantHistory();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "선물 처리에 실패했습니다." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageLayout mainClass="dashboard-page admin-dashboard-page">
        <AdminDashboardNav active="gifts" />

        <section className="dashboard-hero mypage-hero-card">
          <p className="section-kicker">관리자 대시보드</p>
          <h1>영상 선물하기</h1>
        </section>

        <section className="admin-dashboard-grid">
          <section className="dashboard-card admin-members-panel">
            <div className="admin-members-toolbar">
              <div className="admin-member-tabs">
                {hasRecipient ? (
                  <button
                    type="button"
                    className={`admin-member-tab${activeTab === "gift" ? " active" : ""}`}
                    onClick={() => setActiveTab("gift")}
                  >
                    영상 선물하기
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`admin-member-tab${activeTab === "history" ? " active" : ""}`}
                  onClick={() => setActiveTab("history")}
                >
                  선물 내역
                </button>
              </div>
              <button
                type="button"
                className="ghost-button small-ghost"
                onClick={() => (hasRecipient ? navigate(-1) : navigate("/admin"))}
              >
                ← 회원 관리로
              </button>
            </div>

            {message.text ? (
              <p className={`admin-form-message ${message.type}`}>{message.text}</p>
            ) : null}

            {activeTab === "history" ? (
              <div className="video-gift-history-panel">
                {historyLoading ? <p className="admin-empty-copy">영상 선물 내역을 불러오는 중입니다...</p> : null}
                {!historyLoading && historyError ? <p className="admin-empty-copy error">{historyError}</p> : null}
                {!historyLoading && !historyError && grantHistory.length === 0 ? (
                  <p className="admin-empty-copy">아직 영상 선물 내역이 없습니다.</p>
                ) : null}
                {!historyLoading && !historyError && grantHistory.length > 0 ? (
                  <div className="video-gift-history-table-wrap">
                    <table className="video-gift-history-table">
                      <thead>
                        <tr>
                          <th>회원</th>
                          <th>영상명</th>
                          <th>기간</th>
                          <th>상태</th>
                          <th>만료일</th>
                          <th>선물일</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grantHistory.map((grant) => {
                          const expired = isGrantExpired(grant.expiresAt);
                          return (
                            <tr key={grant.id}>
                              <td>
                                <strong>{grant.userName || grant.loginId || grant.userId}</strong>
                                {grant.userEmail ? <span>{grant.userEmail}</span> : null}
                              </td>
                              <td>{grant.title || grant.videoId}</td>
                              <td>
                                <select
                                  className="video-gift-duration-select"
                                  aria-label={`${grant.userName || grant.loginId || "회원"} 선물 영상 이용 기간`}
                                  value={grant.durationType || "unlimited"}
                                  disabled={historyUpdatingId === grant.id}
                                  onChange={(event) =>
                                    handleHistoryDurationChange(grant.id, event.target.value)
                                  }
                                >
                                  {DURATION_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <span className={expired ? "video-grant-status expired" : "video-grant-status active"}>
                                  {expired ? "만료" : "이용 중"}
                                </span>
                              </td>
                              <td>{grant.expiresAt ? formatDateTime(grant.expiresAt) : "무제한"}</td>
                              <td>{formatDateTime(grant.createdAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : allVideos.length === 0 ? (
              <p className="admin-empty-copy">선물할 수 있는 영상이 없습니다.</p>
            ) : (
              <>
                <div className="video-gift-controls">
                  <label className="video-gift-select-all">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                    />
                    <span>전체 선택 ({allVideos.length}개)</span>
                  </label>
                  <div className="video-gift-duration-group">
                    <span className="video-gift-duration-label">선물 기간</span>
                    {DURATION_OPTIONS.map((option) => (
                      <label key={option.value} className="video-gift-duration-option">
                        <input
                          type="radio"
                          name="durationType"
                          value={option.value}
                          checked={durationType === option.value}
                          onChange={() => setDurationType(option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="video-gift-list">
                  {allVideos.map((video) => {
                    const isSelected = selectedIds.has(String(video.id));
                    return (
                      <label
                        key={video.id}
                        className={`video-gift-item ${isSelected ? "is-selected" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleVideo(String(video.id))}
                        />
                        {video.image ? (
                          <img loading="lazy" decoding="async"
                            className="video-gift-thumb"
                            src={resolveAcademyMediaUrl(video.image)}
                            alt={video.title}
                          />
                        ) : (
                          <div className="video-gift-thumb video-gift-thumb-empty" />
                        )}
                        <div className="video-gift-info">
                          <strong className="video-gift-title">{video.title}</strong>
                          <span className="video-gift-meta">
                            {video.instructor}
                            {video.category ? ` · ${video.category}` : ""}
                          </span>
                          {video.salePrice != null ? (
                            <span className="video-gift-price">
                              {store.formatCurrency(video.salePrice)}
                              {video.originalPrice > video.salePrice ? (
                                <em className="video-gift-discount">
                                  {" "}
                                  {getDiscountRate(video.originalPrice, video.salePrice)}% 할인
                                </em>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="video-gift-submit-row">
                  <span className="video-gift-selected-count">
                    {selectedIds.size}개 선택됨
                  </span>
                  <button
                    type="button"
                    className="pill-button"
                    disabled={submitting || selectedIds.size === 0}
                    onClick={handleSubmit}
                  >
                    {submitting ? "선물 중..." : `선택한 영상 선물하기 (${selectedIds.size}개)`}
                  </button>
                </div>
              </>
            )}
          </section>
        </section>
      </PageLayout>
      {showConfirm ? (
        <div className="video-gift-confirm-backdrop" role="presentation">
          <section className="video-gift-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="video-gift-confirm-title">
            <div className="video-gift-confirm-head">
              <h2 id="video-gift-confirm-title">영상 선물 확인</h2>
              <button type="button" aria-label="닫기" onClick={() => setShowConfirm(false)} disabled={submitting}>
                ×
              </button>
            </div>
            <dl className="video-gift-confirm-summary">
              <div>
                <dt>받는 회원</dt>
                <dd>{recipientLabel}</dd>
              </div>
              <div>
                <dt>선물 기간</dt>
                <dd>{selectedDurationLabel}</dd>
              </div>
              <div>
                <dt>선택 영상</dt>
                <dd>{selectedVideos.length}개</dd>
              </div>
            </dl>
            <div className="video-gift-confirm-list">
              {selectedVideos.map((video) => (
                <p key={video.id}>{video.title || video.id}</p>
              ))}
            </div>
            <div className="video-gift-confirm-actions">
              <button type="button" className="ghost-button small-ghost" onClick={() => setShowConfirm(false)} disabled={submitting}>
                취소
              </button>
              <button type="button" className="pill-button" onClick={handleConfirmSubmit} disabled={submitting}>
                {submitting ? "선물 중..." : "최종 확인"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

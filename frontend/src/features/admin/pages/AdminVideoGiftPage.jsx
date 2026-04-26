// 파일 역할: 관리자가 특정 회원에게 강의 수강권을 지급하거나 회수하는 페이지 컴포넌트입니다.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
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

// 함수 역할: 날짜 시간 값을 화면에 보여주기 좋은 문구로 변환합니다.
function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

// 컴포넌트 역할: 관리자가 특정 회원에게 강의 수강권을 지급하거나 회수하는 페이지 컴포넌트입니다.
export function AdminVideoGiftPage() {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const store = useAppStore();

  const userName = String(location.state?.userName || "");
  const userEmail = String(location.state?.userEmail || "");

  const allVideos = useMemo(
    () => (Array.isArray(store.academyVideos) ? store.academyVideos : []),
    [store.academyVideos]
  );

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [durationType, setDurationType] = useState("unlimited");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [grants, setGrants] = useState([]);
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [revoking, setRevoking] = useState("");

  const grantedVideoIds = useMemo(() => new Set(grants.map((g) => String(g.videoId))), [grants]);

  const ungrantedVideos = useMemo(
    () => allVideos.filter((v) => !grantedVideoIds.has(String(v.id))),
    [allVideos, grantedVideoIds]
  );

  async function loadGrants() {
    try {
      setGrantsLoading(true);
      const result = await apiRequest(`/admin/users/${encodeURIComponent(userId)}/video-grants`);
      setGrants(Array.isArray(result?.grants) ? result.grants : []);
    } catch {
      setGrants([]);
    } finally {
      setGrantsLoading(false);
    }
  }

  useEffect(() => {
    loadGrants();
  }, [userId]);

  const isAllSelected = ungrantedVideos.length > 0 && selectedIds.size === ungrantedVideos.length;

  function toggleSelectAll() {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ungrantedVideos.map((v) => String(v.id))));
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

  async function handleSubmit() {
    if (!selectedIds.size) {
      setMessage({ type: "error", text: "선물할 영상을 하나 이상 선택해 주세요." });
      return;
    }

    setSubmitting(true);
    setMessage({ type: "", text: "" });

    try {
      const result = await apiRequest(`/admin/users/${encodeURIComponent(userId)}/video-grants`, {
        method: "POST",
        body: { videoIds: [...selectedIds], durationType },
      });

      setMessage({ type: "success", text: result?.message || "영상이 선물되었습니다." });
      setSelectedIds(new Set());
      await loadGrants();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "선물 처리에 실패했습니다." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(videoId, videoTitle) {
    const confirmed = window.confirm(`"${videoTitle}" 선물을 취소하시겠습니까?`);
    if (!confirmed) return;

    setRevoking(videoId);
    setMessage({ type: "", text: "" });

    try {
      const result = await apiRequest(
        `/admin/users/${encodeURIComponent(userId)}/video-grants/${encodeURIComponent(videoId)}`,
        { method: "DELETE" }
      );
      setMessage({ type: "success", text: result?.message || "선물이 취소되었습니다." });
      await loadGrants();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "선물 취소에 실패했습니다." });
    } finally {
      setRevoking("");
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="dashboard-page admin-dashboard-page">
        <section className="admin-dashboard-switch">
          <Link className="admin-dashboard-switch-link" to="/admin">
            매출 대시보드
          </Link>
          <Link className="admin-dashboard-switch-link active" to="/admin/members">
            회원 관리
          </Link>
        </section>

        <section className="dashboard-hero mypage-hero-card">
          <p className="section-kicker">관리자 대시보드</p>
          <h1>영상 선물하기</h1>
          <div className="mypage-identity-row">
            {userName ? <span className="mypage-identity-chip">{userName}</span> : null}
            {userEmail ? <span className="mypage-identity-chip">{userEmail}</span> : null}
          </div>
        </section>

        <section className="admin-dashboard-grid">
          <section className="dashboard-card admin-members-panel">
            <div className="admin-members-toolbar">
              <h2>영상 선택</h2>
              <button
                type="button"
                className="ghost-button small-ghost"
                onClick={() => navigate(-1)}
              >
                ← 회원 목록으로
              </button>
            </div>

            {message.text ? (
              <p className={`admin-form-message ${message.type}`}>{message.text}</p>
            ) : null}

            {ungrantedVideos.length === 0 && !grantsLoading ? (
              <p className="admin-empty-copy">선물할 수 있는 영상이 없습니다. 이미 모든 영상이 선물되었습니다.</p>
            ) : (
              <>
                <div className="video-gift-controls">
                  <label className="video-gift-select-all">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                    />
                    <span>전체 선택 ({ungrantedVideos.length}개)</span>
                  </label>

                  <div className="video-gift-duration-group">
                    <span className="video-gift-duration-label">이용 기간</span>
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
                  {ungrantedVideos.map((video) => {
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
                          <img
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

          <section className="dashboard-card admin-lecture-report-panel">
            <div className="admin-members-toolbar">
              <h2>선물한 영상</h2>
              <span className="admin-range-caption">
                {grantsLoading ? "불러오는 중..." : `${grants.length}개`}
              </span>
            </div>

            {!grantsLoading && grants.length === 0 ? (
              <p className="admin-empty-copy">아직 선물한 영상이 없습니다.</p>
            ) : (
              <div className="video-gift-granted-list">
                {grants.map((grant) => {
                  const isExpired =
                    grant.expiresAt && new Date(grant.expiresAt) < new Date();
                  const isRevokingThis = revoking === String(grant.videoId);

                  return (
                    <article
                      key={grant.id}
                      className={`admin-learning-card video-grant-card ${isExpired ? "is-expired" : ""}`}
                    >
                      <div className="admin-learning-head">
                        <strong>{grant.title || grant.videoId}</strong>
                        <span className={isExpired ? "video-grant-status expired" : "video-grant-status active"}>
                          {isExpired ? "만료됨" : "이용 중"}
                        </span>
                      </div>
                      <div className="admin-learning-meta">
                        {grant.instructor ? <span>강사 {grant.instructor}</span> : null}
                        {grant.category ? <span>카테고리 {grant.category}</span> : null}
                        <span>
                          이용 기간{" "}
                          {DURATION_OPTIONS.find((o) => o.value === grant.durationType)?.label ||
                            grant.durationType}
                        </span>
                        <span>
                          만료일{" "}
                          {grant.expiresAt ? formatDateTime(grant.expiresAt) : "무제한"}
                        </span>
                        <span>선물일 {formatDateTime(grant.createdAt)}</span>
                      </div>
                      <div className="admin-member-actions-row">
                        <button
                          type="button"
                          className="ghost-button small-ghost"
                          disabled={isRevokingThis}
                          onClick={() => handleRevoke(grant.videoId, grant.title || grant.videoId)}
                        >
                          {isRevokingThis ? "취소 중..." : "선물 취소"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

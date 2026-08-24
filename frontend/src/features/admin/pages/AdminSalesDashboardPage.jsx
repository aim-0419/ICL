/**
 * [관리자 매출 대시보드 페이지]
 *
 * 관리자가 기간별 매출·환불 현황을 차트와 표로 분석하는 화면입니다.
 * 아래 정보를 제공합니다:
 *
 *  1. 매출 추이 차트   — 일별·주간·월별·연간 선택, 막대 차트로 표시
 *  2. 핵심 지표 카드   — 총 매출, 총 주문, 평균 주문금액, 환불율
 *  3. 환불/취소 인사이트 — 환불율·금액·건수 기준 정렬 가능한 상품별 표
 *  4. 연령대별 분포    — 회원 연령대별 구매 비중
 *  5. 주문 목록        — 기간 내 전체 주문 상세 목록
 *
 * ─ 사용법 ─────────────────────────────────────────────────────────
 *  · 상단에서 기간 유형(일별/주간/월별/연간)을 선택합니다
 *  · 시작일·종료일을 직접 입력하거나 기본 범위를 사용합니다
 *  · 차트 막대에 마우스를 올리면 해당 기간의 상세 금액이 표시됩니다
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SalesTrendChart } from "../components/SalesTrendChart.jsx";
import { apiRequest } from "../../../shared/api/client.js";
import {
  canManageUserGrades,
  formatUserGradeLabel,
  USER_GRADE_OPTIONS,
} from "../../../shared/auth/userRoles.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { downloadXlsx } from "../../../shared/utils/exportXlsx.js";
import { formatDateTime, formatCurrency } from "../../../shared/utils/format.js";
import { listAdminPassRefunds, resolveStudioPassRefund } from "../../studio/api/studioApi.js";
import { resolveAcademyMediaUrl } from "../../academy/api/academyApi.js";
import { getDiscountRate } from "../../academy/data/academyVideos.js";

const SALES_PERIOD_OPTIONS = [
  { value: "day", label: "일별" },
  { value: "week", label: "주간" },
  { value: "month", label: "월간" },
  { value: "year", label: "연간" },
];
const PERIOD_VISIBLE_COUNT = {
  day: 7,
  week: 5,
  month: 12,
  year: 10,
};
const PERIOD_UNIT_LABEL = {
  day: "일",
  week: "주",
  month: "개월",
  year: "년",
};
const PERIOD_LABEL_BY_VALUE = {
  day: "일별",
  week: "주간",
  month: "월간",
  year: "연간",
};
const REFUND_INSIGHT_SORT_OPTIONS = [
  { value: "refundRate", label: "환불/취소율 높은순" },
  { value: "refundRevenue", label: "환불/취소 금액 높은순" },
  { value: "refundOrderCount", label: "환불 주문건수 높은순" },
];
const VIDEO_SALES_SORT_OPTIONS = [
  { value: "netRevenue", label: "매출 순" },
  { value: "orderCount", label: "주문건수 순" },
  { value: "saleCount", label: "판매수량 순" },
  { value: "refundRate", label: "환불률 순" },
  { value: "title", label: "강의명 순" },
];
const ADMIN_MEMBER_PAGE_SIZE = 10;

/** Date를 input[type="date"] 에 넣을 수 있는 "YYYY-MM-DD" 문자열로 변환합니다. */
function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetRange(periodValue, today) {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const todayStr = toDateInputValue(t);

  if (periodValue === "day") {
    // 오늘 하루
    return { startDate: todayStr, endDate: todayStr };
  }
  if (periodValue === "week") {
    // 저번주 월요일 ~ 일요일
    const day = t.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const thisMonday = new Date(t);
    thisMonday.setDate(t.getDate() + diffToMonday);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(thisMonday.getDate() - 1);
    return { startDate: toDateInputValue(lastMonday), endDate: toDateInputValue(lastSunday) };
  }
  if (periodValue === "month") {
    // 저번달 1일 ~ 마지막날
    const firstDay = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    const lastDay = new Date(t.getFullYear(), t.getMonth(), 0);
    return { startDate: toDateInputValue(firstDay), endDate: toDateInputValue(lastDay) };
  }
  if (periodValue === "year") {
    // 작년 1월 1일 ~ 12월 31일
    const start = new Date(t.getFullYear() - 1, 0, 1);
    const end = new Date(t.getFullYear() - 1, 11, 31);
    return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
  }
  return { startDate: todayStr, endDate: todayStr };
}

/** 금액을 숫자로 안전하게 변환합니다. 변환 불가 시 0을 반환합니다. */
function toAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 비율을 소수점 한 자리 문자열("12.5")로 변환합니다. 변환 불가 시 "0.0"을 반환합니다. */
function toPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0.0";
  return parsed.toFixed(1);
}

/**
 * 서버에서 받은 연령대 문자열("10대 이하", "20대" 등)을 표준 라벨로 정규화합니다.
 * 공백이 불규칙하거나 형태가 다른 경우에도 일관된 표시를 보장합니다.
 */
function normalizeAgeGroupLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "미분류";

  const compact = text.replace(/\s+/g, "");
  if (compact.includes("10")) return "10대 이하";
  if (compact.includes("20")) return "20대";
  if (compact.includes("30")) return "30대";
  if (compact.includes("40")) return "40대";
  if (compact.includes("50")) return "50대";
  if (
    compact.includes("60") ||
    compact.includes("70") ||
    compact.includes("80") ||
    compact.includes("90")
  ) {
    return "60대 이상";
  }

  if (/^[가-힣]+대$/.test(compact)) return compact;
  return "미분류";
}

// 함수 역할: 환불 분석 키 상황에 맞는 값을 계산하거나 선택합니다.
function resolveRefundInsightKey(item) {
  return String(item?.productId || item?.videoId || "").trim();
}


function hasEducationActivity(user) {
  return (
    Number(user?.purchasedLectureCount || 0) > 0 ||
    Number(user?.engagedLectureCount || 0) > 0 ||
    Number(user?.completedLectureCount || 0) > 0
  );
}

function getEducationMemberSegment(user) {
  if (user?.accountStatus === "withdrawn") return "withdrawn";
  if (hasEducationActivity(user)) return "education";
  return "registered";
}

function compareEducationMembers(a, b) {
  const aWithdrawn = a?.accountStatus === "withdrawn";
  const bWithdrawn = b?.accountStatus === "withdrawn";
  if (aWithdrawn !== bWithdrawn) return aWithdrawn ? 1 : -1;

  const aName = String(a?.name || a?.loginId || a?.email || "");
  const bName = String(b?.name || b?.loginId || b?.email || "");
  const byName = aName.localeCompare(bName, "ko-KR", { numeric: true, sensitivity: "base" });
  if (byName !== 0) return byName;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "ko-KR", { numeric: true });
}

const GIFT_DURATION_OPTIONS = [
  { value: "1d", label: "1일" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "unlimited", label: "무제한" },
];

function isGrantExpired(expiresAt) {
  return Boolean(expiresAt) && new Date(String(expiresAt).replace(" ", "T")) < new Date();
}

// 컴포넌트 역할: 매출 관리자 쉘 안에서 영상 선물 관리를 바로 보여주는 본문 패널입니다.
function AdminSalesVideoGiftPanel({ store }) {
  const allVideos = useMemo(
    () => (Array.isArray(store.academyVideos) ? store.academyVideos : []),
    [store.academyVideos]
  );

  const [activeTab, setActiveTab] = useState("history");
  const [userIdInput, setUserIdInput] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserLabel, setSelectedUserLabel] = useState("");
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userSearchError, setUserSearchError] = useState("");

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [durationType, setDurationType] = useState("unlimited");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showConfirm, setShowConfirm] = useState(false);

  const [grantHistory, setGrantHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyUpdatingId, setHistoryUpdatingId] = useState("");

  const isAllSelected = allVideos.length > 0 && selectedIds.size === allVideos.length;
  const selectedVideos = useMemo(
    () => allVideos.filter((v) => selectedIds.has(String(v.id))),
    [allVideos, selectedIds]
  );
  const selectedDurationLabel =
    GIFT_DURATION_OPTIONS.find((o) => o.value === durationType)?.label || durationType;

  async function loadGrantHistory() {
    setHistoryLoading(true); setHistoryError("");
    try {
      const result = await apiRequest("/admin/video-grants");
      setGrantHistory(Array.isArray(result?.grants) ? result.grants : []);
    } catch (error) {
      setHistoryError(error.message || "영상 선물 내역을 불러오지 못했습니다.");
      setGrantHistory([]);
    } finally { setHistoryLoading(false); }
  }

  useEffect(() => { if (activeTab === "history") loadGrantHistory(); }, [activeTab]);

  async function handleHistoryDurationChange(grantId, nextDurationType) {
    const prev = grantHistory;
    setGrantHistory((cur) => cur.map((g) => g.id === grantId ? { ...g, durationType: nextDurationType } : g));
    setHistoryUpdatingId(grantId); setHistoryError("");
    try {
      const result = await apiRequest(`/admin/video-grants/${encodeURIComponent(grantId)}`, { method: "PATCH", body: { durationType: nextDurationType } });
      const updated = result?.grant || {};
      setGrantHistory((cur) => cur.map((g) => g.id === grantId ? { ...g, durationType: updated.durationType || nextDurationType, expiresAt: updated.expiresAt ?? null } : g));
    } catch (error) {
      setGrantHistory(prev); setHistoryError(error.message || "선물 기간을 수정하지 못했습니다.");
    } finally { setHistoryUpdatingId(""); }
  }

  async function handleUserSearch() {
    const query = userIdInput.trim();
    if (!query) return;
    setUserSearchLoading(true); setUserSearchError(""); setSelectedUserId(""); setSelectedUserLabel("");
    try {
      const result = await apiRequest(`/admin/users?search=${encodeURIComponent(query)}&limit=1`);
      const users = Array.isArray(result?.users) ? result.users : [];
      if (!users.length) { setUserSearchError("해당 회원을 찾을 수 없습니다."); return; }
      const user = users[0];
      setSelectedUserId(String(user.id));
      setSelectedUserLabel(user.name || user.loginId || user.email || String(user.id));
    } catch (error) {
      setUserSearchError(error.message || "회원 검색에 실패했습니다.");
    } finally { setUserSearchLoading(false); }
  }

  function toggleSelectAll() {
    setSelectedIds(isAllSelected ? new Set() : new Set(allVideos.map((v) => String(v.id))));
  }
  function toggleVideo(id) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function handleSubmit() {
    if (!selectedUserId) { setMessage({ type: "error", text: "선물할 회원을 먼저 검색해서 선택해 주세요." }); return; }
    if (!selectedIds.size) { setMessage({ type: "error", text: "선물할 영상을 하나 이상 선택해 주세요." }); return; }
    setMessage({ type: "", text: "" }); setShowConfirm(true);
  }

  async function handleConfirmSubmit() {
    setSubmitting(true); setMessage({ type: "", text: "" });
    try {
      const result = await apiRequest(`/admin/users/${encodeURIComponent(selectedUserId)}/video-grants`, { method: "POST", body: { videoIds: [...selectedIds], durationType } });
      setMessage({ type: "success", text: result?.message || "영상이 선물되었습니다." });
      setSelectedIds(new Set()); setShowConfirm(false);
      if (activeTab === "history") await loadGrantHistory();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "선물 처리에 실패했습니다." });
    } finally { setSubmitting(false); }
  }

  return (
    <section className="admin-sales-embedded-panel" data-admin-panel="video-gifts">
      <section className="admin-sales-report-head compact">
        <div>
          <p className="section-kicker">관리자 대시보드</p>
          <h1>영상 선물 관리</h1>
        </div>
      </section>

      <section className="dashboard-card">
        <div className="admin-members-toolbar">
          <div className="admin-member-tabs">
            <button type="button" className={`admin-member-tab${activeTab === "gift" ? " active" : ""}`} onClick={() => setActiveTab("gift")}>영상 선물하기</button>
            <button type="button" className={`admin-member-tab${activeTab === "history" ? " active" : ""}`} onClick={() => setActiveTab("history")}>선물 내역</button>
          </div>
        </div>

        {message.text ? <p className={`admin-form-message ${message.type}`}>{message.text}</p> : null}

        {activeTab === "history" ? (
          <div className="video-gift-history-panel">
            {historyLoading ? <p className="admin-empty-copy">불러오는 중...</p> : null}
            {!historyLoading && historyError ? <p className="admin-empty-copy error">{historyError}</p> : null}
            {!historyLoading && !historyError && grantHistory.length === 0 ? <p className="admin-empty-copy">아직 영상 선물 내역이 없습니다.</p> : null}
            {!historyLoading && !historyError && grantHistory.length > 0 ? (
              <div className="video-gift-history-table-wrap">
                <table className="video-gift-history-table">
                  <thead>
                    <tr><th>회원</th><th>영상명</th><th>기간</th><th>상태</th><th>만료일</th><th>선물일</th></tr>
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
                              onChange={(e) => handleHistoryDurationChange(grant.id, e.target.value)}
                            >
                              {GIFT_DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </td>
                          <td><span className={expired ? "video-grant-status expired" : "video-grant-status active"}>{expired ? "만료" : "이용 중"}</span></td>
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
        ) : (
          <>
            <div className="video-gift-user-search">
              <p className="refund-section-label">선물 받을 회원 검색</p>
              <div className="video-gift-user-search-row">
                <input
                  type="text"
                  className="refund-amount-input"
                  placeholder="이름, 이메일, 아이디로 검색"
                  value={userIdInput}
                  onChange={(e) => setUserIdInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUserSearch()}
                  style={{ flex: 1 }}
                />
                <button type="button" className="pill-button small-pill" onClick={handleUserSearch} disabled={userSearchLoading}>
                  {userSearchLoading ? "검색 중..." : "검색"}
                </button>
              </div>
              {userSearchError ? <p className="admin-empty-copy error" style={{ margin: "4px 0 0" }}>{userSearchError}</p> : null}
              {selectedUserId ? (
                <p className="video-gift-selected-user">선택된 회원: <strong>{selectedUserLabel}</strong> (ID: {selectedUserId})</p>
              ) : null}
            </div>

            {allVideos.length === 0 ? (
              <p className="admin-empty-copy">선물할 수 있는 영상이 없습니다.</p>
            ) : (
              <>
                <div className="video-gift-controls">
                  <label className="video-gift-select-all">
                    <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} />
                    <span>전체 선택 ({allVideos.length}개)</span>
                  </label>
                  <div className="video-gift-duration-group">
                    <span className="video-gift-duration-label">선물 기간</span>
                    {GIFT_DURATION_OPTIONS.map((o) => (
                      <label key={o.value} className="video-gift-duration-option">
                        <input type="radio" name="gs-durationType" value={o.value} checked={durationType === o.value} onChange={() => setDurationType(o.value)} />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="video-gift-list">
                  {allVideos.map((video) => {
                    const isSelected = selectedIds.has(String(video.id));
                    return (
                      <label key={video.id} className={`video-gift-item ${isSelected ? "is-selected" : ""}`}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleVideo(String(video.id))} />
                        {video.image ? (
                          <img className="video-gift-thumb" src={resolveAcademyMediaUrl(video.image)} alt={video.title} loading="lazy" />
                        ) : (
                          <div className="video-gift-thumb video-gift-thumb-empty" />
                        )}
                        <div className="video-gift-info">
                          <strong className="video-gift-title">{video.title}</strong>
                          <span className="video-gift-meta">{video.instructor}{video.category ? ` · ${video.category}` : ""}</span>
                          {video.salePrice != null ? (
                            <span className="video-gift-price">
                              {formatCurrency(video.salePrice)}
                              {video.originalPrice > video.salePrice ? <em className="video-gift-discount"> {getDiscountRate(video.originalPrice, video.salePrice)}% 할인</em> : null}
                            </span>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="video-gift-submit-row">
                  <span className="video-gift-selected-count">{selectedIds.size}개 선택됨</span>
                  <button type="button" className="pill-button" disabled={submitting || selectedIds.size === 0} onClick={handleSubmit}>
                    {submitting ? "선물 중..." : `선택한 영상 선물하기 (${selectedIds.size}개)`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {showConfirm ? (
        <div className="video-gift-confirm-backdrop" role="presentation">
          <section className="video-gift-confirm-modal" role="dialog" aria-modal="true">
            <div className="video-gift-confirm-head">
              <h2>영상 선물 확인</h2>
              <button type="button" aria-label="닫기" onClick={() => setShowConfirm(false)} disabled={submitting}>×</button>
            </div>
            <dl className="video-gift-confirm-summary">
              <div><dt>받는 회원</dt><dd>{selectedUserLabel}</dd></div>
              <div><dt>선물 기간</dt><dd>{selectedDurationLabel}</dd></div>
              <div><dt>선택 영상</dt><dd>{selectedVideos.length}개</dd></div>
            </dl>
            <div className="video-gift-confirm-list">
              {selectedVideos.map((video) => <p key={video.id}>{video.title || video.id}</p>)}
            </div>
            <div className="video-gift-confirm-actions">
              <button type="button" className="ghost-button small-ghost" onClick={() => setShowConfirm(false)} disabled={submitting}>취소</button>
              <button type="button" className="pill-button" onClick={handleConfirmSubmit} disabled={submitting}>{submitting ? "선물 중..." : "최종 확인"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

const REFUND_STATUS_TABS = [
  { value: "", label: "전체" },
  { value: "pending", label: "검토 중" },
  { value: "approved", label: "환불 완료" },
  { value: "rejected", label: "거절됨" },
];
const REFUND_STATUS_LABELS = { pending: "검토 중", approved: "환불 완료", rejected: "거절됨" };
const REFUND_STATUS_CLASSES = { pending: "refund-status pending", approved: "refund-status approved", rejected: "refund-status rejected" };
const PASS_REFUND_STATUS_TABS = [
  { value: "", label: "전체" },
  { value: "requested", label: "검토 중" },
  { value: "approved", label: "환불 완료" },
  { value: "rejected", label: "거절됨" },
];
const PASS_REFUND_STATUS_LABELS = { requested: "검토 중", approved: "환불 완료", rejected: "거절됨" };

// 컴포넌트 역할: 매출 관리자 쉘 안에서 환불 관리를 바로 보여주는 본문 패널입니다.
function AdminSalesRefundPanel() {
  const [activeTab, setActiveTab] = useState("order");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionModal, setActionModal] = useState(null);
  const [approvedAmount, setApprovedAmount] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState({ type: "", text: "" });
  const [passStatusFilter, setPassStatusFilter] = useState("requested");
  const [passRefunds, setPassRefunds] = useState([]);
  const [passLoading, setPassLoading] = useState(true);
  const [passLoadError, setPassLoadError] = useState("");
  const [passActionSubmitting, setPassActionSubmitting] = useState(false);
  const [passActionMessage, setPassActionMessage] = useState({ type: "", text: "" });

  async function loadRequests(status) {
    setLoading(true); setLoadError("");
    try {
      const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
      const result = await apiRequest(`/refunds/admin${suffix}`);
      setRequests(Array.isArray(result?.requests) ? result.requests : []);
    } catch (error) {
      setRequests([]); setLoadError(error?.message || "환불 신청 목록을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }

  useEffect(() => { loadRequests(statusFilter); }, [statusFilter]);

  async function loadPassRefunds(status) {
    setPassLoading(true); setPassLoadError("");
    try {
      const items = await listAdminPassRefunds(status || undefined);
      setPassRefunds(items);
    } catch (error) {
      setPassRefunds([]); setPassLoadError(error?.message || "수강권 환불 목록을 불러오지 못했습니다.");
    } finally { setPassLoading(false); }
  }

  useEffect(() => { loadPassRefunds(passStatusFilter); }, [passStatusFilter]);

  async function handlePassResolve(refundId, status) {
    setPassActionSubmitting(true); setPassActionMessage({ type: "", text: "" });
    try {
      await resolveStudioPassRefund(refundId, status);
      setPassActionMessage({ type: "success", text: status === "approved" ? "수강권 환불이 승인되었습니다." : "수강권 환불이 거절되었습니다." });
      await loadPassRefunds(passStatusFilter);
    } catch (error) {
      setPassActionMessage({ type: "error", text: error?.message || "처리 중 오류가 발생했습니다." });
    } finally { setPassActionSubmitting(false); }
  }

  function openApproveModal(request) { setActionModal({ request, action: "approve" }); setApprovedAmount(String(request.requestedAmount || "")); setAdminNote(""); setActionMessage({ type: "", text: "" }); }
  function openRejectModal(request) { setActionModal({ request, action: "reject" }); setApprovedAmount(""); setAdminNote(""); setActionMessage({ type: "", text: "" }); }
  function closeModal() { setActionModal(null); setApprovedAmount(""); setAdminNote(""); setActionMessage({ type: "", text: "" }); }

  async function handleAction() {
    if (!actionModal) return;
    const { request, action } = actionModal;
    if (action === "approve") {
      const amount = Number(approvedAmount);
      if (!Number.isFinite(amount) || amount <= 0) { setActionMessage({ type: "error", text: "환불 금액은 1원 이상이어야 합니다." }); return; }
    }
    setActionSubmitting(true); setActionMessage({ type: "", text: "" });
    try {
      if (action === "approve") {
        await apiRequest(`/refunds/admin/${encodeURIComponent(request.id)}/approve`, { method: "POST", body: { approvedAmount: Number(approvedAmount), adminNote: adminNote.trim() } });
        setActionMessage({ type: "success", text: "환불 승인 및 처리가 완료되었습니다." });
      } else {
        await apiRequest(`/refunds/admin/${encodeURIComponent(request.id)}/reject`, { method: "POST", body: { adminNote: adminNote.trim() } });
        setActionMessage({ type: "success", text: "환불 신청이 거절되었습니다." });
      }
      await loadRequests(statusFilter);
      setTimeout(closeModal, 1000);
    } catch (error) {
      setActionMessage({ type: "error", text: error?.message || "처리 중 오류가 발생했습니다." });
    } finally { setActionSubmitting(false); }
  }

  return (
    <section className="admin-sales-embedded-panel" data-admin-panel="refunds">
      <section className="admin-sales-report-head compact">
        <div>
          <p className="section-kicker">관리자 대시보드</p>
          <h1>환불 관리</h1>
        </div>
      </section>

      <div className="refund-filter-tabs" style={{ marginBottom: "1rem" }}>
        <button type="button" className={`refund-filter-tab ${activeTab === "order" ? "active" : ""}`} onClick={() => setActiveTab("order")}>결제 환불</button>
        <button type="button" className={`refund-filter-tab ${activeTab === "pass" ? "active" : ""}`} onClick={() => setActiveTab("pass")}>수강권 환불</button>
      </div>

      <section className="dashboard-card">
        {activeTab === "order" ? (
          <>
            <div className="admin-members-toolbar">
              <h2>환불 신청 목록</h2>
              <span className="admin-range-caption">{loading ? "불러오는 중..." : `${requests.length}건`}</span>
            </div>
            <div className="refund-filter-tabs">
              {REFUND_STATUS_TABS.map((tab) => (
                <button key={tab.value} type="button" className={`refund-filter-tab ${statusFilter === tab.value ? "active" : ""}`} onClick={() => setStatusFilter(tab.value)}>{tab.label}</button>
              ))}
            </div>
            {loadError ? <p className="admin-empty-copy error">{loadError}</p> : null}
            {!loadError && !loading && requests.length === 0 ? <p className="admin-empty-copy">환불 신청이 없습니다.</p> : null}
            {!loadError && requests.length > 0 ? (
              <div className="refund-request-list">
                {requests.map((request) => {
                  const selectedProducts = Array.isArray(request.selectedProducts) ? request.selectedProducts : [];
                  const selectedCount = selectedProducts.length || (Array.isArray(request.selectedProductIds) ? request.selectedProductIds.length : 0);
                  return (
                    <article key={request.id} className="refund-request-card">
                      <div className="refund-request-head">
                        <div className="refund-request-title-wrap">
                          <strong className="refund-request-order">{request.orderName || request.orderId}</strong>
                          <span className={REFUND_STATUS_CLASSES[request.status] || "refund-status pending"}>{REFUND_STATUS_LABELS[request.status] || request.status}</span>
                        </div>
                        <span className="refund-request-amount">{formatCurrency(request.requestedAmount)}</span>
                      </div>
                      <dl className="refund-request-meta">
                        <div className="refund-meta-row"><dt>신청자</dt><dd>{request.customerEmail || "-"}</dd></div>
                        <div className="refund-meta-row"><dt>주문 ID</dt><dd className="refund-meta-id">{request.orderId}</dd></div>
                        <div className="refund-meta-row"><dt>신청일</dt><dd>{formatDateTime(request.createdAt)}</dd></div>
                        {request.resolvedAt ? <div className="refund-meta-row"><dt>처리일</dt><dd>{formatDateTime(request.resolvedAt)}</dd></div> : null}
                        <div className="refund-meta-row"><dt>주문 금액</dt><dd>{formatCurrency(request.orderAmount)}</dd></div>
                        <div className="refund-meta-row refund-meta-products">
                          <dt>환불 상품</dt>
                          <dd>
                            {selectedProducts.length > 0 ? (
                              <ul className="refund-product-list">
                                {selectedProducts.map((p) => (
                                  <li key={p.id} className={p.deleted ? "refund-product-deleted" : ""}>
                                    {p.name || "(삭제된 상품)"}
                                  </li>
                                ))}
                              </ul>
                            ) : `${selectedCount}개`}
                          </dd>
                        </div>
                      </dl>
                      {request.reason ? <p className="refund-request-reason">신청 사유: {request.reason}</p> : null}
                      {request.adminNote ? <p className="refund-request-admin-note">관리자 메모: {request.adminNote}</p> : null}
                      {request.status === "pending" ? (
                        <div className="refund-request-actions">
                          <button type="button" className="pill-button small-pill" onClick={() => openApproveModal(request)}>환불 승인</button>
                          <button type="button" className="ghost-button small-ghost" onClick={() => openRejectModal(request)}>거절</button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="admin-members-toolbar">
              <h2>수강권 환불 요청 목록</h2>
              <span className="admin-range-caption">{passLoading ? "불러오는 중..." : `${passRefunds.length}건`}</span>
            </div>
            <div className="refund-filter-tabs">
              {PASS_REFUND_STATUS_TABS.map((tab) => (
                <button key={tab.value} type="button" className={`refund-filter-tab ${passStatusFilter === tab.value ? "active" : ""}`} onClick={() => setPassStatusFilter(tab.value)}>{tab.label}</button>
              ))}
            </div>
            {passActionMessage.text ? <p className={`refund-modal-message ${passActionMessage.type}`}>{passActionMessage.text}</p> : null}
            {passLoadError ? <p className="admin-empty-copy error">{passLoadError}</p> : null}
            {!passLoadError && !passLoading && passRefunds.length === 0 ? <p className="admin-empty-copy">수강권 환불 요청이 없습니다.</p> : null}
            {!passLoadError && passRefunds.length > 0 ? (
              <div className="refund-request-list">
                {passRefunds.map((refund) => (
                  <article key={refund.id} className="refund-request-card">
                    <div className="refund-request-head">
                      <div className="refund-request-title-wrap">
                        <strong className="refund-request-order">{refund.passName || refund.passId}</strong>
                        <span className={REFUND_STATUS_CLASSES[refund.status] || "refund-status pending"}>{PASS_REFUND_STATUS_LABELS[refund.status] || refund.status}</span>
                      </div>
                      <span className="refund-request-amount">{formatCurrency(refund.refundAmount)}</span>
                    </div>
                    <dl className="refund-request-meta">
                      <div className="refund-meta-row"><dt>신청자</dt><dd>{refund.customerEmail || refund.customerName || "-"}</dd></div>
                      <div className="refund-meta-row"><dt>신청일</dt><dd>{formatDateTime(refund.requestedAt)}</dd></div>
                      {refund.resolvedAt ? <div className="refund-meta-row"><dt>처리일</dt><dd>{formatDateTime(refund.resolvedAt)}</dd></div> : null}
                    </dl>
                    {refund.reason ? <p className="refund-request-reason">신청 사유: {refund.reason}</p> : null}
                    {refund.status === "requested" ? (
                      <div className="refund-request-actions">
                        <button type="button" className="pill-button small-pill" disabled={passActionSubmitting} onClick={() => handlePassResolve(refund.id, "approved")}>환불 승인</button>
                        <button type="button" className="ghost-button small-ghost" disabled={passActionSubmitting} onClick={() => handlePassResolve(refund.id, "rejected")}>거절</button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>

      {actionModal ? (
        <div className="refund-modal-backdrop" onClick={closeModal}>
          <div className="refund-modal" onClick={(e) => e.stopPropagation()}>
            <div className="refund-modal-header">
              <h2>{actionModal.action === "approve" ? "환불 승인" : "환불 거절"}</h2>
              <button type="button" className="refund-modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="refund-modal-body">
              <p className="refund-modal-order-name">{actionModal.request.orderName || actionModal.request.orderId}</p>
              <p className="refund-request-reason">신청 사유: {actionModal.request.reason || "-"}</p>
              {actionModal.action === "approve" ? (
                <div className="refund-reason-group">
                  <label className="refund-section-label" htmlFor="rs-approved-amount">환불 금액</label>
                  <input id="rs-approved-amount" type="number" className="refund-amount-input" value={approvedAmount} min={0} max={actionModal.request.orderAmount || undefined} onChange={(e) => setApprovedAmount(e.target.value)} />
                  <p className="refund-amount-hint">신청 금액: {formatCurrency(actionModal.request.requestedAmount)} / 주문 금액: {formatCurrency(actionModal.request.orderAmount)}</p>
                </div>
              ) : null}
              <div className="refund-reason-group">
                <label className="refund-section-label" htmlFor="rs-admin-note">관리자 메모 (선택)</label>
                <textarea id="rs-admin-note" className="refund-reason-input" rows={3} placeholder="처리 메모를 입력해 주세요." value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
              </div>
              {actionMessage.text ? <p className={`refund-modal-message ${actionMessage.type}`}>{actionMessage.text}</p> : null}
            </div>
            <div className="refund-modal-footer">
              <button type="button" className="ghost-button" onClick={closeModal}>취소</button>
              <button type="button" className={actionModal.action === "approve" ? "pill-button" : "ghost-button refund-reject-btn"} disabled={actionSubmitting} onClick={handleAction}>
                {actionSubmitting ? "처리 중..." : actionModal.action === "approve" ? "환불 승인 및 처리" : "거절 확정"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// 컴포넌트 역할: 매출 관리자 쉘 안에서 강의 상품 관리를 바로 보여주는 본문 패널입니다.
function AdminSalesProductPanel() {
  const EMPTY_FORM = { name: "", price: "", description: "", period: "" };
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  function formatProductCurrency(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    return `₩${num.toLocaleString("ko-KR")}`;
  }

  async function loadProducts() {
    setLoadingProducts(true);
    setLoadError("");
    try {
      const result = await apiRequest("/products");
      setProducts(Array.isArray(result) ? result : []);
    } catch (error) {
      setLoadError(error?.message || "상품 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => { loadProducts(); }, []);

  function handleEdit(product) {
    setEditingId(product.id);
    setShowForm(true);
    setForm({ name: product.name || "", price: String(product.price ?? ""), description: product.description || "", period: product.period || "" });
    setMessage({ type: "", text: "" });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setShowForm(false);
    setForm(EMPTY_FORM);
    setMessage({ type: "", text: "" });
  }

  function handleOpenCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setMessage({ type: "", text: "" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name) { setMessage({ type: "error", text: "상품 이름을 입력해주세요." }); return; }
    if (!Number.isFinite(price) || price < 0) { setMessage({ type: "error", text: "올바른 가격을 입력해주세요." }); return; }
    setSubmitting(true);
    setMessage({ type: "", text: "" });
    try {
      if (editingId) {
        await apiRequest(`/products/${editingId}`, { method: "PATCH", body: { name, price, description: form.description.trim(), period: form.period.trim() } });
        setMessage({ type: "success", text: "상품이 수정되었습니다." });
      } else {
        await apiRequest("/products", { method: "POST", body: { name, price, description: form.description.trim(), period: form.period.trim() } });
        setMessage({ type: "success", text: "상품이 등록되었습니다." });
      }
      setEditingId(null);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadProducts();
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "저장에 실패했습니다." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(productId) {
    setSubmitting(true);
    setMessage({ type: "", text: "" });
    try {
      await apiRequest(`/products/${productId}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      setMessage({ type: "success", text: "상품이 삭제되었습니다." });
      await loadProducts();
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "삭제에 실패했습니다." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="admin-sales-embedded-panel" data-admin-panel="products">
      <section className="admin-sales-report-head compact">
        <div>
          <p className="section-kicker">관리자 대시보드</p>
          <h1>강의 상품 관리</h1>
        </div>
        <button type="button" className="admin-classlist-btn primary" onClick={handleOpenCreate}>
          상품 등록
        </button>
      </section>

      {message.text ? (
        <p className={`admin-message ${message.type === "error" ? "admin-message-error" : "admin-message-success"}`}>
          {message.text}
        </p>
      ) : null}

      <section className="dashboard-card">
        <div className="admin-card-header-row">
          <div>
            <h2 className="admin-card-title">상품 목록 ({products.length}개)</h2>
            <p className="admin-card-description">현재 판매 중이거나 관리 중인 교육 상품입니다.</p>
          </div>
        </div>
        {loadingProducts ? (
          <p className="admin-empty-copy">불러오는 중...</p>
        ) : loadError ? (
          <p className="admin-empty-copy error">{loadError}</p>
        ) : products.length === 0 ? (
          <p className="admin-empty-copy">등록된 상품이 없습니다. 상품 등록 버튼을 눌러 추가해주세요.</p>
        ) : (
          <div className="admin-product-list">
            {products.map((product) => (
              <div key={product.id} className="admin-product-item">
                <div className="admin-product-info">
                  <strong className="admin-product-name">{product.name}</strong>
                  <span className="admin-product-price">{formatProductCurrency(product.price)}</span>
                  {product.period ? <span className="admin-product-period">수강기간: {product.period}</span> : null}
                  {product.description ? <p className="admin-product-desc">{product.description}</p> : null}
                </div>
                <div className="admin-product-actions">
                  <button type="button" className="ghost-button small-ghost" onClick={() => handleEdit(product)} disabled={submitting}>수정</button>
                  {deleteConfirmId === product.id ? (
                    <>
                      <span className="admin-delete-confirm-text">정말 삭제할까요?</span>
                      <button type="button" className="ghost-button small-ghost danger" onClick={() => handleDelete(product.id)} disabled={submitting}>확인</button>
                      <button type="button" className="ghost-button small-ghost" onClick={() => setDeleteConfirmId(null)} disabled={submitting}>취소</button>
                    </>
                  ) : (
                    <button type="button" className="ghost-button small-ghost" onClick={() => setDeleteConfirmId(product.id)} disabled={submitting}>삭제</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showForm ? (
        <section className="dashboard-card">
          <div className="admin-card-header-row">
            <div>
              <h2 className="admin-card-title">{editingId ? "상품 수정" : "새 상품 등록"}</h2>
              <p className="admin-card-description">{editingId ? "선택한 상품의 정보를 수정합니다." : "새로 판매할 교육 상품 정보를 입력합니다."}</p>
            </div>
            <button type="button" className="ghost-button small-ghost" onClick={handleCancelEdit} disabled={submitting}>닫기</button>
          </div>
          <form className="admin-product-form" onSubmit={handleSubmit}>
            <div className="admin-form-row">
              <label className="admin-form-label">
                상품 이름 <span className="required">*</span>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="상품 이름" disabled={submitting} />
              </label>
              <label className="admin-form-label">
                가격 (원) <span className="required">*</span>
                <input type="number" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="0" disabled={submitting} />
              </label>
              <label className="admin-form-label">
                수강 기간
                <input type="text" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} placeholder="예: 90일, 365일" disabled={submitting} />
              </label>
            </div>
            <label className="admin-form-label">
              설명
              <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="상품 설명" disabled={submitting} />
            </label>
            <div className="admin-form-actions">
              <button type="submit" className="primary-button" disabled={submitting}>{submitting ? "저장 중..." : editingId ? "수정 저장" : "상품 등록"}</button>
              <button type="button" className="ghost-button" onClick={handleCancelEdit} disabled={submitting}>취소</button>
            </div>
          </form>
        </section>
      ) : null}
    </section>
  );
}

// 컴포넌트 역할: 매출 관리자 쉘 안에서 교육회원 관리 카드를 바로 보여주는 본문 패널입니다.
function AdminSalesMemberPanel({ store, navigate }) {
  const canManageGrades = canManageUserGrades(store.currentUser);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [memberTab, setMemberTab] = useState("all");
  const [memberPage, setMemberPage] = useState(1);
  const [savingGradeUserId, setSavingGradeUserId] = useState("");
  const [openLearningUserId, setOpenLearningUserId] = useState("");
  const [openPurchaseUserId, setOpenPurchaseUserId] = useState("");
  const [learningByUserId, setLearningByUserId] = useState({});
  const [learningLoadingUserId, setLearningLoadingUserId] = useState("");
  const [actionMessage, setActionMessage] = useState({ type: "", text: "" });
  const [withdrawingUserId, setWithdrawingUserId] = useState("");

  async function loadUsers() {
    try {
      setLoading(true);
      setErrorMessage("");
      const result = await apiRequest("/admin/dashboard/users");
      setUsers(Array.isArray(result?.users) ? result.users : []);
    } catch (error) {
      setErrorMessage(error.message || "회원 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const memberSegmentCounts = useMemo(() => {
    return users.reduce(
      (acc, user) => {
        const segment = getEducationMemberSegment(user);
        acc.all += 1;
        if (segment === "education") acc.education += 1;
        if (segment === "withdrawn") acc.withdrawn += 1;
        return acc;
      },
      { all: 0, education: 0, withdrawn: 0 }
    );
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const byTab = users.filter((user) => memberTab === "all" || getEducationMemberSegment(user) === memberTab);
    const bySearch = normalizedQuery
      ? byTab.filter((user) =>
          `${user.name || ""} ${user.loginId || ""} ${user.email || ""} ${formatUserGradeLabel(user.userGrade)}`
            .toLowerCase()
            .includes(normalizedQuery)
        )
      : byTab;
    return [...bySearch].sort(compareEducationMembers);
  }, [memberTab, searchQuery, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ADMIN_MEMBER_PAGE_SIZE));
  const pagedUsers = useMemo(() => {
    const safePage = Math.min(Math.max(memberPage, 1), totalPages);
    const start = (safePage - 1) * ADMIN_MEMBER_PAGE_SIZE;
    return filteredUsers.slice(start, start + ADMIN_MEMBER_PAGE_SIZE);
  }, [filteredUsers, memberPage, totalPages]);

  useEffect(() => {
    setMemberPage(1);
    setOpenLearningUserId("");
    setOpenPurchaseUserId("");
  }, [memberTab, searchQuery]);

  async function handleGradeChange(userId, nextGrade) {
    if (!canManageGrades) return;
    const previous = users;
    setSavingGradeUserId(userId);
    setActionMessage({ type: "", text: "" });
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, userGrade: nextGrade } : user)));

    try {
      const result = await apiRequest(`/admin/users/${encodeURIComponent(userId)}/grade`, {
        method: "PATCH",
        body: { userGrade: nextGrade },
      });
      if (result?.user?.id) {
        setUsers((current) => current.map((user) => (user.id === result.user.id ? { ...user, ...result.user } : user)));
      }
      setActionMessage({ type: "success", text: "회원 등급이 변경되었습니다." });
    } catch (error) {
      setUsers(previous);
      setActionMessage({ type: "error", text: error.message || "등급 변경에 실패했습니다." });
    } finally {
      setSavingGradeUserId("");
    }
  }

  async function handleWithdrawUser(user) {
    if (!window.confirm(`"${user.name}" 회원을 탈퇴 처리하시겠습니까?`)) return;
    setWithdrawingUserId(user.id);
    setActionMessage({ type: "", text: "" });
    try {
      await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/withdraw`, { method: "POST" });
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, accountStatus: "withdrawn" } : item)));
      setActionMessage({ type: "success", text: `${user.name} 회원이 탈퇴 처리되었습니다.` });
    } catch (error) {
      setActionMessage({ type: "error", text: error.message || "탈퇴 처리에 실패했습니다." });
    } finally {
      setWithdrawingUserId("");
    }
  }

  async function handleRestoreUser(user) {
    if (!window.confirm(`"${user.name}" 회원을 복구하시겠습니까?`)) return;
    setWithdrawingUserId(user.id);
    setActionMessage({ type: "", text: "" });
    try {
      await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/restore`, { method: "POST" });
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, accountStatus: "active" } : item)));
      setActionMessage({ type: "success", text: `${user.name} 회원이 복구되었습니다.` });
    } catch (error) {
      setActionMessage({ type: "error", text: error.message || "복구에 실패했습니다." });
    } finally {
      setWithdrawingUserId("");
    }
  }

  async function handleToggleLearning(userId) {
    if (openLearningUserId === userId) {
      setOpenLearningUserId("");
      return;
    }
    setOpenLearningUserId(userId);
    if (learningByUserId[userId]) return;

    try {
      setLearningLoadingUserId(userId);
      const result = await apiRequest(`/admin/dashboard/users/${encodeURIComponent(userId)}/progress?range=all`);
      setLearningByUserId((current) => ({
        ...current,
        [userId]: Array.isArray(result?.learning) ? result.learning : [],
      }));
    } catch (error) {
      setActionMessage({ type: "error", text: error.message || "수강 진도 조회에 실패했습니다." });
    } finally {
      setLearningLoadingUserId("");
    }
  }

  return (
    <section className="admin-sales-embedded-panel" data-admin-panel="members">
      <section className="admin-sales-report-head compact">
        <div>
          <p className="section-kicker">관리자 대시보드</p>
          <h1>교육 회원 관리</h1>
          <p>교육영상 회원의 구매, 수강 진도, 등급, 탈퇴 상태를 관리합니다.</p>
        </div>
      </section>

      <section className="dashboard-card admin-members-panel">
        <div className="admin-members-toolbar">
          <div className="admin-member-tabs">
            {[
              { value: "all", label: "전체", count: memberSegmentCounts.all },
              { value: "education", label: "교육회원", count: memberSegmentCounts.education },
              { value: "withdrawn", label: "탈퇴 회원", count: memberSegmentCounts.withdrawn },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={`admin-member-tab${memberTab === tab.value ? " active" : ""}`}
                onClick={() => setMemberTab(tab.value)}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <div className="admin-toolbar-right">
            <input
              type="search"
              value={searchQuery}
              placeholder="이름 / 아이디 / 이메일 / 등급 검색"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        {actionMessage.text ? <p className={`admin-form-message ${actionMessage.type}`}>{actionMessage.text}</p> : null}
        {loading ? <p className="admin-empty-copy">회원 정보를 불러오는 중입니다...</p> : null}
        {!loading && errorMessage ? <p className="admin-empty-copy error">{errorMessage}</p> : null}

        {!loading && !errorMessage ? (
          <div className="admin-member-list">
            {pagedUsers.length ? (
              pagedUsers.map((user) => {
                const purchases = Array.isArray(user.purchases) ? user.purchases : [];
                const learningRows = Array.isArray(learningByUserId[user.id]) ? learningByUserId[user.id] : [];
                const isLearningOpen = openLearningUserId === user.id;
                const isPurchaseOpen = openPurchaseUserId === user.id;
                const isWithdrawn = user.accountStatus === "withdrawn";
                const segment = getEducationMemberSegment(user);
                const segmentLabel = segment === "education" ? "교육회원" : segment === "withdrawn" ? "탈퇴 회원" : "";

                return (
                  <article key={user.id} className={`admin-member-card${isWithdrawn ? " is-withdrawn" : ""}`}>
                    <header className="admin-member-head">
                      <div>
                        <strong>{user.name}</strong>
                        {isWithdrawn ? <span className="admin-member-withdrawn-badge">탈퇴</span> : null}
                        <p>{user.loginId} · {user.email}</p>
                      </div>
                      <div className="admin-member-grade">
                        <span>{formatUserGradeLabel(user.userGrade)}</span>
                        {segmentLabel ? <span className="admin-member-segment-badge">{segmentLabel}</span> : null}
                        {canManageGrades && !isWithdrawn ? (
                          <select
                            value={String(user.userGrade || "member").toLowerCase()}
                            disabled={savingGradeUserId === user.id}
                            onChange={(event) => handleGradeChange(user.id, event.target.value)}
                          >
                            {USER_GRADE_OPTIONS.map((grade) => (
                              <option key={grade} value={grade}>{formatUserGradeLabel(grade)}</option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </header>

                    <div className="admin-member-metrics">
                      <span>가입일 {formatDateTime(user.createdAt)}</span>
                      <span>주문 {Number(user.orderCount || 0)}건</span>
                      <span>강의 구매 {Number(user.purchasedLectureCount || 0)}건</span>
                      <span>수강 시작 {Number(user.engagedLectureCount || 0)}건</span>
                      <span>수강 완료 {Number(user.completedLectureCount || 0)}건</span>
                      <span>수강 중 {Number(user.inProgressLectureCount || 0)}건</span>
                      <span>최근 학습 {formatDateTime(user.latestLearningAt)}</span>
                      <span>누적 {store.formatCurrency(toAmount(user.totalSpent))}</span>
                    </div>

                    <div className="admin-member-actions-row">
                      <button type="button" className="ghost-button small-ghost" onClick={() => handleToggleLearning(user.id)}>
                        {isLearningOpen ? "수강 진도 닫기" : "수강 진도 보기"}
                      </button>
                      <button type="button" className="ghost-button small-ghost" onClick={() => setOpenPurchaseUserId((current) => current === user.id ? "" : user.id)}>
                        {isPurchaseOpen ? "구매 이력 닫기" : "구매 이력 보기"}
                      </button>
                      {!isWithdrawn ? (
                        <button
                          type="button"
                          className="ghost-button small-ghost"
                          onClick={() =>
                            navigate(`/admin/members/${encodeURIComponent(user.id)}/gift-videos`, {
                              state: { userName: user.name, userEmail: user.email },
                            })
                          }
                        >
                          영상 선물하기
                        </button>
                      ) : null}
                      {canManageGrades ? (
                        isWithdrawn ? (
                          <button type="button" className="ghost-button small-ghost" disabled={withdrawingUserId === user.id} onClick={() => handleRestoreUser(user)}>
                            {withdrawingUserId === user.id ? "처리 중..." : "탈퇴 복구"}
                          </button>
                        ) : (
                          <button type="button" className="ghost-button small-ghost danger" disabled={withdrawingUserId === user.id} onClick={() => handleWithdrawUser(user)}>
                            {withdrawingUserId === user.id ? "처리 중..." : "회원 탈퇴"}
                          </button>
                        )
                      ) : null}
                    </div>

                    {isLearningOpen ? (
                      <div className="admin-learning-panel">
                        {learningLoadingUserId === user.id ? <p className="admin-empty-copy">회원 수강 진도를 불러오는 중입니다...</p> : null}
                        {learningLoadingUserId !== user.id && learningRows.length ? (
                          <div className="admin-learning-list">
                            {learningRows.map((learning) => (
                              <article key={`${user.id}-${learning.videoId}`} className="admin-learning-card">
                                <div className="admin-learning-head">
                                  <strong>{learning.title}</strong>
                                  <span>{learning.completed ? "완강" : "수강중"} · 진도 {learning.progressPercent}%</span>
                                </div>
                                <div className="admin-learning-meta">
                                  <span>강사 {learning.instructor}</span>
                                  <span>차시 {learning.completedChapterCount}/{learning.chapterCount}</span>
                                  <span>마지막 수강 {formatDateTime(learning.lastWatchedAt)}</span>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : null}
                        {learningLoadingUserId !== user.id && !learningRows.length ? (
                          <p className="admin-empty-copy">수강 진도 데이터가 없습니다.</p>
                        ) : null}
                      </div>
                    ) : null}

                    {isPurchaseOpen ? (
                      <div className="admin-purchase-details">
                        {purchases.length ? (
                          <div className="admin-purchase-table">
                            {purchases.map((purchase) => (
                              <article key={`${user.id}-${purchase.orderId}`} className="admin-purchase-row">
                                <div className="admin-purchase-meta">
                                  <strong>{purchase.orderName || purchase.orderId}</strong>
                                  <span>{formatDateTime(purchase.purchasedAt)}</span>
                                  <span>{store.formatCurrency(toAmount(purchase.amount || purchase.grossAmount))}</span>
                                </div>
                                <p>
                                  {(purchase.lectures || [])
                                    .map((lecture) => lecture.productName || lecture.productId)
                                    .filter(Boolean)
                                    .join(", ") || "구매 강의 정보 없음"}
                                </p>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="admin-empty-copy">구매 이력이 없습니다.</p>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <p className="admin-empty-copy">{searchQuery ? "검색 결과가 없습니다." : "해당 분류의 회원이 없습니다."}</p>
            )}

            <div className="admin-member-pagination" aria-label="회원 목록 페이지">
              <button type="button" disabled={memberPage <= 1} onClick={() => setMemberPage((page) => Math.max(1, page - 1))}>
                이전
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  className={memberPage === page ? "active" : ""}
                  aria-current={memberPage === page ? "page" : undefined}
                  onClick={() => setMemberPage(page)}
                >
                  {page}
                </button>
              ))}
              <button type="button" disabled={memberPage >= totalPages} onClick={() => setMemberPage((page) => Math.min(totalPages, page + 1))}>
                다음
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}

const BOARD_TABS = [
  { key: "events",    label: "이벤트" },
  { key: "reviews",  label: "후기" },
  { key: "inquiries",label: "문의" },
];

const EVENT_STATUS_OPTS = [
  { value: "", label: "전체" },
  { value: "진행중", label: "진행중" },
  { value: "종료", label: "종료" },
];

const INQUIRY_STATUS_OPTS = [
  { value: "", label: "전체" },
  { value: "answered", label: "답변완료" },
  { value: "unanswered", label: "미답변" },
];

const BOARD_PAGE_SIZE = 10;

function fmtBoardDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function AdminSalesBoardPanel() {
  const [tab, setTab] = useState("events");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [counts, setCounts] = useState({ events: 0, reviews: 0, inquiries: 0, pendingInquiries: 0 });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState({ title: "", summary: "", status: "진행중", startDate: "", endDate: "" });
  const [saving, setSaving] = useState(false);

  const [drawer, setDrawer] = useState({ item: null, details: null, replies: [], loading: false });
  const [replyText, setReplyText] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const [deleting, setDeleting] = useState("");

  useEffect(() => {
    async function loadCounts() {
      try {
        const [evts, revs, inqs] = await Promise.all([
          apiRequest("/community/events"),
          apiRequest("/community/reviews"),
          apiRequest("/community/inquiries"),
        ]);
        const ea = Array.isArray(evts) ? evts : [];
        const ra = Array.isArray(revs) ? revs : [];
        const ia = Array.isArray(inqs) ? inqs : [];
        setCounts({ events: ea.length, reviews: ra.length, inquiries: ia.length, pendingInquiries: ia.filter(i => Number(i.replyCount || 0) === 0).length });
      } catch { /* ignore */ }
    }
    loadCounts();
  }, []);

  useEffect(() => {
    async function loadItems() {
      setLoading(true);
      setErrorMsg("");
      setSuccessMsg("");
      setItems([]);
      setShowForm(false);
      setEditingEvent(null);
      setPage(1);
      setSearch("");
      setStatusFilter("");
      try {
        const endpoint = tab === "events" ? "/community/events" : tab === "reviews" ? "/community/reviews" : "/community/inquiries";
        const result = await apiRequest(endpoint);
        setItems(Array.isArray(result) ? result : []);
      } catch (e) {
        setErrorMsg(e.message || "목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
    loadItems();
  }, [tab]);

  const filteredItems = useMemo(() => {
    let list = [...items];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(item => (item.title || "").toLowerCase().includes(q) || (item.author || "").toLowerCase().includes(q));
    }
    if (statusFilter) {
      if (tab === "events") list = list.filter(item => item.status === statusFilter);
      else if (tab === "inquiries") {
        if (statusFilter === "answered") list = list.filter(item => Number(item.replyCount || 0) > 0);
        else if (statusFilter === "unanswered") list = list.filter(item => Number(item.replyCount || 0) === 0);
      }
    }
    list.sort((a, b) => {
      if (sortOrder === "views") return Number(b.views || 0) - Number(a.views || 0);
      const da = new Date(a.date || a.startDate || a.createdAt || 0).getTime();
      const db = new Date(b.date || b.startDate || b.createdAt || 0).getTime();
      return sortOrder === "oldest" ? da - db : db - da;
    });
    return list;
  }, [items, search, statusFilter, sortOrder, tab]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / BOARD_PAGE_SIZE));
  const paginatedItems = filteredItems.slice((page - 1) * BOARD_PAGE_SIZE, page * BOARD_PAGE_SIZE);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const s = new Set([1, totalPages, page, page - 1, page + 1].filter(p => p >= 1 && p <= totalPages));
    return [...s].sort((a, b) => a - b);
  }, [totalPages, page]);

  const statusOpts = tab === "events" ? EVENT_STATUS_OPTS : tab === "inquiries" ? INQUIRY_STATUS_OPTS : null;

  function openEventForm(event = null) {
    setEditingEvent(event);
    setEventForm(event
      ? { title: event.title || "", summary: event.summary || "", status: event.status || "진행중", startDate: event.startDate || "", endDate: event.endDate || "" }
      : { title: "", summary: "", status: "진행중", startDate: "", endDate: "" }
    );
    setShowForm(true);
    setErrorMsg("");
    setSuccessMsg("");
  }

  async function handleSaveEvent() {
    if (!eventForm.title.trim()) { setErrorMsg("제목을 입력해 주세요."); return; }
    if (!eventForm.summary.trim()) { setErrorMsg("설명을 입력해 주세요."); return; }
    setSaving(true);
    setErrorMsg("");
    try {
      const body = { title: eventForm.title.trim(), summary: eventForm.summary.trim(), status: eventForm.status, startDate: eventForm.startDate || undefined, endDate: eventForm.endDate || undefined };
      if (editingEvent) {
        const updated = await apiRequest(`/community/events/${editingEvent.id}`, { method: "PATCH", body });
        setItems(prev => prev.map(item => item.id === editingEvent.id ? { ...item, ...updated } : item));
        setSuccessMsg("이벤트가 수정되었습니다.");
      } else {
        const created = await apiRequest("/community/events", { method: "POST", body });
        if (created?.id) { setItems(prev => [created, ...prev]); setCounts(c => ({ ...c, events: c.events + 1 })); }
        setSuccessMsg("이벤트가 등록되었습니다.");
      }
      setShowForm(false);
      setEditingEvent(null);
    } catch (e) {
      setErrorMsg(e.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("삭제하시겠습니까?")) return;
    setDeleting(String(id));
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const endpoint = tab === "events" ? `/community/events/${id}` : tab === "reviews" ? `/community/reviews/${id}` : `/community/inquiries/${id}`;
      await apiRequest(endpoint, { method: "DELETE" });
      setItems(prev => prev.filter(item => String(item.id) !== String(id)));
      setCounts(c => ({ ...c, [tab]: Math.max(0, c[tab] - 1) }));
      setSuccessMsg("삭제되었습니다.");
    } catch (e) {
      setErrorMsg(e.message || "삭제에 실패했습니다.");
    } finally {
      setDeleting("");
    }
  }

  async function openDetail(item) {
    setReplyText("");
    setDrawer({ item, details: null, replies: [], loading: true });
    try {
      if (tab === "events") {
        setDrawer(prev => ({ ...prev, details: item, loading: false }));
      } else if (tab === "reviews") {
        const [det, cmts] = await Promise.all([
          apiRequest(`/community/reviews/${item.id}`),
          apiRequest(`/community/reviews/${item.id}/comments`),
          apiRequest(`/community/reviews/${item.id}/views`, { method: "POST" }),
        ]);
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, views: (i.views || 0) + 1 } : i));
        setDrawer(prev => ({ ...prev, details: det, replies: Array.isArray(cmts) ? cmts : [], loading: false }));
      } else if (tab === "inquiries") {
        const [det, reps] = await Promise.all([
          apiRequest(`/community/inquiries/${item.id}`),
          apiRequest(`/community/inquiries/${item.id}/replies`),
          apiRequest(`/community/inquiries/${item.id}/views`, { method: "POST" }),
        ]);
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, views: (i.views || 0) + 1 } : i));
        setDrawer(prev => ({ ...prev, details: det, replies: Array.isArray(reps?.replies) ? reps.replies : Array.isArray(reps) ? reps : [], loading: false }));
      }
    } catch { setDrawer(prev => ({ ...prev, loading: false })); }
  }

  function closeDrawer() { setDrawer({ item: null, details: null, replies: [], loading: false }); setReplyText(""); }

  async function handleSaveReply(inquiryId) {
    if (!replyText.trim()) { setErrorMsg("답변 내용을 입력해 주세요."); return; }
    setReplySaving(true);
    setErrorMsg("");
    try {
      const result = await apiRequest(`/community/inquiries/${inquiryId}/replies`, { method: "POST", body: { content: replyText.trim() } });
      const newReply = result?.reply || (result?.id ? result : null);
      if (newReply) setDrawer(prev => ({ ...prev, replies: [...prev.replies, newReply] }));
      setReplyText("");
      setItems(prev => prev.map(item => item.id === inquiryId ? { ...item, replyCount: (item.replyCount || 0) + 1 } : item));
      setCounts(c => ({ ...c, pendingInquiries: Math.max(0, c.pendingInquiries - 1) }));
    } catch (e) {
      setErrorMsg(e.message || "답변 등록에 실패했습니다.");
    } finally {
      setReplySaving(false);
    }
  }

  async function handleDeleteReply(replyId, inquiryId) {
    if (!window.confirm("답변을 삭제하시겠습니까?")) return;
    try {
      await apiRequest(`/community/inquiries/replies/${replyId}`, { method: "DELETE" });
      setDrawer(prev => ({ ...prev, replies: prev.replies.filter(r => r.id !== replyId) }));
      setItems(prev => prev.map(item => item.id === inquiryId ? { ...item, replyCount: Math.max(0, (item.replyCount || 1) - 1) } : item));
    } catch (e) {
      setErrorMsg(e.message || "답변 삭제에 실패했습니다.");
    }
  }

  function getStatusBadge(item) {
    if (tab === "events") {
      if (item.status === "진행중") return { cls: "active", label: "게시중" };
      if (item.status === "종료") return { cls: "ended", label: "종료" };
      return { cls: "draft", label: item.status || "-" };
    }
    if (tab === "inquiries") {
      return Number(item.replyCount || 0) > 0
        ? { cls: "answered", label: "답변완료" }
        : { cls: "pending", label: "미답변" };
    }
    return null;
  }

  function getItemDate(item) { return item.date || item.startDate || item.createdAt || ""; }
  function getItemThumb(item) { return item.image || item.imageUrl || ""; }

  const STAT_ICONS = { events: "🎁", reviews: "💬", inquiries: "❓" };

  return (
    <section className="adm-board-panel">
      <div className="adm-board-header">
        <h1 className="adm-board-title">게시판 관리</h1>
        <p className="adm-board-subtitle">게시글을 작성하고 관리할 수 있습니다.</p>
      </div>

      <div className="adm-board-stats">
        {BOARD_TABS.map(t => (
          <div key={t.key} className="adm-board-stat-card" onClick={() => setTab(t.key)} role="button" tabIndex={0}>
            <span className="adm-board-stat-icon">{STAT_ICONS[t.key]}</span>
            <div className="adm-board-stat-body">
              <strong className="adm-board-stat-num">{counts[t.key]}</strong>
              <span className="adm-board-stat-name">{t.label}</span>
              {t.key === "inquiries" && counts.pendingInquiries > 0
                ? <p className="adm-board-stat-alert">답변 대기 {counts.pendingInquiries}건</p>
                : <p className="adm-board-stat-sub">전체 {t.label} 게시글</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="adm-board-toolbar">
        <div className="adm-board-search">
          <svg className="adm-board-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input type="text" className="adm-board-search-input" placeholder="제목을 검색하세요." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {statusOpts && (
          <select className="adm-board-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            {statusOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <select className="adm-board-select" value={sortOrder} onChange={e => { setSortOrder(e.target.value); setPage(1); }}>
          <option value="newest">최신 순</option>
          <option value="oldest">오래된 순</option>
          <option value="views">조회수 순</option>
        </select>
        {tab === "events" && (
          <button type="button" className="pill-button adm-board-write-btn" onClick={() => openEventForm()}>+ 작성하기</button>
        )}
      </div>

      <div className="adm-board-tabs">
        {BOARD_TABS.map(t => (
          <button key={t.key} type="button" className={`adm-board-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {showForm && (
        <div className="adm-board-form-card">
          <h3 className="adm-board-form-title">{editingEvent ? "이벤트 수정" : "이벤트 작성"}</h3>
          <div className="adm-board-form-grid">
            <label className="adm-board-form-label adm-board-form-full">
              제목
              <input type="text" className="adm-board-form-input" value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))} placeholder="이벤트 제목" />
            </label>
            <label className="adm-board-form-label">
              상태
              <select className="adm-board-form-input" value={eventForm.status} onChange={e => setEventForm(f => ({ ...f, status: e.target.value }))}>
                <option value="진행중">진행중</option>
                <option value="종료">종료</option>
              </select>
            </label>
            <label className="adm-board-form-label">
              시작일
              <input type="date" className="adm-board-form-input" value={eventForm.startDate} onChange={e => setEventForm(f => ({ ...f, startDate: e.target.value }))} />
            </label>
            <label className="adm-board-form-label">
              종료일
              <input type="date" className="adm-board-form-input" value={eventForm.endDate} onChange={e => setEventForm(f => ({ ...f, endDate: e.target.value }))} />
            </label>
            <label className="adm-board-form-label adm-board-form-full">
              설명
              <textarea className="adm-board-form-input" rows={4} value={eventForm.summary} onChange={e => setEventForm(f => ({ ...f, summary: e.target.value }))} placeholder="이벤트 설명을 입력하세요" />
            </label>
          </div>
          {errorMsg && <p className="adm-board-msg error">{errorMsg}</p>}
          <div className="adm-board-form-actions">
            <button type="button" className="pill-button" disabled={saving} onClick={handleSaveEvent}>{saving ? "저장 중..." : "저장"}</button>
            <button type="button" className="ghost-button" onClick={() => { setShowForm(false); setEditingEvent(null); setErrorMsg(""); }}>취소</button>
          </div>
        </div>
      )}

      {!showForm && errorMsg && <p className="adm-board-msg error">{errorMsg}</p>}
      {successMsg && <p className="adm-board-msg success">{successMsg}</p>}

      <div className="adm-board-table-wrap">
        {loading ? (
          <div className="adm-board-empty">불러오는 중...</div>
        ) : paginatedItems.length === 0 ? (
          <div className="adm-board-empty">게시글이 없습니다.</div>
        ) : (
          <table className="adm-board-table">
            <thead>
              <tr>
                <th className="adm-board-th-num">번호</th>
                <th>제목</th>
                <th>작성자</th>
                {tab !== "reviews" && <th>상태</th>}
                <th>조회수</th>
                {tab === "events" ? <><th>시작일</th><th>종료일</th></> : <th>작성일</th>}
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item, localIdx) => {
                const globalIdx = filteredItems.length - ((page - 1) * BOARD_PAGE_SIZE + localIdx);
                const badge = getStatusBadge(item);
                const thumb = getItemThumb(item);
                const isDeleting = deleting === String(item.id);
                return (
                  <React.Fragment key={item.id}>
                    <tr>
                      <td className="adm-board-td-num">{globalIdx}</td>
                      <td>
                        <div className="adm-board-cell-title">
                          {thumb && <img className="adm-board-thumb" src={thumb} alt="" loading="lazy" />}
                          <div className="adm-board-title-wrap">
                            <button type="button" className="adm-board-title-btn" onClick={() => openDetail(item)}>
                              {item.title || "(제목 없음)"}
                            </button>
                            {(item.summary || item.content) && (
                              <span className="adm-board-title-sub">{String(item.summary || item.content || "").slice(0, 60)}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="adm-board-cell-author">
                          <span className="adm-board-avatar">👤</span>
                          <span>{item.author || (tab === "events" ? "관리자" : "-")}</span>
                        </div>
                      </td>
                      {tab !== "reviews" && (
                        <td>{badge && <span className={`adm-board-badge adm-board-badge--${badge.cls}`}>{badge.label}</span>}</td>
                      )}
                      <td className="adm-board-td-num">{item.views ?? "-"}</td>
                      {tab === "events"
                        ? <><td className="adm-board-td-date">{fmtBoardDate(item.startDate)}</td><td className="adm-board-td-date">{fmtBoardDate(item.endDate)}</td></>
                        : <td className="adm-board-td-date">{fmtBoardDate(getItemDate(item))}</td>}
                      <td>
                        <div className="adm-board-cell-actions">
                          {tab === "events" && (
                            <button type="button" className="ghost-button small-ghost" onClick={() => openEventForm(item)}>수정</button>
                          )}
                          <button type="button" className="ghost-button small-ghost danger" disabled={isDeleting} onClick={() => handleDelete(item.id)}>
                            {isDeleting ? "삭제 중..." : "삭제"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="adm-board-pagination">
          <button type="button" className="adm-board-page-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
          <button type="button" className="adm-board-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
          {pageNumbers.map((p, i) => (
            <React.Fragment key={p}>
              {i > 0 && pageNumbers[i - 1] && p - pageNumbers[i - 1] > 1 && (
                <span className="adm-board-page-ellipsis">...</span>
              )}
              <button type="button" className={`adm-board-page-btn${page === p ? " active" : ""}`} onClick={() => setPage(p)}>{p}</button>
            </React.Fragment>
          ))}
          <button type="button" className="adm-board-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          <button type="button" className="adm-board-page-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
        </div>
      )}

      {/* ─── 상세 드로어 ─────────────────────────────────── */}
      {drawer.item && (
        <>
          <div className="adm-drawer-overlay" onClick={closeDrawer} />
          <aside className="adm-drawer">
            {/* 헤더 */}
            <div className="adm-drawer-header">
              <div className="adm-drawer-header-meta">
                {tab !== "reviews" && (() => { const b = getStatusBadge(drawer.item); return b ? <span className={`adm-board-badge adm-board-badge--${b.cls}`}>{b.label}</span> : null; })()}
                <span className="adm-drawer-tab-label">{tab === "events" ? "이벤트" : tab === "reviews" ? "후기" : "문의"}</span>
              </div>
              <div className="adm-drawer-header-row">
                <h2 className="adm-drawer-title">{drawer.item.title || "(제목 없음)"}</h2>
                <button type="button" className="adm-drawer-close" onClick={closeDrawer} aria-label="닫기">✕</button>
              </div>
              <div className="adm-drawer-meta">
                <span>작성자: {drawer.item.author || (tab === "events" ? "관리자" : "-")}</span>
                {tab === "events" && drawer.item.startDate && (
                  <span>{fmtBoardDate(drawer.item.startDate)} ~ {fmtBoardDate(drawer.item.endDate)}</span>
                )}
                {tab !== "events" && <span>{fmtBoardDate(getItemDate(drawer.item))}</span>}
                {drawer.item.views != null && <span>조회 {drawer.item.views}</span>}
              </div>
            </div>

            {/* 본문 */}
            <div className="adm-drawer-body">
              {drawer.loading ? (
                <p className="adm-drawer-loading">불러오는 중...</p>
              ) : (
                <>
                  {/* 이벤트 이미지 */}
                  {tab === "events" && drawer.details?.image && (
                    <img className="adm-drawer-img" src={drawer.details.image} alt="" loading="lazy" />
                  )}
                  {/* 후기 이미지 */}
                  {tab === "reviews" && drawer.details?.imageUrl && (
                    <img className="adm-drawer-img" src={drawer.details.imageUrl} alt="" loading="lazy" />
                  )}

                  {/* 본문 텍스트 */}
                  <div className="adm-drawer-content">
                    {tab === "events"
                      ? (drawer.details?.summary || "-")
                      : (drawer.details?.content || "-")}
                  </div>

                  {/* 댓글 (후기) */}
                  {tab === "reviews" && (
                    <div className="adm-drawer-section">
                      <h4 className="adm-drawer-section-title">댓글 ({drawer.replies.length})</h4>
                      {drawer.replies.length === 0 ? (
                        <p className="adm-drawer-empty">댓글이 없습니다.</p>
                      ) : (
                        <div className="adm-drawer-replies">
                          {drawer.replies.map(c => (
                            <div key={c.id} className="adm-drawer-reply">
                              <div className="adm-drawer-reply-head">
                                <strong className="adm-drawer-reply-author">{c.author || "익명"}</strong>
                                <span className="adm-drawer-reply-date">{fmtBoardDate(c.createdAt)}</span>
                              </div>
                              <p className="adm-drawer-reply-text">{c.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 답변 (문의) */}
                  {tab === "inquiries" && (
                    <div className="adm-drawer-section">
                      <h4 className="adm-drawer-section-title">관리자 답변 ({drawer.replies.length})</h4>
                      {drawer.replies.length > 0 && (
                        <div className="adm-drawer-replies">
                          {drawer.replies.map(r => (
                            <div key={r.id} className="adm-drawer-reply adm-drawer-reply--admin">
                              <p className="adm-drawer-reply-text">{r.content}</p>
                              <div className="adm-drawer-reply-foot">
                                <span className="adm-drawer-reply-date">{fmtBoardDate(r.createdAt)}</span>
                                <button type="button" className="ghost-button small-ghost danger" onClick={() => handleDeleteReply(r.id, drawer.item.id)}>삭제</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {errorMsg && <p className="adm-board-msg error" style={{ marginTop: "0.5rem" }}>{errorMsg}</p>}
                      <div className="adm-drawer-reply-form">
                        <textarea
                          className="adm-drawer-reply-input"
                          rows={4}
                          placeholder="답변을 입력하세요"
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                        />
                        <button type="button" className="pill-button" disabled={replySaving} onClick={() => handleSaveReply(drawer.item.id)}>
                          {replySaving ? "등록 중..." : "답변 등록"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 푸터 */}
            <div className="adm-drawer-footer">
              {tab === "events" && !drawer.loading && (
                <button type="button" className="pill-button" onClick={() => { closeDrawer(); openEventForm(drawer.item); }}>수정하기</button>
              )}
              <button type="button" className="ghost-button" onClick={closeDrawer}>닫기</button>
            </div>
          </aside>
        </>
      )}
    </section>
  );
}

// 컴포넌트 역할: 관리자가 매출, 주문, 환불 분석을 기간별로 확인하는 대시보드 페이지 컴포넌트입니다.
export function AdminSalesDashboardPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const defaultStartDate = useMemo(() => {
    const copy = new Date(today);
    copy.setDate(copy.getDate() - 29);
    return toDateInputValue(copy);
  }, [today]);
  const defaultEndDate = useMemo(() => toDateInputValue(today), [today]);

  const [period, setPeriod] = useState("month");
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });
  const [appliedDateRange, setAppliedDateRange] = useState({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });
  const [videoSearchKeyword, setVideoSearchKeyword] = useState("");
  const [videoStatusFilter, setVideoStatusFilter] = useState("active");
  const [videoSortBy, setVideoSortBy] = useState("netRevenue");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [refundInsightsOpen, setRefundInsightsOpen] = useState(false);
  const [refundInsightsLoading, setRefundInsightsLoading] = useState(false);
  const [refundInsightsError, setRefundInsightsError] = useState("");
  const [refundInsightVideos, setRefundInsightVideos] = useState([]);
  const [selectedRefundInsightKey, setSelectedRefundInsightKey] = useState("");
  const [refundInsightSortBy, setRefundInsightSortBy] = useState("refundRate");
  const [topRankTab, setTopRankTab] = useState("revenue");
  const [activePanel, setActivePanel] = useState("sales");

  // 버튼 선택(period)과 실제 API 집계 단위를 분리: 오늘→일별, 주간→일별, 월간→주별, 연간→월별
  const apiPeriod = useMemo(() => {
    const map = { day: "day", week: "day", month: "week", year: "month" };
    return map[period] || period;
  }, [period]);

  async function handleLogout() {
    await store.logoutUser();
    navigate("/");
  }

  useEffect(() => {
    let mounted = true;

    async function loadSalesDashboard() {
      try {
        setLoading(true);
        setErrorMessage("");

        const query = new URLSearchParams();
        query.set("period", apiPeriod);

        if (appliedDateRange.startDate && appliedDateRange.endDate) {
          query.set("startDate", appliedDateRange.startDate);
          query.set("endDate", appliedDateRange.endDate);
        }

        const result = await apiRequest(`/admin/dashboard/sales?${query.toString()}`);
        if (!mounted) return;
        setDashboard(result || null);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "매출 데이터를 불러오지 못했습니다.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSalesDashboard();

    return () => {
      mounted = false;
    };
  }, [apiPeriod, appliedDateRange.startDate, appliedDateRange.endDate]);

  useEffect(() => {
    let mounted = true;

    async function loadRefundInsights() {
      try {
        setRefundInsightsLoading(true);
        setRefundInsightsError("");

        const query = new URLSearchParams();
        query.set("period", apiPeriod);

        if (appliedDateRange.startDate && appliedDateRange.endDate) {
          query.set("startDate", appliedDateRange.startDate);
          query.set("endDate", appliedDateRange.endDate);
        }

        const result = await apiRequest(
          `/admin/dashboard/sales/refund-insights?${query.toString()}`
        );
        if (!mounted) return;

        const videos = Array.isArray(result?.videos) ? result.videos : [];
        setRefundInsightVideos(videos);
        setSelectedRefundInsightKey((current) => {
          if (videos.some((item) => resolveRefundInsightKey(item) === current)) return current;
          return resolveRefundInsightKey(videos[0]);
        });
      } catch (error) {
        if (!mounted) return;
        setRefundInsightsError(error.message || "환불/취소 인사이트를 불러오지 못했습니다.");
      } finally {
        if (mounted) setRefundInsightsLoading(false);
      }
    }

    loadRefundInsights();

    return () => {
      mounted = false;
    };
  }, [refundInsightsOpen, apiPeriod, appliedDateRange.startDate, appliedDateRange.endDate]);

  const summary = dashboard?.summary || {
    lifetimeRevenue: 0,
    lifetimeGrossRevenue: 0,
    lifetimeNetRevenue: 0,
    lifetimeRefundRevenue: 0,
    lifetimeOrderCount: 0,
    periodRevenue: 0,
    periodGrossRevenue: 0,
    periodNetRevenue: 0,
    periodRefundRevenue: 0,
    periodOrderCount: 0,
    averageOrderAmount: 0,
  };

  const resolvedRange = dashboard?.range || { startDate: "", endDate: "", isCustomRange: false };
  const series = Array.isArray(dashboard?.series) ? dashboard.series : [];
  const videoSales = Array.isArray(dashboard?.videoSales) ? dashboard.videoSales : [];
  const ageGroupSales = Array.isArray(dashboard?.ageGroupSales) ? dashboard.ageGroupSales : [];
  const selectedPeriod = String(dashboard?.period || period || "")
    .trim()
    .toLowerCase();
  const selectedVisibleCount = resolvedRange.isCustomRange
    ? series.length
    : PERIOD_VISIBLE_COUNT[selectedPeriod] || series.length;
  const chartSeries = useMemo(
    () => series.slice(-selectedVisibleCount),
    [selectedVisibleCount, series]
  );
  const periodLabel =
    PERIOD_LABEL_BY_VALUE[selectedPeriod] ||
    SALES_PERIOD_OPTIONS.find((option) => option.value === selectedPeriod)?.label ||
    "기간별";
  const periodUnit = PERIOD_UNIT_LABEL[selectedPeriod] || "";
  const chartTitle = resolvedRange.isCustomRange && resolvedRange.startDate && resolvedRange.endDate
    ? `${periodLabel} 매출 추이 (${resolvedRange.startDate} ~ ${resolvedRange.endDate})`
    : `${periodLabel} 매출 추이 (최근 ${selectedVisibleCount}${periodUnit})`;

  const topRevenueVideos = useMemo(() => videoSales.slice(0, 3), [videoSales]);
  const topSaleCountVideos = useMemo(
    () =>
      [...videoSales]
        .sort((a, b) => {
          const saleDiff = toAmount(b.saleCount) - toAmount(a.saleCount);
          if (saleDiff !== 0) return saleDiff;
          return toAmount(b.netRevenue || b.revenue) - toAmount(a.netRevenue || a.revenue);
        })
        .slice(0, 3),
    [videoSales]
  );
  const topAgeGroups = useMemo(() => {
    if (ageGroupSales.length) {
      return ageGroupSales.slice(0, 3).map((item) => ({
        ...item,
        ageGroup: normalizeAgeGroupLabel(item?.ageGroup),
      }));
    }
    const fallbackOrders = toAmount(summary.periodOrderCount);
    const fallbackRevenue = toAmount(summary.periodNetRevenue || summary.periodRevenue);
    if (fallbackOrders <= 0 && fallbackRevenue <= 0) return [];
    return [
      {
        ageGroup: "미분류",
        orderCount: fallbackOrders,
        netRevenue: fallbackRevenue,
        revenue: fallbackRevenue,
      },
    ];
  }, [ageGroupSales, summary.periodNetRevenue, summary.periodOrderCount, summary.periodRevenue]);
  const academyVideoMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(store.academyVideos) ? store.academyVideos : []).forEach((video) => {
      const videoId = String(video?.id || "").trim();
      const productId = String(video?.productId || "").trim();
      if (videoId) map.set(`video:${videoId}`, video);
      if (productId) map.set(`product:${productId}`, video);
    });
    return map;
  }, [store.academyVideos]);

  const VIDEO_STATUS_FILTERS = [
    { key: "active", label: "활성화" },
    { key: "inactive", label: "비활성화" },
    { key: "deleted", label: "삭제" },
    { key: "all", label: "모아보기" },
  ];
  const topRankTabs = [
    { key: "revenue", label: "강의매출 TOP3", caption: "순매출 기준" },
    { key: "count", label: "판매건수 TOP3", caption: "판매수량 기준" },
    { key: "age", label: "연령대별 매출 TOP3", caption: "순매출 기준" },
  ];
  const filteredVideoSales = useMemo(() => {
    const keyword = String(videoSearchKeyword || "").trim().toLowerCase();
    if (!keyword) return videoSales;

    return videoSales.filter((item) => {
      const searchableText = [
        item?.title,
        item?.instructor,
        item?.productId,
        item?.videoId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchableText.includes(keyword);
    });
  }, [videoSales, videoSearchKeyword]);
  const filteredVideoSalesByStatus = useMemo(() => {
    return filteredVideoSales.filter((item) => {
      const productId = String(item?.productId || "").trim();
      const videoId = String(item?.videoId || "").trim();
      const linkedVideo =
        academyVideoMap.get(`product:${productId}`) ||
        academyVideoMap.get(`video:${videoId}`) ||
        null;

      const isDeleted = !linkedVideo;
      const isInactive = Boolean(linkedVideo?.isHidden);
      const isActive = Boolean(linkedVideo) && !isInactive;

      if (videoStatusFilter === "active") return isActive;
      if (videoStatusFilter === "inactive") return isInactive;
      if (videoStatusFilter === "deleted") return isDeleted;
      return true;
    });
  }, [academyVideoMap, filteredVideoSales, videoStatusFilter]);
  const sortedVideoSales = useMemo(() => {
    const list = [...filteredVideoSalesByStatus];
    return list.sort((a, b) => {
      if (videoSortBy === "title") {
        return String(a?.title || "").localeCompare(String(b?.title || ""), "ko-KR");
      }
      if (videoSortBy === "refundRate") {
        const rateA =
          toAmount(a?.grossRevenue) > 0
            ? (toAmount(a?.refundRevenue) / toAmount(a?.grossRevenue)) * 100
            : 0;
        const rateB =
          toAmount(b?.grossRevenue) > 0
            ? (toAmount(b?.refundRevenue) / toAmount(b?.grossRevenue)) * 100
            : 0;
        return rateB - rateA;
      }
      return toAmount(b?.[videoSortBy]) - toAmount(a?.[videoSortBy]);
    });
  }, [filteredVideoSalesByStatus, videoSortBy]);

  const periodGross = toAmount(summary.periodGrossRevenue || summary.periodRevenue);
  const periodNet = toAmount(summary.periodNetRevenue);
  const periodRefund = toAmount(summary.periodRefundRevenue);
  const periodOrders = toAmount(summary.periodOrderCount);
  const averageOrderAmount = toAmount(summary.averageOrderAmount);


  const lastSeries = chartSeries.length ? chartSeries[chartSeries.length - 1] : null;
  const prevSeries = chartSeries.length > 1 ? chartSeries[chartSeries.length - 2] : null;
  const lastNet = toAmount(lastSeries?.netRevenue);
  const prevNet = toAmount(prevSeries?.netRevenue);
  const netGrowthRate = prevNet > 0 ? ((lastNet - prevNet) / prevNet) * 100 : 0;
  const lastGross = toAmount(lastSeries?.grossRevenue || lastSeries?.totalRevenue);
  const prevGross = toAmount(prevSeries?.grossRevenue || prevSeries?.totalRevenue);
  const lastOrders = toAmount(lastSeries?.orderCount);
  const prevOrders = toAmount(prevSeries?.orderCount);
  const lastRefund = toAmount(lastSeries?.refundRevenue);
  const prevRefund = toAmount(prevSeries?.refundRevenue);
  const orderGrowthRate = prevOrders > 0 ? ((lastOrders - prevOrders) / prevOrders) * 100 : 0;
  const grossGrowthRate = prevGross > 0 ? ((lastGross - prevGross) / prevGross) * 100 : 0;
  const lastAverageOrder = lastOrders > 0 ? lastNet / lastOrders : 0;
  const prevAverageOrder = prevOrders > 0 ? prevNet / prevOrders : 0;
  const averageOrderGrowthRate =
    prevAverageOrder > 0 ? ((lastAverageOrder - prevAverageOrder) / prevAverageOrder) * 100 : 0;
  const lastRefundRate = lastGross > 0 ? (lastRefund / lastGross) * 100 : 0;
  const prevRefundRate = prevGross > 0 ? (prevRefund / prevGross) * 100 : 0;
  const refundRateGrowthRate =
    prevRefundRate > 0 ? ((lastRefundRate - prevRefundRate) / prevRefundRate) * 100 : 0;

  const refundRate = periodGross > 0 ? (periodRefund / periodGross) * 100 : 0;
  const sortedRefundInsightVideos = useMemo(() => {
    return [...refundInsightVideos].sort((a, b) => {
      const refundRateDiff = toAmount(b?.refundRate) - toAmount(a?.refundRate);
      const refundRevenueDiff = toAmount(b?.refundRevenue) - toAmount(a?.refundRevenue);
      const refundOrderDiff = toAmount(b?.refundOrderCount) - toAmount(a?.refundOrderCount);

      if (refundInsightSortBy === "refundRevenue") {
        if (refundRevenueDiff !== 0) return refundRevenueDiff;
        if (refundRateDiff !== 0) return refundRateDiff;
        return refundOrderDiff;
      }

      if (refundInsightSortBy === "refundOrderCount") {
        if (refundOrderDiff !== 0) return refundOrderDiff;
        if (refundRateDiff !== 0) return refundRateDiff;
        return refundRevenueDiff;
      }

      if (refundRateDiff !== 0) return refundRateDiff;
      if (refundRevenueDiff !== 0) return refundRevenueDiff;
      return refundOrderDiff;
    });
  }, [refundInsightSortBy, refundInsightVideos]);
  const selectedRefundInsightVideo = useMemo(() => {
    if (!sortedRefundInsightVideos.length) return null;
    return (
      sortedRefundInsightVideos.find(
        (item) => resolveRefundInsightKey(item) === selectedRefundInsightKey
      ) || sortedRefundInsightVideos[0]
    );
  }, [selectedRefundInsightKey, sortedRefundInsightVideos]);
  const selectedRefundReasons = Array.isArray(selectedRefundInsightVideo?.reasons)
    ? selectedRefundInsightVideo.reasons
    : [];
  const selectedRefundReasonTotalCount = useMemo(
    () =>
      selectedRefundReasons.reduce(
        (sum, item) => sum + Math.max(0, toAmount(item?.count)),
        0
      ),
    [selectedRefundReasons]
  );
  const topRefundReasons = useMemo(
    () =>
      selectedRefundReasons.slice(0, 5).map((item) => {
        const count = Math.max(0, toAmount(item?.count));
        const ratio =
          selectedRefundReasonTotalCount > 0
            ? (count / selectedRefundReasonTotalCount) * 100
            : 0;
        return { ...item, count, ratio };
      }),
    [selectedRefundReasonTotalCount, selectedRefundReasons]
  );

  const highestSeriesItem = useMemo(
    () =>
      chartSeries.reduce(
        (best, item) =>
          toAmount(item.netRevenue) > toAmount(best?.netRevenue) ? item : best,
        chartSeries[0] || null
      ),
    [chartSeries]
  );
  const averageDailyRevenue =
    chartSeries.length > 0
      ? chartSeries.reduce((sum, item) => sum + toAmount(item.netRevenue), 0) / chartSeries.length
      : 0;
  const topRiskVideo = sortedRefundInsightVideos[0] || null;
  const pendingRefundCount = toAmount(summary.pendingRefundCount);
  const pendingRefundAmount = toAmount(summary.pendingRefundAmount);
  const riskCards = [
    {
      label: "환불 요청",
      value: `${pendingRefundCount}건`,
      detail: store.formatCurrency(pendingRefundAmount),
      tone: pendingRefundCount > 0 ? "danger" : "success",
    },
    {
      label: "환불률",
      value: `${toPercent(refundRate)}%`,
      detail: refundRate >= 3 ? "평균보다 높음" : "안정 범위",
      tone: refundRate >= 3 ? "danger" : "success",
    },
    {
      label: "주의 영상",
      value: topRiskVideo ? `${toPercent(topRiskVideo.refundRate)}%` : "0.0%",
      detail: topRiskVideo?.title || "환불 위험 영상 없음",
      tone: topRiskVideo && toAmount(topRiskVideo.refundRate) >= 3 ? "warning" : "success",
    },
    {
      label: "환불 금액",
      value: store.formatCurrency(periodRefund),
      detail: `전 구간 대비 ${toPercent(refundRateGrowthRate)}%`,
      tone: periodRefund > 0 ? "warning" : "success",
    },
  ];

  const kpiCards = [
    {
      label: "순매출",
      value: store.formatCurrency(periodNet),
      hint: "전월 대비",
      growth: netGrowthRate,
      tone: netGrowthRate >= 0 ? "up" : "down",
    },
    {
      label: "주문건수",
      value: `${periodOrders}건`,
      hint: "전월 대비",
      growth: orderGrowthRate,
      tone: orderGrowthRate >= 0 ? "up" : "down",
    },
    {
      label: "객단가",
      value: store.formatCurrency(averageOrderAmount),
      hint: "전월 대비",
      growth: averageOrderGrowthRate,
      tone: averageOrderGrowthRate >= 0 ? "up" : "down",
    },
    {
      key: "refund-insight",
      label: "환불률",
      value: `${toPercent(refundRate)}%`,
      hint: refundRate >= 3 ? "경고 기준 초과" : "전월 대비",
      growth: refundRateGrowthRate,
      tone: refundRate >= 3 ? "danger" : refundRateGrowthRate <= 0 ? "up" : "down",
      clickable: true,
    },
    {
      label: "실매출",
      value: store.formatCurrency(Math.max(0, periodGross - periodRefund)),
      hint: "전월 대비",
      growth: grossGrowthRate,
      tone: grossGrowthRate >= 0 ? "up" : "down",
    },
  ];

  function downloadSalesReport() {
    const rangeLabel = resolvedRange.startDate && resolvedRange.endDate
      ? `${resolvedRange.startDate}_${resolvedRange.endDate}`
      : `${period}-${new Date().toISOString().slice(0, 10)}`;
    downloadXlsx(`sales-report-${rangeLabel}.xlsx`, [
      {
        name: "요약",
        rows: [
          ["항목", "값"],
          ["조회 시작일", resolvedRange.startDate || "기본 구간"],
          ["조회 종료일", resolvedRange.endDate || "기본 구간"],
          ["총매출", periodGross],
          ["순매출", periodNet],
          ["환불금액", periodRefund],
          ["주문건수", periodOrders],
          ["평균 객단가", toAmount(summary.averageOrderAmount)],
        ],
      },
      {
        name: "기간별 매출",
        rows: [["기간", "총매출", "순매출", "환불금액", "주문건수"], ...series.map((item) => [item.label, toAmount(item.grossRevenue), toAmount(item.netRevenue), toAmount(item.refundRevenue), toAmount(item.orderCount)])],
      },
      {
        name: "상품별 매출",
        rows: [["상품명", "강사", "판매수량", "주문건수", "총매출", "순매출", "환불금액"], ...videoSales.map((item) => [item.title, item.instructor || "-", toAmount(item.saleCount), toAmount(item.orderCount), toAmount(item.grossRevenue), toAmount(item.netRevenue || item.revenue), toAmount(item.refundRevenue)])],
      },
      {
        name: "연령대별 매출",
        rows: [["연령대", "주문건수", "총매출", "순매출", "환불금액"], ...ageGroupSales.map((item) => [item.ageGroup, toAmount(item.orderCount), toAmount(item.grossRevenue), toAmount(item.netRevenue || item.revenue), toAmount(item.refundRevenue)])],
      },
    ]);
  }

  function renderTopRankSection() {
    return (
      <section className="dashboard-card admin-sales-rank-section">
        <div className="admin-members-toolbar">
          <h2>TOP 성과 분석</h2>
          <div className="admin-sales-rank-tabbar" role="tablist" aria-label="TOP3 보기 전환">
            {topRankTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`admin-sales-rank-tab${topRankTab === tab.key ? " active" : ""}`}
                onClick={() => setTopRankTab(tab.key)}
                aria-pressed={topRankTab === tab.key}
              >
                {tab.key === "revenue" ? "매출 TOP3" : tab.key === "count" ? "판매량 TOP3" : "연령대 TOP3"}
              </button>
            ))}
          </div>
        </div>
        <span className="admin-range-caption">{topRankTabs.find((tab) => tab.key === topRankTab)?.caption}</span>
        <div className="admin-sales-rank-content">
          {topRankTab === "revenue" && (
            topRevenueVideos.length ? (
              <div className="admin-sales-rank-list">
                {topRevenueVideos.map((item, index) => {
                  const netRevenue = toAmount(item.netRevenue || item.revenue);
                  const percentage =
                    topRevenueVideos.length && toAmount(topRevenueVideos[0]?.netRevenue || topRevenueVideos[0]?.revenue) > 0
                      ? (netRevenue / toAmount(topRevenueVideos[0]?.netRevenue || topRevenueVideos[0]?.revenue)) * 100
                      : 0;
                  return (
                    <article key={`revenue-${item.productId || item.videoId}`} className="admin-sales-rank-item">
                      <div className="admin-sales-rank-medal">{index + 1}</div>
                      <div className="admin-sales-rank-main">
                        <div className="admin-sales-rank-head">
                          <strong>{item.title || item.productId}</strong>
                          <span>{store.formatCurrency(netRevenue)}</span>
                        </div>
                        <div className="admin-sales-rank-bar-track">
                          <div className="admin-sales-rank-bar" style={{ width: `${Math.max(6, Math.round(percentage))}%` }} />
                        </div>
                        <small>주문 {toAmount(item.orderCount)}건 · 판매수량 {toAmount(item.saleCount)}건</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="admin-empty-copy">영상 매출 데이터가 없습니다.</p>
          )}
          {topRankTab === "count" && (
            topSaleCountVideos.length ? (
              <div className="admin-sales-rank-list">
                {topSaleCountVideos.map((item, index) => {
                  const saleCount = toAmount(item.saleCount);
                  const percentage =
                    topSaleCountVideos.length && toAmount(topSaleCountVideos[0]?.saleCount) > 0
                      ? (saleCount / toAmount(topSaleCountVideos[0]?.saleCount)) * 100
                      : 0;
                  return (
                    <article key={`count-${item.productId || item.videoId}`} className="admin-sales-rank-item">
                      <div className="admin-sales-rank-medal">{index + 1}</div>
                      <div className="admin-sales-rank-main">
                        <div className="admin-sales-rank-head">
                          <strong>{item.title || item.productId}</strong>
                          <span>{saleCount}건</span>
                        </div>
                        <div className="admin-sales-rank-bar-track">
                          <div className="admin-sales-rank-bar sale" style={{ width: `${Math.max(6, Math.round(percentage))}%` }} />
                        </div>
                        <small>순매출 {store.formatCurrency(toAmount(item.netRevenue || item.revenue))}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="admin-empty-copy">판매건수 데이터가 없습니다.</p>
          )}
          {topRankTab === "age" && (
            topAgeGroups.length ? (
              <div className="admin-sales-rank-list">
                {topAgeGroups.map((item, index) => {
                  const netRevenue = toAmount(item.netRevenue || item.revenue);
                  const ageGroupLabel = normalizeAgeGroupLabel(item?.ageGroup);
                  const percentage =
                    topAgeGroups.length && toAmount(topAgeGroups[0]?.netRevenue || topAgeGroups[0]?.revenue) > 0
                      ? (netRevenue / toAmount(topAgeGroups[0]?.netRevenue || topAgeGroups[0]?.revenue)) * 100
                      : 0;
                  return (
                    <article key={`age-${ageGroupLabel || index}`} className="admin-sales-rank-item">
                      <div className="admin-sales-rank-medal">{index + 1}</div>
                      <div className="admin-sales-rank-main">
                        <div className="admin-sales-rank-head">
                          <strong>{ageGroupLabel}</strong>
                          <span>{store.formatCurrency(netRevenue)}</span>
                        </div>
                        <div className="admin-sales-rank-bar-track">
                          <div className="admin-sales-rank-bar age" style={{ width: `${Math.max(6, Math.round(percentage))}%` }} />
                        </div>
                        <small>주문 {toAmount(item.orderCount)}건</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="admin-empty-copy">연령대 데이터가 없습니다.</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="admin-sales-report-shell">
      <aside className="admin-sales-sidebar" aria-label="매출 관리자 메뉴">
        <Link className="admin-sales-sidebar-brand" to="/">
          <span className="admin-sales-sidebar-logo">ICL</span>
          <strong>이끌림 필라테스</strong>
          <small>관리자</small>
        </Link>
        <nav className="admin-sales-sidebar-nav">
          <button
            type="button"
            className={activePanel === "sales" ? "active" : ""}
            onClick={() => {
              if (activePanel === "sales") {
                window.location.reload();
                return;
              }
              setActivePanel("sales");
            }}
          >
            대시보드
          </button>
          <button
            type="button"
            className={activePanel === "members" ? "active" : ""}
            data-admin-panel-trigger="members"
            onClick={() => setActivePanel("members")}
          >
            회원 관리
          </button>
          <button
            type="button"
            className={activePanel === "products" ? "active" : ""}
            onClick={() => setActivePanel("products")}
          >
            강의 관리
          </button>
          <button
            type="button"
            className={activePanel === "refunds" ? "active" : ""}
            onClick={() => setActivePanel("refunds")}
          >
            환불 관리
          </button>
          <button
            type="button"
            className={activePanel === "video-gifts" ? "active" : ""}
            onClick={() => setActivePanel("video-gifts")}
          >
            선물 관리
          </button>
          <Link to="/admin/studio">필라테스 관리</Link>
          <button
            type="button"
            className={activePanel === "board" ? "active" : ""}
            onClick={() => setActivePanel("board")}
          >
            게시판 관리
          </button>
        </nav>
        <button className="admin-sales-sidebar-logout" type="button" onClick={handleLogout}>
          로그아웃
        </button>
      </aside>

      <main className="dashboard-page admin-dashboard-page admin-sales-page">
        {activePanel === "members" ? (
          <AdminSalesMemberPanel store={store} navigate={navigate} />
        ) : activePanel === "products" ? (
          <AdminSalesProductPanel />
        ) : activePanel === "refunds" ? (
          <AdminSalesRefundPanel />
        ) : activePanel === "video-gifts" ? (
          <AdminSalesVideoGiftPanel store={store} />
        ) : activePanel === "board" ? (
          <AdminSalesBoardPanel />
        ) : (
          <>
        <section className="admin-sales-report-head">
          <div>
            <p className="section-kicker">관리자 대시보드</p>
            <h1>매출 현황 보고서</h1>
            <p>
              매출 흐름과 핵심 지표를 한눈에 확인하세요.
              {dashboard?.generatedAt
                ? ` 최근 갱신 ${new Date(dashboard.generatedAt).toLocaleString("ko-KR")}`
                : ""}
            </p>
          </div>
          <div className="admin-sales-report-controls">
            <div className="admin-sales-period-tabs" aria-label="매출 조회 단위">
              {SALES_PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`admin-sales-period-tab${
                    period === option.value && !isCustomMode ? " active" : ""
                  }`}
                  aria-pressed={period === option.value && !isCustomMode}
                  onClick={() => {
                    setErrorMessage("");
                    setPeriod(option.value);
                    setIsCustomMode(false);
                    const preset = getPresetRange(option.value, today);
                    setDateRange(preset);
                    setAppliedDateRange(preset);
                  }}
                >
                  {option.value === "day" ? "오늘" : option.label}
                </button>
              ))}
              <button
                type="button"
                className={`admin-sales-period-tab${isCustomMode ? " active" : ""}`}
                onClick={() => {
                  if (!dateRange.startDate || !dateRange.endDate) {
                    setErrorMessage("시작일과 종료일을 모두 선택해 주세요.");
                    return;
                  }
                  if (dateRange.startDate > dateRange.endDate) {
                    setErrorMessage("시작일이 종료일보다 늦을 수 없습니다.");
                    return;
                  }
                  setErrorMessage("");
                  setIsCustomMode(true);
                  setAppliedDateRange({
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                  });
                }}
              >
                사용자 지정
              </button>
            </div>
            <div className="admin-sales-date-range">
              <input
                type="date"
                aria-label="매출 조회 시작일"
                value={dateRange.startDate}
                onChange={(event) =>
                  setDateRange((current) => ({ ...current, startDate: event.target.value }))
                }
              />
              <span>~</span>
              <input
                type="date"
                aria-label="매출 조회 종료일"
                value={dateRange.endDate}
                onChange={(event) =>
                  setDateRange((current) => ({ ...current, endDate: event.target.value }))
                }
              />
              <button
                type="button"
                className="admin-sales-range-button"
                onClick={() => {
                  if (!dateRange.startDate || !dateRange.endDate) {
                    setErrorMessage("시작일과 종료일을 모두 선택해 주세요.");
                    return;
                  }
                  if (dateRange.startDate > dateRange.endDate) {
                    setErrorMessage("시작일이 종료일보다 늦을 수 없습니다.");
                    return;
                  }
                  setErrorMessage("");
                  setIsCustomMode(true);
                  setAppliedDateRange({
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                  });
                }}
              >
                적용
              </button>
              <button
                type="button"
                className="admin-sales-range-button secondary"
                onClick={() => {
                  setErrorMessage("");
                  setIsCustomMode(false);
                  setPeriod("month");
                  setDateRange({ startDate: defaultStartDate, endDate: defaultEndDate });
                  setAppliedDateRange({ startDate: defaultStartDate, endDate: defaultEndDate });
                }}
              >
                초기화
              </button>
            </div>
          </div>
        </section>
        {errorMessage ? <p className="admin-empty-copy error">{errorMessage}</p> : null}
        {loading ? <p className="admin-empty-copy">매출 데이터를 불러오는 중입니다...</p> : null}

        {!loading && !errorMessage ? (
          <>
            <section className="admin-sales-kpi-grid" aria-label="매출 핵심 지표">
              {kpiCards.map((card) =>
                card.clickable ? (
                  <button
                    key={card.label}
                    type="button"
                    className={`dashboard-card admin-sales-kpi-card ${card.tone} clickable${
                      refundInsightsOpen ? " active" : ""
                    }`}
                    onClick={() => setRefundInsightsOpen((current) => !current)}
                    aria-expanded={refundInsightsOpen}
                  >
                    <div className="admin-sales-kpi-icon" aria-hidden="true">↺</div>
                    <p>{card.label}</p>
                    <strong>{card.value}</strong>
                    <span className={card.growth >= 0 ? "is-up" : "is-down"}>
                      {card.growth >= 0 ? "▲" : "▼"} {toPercent(Math.abs(card.growth || 0))}% {card.hint}
                    </span>
                  </button>
                ) : (
                  <article key={card.label} className={`dashboard-card admin-sales-kpi-card ${card.tone}`}>
                    <div className="admin-sales-kpi-icon" aria-hidden="true">₩</div>
                    <p>{card.label}</p>
                    <strong>{card.value}</strong>
                    <span className={card.growth >= 0 ? "is-up" : "is-down"}>
                      {card.growth >= 0 ? "▲" : "▼"} {toPercent(Math.abs(card.growth || 0))}% {card.hint}
                    </span>
                  </article>
                )
              )}
            </section>

            <section className="admin-sales-primary-grid">
              <section key={selectedPeriod} className="dashboard-card admin-sales-chart-panel">
                <div className="admin-members-toolbar">
                  <h2 data-admin-text-editable="false">매출 추세</h2>
                </div>
                <p className="admin-sales-range-copy">{chartTitle}</p>
                {chartSeries.length ? (
                  <SalesTrendChart
                    rows={chartSeries}
                    grossKey="grossRevenue"
                    netKey="netRevenue"
                    labelKey="label"
                    height={300}
                  />
                ) : (
                  <p className="admin-empty-copy">집계할 매출 데이터가 없습니다.</p>
                )}
                <div className="admin-sales-chart-summary">
                  <article>
                    <span>최고 매출일</span>
                    <strong>{highestSeriesItem?.label || "-"}</strong>
                    <b>{store.formatCurrency(toAmount(highestSeriesItem?.netRevenue))}</b>
                  </article>
                  <article>
                    <span>평균 매출</span>
                    <strong>{store.formatCurrency(averageDailyRevenue)}</strong>
                    <b>{chartSeries.length}개 구간 평균</b>
                  </article>
                  <article>
                    <span>전체 기간 매출</span>
                    <strong>{store.formatCurrency(periodNet)}</strong>
                    <b>순매출 기준</b>
                  </article>
                </div>
              </section>

              <div className="admin-sales-side-stack">
                <section className="dashboard-card admin-sales-risk-panel">
                  <div className="admin-members-toolbar">
                    <div>
                      <h2>주의가 필요한 항목</h2>
                      <p className="admin-sales-range-copy">환불률 3% 이상이면 경고로 표시됩니다.</p>
                    </div>
                    <button
                      type="button"
                      className="admin-sales-range-button secondary"
                      onClick={() => setRefundInsightsOpen((current) => !current)}
                    >
                      {refundInsightsOpen ? "상세 닫기" : "자세히 보기"}
                    </button>
                  </div>
                  {refundInsightsLoading ? (
                    <p className="admin-empty-copy">위험 지표를 불러오는 중입니다...</p>
                  ) : refundInsightsError ? (
                    <p className="admin-empty-copy error">{refundInsightsError}</p>
                  ) : (
                    <div className="admin-sales-risk-grid">
                      {riskCards.map((item) => (
                        <article key={item.label} className={`admin-sales-risk-card ${item.tone}`}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                          <small>{item.detail}</small>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
                {renderTopRankSection()}
              </div>
            </section>

            {refundInsightsOpen ? (
              <section className="dashboard-card admin-sales-refund-panel">
                <div className="admin-members-toolbar">
                  <h2>환불 관리 상세</h2>
                  <div className="admin-sales-refund-toolbar-right">
                    <select
                      className="admin-range-select"
                      value={refundInsightSortBy}
                      onChange={(event) => setRefundInsightSortBy(event.target.value)}
                      aria-label="환불 인사이트 정렬"
                    >
                      {REFUND_INSIGHT_SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <span className="admin-range-caption">제목 클릭 시 환불/취소 사유 확인</span>
                  </div>
                </div>
                {sortedRefundInsightVideos.length ? (
                  <div className="admin-sales-refund-layout">
                    <div className="admin-sales-refund-list-wrap">
                      <table className="admin-sales-refund-table">
                        <thead>
                          <tr>
                            <th>강의명</th>
                            <th>환불/취소율</th>
                            <th>환불/취소 금액</th>
                            <th>환불 주문건수</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedRefundInsightVideos.map((item) => {
                            const insightKey = resolveRefundInsightKey(item);
                            const isSelected = insightKey === resolveRefundInsightKey(selectedRefundInsightVideo);
                            return (
                              <tr key={insightKey || item.title} className={isSelected ? "is-selected" : ""}>
                                <td>
                                  <button
                                    type="button"
                                    className="admin-sales-refund-title-button"
                                    onClick={() => setSelectedRefundInsightKey(insightKey)}
                                  >
                                    {item.title || item.productId}
                                  </button>
                                </td>
                                <td>{toPercent(toAmount(item.refundRate))}%</td>
                                <td>{store.formatCurrency(toAmount(item.refundRevenue))}</td>
                                <td>{toAmount(item.refundOrderCount)}건</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <section className="admin-sales-refund-reason-panel">
                      <h3>{selectedRefundInsightVideo?.title || "선택된 영상 없음"}</h3>
                      <p className="admin-sales-refund-summary">환불/취소 사유 Top5</p>
                      {topRefundReasons.length ? (
                        <div className="admin-sales-refund-reason-list">
                          {topRefundReasons.map((reasonItem, index) => (
                            <article key={`${reasonItem.reason}-${index}`} className="admin-sales-refund-reason-item">
                              <div className="admin-sales-refund-reason-head">
                                <strong>{index + 1}. {reasonItem.reason || "사유 미입력"}</strong>
                                <span>{store.formatCurrency(toAmount(reasonItem.refundAmount))}</span>
                              </div>
                              <small>
                                발생 건수 {toAmount(reasonItem.count)}건 · 비율 {toPercent(reasonItem.ratio)}%
                              </small>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="admin-empty-copy">해당 영상의 환불/취소 사유 데이터가 없습니다.</p>
                      )}
                    </section>
                  </div>
                ) : (
                  <p className="admin-empty-copy">선택한 기간에 환불/취소 데이터가 없습니다.</p>
                )}
              </section>
            ) : null}

            <section className="admin-sales-secondary-grid" id="sales-detail">
              <section className="dashboard-card admin-sales-video-panel">
                <div className="admin-members-toolbar">
                  <h2>영상별 상세 매출</h2>
                  <div className="admin-sales-video-toolbar-right">
                    <input
                      type="search"
                      value={videoSearchKeyword}
                      onChange={(event) => setVideoSearchKeyword(event.target.value)}
                      placeholder="강의명 또는 강사명 검색"
                      aria-label="영상별 상세 매출 검색"
                    />
                    <div className="admin-sales-video-status-tabs" role="tablist" aria-label="영상 상태 필터">
                      {VIDEO_STATUS_FILTERS.map((filter) => (
                        <button
                          key={filter.key}
                          type="button"
                          className={`admin-sales-video-status-tab${videoStatusFilter === filter.key ? " active" : ""}`}
                          onClick={() => setVideoStatusFilter(filter.key)}
                          aria-pressed={videoStatusFilter === filter.key}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                    <select
                      className="admin-range-select"
                      value={videoSortBy}
                      onChange={(event) => setVideoSortBy(event.target.value)}
                      aria-label="영상별 상세 매출 정렬"
                    >
                      {VIDEO_SALES_SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button type="button" className="admin-sales-range-button" disabled={!dashboard} onClick={downloadSalesReport}>
                      엑셀 다운로드
                    </button>
                  </div>
                </div>
                <p className="admin-sales-range-copy">{periodLabel} 기준 · {sortedVideoSales.length}/{videoSales.length}개</p>
                {videoSales.length ? (
                  sortedVideoSales.length ? (
                    <div className="admin-sales-video-table-wrap">
                      <table className="admin-sales-video-table">
                        <thead>
                          <tr>
                            <th>No.</th>
                            <th>강의명</th>
                            <th>강사</th>
                            <th>상태</th>
                            <th>판매 수량</th>
                            <th>주문 건수</th>
                            <th>환불 건수</th>
                            <th>총매출</th>
                            <th>순매출</th>
                            <th>매출 비중</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedVideoSales.map((item, index) => {
                            const netRevenue = toAmount(item.netRevenue || item.revenue);
                            const share = periodNet > 0 ? (netRevenue / periodNet) * 100 : 0;
                            const productId = String(item?.productId || "").trim();
                            const videoId = String(item?.videoId || "").trim();
                            const linkedVideo =
                              academyVideoMap.get(`product:${productId}`) ||
                              academyVideoMap.get(`video:${videoId}`) ||
                              null;
                            const statusLabel = !linkedVideo ? "삭제" : linkedVideo?.isHidden ? "비활성" : "활성";
                            return (
                              <tr key={item.productId || item.videoId}>
                                <td>{index + 1}</td>
                                <td>{item.title || item.productId}</td>
                                <td>{item.instructor || "-"}</td>
                                <td><span className={`admin-sales-status-badge ${statusLabel}`}>{statusLabel}</span></td>
                                <td>{toAmount(item.saleCount)}건</td>
                                <td>{toAmount(item.orderCount)}건</td>
                                <td>{toAmount(item.refundOrderCount)}건</td>
                                <td>{store.formatCurrency(toAmount(item.grossRevenue))}</td>
                                <td>{store.formatCurrency(netRevenue)}</td>
                                <td>{toPercent(share)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="admin-empty-copy">선택한 상태/검색 조건에 맞는 영상 매출이 없습니다.</p>
                  )
                ) : (
                  <p className="admin-empty-copy">선택한 기간에 영상 매출 데이터가 없습니다.</p>
                )}
              </section>
            </section>
          </>
        ) : null}
          </>
        )}
      </main>
    </div>
  );
}

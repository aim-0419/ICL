// 파일 역할: 관리자가 환불 요청을 조회하고 승인 또는 거절하는 페이지 컴포넌트입니다.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { apiRequest } from "../../../shared/api/client.js";

// 함수 역할: 날짜 시간 값을 화면에 보여주기 좋은 문구로 변환합니다.
function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

// 함수 역할: 통화 값을 화면에 보여주기 좋은 문구로 변환합니다.
function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `₩${num.toLocaleString("ko-KR")}`;
}

const STATUS_TABS = [
  { value: "", label: "전체" },
  { value: "pending", label: "검토 중" },
  { value: "approved", label: "환불 완료" },
  { value: "rejected", label: "거절됨" },
];

const STATUS_LABELS = {
  pending: "검토 중",
  approved: "환불 완료",
  rejected: "거절됨",
};

const STATUS_CLASSES = {
  pending: "refund-status pending",
  approved: "refund-status approved",
  rejected: "refund-status rejected",
};

// 컴포넌트 역할: 관리자가 환불 요청을 조회하고 승인 또는 거절하는 페이지 컴포넌트입니다.
export function AdminRefundPage() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [actionModal, setActionModal] = useState(null);
  const [approvedAmount, setApprovedAmount] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState({ type: "", text: "" });

  async function loadRequests(status) {
    setLoading(true);
    setLoadError("");
    try {
      const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
      const result = await apiRequest(`/refunds/admin${suffix}`);
      setRequests(Array.isArray(result?.requests) ? result.requests : []);
    } catch (error) {
      setRequests([]);
      setLoadError(error?.message || "환불 신청 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests(statusFilter);
  }, [statusFilter]);

  function openApproveModal(request) {
    setActionModal({ request, action: "approve" });
    setApprovedAmount(String(request.requestedAmount || ""));
    setAdminNote("");
    setActionMessage({ type: "", text: "" });
  }

  function openRejectModal(request) {
    setActionModal({ request, action: "reject" });
    setApprovedAmount("");
    setAdminNote("");
    setActionMessage({ type: "", text: "" });
  }

  function closeModal() {
    setActionModal(null);
    setApprovedAmount("");
    setAdminNote("");
    setActionMessage({ type: "", text: "" });
  }

  async function handleAction() {
    if (!actionModal) return;
    const { request, action } = actionModal;

    if (action === "approve") {
      const amount = Number(approvedAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setActionMessage({ type: "error", text: "환불 금액은 1원 이상이어야 합니다." });
        return;
      }
    }

    setActionSubmitting(true);
    setActionMessage({ type: "", text: "" });
    try {
      if (action === "approve") {
        await apiRequest(`/refunds/admin/${encodeURIComponent(request.id)}/approve`, {
          method: "POST",
          body: {
            approvedAmount: Number(approvedAmount),
            adminNote: adminNote.trim(),
          },
        });
        setActionMessage({ type: "success", text: "환불 승인 및 처리가 완료되었습니다." });
      } else {
        await apiRequest(`/refunds/admin/${encodeURIComponent(request.id)}/reject`, {
          method: "POST",
          body: {
            adminNote: adminNote.trim(),
          },
        });
        setActionMessage({ type: "success", text: "환불 신청이 거절되었습니다." });
      }

      await loadRequests(statusFilter);
      setTimeout(closeModal, 1000);
    } catch (error) {
      setActionMessage({ type: "error", text: error?.message || "처리 중 오류가 발생했습니다." });
    } finally {
      setActionSubmitting(false);
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
          <Link className="admin-dashboard-switch-link" to="/admin/members">
            회원 관리
          </Link>
          <Link className="admin-dashboard-switch-link active" to="/admin/refunds">
            환불 관리
          </Link>
        </section>

        <section className="dashboard-hero mypage-hero-card">
          <p className="section-kicker">관리자 대시보드</p>
          <h1>환불 관리</h1>
        </section>

        <section className="admin-dashboard-grid admin-refund-grid">
          <section className="dashboard-card admin-members-panel">
            <div className="admin-members-toolbar">
              <h2>환불 신청 목록</h2>
              <span className="admin-range-caption">
                {loading ? "불러오는 중..." : `${requests.length}건`}
              </span>
            </div>

            <div className="refund-filter-tabs">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`refund-filter-tab ${statusFilter === tab.value ? "active" : ""}`}
                  onClick={() => setStatusFilter(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {loadError ? <p className="admin-empty-copy error">{loadError}</p> : null}
            {!loadError && !loading && requests.length === 0 ? (
              <p className="admin-empty-copy">환불 신청이 없습니다.</p>
            ) : null}

            {!loadError && requests.length > 0 ? (
              <div className="refund-request-list">
                {requests.map((request) => {
                  const selectedCount = Array.isArray(request.selectedProductIds)
                    ? request.selectedProductIds.length
                    : 0;

                  return (
                    <article key={request.id} className="refund-request-card">
                      <div className="refund-request-head">
                        <div className="refund-request-title-wrap">
                          <strong className="refund-request-order">{request.orderName || request.orderId}</strong>
                          <span className={STATUS_CLASSES[request.status] || "refund-status pending"}>
                            {STATUS_LABELS[request.status] || request.status}
                          </span>
                        </div>
                        <span className="refund-request-amount">{formatCurrency(request.requestedAmount)}</span>
                      </div>

                      <div className="refund-request-meta">
                        <span>주문ID: {request.orderId}</span>
                        <span>신청자: {request.customerEmail || "-"}</span>
                        <span>신청일: {formatDateTime(request.createdAt)}</span>
                        {request.resolvedAt ? <span>처리일: {formatDateTime(request.resolvedAt)}</span> : null}
                        <span>주문 금액: {formatCurrency(request.orderAmount)}</span>
                        <span>환불 상품: {selectedCount}개</span>
                      </div>

                      {request.reason ? (
                        <p className="refund-request-reason">신청 사유: {request.reason}</p>
                      ) : null}

                      {request.adminNote ? (
                        <p className="refund-request-admin-note">관리자 메모: {request.adminNote}</p>
                      ) : null}

                      {request.status === "pending" ? (
                        <div className="refund-request-actions">
                          <button
                            type="button"
                            className="pill-button small-pill"
                            onClick={() => openApproveModal(request)}
                          >
                            환불 승인
                          </button>
                          <button
                            type="button"
                            className="ghost-button small-ghost"
                            onClick={() => openRejectModal(request)}
                          >
                            거절
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        </section>
      </main>

      {actionModal ? (
        <div className="refund-modal-backdrop" onClick={closeModal}>
          <div className="refund-modal" onClick={(event) => event.stopPropagation()}>
            <div className="refund-modal-header">
              <h2>{actionModal.action === "approve" ? "환불 승인" : "환불 거절"}</h2>
              <button type="button" className="refund-modal-close" onClick={closeModal}>
                ×
              </button>
            </div>

            <div className="refund-modal-body">
              <p className="refund-modal-order-name">
                {actionModal.request.orderName || actionModal.request.orderId}
              </p>
              <p className="refund-request-reason">신청 사유: {actionModal.request.reason || "-"}</p>

              {actionModal.action === "approve" ? (
                <div className="refund-reason-group">
                  <label className="refund-section-label" htmlFor="approved-amount">
                    환불 금액
                  </label>
                  <input
                    id="approved-amount"
                    type="number"
                    className="refund-amount-input"
                    value={approvedAmount}
                    min={0}
                    max={actionModal.request.orderAmount || undefined}
                    onChange={(event) => setApprovedAmount(event.target.value)}
                  />
                  <p className="refund-amount-hint">
                    신청 금액: {formatCurrency(actionModal.request.requestedAmount)} / 주문 금액:{" "}
                    {formatCurrency(actionModal.request.orderAmount)}
                  </p>
                </div>
              ) : null}

              <div className="refund-reason-group">
                <label className="refund-section-label" htmlFor="admin-note">
                  관리자 메모 (선택)
                </label>
                <textarea
                  id="admin-note"
                  className="refund-reason-input"
                  rows={3}
                  placeholder="처리 메모를 입력해 주세요."
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                />
              </div>

              {actionMessage.text ? (
                <p className={`refund-modal-message ${actionMessage.type}`}>{actionMessage.text}</p>
              ) : null}
            </div>

            <div className="refund-modal-footer">
              <button type="button" className="ghost-button" onClick={closeModal}>
                취소
              </button>
              <button
                type="button"
                className={actionModal.action === "approve" ? "pill-button" : "ghost-button refund-reject-btn"}
                disabled={actionSubmitting}
                onClick={handleAction}
              >
                {actionSubmitting
                  ? "처리 중..."
                  : actionModal.action === "approve"
                    ? "환불 승인 및 처리"
                    : "거절 확정"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

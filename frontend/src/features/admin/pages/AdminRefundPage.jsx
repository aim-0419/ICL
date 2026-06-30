/**
 * [관리자 환불 관리 페이지]
 *
 * 관리자가 회원들의 환불 요청을 확인하고 승인·거절하는 화면입니다.
 * 두 가지 유형의 환불을 탭으로 구분해서 관리합니다:
 *
 *  1. 결제 환불  — 강의·상품 구매 건에 대한 환불 요청 (상태: pending / approved / rejected)
 *  2. 수강권 환불 — 스튜디오 수강권에 대한 환불 요청 (상태: requested / approved / rejected)
 *
 * ─ 사용 방법 ──────────────────────────────────────────────────────
 *  · 상단 탭에서 "결제 환불" 또는 "수강권 환불"을 선택합니다
 *  · 상태 필터 탭(전체 / 검토 중 / 완료 / 거절)으로 목록을 좁혀 볼 수 있습니다
 *  · 각 항목의 [환불 승인] 또는 [거절] 버튼을 눌러 처리합니다
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageLayout } from "../../../shared/components/PageLayout.jsx";
import { AdminDashboardNav } from "../components/AdminDashboardNav.jsx";
import { apiRequest } from "../../../shared/api/client.js";
import { listAdminPassRefunds, resolveStudioPassRefund } from "../../studio/api/studioApi.js";
import { formatDateTime, formatCurrency } from "../../../shared/utils/format.js";

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

const PASS_STATUS_TABS = [
  { value: "", label: "전체" },
  { value: "requested", label: "검토 중" },
  { value: "approved", label: "환불 완료" },
  { value: "rejected", label: "거절됨" },
];

const PASS_STATUS_LABELS = {
  requested: "검토 중",
  approved: "환불 완료",
  rejected: "거절됨",
};

// 컴포넌트 역할: 관리자가 환불 요청을 조회하고 승인 또는 거절하는 페이지 컴포넌트입니다.
export function AdminRefundPage() {
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

  async function loadPassRefunds(status) {
    setPassLoading(true);
    setPassLoadError("");
    try {
      const items = await listAdminPassRefunds(status || undefined);
      setPassRefunds(items);
    } catch (error) {
      setPassRefunds([]);
      setPassLoadError(error?.message || "수강권 환불 목록을 불러오지 못했습니다.");
    } finally {
      setPassLoading(false);
    }
  }

  useEffect(() => {
    loadPassRefunds(passStatusFilter);
  }, [passStatusFilter]);

  async function handlePassResolve(refundId, status) {
    setPassActionSubmitting(true);
    setPassActionMessage({ type: "", text: "" });
    try {
      await resolveStudioPassRefund(refundId, status);
      setPassActionMessage({
        type: "success",
        text: status === "approved" ? "수강권 환불이 승인되었습니다." : "수강권 환불이 거절되었습니다.",
      });
      await loadPassRefunds(passStatusFilter);
    } catch (error) {
      setPassActionMessage({ type: "error", text: error?.message || "처리 중 오류가 발생했습니다." });
    } finally {
      setPassActionSubmitting(false);
    }
  }

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
    <>
      <PageLayout mainClass="dashboard-page admin-dashboard-page">
        <AdminDashboardNav active="refunds" />
        </section>

        <section className="dashboard-hero mypage-hero-card">
          <p className="section-kicker">관리자 대시보드</p>
          <h1>환불 관리</h1>
        </section>

        <div className="refund-filter-tabs" style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className={`refund-filter-tab ${activeTab === "order" ? "active" : ""}`}
            onClick={() => setActiveTab("order")}
          >
            결제 환불
          </button>
          <button
            type="button"
            className={`refund-filter-tab ${activeTab === "pass" ? "active" : ""}`}
            onClick={() => setActiveTab("pass")}
          >
            수강권 환불
          </button>
        </div>

        <section className="admin-dashboard-grid admin-refund-grid">
          <section className="dashboard-card admin-members-panel">

            {activeTab === "order" ? (
              <>
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

                          <dl className="refund-request-meta">
                            <div className="refund-meta-row">
                              <dt>신청자</dt>
                              <dd>{request.customerEmail || "-"}</dd>
                            </div>
                            <div className="refund-meta-row">
                              <dt>주문 ID</dt>
                              <dd className="refund-meta-id">{request.orderId}</dd>
                            </div>
                            <div className="refund-meta-row">
                              <dt>신청일</dt>
                              <dd>{formatDateTime(request.createdAt)}</dd>
                            </div>
                            {request.resolvedAt ? (
                              <div className="refund-meta-row">
                                <dt>처리일</dt>
                                <dd>{formatDateTime(request.resolvedAt)}</dd>
                              </div>
                            ) : null}
                            <div className="refund-meta-row">
                              <dt>주문 금액</dt>
                              <dd>{formatCurrency(request.orderAmount)}</dd>
                            </div>
                            <div className="refund-meta-row">
                              <dt>환불 상품</dt>
                              <dd>{selectedCount}개</dd>
                            </div>
                          </dl>

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
              </>
            ) : (
              <>
                <div className="admin-members-toolbar">
                  <h2>수강권 환불 요청 목록</h2>
                  <span className="admin-range-caption">
                    {passLoading ? "불러오는 중..." : `${passRefunds.length}건`}
                  </span>
                </div>

                <div className="refund-filter-tabs">
                  {PASS_STATUS_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      className={`refund-filter-tab ${passStatusFilter === tab.value ? "active" : ""}`}
                      onClick={() => setPassStatusFilter(tab.value)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {passActionMessage.text ? (
                  <p className={`refund-modal-message ${passActionMessage.type}`}>{passActionMessage.text}</p>
                ) : null}

                {passLoadError ? <p className="admin-empty-copy error">{passLoadError}</p> : null}
                {!passLoadError && !passLoading && passRefunds.length === 0 ? (
                  <p className="admin-empty-copy">수강권 환불 요청이 없습니다.</p>
                ) : null}

                {!passLoadError && passRefunds.length > 0 ? (
                  <div className="refund-request-list">
                    {passRefunds.map((refund) => (
                      <article key={refund.id} className="refund-request-card">
                        <div className="refund-request-head">
                          <div className="refund-request-title-wrap">
                            <strong className="refund-request-order">{refund.passName || refund.passId}</strong>
                            <span className={STATUS_CLASSES[refund.status] || "refund-status pending"}>
                              {PASS_STATUS_LABELS[refund.status] || refund.status}
                            </span>
                          </div>
                          <span className="refund-request-amount">{formatCurrency(refund.refundAmount)}</span>
                        </div>

                        <div className="refund-request-meta">
                          <span>신청자: {refund.customerEmail || refund.customerName || "-"}</span>
                          <span>신청일: {formatDateTime(refund.requestedAt)}</span>
                          {refund.resolvedAt ? <span>처리일: {formatDateTime(refund.resolvedAt)}</span> : null}
                        </div>

                        {refund.reason ? (
                          <p className="refund-request-reason">신청 사유: {refund.reason}</p>
                        ) : null}

                        {refund.status === "requested" ? (
                          <div className="refund-request-actions">
                            <button
                              type="button"
                              className="pill-button small-pill"
                              disabled={passActionSubmitting}
                              onClick={() => handlePassResolve(refund.id, "approved")}
                            >
                              환불 승인
                            </button>
                            <button
                              type="button"
                              className="ghost-button small-ghost"
                              disabled={passActionSubmitting}
                              onClick={() => handlePassResolve(refund.id, "rejected")}
                            >
                              거절
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </>
            )}

          </section>
        </section>
      </PageLayout>

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
    </>
  );
}

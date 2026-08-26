/**
 * [관리자 교육 대시보드]
 *
 * 교육 플랫폼(아카데미) 전용 관리 화면입니다.
 *  - 회원 목록: 등급 변경, 수강 진도 조회, 구매 이력·환불 처리, 탈퇴·복구
 *  - 강의 수강 리포트: 강의별 완강률, 수강자 목록, 기간별 필터
 *
 * 스튜디오(필라테스) 운영 관리는 /admin/studio 에서 처리합니다.
 *
 * ─ 주요 규칙 ─────────────────────────────────────────────────────
 *  · admin0만 회원 등급 변경·탈퇴 처리 가능 (canManageUserGrades 로 판별)
 *  · 날짜·금액 포맷은 shared/utils/format.js 의 공통 함수를 사용합니다
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "../../../shared/components/PageLayout.jsx";
import { AdminDashboardNav } from "../components/AdminDashboardNav.jsx";
import { apiRequest } from "../../../shared/api/client.js";
import {
  canManageUserGrades,
  formatUserGradeLabel,
  USER_GRADE_OPTIONS,
} from "../../../shared/auth/userRoles.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { formatDateTime } from "../../../shared/utils/format.js";

const ADMIN_MEMBER_PAGE_SIZE = 10;

// ─── 이 파일에서만 사용하는 내부 헬퍼 함수들 ────────────────────────────────────

/** 금액을 숫자로 안전하게 변환합니다. null·undefined·비숫자가 들어오면 0을 반환합니다. */
function toAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}


/**
 * 구매(purchase) 객체에서 환불 관련 금액과 상태를 계산해 반환합니다.
 * - grossAmount     : 원래 결제 금액
 * - refundAmount    : 지금까지 환불된 금액
 * - netAmount       : 실제 매출 (결제 - 환불)
 * - refundableAmount: 아직 환불 가능한 잔여 금액
 * - refundStatus    : "paid" / "partial_refunded" / "refunded"
 * - statusLabel     : 화면에 표시할 한글 상태명
 */
function resolveRefundPresentation(purchase) {
  const grossAmount = Math.max(0, toAmount(purchase?.grossAmount ?? purchase?.amount));
  const refundAmount = Math.max(0, toAmount(purchase?.refundAmount));
  const netAmount = Math.max(0, grossAmount - refundAmount);
  const refundableAmount = Math.max(0, grossAmount - refundAmount);

  const explicitStatus = String(purchase?.refundStatus || "").trim().toLowerCase();
  const refundStatus =
    explicitStatus ||
    (refundAmount <= 0 ? "paid" : refundAmount >= grossAmount ? "refunded" : "partial_refunded");

  const statusLabel =
    refundStatus === "refunded"
      ? "환불 완료"
      : refundStatus === "partial_refunded"
        ? "부분 환불"
        : "결제 완료";

  return { grossAmount, refundAmount, netAmount, refundableAmount, refundStatus, statusLabel };
}

function hasEducationActivity(user) {
  return (
    Number(user?.purchasedLectureCount || 0) > 0 ||
    Number(user?.engagedLectureCount || 0) > 0 ||
    Number(user?.completedLectureCount || 0) > 0
  );
}

function compareAdminMembers(a, b) {
  const aWithdrawn = a?.accountStatus === "withdrawn";
  const bWithdrawn = b?.accountStatus === "withdrawn";
  if (aWithdrawn !== bWithdrawn) return aWithdrawn ? 1 : -1;

  const aName = String(a?.name || a?.loginId || a?.email || "");
  const bName = String(b?.name || b?.loginId || b?.email || "");
  const nameCompare = aName.localeCompare(bName, "ko-KR", { numeric: true, sensitivity: "base" });
  if (nameCompare !== 0) return nameCompare;

  return String(a?.id || "").localeCompare(String(b?.id || ""), "ko-KR", { numeric: true });
}

// ─── AdminDashboardPage 메인 컴포넌트 ────────────────────────────────────────────
export function AdminDashboardPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const currentUser = store.currentUser;
  const canManageGrades = canManageUserGrades(currentUser);

  // ── 회원 목록 관련 상태 ──────────────────────────────────────────────────────
  const [users, setUsers] = useState([]);            // 전체 회원 배열
  const [loading, setLoading] = useState(true);     // 회원 목록 로딩 중 여부
  const [errorMessage, setErrorMessage] = useState(""); // 목록 로드 실패 메시지
  const [searchQuery, setSearchQuery] = useState(""); // 이름·아이디·이메일 검색어
  const [savingGradeUserId, setSavingGradeUserId] = useState(""); // 등급 저장 중인 회원 ID
  const [gradeMessage, setGradeMessage] = useState({ type: "", text: "" }); // 등급 변경 결과 메시지
  const [memberTab, setMemberTab] = useState("all"); // all/education/withdrawn
  const [memberPage, setMemberPage] = useState(1); // 회원 목록 현재 페이지
  const [withdrawingUserId, setWithdrawingUserId] = useState(""); // 탈퇴·복구 처리 중인 회원 ID
  const [withdrawMessage, setWithdrawMessage] = useState({ type: "", text: "" }); // 탈퇴·복구 결과 메시지
  const [refundingOrderId, setRefundingOrderId] = useState(""); // 환불 처리 중인 주문 ID
  const [refundMessage, setRefundMessage] = useState({ type: "", text: "" }); // 환불 처리 결과 메시지

  // ── 수강 진도 관련 상태 ──────────────────────────────────────────────────────
  const [openLearningUserId, setOpenLearningUserId] = useState(""); // 수강 진도 패널을 열어 둔 회원 ID
  const [openPurchaseUserId, setOpenPurchaseUserId] = useState(""); // 구매 이력 패널을 열어 둔 회원 ID
  const [learningByUserId, setLearningByUserId] = useState({});    // 수강 진도 데이터 캐시 { "userId::range": [...] }
  const [learningLoadingUserId, setLearningLoadingUserId] = useState(""); // 진도 로딩 중인 회원 ID
  const [learningErrorByUserId, setLearningErrorByUserId] = useState({}); // 진도 로드 실패 메시지 캐시


  /**
   * 수강 진도 캐시 키를 생성합니다.
   * 같은 회원이더라도 기간 필터가 바뀌면 새로 로드해야 하므로 "userId::range" 형태로 구분합니다.
   */
  function buildLearningCacheKey(userId, range = "all") {
    return `${String(userId || "")}::${String(range || "all")}`;
  }

  /** 서버에서 전체 회원 목록을 불러옵니다. 페이지 첫 진입 시 한 번 호출됩니다. */
  async function loadDashboard() {
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
    loadDashboard();
  }, []);

  function getMemberSegment(user) {
    if (user?.accountStatus === "withdrawn") return "withdrawn";
    if (hasEducationActivity(user)) return "education";
    return "registered";
  }

  const activeUsers = useMemo(() => users.filter((u) => u.accountStatus !== "withdrawn"), [users]);

  const memberSegmentCounts = useMemo(() => {
    return users.reduce(
      (acc, user) => {
        const segment = getMemberSegment(user);
        acc.all += 1;
        if (segment === "education") acc.education += 1;
        if (segment === "withdrawn") acc.withdrawn += 1;
        return acc;
      },
      { all: 0, education: 0, withdrawn: 0 }
    );
  }, [users]);

  const filteredUsers = useMemo(() => {
    const base = users.filter((user) => memberTab === "all" || getMemberSegment(user) === memberTab);
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const searched = normalizedQuery
      ? base.filter((user) =>
          `${user.name} ${user.loginId} ${user.email} ${formatUserGradeLabel(user.userGrade)}`
            .toLowerCase()
            .includes(normalizedQuery)
        )
      : base;
    return [...searched].sort(compareAdminMembers);
  }, [searchQuery, memberTab, users]);

  const memberTotalPages = Math.max(1, Math.ceil(filteredUsers.length / ADMIN_MEMBER_PAGE_SIZE));
  const pagedUsers = useMemo(() => {
    const safePage = Math.min(Math.max(memberPage, 1), memberTotalPages);
    const start = (safePage - 1) * ADMIN_MEMBER_PAGE_SIZE;
    return filteredUsers.slice(start, start + ADMIN_MEMBER_PAGE_SIZE);
  }, [filteredUsers, memberPage, memberTotalPages]);

  useEffect(() => {
    setMemberPage(1);
    setOpenLearningUserId("");
    setOpenPurchaseUserId("");
  }, [memberTab, searchQuery]);

  useEffect(() => {
    if (memberPage > memberTotalPages) setMemberPage(memberTotalPages);
  }, [memberPage, memberTotalPages]);

  const summary = useMemo(() => {
    return activeUsers.reduce(
      (acc, user) => {
        const grade = String(user.userGrade || "member").toLowerCase();
        acc.totalMembers += 1;
        acc.totalRevenue += toAmount(user.totalSpent);
        if (grade === "vip") acc.totalVip += 1;
        if (grade === "vvip") acc.totalVvip += 1;
        return acc;
      },
      { totalMembers: 0, totalVip: 0, totalVvip: 0, totalRevenue: 0 }
    );
  }, [activeUsers]);

  /**
   * 회원 등급을 변경합니다. (admin0만 실행 가능)
   * 낙관적 업데이트(Optimistic Update) 방식을 사용합니다:
   * 먼저 화면을 즉시 바꾸고, 서버 저장에 실패하면 원래 상태로 되돌립니다.
   */
  async function handleGradeChange(userId, nextGrade) {
    if (!canManageGrades) return;

    const previous = users;
    setSavingGradeUserId(userId);
    setGradeMessage({ type: "", text: "" });

    setUsers((current) =>
      current.map((user) => (user.id === userId ? { ...user, userGrade: nextGrade } : user))
    );

    try {
      const result = await apiRequest(`/admin/users/${encodeURIComponent(userId)}/grade`, {
        method: "PATCH",
        body: { userGrade: nextGrade },
      });

      const updated = result?.user;
      if (updated?.id) {
        setUsers((current) =>
          current.map((user) => (user.id === updated.id ? { ...user, ...updated } : user))
        );
      }

      setGradeMessage({ type: "success", text: "회원 등급이 변경되었습니다." });
    } catch (error) {
      setUsers(previous);
      setGradeMessage({ type: "error", text: error.message || "등급 변경에 실패했습니다." });
    } finally {
      setSavingGradeUserId("");
    }
  }

  /**
   * 회원을 탈퇴 처리합니다. 미환불 구매가 있으면 경고를 먼저 보여줍니다.
   * 탈퇴 후 90일간 데이터가 보관되며, 복구 버튼으로 되살릴 수 있습니다.
   */
  async function handleWithdrawUser(user) {
    const purchases = Array.isArray(user.purchases) ? user.purchases : [];
    const activePurchases = purchases.filter((p) => {
      const { refundStatus, refundableAmount } = resolveRefundPresentation(p);
      return refundStatus !== "refunded" && refundableAmount > 0;
    });

    const warningLine = activePurchases.length > 0
      ? `\n\n⚠️ 미환불 구매 ${activePurchases.length}건이 있습니다. 탈퇴 전 환불 처리를 권장합니다.`
      : "";

    const confirmed = window.confirm(
      `"${user.name}" (${user.loginId}) 회원을 탈퇴 처리하시겠습니까?\n탈퇴 후 90일간 데이터가 보관되며 복구 가능합니다.${warningLine}`
    );
    if (!confirmed) return;

    setWithdrawingUserId(user.id);
    setWithdrawMessage({ type: "", text: "" });
    try {
      await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/withdraw`, { method: "POST" });
      setUsers((current) =>
        current.map((u) => (u.id === user.id ? { ...u, accountStatus: "withdrawn" } : u))
      );
      setWithdrawMessage({ type: "success", text: `${user.name} 회원이 탈퇴 처리되었습니다.` });
    } catch (error) {
      setWithdrawMessage({ type: "error", text: error.message || "탈퇴 처리에 실패했습니다." });
    } finally {
      setWithdrawingUserId("");
    }
  }

  async function handleRestoreUser(user) {
    const confirmed = window.confirm(`"${user.name}" (${user.loginId}) 회원의 탈퇴를 복구하시겠습니까?`);
    if (!confirmed) return;

    setWithdrawingUserId(user.id);
    setWithdrawMessage({ type: "", text: "" });
    try {
      await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/restore`, { method: "POST" });
      setUsers((current) =>
        current.map((u) => (u.id === user.id ? { ...u, accountStatus: "active" } : u))
      );
      setWithdrawMessage({ type: "success", text: `${user.name} 회원이 복구되었습니다.` });
    } catch (error) {
      setWithdrawMessage({ type: "error", text: error.message || "복구에 실패했습니다." });
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
    const cacheKey = buildLearningCacheKey(userId);
    if (learningByUserId[cacheKey]) return;

    try {
      setLearningLoadingUserId(userId);
      setLearningErrorByUserId((prev) => ({ ...prev, [cacheKey]: "" }));
      const result = await apiRequest(
        `/admin/dashboard/users/${encodeURIComponent(userId)}/progress?range=all`
      );
      setLearningByUserId((prev) => ({
        ...prev,
        [cacheKey]: Array.isArray(result?.learning) ? result.learning : [],
      }));
    } catch (error) {
      setLearningErrorByUserId((prev) => ({
        ...prev,
        [cacheKey]: error.message || "회원 수강 진도 조회에 실패했습니다.",
      }));
    } finally {
      setLearningLoadingUserId("");
    }
  }

  function handleTogglePurchase(userId) {
    setOpenPurchaseUserId((current) => (current === userId ? "" : userId));
  }

  /**
   * 구매 건에 대해 관리자 환불을 처리합니다.
   * 환불 금액을 직접 입력받고, 부분 환불도 허용합니다.
   * 성공 시 화면의 결제 금액·상태를 즉시 갱신합니다.
   */
  async function handleRefundPurchase(userId, purchase) {
    const orderId = String(purchase?.orderId || "").trim();
    if (!orderId) {
      setRefundMessage({ type: "error", text: "환불 가능한 주문 정보가 없습니다." });
      return;
    }

    const { grossAmount, refundAmount, refundableAmount } = resolveRefundPresentation(purchase);
    if (refundableAmount <= 0) {
      setRefundMessage({ type: "error", text: "이미 전액 환불된 주문입니다." });
      return;
    }

    const confirmed = window.confirm(
      `주문 ${purchase?.orderName || orderId} 건을 환불 처리하시겠습니까?\n환불 가능 금액: ${store.formatCurrency(
        refundableAmount
      )}`
    );
    if (!confirmed) return;

    const amountInput = window.prompt(
      `환불 금액을 입력해 주세요. (최대 ${store.formatCurrency(refundableAmount)})`,
      String(refundableAmount)
    );
    if (amountInput === null) return;

    const requestedAmount = Math.round(toAmount(String(amountInput).replace(/[^0-9.]/g, "")));
    if (!requestedAmount || requestedAmount <= 0) {
      setRefundMessage({ type: "error", text: "환불 금액이 올바르지 않습니다." });
      return;
    }
    if (requestedAmount > refundableAmount) {
      setRefundMessage({
        type: "error",
        text: `환불 금액이 환불 가능 금액(${store.formatCurrency(refundableAmount)})을 초과했습니다.`,
      });
      return;
    }

    const reasonInput = window.prompt("환불 사유를 입력해 주세요. (선택)", "관리자 환불 처리");
    const reason = reasonInput === null ? "" : String(reasonInput || "").trim();

    try {
      setRefundingOrderId(orderId);
      setRefundMessage({ type: "", text: "" });

      const result = await apiRequest(`/admin/orders/${encodeURIComponent(orderId)}/refund`, {
        method: "POST",
        body: {
          amount: requestedAmount,
          reason,
        },
      });

      const refundedOrder = result?.order || {};
      const nextRefundAmount = Math.max(refundAmount, toAmount(refundedOrder.refundAmount));
      const nextGrossAmount = Math.max(grossAmount, toAmount(refundedOrder.grossAmount));
      const nextNetAmount = Math.max(0, nextGrossAmount - nextRefundAmount);
      const nextStatus = String(refundedOrder.refundStatus || "").trim().toLowerCase();
      const nextRefundReason = String(refundedOrder.refundReason || reason || "").trim();

      setUsers((current) =>
        current.map((user) => {
          if (user.id !== userId) return user;

          const currentPurchases = Array.isArray(user.purchases) ? user.purchases : [];
          const nextPurchases = currentPurchases.map((item) => {
            if (String(item?.orderId || "") !== orderId) return item;
            return {
              ...item,
              amount: nextNetAmount,
              netAmount: nextNetAmount,
              grossAmount: nextGrossAmount,
              refundAmount: nextRefundAmount,
              refundableAmount: Math.max(0, nextGrossAmount - nextRefundAmount),
              refundStatus: nextStatus || (nextRefundAmount >= nextGrossAmount ? "refunded" : "partial_refunded"),
              refundReason: nextRefundReason,
            };
          });

          const nextTotalSpent = nextPurchases.reduce(
            (sum, item) => sum + toAmount(item?.netAmount ?? item?.amount),
            0
          );

          return {
            ...user,
            purchases: nextPurchases,
            totalSpent: nextTotalSpent,
          };
        })
      );

      setRefundMessage({ type: "success", text: result?.message || "환불 처리되었습니다." });
    } catch (error) {
      setRefundMessage({ type: "error", text: error.message || "환불 처리에 실패했습니다." });
    } finally {
      setRefundingOrderId("");
    }
  }

  return (
    <PageLayout mainClass="dashboard-page admin-dashboard-page">
      <AdminDashboardNav active="members" />

        <section className="dashboard-hero mypage-hero-card">
          <p className="section-kicker">관리자 대시보드</p>
          <h1>교육 회원 관리</h1>
          <div className="mypage-identity-row">
            <span className="mypage-identity-chip">VIP {summary.totalVip}명</span>
            <span className="mypage-identity-chip">VVIP {summary.totalVvip}명</span>
            <span className="mypage-identity-chip">교육 누적 매출 {store.formatCurrency(summary.totalRevenue)}</span>
          </div>
        </section>


        <section className="admin-dashboard-grid">
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

            {gradeMessage.text ? (
              <p className={`admin-form-message ${gradeMessage.type}`}>{gradeMessage.text}</p>
            ) : null}
            {withdrawMessage.text ? (
              <p className={`admin-form-message ${withdrawMessage.type}`}>{withdrawMessage.text}</p>
            ) : null}
            {refundMessage.text ? (
              <p className={`admin-form-message ${refundMessage.type}`}>{refundMessage.text}</p>
            ) : null}

            {loading ? <p className="admin-empty-copy">회원 정보를 불러오는 중입니다...</p> : null}
            {!loading && errorMessage ? <p className="admin-empty-copy error">{errorMessage}</p> : null}

            {!loading && !errorMessage ? (
              <div className="admin-member-list">
                {filteredUsers.length ? (
                  pagedUsers.map((user) => {
                    const purchases = Array.isArray(user.purchases) ? user.purchases : [];
                    const learningCacheKey = buildLearningCacheKey(user.id);
                    const learningRows = Array.isArray(learningByUserId[learningCacheKey])
                      ? learningByUserId[learningCacheKey]
                      : [];
                    const isLearningOpen = openLearningUserId === user.id;
                    const isPurchaseOpen = openPurchaseUserId === user.id;

                    const isWithdrawn = user.accountStatus === "withdrawn";
                    const memberSegment = getMemberSegment(user);
                    const segmentLabel =
                      memberSegment === "education"
                        ? "교육회원"
                        : memberSegment === "withdrawn"
                          ? "탈퇴 회원"
                          : "";
                    return (
                      <article key={user.id} className={`admin-member-card${isWithdrawn ? " is-withdrawn" : ""}`}>
                        <header className="admin-member-head">
                          <div>
                            <strong>{user.name}</strong>
                            {isWithdrawn && <span className="admin-member-withdrawn-badge">탈퇴</span>}
                            <p>
                              {user.loginId} · {user.email}
                            </p>
                            {isWithdrawn && user.withdrawnAt && (
                              <p className="admin-member-withdrawn-date">탈퇴일: {formatDateTime(user.withdrawnAt)}</p>
                            )}
                          </div>
                          <div className="admin-member-grade">
                            <span>{formatUserGradeLabel(user.userGrade)}</span>
                            {segmentLabel ? <span className="admin-member-segment-badge">{segmentLabel}</span> : null}
                            {canManageGrades && !isWithdrawn ? (
                              <select
                                aria-label={`${user.name} 회원 등급 변경`}
                                value={String(user.userGrade || "member").toLowerCase()}
                                disabled={savingGradeUserId === user.id}
                                onChange={(event) => handleGradeChange(user.id, event.target.value)}
                              >
                                {USER_GRADE_OPTIONS.map((grade) => (
                                  <option key={grade} value={grade}>
                                    {formatUserGradeLabel(grade)}
                                  </option>
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
                          <button
                            type="button"
                            className="ghost-button small-ghost"
                            onClick={() => handleToggleLearning(user.id)}
                          >
                            {isLearningOpen ? "수강 진도 닫기" : "수강 진도 보기"}
                          </button>
                          <button
                            type="button"
                            className="ghost-button small-ghost"
                            onClick={() => handleTogglePurchase(user.id)}
                          >
                            {isPurchaseOpen ? "구매 이력 닫기" : "구매 이력 보기"}
                          </button>
                          {!isWithdrawn && (
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
                          )}
                          {canManageGrades && (
                            isWithdrawn ? (
                              <button
                                type="button"
                                className="ghost-button small-ghost"
                                disabled={withdrawingUserId === user.id}
                                onClick={() => handleRestoreUser(user)}
                              >
                                {withdrawingUserId === user.id ? "처리 중..." : "탈퇴 복구"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="ghost-button small-ghost danger"
                                disabled={withdrawingUserId === user.id}
                                onClick={() => handleWithdrawUser(user)}
                              >
                                {withdrawingUserId === user.id ? "처리 중..." : "회원 탈퇴"}
                              </button>
                            )
                          )}
                        </div>

                        {isLearningOpen ? (
                          <div className="admin-learning-panel">
                            {learningLoadingUserId === user.id ? (
                              <p className="admin-empty-copy">회원 수강 진도를 불러오는 중입니다...</p>
                            ) : null}
                            {learningErrorByUserId[learningCacheKey] ? (
                              <p className="admin-empty-copy error">{learningErrorByUserId[learningCacheKey]}</p>
                            ) : null}

                            {learningLoadingUserId !== user.id && !learningErrorByUserId[learningCacheKey] ? (
                              learningRows.length ? (
                                <div className="admin-learning-list">
                                  {learningRows.map((learning) => (
                                    <article
                                      key={`${user.id}-${learning.videoId}`}
                                      className="admin-learning-card"
                                    >
                                      <div className="admin-learning-head">
                                        <strong>{learning.title}</strong>
                                        <span>
                                          {learning.completed ? "완강" : "수강중"} · 진도 {learning.progressPercent}%
                                        </span>
                                      </div>
                                      <div className="admin-learning-meta">
                                        <span>강사 {learning.instructor}</span>
                                        <span>카테고리 {learning.category}</span>
                                        <span>
                                          차시 {learning.completedChapterCount}/{learning.chapterCount}
                                        </span>
                                        <span>마지막 수강 {formatDateTime(learning.lastWatchedAt)}</span>
                                        <span>{learning.purchased ? "구매 완료" : "미구매"}</span>
                                      </div>
                                      {Array.isArray(learning.chapters) && learning.chapters.length ? (
                                        <div className="admin-learning-chapter-list">
                                          {learning.chapters.map((chapter) => (
                                            <div
                                              key={`${learning.videoId}-${chapter.chapterId}`}
                                              className="admin-learning-chapter-row"
                                            >
                                              <span>
                                                {chapter.chapterOrder}차시 · {chapter.chapterTitle}
                                              </span>
                                              <span>
                                                {chapter.completed ? "완료" : "진행중"} ({chapter.progressPercent}%)
                                              </span>
                                              <span>{formatDateTime(chapter.lastWatchedAt)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : null}
                                    </article>
                                  ))}
                                </div>
                              ) : (
                                <p className="admin-empty-copy">선택한 기간에 수강 진도 데이터가 없습니다.</p>
                              )
                            ) : null}
                          </div>
                        ) : null}

                        {isPurchaseOpen ? (
                          <div className="admin-purchase-details">
                            {purchases.length ? (
                              <div className="admin-purchase-table">
                                {purchases.map((purchase) => (
                                  <article key={`${user.id}-${purchase.orderId}`} className="admin-purchase-row">
                                    {(() => {
                                      const { grossAmount, refundAmount, netAmount, refundableAmount, statusLabel } =
                                        resolveRefundPresentation(purchase);
                                      const isRefunding = refundingOrderId === String(purchase.orderId || "");

                                      return (
                                        <>
                                          <div className="admin-purchase-meta">
                                            <strong>{purchase.orderName || purchase.orderId}</strong>
                                            <span>{formatDateTime(purchase.purchasedAt)}</span>
                                            <span>결제 {store.formatCurrency(grossAmount)}</span>
                                            <span>실매출 {store.formatCurrency(netAmount)}</span>
                                            <span>환불 {store.formatCurrency(refundAmount)}</span>
                                            <span
                                              className={`admin-purchase-refund-status ${
                                                refundAmount > 0 ? "refunded" : "paid"
                                              }`}
                                            >
                                              {statusLabel}
                                            </span>
                                          </div>
                                          <div className="admin-purchase-actions">
                                            <button
                                              type="button"
                                              className="ghost-button small-ghost"
                                              disabled={isRefunding || refundableAmount <= 0}
                                              onClick={() => handleRefundPurchase(user.id, purchase)}
                                            >
                                              {isRefunding
                                                ? "환불 처리 중..."
                                                : refundableAmount <= 0
                                                  ? "환불 완료"
                                                  : "환불 처리"}
                                            </button>
                                          </div>
                                        </>
                                      );
                                    })()}
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
                  <p className="admin-empty-copy">
                    {searchQuery ? "검색 결과가 없습니다." : "해당 분류의 회원이 없습니다."}
                  </p>
                )}
                {filteredUsers.length > 0 ? (
                  <div className="admin-member-pagination" aria-label="회원 목록 페이지">
                    <button
                      type="button"
                      disabled={memberPage <= 1}
                      onClick={() => setMemberPage((page) => Math.max(1, page - 1))}
                    >
                      이전
                    </button>
                    {Array.from({ length: memberTotalPages }, (_, index) => index + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        className={memberPage === page ? "active" : ""}
                        onClick={() => setMemberPage(page)}
                        aria-current={memberPage === page ? "page" : undefined}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={memberPage >= memberTotalPages}
                      onClick={() => setMemberPage((page) => Math.min(memberTotalPages, page + 1))}
                    >
                      다음
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

        </section>
    </PageLayout>
  );
}

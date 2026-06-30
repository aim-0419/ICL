import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "../../../shared/components/PageLayout.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { formatDateTime, formatYmd } from "../../../shared/utils/format.js";
import {
  bookStudioClass,
  cancelStudioClass,
  listMyStudioSummary,
  listStudioClasses,
  listStudioNotificationsByUser,
  markMyStudioNotificationRead,
  markMyStudioNotificationsRead,
  requestStudioPassRefund,
} from "../api/studioApi.js";
import { DEFAULT_STUDIO_BRANCH_ID, STUDIO_BRANCHES } from "../constants/studioBranches.js";

const CALENDAR_VIEW_OPTIONS = [
  { value: "day", label: "일" },
  { value: "week", label: "주" },
  { value: "month", label: "월" },
];

const STUDIO_INFO = [
  { title: "강사 정보", text: "수업별 담당 강사와 전문 분야를 예약 전에 확인합니다.", path: "/ikleulrim/instructors" },
  { title: "시설 정보", text: "리포머룸, 바렐존, 개인레슨룸 등 이용 공간을 확인합니다.", path: "/ikleulrim/equipment" },
];

function toDayOffsetByDate(value) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatRelativeClassDate(dayOffset) {
  const targetDate = addDays(new Date(), dayOffset);
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(targetDate);
  if (dayOffset === 0) return `오늘 · ${dateLabel}`;
  if (dayOffset === 1) return `내일 · ${dateLabel}`;
  return dateLabel;
}

function getCalendarDayOffsets(view) {
  if (view === "day") return [0];
  if (view === "week") return Array.from({ length: 7 }, (_, index) => index);
  return Array.from({ length: 31 }, (_, index) => index);
}

function mapStudioClassToMemberClass(item) {
  const startDate = new Date(item?.startAt || Date.now());
  return {
    id: String(item?.id || ""),
    branchId: String(item?.branchId || DEFAULT_STUDIO_BRANCH_ID),
    branchName: String(item?.branchName || "장덕점"),
    dayOffset: toDayOffsetByDate(startDate),
    time: `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`,
    title: String(item?.title || ""),
    instructor: String(item?.instructorName || "-"),
    room: String(item?.roomName || "-"),
    category: String(item?.classType || "group"),
    capacity: Number(item?.capacity || 0),
    bookedCount: Number(item?.reservedCount || 0),
    waitlistCount: Number(item?.waitlistCount || 0),
    userStatus: item?.myStatus === "reserved" ? "reserved" : item?.myStatus === "waitlisted" ? "waiting" : "available",
  };
}

function buildTicketItems(tickets) {
  return tickets.map((item) => {
    const expiryTime = item.expiresAt ? new Date(item.expiresAt).getTime() : null;
    const normalizedStatus = String(item.status || "active").toLowerCase();
    const expired = normalizedStatus !== "active" || (expiryTime !== null && expiryTime < Date.now());
    return {
      id: item.id,
      branchId: item.branchId || DEFAULT_STUDIO_BRANCH_ID,
      branchName: item.branchName || "장덕점",
      title: item.passName || item.productName || "수강권",
      type: item.passType || item.classType || "그룹",
      remaining: Number(item.remainingCount || 0),
      total: Number(item.totalCount || 0),
      expiresAt: item.expiresAt ? formatDateTime(item.expiresAt) : "만료일 없음",
      expired,
    };
  });
}

// 컴포넌트 역할: 회원이 지점별 필라테스 수업 예약, 대기, 취소와 수강권 상태를 확인하는 페이지입니다.
export function StudioReservationPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const currentUser = store.currentUser || {};
  const [selectedBranchId, setSelectedBranchId] = useState(DEFAULT_STUDIO_BRANCH_ID);
  const [calendarView, setCalendarView] = useState("week");
  const [selectedDayOffset, setSelectedDayOffset] = useState(null);
  const [classes, setClasses] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [passTab, setPassTab] = useState("active");
  const [passTransactions, setPassTransactions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [passRefundModal, setPassRefundModal] = useState(null);
  const [passRefundReason, setPassRefundReason] = useState("");
  const [passRefundSubmitting, setPassRefundSubmitting] = useState(false);
  const [passRefundMessage, setPassRefundMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    setSelectedDayOffset(null);
    setPassTab("active");
  }, [selectedBranchId]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let mounted = true;

    async function loadStudioData() {
      setLoading(true);
      setErrorMessage("");
      try {
        const from = formatYmd(new Date());
        const toDate = new Date();
        toDate.setDate(toDate.getDate() + 40);
        const to = formatYmd(toDate);
        const [classRows, summary, notificationRows] = await Promise.all([
          listStudioClasses({ from, to, branchId: selectedBranchId }),
          listMyStudioSummary({ branchId: selectedBranchId }),
          listStudioNotificationsByUser(currentUser.id),
        ]);
        if (!mounted) return;
        setClasses(classRows.map(mapStudioClassToMemberClass));
        setTickets(Array.isArray(summary?.passes) ? summary.passes : []);
        setPassTransactions(Array.isArray(summary?.passTransactions) ? summary.passTransactions : []);
        setNotifications(Array.isArray(notificationRows) ? notificationRows : []);
      } catch (error) {
        if (!mounted) return;
        setClasses([]);
        setTickets([]);
        setPassTransactions([]);
        setNotifications([]);
        setErrorMessage(error?.message || "필라테스 예약 정보를 불러오지 못했습니다.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadStudioData();
    return () => {
      mounted = false;
    };
  }, [currentUser?.id, selectedBranchId, reloadKey]);

  const selectedBranch = STUDIO_BRANCHES.find((branch) => branch.id === selectedBranchId) || STUDIO_BRANCHES[0];

  const visibleClasses = useMemo(() => {
    return classes.filter((item) => {
      if (selectedDayOffset !== null) return item.dayOffset === selectedDayOffset;
      if (calendarView === "day") return item.dayOffset === 0;
      if (calendarView === "week") return item.dayOffset <= 6;
      return item.dayOffset <= 30;
    });
  }, [calendarView, classes, selectedDayOffset]);

  const calendarDays = useMemo(() => {
    const counts = new Map();
    classes.forEach((item) => counts.set(item.dayOffset, (counts.get(item.dayOffset) || 0) + 1));
    return getCalendarDayOffsets(calendarView).map((offset) => ({
      offset,
      label: formatRelativeClassDate(offset),
      count: counts.get(offset) || 0,
    }));
  }, [calendarView, classes]);

  const ticketItems = useMemo(() => buildTicketItems(tickets), [tickets]);
  const visibleTicketItems = ticketItems.filter((ticket) => (passTab === "active" ? !ticket.expired : ticket.expired));
  const reservationAllowance = ticketItems.reduce((sum, ticket) => sum + (ticket.expired ? 0 : ticket.remaining), 0);
  const reservedCount = classes.filter((item) => item.userStatus === "reserved").length;
  const waitingCount = classes.filter((item) => item.userStatus === "waiting").length;
  const nextReservedClass = classes
    .filter((item) => item.userStatus === "reserved")
    .sort((a, b) => a.dayOffset - b.dayOffset || a.time.localeCompare(b.time))[0];
  const unreadNotificationCount = notifications.filter((item) => !item.readAt).length;

  async function handleClassAction(classId, action) {
    try {
      if (action === "cancel") await cancelStudioClass(classId);
      else await bookStudioClass(classId);
      setReloadKey((value) => value + 1);
    } catch (error) {
      window.alert(error?.message || "예약 처리에 실패했습니다.");
    }
  }

  async function handleReadNotification(notificationId) {
    try {
      await markMyStudioNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item))
      );
    } catch (error) {
      window.alert(error?.message || "알림 상태 변경에 실패했습니다.");
    }
  }

  async function handleReadAllNotifications() {
    try {
      await markMyStudioNotificationsRead();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    } catch (error) {
      window.alert(error?.message || "알림 전체 읽음 처리에 실패했습니다.");
    }
  }

  async function handlePassRefundSubmit(event) {
    event.preventDefault();
    if (!passRefundModal?.id) return;
    if (!passRefundReason.trim()) {
      setPassRefundMessage({ type: "error", text: "환불 사유를 입력해 주세요." });
      return;
    }
    try {
      setPassRefundSubmitting(true);
      setPassRefundMessage({ type: "", text: "" });
      await requestStudioPassRefund({ passId: passRefundModal.id, reason: passRefundReason.trim() });
      setPassRefundMessage({ type: "success", text: "수강권 환불 요청이 접수되었습니다." });
      setPassRefundReason("");
      setReloadKey((value) => value + 1);
    } catch (error) {
      setPassRefundMessage({ type: "error", text: error?.message || "환불 요청에 실패했습니다." });
    } finally {
      setPassRefundSubmitting(false);
    }
  }

  return (
    <>
      <PageLayout mainClass="dashboard-page">
        <section className="dashboard-hero mypage-hero-card">
          <p className="section-kicker">필라테스 예약하기</p>
          <h1>내 수업 예약과 수강권을 확인합니다</h1>
          <div className="mypage-identity-row">
            <span className="mypage-identity-chip">{selectedBranch.name}</span>
            <span className="mypage-identity-chip">예약 가능 {reservationAllowance}회</span>
            <span className="mypage-identity-chip">예약 확정 {reservedCount}건</span>
            <span className="mypage-identity-chip">예약 대기 {waitingCount}건</span>
            <span className="mypage-identity-chip">보유 수강권 {ticketItems.length}개</span>
          </div>
        </section>

        <section className="dashboard-card mypage-member-service-card">
          <div className="member-service-header">
            <div>
              <p className="section-kicker">회원용 필라테스 예약</p>
              <h2>지점별 수업 예약과 수강권을 한 화면에서 확인합니다</h2>
              <p>장덕점과 효천점을 전환하면서 일·주·월 스케줄을 확인하고 예약, 대기, 취소를 직접 처리할 수 있습니다.</p>
            </div>
            <div className="member-calendar-tabs" role="tablist" aria-label="수업 캘린더 보기 방식">
              {CALENDAR_VIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={calendarView === option.value ? "active" : ""}
                  aria-selected={calendarView === option.value}
                  onClick={() => {
                    setCalendarView(option.value);
                    setSelectedDayOffset(null);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="member-pass-tabs" role="tablist" aria-label="예약 지점 선택" style={{ marginBottom: 18 }}>
            {STUDIO_BRANCHES.map((branch) => (
              <button
                key={branch.id}
                type="button"
                role="tab"
                aria-selected={selectedBranchId === branch.id}
                className={selectedBranchId === branch.id ? "active" : ""}
                onClick={() => setSelectedBranchId(branch.id)}
              >
                {branch.name}
              </button>
            ))}
          </div>

          {errorMessage ? (
            <div className="message error" role="alert">
              <span>{errorMessage}</span>
              <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 불러오기</button>
            </div>
          ) : null}

          <div className="member-service-summary">
            <article>
              <span>예약 가능 횟수</span>
              <strong>{reservationAllowance}회</strong>
              <p>{selectedBranch.name} 사용 중 수강권 기준</p>
            </article>
            <article>
              <span>예약 확정</span>
              <strong>{reservedCount}건</strong>
              <p>{nextReservedClass ? `${formatRelativeClassDate(nextReservedClass.dayOffset)} ${nextReservedClass.time}` : "예약된 수업 없음"}</p>
            </article>
            <article>
              <span>예약 대기</span>
              <strong>{waitingCount}건</strong>
              <p>대기 순번과 상태 표시</p>
            </article>
            <article>
              <span>보유 수강권</span>
              <strong>{ticketItems.length}개</strong>
              <p>잔여 횟수와 만료일 표시</p>
            </article>
          </div>

          <div className="member-service-layout">
            <section className="member-schedule-panel">
              <div className="member-panel-title">
                <h3>{selectedBranch.name} 수업 스케줄</h3>
                <span>{selectedDayOffset !== null ? formatRelativeClassDate(selectedDayOffset) : calendarView === "day" ? "오늘" : calendarView === "week" ? "이번 주" : "이번 달"}</span>
              </div>
              <div className="member-calendar-strip" aria-label="날짜별 수업">
                {calendarDays.map((day) => (
                  <button
                    key={day.offset}
                    type="button"
                    className={selectedDayOffset === day.offset ? "active" : ""}
                    onClick={() => setSelectedDayOffset((current) => (current === day.offset ? null : day.offset))}
                  >
                    <span>{day.label}</span>
                    <strong>{day.count}개</strong>
                  </button>
                ))}
              </div>
              <div className="member-schedule-list">
                {loading ? (
                  <p className="member-schedule-empty">수업 정보를 불러오는 중입니다.</p>
                ) : visibleClasses.length ? visibleClasses.map((item) => {
                  const isReserved = item.userStatus === "reserved";
                  const isWaiting = item.userStatus === "waiting";
                  const isFull = item.bookedCount >= item.capacity;
                  const action = isReserved || isWaiting ? "cancel" : isFull ? "wait" : "reserve";
                  const actionLabel = isReserved ? "예약 취소" : isWaiting ? "대기 취소" : isFull ? "예약 대기" : "예약하기";
                  return (
                    <article key={item.id} className={`member-schedule-item ${item.userStatus}`}>
                      <time>
                        <strong>{formatRelativeClassDate(item.dayOffset)}</strong>
                        <span>{item.time}</span>
                      </time>
                      <div className="member-schedule-copy">
                        <h4>{item.title}</h4>
                        <p>{item.instructor} · {item.room} · {item.category}</p>
                        <span>
                          예약 {item.bookedCount}/{item.capacity}
                          {item.waitlistCount ? ` · 대기 ${item.waitlistCount}명` : ""}
                        </span>
                      </div>
                      <button type="button" className={`ghost-button small-ghost ${isReserved ? "danger" : ""}`} onClick={() => handleClassAction(item.id, action)}>
                        {actionLabel}
                      </button>
                    </article>
                  );
                }) : (
                  <p className="member-schedule-empty">선택한 지점과 날짜에 예약 가능한 수업이 없습니다.</p>
                )}
              </div>
            </section>

            <aside className="member-ticket-panel">
              <div className="member-panel-title">
                <h3>{selectedBranch.name} 보유 수강권</h3>
                <span>잔여 / 만료</span>
              </div>
              <div className="member-pass-tabs" role="tablist" aria-label="수강권 상태">
                <button type="button" role="tab" aria-selected={passTab === "active"} className={passTab === "active" ? "active" : ""} onClick={() => setPassTab("active")}>사용 중</button>
                <button type="button" role="tab" aria-selected={passTab === "expired"} className={passTab === "expired" ? "active" : ""} onClick={() => setPassTab("expired")}>만료·종료</button>
              </div>
              <div className="member-ticket-list">
                {visibleTicketItems.length ? visibleTicketItems.map((ticket) => (
                  <article key={ticket.id}>
                    <div>
                      <strong>{ticket.title}</strong>
                      <span>{ticket.branchName} · {ticket.type} 수업</span>
                    </div>
                    <p><strong>{ticket.remaining}</strong> / {ticket.total}회</p>
                    <em>만료일 {ticket.expiresAt}</em>
                    <button
                      type="button"
                      className="ghost-button small-ghost"
                      disabled={ticket.expired}
                      onClick={() => {
                        setPassRefundModal(ticket);
                        setPassRefundReason("");
                        setPassRefundMessage({ type: "", text: "" });
                      }}
                    >
                      환불 요청
                    </button>
                  </article>
                )) : (
                  <p className="member-payment-empty">{passTab === "active" ? "사용 중인 수강권이 없습니다." : "만료되거나 종료된 수강권이 없습니다."}</p>
                )}
              </div>
              <div className="member-payment-mini">
                <h4>수강권 이용 내역</h4>
                {passTransactions.length ? (
                  passTransactions.slice(0, 5).map((item) => (
                    <p key={item.id}>
                      <span>{item.classTitle || item.passName || "수강권"}</span>
                      <strong>{Number(item.deltaCount || 0) > 0 ? "+" : ""}{item.deltaCount}회</strong>
                    </p>
                  ))
                ) : (
                  <p className="member-payment-empty">이용 내역이 없습니다.</p>
                )}
              </div>
            </aside>
          </div>

          <div className="member-support-grid">
            {STUDIO_INFO.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <button type="button" className="ghost-button small-ghost" onClick={() => navigate(item.path)}>확인하기</button>
              </article>
            ))}
            <article className="member-notification-card">
              <h3>알림 {unreadNotificationCount ? <span>새 알림 {unreadNotificationCount}개</span> : null}</h3>
              {unreadNotificationCount ? (
                <button type="button" className="ghost-button small-ghost" onClick={handleReadAllNotifications}>전체 읽음</button>
              ) : null}
              {notifications.map((item, idx) => (
                <p key={item.id || item.title || idx} className={item.readAt ? "is-read" : "is-unread"}>
                  <strong>{item.title || "알림"}</strong>
                  <span>{item.message || item.text || "-"}</span>
                  {!item.readAt ? <button type="button" onClick={() => handleReadNotification(item.id)}>읽음</button> : null}
                </p>
              ))}
              {!notifications.length ? <p>새로운 알림이 없습니다.</p> : null}
            </article>
          </div>
        </section>
      </PageLayout>

      {passRefundModal ? (
        <div className="refund-modal-backdrop" role="presentation" onClick={() => setPassRefundModal(null)}>
          <form className="refund-modal" onSubmit={handlePassRefundSubmit} onClick={(event) => event.stopPropagation()}>
            <div className="refund-modal-head">
              <h3>수강권 환불 요청</h3>
              <button type="button" onClick={() => setPassRefundModal(null)} aria-label="닫기">×</button>
            </div>
            <p>{passRefundModal.branchName} · {passRefundModal.title} 환불 요청 사유를 입력해 주세요.</p>
            {passRefundMessage.text ? <p className={`refund-modal-message ${passRefundMessage.type}`}>{passRefundMessage.text}</p> : null}
            <textarea value={passRefundReason} onChange={(event) => setPassRefundReason(event.target.value)} placeholder="환불 사유" rows={5} />
            <div className="refund-modal-actions">
              <button type="button" className="ghost-button" onClick={() => setPassRefundModal(null)}>취소</button>
              <button type="submit" className="pill-button small" disabled={passRefundSubmitting}>
                {passRefundSubmitting ? "요청 중..." : "환불 요청"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

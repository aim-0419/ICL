/**
 * [마이페이지]
 *
 * 로그인한 회원이 자신의 정보를 확인하고 관리하는 화면입니다.
 * 아래 기능을 하나의 페이지에서 제공합니다:
 *
 *  1. 스튜디오 서비스  — 수업 예약·취소, 보유 수강권 조회, 수강권 환불 요청
 *  2. 강의 아카데미    — 구매한 강의 목록, 진도율, 수료증 발급, Q&A
 *  3. 주문·결제 내역   — 주문 목록, 환불 신청
 *  4. 포인트·혜택      — 포인트 잔액, 이용 내역
 *  5. 내 정보 수정     — 이름·이메일·비밀번호 변경
 *  6. 회원 탈퇴        — 탈퇴 신청 (90일 데이터 보관)
 *
 * ─ 주요 규칙 ─────────────────────────────────────────────────────
 *  · 날짜·금액 포맷은 shared/utils/format.js 의 공통 함수를 사용합니다
 *  · 관리자(isAdminStaff)는 강의 편집·삭제 버튼이 추가로 노출됩니다
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageLayout } from "../../../shared/components/PageLayout.jsx";
import { NativePushSettings } from "../../../shared/components/NativePushSettings.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import {
  deleteAcademyVideo,
  issueAcademyCertificate,
  listAcademyCertificates,
  listMyAcademyQna,
  resolveAcademyMediaUrl,
  updateAcademyVideo,
  uploadAcademyAsset,
} from "../../academy/api/academyApi.js";
import { countPurchasedVideoItems, getPurchasedVideos } from "../../academy/lib/purchases.js";
import { apiRequest } from "../../../shared/api/client.js";
import {
  bookStudioClass,
  cancelStudioClass,
  listMyStudioSummary,
  listStudioClasses,
  listStudioNotificationsByUser,
  markMyStudioNotificationRead,
  markMyStudioNotificationsRead,
  requestStudioPassRefund,
} from "../../studio/api/studioApi.js";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { isAdminStaff } from "../../../shared/auth/userRoles.js";
import {
  formatDate,
  formatDateTime,
  formatCertificateDate,
  formatDuration,
  formatYmd,
} from "../../../shared/utils/format.js";

const CERTIFICATE_TEMPLATE_IMAGE =
  "/assets/images/home/certificate-template-a4.png";

const MEMBER_CALENDAR_VIEW_OPTIONS = [
  { value: "day", label: "일" },
  { value: "week", label: "주" },
  { value: "month", label: "월" },
];

const MEMBER_STUDIO_INFO = [
  { title: "강사 정보", text: "수업별 담당 강사와 전문 분야를 예약 전에 확인합니다.", path: "/ikleulrim/instructors" },
  { title: "시설 정보", text: "리포머룸, 바렐존, 개인레슨실 등 이용 공간을 확인합니다.", path: "/ikleulrim/tour" },
];
const SHOW_MYPAGE_STUDIO_SERVICES = false;

// formatYmd, formatDate, formatDateTime, formatDuration, formatCertificateDate 는
// shared/utils/format.js 에서 가져옵니다 (파일 상단 import 참고)

/** 수업 시작 날짜를 오늘 기준 ±일수(정수)로 변환합니다. 오늘이면 0, 내일이면 1 */
function toDayOffsetByDate(value) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

/**
 * 서버에서 받은 수업 데이터(studio API 형태)를 마이페이지 캘린더에 표시할 형태로 변환합니다.
 * - userStatus: "reserved"(예약 완료) / "waiting"(대기) / "available"(예약 가능)
 */
function mapStudioClassToMemberClass(item) {
  const startDate = new Date(item?.startAt || Date.now());
  return {
    id: String(item?.id || ""),
    dayOffset: toDayOffsetByDate(startDate),
    time: `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`,
    title: String(item?.title || ""),
    instructor: String(item?.instructorName || "-"),
    room: String(item?.roomName || "-"),
    category: "그룹",
    capacity: Number(item?.capacity || 0),
    bookedCount: Number(item?.reservedCount || 0),
    waitlistCount: Number(item?.waitlistCount || 0),
    userStatus: item?.myStatus === "reserved" ? "reserved" : item?.myStatus === "waitlisted" ? "waiting" : "available",
  };
}

/** 날짜(Date)에 n일을 더한 새 Date를 반환합니다. */
function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * dayOffset(오늘 기준 일수)을 수업 카드 헤더에 표시할 날짜 문자열로 변환합니다.
 * 0 → "오늘 · 06.02.(월)", 1 → "내일 · 06.03.(화)"
 */
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

/**
 * 현재 뷰 모드에 따라 보여줄 날짜 오프셋 배열을 반환합니다.
 * - "day"  → [0] (오늘만)
 * - "week" → [0,1,2,3,4,5,6] (이번 주 7일)
 * - "month"→ [0..30] (이번 달 31일)
 */
function getMemberCalendarDayOffsets(view) {
  if (view === "day") return [0];
  if (view === "week") return Array.from({ length: 7 }, (_, index) => index);
  return Array.from({ length: 31 }, (_, index) => index);
}

/**
 * 강의 수강 기간 문자열("30일", "1년", "무제한" 등)을 일(day) 수 숫자로 변환합니다.
 * 무제한·평생 수강인 경우 null을 반환합니다.
 */
function parseStudyPeriodDays(periodText) {
  if (!periodText) return null;
  const text = String(periodText).trim();
  if (/무제한|평생|unlimited|lifetime/i.test(text)) return null;
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * 회원의 주문 이력과 강의 수강 기간 정보를 바탕으로 수강 만료일과 남은 일수를 계산합니다.
 * - 무제한 수강이면 null을 반환합니다.
 * - 여러 주문이 있을 경우 가장 이른 구매일 기준으로 계산합니다.
 * @returns {{ daysLeft: number, expiryLabel: string } | null}
 */
function calcEnrollmentExpiryForMyPage(orders, videoProductId, periodText) {
  const periodDays = parseStudyPeriodDays(periodText);
  if (periodDays === null) return null;

  const normalizedId = String(videoProductId || "").trim();
  const matchingOrders = (Array.isArray(orders) ? orders : []).filter((order) => {
    const ids = new Set();
    const addId = (v) => { const s = String(v || "").trim(); if (s) ids.add(s); };
    if (Array.isArray(order.selectedProductIds)) order.selectedProductIds.forEach(addId);
    if (Array.isArray(order.items)) order.items.forEach((i) => addId(i?.productId));
    addId(order.productId);
    try {
      const payload = typeof order.payload === "string" ? JSON.parse(order.payload) : (order.payload || {});
      if (Array.isArray(payload.selectedProductIds)) payload.selectedProductIds.forEach(addId);
      if (Array.isArray(payload.items)) payload.items.forEach((i) => addId(i?.productId));
      addId(payload.productId);
    } catch {}
    return ids.has(normalizedId);
  });

  if (!matchingOrders.length) return null;

  const orderDates = matchingOrders
    .map((o) => new Date(o.createdAt || ""))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);

  if (!orderDates.length) return null;

  const expiryDate = new Date(orderDates[0].getTime() + periodDays * 86400000);
  const daysLeft = Math.ceil((expiryDate - Date.now()) / 86400000);
  return { daysLeft, expiryLabel: expiryDate.toLocaleDateString("ko-KR") };
}

/** 강의의 모든 차시(챕터) 재생 시간을 합산해 총 초(second) 수를 반환합니다. */
function calcChaptersTotalDuration(chapters) {
  if (!Array.isArray(chapters)) return 0;
  return chapters.reduce((s, ch) => s + Math.max(0, Number(ch.durationSec || 0)), 0);
}


// 함수 역할: 학습 진도 비율 값으로 안전하게 변환합니다.
function toProgressPercent(progress) {
  const rawPercent = Number(progress?.progressPercent);
  if (Number.isFinite(rawPercent)) {
    return Math.max(0, Math.min(100, Math.round(rawPercent)));
  }

  const duration = Number(progress?.duration || 0);
  const currentTime = Number(progress?.currentTime || 0);
  if (!duration) return 0;
  return Math.max(0, Math.min(100, Math.round((currentTime / duration) * 100)));
}

// 컴포넌트 역할: 비밀번호 표시/숨김 상태에 맞는 아이콘을 렌더링합니다.
function EyeIcon({ open }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 3l18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.6 6.3A10.6 10.6 0 0 1 12 6c5.5 0 9 6 9 6a16.7 16.7 0 0 1-3.1 3.9M6.1 9.1A16.2 16.2 0 0 0 3 12s3.5 6 9 6c1.1 0 2.1-.2 3-.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 문자열이나 숫자 형태의 값을 안전한 숫자로 변환합니다. 변환 불가 시 fallback 반환 */
function toSafeNumber(value, fallback = 0) {
  const parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ─── MyPage 메인 컴포넌트 ─────────────────────────────────────────────────────
export function MyPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const currentUser = store.currentUser || {};
  const isAdmin = isAdminStaff(currentUser);
  const normalizedCurrentUserEmail = String(currentUser.email || "").trim().toLowerCase();
  const currentUserDisplayName = getUserDisplayName(currentUser);

  const userOrders = useMemo(
    () =>
      store.orders.filter((order) => {
        const orderEmail = String(order?.customerEmail || "").trim().toLowerCase();
        return Boolean(orderEmail) && orderEmail === normalizedCurrentUserEmail;
      }),
    [store.orders, normalizedCurrentUserEmail]
  );
  const purchasedVideos = useMemo(
    () => getPurchasedVideos(store.orders, currentUser.email, store.academyVideos),
    [store.orders, currentUser.email, store.academyVideos]
  );
  const purchasedVideoItemCount = useMemo(
    () => countPurchasedVideoItems(store.orders, currentUser.email, store.academyVideos),
    [store.orders, currentUser.email, store.academyVideos]
  );
  const academyProgressMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(store.academyProgress) ? store.academyProgress : []).forEach((item) => {
      const key = String(item?.videoId || "");
      if (key) map.set(key, item);
    });
    return map;
  }, [store.academyProgress]);
  const academyChapterProgressMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(store.academyChapterProgress) ? store.academyChapterProgress : []).forEach((item) => {
      const key = String(item?.videoId || "");
      if (!key) return;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    });

    for (const [key, list] of map.entries()) {
      map.set(
        key,
        [...list].sort((a, b) => {
          const aOrder = Number(a?.chapterOrder || 0);
          const bOrder = Number(b?.chapterOrder || 0);
          if (aOrder !== bOrder) return aOrder - bOrder;
          return String(a?.chapterId || "").localeCompare(String(b?.chapterId || ""));
        })
      );
    }

    return map;
  }, [store.academyChapterProgress]);
  const learningHistory = useMemo(() => {
    return purchasedVideos
      .map((video) => {
        const progress = academyProgressMap.get(String(video.id)) || null;
        const chapterProgress = academyChapterProgressMap.get(String(video.id)) || [];
        const progressPercent = toProgressPercent(progress);
        const completed = Boolean(progress?.completed) || progressPercent >= 100;
        const chapterCountFromVideo = Array.isArray(video?.chapters) ? video.chapters.length : 0;
        const chapterCount = chapterCountFromVideo || chapterProgress.length;
        const completedChapterCount = chapterProgress.filter((item) => Boolean(item?.completed)).length;
        const latestChapter = [...chapterProgress]
          .filter((item) => item?.lastWatchedAt)
          .sort((a, b) => new Date(b.lastWatchedAt || 0).getTime() - new Date(a.lastWatchedAt || 0).getTime())[0];

        return {
          ...video,
          progressPercent,
          completed,
          lastWatchedAt: progress?.lastWatchedAt || "",
          chapterCount,
          completedChapterCount,
          latestChapterTitle: latestChapter?.chapterTitle || "",
        };
      })
      .sort((a, b) => new Date(b.lastWatchedAt || 0).getTime() - new Date(a.lastWatchedAt || 0).getTime());
  }, [academyProgressMap, academyChapterProgressMap, purchasedVideos]);
  const completedVideoCount = useMemo(
    () => learningHistory.filter((video) => video.completed).length,
    [learningHistory]
  );

  const [myGrants, setMyGrants] = useState([]);
  const [myCertificates, setMyCertificates] = useState([]);
  const [certificateModal, setCertificateModal] = useState(null);
  const [certificateMessage, setCertificateMessage] = useState({ type: "", text: "" });
  const [issuingCertificateVideoId, setIssuingCertificateVideoId] = useState("");
  const [activeVideoTab, setActiveVideoTab] = useState("purchased");
  const [activeTab, setActiveTab] = useState("courses");
  const [orderPage, setOrderPage] = useState(1);
  const [pointPage, setPointPage] = useState(1);
  const [qnaPage, setQnaPage] = useState(1);
  const [myQnaItems, setMyQnaItems] = useState([]);
  const [myQnaLoading, setMyQnaLoading] = useState(false);
  const [myQnaError, setMyQnaError] = useState("");
  const [memberCalendarView, setMemberCalendarView] = useState("week");
  const [selectedMemberDayOffset, setSelectedMemberDayOffset] = useState(null);
  const [memberClasses, setMemberClasses] = useState([]);
  const [memberTickets, setMemberTickets] = useState([]);
  const [memberPassTab, setMemberPassTab] = useState("active");
  const [memberPassTransactions, setMemberPassTransactions] = useState([]);
  const [memberNotifications, setMemberNotifications] = useState([]);
  const [studioDataLoading, setStudioDataLoading] = useState(false);
  const [studioDataError, setStudioDataError] = useState("");
  const [studioDataReloadKey, setStudioDataReloadKey] = useState(0);

  const [myRefundRequests, setMyRefundRequests] = useState([]);
  const [refundModal, setRefundModal] = useState(null);
  const [refundSelectedProductIds, setRefundSelectedProductIds] = useState([]);
  const [refundReason, setRefundReason] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundMessage, setRefundMessage] = useState({ type: "", text: "" });

  const [passRefundModal, setPassRefundModal] = useState(null);
  const [passRefundReason, setPassRefundReason] = useState("");
  const [passRefundSubmitting, setPassRefundSubmitting] = useState(false);
  const [passRefundMessage, setPassRefundMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    if (!SHOW_MYPAGE_STUDIO_SERVICES) return;
    if (window.location.hash !== "#member-services") return;
    const target = document.getElementById("member-services");
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  useEffect(() => {
    if (!SHOW_MYPAGE_STUDIO_SERVICES) return;
    if (!currentUser?.id) return;
    let mounted = true;
    async function loadStudioData() {
      setStudioDataLoading(true);
      setStudioDataError("");
      try {
        const from = formatYmd(new Date());
        const toDate = new Date();
        toDate.setDate(toDate.getDate() + 40);
        const to = formatYmd(toDate);
        const [classes, summary, notifications] = await Promise.all([
          listStudioClasses({ from, to }),
          listMyStudioSummary(),
          listStudioNotificationsByUser(currentUser.id),
        ]);
        if (!mounted) return;
        setMemberClasses(classes.map(mapStudioClassToMemberClass));
        setMemberTickets(Array.isArray(summary?.passes) ? summary.passes : []);
        setMemberPassTransactions(Array.isArray(summary?.passTransactions) ? summary.passTransactions : []);
        setMemberNotifications(Array.isArray(notifications) ? notifications : []);
      } catch (error) {
        if (!mounted) return;
        setMemberClasses([]);
        setMemberTickets([]);
        setMemberPassTransactions([]);
        setMemberNotifications([]);
        setStudioDataError(error?.message || "스튜디오 정보를 불러오지 못했습니다.");
      } finally {
        if (mounted) setStudioDataLoading(false);
      }
    }
    loadStudioData();
    return () => {
      mounted = false;
    };
  }, [currentUser?.id, studioDataReloadKey]);

  const memberVisibleClasses = useMemo(() => {
    return memberClasses.filter((item) => {
      if (selectedMemberDayOffset !== null) return item.dayOffset === selectedMemberDayOffset;
      if (memberCalendarView === "day") return item.dayOffset === 0;
      if (memberCalendarView === "week") return item.dayOffset <= 6;
      return item.dayOffset <= 30;
    });
  }, [memberCalendarView, memberClasses, selectedMemberDayOffset]);
  const memberCalendarDays = useMemo(() => {
    const counts = new Map();
    memberClasses.forEach((item) => {
      counts.set(item.dayOffset, (counts.get(item.dayOffset) || 0) + 1);
    });
    return getMemberCalendarDayOffsets(memberCalendarView).map((offset) => ({
      offset,
      label: formatRelativeClassDate(offset),
      count: counts.get(offset) || 0,
    }));
  }, [memberCalendarView, memberClasses]);
  const memberReservedCount = useMemo(
    () => memberClasses.filter((item) => item.userStatus === "reserved").length,
    [memberClasses]
  );
  const memberWaitingCount = useMemo(
    () => memberClasses.filter((item) => item.userStatus === "waiting").length,
    [memberClasses]
  );
  const memberTicketItems = useMemo(() => {
    return memberTickets.map((item) => {
      const expiryTime = item.expiresAt ? new Date(item.expiresAt).getTime() : null;
      const normalizedStatus = String(item.status || "active").toLowerCase();
      const expired = ["expired", "refunded", "transferred"].includes(normalizedStatus)
        || (expiryTime !== null && expiryTime < new Date().setHours(0, 0, 0, 0))
        || Number(item.remainingCount || 0) <= 0;
      return {
      id: String(item.id),
      title: String(item.passName || "수강권"),
      type: String(item.passType || "그룹"),
      remaining: Number(item.remainingCount || 0),
      total: Number(item.totalCount || 0),
      expiresAt: item.expiresAt ? new Date(item.expiresAt).toLocaleDateString("ko-KR") : "무제한",
        status: normalizedStatus,
        expired,
      };
    });
  }, [memberTickets]);
  const visibleMemberTicketItems = useMemo(
    () => memberTicketItems.filter((item) => memberPassTab === "expired" ? item.expired : !item.expired),
    [memberPassTab, memberTicketItems]
  );
  const memberReservationAllowance = Math.max(
    0,
    memberTicketItems.filter((item) => !item.expired).reduce((total, item) => total + item.remaining, 0) - memberReservedCount,
  );
  const nextReservedClass = useMemo(() => {
    return [...memberClasses]
      .filter((item) => item.userStatus === "reserved")
      .sort((a, b) => a.dayOffset - b.dayOffset || a.time.localeCompare(b.time))[0] || null;
  }, [memberClasses]);
  const certificateByVideoId = useMemo(() => {
    const map = new Map();
    (Array.isArray(myCertificates) ? myCertificates : []).forEach((certificate) => {
      const videoId = String(certificate?.videoId || "");
      if (videoId) map.set(videoId, certificate);
    });
    return map;
  }, [myCertificates]);

  const allVideos = useMemo(
    () => (Array.isArray(store.academyVideos) ? store.academyVideos : []),
    [store.academyVideos]
  );

  const grantedVideos = useMemo(() => {
    const purchasedIds = new Set(purchasedVideos.map((v) => String(v.id)));
    const grantedVideoIds = new Set(myGrants.map((g) => String(g.videoId)));
    return allVideos
      .filter((v) => grantedVideoIds.has(String(v.id)) && !purchasedIds.has(String(v.id)))
      .map((video) => {
        const grant = myGrants.find((g) => String(g.videoId) === String(video.id));
        return { ...video, grant };
      });
  }, [myGrants, purchasedVideos, allVideos]);

  const grantedLearningHistory = useMemo(() => {
    return grantedVideos
      .map((video) => {
        const progress = academyProgressMap.get(String(video.id)) || null;
        const chapterProgress = academyChapterProgressMap.get(String(video.id)) || [];
        const progressPercent = toProgressPercent(progress);
        const completed = Boolean(progress?.completed) || progressPercent >= 100;
        const chapterCountFromVideo = Array.isArray(video?.chapters) ? video.chapters.length : 0;
        const chapterCount = chapterCountFromVideo || chapterProgress.length;
        const completedChapterCount = chapterProgress.filter((item) => Boolean(item?.completed)).length;
        const latestChapter = [...chapterProgress]
          .filter((item) => item?.lastWatchedAt)
          .sort((a, b) => new Date(b.lastWatchedAt || 0).getTime() - new Date(a.lastWatchedAt || 0).getTime())[0];
        return {
          ...video,
          progressPercent,
          completed,
          lastWatchedAt: progress?.lastWatchedAt || "",
          chapterCount,
          completedChapterCount,
          latestChapterTitle: latestChapter?.chapterTitle || "",
        };
      })
      .sort((a, b) => new Date(b.lastWatchedAt || 0).getTime() - new Date(a.lastWatchedAt || 0).getTime());
  }, [grantedVideos, academyProgressMap, academyChapterProgressMap]);

  const [form, setForm] = useState({
    loginId: currentUser.loginId || "",
    name: currentUser.name || "",
    email: currentUser.email || "",
    phone: currentUser.phone || "",
    birthYear: currentUser.birthYear ? String(currentUser.birthYear) : "",
    newPassword: "",
    currentPassword: "",
  });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [emailVerificationState, setEmailVerificationState] = useState({
    status: "",
    text: "",
    verifiedEmail: "",
    debugCode: "",
  });
  const [isSendingEmailCode, setIsSendingEmailCode] = useState(false);
  const [isVerifyingEmailCode, setIsVerifyingEmailCode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: "", text: "" });
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawPassword, setWithdrawPassword] = useState("");
  const [withdrawPasswordVisible, setWithdrawPasswordVisible] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  const [isMarketingToggling, setIsMarketingToggling] = useState(false);
  const [marketingMessage, setMarketingMessage] = useState({ type: "", text: "" });

  const normalizedCurrentEmail = String(currentUser.email || "").trim().toLowerCase();
  const normalizedFormEmail = String(form.email || "").trim().toLowerCase();
  const isEmailChanged = normalizedFormEmail !== normalizedCurrentEmail;
  const isEmailVerified =
    !isEmailChanged ||
    (emailVerificationState.status === "success" &&
      emailVerificationState.verifiedEmail === normalizedFormEmail);

  useEffect(() => {
    setForm({
      loginId: currentUser.loginId || "",
      name: currentUser.name || "",
      email: currentUser.email || "",
      phone: currentUser.phone || "",
      birthYear: currentUser.birthYear ? String(currentUser.birthYear) : "",
      newPassword: "",
      currentPassword: "",
    });
    setEmailVerificationCode("");
    setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });
    setWithdrawModalOpen(false);
    setWithdrawPassword("");
    setWithdrawError("");
  }, [currentUser.loginId, currentUser.name, currentUser.email, currentUser.phone, currentUser.birthYear]);

  useEffect(() => {
    if (!isEmailChanged) {
      setEmailVerificationCode("");
      setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });
    }
  }, [isEmailChanged]);


  useEffect(() => {
    if (!currentUser?.id) return;
    store.refreshAcademyProgress?.().catch((error) => {
      console.error("[academy-progress] refresh failed", error);
    });
    setMyQnaLoading(true);
    setMyQnaError("");
    listMyAcademyQna()
      .then((items) => setMyQnaItems(Array.isArray(items) ? items : []))
      .catch((error) => {
        setMyQnaItems([]);
        setMyQnaError(error.message || "내 Q&A 목록을 불러오지 못했습니다.");
      })
      .finally(() => setMyQnaLoading(false));
    apiRequest("/users/me/video-grants")
      .then((result) => setMyGrants(Array.isArray(result?.grants) ? result.grants : []))
      .catch(() => setMyGrants([]));
    listAcademyCertificates()
      .then((items) => setMyCertificates(Array.isArray(items) ? items : []))
      .catch(() => setMyCertificates([]));
    apiRequest("/refunds/me")
      .then((result) => setMyRefundRequests(Array.isArray(result?.requests) ? result.requests : []))
      .catch(() => setMyRefundRequests([]));
  }, [currentUser?.id]);

  useEffect(() => {
    const isOpen = Boolean(refundModal || passRefundModal || withdrawModalOpen);
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [refundModal, passRefundModal, withdrawModalOpen]);

  async function handleCertificateClick(video) {
    if (!video?.completed) {
      setCertificateMessage({ type: "error", text: "완강한 강의만 수료증을 발급할 수 있습니다." });
      return;
    }

    const existing = certificateByVideoId.get(String(video.id));
    if (existing) {
      setCertificateModal(existing);
      setCertificateMessage({ type: "", text: "" });
      return;
    }

    setIssuingCertificateVideoId(String(video.id));
    setCertificateMessage({ type: "", text: "" });
    try {
      const certificate = await issueAcademyCertificate(video.id);
      if (certificate?.id) {
        setMyCertificates((current) => {
          const rest = current.filter((item) => String(item.id) !== String(certificate.id));
          return [certificate, ...rest];
        });
        setCertificateModal(certificate);
      }
    } catch (error) {
      setCertificateMessage({ type: "error", text: error.message || "수료증 발급에 실패했습니다." });
    } finally {
      setIssuingCertificateVideoId("");
    }
  }

  function openRefundModal(order) {
    const activeIds = Array.isArray(order.activeProductIds) && order.activeProductIds.length
      ? order.activeProductIds
      : [];
    const fallbackIds = Array.isArray(order.selectedProductIds) && order.selectedProductIds.length
      ? order.selectedProductIds
      : [];
    const allIds = activeIds.length ? activeIds : fallbackIds;
    setRefundModal(order);
    setRefundSelectedProductIds(allIds);
    setRefundReason("");
    setRefundMessage({ type: "", text: "" });
  }

  function closeRefundModal() {
    setRefundModal(null);
    setRefundSelectedProductIds([]);
    setRefundReason("");
    setRefundMessage({ type: "", text: "" });
  }

  function toggleRefundProduct(productId) {
    setRefundSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }

  async function handleSubmitRefund() {
    if (!refundModal) return;
    if (!refundSelectedProductIds.length) {
      setRefundMessage({ type: "error", text: "환불할 상품을 하나 이상 선택해 주세요." });
      return;
    }
    if (!refundReason.trim()) {
      setRefundMessage({ type: "error", text: "환불 사유를 입력해 주세요." });
      return;
    }
    setRefundSubmitting(true);
    setRefundMessage({ type: "", text: "" });
    try {
      await apiRequest("/refunds", {
        method: "POST",
        body: {
          orderId: refundModal.orderId || refundModal.id,
          selectedProductIds: refundSelectedProductIds,
          reason: refundReason.trim(),
        },
      });
      const result = await apiRequest("/refunds/me");
      setMyRefundRequests(Array.isArray(result?.requests) ? result.requests : []);
      setRefundMessage({ type: "success", text: "환불 신청이 접수되었습니다. 관리자 검토 후 처리됩니다." });
      setTimeout(closeRefundModal, 2000);
    } catch (error) {
      setRefundMessage({ type: "error", text: error.message || "환불 신청에 실패했습니다." });
    } finally {
      setRefundSubmitting(false);
    }
  }

  async function handleSubmitPassRefund() {
    if (!passRefundModal) return;
    if (!passRefundReason.trim()) {
      setPassRefundMessage({ type: "error", text: "환불 사유를 입력해 주세요." });
      return;
    }
    setPassRefundSubmitting(true);
    setPassRefundMessage({ type: "", text: "" });
    try {
      await requestStudioPassRefund({ passId: passRefundModal.id, reason: passRefundReason.trim() });
      setPassRefundMessage({ type: "success", text: "환불 요청이 접수되었습니다. 관리자 검토 후 처리됩니다." });
      setTimeout(() => {
        setPassRefundModal(null);
        setPassRefundReason("");
        setPassRefundMessage({ type: "", text: "" });
      }, 2000);
    } catch (error) {
      setPassRefundMessage({ type: "error", text: error.message || "환불 요청에 실패했습니다." });
    } finally {
      setPassRefundSubmitting(false);
    }
  }

  function getRefundStatusLabel(status) {
    if (status === "pending") return "검토 중";
    if (status === "approved") return "환불 완료";
    if (status === "rejected") return "거절됨";
    return status;
  }

  function getRefundStatusClass(status) {
    if (status === "approved") return "refund-status approved";
    if (status === "rejected") return "refund-status rejected";
    return "refund-status pending";
  }

  async function handleRequestEmailVerification() {
    setSaveMessage({ type: "", text: "" });
    setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });

    if (!normalizedFormEmail) {
      setEmailVerificationState({
        status: "error",
        text: "이메일 주소를 입력해 주세요.",
        verifiedEmail: "",
        debugCode: "",
      });
      return;
    }

    try {
      setIsSendingEmailCode(true);
      const result = await store.requestEmailVerification(normalizedFormEmail);
      setEmailVerificationState({
        status: "pending",
        text: result?.message || "이메일 인증번호를 발송했습니다.",
        verifiedEmail: "",
        debugCode: result?.debugCode || "",
      });
    } catch (error) {
      setEmailVerificationState({
        status: "error",
        text: error?.message || "이메일 인증번호 발송에 실패했습니다.",
        verifiedEmail: "",
        debugCode: "",
      });
    } finally {
      setIsSendingEmailCode(false);
    }
  }

  async function handleConfirmEmailVerification() {
    setSaveMessage({ type: "", text: "" });

    if (!normalizedFormEmail) {
      setEmailVerificationState({
        status: "error",
        text: "이메일 주소를 입력해 주세요.",
        verifiedEmail: "",
        debugCode: "",
      });
      return;
    }

    if (!String(emailVerificationCode || "").trim()) {
      setEmailVerificationState({
        status: "error",
        text: "이메일 인증번호를 입력해 주세요.",
        verifiedEmail: "",
        debugCode: "",
      });
      return;
    }

    try {
      setIsVerifyingEmailCode(true);
      const result = await store.confirmEmailVerification(normalizedFormEmail, emailVerificationCode);
      setEmailVerificationState({
        status: "success",
        text: result?.message || "이메일 인증이 완료되었습니다.",
        verifiedEmail: normalizedFormEmail,
        debugCode: "",
      });
    } catch (error) {
      setEmailVerificationState({
        status: "error",
        text: error?.message || "이메일 인증 확인에 실패했습니다.",
        verifiedEmail: "",
        debugCode: "",
      });
    } finally {
      setIsVerifyingEmailCode(false);
    }
  }

  function handleOpenWithdrawFlow() {
    setWithdrawPassword("");
    setWithdrawPasswordVisible(false);
    setWithdrawError("");
    setWithdrawModalOpen(true);
  }

  async function handleWithdrawAccount() {
    setWithdrawError("");
    if (!withdrawPassword.trim()) {
      setWithdrawError("현재 비밀번호를 입력해주세요.");
      return;
    }
    try {
      setIsWithdrawing(true);
      await store.withdrawMe(null, withdrawPassword.trim());
      navigate("/");
    } catch (error) {
      setWithdrawError(error?.message || "회원 탈퇴 처리에 실패했습니다.");
    } finally {
      setIsWithdrawing(false);
    }
  }

  async function handleToggleMarketing() {
    setMarketingMessage({ type: "", text: "" });
    const next = !currentUser.marketingAgree;
    try {
      setIsMarketingToggling(true);
      await store.updateMarketingAgree(next);
      setMarketingMessage({
        type: "success",
        text: next ? "마케팅 정보 수신에 동의하셨습니다." : "마케팅 정보 수신 동의가 해제되었습니다.",
      });
    } catch (error) {
      setMarketingMessage({
        type: "error",
        text: error?.message || "처리에 실패했습니다.",
      });
    } finally {
      setIsMarketingToggling(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveMessage({ type: "", text: "" });

    if (!form.currentPassword.trim()) {
      setSaveMessage({ type: "error", text: "회원정보 수정을 위해 현재 비밀번호를 입력해 주세요." });
      return;
    }

    if (isEmailChanged && !isEmailVerified) {
      setSaveMessage({ type: "error", text: "이메일을 변경하려면 이메일 인증을 먼저 완료해 주세요." });
      return;
    }

    try {
      setIsSaving(true);
      const updatedUser = await store.updateMyProfile({
        loginId: form.loginId.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        birthYear: form.birthYear.trim() ? form.birthYear.trim() : null,
        newPassword: form.newPassword.trim(),
        currentPassword: form.currentPassword.trim(),
      });

      setForm((prev) => ({
        ...prev,
        loginId: updatedUser.loginId || "",
        name: updatedUser.name || prev.name,
        email: updatedUser.email || "",
        phone: updatedUser.phone || "",
        birthYear: updatedUser.birthYear ? String(updatedUser.birthYear) : "",
        newPassword: "",
        currentPassword: "",
      }));
      setEmailVerificationCode("");
      setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });
      setSaveMessage({ type: "success", text: "회원정보가 성공적으로 수정되었습니다." });
    } catch (error) {
      setSaveMessage({
        type: "error",
        text: error?.message || "회원정보 수정 처리에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMemberClassAction(classId, action) {
    try {
      if (action === "cancel") {
        await cancelStudioClass(classId);
      } else {
        await bookStudioClass(classId);
      }
      const from = formatYmd(new Date());
      const toDate = new Date();
      toDate.setDate(toDate.getDate() + 40);
      const to = formatYmd(toDate);
      const [classes, summary, notifications] = await Promise.all([
        listStudioClasses({ from, to }),
        listMyStudioSummary(),
        listStudioNotificationsByUser(currentUser?.id),
      ]);
      setMemberClasses(classes.map(mapStudioClassToMemberClass));
      setMemberTickets(Array.isArray(summary?.passes) ? summary.passes : []);
      setMemberPassTransactions(Array.isArray(summary?.passTransactions) ? summary.passTransactions : []);
      setMemberNotifications(Array.isArray(notifications) ? notifications : []);
      setStudioDataError("");
    } catch (error) {
      const message = error?.message || "예약 처리에 실패했습니다.";
      setStudioDataError(message);
      alert(message);
    }
  }

  async function handleReadNotification(notificationId) {
    if (!notificationId) return;
    try {
      await markMyStudioNotificationRead(notificationId);
      setMemberNotifications((items) => items.map((item) => (
        item.id === notificationId ? { ...item, readAt: item.readAt || new Date().toISOString() } : item
      )));
    } catch (error) {
      setStudioDataError(error?.message || "알림 읽음 처리에 실패했습니다.");
    }
  }

  async function handleReadAllNotifications() {
    try {
      await markMyStudioNotificationsRead();
      const now = new Date().toISOString();
      setMemberNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt || now })));
    } catch (error) {
      setStudioDataError(error?.message || "알림 읽음 처리에 실패했습니다.");
    }
  }

  const unreadNotificationCount = memberNotifications.filter((item) => !item.readAt).length;
  const orderPageSize = 5;
  const pointPageSize = 5;
  const qnaPageSize = 5;
  const orderTotalPages = Math.max(1, Math.ceil(userOrders.length / orderPageSize));
  const pointHistoryRows = userOrders
    .map((order) => {
      const amount = Number(order.amount || 0);
      const point = Math.max(0, Math.floor(amount * 0.01));
      return {
        id: order.orderId || order.id || `${order.createdAt}-${order.orderName}`,
        date: order.createdAt,
        content: `${order.orderName || "교육 영상"} 구매 적립`,
        point,
      };
    })
    .filter((item) => item.point > 0);
  const pointTotalPages = Math.max(1, Math.ceil(pointHistoryRows.length / pointPageSize));
  const qnaTotalPages = Math.max(1, Math.ceil(myQnaItems.length / qnaPageSize));
  const pagedOrders = userOrders.slice((orderPage - 1) * orderPageSize, orderPage * orderPageSize);
  const pagedPointRows = pointHistoryRows.slice((pointPage - 1) * pointPageSize, pointPage * pointPageSize);
  const pagedQnaItems = myQnaItems.slice((qnaPage - 1) * qnaPageSize, qnaPage * qnaPageSize);
  const accessibleVideoCount = learningHistory.length + grantedLearningHistory.length;

  useEffect(() => {
    setOrderPage((page) => Math.min(page, orderTotalPages));
  }, [orderTotalPages]);

  useEffect(() => {
    setPointPage((page) => Math.min(page, pointTotalPages));
  }, [pointTotalPages]);

  useEffect(() => {
    setQnaPage((page) => Math.min(page, qnaTotalPages));
  }, [qnaTotalPages]);

  function renderSimplePager(page, totalPages, onChange, label) {
    return (
      <div className="mypage-redesign-pager" aria-label={`${label} 페이지`}>
        {totalPages > 1 ? (
          <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
        ) : null}
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
          <button
            key={number}
            type="button"
            className={number === page ? "active" : ""}
            onClick={() => onChange(number)}
          >
            {number}
          </button>
        ))}
        {totalPages > 1 ? (
          <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>›</button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <PageLayout mainClass="dashboard-page mypage-redesign-page">
        <section className="dashboard-hero mypage-hero-card">
          <p className="section-kicker">WELCOME BACK</p>
          <h1>{currentUserDisplayName} 님의 마이페이지</h1>
          <p className="mypage-redesign-hero-subcopy">더 건강하고 아름다운 내일을 응원합니다.</p>
          <div className="mypage-identity-row">
            {[
              ["구매 영상", `${purchasedVideoItemCount}건`],
              ["수강 영상", `${accessibleVideoCount}개`],
              ["수강 완료", `${completedVideoCount}개`],
              ["주문", `${userOrders.length}건`],
            ].map(([label, value]) => (
              <span key={label} className="mypage-identity-chip">
                <em>{label}</em>
                <strong>{value}</strong>
              </span>
            ))}
          </div>
        </section>

        {SHOW_MYPAGE_STUDIO_SERVICES ? (
        <section id="member-services" className="dashboard-card mypage-member-service-card">
          <div className="member-service-header">
            <div>
              <p className="section-kicker">회원 예약 관리</p>
              <h2>수업 예약과 수강권을 한 화면에서 확인합니다</h2>
              <p>
                일/주/월 스케줄을 보면서 예약, 대기, 취소를 직접 처리하고
                보유 수강권의 잔여 횟수와 만료일을 확인할 수 있습니다.
              </p>
            </div>
            <div className="member-calendar-tabs" role="tablist" aria-label="수업 캘린더 보기 방식">
              {MEMBER_CALENDAR_VIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={memberCalendarView === option.value ? "active" : ""}
                  aria-selected={memberCalendarView === option.value}
                  onClick={() => {
                    setMemberCalendarView(option.value);
                    setSelectedMemberDayOffset(null);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {studioDataError ? (
            <div className="message error" role="alert">
              <span>{studioDataError}</span>
              <button type="button" onClick={() => setStudioDataReloadKey((value) => value + 1)}>
                다시 불러오기
              </button>
            </div>
          ) : null}

          <div className="member-service-summary">
            <article>
              <span>예약 가능 횟수</span>
              <strong>{memberReservationAllowance}회</strong>
              <p>그룹 수강권 기준</p>
            </article>
            <article>
              <span>예약 확정</span>
              <strong>{memberReservedCount}건</strong>
              <p>{nextReservedClass ? `${formatRelativeClassDate(nextReservedClass.dayOffset)} ${nextReservedClass.time}` : "예약된 수업 없음"}</p>
            </article>
            <article>
              <span>예약 대기</span>
              <strong>{memberWaitingCount}건</strong>
              <p>대기 순번과 상태 표시</p>
            </article>
            <article>
              <span>보유 수강권</span>
              <strong>{memberTicketItems.length}개</strong>
              <p>잔여 횟수와 만료일 표시</p>
            </article>
          </div>

          <div className="member-service-layout">
            <section className="member-schedule-panel">
              <div className="member-panel-title">
                <h3>수업 스케줄</h3>
                <span>
                  {selectedMemberDayOffset !== null
                    ? formatRelativeClassDate(selectedMemberDayOffset)
                    : memberCalendarView === "day" ? "오늘" : memberCalendarView === "week" ? "이번 주" : "이번 달"}
                </span>
              </div>
              <div className="member-calendar-strip" aria-label="날짜별 수업">
                {memberCalendarDays.map((day) => (
                  <button
                    key={day.offset}
                    type="button"
                    className={selectedMemberDayOffset === day.offset ? "active" : ""}
                    onClick={() => setSelectedMemberDayOffset((current) => (current === day.offset ? null : day.offset))}
                  >
                    <span>{day.label}</span>
                    <strong>{day.count}개</strong>
                  </button>
                ))}
              </div>
              <div className="member-schedule-list">
                {studioDataLoading ? (
                  <p className="member-schedule-empty">수업 정보를 불러오는 중입니다.</p>
                ) : memberVisibleClasses.length ? memberVisibleClasses.map((item) => {
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
                      <button
                        type="button"
                        className={`ghost-button small-ghost ${isReserved ? "danger" : ""}`}
                        onClick={() => handleMemberClassAction(item.id, action)}
                      >
                        {actionLabel}
                      </button>
                    </article>
                  );
                }) : (
                  <p className="member-schedule-empty">선택한 날짜에 예약 가능한 수업이 없습니다.</p>
                )}
              </div>
            </section>

            <aside className="member-ticket-panel">
              <div className="member-panel-title">
                <h3>보유 수강권</h3>
                <span>잔여 / 만료</span>
              </div>
              <div className="member-pass-tabs" role="tablist" aria-label="수강권 상태">
                <button type="button" role="tab" aria-selected={memberPassTab === "active"} className={memberPassTab === "active" ? "active" : ""} onClick={() => setMemberPassTab("active")}>사용 중</button>
                <button type="button" role="tab" aria-selected={memberPassTab === "expired"} className={memberPassTab === "expired" ? "active" : ""} onClick={() => setMemberPassTab("expired")}>만료·종료</button>
              </div>
              <div className="member-ticket-list">
                {visibleMemberTicketItems.length ? visibleMemberTicketItems.map((ticket) => (
                  <article key={ticket.id}>
                    <div>
                      <strong>{ticket.title}</strong>
                      <span>{ticket.type} 수업</span>
                    </div>
                    <p>
                      <strong>{ticket.remaining}</strong> / {ticket.total}회
                    </p>
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
                  <p className="member-payment-empty">{memberPassTab === "active" ? "사용 중인 수강권이 없습니다." : "만료되거나 종료된 수강권이 없습니다."}</p>
                )}
              </div>
              <div className="member-payment-mini">
                <h4>수강권 이용 내역</h4>
                {memberPassTransactions.length ? (
                  memberPassTransactions.slice(0, 5).map((item) => (
                    <p key={item.id}>
                      <span>{item.classTitle || item.passName || "수강권"}</span>
                      <strong>{Number(item.deltaCount || 0) > 0 ? "+" : ""}{item.deltaCount}회</strong>
                    </p>
                  ))
                ) : (
                  <p className="member-payment-empty">이용 내역이 없습니다.</p>
                )}
              </div>
              <div className="member-payment-mini">
                <h4>최근 결제 내역</h4>
                {userOrders.length ? (
                  userOrders.slice(0, 2).map((order, index) => (
                    <p key={order.orderId || order.id || `${order.createdAt}-${index}`}>
                      <span>{order.orderName || "주문 상품"}</span>
                      <strong>{store.formatCurrency(order.amount)}</strong>
                    </p>
                  ))
                ) : (
                  <p className="member-payment-empty">결제 내역이 없습니다.</p>
                )}
              </div>
            </aside>
          </div>

          <div className="member-support-grid">
            {MEMBER_STUDIO_INFO.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <button type="button" className="ghost-button small-ghost" onClick={() => navigate(item.path)}>
                  확인하기
                </button>
              </article>
            ))}
            <article className="member-notification-card">
              <h3>알림 {unreadNotificationCount ? <span>새 알림 {unreadNotificationCount}개</span> : null}</h3>
              {unreadNotificationCount ? (
                <button type="button" className="ghost-button small-ghost" onClick={handleReadAllNotifications}>
                  전체 읽음
                </button>
              ) : null}
              {memberNotifications.map((item, idx) => (
                <p key={item.id || item.title || idx} className={item.readAt ? "is-read" : "is-unread"}>
                  <strong>{item.title || "알림"}</strong>
                  <span>{item.message || item.text || "-"}</span>
                  {!item.readAt ? (
                    <button type="button" onClick={() => handleReadNotification(item.id)}>읽음</button>
                  ) : null}
                </p>
              ))}
              {!memberNotifications.length ? <p>새로운 알림이 없습니다.</p> : null}
            </article>
          </div>
        </section>
        ) : null}

        <div className="mypage-tab-layout">
          <nav className="mypage-sidenav" aria-label="마이페이지 메뉴">
            {[
              { id: "courses", label: "내 강의" },
              { id: "orders", label: "주문·결제" },
              { id: "qna", label: "Q&A" },
              { id: "profile", label: "내 정보" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`mypage-sidenav-item${activeTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="mypage-tab-body">
            {activeTab === "courses" && (
              <div className="mypage-tab-panel">
                <div className="mypage-video-tab-bar">
                  <button
                    type="button"
                    className={`mypage-video-tab ${activeVideoTab === "purchased" ? "active" : ""}`}
                    onClick={() => setActiveVideoTab("purchased")}
                  >
                    구매 영상
                    <span className="mypage-video-tab-count">{purchasedVideos.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`mypage-video-tab ${activeVideoTab === "granted" ? "active" : ""}`}
                    onClick={() => setActiveVideoTab("granted")}
                  >
                    수강 영상
                    <span className="mypage-video-tab-count">{grantedVideos.length}</span>
                  </button>
                </div>

                {certificateMessage.text ? (
                  <p className={`refund-modal-message ${certificateMessage.type}`}>{certificateMessage.text}</p>
                ) : null}

                {activeVideoTab === "purchased" && (
                  <div className="dashboard-card-grid">
                    {learningHistory.length ? (
                      learningHistory.map((video) => {
                        const expiry = calcEnrollmentExpiryForMyPage(store.orders, video.productId || video.id, video.period);
                        const durSec = calcChaptersTotalDuration(video.chapters);
                        const durLabel = formatDuration(durSec);
                        const isExpired = expiry && expiry.daysLeft <= 0;
                        const certificate = certificateByVideoId.get(String(video.id));
                        return (
                          <article key={video.id} className={`dashboard-card mypage-course-card mypage-video-card ${isExpired ? "is-expired" : ""}`}>
                            <img src={resolveAcademyMediaUrl(video.image)} alt={video.title} className="mypage-video-thumb" />
                            <div className="mypage-video-copy">
                              <p className="mini-kicker">
                                {isExpired ? "수강 기한 만료" : video.completed ? "수강 완료" : video.progressPercent > 0 ? "이어 학습" : "새 강의"}
                              </p>
                              <h3>{video.title}</h3>
                              <p className="mypage-course-date">
                                {video.instructor} · {video.category}{durLabel ? ` · ${durLabel}` : ""}
                              </p>
                              <p className="mypage-course-date">
                                진도 {video.progressPercent}%{video.lastWatchedAt ? ` · 최근 수강 ${formatDate(video.lastWatchedAt)}` : " · 아직 시청 전"}
                              </p>
                              <div className="mypage-redesign-progress-line" aria-label={`수강 진행률 ${video.progressPercent}%`}>
                                <span style={{ width: `${Math.max(0, Math.min(100, Number(video.progressPercent || 0)))}%` }} />
                              </div>
                              {video.chapterCount > 0 ? (
                                <p className="mypage-course-date">
                                  차시 {video.completedChapterCount}/{video.chapterCount}
                                  {video.latestChapterTitle ? ` · 최근 차시 ${video.latestChapterTitle}` : ""}
                                </p>
                              ) : null}
                              {expiry ? (
                                <p className={`mypage-expiry-label ${expiry.daysLeft <= 0 ? "is-expired" : expiry.daysLeft <= 7 ? "is-urgent" : expiry.daysLeft <= 30 ? "is-warning" : ""}`}>
                                  {expiry.daysLeft <= 0 ? `수강 기한 만료 (${expiry.expiryLabel})` : `수강 만료 ${expiry.expiryLabel} · D-${expiry.daysLeft}`}
                                </p>
                              ) : null}
                            </div>
                            <div className="mypage-course-actions">
                              <button type="button" className="ghost-button small-ghost" disabled={isExpired} onClick={() => navigate(`/academy/player/${video.id}`)}>
                                {isExpired ? "만료됨" : video.completed ? "다시보기" : video.progressPercent > 0 ? "이어보기" : "지금 수강"}
                              </button>
                              {video.completed ? (
                                <button
                                  type="button"
                                  className="ghost-button small-ghost mypage-certificate-button"
                                  disabled={issuingCertificateVideoId === String(video.id)}
                                  onClick={() => handleCertificateClick(video)}
                                >
                                  {issuingCertificateVideoId === String(video.id)
                                    ? "발급 중..."
                                    : certificate
                                      ? "수료증 보기"
                                      : "수료증 발급"}
                                </button>
                              ) : null}
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <article className="dashboard-card empty-state">
                        <h3>아직 구매한 교육 영상이 없습니다</h3>
                        <p>교육 영상 페이지에서 원하는 강의를 구매해보세요.</p>
                        <button className="pill-button small" type="button" onClick={() => navigate("/academy")}>
                          교육 영상 보러가기
                        </button>
                      </article>
                    )}
                  </div>
                )}

                {activeVideoTab === "granted" && (
                  <div className="dashboard-card-grid">
                    {grantedLearningHistory.length ? (
                      grantedLearningHistory.map((video) => {
                        const durSec = calcChaptersTotalDuration(video.chapters);
                        const durLabel = formatDuration(durSec);
                        const expiresAt = video.grant?.expiresAt ? new Date(video.grant.expiresAt) : null;
                        const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / 86400000) : null;
                        const isExpired = daysLeft !== null && daysLeft <= 0;
                        const certificate = certificateByVideoId.get(String(video.id));
                        return (
                          <article key={video.id} className={`dashboard-card mypage-course-card mypage-video-card mypage-granted-card ${isExpired ? "is-expired" : ""}`}>
                            <img src={resolveAcademyMediaUrl(video.image)} alt={video.title} className="mypage-video-thumb" />
                            <div className="mypage-video-copy">
                              <p className="mini-kicker mypage-granted-badge">센터 제공</p>
                              <h3>{video.title}</h3>
                              <p className="mypage-course-date">
                                {video.instructor}{video.category ? ` · ${video.category}` : ""}{durLabel ? ` · ${durLabel}` : ""}
                              </p>
                              <p className="mypage-course-date">
                                진도 {video.progressPercent}%{video.lastWatchedAt ? ` · 최근 수강 ${formatDate(video.lastWatchedAt)}` : " · 아직 시청 전"}
                              </p>
                              <div className="mypage-redesign-progress-line" aria-label={`수강 진행률 ${video.progressPercent}%`}>
                                <span style={{ width: `${Math.max(0, Math.min(100, Number(video.progressPercent || 0)))}%` }} />
                              </div>
                              {video.chapterCount > 0 && (
                                <p className="mypage-course-date">
                                  차시 {video.completedChapterCount}/{video.chapterCount}
                                  {video.latestChapterTitle ? ` · 최근 차시 ${video.latestChapterTitle}` : ""}
                                </p>
                              )}
                              {daysLeft !== null ? (
                                <p className={`mypage-expiry-label ${isExpired ? "is-expired" : daysLeft <= 1 ? "is-urgent" : daysLeft <= 7 ? "is-warning" : ""}`}>
                                  {isExpired ? "수강 기한 만료" : `수강 만료 D-${daysLeft} · ${expiresAt.toLocaleDateString("ko-KR")}`}
                                </p>
                              ) : (
                                <p className="mypage-expiry-label">무제한 이용</p>
                              )}
                            </div>
                            <div className="mypage-course-actions">
                              <button type="button" className="ghost-button small-ghost" disabled={isExpired} onClick={() => navigate(`/academy/player/${video.id}`)}>
                                {isExpired ? "만료됨" : video.completed ? "다시보기" : video.progressPercent > 0 ? "이어보기" : "지금 수강"}
                              </button>
                              {video.completed ? (
                                <button
                                  type="button"
                                  className="ghost-button small-ghost mypage-certificate-button"
                                  disabled={issuingCertificateVideoId === String(video.id)}
                                  onClick={() => handleCertificateClick(video)}
                                >
                                  {issuingCertificateVideoId === String(video.id)
                                    ? "발급 중..."
                                    : certificate
                                      ? "수료증 보기"
                                      : "수료증 발급"}
                                </button>
                              ) : null}
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <article className="dashboard-card empty-state">
                        <h3>센터에서 제공한 수강 영상이 없습니다</h3>
                        <p>오프라인 수강생은 센터를 통해 영상을 이용하실 수 있습니다.</p>
                      </article>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "orders" && (
              <div className="mypage-tab-panel">
                <section className="mypage-redesign-panel mypage-redesign-table-card mypage-redesign-order-card">
                  <div className="mypage-redesign-panel-head">
                    <div>
                      <p className="mypage-redesign-kicker">ORDER HISTORY</p>
                      <h2>주문 / 결제 내역 <span className="mypage-redesign-count-badge">{userOrders.length}건</span></h2>
                    </div>
                  </div>
                  <div className="mypage-redesign-table-wrap">
                    <table className="mypage-redesign-table">
                      <thead>
                        <tr>
                          <th>주문일</th>
                          <th>주문번호</th>
                          <th>상품명</th>
                          <th>결제금액</th>
                          <th>결제상태</th>
                          <th>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedOrders.length ? pagedOrders.map((order, index) => {
                          const orderId = order.orderId || order.id || "";
                          const orderRequests = myRefundRequests.filter((r) => r.orderId === orderId);
                          const latestRequest = orderRequests[0] || null;
                          const pendingRequest = orderRequests.find((r) => r.status === "pending");
                          const payload = typeof order.payload === "object" ? order.payload : {};
                          const cancelledIds = new Set(
                            Array.isArray(order.cancelledProductIds)
                              ? order.cancelledProductIds
                              : Array.isArray(payload.cancelledProductIds)
                                ? payload.cancelledProductIds
                                : []
                          );
                          const isFullyRefunded = order.paymentStatus === "refunded" ||
                            (order.refundAmount != null && order.refundAmount >= order.amount);
                          const allProductIds = Array.isArray(order.selectedProductIds) ? order.selectedProductIds : [];
                          const activeProductIds = allProductIds.filter((id) => !cancelledIds.has(id));
                          const canRequestRefund = !isFullyRefunded && activeProductIds.length > 0 && !pendingRequest;

                          return (
                            <tr key={orderId || `${order.createdAt || "order"}-${index}`}>
                              <td data-label="주문일">{formatDate(order.createdAt)}</td>
                              <td data-label="주문번호">{orderId || "-"}</td>
                              <td data-label="상품명">{order.orderName || "주문 상품"}</td>
                              <td data-label="결제금액">{store.formatCurrency(order.amount)}</td>
                              <td data-label="결제상태">
                                {latestRequest ? (
                                  <span className={getRefundStatusClass(latestRequest.status)}>
                                    환불 {getRefundStatusLabel(latestRequest.status)}
                                  </span>
                                ) : isFullyRefunded ? (
                                  <span className="refund-status approved">환불 완료</span>
                                ) : (
                                  <span className="refund-status approved">결제완료</span>
                                )}
                              </td>
                              <td data-label="관리">
                                {canRequestRefund ? (
                                  <button
                                    type="button"
                                    className="mypage-redesign-mini-button"
                                    onClick={() => openRefundModal({ ...order, orderId, activeProductIds })}
                                  >
                                    환불 신청
                                  </button>
                                ) : "-"}
                              </td>
                            </tr>
                          );
                        }) : (
                          <tr><td colSpan={6}>주문 내역이 없습니다.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="mypage-redesign-card-foot">
                    <span>전체 {userOrders.length}건</span>
                    {renderSimplePager(orderPage, orderTotalPages, setOrderPage, "주문")}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "qna" && (
              <div className="mypage-tab-panel">
                <section className="mypage-redesign-panel mypage-redesign-table-card mypage-redesign-qna-card">
                  <div className="mypage-redesign-panel-head">
                    <div>
                      <p className="mypage-redesign-kicker">QNA HISTORY</p>
                      <h2>Q&A 내역</h2>
                    </div>
                    <button type="button" className="mypage-redesign-text-button" onClick={() => navigate("/community/inquiry")}>
                      전체 보기 ›
                    </button>
                  </div>
                  <div className="mypage-redesign-table-wrap">
                    <table className="mypage-redesign-table">
                      <thead>
                        <tr>
                          <th>번호</th>
                          <th>제목</th>
                          <th>답변상태</th>
                          <th>작성일</th>
                          <th>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myQnaLoading ? (
                          <tr><td colSpan={5}>불러오는 중...</td></tr>
                        ) : myQnaError ? (
                          <tr><td colSpan={5}>{myQnaError}</td></tr>
                        ) : pagedQnaItems.length ? pagedQnaItems.map((item, index) => (
                          <tr key={item.id}>
                            <td data-label="번호">{myQnaItems.length - ((qnaPage - 1) * qnaPageSize + index)}</td>
                            <td data-label="제목">{item.title}</td>
                            <td data-label="답변상태">
                              <span className={`refund-status ${item.answered ? "approved" : "pending"}`}>
                                {item.answered ? "답변완료" : "답변대기"}
                              </span>
                            </td>
                            <td data-label="작성일">{formatDate(item.createdAt)}</td>
                            <td data-label="관리">
                              <button
                                type="button"
                                className="mypage-redesign-mini-button"
                                onClick={() => navigate(`/academy/player/${item.videoId}`)}
                              >
                                보기
                              </button>
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan={5}>작성한 Q&A가 없습니다.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="mypage-redesign-card-foot">
                    <span>전체 {myQnaItems.length}건</span>
                    {renderSimplePager(qnaPage, qnaTotalPages, setQnaPage, "Q&A")}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "profile" && (
              <div className="mypage-tab-panel">
                <form className="dashboard-card mypage-profile-form" onSubmit={handleSubmit}>
                  <p className="mypage-form-caption">
                    이름은 고정되고, 나머지 정보는 현재 비밀번호 인증 후 변경할 수 있습니다.
                  </p>

                  <div className="mypage-form-grid">
                    <label className="mypage-field">
                      이름 (수정 불가)
                      <input type="text" value={form.name} disabled />
                    </label>
                    <label className="mypage-field">
                      아이디
                      <input
                        type="text"
                        value={form.loginId}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, loginId: event.target.value }))
                        }
                      />
                    </label>

                    <div className="mypage-field">
                      <span>이메일</span>
                      <div className="mypage-inline-field">
                        <input
                          type="email"
                          value={form.email}
                          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                        />
                        <button
                          type="button"
                          className="checkout-text-button mypage-inline-button"
                          onClick={handleRequestEmailVerification}
                          disabled={isSendingEmailCode || !isEmailChanged}
                        >
                          {isSendingEmailCode ? "발송 중..." : "인증번호 발송"}
                        </button>
                      </div>
                    </div>
                    <label className="mypage-field">
                      연락처
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, phone: event.target.value.replace(/\D/g, "") }))
                        }
                      />
                    </label>
                    <label className="mypage-field">
                      출생연도 (선택)
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="예: 1994"
                        value={form.birthYear}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            birthYear: event.target.value.replace(/\D/g, "").slice(0, 4),
                          }))
                        }
                      />
                    </label>

                    {isEmailChanged ? (
                      <div className="mypage-field mypage-field-full">
                        <span>이메일 인증번호</span>
                        <div className="mypage-inline-field">
                          <input
                            type="text"
                            value={emailVerificationCode}
                            onChange={(event) =>
                              setEmailVerificationCode(event.target.value.replace(/\D/g, ""))
                            }
                            placeholder="6자리 인증번호 입력"
                          />
                          <button
                            type="button"
                            className="checkout-text-button mypage-inline-button"
                            onClick={handleConfirmEmailVerification}
                            disabled={isVerifyingEmailCode}
                          >
                            {isVerifyingEmailCode ? "확인 중..." : "인증확인"}
                          </button>
                        </div>
                        {emailVerificationState.text ? (
                          <p className={`mypage-inline-message ${emailVerificationState.status}`}>
                            {emailVerificationState.text}
                            {emailVerificationState.debugCode
                              ? ` (개발용 인증번호: ${emailVerificationState.debugCode})`
                              : ""}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <label className="mypage-field mypage-field-full">
                      새 비밀번호 (선택)
                      <span className="mypage-password-wrap">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          value={form.newPassword}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, newPassword: event.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="mypage-password-toggle"
                          onClick={() => setShowNewPassword((prev) => !prev)}
                          aria-label={showNewPassword ? "새 비밀번호 숨기기" : "새 비밀번호 보기"}
                        >
                          <EyeIcon open={showNewPassword} />
                        </button>
                      </span>
                    </label>

                    <label className="mypage-field mypage-field-full">
                      현재 비밀번호 (인증)
                      <span className="mypage-password-wrap">
                        <input
                          type={showCurrentPassword ? "text" : "password"}
                          required
                          value={form.currentPassword}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="mypage-password-toggle"
                          onClick={() => setShowCurrentPassword((prev) => !prev)}
                          aria-label={showCurrentPassword ? "현재 비밀번호 숨기기" : "현재 비밀번호 보기"}
                        >
                          <EyeIcon open={showCurrentPassword} />
                        </button>
                      </span>
                    </label>
                  </div>

                  <div className="mypage-marketing-inline">
                    <div className="mypage-marketing-row">
                      <div>
                        <strong>마케팅 정보 수신 동의</strong>
                        <p className="mypage-marketing-desc">신규 강의, 이벤트, 할인 혜택 등 유용한 정보를 이메일로 받아보실 수 있습니다.</p>
                      </div>
                      <button
                        type="button"
                        className={`ghost-button small-ghost mypage-marketing-toggle${currentUser.marketingAgree ? " active" : ""}`}
                        onClick={handleToggleMarketing}
                        disabled={isMarketingToggling}
                      >
                        {isMarketingToggling
                          ? "처리 중..."
                          : currentUser.marketingAgree
                            ? "수신 거부"
                            : "수신 동의"}
                      </button>
                    </div>
                    <span className="mypage-marketing-status">
                      현재 상태: <strong>{currentUser.marketingAgree ? "동의" : "미동의"}</strong>
                    </span>
                    {marketingMessage.text ? (
                      <p className={`mypage-save-message ${marketingMessage.type}`}>{marketingMessage.text}</p>
                    ) : null}
                  </div>

                  <NativePushSettings />

                  {saveMessage.text ? (
                    <p className={`mypage-save-message ${saveMessage.type}`}>{saveMessage.text}</p>
                  ) : null}

                  <button className="pill-button full mypage-save-button" type="submit" disabled={isSaving}>
                    {isSaving ? "저장 중..." : "변경사항 저장"}
                  </button>
                </form>

                <div className="dashboard-card mypage-withdraw-card">
                  <div className="mypage-withdraw-header">
                    <h2>회원 탈퇴</h2>
                    <p className="mypage-withdraw-note">
                      탈퇴 후 계정 데이터는 90일간 보존되며, 기간 내 재가입으로 복구하실 수 있습니다.
                    </p>
                  </div>
                  <button type="button" className="ghost-button small-ghost" onClick={handleOpenWithdrawFlow}>
                    회원 탈퇴 진행
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </PageLayout>

      {withdrawModalOpen ? (
        <div className="refund-modal-backdrop" onClick={() => !isWithdrawing && setWithdrawModalOpen(false)}>
          <div className="refund-modal withdraw-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="refund-modal-header">
              <h2>탈퇴 전, 안내 사항</h2>
              <button type="button" className="refund-modal-close" onClick={() => setWithdrawModalOpen(false)}>×</button>
            </div>
            <div className="refund-modal-body withdraw-guide-body">
              <ol className="withdraw-guide-list">
                <li>계정 탈퇴 시, <strong>이끌림 필라테스 서비스에서 모두</strong> 탈퇴됩니다.</li>
                <li>탈퇴시 계정과 관련된 모든 권한이 사라지며 복구할 수 없습니다.</li>
                <li>직접 구매한 강의 수강 권한은 탈퇴 즉시 사라지며, 탈퇴 이전에 환불 신청이 필요합니다.</li>
                <li>탈퇴 후 동일한 이메일로 재가입이 가능하나, 탈퇴된 계정과 연동되지 않습니다.</li>
                <li>탈퇴 후 계정 데이터는 90일간 보존되며, 기간 내 재가입으로 복구하실 수 있습니다.</li>
                <li>현재 비밀번호를 입력하고 탈퇴하기를 누르시면 위 내용에 동의하는 것으로 간주됩니다.</li>
              </ol>

              <div className="withdraw-guide-stats">
                <div className="withdraw-stat-item">
                  <span>구매 강의</span>
                  <strong>{purchasedVideoItemCount}건</strong>
                </div>
                <div className="withdraw-stat-item">
                  <span>주문 내역</span>
                  <strong>{userOrders.length}건</strong>
                </div>
                <div className="withdraw-stat-item">
                  <span>수강 완료</span>
                  <strong>{completedVideoCount}개</strong>
                </div>
              </div>

              <div className="withdraw-guide-warning">
                <span className="withdraw-guide-warning-icon">!</span>
                <div>
                  <p><strong>탈퇴 시, 위 강의 및 주문 정보가 모두 사라집니다.</strong></p>
                  <p>내용을 모두 확인하셨나요?<br />비밀번호를 입력 후, 탈퇴하면 위 내용에 동의하는 것으로 간주됩니다.</p>
                </div>
              </div>

              <div className="withdraw-guide-password-section">
                <label className="withdraw-guide-password-label">비밀번호</label>
                <p className="withdraw-guide-password-desc">본인 확인을 위해 현재 계정의 비밀번호를 입력해주세요.</p>
                <span className="mypage-password-wrap">
                  <input
                    type={withdrawPasswordVisible ? "text" : "password"}
                    className="withdraw-guide-password-input"
                    placeholder="현재 비밀번호"
                    value={withdrawPassword}
                    onChange={(e) => setWithdrawPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleWithdrawAccount()}
                  />
                  <button
                    type="button"
                    className="mypage-password-toggle"
                    onClick={() => setWithdrawPasswordVisible((p) => !p)}
                    aria-label="비밀번호 표시 토글"
                  >
                    <EyeIcon open={withdrawPasswordVisible} />
                  </button>
                </span>
              </div>

              {withdrawError ? (
                <p className="mypage-save-message error">{withdrawError}</p>
              ) : null}

              <button
                type="button"
                className="pill-button full mypage-withdraw-submit"
                onClick={handleWithdrawAccount}
                disabled={isWithdrawing || !withdrawPassword.trim()}
              >
                {isWithdrawing ? "탈퇴 처리 중..." : "탈퇴하기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {refundModal ? (
        <div className="refund-modal-backdrop" onClick={closeRefundModal}>
          <div className="refund-modal" onClick={(e) => e.stopPropagation()}>
            <div className="refund-modal-header">
              <h2>환불 신청</h2>
              <button type="button" className="refund-modal-close" onClick={closeRefundModal}>×</button>
            </div>
            <div className="refund-modal-body">
              <p className="refund-modal-order-name">{refundModal.orderName}</p>

              {refundModal.activeProductIds?.length > 1 ? (
                <div className="refund-product-select">
                  <p className="refund-section-label">환불할 상품 선택</p>
                  {refundModal.activeProductIds.map((productId) => {
                    const video = store.academyVideos?.find(
                      (v) => v.productId === productId || v.id === productId
                    );
                    const product = store.products?.[productId];
                    const displayName = video?.title || product?.name || productId;
                    return (
                      <label key={productId} className="refund-product-item">
                        <input
                          type="checkbox"
                          checked={refundSelectedProductIds.includes(productId)}
                          onChange={() => toggleRefundProduct(productId)}
                        />
                        <span>{displayName}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              <div className="refund-reason-group">
                <label className="refund-section-label" htmlFor="refund-reason">환불 사유</label>
                <textarea
                  id="refund-reason"
                  className="refund-reason-input"
                  rows={4}
                  placeholder="환불 사유를 입력해 주세요."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
              </div>

              {refundMessage.text ? (
                <p className={`refund-modal-message ${refundMessage.type}`}>{refundMessage.text}</p>
              ) : null}
            </div>
            <div className="refund-modal-footer">
              <button type="button" className="ghost-button" onClick={closeRefundModal}>취소</button>
              <button
                type="button"
                className="pill-button"
                disabled={refundSubmitting}
                onClick={handleSubmitRefund}
              >
                {refundSubmitting ? "신청 중..." : "환불 신청하기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {passRefundModal ? (
        <div className="refund-modal-backdrop" onClick={() => { setPassRefundModal(null); setPassRefundReason(""); setPassRefundMessage({ type: "", text: "" }); }}>
          <div className="refund-modal" onClick={(e) => e.stopPropagation()}>
            <div className="refund-modal-header">
              <h2>수강권 환불 요청</h2>
              <button type="button" className="refund-modal-close" onClick={() => { setPassRefundModal(null); setPassRefundReason(""); setPassRefundMessage({ type: "", text: "" }); }}>×</button>
            </div>
            <div className="refund-modal-body">
              <p className="refund-modal-order-name">{passRefundModal.title}</p>
              <div className="refund-reason-group">
                <label className="refund-section-label" htmlFor="pass-refund-reason">환불 사유</label>
                <textarea
                  id="pass-refund-reason"
                  className="refund-reason-input"
                  rows={4}
                  placeholder="환불 사유를 입력해 주세요."
                  value={passRefundReason}
                  onChange={(e) => setPassRefundReason(e.target.value)}
                />
              </div>
              {passRefundMessage.text ? (
                <p className={`refund-modal-message ${passRefundMessage.type}`}>{passRefundMessage.text}</p>
              ) : null}
            </div>
            <div className="refund-modal-footer">
              <button type="button" className="ghost-button" onClick={() => { setPassRefundModal(null); setPassRefundReason(""); setPassRefundMessage({ type: "", text: "" }); }}>취소</button>
              <button
                type="button"
                className="pill-button"
                disabled={passRefundSubmitting}
                onClick={handleSubmitPassRefund}
              >
                {passRefundSubmitting ? "신청 중..." : "환불 요청하기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {certificateModal ? (
        <div className="refund-modal-backdrop certificate-modal-backdrop" onClick={() => setCertificateModal(null)}>
          <div className="refund-modal certificate-modal" onClick={(e) => e.stopPropagation()}>
            <div className="refund-modal-header">
              <h2>수료증</h2>
              <button type="button" className="refund-modal-close" onClick={() => setCertificateModal(null)}>×</button>
            </div>
            <div className="certificate-paper">
              <img
                className="certificate-template-image"
                src={CERTIFICATE_TEMPLATE_IMAGE}
                alt="이끌림 필라테스 수료증"
              />
              <span className="certificate-field certificate-name-field">
                {certificateModal.recipientName}
              </span>
              <span className="certificate-field certificate-course-field">
                {certificateModal.courseTitle}
              </span>
              <span className="certificate-field certificate-date-field">
                {formatCertificateDate(certificateModal.issuedAt)}
              </span>
            </div>
            <div className="refund-modal-footer certificate-modal-actions">
              <button type="button" className="ghost-button" onClick={() => setCertificateModal(null)}>닫기</button>
              <button type="button" className="pill-button" onClick={() => window.print()}>인쇄하기</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

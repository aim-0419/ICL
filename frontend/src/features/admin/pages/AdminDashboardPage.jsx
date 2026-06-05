/**
 * [관리자 회원 관리 페이지]
 *
 * 이 파일은 관리자(admin0, admin1)가 사용하는 회원 관리 화면입니다.
 * 아래 기능을 하나의 페이지에서 처리합니다:
 *
 *  1. 수업 스케줄 관리  — 수업 등록·수정·삭제, 반복 수업, 폐강 처리, 예약자 체크인
 *  2. 스튜디오 회원 관리 — 미수금 등록, 메모 저장, 수강권 정지·양도, 락커 배정, 알림 발송
 *  3. 회원 목록         — 등급 변경, 수강 진도 조회, 구매 이력·환불 처리, 탈퇴·복구
 *  4. 강의 수강 리포트  — 강의별 완강률, 수강자 목록, 기간별 필터
 *
 * ─ 주요 규칙 ─────────────────────────────────────────────────────
 *  · admin0만 회원 등급 변경·탈퇴 처리 가능 (canManageUserGrades 로 판별)
 *  · 날짜·금액 포맷은 shared/utils/format.js 의 공통 함수를 사용합니다
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { apiRequest } from "../../../shared/api/client.js";
import {
  canManageUserGrades,
  formatUserGradeLabel,
  USER_GRADE_OPTIONS,
} from "../../../shared/auth/userRoles.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { formatDateTime } from "../../../shared/utils/format.js";
import {
  assignStudioLocker,
  checkInStudioMember,
  createAdminMemberMemo,
  createAdminStudioClass,
  createStudioArrears,
  createStudioLocker,
  createStudioNotification,
  cancelAdminStudioClass,
  deleteAdminStudioClass,
  listAdminMemberMemos,
  listAdminPassesByUser,
  listAdminStudioMemberSummaries,
  listAdminStudioClassBookings,
  listAdminStudioClasses,
  listAdminInstructorHours,
  listAdminRolePermissions,
  listStudioArrearsByUser,
  listStudioClassCheckins,
  listStudioLockers,
  listStudioLockerAssignments,
  listStudioNotificationsByUser,
  pauseAdminPass,
  resolveStudioArrears,
  resolveStudioPassRefund,
  saveAdminInstructorHours,
  saveAdminRolePermissions,
  transferAdminPass,
  updateAdminStudioClass,
  updateStudioLockerStatus,
  endStudioLockerAssignment,
} from "../../studio/api/studioApi.js";

const LEARNING_RANGE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "today", label: "오늘" },
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
];

const ADMIN_SCHEDULE_VIEW_OPTIONS = [
  { value: "day", label: "일" },
  { value: "week", label: "주" },
  { value: "month", label: "월" },
];

const DEFAULT_ADMIN_CLASS_ROWS = [
  {
    id: "admin-class-private",
    dayOffset: 0,
    time: "09:30",
    title: "개인 레슨",
    instructor: "은혜T",
    type: "개인",
    capacity: 1,
    reservedCount: 1,
    waitlistCount: 0,
    repeat: "반복 없음",
    status: "active",
    attendees: [
      { id: "attendee-1", name: "김지윤", ticket: "개인 10회권", paid: true, checkedIn: false },
    ],
  },
  {
    id: "admin-class-group",
    dayOffset: 1,
    time: "18:00",
    title: "그룹 리포머",
    instructor: "수연T",
    type: "그룹",
    capacity: 8,
    reservedCount: 7,
    waitlistCount: 1,
    repeat: "매주 화/목",
    status: "active",
    attendees: [
      { id: "attendee-2", name: "박민서", ticket: "그룹 20회권", paid: true, checkedIn: true },
      { id: "attendee-3", name: "이하린", ticket: "그룹 20회권", paid: false, checkedIn: false },
      { id: "attendee-4", name: "정서윤", ticket: "그룹 10회권", paid: true, checkedIn: false },
    ],
  },
  {
    id: "admin-class-duet",
    dayOffset: 2,
    time: "20:00",
    title: "듀엣 클래스",
    instructor: "승연T",
    type: "듀엣",
    capacity: 2,
    reservedCount: 2,
    waitlistCount: 2,
    repeat: "매주 수",
    status: "active",
    attendees: [
      { id: "attendee-5", name: "최유진", ticket: "듀엣 10회권", paid: true, checkedIn: false },
      { id: "attendee-6", name: "강나연", ticket: "듀엣 10회권", paid: true, checkedIn: false },
    ],
  },
  {
    id: "admin-class-barrel",
    dayOffset: 5,
    time: "11:00",
    title: "바렐 밸런스",
    instructor: "빛나T",
    type: "그룹",
    capacity: 6,
    reservedCount: 0,
    waitlistCount: 0,
    repeat: "매주 토",
    status: "cancelled",
    attendees: [],
  },
];

// ─── 이 파일에서만 사용하는 내부 헬퍼 함수들 ────────────────────────────────────

/** 금액을 숫자로 안전하게 변환합니다. null·undefined·비숫자가 들어오면 0을 반환합니다. */
function toAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 날짜(Date)에 n일을 더한 새 Date를 반환합니다. */
function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * 수업 시작 시각(DB 문자열)을 오늘 기준 ±일수(정수)로 변환합니다.
 * 예) 오늘이면 0, 내일이면 1, 어제면 -1
 */
function toDayOffsetFromDate(value) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

/** Date 또는 날짜 문자열에서 "HH:MM" 형식의 시각만 추출합니다. */
function toHm(value) {
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * dayOffset(오늘 기준 일수)을 수업 카드 헤더에 표시할 날짜 문자열로 변환합니다.
 * 0 → "오늘 · 06.02.(월)", 1 → "내일 · 06.03.(화)", 그 외 → "06.04.(수)"
 */
function formatAdminClassDate(dayOffset) {
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

function normalizeStudioUserId(value) {
  return String(value ?? "").trim();
}

function summarizeStudioPasses(userId, passes = []) {
  const rows = Array.isArray(passes) ? passes : [];
  const now = Date.now();
  const activePasses = rows.filter((pass) => {
    const status = String(pass.status || "").toLowerCase();
    const expiresAt = pass.expiresAt ? new Date(pass.expiresAt).getTime() : null;
    return status === "active" && (!expiresAt || expiresAt >= now);
  });
  const nearestActivePass = activePasses
    .filter((pass) => pass.expiresAt)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0];
  const daysUntilExpiry = nearestActivePass?.expiresAt
    ? Math.ceil((new Date(nearestActivePass.expiresAt).getTime() - now) / 86400000)
    : null;
  const passStatus =
    rows.length <= 0
      ? "none"
      : activePasses.length <= 0
        ? "expired"
        : daysUntilExpiry !== null && daysUntilExpiry <= 14
          ? "expiring"
          : "active";

  return {
    userId: normalizeStudioUserId(userId),
    passCount: rows.length,
    activePassCount: activePasses.length,
    expiredPassCount: rows.filter((pass) => pass.expiresAt && new Date(pass.expiresAt).getTime() < now).length,
    remainingCount: activePasses.reduce((sum, pass) => sum + Number(pass.remainingCount || 0), 0),
    nearestExpiresAt: nearestActivePass?.expiresAt || null,
    daysUntilExpiry,
    latestPassName: rows[0]?.passName || "",
    passStatus,
    hasStudioPass: rows.length > 0,
    isStudioMember: passStatus === "active" || passStatus === "expiring",
    isExpiredStudioMember: passStatus === "expired",
  };
}

function getStudioPassStatusLabel(summary) {
  if (!summary?.hasStudioPass) return "수강권 없음";
  if (summary.passStatus === "expired") return "수강권 만료";
  if (summary.passStatus === "expiring") return "만료 임박";
  if (summary.passStatus === "active") return "수강권 활성";
  return "수강권 없음";
}

function getStudioPassDateLabel(value) {
  if (!value) return "만료일 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function hasWebsiteActivity(user) {
  return (
    Number(user?.orderCount || 0) > 0 ||
    Number(user?.purchasedLectureCount || 0) > 0 ||
    Number(user?.engagedLectureCount || 0) > 0 ||
    Number(user?.completedLectureCount || 0) > 0 ||
    Number(user?.totalSpent || 0) > 0
  );
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
  const [memberTab, setMemberTab] = useState("all"); // all/education/studio/both/expired
  const [withdrawingUserId, setWithdrawingUserId] = useState(""); // 탈퇴·복구 처리 중인 회원 ID
  const [withdrawMessage, setWithdrawMessage] = useState({ type: "", text: "" }); // 탈퇴·복구 결과 메시지
  const [refundingOrderId, setRefundingOrderId] = useState(""); // 환불 처리 중인 주문 ID
  const [refundMessage, setRefundMessage] = useState({ type: "", text: "" }); // 환불 처리 결과 메시지

  // ── 수강 진도 관련 상태 ──────────────────────────────────────────────────────
  const [learningRange, setLearningRange] = useState("all"); // 기간 필터: "all"·"today"·"7d"·"30d"
  const [openLearningUserId, setOpenLearningUserId] = useState(""); // 수강 진도 패널을 열어 둔 회원 ID
  const [openPurchaseUserId, setOpenPurchaseUserId] = useState(""); // 구매 이력 패널을 열어 둔 회원 ID
  const [learningByUserId, setLearningByUserId] = useState({});    // 수강 진도 데이터 캐시 { "userId::range": [...] }
  const [learningLoadingUserId, setLearningLoadingUserId] = useState(""); // 진도 로딩 중인 회원 ID
  const [learningErrorByUserId, setLearningErrorByUserId] = useState({}); // 진도 로드 실패 메시지 캐시

  // ── 강의 수강 리포트 상태 ────────────────────────────────────────────────────
  const [lectureReports, setLectureReports] = useState([]);           // 강의별 수강 리포트 배열
  const [lectureReportsLoading, setLectureReportsLoading] = useState(true);
  const [lectureReportsError, setLectureReportsError] = useState("");
  const [lectureTab, setLectureTab] = useState("active"); // "active"=공개 강의 / "hidden"=숨김 강의

  // ── 수업 스케줄(캘린더) 관련 상태 ───────────────────────────────────────────
  const [adminScheduleView, setAdminScheduleView] = useState("week"); // "day"·"week"·"month"
  const [adminClasses, setAdminClasses] = useState([]);  // 화면에 표시할 수업 목록
  const [classDraft, setClassDraft] = useState({         // 새 수업 등록 폼 데이터
    title: "",
    instructor: "",
    time: "",
    type: "그룹",
  });
  const [editingClassId, setEditingClassId] = useState(""); // 현재 수정 중인 수업 ID
  const [classEditDraft, setClassEditDraft] = useState({    // 수업 수정 폼 데이터
    title: "",
    instructor: "",
    time: "",
  });

  // ── 스튜디오 회원 관리 패널 상태 ─────────────────────────────────────────────
  const [studioSelectedUserId, setStudioSelectedUserId] = useState(""); // 운영 패널에서 선택된 회원 ID
  const [studioBusy, setStudioBusy] = useState(false);                 // API 호출 중 버튼 비활성화용
  const [studioMessage, setStudioMessage] = useState({ type: "", text: "" }); // 작업 결과 메시지
  const [studioUserArrears, setStudioUserArrears] = useState([]);      // 선택 회원의 미수금 목록
  const [studioUserMemos, setStudioUserMemos] = useState([]);          // 선택 회원의 메모 목록
  const [studioUserPasses, setStudioUserPasses] = useState([]);        // 선택 회원의 수강권 목록
  const [studioMemberSummaries, setStudioMemberSummaries] = useState({}); // 회원별 스튜디오 수강권 요약
  const [studioUserNotifications, setStudioUserNotifications] = useState([]); // 선택 회원의 알림 이력

  // ── 락커 관리 상태 ──────────────────────────────────────────────────────────
  const [studioLockers, setStudioLockers] = useState([]);             // 전체 락커 목록
  const [studioLockerAssignments, setStudioLockerAssignments] = useState([]); // 현재 배정된 락커 목록
  const [studioLockerNo, setStudioLockerNo] = useState("");           // 락커 생성 폼 - 번호
  const [studioLockerLocation, setStudioLockerLocation] = useState(""); // 락커 생성 폼 - 위치
  const [studioAssignLockerId, setStudioAssignLockerId] = useState(""); // 배정할 락커 ID
  const [studioAssignEndDate, setStudioAssignEndDate] = useState("");  // 락커 배정 만료일

  // ── 미수금·메모·알림 폼 상태 ─────────────────────────────────────────────────
  const [studioMemoDraft, setStudioMemoDraft] = useState("");          // 메모 입력값
  const [studioArrearsAmount, setStudioArrearsAmount] = useState("");  // 미수금 금액 입력값
  const [studioArrearsReason, setStudioArrearsReason] = useState("");  // 미수금 사유 입력값
  const [studioNotificationTitle, setStudioNotificationTitle] = useState("");   // 알림 제목
  const [studioNotificationMessage, setStudioNotificationMessage] = useState(""); // 알림 내용

  // ── 운영 설정 상태 ──────────────────────────────────────────────────────────
  const [studioInstructorHours, setStudioInstructorHours] = useState([]); // 강사별 근무시간 설정
  const [studioRolePermissions, setStudioRolePermissions] = useState([]); // 역할별 권한 설정

  /**
   * 수강 진도 캐시 키를 생성합니다.
   * 같은 회원이더라도 기간 필터가 바뀌면 새로 로드해야 하므로 "userId::range" 형태로 구분합니다.
   */
  function buildLearningCacheKey(userId, range = learningRange) {
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

  async function loadStudioMemberSummaries() {
    const rows = await listAdminStudioMemberSummaries();
    const summaryMap = {};
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const key = normalizeStudioUserId(row.userId);
      if (key) summaryMap[key] = row;
    });
    setStudioMemberSummaries(summaryMap);
  }

  /** 강의별 수강 리포트를 서버에서 불러옵니다. 기간 필터(range)가 바뀔 때마다 재호출됩니다. */
  async function loadLectureReports(range = learningRange) {
    try {
      setLectureReportsLoading(true);
      setLectureReportsError("");
      const result = await apiRequest(
        `/admin/dashboard/lectures/progress?range=${encodeURIComponent(range)}`
      );
      setLectureReports(Array.isArray(result?.lectures) ? result.lectures : []);
    } catch (error) {
      setLectureReportsError(error.message || "강의별 수강 리포트를 불러오지 못했습니다.");
    } finally {
      setLectureReportsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    loadLectureReports(learningRange);
  }, [learningRange]);

  /**
   * 이번 달 수업 목록을 서버에서 불러와 화면에 표시할 형태로 변환합니다.
   * 각 수업마다 예약자 목록과 체크인 상태를 함께 조회합니다.
   * 서버 호출이 실패하면 DEFAULT_ADMIN_CLASS_ROWS(샘플 데이터)로 대체합니다.
   */
  async function loadAdminStudioClasses() {
    const from = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01 00:00:00`;
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const to = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(monthEnd).padStart(2, "0")} 23:59:59`;
    const rows = await listAdminStudioClasses({ from, to, status: "active" });

    const mapped = await Promise.all(
      (Array.isArray(rows) ? rows : []).map(async (row) => {
        const [bookings, checkins] = await Promise.all([
          listAdminStudioClassBookings(row.id).catch(() => []),
          listStudioClassCheckins(row.id).catch(() => []),
        ]);
        const checkedUserMap = new Set((Array.isArray(checkins) ? checkins : []).map((c) => String(c.userId || "")));
        return {
          id: row.id,
          dayOffset: toDayOffsetFromDate(row.startAt),
          time: toHm(row.startAt),
          title: row.title,
          instructor: row.instructorName || "-",
          type: "그룹",
          capacity: Number(row.capacity || 0),
          reservedCount: Number(row.reservedCount || 0),
          waitlistCount: Number(row.waitlistCount || 0),
          repeat: row.repeatGroupId ? "반복 수업" : "반복 없음",
          status: row.status || "active",
          attendees: (Array.isArray(bookings) ? bookings : []).map((b) => ({
            id: b.id,
            userId: b.userId,
            name: b.userName || b.loginId || b.userId,
            phone: b.userPhone || "",
            ticket: b.passName || "수강권 미확인",
            paid: Number(b.openArrearsAmount || 0) <= 0,
            openArrearsAmount: Number(b.openArrearsAmount || 0),
            checkedIn: checkedUserMap.has(String(b.userId || "")),
            status: b.status,
          })),
        };
      })
    );
    setAdminClasses(mapped.length ? mapped : DEFAULT_ADMIN_CLASS_ROWS);
  }

  /**
   * 선택된 회원의 스튜디오 관련 데이터(미수금·메모·수강권·알림)를 한 번에 새로고침합니다.
   * 운영 패널에서 회원을 선택하거나 작업 완료 후 최신 상태를 반영할 때 사용합니다.
   */
  async function refreshStudioUserData(userId) {
    if (!userId) return;
    const [arrears, memos, passes, notifications] = await Promise.all([
      listStudioArrearsByUser(userId).catch(() => []),
      listAdminMemberMemos(userId).catch(() => []),
      listAdminPassesByUser(userId).catch(() => []),
      listStudioNotificationsByUser(userId).catch(() => []),
    ]);
    setStudioUserArrears(Array.isArray(arrears) ? arrears : []);
    setStudioUserMemos(Array.isArray(memos) ? memos : []);
    setStudioUserPasses(Array.isArray(passes) ? passes : []);
    setStudioUserNotifications(Array.isArray(notifications) ? notifications : []);
    setStudioMemberSummaries((previous) => ({
      ...previous,
      [normalizeStudioUserId(userId)]: summarizeStudioPasses(userId, Array.isArray(passes) ? passes : []),
    }));
  }

  async function loadStudioLockerData() {
    const [lockers, assignments] = await Promise.all([
      listStudioLockers().catch(() => []),
      listStudioLockerAssignments({ status: "active" }).catch(() => []),
    ]);
    setStudioLockers(Array.isArray(lockers) ? lockers : []);
    setStudioLockerAssignments(Array.isArray(assignments) ? assignments : []);
  }

  useEffect(() => {
    loadAdminStudioClasses().catch(() => setAdminClasses(DEFAULT_ADMIN_CLASS_ROWS));
    loadStudioLockerData().catch(() => {});
    loadStudioMemberSummaries().catch(() => {});
    listAdminInstructorHours().then((rows) => setStudioInstructorHours(Array.isArray(rows) ? rows : [])).catch(() => {});
    listAdminRolePermissions().then((rows) => setStudioRolePermissions(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, []);

  function getStudioSummaryForUser(user) {
    return studioMemberSummaries[normalizeStudioUserId(user?.id)] || null;
  }

  function getMemberSegment(user) {
    if (user?.accountStatus === "withdrawn") return "withdrawn";
    const studioSummary = getStudioSummaryForUser(user);
    const hasEducation = hasWebsiteActivity(user);
    if (studioSummary?.isExpiredStudioMember) return "expired";
    if (studioSummary?.isStudioMember && hasEducation) return "both";
    if (studioSummary?.isStudioMember) return "studio";
    if (hasEducation) return "education";
    return "registered";
  }

  const activeUsers = useMemo(() => users.filter((u) => u.accountStatus !== "withdrawn"), [users]);
  const memberSegmentCounts = useMemo(() => {
    return users.reduce(
      (acc, user) => {
        const segment = getMemberSegment(user);
        acc.all += 1;
        if (segment === "registered") acc.registered += 1;
        if (segment === "education") acc.education += 1;
        if (segment === "studio") acc.studio += 1;
        if (segment === "both") acc.both += 1;
        if (segment === "expired") acc.expired += 1;
        return acc;
      },
      { all: 0, registered: 0, education: 0, studio: 0, both: 0, expired: 0 }
    );
  }, [users, studioMemberSummaries]);

  const filteredUsers = useMemo(() => {
    const base = users.filter((user) => memberTab === "all" || getMemberSegment(user) === memberTab);
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return base;
    return base.filter((user) =>
      `${user.name} ${user.loginId} ${user.email} ${formatUserGradeLabel(user.userGrade)} ${getStudioPassStatusLabel(getStudioSummaryForUser(user))}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [searchQuery, memberTab, users, studioMemberSummaries]);

  const summary = useMemo(() => {
    return activeUsers.reduce(
      (acc, user) => {
        const grade = String(user.userGrade || "member").toLowerCase();
        acc.totalMembers += 1;
        acc.totalRevenue += toAmount(user.totalSpent);
        if (grade === "admin0" || grade === "admin1") acc.totalAdmins += 1;
        if (grade === "vip") acc.totalVip += 1;
        if (grade === "vvip") acc.totalVvip += 1;
        return acc;
      },
      { totalMembers: 0, totalAdmins: 0, totalVip: 0, totalVvip: 0, totalRevenue: 0 }
    );
  }, [activeUsers]);

  const visibleAdminClasses = useMemo(() => {
    return adminClasses.filter((item) => {
      if (adminScheduleView === "day") return item.dayOffset === 0;
      if (adminScheduleView === "week") return item.dayOffset <= 6;
      return true;
    });
  }, [adminClasses, adminScheduleView]);

  const adminOperationSummary = useMemo(() => {
    const attendeeRows = adminClasses.flatMap((item) => item.attendees || []);
    return {
      classCount: adminClasses.filter((item) => item.status !== "cancelled").length,
      reservedCount: adminClasses.reduce((sum, item) => sum + Number(item.reservedCount || 0), 0),
      waitlistCount: adminClasses.reduce((sum, item) => sum + Number(item.waitlistCount || 0), 0),
      unpaidCount: attendeeRows.filter((item) => !item.paid).length,
      checkedInCount: attendeeRows.filter((item) => item.checkedIn).length,
    };
  }, [adminClasses]);

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
    const cacheKey = buildLearningCacheKey(userId, learningRange);
    if (learningByUserId[cacheKey]) return;

    try {
      setLearningLoadingUserId(userId);
      setLearningErrorByUserId((prev) => ({ ...prev, [cacheKey]: "" }));
      const result = await apiRequest(
        `/admin/dashboard/users/${encodeURIComponent(userId)}/progress?range=${encodeURIComponent(
          learningRange
        )}`
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

  async function handleAddAdminClass(event) {
    event.preventDefault();
    try {
      setStudioBusy(true);
      const now = new Date();
      const time = classDraft.time.trim() || "12:00";
      const start = new Date(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${time}:00`
      );
      const end = new Date(start.getTime() + 50 * 60000);
      await createAdminStudioClass({
        title: classDraft.title.trim() || "새 수업",
        instructorName: classDraft.instructor.trim() || "",
        roomName: classDraft.type,
        startAt: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")} ${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}:00`,
        endAt: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")} ${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}:00`,
        capacity: classDraft.type === "개인" ? 1 : classDraft.type === "듀엣" ? 2 : 8,
      });
      setClassDraft({ title: "", instructor: "", time: "", type: "그룹" });
      await loadAdminStudioClasses();
    } catch (error) {
      setStudioMessage({ type: "error", text: error?.message || "수업 등록에 실패했습니다." });
    } finally {
      setStudioBusy(false);
    }
  }

  function handleStartEditClass(classItem) {
    setEditingClassId(classItem.id);
    setClassEditDraft({
      title: classItem.title,
      instructor: classItem.instructor,
      time: classItem.time,
    });
  }

  async function handleSaveClassEdit(classId) {
    const origin = adminClasses.find((item) => item.id === classId);
    if (!origin) return;
    try {
      setStudioBusy(true);
      const base = new Date();
      const day = new Date(base.getTime() + Number(origin.dayOffset || 0) * 86400000);
      const time = classEditDraft.time.trim() || origin.time || "12:00";
      const start = new Date(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}T${time}:00`);
      const end = new Date(start.getTime() + 50 * 60000);
      await updateAdminStudioClass(classId, {
        title: classEditDraft.title.trim() || origin.title,
        instructorName: classEditDraft.instructor.trim() || origin.instructor,
        roomName: origin.type,
        startAt: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")} ${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}:00`,
        endAt: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")} ${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}:00`,
        capacity: origin.capacity,
      });
      setEditingClassId("");
      await loadAdminStudioClasses();
    } catch (error) {
      setStudioMessage({ type: "error", text: error?.message || "수업 수정에 실패했습니다." });
    } finally {
      setStudioBusy(false);
    }
  }

  async function handleToggleClassCancelled(classId) {
    try {
      setStudioBusy(true);
      await deleteAdminStudioClass(classId);
      await loadAdminStudioClasses();
    } catch (error) {
      setStudioMessage({ type: "error", text: error?.message || "폐강 처리에 실패했습니다." });
    } finally {
      setStudioBusy(false);
    }
  }

  async function handleDeleteClass(classId) {
    try {
      setStudioBusy(true);
      await cancelAdminStudioClass(classId);
      await loadAdminStudioClasses();
    } catch (error) {
      setStudioMessage({ type: "error", text: error?.message || "삭제 처리에 실패했습니다." });
    } finally {
      setStudioBusy(false);
    }
  }

  /** 예약자의 체크인 상태를 처리합니다. 버튼 클릭 시 서버에 체크인 기록을 저장합니다. */
  async function handleToggleCheckIn(classId, attendee) {
    if (!attendee?.userId) return;
    try {
      setStudioBusy(true);
      await checkInStudioMember({ classId, userId: attendee.userId, bookingId: attendee.id, status: "checked_in" });
      await loadAdminStudioClasses();
    } catch (error) {
      setStudioMessage({ type: "error", text: error?.message || "체크인 처리에 실패했습니다." });
    } finally {
      setStudioBusy(false);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="dashboard-page admin-dashboard-page">
        <section className="admin-dashboard-switch">
          <Link className="admin-dashboard-switch-link" to="/admin">
            일정 관리
          </Link>
          <Link className="admin-dashboard-switch-link active" to="/admin/members">
            회원 관리
          </Link>
          <Link className="admin-dashboard-switch-link" to="/admin/products">
            상품 관리
          </Link>
          <Link className="admin-dashboard-switch-link" to="/admin/refunds">
            환불 관리
          </Link>
          <Link className="admin-dashboard-switch-link" to="/admin/sales">
            매출 대시보드
          </Link>
        </section>

        <section className="dashboard-hero mypage-hero-card">
          <p className="section-kicker">관리자 대시보드</p>
          <h1>회원 관리</h1>
          <div className="mypage-identity-row">
            <span className="mypage-identity-chip">회원 {summary.totalMembers}명</span>
            <span className="mypage-identity-chip">관리자 {summary.totalAdmins}명</span>
            <span className="mypage-identity-chip">VIP {summary.totalVip}명</span>
            <span className="mypage-identity-chip">VVIP {summary.totalVvip}명</span>
            <span className="mypage-identity-chip">누적 매출 {store.formatCurrency(summary.totalRevenue)}</span>
          </div>
        </section>

        <section className="dashboard-card admin-operation-panel">
          <div className="admin-operation-header">
            <div>
              <p className="section-kicker">센터 운영 관리</p>
              <h2>스케줄, 예약 인원, 체크인을 한 화면에서 관리합니다</h2>
              <p>
                수업 등록·수정·삭제, 반복 수업, 폐강 처리, 회원별 수강권과 미수금,
                예약·취소 조건까지 관리자 화면에서 확인하는 구조입니다.
              </p>
            </div>
            <div className="admin-operation-view-tabs" role="tablist" aria-label="관리자 캘린더 보기 방식">
              {ADMIN_SCHEDULE_VIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={adminScheduleView === option.value ? "active" : ""}
                  aria-selected={adminScheduleView === option.value}
                  onClick={() => setAdminScheduleView(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-operation-summary">
            <article>
              <span>운영 수업</span>
              <strong>{adminOperationSummary.classCount}개</strong>
            </article>
            <article>
              <span>예약 인원</span>
              <strong>{adminOperationSummary.reservedCount}명</strong>
            </article>
            <article>
              <span>대기 인원</span>
              <strong>{adminOperationSummary.waitlistCount}명</strong>
            </article>
            <article>
              <span>미수금</span>
              <strong>{adminOperationSummary.unpaidCount}건</strong>
            </article>
            <article>
              <span>체크인</span>
              <strong>{adminOperationSummary.checkedInCount}명</strong>
            </article>
          </div>

          <form className="admin-class-form" onSubmit={handleAddAdminClass}>
            <input
              type="text"
              value={classDraft.title}
              placeholder="수업명"
              onChange={(event) => setClassDraft((prev) => ({ ...prev, title: event.target.value }))}
            />
            <input
              type="text"
              value={classDraft.instructor}
              placeholder="강사명"
              onChange={(event) => setClassDraft((prev) => ({ ...prev, instructor: event.target.value }))}
            />
            <input
              type="time"
              value={classDraft.time}
              onChange={(event) => setClassDraft((prev) => ({ ...prev, time: event.target.value }))}
            />
            <select
              value={classDraft.type}
              onChange={(event) => setClassDraft((prev) => ({ ...prev, type: event.target.value }))}
            >
              <option value="개인">개인</option>
              <option value="듀엣">듀엣</option>
              <option value="그룹">그룹</option>
            </select>
            <button type="submit" className="pill-button small">
              수업 등록
            </button>
          </form>

          <div className="admin-operation-layout">
            <section className="admin-schedule-manager">
              <div className="admin-operation-section-title">
                <h3>수업 스케줄</h3>
                <span>{adminScheduleView === "day" ? "오늘" : adminScheduleView === "week" ? "이번 주" : "이번 달"}</span>
              </div>

              <div className="admin-class-list">
                {visibleAdminClasses.map((classItem) => {
                  const isEditing = editingClassId === classItem.id;
                  const isCancelled = classItem.status === "cancelled";

                  return (
                    <article key={classItem.id} className={`admin-class-card ${isCancelled ? "is-cancelled" : ""}`}>
                      <div className="admin-class-main">
                        <time>
                          <strong>{formatAdminClassDate(classItem.dayOffset)}</strong>
                          <span>{classItem.time}</span>
                        </time>
                        <div>
                          {isEditing ? (
                            <div className="admin-class-edit-grid">
                              <input
                                type="text"
                                value={classEditDraft.title}
                                onChange={(event) =>
                                  setClassEditDraft((prev) => ({ ...prev, title: event.target.value }))
                                }
                              />
                              <input
                                type="text"
                                value={classEditDraft.instructor}
                                onChange={(event) =>
                                  setClassEditDraft((prev) => ({ ...prev, instructor: event.target.value }))
                                }
                              />
                              <input
                                type="time"
                                value={classEditDraft.time}
                                onChange={(event) =>
                                  setClassEditDraft((prev) => ({ ...prev, time: event.target.value }))
                                }
                              />
                            </div>
                          ) : (
                            <>
                              <h3>{classItem.title}</h3>
                              <p>
                                {classItem.instructor} · {classItem.type} · {classItem.repeat}
                              </p>
                            </>
                          )}
                          <div className="admin-class-badges">
                            <span>예약 {classItem.reservedCount}/{classItem.capacity}</span>
                            <span>대기 {classItem.waitlistCount}</span>
                            <span className={isCancelled ? "cancelled" : "active"}>
                              {isCancelled ? "폐강" : "운영중"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="admin-class-actions">
                        {isEditing ? (
                          <>
                            <button type="button" className="ghost-button small-ghost" onClick={() => handleSaveClassEdit(classItem.id)}>
                              저장
                            </button>
                            <button type="button" className="ghost-button small-ghost" onClick={() => setEditingClassId("")}>
                              취소
                            </button>
                          </>
                        ) : (
                          <button type="button" className="ghost-button small-ghost" onClick={() => handleStartEditClass(classItem)}>
                            수정
                          </button>
                        )}
                        <button
                          type="button"
                          className={`ghost-button small-ghost ${isCancelled ? "" : "danger"}`}
                          onClick={() => handleToggleClassCancelled(classItem.id)}
                        >
                          {isCancelled ? "폐강 해제" : "폐강 처리"}
                        </button>
                        <button type="button" className="ghost-button small-ghost danger" onClick={() => handleDeleteClass(classItem.id)}>
                          삭제
                        </button>
                      </div>

                      <div className="admin-attendee-list">
                        {classItem.attendees.length ? (
                          classItem.attendees.map((attendee) => (
                            <div key={attendee.id} className="admin-attendee-row">
                              <span>{attendee.phone ? `${attendee.name} · ${attendee.phone}` : attendee.name}</span>
                              <span>{attendee.ticket}</span>
                              <span className={attendee.paid ? "paid" : "unpaid"}>
                                {attendee.paid ? "결제 완료" : `미수금 ${store.formatCurrency(attendee.openArrearsAmount || 0)}`}
                              </span>
                              <button
                                type="button"
                                className="ghost-button small-ghost"
                                onClick={() => handleToggleCheckIn(classItem.id, attendee)}
                              >
                                {attendee.checkedIn ? "체크인 완료" : "체크인"}
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="admin-empty-copy">예약 인원이 없습니다.</p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className="admin-operation-tools">
              <article>
                <h3>운영 실행 패널</h3>
                <p>선택 회원: {studioSelectedUserId || "없음"}</p>
                {studioMessage.text ? <p className={`admin-form-message ${studioMessage.type}`}>{studioMessage.text}</p> : null}
              </article>

              <article>
                <h3>미수금 / 메모</h3>
                <input type="number" placeholder="미수금 금액" value={studioArrearsAmount} onChange={(e) => setStudioArrearsAmount(e.target.value)} />
                <input type="text" placeholder="미수금 사유" value={studioArrearsReason} onChange={(e) => setStudioArrearsReason(e.target.value)} />
                <button
                  type="button"
                  className="ghost-button small-ghost"
                  disabled={!studioSelectedUserId || studioBusy}
                  onClick={async () => {
                    try {
                      setStudioBusy(true);
                      await createStudioArrears({
                        userId: studioSelectedUserId,
                        amount: Number(studioArrearsAmount || 0),
                        reason: studioArrearsReason || "미수금 등록",
                      });
                      await refreshStudioUserData(studioSelectedUserId);
                    } finally {
                      setStudioBusy(false);
                    }
                  }}
                >
                  미수금 등록
                </button>
                <input type="text" placeholder="회원 메모" value={studioMemoDraft} onChange={(e) => setStudioMemoDraft(e.target.value)} />
                <button
                  type="button"
                  className="ghost-button small-ghost"
                  disabled={!studioSelectedUserId || !studioMemoDraft.trim() || studioBusy}
                  onClick={async () => {
                    try {
                      setStudioBusy(true);
                      await createAdminMemberMemo({ userId: studioSelectedUserId, memo: studioMemoDraft });
                      setStudioMemoDraft("");
                      await refreshStudioUserData(studioSelectedUserId);
                    } finally {
                      setStudioBusy(false);
                    }
                  }}
                >
                  메모 저장
                </button>
                {studioUserArrears.slice(0, 3).map((row) => (
                  <p key={row.id}>
                    {row.reason} · {store.formatCurrency(Number(row.amount || 0))}
                    {row.status === "open" ? (
                      <button
                        type="button"
                        className="ghost-button small-ghost"
                        onClick={async () => {
                          await resolveStudioArrears(row.id);
                          await refreshStudioUserData(studioSelectedUserId);
                        }}
                      >
                        정리
                      </button>
                    ) : null}
                  </p>
                ))}
              </article>

              <article>
                <h3>수강권 처리</h3>
                <div className="admin-attendee-list">
                  {studioUserPasses.length ? (
                    studioUserPasses.map((pass) => (
                      <div key={pass.id} className="admin-attendee-row">
                        <span>{pass.passName}</span>
                        <span>{pass.remainingCount}/{pass.totalCount}회 · {pass.status}</span>
                        <button
                          type="button"
                          className="ghost-button small-ghost"
                          disabled={studioBusy || pass.status !== "active"}
                          onClick={async () => {
                            await pauseAdminPass({ passId: pass.id, reason: "관리자 정지" });
                            await refreshStudioUserData(studioSelectedUserId);
                            setStudioMessage({ type: "success", text: "수강권 정지 처리 완료" });
                          }}
                        >
                          정지
                        </button>
                        <button
                          type="button"
                          className="ghost-button small-ghost"
                          disabled={studioBusy || pass.status !== "active"}
                          onClick={async () => {
                            const toUserId = window.prompt("양도 받을 회원 ID");
                            if (!toUserId) return;
                            await transferAdminPass({ passId: pass.id, toUserId, reason: "관리자 양도" });
                            await refreshStudioUserData(studioSelectedUserId);
                            setStudioMessage({ type: "success", text: "수강권 양도 처리 완료" });
                          }}
                        >
                          양도
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="admin-empty-copy">선택 회원의 수강권이 없습니다.</p>
                  )}
                </div>
                <button
                  type="button"
                  className="ghost-button small-ghost"
                  disabled={studioBusy}
                  onClick={async () => {
                    const refundId = window.prompt("환불 요청 ID");
                    if (!refundId) return;
                    await resolveStudioPassRefund(refundId, "approved");
                    setStudioMessage({ type: "success", text: "환불 승인 완료" });
                  }}
                >
                  환불 승인
                </button>
              </article>

              <article>
                <h3>락커 관리</h3>
                <input type="text" placeholder="락커 번호" value={studioLockerNo} onChange={(e) => setStudioLockerNo(e.target.value)} />
                <input type="text" placeholder="위치" value={studioLockerLocation} onChange={(e) => setStudioLockerLocation(e.target.value)} />
                <button
                  type="button"
                  className="ghost-button small-ghost"
                  onClick={async () => {
                    await createStudioLocker({ lockerNo: studioLockerNo, location: studioLockerLocation });
                    setStudioLockerNo("");
                    setStudioLockerLocation("");
                    await loadStudioLockerData();
                  }}
                >
                  락커 생성
                </button>
                <select value={studioAssignLockerId} onChange={(e) => setStudioAssignLockerId(e.target.value)}>
                  <option value="">배정 락커 선택</option>
                  {studioLockers.map((locker) => (
                    <option key={locker.id} value={locker.id}>{locker.lockerNo} ({locker.status})</option>
                  ))}
                </select>
                <input type="date" value={studioAssignEndDate} onChange={(e) => setStudioAssignEndDate(e.target.value)} />
                <button
                  type="button"
                  className="ghost-button small-ghost"
                  disabled={!studioSelectedUserId || !studioAssignLockerId}
                  onClick={async () => {
                    await assignStudioLocker({
                      lockerId: studioAssignLockerId,
                      userId: studioSelectedUserId,
                      startDate: new Date().toISOString().slice(0, 10),
                      endDate: studioAssignEndDate || null,
                    });
                    setStudioAssignLockerId("");
                    setStudioAssignEndDate("");
                    await loadStudioLockerData();
                  }}
                >
                  락커 배정
                </button>
                <div className="admin-attendee-list">
                  {studioLockers.length ? (
                    studioLockers.map((locker) => (
                      <div key={locker.id} className="admin-attendee-row">
                        <span>{locker.lockerNo}</span>
                        <span>{locker.location || "-"} · {locker.status}</span>
                        <button
                          type="button"
                          className="ghost-button small-ghost"
                          disabled={studioBusy || locker.status === "occupied"}
                          onClick={async () => {
                            await updateStudioLockerStatus(locker.id, locker.status === "maintenance" ? "available" : "maintenance");
                            await loadStudioLockerData();
                          }}
                        >
                          {locker.status === "maintenance" ? "사용 가능" : "점검"}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="admin-empty-copy">등록된 락커가 없습니다.</p>
                  )}
                </div>
                <div className="admin-attendee-list">
                  {studioLockerAssignments.length ? (
                    studioLockerAssignments.map((assignment) => (
                      <div key={assignment.id} className="admin-attendee-row">
                        <span>{assignment.lockerNo}</span>
                        <span>{assignment.userPhone ? `${assignment.userName || assignment.userId} · ${assignment.userPhone}` : assignment.userName || assignment.userId}</span>
                        <span>{assignment.endDate ? `만료 ${String(assignment.endDate).slice(0, 10)}` : "무기한"}</span>
                        <button
                          type="button"
                          className="ghost-button small-ghost"
                          disabled={studioBusy}
                          onClick={async () => {
                            await endStudioLockerAssignment(assignment.id);
                            await loadStudioLockerData();
                          }}
                        >
                          종료
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="admin-empty-copy">현재 배정된 락커가 없습니다.</p>
                  )}
                </div>
              </article>

              <article>
                <h3>알림 발송</h3>
                <input type="text" placeholder="알림 제목" value={studioNotificationTitle} onChange={(e) => setStudioNotificationTitle(e.target.value)} />
                <input type="text" placeholder="알림 내용" value={studioNotificationMessage} onChange={(e) => setStudioNotificationMessage(e.target.value)} />
                <button
                  type="button"
                  className="ghost-button small-ghost"
                  disabled={!studioSelectedUserId || !studioNotificationTitle.trim() || !studioNotificationMessage.trim()}
                  onClick={async () => {
                    await createStudioNotification({
                      userId: studioSelectedUserId,
                      type: "manual",
                      title: studioNotificationTitle,
                      message: studioNotificationMessage,
                      status: "sent",
                    });
                    setStudioNotificationTitle("");
                    setStudioNotificationMessage("");
                    await refreshStudioUserData(studioSelectedUserId);
                  }}
                >
                  알림 전송
                </button>
                {studioUserNotifications.slice(0, 3).map((n) => (
                  <p key={n.id}>{n.title}</p>
                ))}
              </article>

              <article>
                <h3>운영 설정</h3>
                <button
                  type="button"
                  className="ghost-button small-ghost"
                  onClick={async () => {
                    const instructorName = window.prompt("강사명");
                    const weekday = Number(window.prompt("요일(0=일,1=월...6=토)", "1") || 1);
                    const startTime = window.prompt("시작 시간(HH:mm:ss)", "09:00:00");
                    const endTime = window.prompt("종료 시간(HH:mm:ss)", "18:00:00");
                    if (!instructorName || !startTime || !endTime) return;
                    const next = [...studioInstructorHours, { instructorName, weekday, startTime, endTime, isOff: 0 }];
                    await saveAdminInstructorHours(next);
                    setStudioInstructorHours(next);
                    setStudioMessage({ type: "success", text: "강사 근무시간 저장 완료" });
                  }}
                >
                  강사 근무시간 추가
                </button>
                <button
                  type="button"
                  className="ghost-button small-ghost"
                  onClick={async () => {
                    const roleCode = window.prompt("역할 코드(owner/manager/instructor)", "manager");
                    const permissionCode = window.prompt(
                      "권한 코드",
                      "class.read"
                    );
                    const isAllowed = window.confirm("이 권한을 허용할까요?");
                    if (!roleCode || !permissionCode) return;
                    const normalizedRole = roleCode.trim().toLowerCase();
                    const normalizedPermission = permissionCode.trim();
                    const next = [
                      ...studioRolePermissions.filter(
                        (item) => !(item.roleCode === normalizedRole && item.permissionCode === normalizedPermission)
                      ),
                      { roleCode: normalizedRole, permissionCode: normalizedPermission, isAllowed: isAllowed ? 1 : 0 },
                    ];
                    await saveAdminRolePermissions(next);
                    setStudioRolePermissions(next);
                    setStudioMessage({ type: "success", text: "역할 권한 저장 완료" });
                  }}
                >
                  역할 권한 추가
                </button>
                <p className="admin-empty-copy">
                  권한 코드: class.read/write, member.read/write, pass.write, settings.read/write, checkin.read/write, locker.read/write, communication.read/write
                </p>
                <p>강사시간 {studioInstructorHours.length}건 · 권한 {studioRolePermissions.length}건</p>
              </article>
            </aside>
          </div>
        </section>

        <section className="admin-dashboard-grid">
          <section className="dashboard-card admin-members-panel">
            <div className="admin-members-toolbar">
              <div className="admin-member-tabs">
                {[
                  { value: "all", label: "전체", count: memberSegmentCounts.all },
                  { value: "education", label: "교육회원", count: memberSegmentCounts.education },
                  { value: "studio", label: "스튜디오회원", count: memberSegmentCounts.studio },
                  { value: "both", label: "통합이용", count: memberSegmentCounts.both },
                  { value: "expired", label: "수강권 만료", count: memberSegmentCounts.expired },
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
                <select
                  className="admin-range-select"
                  value={learningRange}
                  onChange={(event) => {
                    setLearningRange(event.target.value);
                    setOpenLearningUserId("");
                  }}
                >
                  {LEARNING_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                  filteredUsers.map((user) => {
                    const purchases = Array.isArray(user.purchases) ? user.purchases : [];
                    const learningCacheKey = buildLearningCacheKey(user.id, learningRange);
                    const learningRows = Array.isArray(learningByUserId[learningCacheKey])
                      ? learningByUserId[learningCacheKey]
                      : [];
                    const isLearningOpen = openLearningUserId === user.id;
                    const isPurchaseOpen = openPurchaseUserId === user.id;

                    const isWithdrawn = user.accountStatus === "withdrawn";
                    const studioSummary = getStudioSummaryForUser(user);
                    const memberSegment = getMemberSegment(user);
                    const segmentLabel =
                      memberSegment === "both"
                        ? "통합이용"
                        : memberSegment === "studio"
                          ? "스튜디오회원"
                        : memberSegment === "expired"
                          ? "수강권 만료"
                          : memberSegment === "education"
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
                          <span className={`admin-studio-status-chip ${studioSummary?.passStatus || "none"}`}>
                            {getStudioPassStatusLabel(studioSummary)}
                          </span>
                        </div>

                        {studioSummary?.hasStudioPass ? (
                          <p className="admin-studio-pass-line">
                            {studioSummary.latestPassName || "스튜디오 수강권"} · 잔여 {Number(studioSummary.remainingCount || 0)}회 · 만료{" "}
                            {getStudioPassDateLabel(studioSummary.nearestExpiresAt)}
                            {studioSummary.daysUntilExpiry !== null && studioSummary.daysUntilExpiry >= 0
                              ? ` · D-${studioSummary.daysUntilExpiry}`
                              : ""}
                          </p>
                        ) : null}

                        <div className="admin-member-actions-row">
                          <button
                            type="button"
                            className="ghost-button small-ghost"
                            onClick={async () => {
                              setStudioSelectedUserId(user.id);
                              await refreshStudioUserData(user.id);
                            }}
                          >
                            스튜디오 정보
                          </button>
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
              </div>
            ) : null}
          </section>

          <section className="dashboard-card admin-lecture-report-panel">
            <div className="admin-members-toolbar">
              <div className="admin-member-tabs">
                <button
                  type="button"
                  className={`admin-member-tab${lectureTab === "active" ? " active" : ""}`}
                  onClick={() => setLectureTab("active")}
                >
                  활성 강의 ({lectureReports.filter((l) => !l.isHidden).length})
                </button>
                <button
                  type="button"
                  className={`admin-member-tab${lectureTab === "hidden" ? " active" : ""}`}
                  onClick={() => setLectureTab("hidden")}
                >
                  숨김 강의 ({lectureReports.filter((l) => l.isHidden).length})
                </button>
              </div>
              <span className="admin-range-caption">
                기준: {LEARNING_RANGE_OPTIONS.find((item) => item.value === learningRange)?.label || "전체"}
              </span>
            </div>

            {lectureReportsLoading ? <p className="admin-empty-copy">강의 리포트를 불러오는 중입니다...</p> : null}
            {!lectureReportsLoading && lectureReportsError ? (
              <p className="admin-empty-copy error">{lectureReportsError}</p>
            ) : null}

            {!lectureReportsLoading && !lectureReportsError ? (
              (() => {
                const filteredLectures = lectureReports.filter((l) =>
                  lectureTab === "hidden" ? l.isHidden : !l.isHidden
                );
                return filteredLectures.length ? (
                <div className="admin-lecture-report-list">
                  {filteredLectures.map((lecture) => (
                    <details key={lecture.videoId} className="admin-lecture-report-card">
                      <summary>
                        <strong>{lecture.title}</strong>
                        <span>
                          완강률 {lecture.completionRate}% · 수강자 {lecture.learnerCount}명 · 마지막 수강 {formatDateTime(
                            lecture.lastLearningAt
                          )}
                        </span>
                      </summary>

                      <div className="admin-lecture-report-meta">
                        <span>강사 {lecture.instructor}</span>
                        <span>카테고리 {lecture.category}</span>
                        <span>
                          완강 {lecture.completedLearnerCount}/{lecture.learnerCount}
                        </span>
                        <span>차시 수 {lecture.chapterCount}</span>
                      </div>

                      {Array.isArray(lecture.learners) && lecture.learners.length ? (
                        <div className="admin-lecture-learner-list">
                          {lecture.learners.map((learner) => (
                            <article
                              key={`${lecture.videoId}-${learner.userId}`}
                              className="admin-lecture-learner-row"
                            >
                              <div>
                                <strong>
                                  {learner.name} ({learner.loginId})
                                </strong>
                                <p>
                                  {formatUserGradeLabel(learner.userGrade)} · {learner.email}
                                </p>
                              </div>
                              <div className="admin-lecture-learner-metrics">
                                <span>{learner.completed ? "완강" : "수강중"}</span>
                                <span>진도 {learner.progressPercent}%</span>
                                <span>
                                  차시 {learner.completedChapterCount}/{learner.chapterCount}
                                </span>
                                <span>마지막 수강 {formatDateTime(learner.lastWatchedAt)}</span>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="admin-empty-copy">선택한 기간에 수강 이력이 없습니다.</p>
                      )}
                    </details>
                  ))}
                </div>
              ) : (
                <p className="admin-empty-copy">
                  {lectureTab === "hidden" ? "숨김 처리된 강의가 없습니다." : "선택한 기간에 수강 리포트 데이터가 없습니다."}
                </p>
              );
              })()
            ) : null}
          </section>
        </section>
      </main>
    </div>
  );
}

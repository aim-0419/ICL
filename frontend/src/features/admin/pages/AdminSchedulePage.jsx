/**
 * [관리자 수업 일정 관리 페이지]
 *
 * 관리자가 수업 일정을 등록·수정·삭제하고 예약 현황을 확인하는 화면입니다.
 * 라이브러리 없이 직접 구현한 캘린더 컴포넌트로 세 가지 뷰를 제공합니다:
 *
 *  - 월간 뷰: 42칸 그리드(6주×7일), 각 날짜에 수업 개수 표시
 *  - 주간 뷰: 이번 주 7일, 요일별 수업 목록
 *  - 일간 뷰: 오늘 하루 수업 전체 목록
 *
 * ─ 주요 기능 ──────────────────────────────────────────────────────
 *  · 수업 등록: 제목·강사·날짜·시간·정원·반복 주수 설정 가능
 *  · 반복 수업: repeatWeeks 파라미터로 최대 24주 반복 등록
 *  · 예약자 확인: 수업 클릭 시 예약자 이름·수강권 목록 표시
 *  · 예약 정책: 예약 마감 시간, 취소 마감 시간, 당일 변경 허용 여부 설정
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout.jsx";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { apiRequest } from "../../../shared/api/client.js";
import {
  addAdminHoliday,
  bookAdminStudioClassForMember,
  cancelAdminStudioClass,
  createAdminStudioClass,
  deleteAdminHoliday,
  deleteAdminStudioClass,
  getAdminStudioSettings,
  listAdminInstructorHours,
  listAdminStudioClassBookings,
  listAdminStudioClasses,
  saveAdminBookingPolicy,
  updateAdminStudioClass,
} from "../../studio/api/studioApi.js";
import { DEFAULT_STUDIO_BRANCH_ID, STUDIO_BRANCHES, getStudioBranchName } from "../../studio/constants/studioBranches.js";
import "./AdminSchedulePage.css";

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const CATEGORY_TABS = [
  { value: "all", label: "전체" },
  { value: "private", label: "개인수업" },
  { value: "group", label: "그룹수업" },
  { value: "consulting", label: "상담" },
  { value: "etc", label: "기타일정" },
];

const VIEW_TABS = [
  { value: "month", label: "월간" },
  { value: "week", label: "주간" },
  { value: "day", label: "일간" },
];

const EMPTY_CLASS_FORM = {
  branchId: DEFAULT_STUDIO_BRANCH_ID,
  title: "",
  instructorName: "",
  roomName: "",
  date: "",
  time: "09:00",
  durationMin: "50",
  capacity: "6",
  repeatWeeks: "1",
};

// ─── 캘린더 계산 헬퍼 함수들 ──────────────────────────────────────────────────

/** Date를 "YYYY-MM-DD" 문자열로 변환합니다. 캘린더 날짜를 Map 키로 쓸 때 사용합니다. */
function makeDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * 월간 캘린더를 위한 42개(6주×7일) 셀 배열을 반환합니다.
 * 이전 달·다음 달의 날짜도 포함해서 항상 42칸을 채웁니다.
 * outside: true 인 셀은 현재 달이 아닌 날짜입니다.
 */
function getMonthCells(year, monthIndex) {
  const firstDate = new Date(year, monthIndex, 1);
  const lastDate = new Date(year, monthIndex + 1, 0);
  const firstDayIndex = (firstDate.getDay() + 6) % 7;
  const prevMonthLastDate = new Date(year, monthIndex, 0).getDate();
  const cells = [];

  for (let i = firstDayIndex - 1; i >= 0; i -= 1) {
    const day = prevMonthLastDate - i;
    const date = new Date(year, monthIndex - 1, day);
    cells.push({ date, day, key: makeDateKey(date), outside: true });
  }
  for (let day = 1; day <= lastDate.getDate(); day += 1) {
    const date = new Date(year, monthIndex, day);
    cells.push({ date, day, key: makeDateKey(date), outside: false });
  }
  while (cells.length % 7 !== 0) {
    const nextDay = cells.length - firstDayIndex - lastDate.getDate() + 1;
    const date = new Date(year, monthIndex + 1, nextDay);
    cells.push({ date, day: nextDay, key: makeDateKey(date), outside: true });
  }
  return cells;
}

/** Date를 MySQL에 저장할 수 있는 "YYYY-MM-DD HH:MM:SS" 형식으로 변환합니다. */
function toSqlDateTime(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

/** Date에서 "HH:MM" 형식의 시각만 추출합니다. 수업 시간 표시에 사용합니다. */
function toHm(date) {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Date를 input[type="date"] 에 넣을 수 있는 "YYYY-MM-DD" 문자열로 변환합니다. */
function toDateInputValue(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** DB의 휴일 날짜를 관리자 화면에서 읽기 쉬운 형식으로 표시합니다. */
function formatHolidayDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-");
  if (!year || !month || !day) return String(value || "-");
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

/**
 * 주간 캘린더를 위한 7일 셀 배열을 반환합니다.
 * 월요일부터 시작해서 해당 주의 월~일 7일치를 만듭니다.
 */
function getWeekCells(date) {
  const base = new Date(date);
  const dayIndex = (base.getDay() + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - dayIndex);
  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(monday);
    next.setDate(monday.getDate() + index);
    return {
      date: next,
      day: next.getDate(),
      key: makeDateKey(next),
      outside: next.getMonth() !== date.getMonth(),
    };
  });
}

function toClassForm(item) {
  const start = new Date(item.startAt);
  const end = new Date(item.endAt || start.getTime() + 50 * 60000);
  const durationMin = Math.max(10, Math.round((end.getTime() - start.getTime()) / 60000));
  return {
    title: item.title || "",
    instructorName: item.instructorName || "",
    roomName: item.roomName || "",
    date: toDateInputValue(start),
    time: toHm(start),
    durationMin: String(durationMin || 50),
    capacity: String(item.capacity || 6),
    repeatWeeks: "1",
    branchId: item.branchId || DEFAULT_STUDIO_BRANCH_ID,
  };
}

function inferCategory(item) {
  if (item?.classType && ["private", "group", "consulting", "etc"].includes(item.classType)) return item.classType;
  // 기존 데이터(class_type 미설정) 호환용 키워드 추론
  const title = String(item?.title || "");
  if (title.includes("개인") || title.includes("듀엣")) return "private";
  if (title.includes("상담")) return "consulting";
  if (title.includes("휴무") || title.includes("점검")) return "etc";
  return "group";
}

export function AdminSchedulePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const store = useAppStore();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";
  const today = useMemo(() => new Date(), []);

  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [category, setCategory] = useState("all");
  const [selectedBranchId, setSelectedBranchId] = useState(DEFAULT_STUDIO_BRANCH_ID);
  const [viewMode, setViewMode] = useState("month");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedBookings, setSelectedBookings] = useState([]);
  const [classModalMode, setClassModalMode] = useState("");
  const [classForm, setClassForm] = useState(() => ({
    ...EMPTY_CLASS_FORM,
    date: toDateInputValue(today),
  }));
  const [busy, setBusy] = useState(false);
  const [settingsModal, setSettingsModal] = useState("");
  const [holidayDraft, setHolidayDraft] = useState({
    holidayDate: toDateInputValue(today),
    title: "휴무일",
    note: "",
  });
  const [holidays, setHolidays] = useState([]);
  const [holidayLoading, setHolidayLoading] = useState(false);
  const [holidayError, setHolidayError] = useState("");
  const [policyDraft, setPolicyDraft] = useState({
    reserveLimitHours: "24",
    cancelLimitHours: "6",
    sameDayChangeAllowed: false,
  });

  // 날짜 더보기 팝업 상태 { date, items, anchorRect }
  const [dayDetailPopup, setDayDetailPopup] = useState(null);

  // 강사 목록 및 강사명 자동완성 상태
  const [instructorNames, setInstructorNames] = useState([]); // 등록된 강사 이름 목록
  const [instructorSuggestions, setInstructorSuggestions] = useState([]); // 현재 표시 중인 자동완성 목록
  const [showSuggestions, setShowSuggestions] = useState(false);

  // 수업 유형 선택 및 회원 검색 상태
  const [classType, setClassType] = useState("group"); // "private" | "group" | "consulting" | "etc"
  const [modalStep, setModalStep] = useState("type"); // "type"=유형 선택 | "form"=양식 입력
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSuggestions, setMemberSuggestions] = useState([]);
  const [showMemberSuggestions, setShowMemberSuggestions] = useState(false);
  const [memberList, setMemberList] = useState([]); // 전체 회원 목록 (프라이빗 수업 회원 검색용)
  const bookingMemberId = useMemo(
    () => new URLSearchParams(location.search).get("memberId") || "",
    [location.search]
  );
  const bookingMember = useMemo(
    () => memberList.find((member) => String(member.id) === String(bookingMemberId)) || null,
    [memberList, bookingMemberId]
  );

  // 호버 툴팁 관련 상태
  const [tooltip, setTooltip] = useState(null); // { classItem, bookings, x, y }
  const bookingsCacheRef = useRef({}); // 클래스ID별 예약자 캐시
  const hoverTimerRef = useRef(null);

  const year = currentMonth.getFullYear();
  const monthIndex = currentMonth.getMonth();
  const monthCells = useMemo(() => getMonthCells(year, monthIndex), [year, monthIndex]);
  const weekCells = useMemo(() => getWeekCells(currentMonth), [currentMonth]);
  const dayCells = useMemo(() => [{ date: today, day: today.getDate(), key: makeDateKey(today), outside: false }], [today]);

  async function loadClasses() {
    const from = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01 00:00:00`;
    const last = new Date(year, monthIndex + 1, 0).getDate();
    const to = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(last).padStart(2, "0")} 23:59:59`;
    const rows = await listAdminStudioClasses({ from, to, status: "active", branchId: selectedBranchId });
    setClasses(rows);
  }

  useEffect(() => {
    loadClasses().catch(() => {});
  }, [year, monthIndex, selectedBranchId]);

  useEffect(() => {
    setSelectedClass(null);
    setSelectedBookings([]);
    setDayDetailPopup(null);
  }, [selectedBranchId]);

  // 페이지 첫 진입 시 강사 목록과 회원 목록을 불러옵니다
  useEffect(() => {
    listAdminInstructorHours().then((rows) => {
      const names = [...new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.instructorName || "").trim()).filter(Boolean))];
      if (currentUserName && currentUserName !== "관리자" && !names.includes(currentUserName)) {
        names.unshift(currentUserName);
      }
      setInstructorNames(names);
    }).catch(() => {});

    // 프라이빗 수업 회원 검색을 위한 회원 목록
    apiRequest("/admin/dashboard/users").then((result) => {
      setMemberList(Array.isArray(result?.users) ? result.users : []);
    }).catch(() => {});
  }, [currentUserName]);

  const filteredScheduleItems = useMemo(() => {
    const normalizedKeyword = searchKeyword.trim().toLowerCase();
    return classes.filter((item) => {
      const itemCategory = inferCategory(item);
      const matchesCategory = category === "all" || itemCategory === category;
      const matchesKeyword =
        !normalizedKeyword ||
        `${item.title || ""} ${item.instructorName || ""} ${item.roomName || ""} ${toHm(item.startAt)}`.toLowerCase().includes(normalizedKeyword);
      return matchesCategory && matchesKeyword;
    });
  }, [category, classes, searchKeyword]);

  const scheduleByDate = useMemo(() => {
    const map = new Map();
    filteredScheduleItems.forEach((item) => {
      const key = makeDateKey(new Date(item.startAt));
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    });
    for (const [key, list] of map.entries()) {
      map.set(
        key,
        [...list].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      );
    }
    return map;
  }, [filteredScheduleItems]);

  const currentViewCells = viewMode === "month" ? monthCells : viewMode === "week" ? weekCells : dayCells;

  function moveMonth(amount) {
    setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  function openCreateClassModal(date = currentMonth) {
    setClassForm({
      ...EMPTY_CLASS_FORM,
      branchId: selectedBranchId,
      date: toDateInputValue(date),
      instructorName: currentUserName !== "관리자" ? currentUserName : "",
    });
    setShowSuggestions(false);
    setModalStep("type"); // 항상 유형 선택 화면부터 시작
    setClassType("group");
    setMemberSearchQuery("");
    setMemberSuggestions([]);
    setClassModalMode("create");
  }

  // 유형 선택 후 폼 화면으로 전환
  function selectClassType(type) {
    setClassType(type);
    setModalStep("form");
    // 유형에 따른 정원 기본값 설정
    const defaultCapacity = type === "private" ? "1" : type === "group" ? "6" : "1";
    setClassForm((prev) => ({ ...prev, capacity: defaultCapacity }));
  }

  // 회원 이름 검색 자동완성
  function handleMemberSearch(value) {
    setMemberSearchQuery(value);
    const keyword = value.trim().toLowerCase();
    if (!keyword) {
      setMemberSuggestions([]);
      setShowMemberSuggestions(false);
      return;
    }
    const matched = memberList
      .filter((u) => {
        const name = String(u.name || "").toLowerCase();
        const loginId = String(u.loginId || "").toLowerCase();
        return name.includes(keyword) || loginId.includes(keyword);
      })
      .slice(0, 8);
    setMemberSuggestions(matched);
    setShowMemberSuggestions(matched.length > 0);
  }

  function selectMember(member) {
    const memberName = member.name || member.loginId || "";
    setMemberSearchQuery(memberName);
    setClassForm((prev) => ({
      ...prev,
      // 프라이빗: 수업명 자동 제안, 상담: title을 회원명으로 사용
      title: prev.title || (classType === "consulting" ? `${memberName} 상담` : `${memberName} 개인 레슨`),
    }));
    setShowMemberSuggestions(false);
  }

  function openEditClassModal() {
    if (!selectedClass) return;
    setClassForm(toClassForm(selectedClass));
    setModalStep("form"); // 수정은 바로 폼으로
    setClassModalMode("edit");
  }

  async function submitClassForm(event) {
    event.preventDefault();
    const title = classForm.title.trim();
    if (!title || !classForm.date || !classForm.time) return;
    setBusy(true);
    try {
      const durationMin = Math.max(10, Number(classForm.durationMin || 50));
      const start = new Date(`${classForm.date}T${classForm.time}:00`);
      const end = new Date(start.getTime() + durationMin * 60000);
      const payload = {
        branchId: classForm.branchId || selectedBranchId,
        classType,
        title,
        instructorName: classForm.instructorName.trim(),
        roomName: classForm.roomName.trim(),
        startAt: toSqlDateTime(start),
        endAt: toSqlDateTime(end),
        capacity: Math.max(1, Number(classForm.capacity || 1)),
      };
      if (classModalMode === "edit" && selectedClass?.id) {
        await updateAdminStudioClass(selectedClass.id, payload);
        setSelectedClass({ ...selectedClass, ...payload });
      } else {
        await createAdminStudioClass({
          ...payload,
          repeatWeeks: Math.max(1, Number(classForm.repeatWeeks || 1)),
        });
      }
      setClassModalMode("");
      await loadClasses();
    } finally {
      setBusy(false);
    }
  }

  // 강사명 입력 시 일치하는 이름 목록을 필터링해서 드롭다운에 표시합니다
  function handleInstructorNameChange(value) {
    setClassForm((prev) => ({ ...prev, instructorName: value }));
    const keyword = value.trim().toLowerCase();
    if (!keyword) {
      // 빈 값이면 전체 목록 표시
      setInstructorSuggestions(instructorNames);
      setShowSuggestions(instructorNames.length > 0);
    } else {
      const matched = instructorNames.filter((name) => name.toLowerCase().includes(keyword));
      setInstructorSuggestions(matched);
      setShowSuggestions(matched.length > 0);
    }
  }

  // 자동완성 목록에서 이름을 선택하면 입력란에 반영하고 드롭다운을 닫습니다
  function selectInstructorSuggestion(name) {
    setClassForm((prev) => ({ ...prev, instructorName: name }));
    setShowSuggestions(false);
  }

  async function onSelectClass(item) {
    setSelectedClass(item);
    const rows = await listAdminStudioClassBookings(item.id);
    setSelectedBookings(Array.isArray(rows) ? rows : []);
  }

  async function onBookSelectedMember() {
    if (!selectedClass?.id || !bookingMemberId) return;
    setBusy(true);
    try {
      await bookAdminStudioClassForMember(selectedClass.id, bookingMemberId);
      const rows = await listAdminStudioClassBookings(selectedClass.id);
      setSelectedBookings(Array.isArray(rows) ? rows : []);
      await loadClasses();
    } finally {
      setBusy(false);
    }
  }

  // 수업 칩에 마우스를 올리면 툴팁을 표시합니다
  const onClassMouseEnter = useCallback(async (event, item) => {
    clearTimeout(hoverTimerRef.current);
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.right + 8;
    const y = rect.top;

    // 캐시에 없으면 API 호출
    if (!bookingsCacheRef.current[item.id]) {
      const rows = await listAdminStudioClassBookings(item.id).catch(() => []);
      bookingsCacheRef.current[item.id] = Array.isArray(rows) ? rows : [];
    }

    setTooltip({ classItem: item, bookings: bookingsCacheRef.current[item.id], x, y });
  }, []);

  // 마우스가 벗어나면 툴팁 숨김 (약간의 딜레이로 툴팁 위로 이동 가능하게)
  const onClassMouseLeave = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => setTooltip(null), 150);
  }, []);

  const onTooltipMouseEnter = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
  }, []);

  const onTooltipMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  async function onEditSelected() {
    openEditClassModal();
  }

  async function onCancelSelected() {
    if (!selectedClass) return;
    if (!window.confirm("이 수업을 폐강 처리할까요?")) return;
    setBusy(true);
    try {
      await cancelAdminStudioClass(selectedClass.id);
      setSelectedClass(null);
      setSelectedBookings([]);
      await loadClasses();
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteSelected() {
    if (!selectedClass) return;
    if (!window.confirm("이 수업을 삭제 처리할까요? 예약자는 취소 처리됩니다.")) return;
    setBusy(true);
    try {
      await deleteAdminStudioClass(selectedClass.id);
      setSelectedClass(null);
      setSelectedBookings([]);
      await loadClasses();
    } finally {
      setBusy(false);
    }
  }

  async function onHolidaySettings() {
    setHolidayDraft((previous) => ({
      ...previous,
      holidayDate: previous.holidayDate || toDateInputValue(today),
    }));
    setSettingsModal("holiday");
    await loadHolidays();
  }

  async function onPolicySettings() {
    setSettingsModal("policy");
  }

  async function loadHolidays() {
    setHolidayLoading(true);
    setHolidayError("");
    try {
      const settings = await getAdminStudioSettings();
      setHolidays(Array.isArray(settings?.holidays) ? settings.holidays : []);
    } catch (error) {
      setHolidays([]);
      setHolidayError(error?.message || "등록된 휴일을 불러오지 못했습니다.");
    } finally {
      setHolidayLoading(false);
    }
  }

  async function submitHolidaySettings(event) {
    event.preventDefault();
    if (!holidayDraft.holidayDate || !holidayDraft.title.trim()) return;
    setBusy(true);
    setHolidayError("");
    try {
      await addAdminHoliday({
        holidayDate: holidayDraft.holidayDate,
        title: holidayDraft.title.trim(),
        note: holidayDraft.note.trim(),
      });
      setHolidayDraft((previous) => ({
        ...previous,
        title: "휴무일",
        note: "",
      }));
      await loadHolidays();
    } catch (error) {
      setHolidayError(error?.message || "휴일을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteHoliday(holiday) {
    if (!holiday?.id) return;
    const holidayLabel = `${formatHolidayDate(holiday.holidayDate)} ${holiday.title || "휴무일"}`;
    if (!window.confirm(`${holidayLabel} 설정을 해제할까요?`)) return;

    setBusy(true);
    setHolidayError("");
    try {
      await deleteAdminHoliday(holiday.id);
      await loadHolidays();
    } catch (error) {
      setHolidayError(error?.message || "휴일 설정을 해제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPolicySettings(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const reserveLimitHours = Number(policyDraft.reserveLimitHours || 24);
      const cancelLimitHours = Number(policyDraft.cancelLimitHours || 6);
    await saveAdminBookingPolicy({
      reserveLimitHours: Math.max(0, reserveLimitHours),
      cancelLimitHours: Math.max(0, cancelLimitHours),
        sameDayChangeAllowed: Boolean(policyDraft.sameDayChangeAllowed),
    });
      setSettingsModal("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout
      appClass="admin-schedule-app"
      userName={currentUserName}
      searchValue={searchKeyword}
      onSearchChange={(e) => setSearchKeyword(e.target.value)}
      onAddMember={() => navigate("/admin/member-list")}
      showNotification={true}
    >
      <main className="admin-schedule-main">
        <section className="admin-schedule-toolbar">
          <div className="admin-schedule-month-title">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="previous month">‹</button>
            <h1>{year}년 {monthIndex + 1}월</h1>
            <button type="button" onClick={() => moveMonth(1)} aria-label="next month">›</button>
            <button type="button" className="admin-schedule-outline-button" onClick={onHolidaySettings}>
              휴일설정
            </button>
          </div>
          <button type="button" className="admin-schedule-calendar-setting" onClick={onPolicySettings}>
            달력 설정
          </button>
        </section>

        <section className="admin-schedule-filterbar">
          <div className="admin-schedule-category-tabs" role="tablist" aria-label="지점 선택">
            {STUDIO_BRANCHES.map((branch) => (
              <button
                key={branch.id}
                type="button"
                className={selectedBranchId === branch.id ? "active" : ""}
                onClick={() => setSelectedBranchId(branch.id)}
              >
                {branch.name}
              </button>
            ))}
          </div>
          <div className="admin-schedule-category-tabs" role="tablist" aria-label="category tabs">
            {CATEGORY_TABS.map((tab) => (
              <button key={tab.value} type="button" className={category === tab.value ? "active" : ""} onClick={() => setCategory(tab.value)}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="admin-schedule-view-controls">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="previous">‹</button>
            <button type="button" onClick={() => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>오늘</button>
            <button type="button" onClick={() => moveMonth(1)} aria-label="next">›</button>
            <button type="button" className="admin-schedule-instructor-button" onClick={() => openCreateClassModal(today)} disabled={busy}>수업 등록</button>
            <button type="button" className="admin-schedule-instructor-button" onClick={onEditSelected} disabled={busy || !selectedClass}>수업 수정</button>
            <button type="button" className="admin-schedule-instructor-button" onClick={onCancelSelected} disabled={busy || !selectedClass}>폐강 처리</button>
            <button type="button" className="admin-schedule-instructor-button" onClick={onDeleteSelected} disabled={busy || !selectedClass}>삭제</button>
            <div className="admin-schedule-view-tabs" role="tablist" aria-label="calendar view tabs">
              {VIEW_TABS.map((tab) => (
                <button key={tab.value} type="button" className={viewMode === tab.value ? "active" : ""} onClick={() => setViewMode(tab.value)}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {viewMode === "month" ? (
          <section className="admin-month-calendar" aria-label="monthly schedule">
            <div className="admin-month-weekdays">
              {WEEKDAY_LABELS.map((label) => <strong key={label}>{label}</strong>)}
            </div>
            <div className="admin-month-grid">
              {monthCells.map((cell) => {
                const dayItems = scheduleByDate.get(cell.key) || [];
                const MAX_VISIBLE = dayItems.length > 4 ? 3 : 4;
                const visibleItems = dayItems.slice(0, MAX_VISIBLE);
                const hiddenCount = Math.max(0, dayItems.length - visibleItems.length);
                const isToday =
                  cell.date.getFullYear() === today.getFullYear() &&
                  cell.date.getMonth() === today.getMonth() &&
                  cell.date.getDate() === today.getDate();
                return (
                  <article
                    key={cell.key}
                    className={`admin-month-cell${cell.outside ? " outside" : ""}${isToday ? " today" : ""}`}
                    onClick={() => openCreateClassModal(cell.date)}
                  >
                    <div className="admin-month-day-number">
                      {isToday ? <span /> : null}
                      <strong>{cell.day}</strong>
                      <span className="admin-month-cell-add">+</span>
                    </div>
                    <div className="admin-month-events" onClick={(e) => e.stopPropagation()}>
                      {visibleItems.map((item) => {
                        const isSelected = selectedClass?.id === item.id;
                        const isHovered = tooltip?.classItem?.id === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`admin-month-event${isSelected ? " is-selected" : ""}${isHovered ? " is-hovered" : ""}`}
                            style={{ "--event-color": isSelected || isHovered ? "#e85d5d" : "#21d1ad" }}
                            onClick={() => onSelectClass(item)}
                            onMouseEnter={(e) => onClassMouseEnter(e, item)}
                            onMouseLeave={onClassMouseLeave}
                          >
                            <span>{toHm(item.startAt)} {item.title}</span>
                            <em>{item.reservedCount}/{item.capacity}</em>
                          </button>
                        );
                      })}
                      {hiddenCount > 0 ? (
                        <button
                          type="button"
                          className="admin-month-more"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setDayDetailPopup({ date: cell.date, items: dayItems, anchorRect: rect });
                          }}
                        >
                          {hiddenCount}개 더보기
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="admin-schedule-list-view" aria-label="schedule list">
            {currentViewCells.map((cell) => {
              const dayItems = scheduleByDate.get(cell.key) || [];
              const weekdayLabel = WEEKDAY_LABELS[(cell.date.getDay() + 6) % 7];
              return (
                <article key={cell.key} className="admin-schedule-day-column">
                  <header>
                    <strong>{cell.day}일 {weekdayLabel}</strong>
                    <button type="button" onClick={() => openCreateClassModal(cell.date)} disabled={busy}>+</button>
                  </header>
                  <div className="admin-schedule-day-events">
                    {dayItems.length ? (
                      dayItems.map((item) => {
                        const isSelected = selectedClass?.id === item.id;
                        const isHovered = tooltip?.classItem?.id === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`admin-schedule-list-event${isSelected ? " is-selected" : ""}${isHovered ? " is-hovered" : ""}`}
                            onClick={() => onSelectClass(item)}
                            onMouseEnter={(e) => onClassMouseEnter(e, item)}
                            onMouseLeave={onClassMouseLeave}
                          >
                            <time>{toHm(item.startAt)}</time>
                            <span>{item.title}</span>
                            <em>{item.instructorName || "강사 미정"} · {item.reservedCount}/{item.capacity}</em>
                          </button>
                        );
                      })
                    ) : (
                      <p>등록된 수업이 없습니다.</p>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {selectedClass ? (
          <section className="admin-card" style={{ marginTop: 16 }}>
            <div className="admin-schedule-booking-head">
              <h2 className="admin-card-title">
                예약자 목록 - {selectedClass.title}
                <small style={{ marginLeft: 8, color: "#7c6b5d", fontSize: 13 }}>{selectedClass.branchName || getStudioBranchName(selectedClass.branchId)}</small>
              </h2>
              {bookingMemberId ? (
                <button type="button" className="admin-schedule-instructor-button" disabled={busy} onClick={onBookSelectedMember}>
                  {bookingMember?.name ? `${bookingMember.name} 예약` : "선택 회원 예약"}
                </button>
              ) : null}
            </div>
            {selectedBookings.length === 0 ? (
              <p className="admin-empty">예약자가 없습니다.</p>
            ) : (
              <div className="admin-product-list">
                {selectedBookings.map((booking) => (
                  <div key={booking.id} className="admin-product-item">
                    <div className="admin-product-info">
                      <strong className="admin-product-name">{booking.userName || booking.userId}</strong>
                      <span className="admin-product-period">
                        {booking.userPhone ? `${booking.userPhone} · ` : ""}
                        {booking.passName || "수강권 미확인"}
                      </span>
                      <span className="admin-product-period">
                        상태: {booking.status === "reserved" ? "확정" : booking.status === "waitlisted" ? "대기" : "취소"}
                        {Number(booking.openArrearsAmount || 0) > 0 ? ` · 미수금 ${Number(booking.openArrearsAmount || 0).toLocaleString()}원` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <button className="admin-schedule-floating-add" type="button" aria-label="수업 등록" onClick={() => openCreateClassModal(today)} disabled={busy}>
          +
        </button>

        {settingsModal ? (
          <div className="admin-schedule-modal-backdrop" role="presentation" onClick={() => setSettingsModal("")}>
            <div className="admin-schedule-modal" onClick={(event) => event.stopPropagation()}>
              {settingsModal === "holiday" ? (
                <form onSubmit={submitHolidaySettings}>
                  <header>
                    <h2>휴일 설정</h2>
                    <button type="button" onClick={() => setSettingsModal("")}>닫기</button>
                  </header>
                  <label>
                    <span>휴일 날짜</span>
                    <input
                      type="date"
                      value={holidayDraft.holidayDate}
                      onChange={(event) => setHolidayDraft((previous) => ({ ...previous, holidayDate: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    <span>휴일명</span>
                    <input
                      value={holidayDraft.title}
                      onChange={(event) => setHolidayDraft((previous) => ({ ...previous, title: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    <span>메모</span>
                    <input
                      value={holidayDraft.note}
                      onChange={(event) => setHolidayDraft((previous) => ({ ...previous, note: event.target.value }))}
                    />
                  </label>
                  <section className="admin-schedule-holiday-list" aria-labelledby="admin-schedule-holiday-list-title">
                    <div className="admin-schedule-holiday-list-head">
                      <h3 id="admin-schedule-holiday-list-title">등록된 휴일</h3>
                      <span>{holidays.length}건</span>
                    </div>
                    {holidayLoading ? (
                      <p className="admin-schedule-holiday-state" aria-live="polite">불러오는 중...</p>
                    ) : holidayError ? (
                      <p className="admin-schedule-holiday-state is-error" role="alert">{holidayError}</p>
                    ) : holidays.length === 0 ? (
                      <p className="admin-schedule-holiday-state">등록된 휴일이 없습니다.</p>
                    ) : (
                      <ul>
                        {holidays.map((holiday) => (
                          <li key={holiday.id}>
                            <div>
                              <strong>{formatHolidayDate(holiday.holidayDate)} · {holiday.title || "휴무일"}</strong>
                              {holiday.note ? <span>{holiday.note}</span> : null}
                            </div>
                            <button
                              type="button"
                              className="admin-schedule-holiday-remove"
                              onClick={() => onDeleteHoliday(holiday)}
                              disabled={busy}
                            >
                              해제
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <footer>
                    <button type="button" onClick={() => setSettingsModal("")}>취소</button>
                    <button type="submit" disabled={busy}>휴일 추가</button>
                  </footer>
                </form>
              ) : (
                <form onSubmit={submitPolicySettings}>
                  <header>
                    <h2>예약 정책 설정</h2>
                    <button type="button" onClick={() => setSettingsModal("")}>닫기</button>
                  </header>
                  <div className="admin-schedule-modal-grid">
                    <label>
                      <span>예약 제한</span>
                      <input
                        type="number"
                        min="0"
                        value={policyDraft.reserveLimitHours}
                        onChange={(event) => setPolicyDraft((previous) => ({ ...previous, reserveLimitHours: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>취소 제한</span>
                      <input
                        type="number"
                        min="0"
                        value={policyDraft.cancelLimitHours}
                        onChange={(event) => setPolicyDraft((previous) => ({ ...previous, cancelLimitHours: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="admin-schedule-checkbox-label">
                    <input
                      type="checkbox"
                      checked={policyDraft.sameDayChangeAllowed}
                      onChange={(event) => setPolicyDraft((previous) => ({ ...previous, sameDayChangeAllowed: event.target.checked }))}
                    />
                    <span>당일 예약/변경 허용</span>
                  </label>
                  <footer>
                    <button type="button" onClick={() => setSettingsModal("")}>취소</button>
                    <button type="submit" disabled={busy}>저장</button>
                  </footer>
                </form>
              )}
            </div>
          </div>
        ) : null}

        {classModalMode ? (
          <div className="admin-schedule-modal-backdrop" role="presentation" onClick={() => setClassModalMode("")}>
            <div className="admin-schedule-modal" onClick={(event) => event.stopPropagation()}>

              {/* ── STEP 1: 수업 유형 선택 ───────────────────────────────── */}
              {modalStep === "type" && classModalMode === "create" ? (
                <>
                  <header>
                    <h2>일정 등록</h2>
                    <button type="button" onClick={() => setClassModalMode("")}>×</button>
                  </header>

                  <div className="admin-class-type-list">
                    {[
                      { type: "private",    label: "프라이빗 수업", desc: "개인/듀엣/트리플 레슨 (예약 필수)" },
                      { type: "group",      label: "그룹 수업",     desc: "고정된 스케줄의 오픈형 수업 (자유 수강형/예약 필수)" },
                      { type: "consulting", label: "상담",          desc: "전화/방문/채팅/기타 상담" },
                      { type: "etc",        label: "기타 일정",     desc: "수업 외 일정" },
                    ].map(({ type, label, desc }) => (
                      <button key={type} type="button" className="admin-class-type-item" onClick={() => selectClassType(type)}>
                        <strong>{label}</strong>
                        <span>{desc}</span>
                      </button>
                    ))}
                  </div>

                  <div className="admin-class-type-tip">
                    <p><strong>수업/클래스란?</strong></p>
                    <p>수업은 말 그대로 하루 한 회차의 수업을 의미하며, 그런 수업들이 모여 이루어진 프로그램을 일컬어 클래스라 칭합니다.</p>
                  </div>
                </>
              ) : (
                /* ── STEP 2: 양식 입력 ──────────────────────────────────── */
                <form onSubmit={submitClassForm}>
                  <header>
                    <h2>
                      {classModalMode === "edit"
                        ? classType === "consulting" ? "상담 수정" : "수업 수정"
                        : classType === "consulting" ? "상담 등록" : "수업 등록"}
                    </h2>
                    <button type="button" onClick={() => setClassModalMode("")}>닫기</button>
                  </header>

                  {/* 유형 전환 탭 (등록 모드에서만 표시) */}
                  {classModalMode === "create" ? (
                    <div className="admin-class-type-tabs">
                      {[
                        { type: "private",    label: "프라이빗" },
                        { type: "group",      label: "그룹" },
                        { type: "consulting", label: "상담" },
                        { type: "etc",        label: "기타" },
                      ].map(({ type, label }) => (
                        <button
                          key={type}
                          type="button"
                          className={`admin-class-type-tab${classType === type ? " active" : ""}`}
                          onClick={() => selectClassType(type)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <label>
                    <span>지점</span>
                    <select
                      value={classForm.branchId || selectedBranchId}
                      onChange={(e) => setClassForm((prev) => ({ ...prev, branchId: e.target.value }))}
                    >
                      {STUDIO_BRANCHES.map((branch) => (
                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                      ))}
                    </select>
                  </label>

                  {/* 프라이빗·상담: 회원 검색 */}
                  {(classType === "private" || classType === "consulting") ? (
                    <div className="admin-schedule-instructor-field">
                      <label>
                        <span>회원명</span>
                        <input
                          value={memberSearchQuery}
                          placeholder="이름 또는 아이디 입력"
                          autoComplete="off"
                          onChange={(e) => handleMemberSearch(e.target.value)}
                          onBlur={() => setTimeout(() => setShowMemberSuggestions(false), 150)}
                        />
                      </label>
                      {showMemberSuggestions ? (
                        <ul className="admin-schedule-instructor-dropdown">
                          {memberSuggestions.map((member) => (
                            <li key={member.id}>
                              <button type="button" onMouseDown={() => selectMember(member)}>
                                <strong>{member.name}</strong>
                                <span>{member.loginId}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  {/* 상담은 수업명 없이 회원명만 사용 */}
                  {classType !== "consulting" ? (
                    <label>
                      <span>수업명</span>
                      <input value={classForm.title} onChange={(e) => setClassForm((prev) => ({ ...prev, title: e.target.value }))} required />
                    </label>
                  ) : null}

                  <div className="admin-schedule-modal-grid">
                    <div className="admin-schedule-instructor-field">
                      <label>
                        <span>강사명</span>
                        <input
                          value={classForm.instructorName}
                          placeholder="이름 입력 또는 선택"
                          autoComplete="off"
                          onChange={(e) => handleInstructorNameChange(e.target.value)}
                          onFocus={() => {
                            setInstructorSuggestions(
                              classForm.instructorName.trim()
                                ? instructorNames.filter((n) => n.toLowerCase().includes(classForm.instructorName.trim().toLowerCase()))
                                : instructorNames
                            );
                            setShowSuggestions(instructorNames.length > 0);
                          }}
                          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                        />
                      </label>
                      {showSuggestions && instructorSuggestions.length > 0 ? (
                        <ul className="admin-schedule-instructor-dropdown">
                          {instructorSuggestions.map((name) => (
                            <li key={name}>
                              <button
                                type="button"
                                className={name === currentUserName ? "is-me" : ""}
                                onMouseDown={() => selectInstructorSuggestion(name)}
                              >
                                {name}
                                {name === currentUserName ? <em>나</em> : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <label>
                      <span>룸명</span>
                      <input value={classForm.roomName} onChange={(e) => setClassForm((prev) => ({ ...prev, roomName: e.target.value }))} />
                    </label>
                  </div>

                  <div className="admin-schedule-modal-grid">
                    <label>
                      <span>날짜</span>
                      <input type="date" value={classForm.date} onChange={(e) => setClassForm((prev) => ({ ...prev, date: e.target.value }))} required />
                    </label>
                    <label>
                      <span>수업 시작 시간</span>
                      <input type="time" value={classForm.time} onChange={(e) => setClassForm((prev) => ({ ...prev, time: e.target.value }))} required />
                    </label>
                  </div>

                  {/* 상담은 수업 시간 없음 */}
                  {classType !== "consulting" ? (
                    <div className="admin-schedule-modal-grid">
                      <label>
                        <span>수업 시간 (분)</span>
                        <input type="number" min="10" step="5" value={classForm.durationMin} onChange={(e) => setClassForm((prev) => ({ ...prev, durationMin: e.target.value }))} />
                      </label>
                      {/* 그룹 수업만 정원 입력 */}
                      {classType === "group" ? (
                        <label>
                          <span>정원</span>
                          <input type="number" min="1" value={classForm.capacity} onChange={(e) => setClassForm((prev) => ({ ...prev, capacity: e.target.value }))} />
                        </label>
                      ) : null}
                    </div>
                  ) : null}

                  <footer>
                    {classModalMode === "create" ? (
                      <button type="button" className="admin-modal-back-btn" onClick={() => setModalStep("type")}>← 유형 변경</button>
                    ) : (
                      <button type="button" onClick={() => setClassModalMode("")}>취소</button>
                    )}
                    <button type="submit" disabled={busy}>{busy ? "저장 중..." : "저장"}</button>
                  </footer>
                </form>
              )}
            </div>
          </div>
        ) : null}
      </main>

      {/* 날짜 더보기 팝업 — 해당 날짜의 전체 수업 목록을 보여줍니다 */}
      {dayDetailPopup ? (
        <>
          <div
            className="admin-day-detail-backdrop"
            onClick={() => setDayDetailPopup(null)}
          />
          <div
            className="admin-day-detail-popup"
            style={{
              position: "fixed",
              left: Math.min(dayDetailPopup.anchorRect.left, window.innerWidth - 260),
              top: Math.min(dayDetailPopup.anchorRect.bottom + 4, window.innerHeight - 320),
              zIndex: 9998,
            }}
          >
            <div className="admin-day-detail-header">
              <span>
                {dayDetailPopup.date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
              </span>
              <button type="button" onClick={() => setDayDetailPopup(null)}>×</button>
            </div>
            <div className="admin-day-detail-list">
              {dayDetailPopup.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="admin-day-detail-row"
                  style={{ "--item-color": item.color || "#21d1ad" }}
                  onClick={() => { onSelectClass(item); setDayDetailPopup(null); }}
                >
                  <time>{toHm(item.startAt)}</time>
                  <span>{item.title}</span>
                  <em>{item.reservedCount}/{item.capacity}</em>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {/* 호버 툴팁 — 수업 칩에 마우스를 올리면 예약자 정보가 팝업으로 표시됩니다 */}
      {tooltip ? (
        <div
          className="admin-schedule-tooltip"
          style={{
            position: "fixed",
            left: Math.min(tooltip.x, window.innerWidth - 300),
            top: Math.min(tooltip.y, window.innerHeight - 320),
            zIndex: 9999,
          }}
          onMouseEnter={onTooltipMouseEnter}
          onMouseLeave={onTooltipMouseLeave}
        >
          <div className="admin-schedule-tooltip-header">
            <span className="admin-schedule-tooltip-date">
              {(() => {
                const d = new Date(tooltip.classItem.startAt);
                const e = new Date(tooltip.classItem.endAt || d.getTime() + 50 * 60000);
                const dateStr = d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
                return `${dateStr}  ${toHm(d)}~${toHm(e)}`;
              })()}
            </span>
            <span className="admin-schedule-tooltip-capacity">
              {tooltip.classItem.reservedCount}/{tooltip.classItem.capacity}
            </span>
          </div>
          <div className="admin-schedule-tooltip-body">
            <strong className="admin-schedule-tooltip-title">{tooltip.classItem.title}</strong>
            <div className="admin-schedule-tooltip-meta">
              <span>{tooltip.classItem.instructorName || "강사 미정"} 강사</span>
              <span className="admin-schedule-tooltip-type-badge">
                {tooltip.classItem.roomName || "그룹수업"}
              </span>
            </div>
          </div>
          <div className="admin-schedule-tooltip-attendees">
            {tooltip.bookings.length === 0 ? (
              <p className="admin-schedule-tooltip-empty">예약 회원이 없습니다.</p>
            ) : (
              <>
                <p className="admin-schedule-tooltip-attendee-count">
                  예약 회원 ({tooltip.bookings.filter((b) => b.status === "reserved").length}명)
                </p>
                {tooltip.bookings.map((booking) => (
                  <div key={booking.id} className="admin-schedule-tooltip-attendee-row">
                    <strong>{booking.userName || booking.userId}</strong>
                    <span>
                      {booking.passName ? `${String(booking.passName).slice(0, 8)}···` : "수강권 미확인"}
                      {booking.remainingCount != null ? ` · 잔여 ${booking.remainingCount}회` : ""}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}

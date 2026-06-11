/**
 * [관리자 수업 목록 페이지]
 *
 * 등록된 수업 전체를 표 형태로 보여주고 필터·삭제·일괄 수정을 처리합니다.
 * 스튜디오메이트의 수업 목록 화면을 벤치마킹했습니다.
 *
 * ─ 탭 구성 ────────────────────────────────────────────────────
 *  · 수업 목록   — 현재 운영 중인 수업
 *  · 예약 내역   — 전체 예약 목록 (추후 구현)
 *  · 삭제된 수업 — 폐강·삭제 처리된 수업 (추후 구현)
 *
 * ─ 필터 항목 ──────────────────────────────────────────────────
 *  날짜 / 요일 / 수업시간 / 강사 / 수업유형 / 룸
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import {
  cancelAdminStudioClass,
  deleteAdminStudioClass,
  getAdminStudioSettings,
  listAdminAllBookings,
  listAdminStudioClasses,
  updateAdminStudioClass,
} from "../../studio/api/studioApi.js";

// ─── 상수 ──────────────────────────────────────────────────────────────────────

const TABS = ["수업 목록", "예약 내역", "삭제된 수업"];

const WEEKDAY_OPTIONS = [
  { value: "", label: "모든 요일" },
  { value: "1", label: "월요일" },
  { value: "2", label: "화요일" },
  { value: "3", label: "수요일" },
  { value: "4", label: "목요일" },
  { value: "5", label: "금요일" },
  { value: "6", label: "토요일" },
  { value: "0", label: "일요일" },
];

const NAV_ITEMS = [
  { label: "← 교육관리", path: "/admin" }, { label: "일정", path: "/admin/studio" },
  { label: "수업", path: "/admin/classes", active: true },
  { label: "회원", path: "/admin/member-list" },
  { label: "강사", path: "/admin/instructors" },
  { label: "수강권", path: "/admin/passes" },
  { label: "메시지", path: "/admin/messages" },
  { label: "게시판", path: "/admin/board" },
  { label: "설정", path: "/admin/settings" },
  { label: "매출", path: "/admin/sales" },
];

const PAGE_SIZE = 10;

// ─── 헬퍼 함수 ─────────────────────────────────────────────────────────────────

/** Date를 "YYYY-MM-DD" 형식으로 변환합니다 */
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD HH:MM:SS" 형식의 DB 문자열에서 "HH:MM" 만 추출합니다 */
function toHm(value) {
  if (!value) return "-";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 수업일시를 "2026. 6. 2. (화) 09:00~09:50" 형식으로 변환합니다 */
function formatClassDateTime(startAt, endAt) {
  if (!startAt) return "-";
  const start = new Date(String(startAt).replace(" ", "T"));
  if (Number.isNaN(start.getTime())) return "-";
  const dateLabel = start.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
  const startTime = toHm(startAt);
  const endTime = toHm(endAt);
  return `${dateLabel} ${startTime}${endTime !== "-" ? `~${endTime}` : ""}`;
}

/** 예약 가능 시간을 계산합니다 (수업 시작 - N시간) */
function calcDeadline(startAt, limitHours) {
  if (!startAt || limitHours == null) return "-";
  const start = new Date(String(startAt).replace(" ", "T"));
  if (Number.isNaN(start.getTime())) return "-";
  const deadline = new Date(start.getTime() - Number(limitHours) * 3600000);
  return deadline.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" })
    + " " + toHm(deadline.toISOString()) + " 까지";
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

export function AdminClassListPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  // ── 상태 ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState(null); // 예약 정책 (마감 시간 계산용)

  // 필터
  const today = new Date();
  const [filterDate, setFilterDate] = useState(toDateStr(today));
  const [filterWeekday, setFilterWeekday] = useState("");
  const [filterTime, setFilterTime] = useState("");
  const [filterInstructor, setFilterInstructor] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // 선택 체크박스
  const [selectedIds, setSelectedIds] = useState(new Set());

  // 페이지네이션
  const [page, setPage] = useState(1);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditDraft, setBulkEditDraft] = useState({
    instructorName: "",
    capacity: "",
    roomName: "",
    status: "",
  });

  // ── 날짜 범위 계산 헬퍼 ─────────────────────────────────────────────────────
  function getDateRange() {
    const base = filterDate ? new Date(filterDate) : today;
    const y = base.getFullYear();
    const m = base.getMonth();
    const from = `${y}-${String(m + 1).padStart(2, "0")}-01 00:00:00`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")} 23:59:59`;
    return { from, to };
  }

  // ── 데이터 로드 ─────────────────────────────────────────────────────────────
  async function loadData() {
    setLoading(true);
    try {
      const { from, to } = getDateRange();
      if (activeTab === 0) {
        // 수업 목록: 운영 중인 수업
        const rows = await listAdminStudioClasses({ from, to, status: "active" });
        setClasses(Array.isArray(rows) ? rows : []);
      } else if (activeTab === 1) {
        // 예약 내역: 전체 예약
        const rows = await listAdminAllBookings({ from, to });
        setClasses(Array.isArray(rows) ? rows : []);
      } else if (activeTab === 2) {
        // 삭제된 수업: cancelled + deleted 상태
        const [cancelled, deleted] = await Promise.all([
          listAdminStudioClasses({ from, to, status: "cancelled" }),
          listAdminStudioClasses({ from, to, status: "deleted" }),
        ]);
        setClasses([...(Array.isArray(cancelled) ? cancelled : []), ...(Array.isArray(deleted) ? deleted : [])]);
      }
    } catch {
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    loadData();
  }, [filterDate, activeTab]);

  useEffect(() => {
    getAdminStudioSettings().then((data) => {
      setPolicy(data?.bookingPolicy || null);
    }).catch(() => {});
  }, []);

  // ── 고유 목록 (필터 드롭다운용) ─────────────────────────────────────────────
  const instructorList = useMemo(() =>
    [...new Set(classes.map((c) => c.instructorName || "").filter(Boolean))].sort()
  , [classes]);

  const roomList = useMemo(() =>
    [...new Set(classes.map((c) => c.roomName || "").filter(Boolean))].sort()
  , [classes]);

  // ── 필터링 ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return classes.filter((item) => {
      const startDate = new Date(String(item.startAt || "").replace(" ", "T"));
      if (filterDate) {
        const itemDateStr = toDateStr(startDate);
        if (itemDateStr !== filterDate) return false;
      }
      if (filterWeekday !== "") {
        if (String(startDate.getDay()) !== filterWeekday) return false;
      }
      if (filterTime) {
        const hm = toHm(item.startAt);
        if (!hm.startsWith(filterTime)) return false;
      }
      if (filterInstructor && item.instructorName !== filterInstructor) return false;
      if (filterType) {
        if (activeTab === 1) {
          // 예약 내역: 예약 상태 필터
          if (item.status !== filterType) return false;
        } else {
          const type = item.roomName || "";
          if (!type.toLowerCase().includes(filterType.toLowerCase())) return false;
        }
      }
      if (filterRoom && item.roomName !== filterRoom) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const text = [
          item.title,
          item.classTitle,
          item.instructorName,
          item.roomName,
          item.userName,
          item.userPhone,
          item.passName,
          item.status,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    }).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  }, [classes, filterDate, filterWeekday, filterTime, filterInstructor, filterType, filterRoom, searchQuery]);

  // ── 페이지네이션 ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── 체크박스 ──────────────────────────────────────────────────────────────
  const allChecked = pageItems.length > 0 && pageItems.every((item) => selectedIds.has(item.id));

  function toggleAll() {
    if (allChecked) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageItems.forEach((item) => next.delete(item.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageItems.forEach((item) => next.add(item.id));
        return next;
      });
    }
  }

  function toggleOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── 수업 삭제 ──────────────────────────────────────────────────────────────
  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 수업 ${selectedIds.size}개를 삭제하시겠습니까?`)) return;
    setBusy(true);
    try {
      await Promise.all([...selectedIds].map((id) => deleteAdminStudioClass(id).catch(() => {})));
      setSelectedIds(new Set());
      setMessage({ type: "success", text: "삭제 완료됐습니다." });
      await loadData();
    } catch {
      setMessage({ type: "error", text: "일부 삭제에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkEditSelected(event) {
    event.preventDefault();
    if (selectedIds.size === 0) return;
    const patch = {};
    if (bulkEditDraft.instructorName.trim()) patch.instructorName = bulkEditDraft.instructorName.trim();
    if (bulkEditDraft.roomName.trim()) patch.roomName = bulkEditDraft.roomName.trim();
    if (bulkEditDraft.capacity !== "") patch.capacity = Math.max(1, Number(bulkEditDraft.capacity || 1));
    const selectedItems = classes.filter((item) => selectedIds.has(item.id));
    if (!Object.keys(patch).length && !bulkEditDraft.status) {
      setMessage({ type: "error", text: "변경할 항목을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      if (Object.keys(patch).length) {
        await Promise.all(selectedItems.map((item) => updateAdminStudioClass(item.id, {
          title: item.title || item.classTitle || "",
          instructorName: patch.instructorName ?? item.instructorName ?? "",
          roomName: patch.roomName ?? item.roomName ?? "",
          startAt: item.startAt,
          endAt: item.endAt,
          capacity: patch.capacity ?? item.capacity ?? 1,
        })));
      }
      if (bulkEditDraft.status === "cancelled") {
        await Promise.all(selectedItems.map((item) => cancelAdminStudioClass(item.id)));
      }
      if (bulkEditDraft.status === "deleted") {
        await Promise.all(selectedItems.map((item) => deleteAdminStudioClass(item.id)));
      }
      setMessage({ type: "success", text: `선택한 수업 ${selectedIds.size}개를 수정했습니다.` });
      setSelectedIds(new Set());
      setBulkEditOpen(false);
      setBulkEditDraft({ instructorName: "", capacity: "", roomName: "", status: "" });
      await loadData();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "일괄 수정에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  function toCsvCell(value) {
    const text = String(value ?? "").replace(/\r?\n/g, " ");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function handleDownloadCsv() {
    const headers = activeTab === 1
      ? ["수업일시", "수업명", "강사", "룸", "회원명", "연락처", "수강권", "잔여횟수", "예약상태", "예약일시", "미수금"]
      : ["수업일시", "강사", "수업", "수업명", "수업구분", "룸", "예약인원", "상태"];
    const lines = filtered.map((item) => activeTab === 1
      ? [
          formatClassDateTime(item.startAt, item.endAt),
          item.classTitle || "",
          item.instructorName || "",
          item.roomName || "",
          item.userName || "",
          item.userPhone || "",
          item.passName || "",
          item.remainingCount ?? "",
          item.status || "",
          formatClassDateTime(item.bookedAt),
          item.openArrearsAmount || "",
        ]
      : [
          formatClassDateTime(item.startAt, item.endAt),
          item.instructorName || "",
          item.roomName?.includes("개인") || item.roomName?.includes("듀엣") ? "프라이빗" : "그룹",
          item.title || "",
          item.roomName || "",
          "",
          `${item.reservedCount ?? 0}/${item.capacity ?? 0}`,
          item.status || "",
        ]);
    const csv = [headers, ...lines].map((row) => row.map(toCsvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `studio-classes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // ── 날짜 이동 ──────────────────────────────────────────────────────────────
  function moveDate(days) {
    const d = filterDate ? new Date(filterDate) : new Date();
    d.setDate(d.getDate() + days);
    setFilterDate(toDateStr(d));
    setPage(1);
  }

  return (
    <div className="admin-classlist-app">
      {/* ── 상단 네비게이션 ─────────────────────────────────────────────────── */}
      <header className="admin-schedule-topbar">
        <button className="admin-schedule-logo" type="button" onClick={() => navigate("/")}>
          <span>ICL</span>
        </button>
        <nav className="admin-schedule-nav">
          {NAV_ITEMS.map((item) => (
            <Link key={item.label} className={item.active ? "active" : ""} to={item.path}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="admin-schedule-search">
          <span aria-hidden="true">검색</span>
          <input
            type="search"
            placeholder="수업명, 강사, 회원명, 전화번호 검색"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <button className="admin-schedule-profile" type="button" onClick={() => navigate("/admin")}>
          {currentUserName}
        </button>
      </header>

      <div className="admin-classlist-body">
        {/* ── 탭 + 제목 ──────────────────────────────────────────────────────── */}
        <div className="admin-classlist-title-row">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              type="button"
              className={`admin-classlist-tab${activeTab === i ? " active" : ""}`}
              onClick={() => setActiveTab(i)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── 필터 바 ────────────────────────────────────────────────────────── */}
        <div className="admin-classlist-filterbar">
          {/* 날짜 피커 */}
          <div className="admin-classlist-date-picker">
            <button type="button" onClick={() => moveDate(-1)}>‹</button>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
            />
            <button type="button" onClick={() => moveDate(1)}>›</button>
          </div>

          <select value={filterWeekday} onChange={(e) => { setFilterWeekday(e.target.value); setPage(1); }}>
            {WEEKDAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select value={filterTime} onChange={(e) => { setFilterTime(e.target.value); setPage(1); }}>
            <option value="">수업시간 전체</option>
            {["06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21"].map((h) => (
              <option key={h} value={h}>{h}:00대</option>
            ))}
          </select>

          <select value={filterInstructor} onChange={(e) => { setFilterInstructor(e.target.value); setPage(1); }}>
            <option value="">강사 전체</option>
            {instructorList.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>

          {activeTab !== 1 ? (
            <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
              <option value="">수업 전체</option>
              <option value="그룹">그룹</option>
              <option value="개인">프라이빗</option>
            </select>
          ) : (
            <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
              <option value="">예약 상태 전체</option>
              <option value="reserved">예약 완료</option>
              <option value="waitlisted">대기 중</option>
              <option value="cancelled">취소</option>
            </select>
          )}

          <select value={filterRoom} onChange={(e) => { setFilterRoom(e.target.value); setPage(1); }}>
            <option value="">룸 전체</option>
            {roomList.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          <span className="admin-classlist-count">
            필터된 수업 <strong>{filtered.length}</strong>개
          </span>

          <div className="admin-classlist-actions">
            <button
              type="button"
              className="admin-classlist-btn danger"
              disabled={selectedIds.size === 0 || busy || activeTab === 1}
              onClick={handleDeleteSelected}
            >
              수업 삭제
            </button>
            <button
              type="button"
              className="admin-classlist-btn"
              disabled={selectedIds.size === 0 || activeTab === 1}
              onClick={() => setBulkEditOpen((value) => !value)}
            >
              일괄 수정
            </button>
            <button type="button" className="admin-classlist-btn primary" onClick={handleDownloadCsv}>
              엑셀 다운
            </button>
          </div>
        </div>

        {bulkEditOpen ? (
          <form className="admin-classlist-bulk-panel" onSubmit={handleBulkEditSelected}>
            <strong>선택 수업 {selectedIds.size}개 일괄 수정</strong>
            <input
              type="text"
              placeholder="강사명 변경"
              value={bulkEditDraft.instructorName}
              onChange={(event) => setBulkEditDraft((previous) => ({ ...previous, instructorName: event.target.value }))}
            />
            <input
              type="text"
              placeholder="룸/수업구분 변경"
              value={bulkEditDraft.roomName}
              onChange={(event) => setBulkEditDraft((previous) => ({ ...previous, roomName: event.target.value }))}
            />
            <input
              type="number"
              min="1"
              placeholder="정원 변경"
              value={bulkEditDraft.capacity}
              onChange={(event) => setBulkEditDraft((previous) => ({ ...previous, capacity: event.target.value }))}
            />
            <select
              value={bulkEditDraft.status}
              onChange={(event) => setBulkEditDraft((previous) => ({ ...previous, status: event.target.value }))}
            >
              <option value="">상태 유지</option>
              <option value="cancelled">폐강</option>
              <option value="deleted">삭제</option>
            </select>
            <button type="button" onClick={() => setBulkEditOpen(false)}>취소</button>
            <button type="submit" className="primary" disabled={busy}>적용</button>
          </form>
        ) : null}

        {message.text ? (
          <p className={`admin-classlist-message ${message.type}`}>{message.text}</p>
        ) : null}

        {/* ── 테이블 ─────────────────────────────────────────────────────────── */}
        <div className="admin-classlist-table-wrap">
          <table className="admin-classlist-table">

            {/* 수업 목록 / 삭제된 수업 헤더 */}
            {activeTab !== 1 ? (
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                  <th>수업일시 ↑</th>
                  <th>강사</th>
                  <th>수업</th>
                  <th>수업명</th>
                  <th>수업구분</th>
                  <th>룸</th>
                  <th>최대/최소<br />수강인원</th>
                  <th>예약대기<br />가능인원</th>
                  <th>예약 가능 시간</th>
                  <th>취소 가능 시간</th>
                  <th>당일 예약 변경<br />가능 시간</th>
                  <th>상태</th>
                </tr>
              </thead>
            ) : (
              /* 예약 내역 헤더 */
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                  <th>수업일시 ↑</th>
                  <th>수업명</th>
                  <th>강사</th>
                  <th>룸</th>
                  <th>회원명</th>
                  <th>연락처</th>
                  <th>수강권</th>
                  <th>잔여 횟수</th>
                  <th>예약 상태</th>
                  <th>예약일시</th>
                  <th>미수금</th>
                </tr>
              </thead>
            )}

            <tbody>
              {loading ? (
                <tr><td colSpan={13} className="admin-classlist-empty">불러오는 중...</td></tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={13} className="admin-classlist-empty">
                    {activeTab === 0 ? "해당 조건의 수업이 없습니다." :
                     activeTab === 1 ? "예약 내역이 없습니다." :
                     "삭제된 수업이 없습니다."}
                  </td>
                </tr>
              ) : activeTab !== 1 ? (
                /* 수업 목록 / 삭제된 수업 행 */
                pageItems.map((item) => {
                  const reserveDeadline = policy?.reserveLimitHours != null
                    ? calcDeadline(item.startAt, policy.reserveLimitHours) : "무제한";
                  const cancelDeadline = policy?.cancelLimitHours != null
                    ? calcDeadline(item.startAt, policy.cancelLimitHours) : "무제한";
                  const sameDayAllowed = policy?.sameDayChangeAllowed;
                  return (
                    <tr key={item.id} className={selectedIds.has(item.id) ? "selected" : ""} onClick={() => toggleOne(item.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleOne(item.id)} />
                      </td>
                      <td className="nowrap">{formatClassDateTime(item.startAt, item.endAt)}</td>
                      <td>{item.instructorName || "-"}</td>
                      <td>{item.roomName?.includes("개인") || item.roomName?.includes("듀엣") ? "프라이빗" : "그룹"}</td>
                      <td>{item.title || "-"}</td>
                      <td>{item.roomName || "-"}</td>
                      <td>-</td>
                      <td className="center">{item.reservedCount ?? 0}/{item.capacity ?? 0}</td>
                      <td className="center">무제한</td>
                      <td className="nowrap">{reserveDeadline}</td>
                      <td className="nowrap">{cancelDeadline}</td>
                      <td className="nowrap">{sameDayAllowed == null ? "-" : sameDayAllowed ? cancelDeadline : "-"}</td>
                      <td>
                        <span className={`admin-classlist-status ${item.status}`}>
                          {item.status === "active" ? "운영중" : item.status === "cancelled" ? "폐강" : "삭제"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                /* 예약 내역 행 */
                pageItems.map((item) => (
                  <tr key={item.id} className={selectedIds.has(item.id) ? "selected" : ""} onClick={() => toggleOne(item.id)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleOne(item.id)} />
                    </td>
                    <td className="nowrap">{formatClassDateTime(item.startAt, item.endAt)}</td>
                    <td>{item.classTitle || "-"}</td>
                    <td>{item.instructorName || "-"}</td>
                    <td>{item.roomName || "-"}</td>
                    <td>{item.userName || "-"}</td>
                    <td>{item.userPhone || "-"}</td>
                    <td>{item.passName || "-"}</td>
                    <td className="center">{item.remainingCount ?? "-"}</td>
                    <td>
                      <span className={`admin-classlist-status booking-${item.status}`}>
                        {item.status === "reserved" ? "예약 완료" : item.status === "waitlisted" ? "대기 중" : "취소"}
                      </span>
                    </td>
                    <td className="nowrap">{formatClassDateTime(item.bookedAt)}</td>
                    <td>{item.openArrearsAmount > 0 ? `${item.openArrearsAmount.toLocaleString()}원` : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── 페이지네이션 ────────────────────────────────────────────────────── */}
        <div className="admin-classlist-pagination">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              className={p === safePage ? "active" : ""}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
          <span className="admin-classlist-perpage">{PAGE_SIZE}/page</span>
        </div>
      </div>
    </div>
  );
}

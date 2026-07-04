import React, { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "../components/AdminLayout.jsx";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { downloadXlsx } from "../../../shared/utils/exportXlsx.js";
import {
  cancelAdminStudioClass,
  deleteAdminStudioClass,
  getAdminStudioSettings,
  listAdminAllBookings,
  listAdminStudioClasses,
  updateAdminStudioClass,
} from "../../studio/api/studioApi.js";
import { DEFAULT_STUDIO_BRANCH_ID, STUDIO_BRANCHES } from "../../studio/constants/studioBranches.js";

// ─── 상수 ──────────────────────────────────────────────────────────────────────

const TABS = ["수업 목록", "예약내역", "삭제된 수업"];

const PAGE_SIZE = 50;

// ─── 헬퍼 함수 ─────────────────────────────────────────────────────────────────

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toHm(value) {
  if (!value) return "-";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatClassDateTime(startAt, endAt) {
  if (!startAt) return "-";
  const start = new Date(String(startAt).replace(" ", "T"));
  if (Number.isNaN(start.getTime())) return "-";
  const dateLabel = start.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
  const startTime = toHm(startAt);
  const endTime = toHm(endAt);
  return `${dateLabel} ${startTime}${endTime !== "-" ? `~${endTime}` : ""}`;
}

function calcDeadline(startAt, limitHours) {
  if (!startAt || limitHours == null) return "-";
  const start = new Date(String(startAt).replace(" ", "T"));
  if (Number.isNaN(start.getTime())) return "-";
  const deadline = new Date(start.getTime() - Number(limitHours) * 3600000);
  return deadline.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" })
    + " " + toHm(deadline.toISOString()) + " 까지";
}

function formatDeadline(deadlineAt, fallback) {
  if (!deadlineAt) return fallback;
  const date = new Date(String(deadlineAt).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" })
    + " " + toHm(date) + " 까지";
}

function formatWaitlistCapacity(value) {
  return value === null || typeof value === "undefined" || value === "" ? "무제한" : `${Number(value) || 0}명`;
}

function classTypeLabel(classType) {
  if (classType === "private") return "프라이빗";
  if (classType === "group") return "그룹";
  if (classType === "consulting") return "상담";
  return classType || "그룹";
}

function bookingStatusLabel(status) {
  if (status === "reserved") return "출석";
  if (status === "waitlisted") return "대기";
  if (status === "cancelled") return "취소";
  return status || "";
}

function daysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const exp = new Date(String(expiresAt).replace(" ", "T"));
  if (Number.isNaN(exp.getTime())) return null;
  const diff = Math.ceil((exp.getTime() - Date.now()) / 86400000);
  return diff;
}

// ─── 엑셀 헬퍼 ─────────────────────────────────────────────────────────────────

function xlsxDateOnly(val) {
  if (!val) return "";
  const d = new Date(String(val).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function xlsxTimeOnly(val) {
  if (!val) return "";
  const d = new Date(String(val).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function xlsxClassType(ct) {
  if (ct === "private") return "프라이빗";
  if (ct === "group") return "그룹";
  return ct || "그룹";
}

function xlsxBookingStatus(status) {
  if (status === "reserved") return "예약 확정";
  if (status === "waitlisted") return "대기";
  if (status === "cancelled") return "취소";
  return status || "";
}

function xlsxPassStatus(status) {
  if (status === "active") return "이용중";
  if (status === "paused") return "정지";
  if (status === "transferred") return "양도";
  if (status === "refunded") return "환불";
  return status || "";
}

function xlsxDeadline(val) {
  if (!val) return "무제한";
  const d = new Date(String(val).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "무제한";
  return `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

export function AdminClassListPage() {
  const store = useAppStore();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  // ── 상태 ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0);
  const [classes, setClasses] = useState([]);         // tab 0,2: class rows
  const [bookings, setBookings] = useState([]);        // tab 1,2: booking rows
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState(null);

  const today = new Date();
  const [filterDate, setFilterDate] = useState(toDateStr(today));
  const [selectedBranchId, setSelectedBranchId] = useState(DEFAULT_STUDIO_BRANCH_ID);
  const [filterInstructor, setFilterInstructor] = useState("");
  const [filterClassType, setFilterClassType] = useState("");     // 수업구분 (그룹/프라이빗)
  const [filterBookingStatus, setFilterBookingStatus] = useState(""); // 예약상태 (tab1 only)
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditDraft, setBulkEditDraft] = useState({ instructorName: "", capacity: "", roomName: "", status: "" });

  // ── 날짜 범위 ───────────────────────────────────────────────────────────────
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
    setMessage({ type: "", text: "" });
    try {
      const { from, to } = getDateRange();
      if (activeTab === 0) {
        const rows = await listAdminStudioClasses({ from, to, status: "active", branchId: selectedBranchId });
        setClasses(Array.isArray(rows) ? rows : []);
        setBookings([]);
      } else if (activeTab === 1) {
        const rows = await listAdminAllBookings({ from, to, branchId: selectedBranchId });
        setBookings(Array.isArray(rows) ? rows : []);
        setClasses([]);
      } else {
        const [cancelled, deleted, deletedBookings] = await Promise.all([
          listAdminStudioClasses({ from, to, status: "cancelled", branchId: selectedBranchId }),
          listAdminStudioClasses({ from, to, status: "deleted", branchId: selectedBranchId }),
          listAdminAllBookings({ from, to, branchId: selectedBranchId, classStatus: "cancelled,deleted" }),
        ]);
        setClasses([...(Array.isArray(cancelled) ? cancelled : []), ...(Array.isArray(deleted) ? deleted : [])]);
        setBookings(Array.isArray(deletedBookings) ? deletedBookings : []);
      }
    } catch (error) {
      setClasses([]);
      setBookings([]);
      setMessage({ type: "error", text: error?.message || "수업 정보를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    loadData();
  }, [filterDate, activeTab, selectedBranchId]);

  useEffect(() => {
    getAdminStudioSettings().then((data) => setPolicy(data?.bookingPolicy || null)).catch(() => setPolicy(null));
  }, []);

  // ── 강사 목록 (드롭다운용) ───────────────────────────────────────────────────
  const instructorList = useMemo(() => {
    const src = activeTab === 1 ? bookings : classes;
    return [...new Set(src.map((c) => c.instructorName || "").filter(Boolean))].sort();
  }, [classes, bookings, activeTab]);

  // ── 필터링 ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const src = activeTab === 1 ? bookings : classes;
    return src.filter((item) => {
      const startDate = new Date(String(item.startAt || "").replace(" ", "T"));
      if (filterDate) {
        const itemDateStr = toDateStr(startDate);
        if (itemDateStr !== filterDate) return false;
      }
      if (filterInstructor && item.instructorName !== filterInstructor) return false;
      if (filterClassType && item.classType !== filterClassType) return false;
      if (activeTab === 1 && filterBookingStatus && item.status !== filterBookingStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const text = [
          item.title, item.classTitle, item.instructorName,
          item.roomName, item.userName, item.userPhone, item.passName,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  }, [classes, bookings, activeTab, filterDate, filterInstructor, filterClassType, filterBookingStatus, searchQuery]);

  // ── 삭제된수업 탭: 수업별 예약 그룹 빌드 ────────────────────────────────────
  const deletedRows = useMemo(() => {
    if (activeTab !== 2) return [];
    const filteredClasses = filtered; // class-level rows already filtered
    const bookingsByClassId = {};
    bookings.forEach((b) => {
      if (!bookingsByClassId[b.classId]) bookingsByClassId[b.classId] = [];
      bookingsByClassId[b.classId].push(b);
    });
    const result = [];
    filteredClasses.forEach((cls) => {
      const clsBookings = bookingsByClassId[cls.id] || [];
      if (clsBookings.length === 0) {
        result.push({ ...cls, _type: "class-only", _isFirst: true });
      } else {
        clsBookings.forEach((bk, idx) => {
          result.push({ ...cls, ...bk, _type: "booking", _isFirst: idx === 0, _classId: cls.id });
        });
      }
    });
    return result;
  }, [activeTab, filtered, bookings]);

  // ── 예약내역 탭: 수업별 그룹 빌드 ──────────────────────────────────────────
  const bookingRows = useMemo(() => {
    if (activeTab !== 1) return [];
    const seenClassIds = new Set();
    return filtered.map((item) => {
      const isFirstInClass = !seenClassIds.has(item.classId);
      if (isFirstInClass) seenClassIds.add(item.classId);
      return { ...item, _isFirstInClass: isFirstInClass };
    });
  }, [activeTab, filtered]);

  // ── 카운트 요약 ──────────────────────────────────────────────────────────────
  const countSummary = useMemo(() => {
    if (activeTab === 0) {
      const total = filtered.length;
      const group = filtered.filter((c) => c.classType !== "private").length;
      const priv = filtered.filter((c) => c.classType === "private").length;
      return `전체 ${total}개  그룹 ${group}개  프라이빗 ${priv}개`;
    }
    if (activeTab === 1) {
      const total = filtered.length;
      const group = filtered.filter((c) => c.classType !== "private").length;
      return `전체 ${total}명  그룹 ${group}명`;
    }
    return `전체 ${filtered.length}개`;
  }, [filtered, activeTab]);

  // ── 페이지네이션 ─────────────────────────────────────────────────────────────
  const displayRows = activeTab === 1 ? bookingRows : activeTab === 2 ? deletedRows : filtered;
  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = displayRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── 체크박스 ──────────────────────────────────────────────────────────────
  const pageClassItems = activeTab === 0 ? pageItems : [];
  const allChecked = pageClassItems.length > 0 && pageClassItems.every((item) => selectedIds.has(item.id));

  function toggleAll() {
    if (allChecked) {
      setSelectedIds((prev) => { const next = new Set(prev); pageClassItems.forEach((item) => next.delete(item.id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); pageClassItems.forEach((item) => next.add(item.id)); return next; });
    }
  }

  function toggleOne(id) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  // ── 수업 삭제 ──────────────────────────────────────────────────────────────
  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 수업 ${selectedIds.size}개를 삭제하시겠습니까?`)) return;
    setBusy(true);
    try {
      const ids = [...selectedIds];
      const results = await Promise.allSettled(ids.map((id) => deleteAdminStudioClass(id)));
      const failedIds = ids.filter((_, index) => results[index].status === "rejected");
      setSelectedIds(new Set(failedIds));
      await loadData();
      if (failedIds.length > 0) {
        setMessage({ type: "error", text: `${ids.length - failedIds.length}개 삭제, ${failedIds.length}개 실패했습니다.` });
      } else {
        setMessage({ type: "success", text: `${ids.length}개 수업을 삭제했습니다.` });
      }
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "수업 삭제에 실패했습니다." });
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
          classType: item.classType || "group",
          branchId: item.branchId || selectedBranchId,
          title: item.title || item.classTitle || "",
          instructorName: patch.instructorName ?? item.instructorName ?? "",
          roomName: patch.roomName ?? item.roomName ?? "",
          startAt: item.startAt,
          endAt: item.endAt,
          capacity: patch.capacity ?? item.capacity ?? 1,
          minCapacity: item.minCapacity ?? 0,
          waitlistCapacity: item.waitlistCapacity ?? null,
          bookingDeadlineAt: item.bookingDeadlineAt ?? null,
          cancellationDeadlineAt: item.cancellationDeadlineAt ?? null,
          cancellationDecisionAt: item.cancellationDecisionAt ?? null,
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

  // ── 엑셀 다운로드 ──────────────────────────────────────────────────────────
  function handleDownloadXlsx() {
    const dateStr = filterDate || new Date().toISOString().slice(0, 10);
    let sheetName, headers, lines;

    if (activeTab === 0) {
      sheetName = "수업목록";
      headers = ["수업일", "수업시작시", "수업종료시", "강사", "수업", "수업명", "수업구분", "룸", "최대수강인원", "최소수강인원", "예약대기가능", "예약가능시간", "취소가능시간", "폐강시간"];
      lines = filtered.map((item) => [
        xlsxDateOnly(item.startAt), xlsxTimeOnly(item.startAt), xlsxTimeOnly(item.endAt),
        item.instructorName || "", xlsxClassType(item.classType), item.title || "", item.roomName || "", "",
        item.capacity ?? 0, item.minCapacity ?? 0,
        formatWaitlistCapacity(item.waitlistCapacity),
        xlsxDeadline(item.bookingDeadlineAt), xlsxDeadline(item.cancellationDeadlineAt), xlsxDeadline(item.cancellationDecisionAt),
      ]);
    } else if (activeTab === 1) {
      sheetName = "예약내역";
      headers = ["수업일", "수업시작", "수업종료", "강사", "수업구분", "수업명", "룸", "예약상태", "상태변경일", "회원명", "휴대폰번호", "수강권명", "수강권잔여", "수강권전체", "수강권상태"];
      lines = filtered.map((item) => [
        xlsxDateOnly(item.startAt), xlsxTimeOnly(item.startAt), xlsxTimeOnly(item.endAt),
        item.instructorName || "", xlsxClassType(item.classType), item.classTitle || "", item.roomName || "",
        xlsxBookingStatus(item.status), xlsxDateOnly(item.bookedAt),
        item.userName || "", item.userPhone || "",
        item.passName || "", item.remainingCount ?? "", item.totalCount ?? "", xlsxPassStatus(item.passStatus),
      ]);
    } else {
      sheetName = "삭제된수업";
      headers = ["수업일", "수업시작", "수업종료", "강사", "수업구분", "수업명", "룸", "예약상태", "회원명", "휴대폰번호", "삭제시간", "삭제한사람", "삭제이유"];
      lines = filtered.map((item) => [
        xlsxDateOnly(item.startAt), xlsxTimeOnly(item.startAt), xlsxTimeOnly(item.endAt),
        item.instructorName || "", xlsxClassType(item.classType), item.title || "", item.roomName || "",
        "", "", "",
        xlsxDateOnly(item.updatedAt), "", "",
      ]);
    }

    downloadXlsx(`${sheetName}_${dateStr}.xlsx`, [
      { name: sheetName, rows: [headers, ...lines] },
    ]);
  }

  // ── 날짜 이동 ──────────────────────────────────────────────────────────────
  function moveDate(days) {
    const d = filterDate ? new Date(filterDate) : new Date();
    d.setDate(d.getDate() + days);
    setFilterDate(toDateStr(d));
    setPage(1);
  }

  // ── 수강권 정보 배지 ────────────────────────────────────────────────────────
  function renderPassBadge(item) {
    const remaining = item.remainingCount;
    const total = item.totalCount;
    const days = daysRemaining(item.passExpiresAt);
    const parts = [];
    if (days !== null) parts.push(`${days > 0 ? days + "일 남음" : "만료"}`);
    if (remaining != null && total != null) parts.push(`잔여 횟수 ${remaining}/${total}`);
    else if (remaining != null) parts.push(`${remaining}회 남음`);
    if (!parts.length) return null;
    return <span className="acl-pass-badge">{parts.join("  ")}</span>;
  }

  return (
    <AdminLayout appClass="admin-classlist-app" userName={currentUserName}>

      <div className="admin-classlist-body">

        {/* ── 타이틀 행 ────────────────────────────────────────────────────── */}
        <div className="acl-title-row">
          <div className="acl-tabs">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                type="button"
                className={`acl-tab${activeTab === i ? " active" : ""}`}
                onClick={() => { setActiveTab(i); setPage(1); setSelectedIds(new Set()); }}
              >
                {tab}
              </button>
            ))}
          </div>
          <button type="button" className="acl-excel-btn" onClick={handleDownloadXlsx}>
            엑셀다운로드
          </button>
        </div>

        {/* ── 필터 바 ────────────────────────────────────────────────────────── */}
        <div className="acl-filterbar">
          {/* 날짜 네비게이션 */}
          <div className="acl-date-nav">
            <button type="button" className="acl-date-arrow" onClick={() => moveDate(-1)}>‹</button>
            <label className="acl-date-label">
              <span className="acl-date-icon">📅</span>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
              />
            </label>
            <button type="button" className="acl-date-arrow" onClick={() => moveDate(1)}>›</button>
          </div>

          {/* 강사 */}
          <select value={filterInstructor} onChange={(e) => { setFilterInstructor(e.target.value); setPage(1); }}>
            <option value="">강사 전체</option>
            {instructorList.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>

          {/* 수업구분 */}
          <select value={filterClassType} onChange={(e) => { setFilterClassType(e.target.value); setPage(1); }}>
            <option value="">수업구분 전체</option>
            <option value="group">그룹</option>
            <option value="private">프라이빗</option>
          </select>

          {/* 예약상태 (tab1 only) */}
          {activeTab === 1 && (
            <select value={filterBookingStatus} onChange={(e) => { setFilterBookingStatus(e.target.value); setPage(1); }}>
              <option value="">예약상태 전체</option>
              <option value="reserved">출석</option>
              <option value="waitlisted">대기</option>
              <option value="cancelled">취소</option>
            </select>
          )}

          {/* 검색 */}
          <input
            type="text"
            className="acl-search"
            placeholder="회원명 또는 전화번호"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />

          {/* 수업 목록 탭 액션 버튼 */}
          {activeTab === 0 && (
            <>
              <button type="button" className="acl-btn danger" disabled={selectedIds.size === 0 || busy} onClick={handleDeleteSelected}>
                수업 삭제
              </button>
              <button type="button" className="acl-btn" disabled={selectedIds.size === 0} onClick={() => setBulkEditOpen((v) => !v)}>
                일괄 수정
              </button>
            </>
          )}
        </div>

        {/* ── 지점 탭 + 카운트 ──────────────────────────────────────────────── */}
        <div className="acl-branch-tabs">
          {STUDIO_BRANCHES.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={selectedBranchId === branch.id ? "active" : ""}
              onClick={() => { setSelectedBranchId(branch.id); setPage(1); setSelectedIds(new Set()); }}
            >
              {branch.name}
            </button>
          ))}
          <span className="acl-count-summary">{countSummary}</span>
        </div>

        {bulkEditOpen ? (
          <form className="admin-classlist-bulk-panel" onSubmit={handleBulkEditSelected}>
            <strong>선택 수업 {selectedIds.size}개 일괄 수정</strong>
            <input type="text" placeholder="강사명 변경" value={bulkEditDraft.instructorName}
              onChange={(e) => setBulkEditDraft((p) => ({ ...p, instructorName: e.target.value }))} />
            <input type="text" placeholder="룸/수업구분 변경" value={bulkEditDraft.roomName}
              onChange={(e) => setBulkEditDraft((p) => ({ ...p, roomName: e.target.value }))} />
            <input type="number" min="1" placeholder="정원 변경" value={bulkEditDraft.capacity}
              onChange={(e) => setBulkEditDraft((p) => ({ ...p, capacity: e.target.value }))} />
            <select value={bulkEditDraft.status} onChange={(e) => setBulkEditDraft((p) => ({ ...p, status: e.target.value }))}>
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

          {/* ── 수업 목록 ──────────────────────────────────────────────────── */}
          {activeTab === 0 && (
            <table className="admin-classlist-table acl-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                  <th>수업일시 ↑</th>
                  <th>강사</th>
                  <th>수업구분</th>
                  <th>수업</th>
                  <th>룸</th>
                  <th>최대/최소 수강인원</th>
                  <th>예약대기 가능인원</th>
                  <th>예약 가능 시간</th>
                  <th>취소 가능 시간</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="admin-classlist-empty">불러오는 중...</td></tr>
                ) : pageItems.length === 0 ? (
                  <tr><td colSpan={11} className="admin-classlist-empty">해당 조건의 수업이 없습니다.</td></tr>
                ) : pageItems.map((item) => {
                  const reserveDeadlineFallback = policy?.reserveLimitHours != null
                    ? calcDeadline(item.startAt, policy.reserveLimitHours) : "무제한";
                  const cancelDeadlineFallback = policy?.cancelLimitHours != null
                    ? calcDeadline(item.startAt, policy.cancelLimitHours) : "무제한";
                  return (
                    <tr key={item.id} className={selectedIds.has(item.id) ? "selected" : ""} onClick={() => toggleOne(item.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleOne(item.id)} />
                      </td>
                      <td className="nowrap">{formatClassDateTime(item.startAt, item.endAt)}</td>
                      <td>{item.instructorName || "-"}</td>
                      <td>{classTypeLabel(item.classType)}</td>
                      <td>{item.title || "-"}</td>
                      <td>{item.roomName || "-"}</td>
                      <td className="center">{item.capacity ?? 0}/{item.minCapacity ?? 0}</td>
                      <td className="center">{formatWaitlistCapacity(item.waitlistCapacity)}</td>
                      <td className="nowrap">{formatDeadline(item.bookingDeadlineAt, reserveDeadlineFallback)}</td>
                      <td className="nowrap">{formatDeadline(item.cancellationDeadlineAt, cancelDeadlineFallback)}</td>
                      <td>
                        <span className={`admin-classlist-status ${item.status}`}>
                          {item.status === "active" ? "운영중" : item.status === "cancelled" ? "폐강" : "삭제"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* ── 예약내역 ───────────────────────────────────────────────────── */}
          {activeTab === 1 && (
            <table className="admin-classlist-table acl-table acl-booking-table">
              <thead>
                <tr>
                  <th>수업일시 ↑</th>
                  <th>강사</th>
                  <th>수업구분</th>
                  <th>수업</th>
                  <th>룸</th>
                  <th>예약 상태</th>
                  <th>상태 변경 일시</th>
                  <th>회원</th>
                  <th>휴대폰번호</th>
                  <th>수강권</th>
                  <th>수강권정보</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="admin-classlist-empty">불러오는 중...</td></tr>
                ) : pageItems.length === 0 ? (
                  <tr><td colSpan={11} className="admin-classlist-empty">예약 내역이 없습니다.</td></tr>
                ) : pageItems.map((item) => (
                  <tr key={item.id} className={item._isFirstInClass ? "acl-class-first-row" : "acl-class-cont-row"}>
                    <td className="nowrap">{item._isFirstInClass ? formatClassDateTime(item.startAt, item.endAt) : ""}</td>
                    <td>{item._isFirstInClass ? (item.instructorName || "-") : ""}</td>
                    <td>{item._isFirstInClass ? classTypeLabel(item.classType) : ""}</td>
                    <td>{item._isFirstInClass ? (item.classTitle || "-") : ""}</td>
                    <td>{item._isFirstInClass ? (item.roomName || "-") : ""}</td>
                    <td>
                      <span className={`acl-booking-status ${item.status}`}>
                        {bookingStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="nowrap">{formatClassDateTime(item.bookedAt)}</td>
                    <td className="acl-member-name">{item.userName || "-"}</td>
                    <td>{item.userPhone || "-"}</td>
                    <td className="acl-pass-name">{item.passName || "-"}</td>
                    <td>{renderPassBadge(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── 삭제된 수업 ────────────────────────────────────────────────── */}
          {activeTab === 2 && (
            <table className="admin-classlist-table acl-table acl-deleted-table">
              <thead>
                <tr>
                  <th>수업일</th>
                  <th>강사</th>
                  <th>수업구분</th>
                  <th>수업</th>
                  <th>룸</th>
                  <th>예약 상태</th>
                  <th>회원</th>
                  <th>휴대폰번호</th>
                  <th>삭제 시간</th>
                  <th>삭제한 사람</th>
                  <th>삭제 이유</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="admin-classlist-empty">불러오는 중...</td></tr>
                ) : pageItems.length === 0 ? (
                  <tr><td colSpan={11} className="admin-classlist-empty">삭제된 수업이 없습니다.</td></tr>
                ) : pageItems.map((item, idx) => (
                  <tr key={`${item.id}-${idx}`} className={item._isFirst ? "acl-class-first-row" : "acl-class-cont-row"}>
                    <td className="nowrap">{item._isFirst ? formatClassDateTime(item.startAt, item.endAt) : ""}</td>
                    <td>{item._isFirst ? (item.instructorName || "-") : ""}</td>
                    <td>{item._isFirst ? classTypeLabel(item.classType) : ""}</td>
                    <td>{item._isFirst ? (item.title || item.classTitle || "-") : ""}</td>
                    <td>{item._isFirst ? (item.roomName || "-") : ""}</td>
                    <td>
                      {item._type === "booking" ? (
                        <span className={`acl-booking-status ${item.status}`}>
                          {bookingStatusLabel(item.status)}
                        </span>
                      ) : ""}
                    </td>
                    <td>{item._type === "booking" ? (item.userName || "-") : ""}</td>
                    <td>{item._type === "booking" ? (item.userPhone || "-") : ""}</td>
                    <td className="nowrap">{item._isFirst ? (item.updatedAt ? formatClassDateTime(item.updatedAt) : "-") : ""}</td>
                    <td>{item._isFirst ? "" : ""}</td>
                    <td>{item._isFirst ? "" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── 페이지네이션 ──────────────────────────────────────────────────── */}
        <div className="admin-classlist-pagination">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
            const start = Math.max(1, safePage - 5);
            return start + i;
          }).filter((p) => p <= totalPages).map((p) => (
            <button key={p} type="button" className={p === safePage ? "active" : ""} onClick={() => setPage(p)}>
              {p}
            </button>
          ))}
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
          <span className="admin-classlist-perpage">총 {displayRows.length}개</span>
        </div>

      </div>
    </AdminLayout>
  );
}

/**
 * 스튜디오 운영 전담 화면입니다.
 * 예약자 체크인, 미수금, 락커처럼 현장에서 자주 처리하는 업무를 한곳에 모읍니다.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout.jsx";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import {
  assignStudioLocker,
  cancelStudioCheckIn,
  checkInStudioMember,
  createStudioArrears,
  createStudioLocker,
  endStudioLockerAssignment,
  listAdminStudioArrears,
  listAdminStudioClassBookings,
  listAdminStudioClasses,
  listStudioClassCheckins,
  listStudioLockerAssignments,
  listStudioLockers,
  resolveStudioArrears,
  searchMembersForPicker,
  updateStudioLockerStatus,
} from "../../studio/api/studioApi.js";
import { DEFAULT_STUDIO_BRANCH_ID, STUDIO_BRANCHES } from "../../studio/constants/studioBranches.js";

const TABS = [
  { value: "checkin", label: "예약자·체크인" },
  { value: "arrears", label: "미수금" },
  { value: "locker", label: "락커" },
];

function toDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

export function AdminOperationsPage() {
  const navigate = useNavigate();
  const { currentUser } = useAppStore();
  const [activeTab, setActiveTab] = useState("checkin");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [busyKey, setBusyKey] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState(DEFAULT_STUDIO_BRANCH_ID);

  const [checkinDate, setCheckinDate] = useState(toDateKey());
  const [checkinSearch, setCheckinSearch] = useState("");
  const [checkinRows, setCheckinRows] = useState([]);
  const [checkinLoading, setCheckinLoading] = useState(false);

  const [arrearsRows, setArrearsRows] = useState([]);
  const [arrearsStatus, setArrearsStatus] = useState("open");
  const [arrearsSearch, setArrearsSearch] = useState("");
  const [arrearsLoading, setArrearsLoading] = useState(false);
  const [arrearsMemberQuery, setArrearsMemberQuery] = useState("");
  const [arrearsMembers, setArrearsMembers] = useState([]);
  const [arrearsMember, setArrearsMember] = useState(null);
  const [arrearsAmount, setArrearsAmount] = useState("");
  const [arrearsReason, setArrearsReason] = useState("");
  const [arrearsDueDate, setArrearsDueDate] = useState("");

  const [lockers, setLockers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [lockerSearch, setLockerSearch] = useState("");
  const [lockerStatus, setLockerStatus] = useState("");
  const [lockerNo, setLockerNo] = useState("");
  const [lockerLocation, setLockerLocation] = useState("");
  const [assignLockerId, setAssignLockerId] = useState("");
  const [lockerMemberQuery, setLockerMemberQuery] = useState("");
  const [lockerMembers, setLockerMembers] = useState([]);
  const [lockerMember, setLockerMember] = useState(null);
  const [lockerEndDate, setLockerEndDate] = useState("");
  const [lockerLoading, setLockerLoading] = useState(false);

  const currentUserName = getUserDisplayName(currentUser);

  const loadCheckins = useCallback(async () => {
    setCheckinLoading(true);
    try {
      const classes = await listAdminStudioClasses({
        from: `${checkinDate} 00:00:00`,
        to: `${checkinDate} 23:59:59`,
        branchId: selectedBranchId,
      });
      const groups = await Promise.all(classes.map(async (classItem) => {
        const [bookings, checkins] = await Promise.all([
          listAdminStudioClassBookings(classItem.id),
          listStudioClassCheckins(classItem.id),
        ]);
        const checkedInByUser = new Map(
          checkins.filter((item) => item.status === "checked_in").map((item) => [String(item.userId), item])
        );
        return bookings.map((booking) => ({
          ...booking,
          classId: classItem.id,
          classTitle: classItem.title,
          branchName: classItem.branchName,
          instructorName: classItem.instructorName,
          startAt: classItem.startAt,
          checkin: checkedInByUser.get(String(booking.userId)) || null,
        }));
      }));
      setCheckinRows(groups.flat());
      setMessage({ type: "", text: "" });
    } catch (error) {
      setCheckinRows([]);
      setMessage({ type: "error", text: error.message || "예약자 목록을 불러오지 못했습니다." });
    } finally {
      setCheckinLoading(false);
    }
  }, [checkinDate, selectedBranchId]);

  const loadArrears = useCallback(async () => {
    setArrearsLoading(true);
    try {
      setArrearsRows(await listAdminStudioArrears({ status: arrearsStatus }));
    } catch (error) {
      setArrearsRows([]);
      setMessage({ type: "error", text: error.message || "미수금 목록을 불러오지 못했습니다." });
    } finally {
      setArrearsLoading(false);
    }
  }, [arrearsStatus]);

  const loadLockers = useCallback(async () => {
    setLockerLoading(true);
    try {
      const [lockerRows, assignmentRows] = await Promise.all([
        listStudioLockers(),
        listStudioLockerAssignments({ status: "active" }),
      ]);
      setLockers(lockerRows);
      setAssignments(assignmentRows);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "락커 정보를 불러오지 못했습니다." });
    } finally {
      setLockerLoading(false);
    }
  }, []);

  useEffect(() => { loadCheckins(); }, [loadCheckins]);
  useEffect(() => { loadArrears(); }, [loadArrears]);
  useEffect(() => { loadLockers(); }, [loadLockers]);

  useEffect(() => {
    if (arrearsMember || arrearsMemberQuery.trim().length < 1) {
      setArrearsMembers([]);
      return;
    }
    const timer = setTimeout(() => {
      searchMembersForPicker(arrearsMemberQuery, 8).then(setArrearsMembers).catch(() => setArrearsMembers([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [arrearsMember, arrearsMemberQuery]);

  useEffect(() => {
    if (lockerMember || lockerMemberQuery.trim().length < 1) {
      setLockerMembers([]);
      return;
    }
    const timer = setTimeout(() => {
      searchMembersForPicker(lockerMemberQuery, 8).then(setLockerMembers).catch(() => setLockerMembers([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [lockerMember, lockerMemberQuery]);

  const filteredCheckins = useMemo(() => {
    const query = checkinSearch.trim().toLowerCase();
    if (!query) return checkinRows;
    return checkinRows.filter((row) => [row.classTitle, row.name, row.phone, row.instructorName]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }, [checkinRows, checkinSearch]);

  const filteredArrears = useMemo(() => {
    const query = arrearsSearch.trim().toLowerCase();
    if (!query) return arrearsRows;
    return arrearsRows.filter((row) => [row.name, row.phone, row.reason]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }, [arrearsRows, arrearsSearch]);

  const filteredLockers = useMemo(() => {
    const query = lockerSearch.trim().toLowerCase();
    return lockers.filter((locker) => {
      if (lockerStatus && locker.status !== lockerStatus) return false;
      if (!query) return true;
      const assignment = assignments.find((item) => item.lockerId === locker.id);
      return [locker.lockerNo, locker.location, assignment?.userName, assignment?.userPhone]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [assignments, lockerSearch, lockerStatus, lockers]);

  async function toggleCheckin(row) {
    const key = `checkin-${row.id}`;
    setBusyKey(key);
    try {
      if (row.checkin?.id) await cancelStudioCheckIn(row.checkin.id);
      else await checkInStudioMember({ classId: row.classId, userId: row.userId, bookingId: row.id, status: "checked_in" });
      await loadCheckins();
      setMessage({ type: "success", text: row.checkin ? "체크인을 취소했습니다." : "체크인을 완료했습니다." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "체크인 처리에 실패했습니다." });
    } finally {
      setBusyKey("");
    }
  }

  async function submitArrears(event) {
    event.preventDefault();
    if (!arrearsMember?.id) return setMessage({ type: "error", text: "미수금을 등록할 회원을 선택해 주세요." });
    if (!(Number(arrearsAmount) > 0)) return setMessage({ type: "error", text: "미수금 금액은 1원 이상이어야 합니다." });
    if (!arrearsReason.trim()) return setMessage({ type: "error", text: "미수금 사유를 입력해 주세요." });
    setBusyKey("arrears-create");
    try {
      await createStudioArrears({ userId: arrearsMember.id, amount: Number(arrearsAmount), reason: arrearsReason.trim(), dueDate: arrearsDueDate || null });
      setArrearsMember(null);
      setArrearsMemberQuery("");
      setArrearsAmount("");
      setArrearsReason("");
      setArrearsDueDate("");
      await loadArrears();
      setMessage({ type: "success", text: "미수금을 등록했습니다." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "미수금 등록에 실패했습니다." });
    } finally {
      setBusyKey("");
    }
  }

  async function createLocker(event) {
    event.preventDefault();
    if (!lockerNo.trim()) return setMessage({ type: "error", text: "락커 번호를 입력해 주세요." });
    setBusyKey("locker-create");
    try {
      await createStudioLocker({ lockerNo: lockerNo.trim(), location: lockerLocation.trim() });
      setLockerNo("");
      setLockerLocation("");
      await loadLockers();
      setMessage({ type: "success", text: "락커를 생성했습니다." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "락커 생성에 실패했습니다." });
    } finally {
      setBusyKey("");
    }
  }

  async function assignLocker(event) {
    event.preventDefault();
    if (!assignLockerId || !lockerMember?.id) return setMessage({ type: "error", text: "락커와 회원을 모두 선택해 주세요." });
    setBusyKey("locker-assign");
    try {
      await assignStudioLocker({ lockerId: assignLockerId, userId: lockerMember.id, startDate: toDateKey(), endDate: lockerEndDate || null });
      setAssignLockerId("");
      setLockerMember(null);
      setLockerMemberQuery("");
      setLockerEndDate("");
      await loadLockers();
      setMessage({ type: "success", text: "락커를 배정했습니다." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "락커 배정에 실패했습니다." });
    } finally {
      setBusyKey("");
    }
  }

  function renderMemberPicker(query, setQuery, selected, setSelected, candidates) {
    return (
      <div className="admin-operations-member-picker">
        <input
          type="search"
          value={selected ? `${selected.name || "회원"} · ${selected.phone || "-"}` : query}
          placeholder="이름 또는 전화번호 검색"
          onChange={(event) => { setSelected(null); setQuery(event.target.value); }}
        />
        {candidates.length ? (
          <div className="admin-operations-suggestions">
            {candidates.map((member) => (
              <button key={member.id} type="button" onClick={() => { setSelected(member); setQuery(""); }}>
                <strong>{member.name || "이름 없음"}</strong><span>{member.phone || "전화번호 없음"}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <AdminLayout appClass="admin-classlist-app admin-operations-app" userName={currentUserName}>

      <main className="admin-operations-body">
        <div className="admin-operations-heading">
          {/* 페이지 제목은 상단바가 유일한 H1으로 표시하므로 본문에서 반복하지 않습니다. */}
          <div><p>체크인, 미수금, 락커 업무를 빠르게 처리합니다.</p></div>
          {message.text ? <p className={`admin-operations-message ${message.type}`}>{message.text}</p> : null}
        </div>
        <div className="admin-operations-tabs" role="tablist" aria-label="운영 관리 메뉴">
          {TABS.map((tab) => (
            <button key={tab.value} type="button" className={activeTab === tab.value ? "active" : ""} onClick={() => setActiveTab(tab.value)}>{tab.label}</button>
          ))}
        </div>

        {activeTab === "checkin" ? (
          <section className="admin-operations-section">
            <div className="admin-schedule-category-tabs admin-operations-branch-tabs" role="tablist" aria-label="체크인 지점 선택">
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
            <div className="admin-operations-toolbar">
              <input type="date" aria-label="체크인 기준 날짜" value={checkinDate} onChange={(event) => setCheckinDate(event.target.value)} />
              <input type="search" value={checkinSearch} onChange={(event) => setCheckinSearch(event.target.value)} placeholder="수업, 회원, 전화번호 검색" />
              <button type="button" onClick={loadCheckins}>새로고침</button>
            </div>
            <div className="admin-operations-table-wrap">
              <table className="admin-operations-table">
                <thead><tr><th>지점</th><th>수업시간</th><th>수업</th><th>회원</th><th>연락처</th><th>예약상태</th><th>체크인</th></tr></thead>
                <tbody>
                  {filteredCheckins.map((row) => (
                    <tr key={`${row.classId}-${row.id}`}>
                      <td data-label="지점">{row.branchName || "장덕점"}</td>
                      <td data-label="수업시간">{formatDateTime(row.startAt)}</td>
                      <td data-label="수업"><strong>{row.classTitle}</strong><small>{row.instructorName || "강사 미정"}</small></td>
                      <td data-label="회원">{row.name || "-"}</td>
                      <td data-label="연락처">{row.phone || "-"}</td>
                      <td data-label="예약상태">{row.status === "waitlisted" ? "대기" : row.status === "cancelled" ? "취소" : "예약 확정"}</td>
                      <td data-label="체크인"><button type="button" className={row.checkin ? "danger" : "primary"} disabled={busyKey === `checkin-${row.id}` || row.status !== "reserved"} onClick={() => toggleCheckin(row)}>{row.checkin ? "체크인 취소" : "체크인"}</button></td>
                    </tr>
                  ))}
                  {!checkinLoading && !filteredCheckins.length ? <tr><td colSpan="7" className="empty">해당 날짜의 예약자가 없습니다.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "arrears" ? (
          <section className="admin-operations-section">
            <form className="admin-operations-form" onSubmit={submitArrears}>
              {renderMemberPicker(arrearsMemberQuery, setArrearsMemberQuery, arrearsMember, setArrearsMember, arrearsMembers)}
              <input type="number" min="1" value={arrearsAmount} onChange={(event) => setArrearsAmount(event.target.value)} placeholder="미수금 금액" />
              <input value={arrearsReason} onChange={(event) => setArrearsReason(event.target.value)} placeholder="미수금 사유" />
              <input type="date" value={arrearsDueDate} onChange={(event) => setArrearsDueDate(event.target.value)} aria-label="납부 예정일" />
              <button type="submit" className="primary" disabled={busyKey === "arrears-create"}>미수금 등록</button>
            </form>
            <div className="admin-operations-toolbar">
              <select aria-label="미수금 상태 필터" value={arrearsStatus} onChange={(event) => setArrearsStatus(event.target.value)}><option value="open">미결제</option><option value="resolved">완납</option><option value="">전체</option></select>
              <input type="search" value={arrearsSearch} onChange={(event) => setArrearsSearch(event.target.value)} placeholder="회원, 전화번호, 사유 검색" />
            </div>
            <div className="admin-operations-table-wrap">
              <table className="admin-operations-table">
                <thead><tr><th>회원</th><th>연락처</th><th>금액</th><th>사유</th><th>납부 예정일</th><th>상태</th></tr></thead>
                <tbody>
                  {filteredArrears.map((row) => <tr key={row.id}><td data-label="회원">{row.name || "-"}</td><td data-label="연락처">{row.phone || "-"}</td><td data-label="금액"><strong>{formatCurrency(row.amount)}</strong></td><td data-label="사유">{row.reason || "-"}</td><td data-label="납부 예정일">{row.dueDate ? String(row.dueDate).slice(0, 10) : "-"}</td><td data-label="상태">{row.status === "open" ? <button type="button" className="primary" disabled={busyKey === row.id} onClick={async () => { setBusyKey(row.id); try { await resolveStudioArrears(row.id); await loadArrears(); } finally { setBusyKey(""); } }}>완납 처리</button> : "완납"}</td></tr>)}
                  {!arrearsLoading && !filteredArrears.length ? <tr><td colSpan="6" className="empty">조건에 맞는 미수금 내역이 없습니다.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "locker" ? (
          <section className="admin-operations-section">
            <div className="admin-operations-form-grid">
              <form className="admin-operations-form" onSubmit={createLocker}><input value={lockerNo} onChange={(event) => setLockerNo(event.target.value)} placeholder="락커 번호" /><input value={lockerLocation} onChange={(event) => setLockerLocation(event.target.value)} placeholder="위치" /><button type="submit" className="primary" disabled={busyKey === "locker-create"}>락커 생성</button></form>
              <form className="admin-operations-form" onSubmit={assignLocker}>
                <select aria-label="배정할 락커 선택" value={assignLockerId} onChange={(event) => setAssignLockerId(event.target.value)}><option value="">배정할 락커</option>{lockers.filter((item) => item.status === "available").map((item) => <option key={item.id} value={item.id}>{item.lockerNo} · {item.location || "위치 미지정"}</option>)}</select>
                {renderMemberPicker(lockerMemberQuery, setLockerMemberQuery, lockerMember, setLockerMember, lockerMembers)}
                <input type="date" value={lockerEndDate} onChange={(event) => setLockerEndDate(event.target.value)} aria-label="락커 만료일" />
                <button type="submit" className="primary" disabled={busyKey === "locker-assign"}>락커 배정</button>
              </form>
            </div>
            <div className="admin-operations-toolbar"><select aria-label="락커 상태 필터" value={lockerStatus} onChange={(event) => setLockerStatus(event.target.value)}><option value="">전체 상태</option><option value="available">사용 가능</option><option value="occupied">사용 중</option><option value="maintenance">점검 중</option></select><input type="search" value={lockerSearch} onChange={(event) => setLockerSearch(event.target.value)} placeholder="락커, 위치, 회원 검색" /></div>
            <div className="admin-operations-locker-grid">
              {filteredLockers.map((locker) => {
                const assignment = assignments.find((item) => item.lockerId === locker.id);
                return <article key={locker.id} className={`admin-operations-locker ${locker.status}`}><div><strong>{locker.lockerNo}</strong><span>{locker.location || "위치 미지정"}</span></div><p>{assignment ? `${assignment.userName || assignment.userId} · ${assignment.userPhone || "-"}` : locker.status === "maintenance" ? "점검 중" : "비어 있음"}</p><div className="admin-operations-locker-actions">{assignment ? <button type="button" className="danger" onClick={async () => { await endStudioLockerAssignment(assignment.id); await loadLockers(); }}>배정 종료</button> : <button type="button" onClick={async () => { await updateStudioLockerStatus(locker.id, locker.status === "maintenance" ? "available" : "maintenance"); await loadLockers(); }}>{locker.status === "maintenance" ? "사용 가능" : "점검 전환"}</button>}</div></article>;
              })}
              {!lockerLoading && !filteredLockers.length ? <p className="admin-operations-empty">조건에 맞는 락커가 없습니다.</p> : null}
            </div>
          </section>
        ) : null}
      </main>
    </AdminLayout>
  );
}

/**
 * [관리자 회원 목록 페이지]
 *
 * 스튜디오메이트 목록형 UI에 맞춰 통합 회원을 간결하게 표시합니다.
 * 세부 구분은 상단 탭과 필터로 확인합니다.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../../../shared/api/client.js";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { formatUserGradeLabel } from "../../../shared/auth/userRoles.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import {
  createAdminMemberMemo,
  createAdminPass,
  createStudioNotification,
  listAdminMemberMemos,
  listAdminPassesByUser,
  pauseAdminPass,
  requestStudioPassRefund,
  transferAdminPass,
  updateAdminPassStatus,
} from "../../studio/api/studioApi.js";

const NAV_ITEMS = [
  { label: "일정", path: "/admin" },
  { label: "수업", path: "/admin/classes" },
  { label: "회원", path: "/admin/member-list", active: true },
  { label: "강사", path: "/admin/instructors" },
  { label: "수강권", path: "/admin/products" },
  { label: "설정", path: "/admin/members" },
  { label: "매출", path: "/admin/sales" },
];

const PAGE_SIZE = 10;

const MEMBER_COLUMNS = [
  "이름",
  "전화번호",
  "등록일",
  "최근출석일",
  "수강권",
  "상품",
  "앱연결",
];

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10).replace(/-/g, ". ") + ".";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatCount(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value || 0).toLocaleString();
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "-";
  return `₩${Number(value || 0).toLocaleString()}`;
}

function calcDaysLeft(expiresAt) {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

function calcDaysSinceVisit(lastVisitAt) {
  if (!lastVisitAt) return null;
  return Math.floor((Date.now() - new Date(lastVisitAt).getTime()) / 86400000);
}

function isAdminAccount(member) {
  const grade = String(member?.userGrade || "").toLowerCase();
  return grade === "admin0" || grade === "admin1";
}

function hasStudioEvidence(member) {
  const status = String(member?.studioMemberStatus || "").toLowerCase();
  if (status === "archived") return false;
  return (
    ["active", "inactive", "expired"].includes(status) ||
    (Array.isArray(member?.passes) && member.passes.length > 0) ||
    Boolean(member?.lastVisitAt) ||
    Number(member?.totalArrears || 0) > 0
  );
}

function hasEducationEvidence(member) {
  return Number(member?.orderCount || 0) > 0;
}

function getUsageScope(member) {
  const studio = hasStudioEvidence(member);
  const education = hasEducationEvidence(member);
  if (studio && education) return "both";
  if (studio) return "studio";
  if (education) return "education";
  return "registered";
}

function isStudioManagedMember(member) {
  const scope = getUsageScope(member);
  return scope === "studio" || scope === "both";
}

function getUsageScopeLabel(member) {
  const scope = getUsageScope(member);
  if (scope === "both") return "통합이용";
  if (scope === "studio") return "스튜디오회원";
  return "";
}

function getStudioMemberStatusLabel(value) {
  const status = String(value || "").toLowerCase();
  if (status === "active") return "관리 대상";
  if (status === "inactive") return "수강권 없음/휴면";
  if (status === "expired") return "수강권 만료";
  if (status === "archived") return "관리 제외";
  return "미지정";
}

function getPassTypeLabel(value) {
  const type = String(value || "").toLowerCase();
  if (type === "personal") return "프라이빗";
  if (type === "duet") return "듀엣";
  if (type === "group") return "그룹";
  return value || "-";
}

function getPassStatusLabel(pass) {
  if (!pass) return "-";
  const status = String(pass.status || "").toLowerCase();
  if (status === "paused") return "정지";
  if (status === "transferred") return "양도";
  if (status === "refunded") return "환불";
  const daysLeft = calcDaysLeft(pass.expiresAt);
  if (daysLeft !== null && daysLeft < 0) return "이용만료";
  if (daysLeft !== null) return `사용중 (${daysLeft}일 남음)`;
  return "사용중";
}

function getPrimaryPass(member) {
  const passes = Array.isArray(member?.passes) ? member.passes : [];
  if (!passes.length) return null;
  const active = passes.find((pass) => getPassStatusLabel(pass).startsWith("사용중"));
  return active || passes[0];
}

function getPassSummary(member) {
  const passes = Array.isArray(member?.passes) ? member.passes : [];
  const pass = getPrimaryPass(member);
  if (!pass) return "수강권 없음";
  const extraCount = Math.max(0, passes.length - 1);
  const expires = pass.expiresAt ? ` · 만료 ${formatDate(pass.expiresAt)}` : "";
  const extra = extraCount > 0 ? ` 외 ${extraCount}개` : "";
  return `${pass.passName || "수강권"}${extra} · 잔여 ${formatCount(pass.remainingCount)}회${expires}`;
}

function getProductSummary(member) {
  const orderCount = Number(member?.orderCount || 0);
  if (orderCount <= 0) return "-";
  return `구매 ${orderCount.toLocaleString()}건`;
}

function getMemberStatus(member) {
  if (Number(member.totalArrears || 0) > 0) return "미결제";
  const passes = Array.isArray(member.passes) ? member.passes : [];
  if (!passes.length) return "수강권 없음";
  return passes.some((pass) => getPassStatusLabel(pass).startsWith("사용중")) ? "이용" : "만료";
}

function isCurrentPass(pass) {
  return getPassStatusLabel(pass).startsWith("사용중");
}

function toCsvCell(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function FilterDropdown({ label, active, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="filter-dropdown" ref={ref}>
      <button
        type="button"
        className={`filter-dropdown-btn${active ? " has-filter" : ""}`}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <span className="filter-dropdown-arrow">{open ? "▲" : "▼"}</span>
      </button>
      {open ? <div className="filter-dropdown-panel">{children(setOpen)}</div> : null}
    </div>
  );
}

function ListDropdown({ label, active, options, value, onChange }) {
  return (
    <FilterDropdown label={label} active={active}>
      {(close) => (
        <ul className="filter-list-panel">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                className={value === option.value ? "selected" : ""}
                onClick={() => {
                  onChange(option.value);
                  close(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </FilterDropdown>
  );
}

function NumericDropdown({ label, unit, mode = "이상", value, onChange }) {
  const [tempMode, setTempMode] = useState(value ? "custom" : "all");
  const [tempNum, setTempNum] = useState(value || "5");
  const active = Boolean(value);

  return (
    <FilterDropdown label={active ? `${label} ${value}${unit} ${mode}` : `${label} 전체`} active={active}>
      {(close) => (
        <div className="filter-numeric-panel">
          <label className="filter-radio-row">
            <input type="radio" checked={tempMode === "all"} onChange={() => setTempMode("all")} />
            <span>{label} 전체</span>
          </label>
          <label className="filter-radio-row">
            <input type="radio" checked={tempMode === "custom"} onChange={() => setTempMode("custom")} />
            <span>{label}</span>
            <div className="filter-numeric-input">
              <button type="button" onClick={() => setTempNum((number) => String(Math.max(1, Number(number) - 1)))}>
                -
              </button>
              <input
                type="number"
                min="1"
                value={tempNum}
                onChange={(event) => setTempNum(event.target.value)}
                onClick={() => setTempMode("custom")}
              />
              <button type="button" onClick={() => setTempNum((number) => String(Number(number) + 1))}>
                +
              </button>
            </div>
            <span>{unit} {mode}</span>
          </label>
          <div className="filter-numeric-actions">
            <button type="button" onClick={() => { onChange(""); close(false); }}>취소</button>
            <button
              type="button"
              className="apply"
              onClick={() => {
                onChange(tempMode === "all" ? "" : tempNum);
                close(false);
              }}
            >
              적용
            </button>
          </div>
        </div>
      )}
    </FilterDropdown>
  );
}

function buildMemberPassRows(members) {
  return members.map((member) => ({
    member,
    pass: getPrimaryPass(member),
    rowId: String(member.id),
  }));
}

function getRowSearchText(row) {
  const { member, pass } = row;
  return [
    member.name,
    member.loginId,
    member.phone,
    member.email,
    member.latestMemo?.memo,
    pass?.passName,
    pass?.passType,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function AdminMemberListPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterUsageScope, setFilterUsageScope] = useState("studioManaged");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterPass, setFilterPass] = useState("");
  const [filterNoVisit, setFilterNoVisit] = useState("");
  const [filterDaysLeft, setFilterDaysLeft] = useState("");
  const [filterCountLeft, setFilterCountLeft] = useState("");
  const [searchType, setSearchType] = useState("이름/전화");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [memoDrafts, setMemoDrafts] = useState({});
  const [savingMemoUserId, setSavingMemoUserId] = useState("");
  const [memoMessage, setMemoMessage] = useState("");
  const [memberSettingsOpen, setMemberSettingsOpen] = useState(false);
  const [notificationDraft, setNotificationDraft] = useState({
    open: false,
    title: "이끌림 필라테스 안내",
    message: "",
    targetMembers: [],
  });
  const [sendingNotification, setSendingNotification] = useState(false);
  const [detailMemberId, setDetailMemberId] = useState("");
  const [detailPasses, setDetailPasses] = useState([]);
  const [detailMemos, setDetailMemos] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingStudioStatusUserId, setSavingStudioStatusUserId] = useState("");
  const [detailTab, setDetailTab] = useState("basic");
  const [showPreviousPasses, setShowPreviousPasses] = useState(false);
  const [showCreatePassForm, setShowCreatePassForm] = useState(false);
  const [creatingPass, setCreatingPass] = useState(false);
  const [passAction, setPassAction] = useState(null);
  const [passActionDraft, setPassActionDraft] = useState({
    startDate: "",
    endDate: "",
    toUserId: "",
    transferCount: "",
    refundAmount: "",
    reason: "",
  });
  const [transferSearchQuery, setTransferSearchQuery] = useState("");
  const [editingMember, setEditingMember] = useState(false);
  const [savingMemberProfile, setSavingMemberProfile] = useState(false);
  const [editDraft, setEditDraft] = useState({
    name: "",
    phone: "",
    appConnectionStatus: "not_connected",
    studioMemberStatus: "active",
    gender: "",
    birthDate: "",
    address: "",
    addressDetail: "",
    primaryInstructor: "",
  });
  const [passDraft, setPassDraft] = useState({
    passName: "",
    passType: "group",
    totalCount: "10",
    remainingCount: "10",
    expiresAt: "",
    amount: "",
    paymentMethod: "card",
    installmentMonths: "",
    paymentNote: "",
  });

  async function loadMembers() {
    try {
      setLoading(true);
      const result = await apiRequest("/admin/members");
      setMembers(Array.isArray(result?.members) ? result.members : []);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  const managedMembers = useMemo(
    () => members.filter((member) => !isAdminAccount(member)),
    [members]
  );

  const statusCounts = useMemo(() => {
    const counts = { 전체: managedMembers.length, 이용: 0, 만료: 0, 미결제: 0, "수강권 없음": 0 };
    managedMembers.forEach((member) => {
      const status = getMemberStatus(member);
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [managedMembers]);

  const usageScopeCounts = useMemo(() => {
    return managedMembers.reduce(
      (acc, member) => {
        const scope = getUsageScope(member);
        acc.all += 1;
        acc[scope] = (acc[scope] || 0) + 1;
        return acc;
      },
      { all: 0, registered: 0, education: 0, studio: 0, both: 0 }
    );
  }, [managedMembers]);

  const passNames = useMemo(() => {
    const names = new Set();
    managedMembers.forEach((member) => (member.passes || []).forEach((pass) => names.add(pass.passName)));
    return [...names].filter(Boolean).sort();
  }, [managedMembers]);

  const filteredMembers = useMemo(() => {
    return managedMembers.filter((member) => {
      if (filterStatus && getMemberStatus(member) !== filterStatus) return false;
      if (filterUsageScope === "studioManaged" && !isStudioManagedMember(member)) return false;
      if (filterUsageScope && filterUsageScope !== "studioManaged" && getUsageScope(member) !== filterUsageScope) return false;
      if (filterGrade && member.userGrade !== filterGrade) return false;
      if (filterPass) {
        if (filterPass === "그룹" || filterPass === "프라이빗") {
          const type = filterPass === "그룹" ? "group" : "personal";
          if (!(member.passes || []).some((pass) => pass.passName?.includes(filterPass) || pass.passType?.includes(type))) return false;
        } else if (!(member.passes || []).some((pass) => pass.passName?.includes(filterPass))) {
          return false;
        }
      }
      if (filterNoVisit) {
        const days = calcDaysSinceVisit(member.lastVisitAt);
        if (days === null || days < Number(filterNoVisit)) return false;
      }
      if (filterDaysLeft) {
        const ok = (member.passes || []).some((pass) => {
          const left = calcDaysLeft(pass.expiresAt);
          return left !== null && left <= Number(filterDaysLeft);
        });
        if (!ok) return false;
      }
      if (filterCountLeft) {
        if (!(member.passes || []).some((pass) => Number(pass.remainingCount || 0) <= Number(filterCountLeft))) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const memberRows = buildMemberPassRows([member]);
        if (!memberRows.some((row) => getRowSearchText(row).includes(query))) return false;
      }
      return true;
    });
  }, [managedMembers, filterStatus, filterUsageScope, filterGrade, filterPass, filterNoVisit, filterDaysLeft, filterCountLeft, searchQuery]);

  const filteredRows = useMemo(() => buildMemberPassRows(filteredMembers), [filteredMembers]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const allChecked = pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.member.id));

  function toggleAll() {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allChecked) pageRows.forEach((row) => next.delete(row.member.id));
      else pageRows.forEach((row) => next.add(row.member.id));
      return next;
    });
  }

  function toggleOne(id) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

function resetFilters() {
    setFilterStatus("");
    setFilterUsageScope("studioManaged");
    setFilterGrade("");
    setFilterPass("");
    setFilterNoVisit("");
    setFilterDaysLeft("");
    setFilterCountLeft("");
    setSearchQuery("");
    setSelectedIds(new Set());
    setPage(1);
  }

  async function handleSaveMemo(member) {
    const memo = String(memoDrafts[member.id] || "").trim();
    if (!memo) {
      setMemoMessage("메모 내용을 입력해 주세요.");
      return;
    }
    try {
      setSavingMemoUserId(member.id);
      setMemoMessage("");
      await createAdminMemberMemo({ userId: member.id, memo });
      setMembers((previous) =>
        previous.map((item) =>
          item.id === member.id
            ? { ...item, latestMemo: { memo, createdAt: new Date().toISOString() } }
            : item
        )
      );
      setMemoDrafts((previous) => ({ ...previous, [member.id]: "" }));
      setMemoMessage("메모가 저장되었습니다.");
    } catch (error) {
      setMemoMessage(error.message || "메모 저장에 실패했습니다.");
    } finally {
      setSavingMemoUserId("");
    }
  }

  async function openMemberDetail(member) {
    if (!member?.id) return;
    if (detailMemberId === member.id) {
      setDetailMemberId("");
      setDetailPasses([]);
      setDetailMemos([]);
      return;
    }
    setDetailMemberId(member.id);
    setDetailTab("basic");
    setShowPreviousPasses(false);
    setShowCreatePassForm(false);
    setEditingMember(false);
    setDetailLoading(true);
    try {
      const [passes, memos] = await Promise.all([
        listAdminPassesByUser(member.id).catch(() => member.passes || []),
        listAdminMemberMemos(member.id).catch(() => []),
      ]);
      setDetailPasses(Array.isArray(passes) ? passes : []);
      setDetailMemos(Array.isArray(memos) ? memos : []);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleTopSearchChange(value) {
    setSearchQuery(value);
    setFilterUsageScope("");
    setPage(1);
  }

  function handleTopSearchKeyDown(event) {
    if (event.key !== "Enter") return;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;
    const normalizedDigits = query.replace(/\D/g, "");
    const matched = managedMembers.find((member) => {
      const phoneDigits = String(member.phone || "").replace(/\D/g, "");
      return (
        String(member.name || "").toLowerCase().includes(query) ||
        String(member.loginId || "").toLowerCase().includes(query) ||
        String(member.phone || "").toLowerCase().includes(query) ||
        (normalizedDigits && phoneDigits.includes(normalizedDigits))
      );
    });
    if (matched) openMemberDetail(matched);
  }

  async function handleSaveDetailMemo(member) {
    await handleSaveMemo(member);
    const memos = await listAdminMemberMemos(member.id).catch(() => []);
    setDetailMemos(Array.isArray(memos) ? memos : []);
  }

  function startEditMember(member) {
    if (!member) return;
    setEditingMember(true);
    setEditDraft({
      name: member.name || "",
      phone: member.phone || "",
      appConnectionStatus: member.appConnectionStatus || "not_connected",
      studioMemberStatus: member.studioMemberStatus || "active",
      gender: member.gender || "",
      birthDate: member.birthDate ? String(member.birthDate).slice(0, 10) : "",
      address: member.address || "",
      addressDetail: member.addressDetail || "",
      primaryInstructor: member.primaryInstructor || "",
    });
  }

  async function handleSaveMemberProfile(member) {
    if (!member?.id) return;
    if (!String(editDraft.name || "").trim()) {
      setMemoMessage("회원 이름을 입력해 주세요.");
      return;
    }
    try {
      setSavingMemberProfile(true);
      const result = await apiRequest(`/admin/members/${encodeURIComponent(String(member.id))}/studio-profile`, {
        method: "PUT",
        body: editDraft,
      });
      const profile = result?.profile || {};
      setMembers((previous) =>
        previous.map((item) =>
          item.id === member.id
            ? {
                ...item,
                name: profile.name ?? item.name,
                phone: profile.phone ?? item.phone,
                appConnectionStatus: profile.appConnectionStatus ?? item.appConnectionStatus,
                studioMemberStatus: profile.studioMemberStatus ?? item.studioMemberStatus,
                gender: profile.gender ?? "",
                birthDate: profile.birthDate ?? "",
                address: profile.address ?? "",
                addressDetail: profile.addressDetail ?? "",
                primaryInstructor: profile.primaryInstructor ?? "",
                studioRegisteredAt: item.studioRegisteredAt || item.createdAt,
              }
            : item
        )
      );
      setEditingMember(false);
      setMemoMessage("회원정보가 수정되었습니다.");
    } catch (error) {
      setMemoMessage(error.message || "회원정보 수정에 실패했습니다.");
    } finally {
      setSavingMemberProfile(false);
    }
  }

  function sendManualNotification(targetMembers, defaultTitle = "이끌림 필라테스 안내") {
    const targets = Array.isArray(targetMembers) ? targetMembers.filter(Boolean) : [];
    if (!targets.length) {
      setMemoMessage("알림을 보낼 회원이 없습니다.");
      return;
    }
    setNotificationDraft({
      open: true,
      title: defaultTitle,
      message: "",
      targetMembers: targets,
    });
  }

  async function submitManualNotification(event) {
    event.preventDefault();
    const targets = notificationDraft.targetMembers.filter(Boolean);
    const message = notificationDraft.message.trim();
    if (!targets.length) {
      setMemoMessage("알림을 보낼 회원이 없습니다.");
      return;
    }
    if (!message) {
      setMemoMessage("알림 내용을 입력해 주세요.");
      return;
    }
    try {
      setSendingNotification(true);
      await Promise.all(
        targets.map((member) =>
          createStudioNotification({
            userId: member.id,
            type: "manual",
            title: notificationDraft.title.trim() || "이끌림 필라테스 안내",
            message,
            status: "pending",
          })
        )
      );
      setMemoMessage(`${targets.length}명에게 알림 기록을 저장했습니다. 문자 API 발송은 외부 연동 시 연결됩니다.`);
      setNotificationDraft({ open: false, title: "이끌림 필라테스 안내", message: "", targetMembers: [] });
    } catch (error) {
      setMemoMessage(error.message || "알림 저장에 실패했습니다.");
    } finally {
      setSendingNotification(false);
    }
  }

  function handleBulkBooking(member) {
    if (!member?.id) return;
    setMemoMessage("일괄예약은 일정 화면에서 수업 선택 후 예약자 목록으로 처리합니다.");
    navigate(`/admin/classes?memberId=${encodeURIComponent(String(member.id))}`);
  }

  async function handleChangeStudioStatus(member, nextStatus) {
    if (!member?.id || !nextStatus) return;
    try {
      setSavingStudioStatusUserId(member.id);
      const result = await apiRequest(`/admin/members/${encodeURIComponent(String(member.id))}/studio-status`, {
        method: "PATCH",
        body: { memberStatus: nextStatus },
      });
      const profile = result?.profile || {};
      setMembers((previous) =>
        previous.map((item) =>
          item.id === member.id
            ? {
                ...item,
                studioMemberStatus: profile.studioMemberStatus || nextStatus,
                appConnectionStatus: profile.appConnectionStatus || item.appConnectionStatus,
                studioRegisteredAt: profile.studioRegisteredAt || item.studioRegisteredAt || item.createdAt,
              }
            : item
        )
      );
      setMemoMessage(`스튜디오 상태가 ${getStudioMemberStatusLabel(nextStatus)}(으)로 변경되었습니다.`);
    } catch (error) {
      setMemoMessage(error.message || "스튜디오 상태 변경에 실패했습니다.");
    } finally {
      setSavingStudioStatusUserId("");
    }
  }

  async function handleCreatePass(member) {
    if (!member?.id) return;
    const passName = String(passDraft.passName || "").trim();
    const totalCount = Math.max(0, Number(passDraft.totalCount || 0));
    const remainingCount = Math.max(0, Number(passDraft.remainingCount || passDraft.totalCount || 0));
    if (!passName) {
      setMemoMessage("수강권명을 입력해 주세요.");
      return;
    }
    if (totalCount <= 0) {
      setMemoMessage("전체횟수는 1회 이상 입력해 주세요.");
      return;
    }
    try {
      setCreatingPass(true);
      const created = await createAdminPass({
        userId: member.id,
        passName,
        passType: passDraft.passType,
        totalCount,
        remainingCount,
        expiresAt: passDraft.expiresAt || null,
        amount: Math.max(0, Number(passDraft.amount || 0)),
        paymentMethod: passDraft.paymentMethod,
        installmentMonths: passDraft.installmentMonths,
        paymentNote: passDraft.paymentNote,
      });
      const nextPasses = [created, ...detailPasses];
      setDetailPasses(nextPasses);
      setMembers((previous) =>
        previous.map((item) =>
          item.id === member.id
            ? { ...item, passes: nextPasses, studioMemberStatus: item.studioMemberStatus || "active" }
            : item
        )
      );
      setPassDraft({
        passName: "",
        passType: "group",
        totalCount: "10",
        remainingCount: "10",
        expiresAt: "",
        amount: "",
        paymentMethod: "card",
        installmentMonths: "",
        paymentNote: "",
      });
      setShowCreatePassForm(false);
      setMemoMessage("수강권이 생성되었습니다.");
    } catch (error) {
      setMemoMessage(error.message || "수강권 생성에 실패했습니다.");
    } finally {
      setCreatingPass(false);
    }
  }

  function refreshMemberPasses(member, nextPasses) {
    setDetailPasses(nextPasses);
    setMembers((previous) =>
      previous.map((item) => (item.id === member.id ? { ...item, passes: nextPasses } : item))
    );
  }

  async function handleChangePassStatus(member, pass, nextStatus) {
    if (!member?.id || !pass?.id) return;
    try {
      await updateAdminPassStatus(pass.id, nextStatus);
      const nextPasses = detailPasses.map((item) => (item.id === pass.id ? { ...item, status: nextStatus } : item));
      refreshMemberPasses(member, nextPasses);
      setMemoMessage(`수강권 상태가 ${getPassStatusLabel({ ...pass, status: nextStatus })}(으)로 변경되었습니다.`);
    } catch (error) {
      setMemoMessage(error.message || "수강권 상태 변경에 실패했습니다.");
    }
  }

  function openPassAction(type, pass) {
    const todayText = new Date().toISOString().slice(0, 10);
      setPassAction({ type, pass });
    setTransferSearchQuery("");
    setPassActionDraft({
      startDate: todayText,
      endDate: todayText,
      toUserId: "",
      transferCount: String(pass?.remainingCount || 0),
      refundAmount: String(pass?.payment?.amount || 0),
      reason: type === "pause" ? "관리자 정지 처리" : type === "transfer" ? "관리자 양도 처리" : "관리자 환불 처리",
    });
  }

  async function submitPassAction(event, member) {
    event.preventDefault();
    const pass = passAction?.pass;
    if (!member?.id || !pass?.id || !passAction?.type) return;
    try {
      if (passAction.type === "pause") {
        await pauseAdminPass({
          passId: pass.id,
          userId: member.id,
          startDate: passActionDraft.startDate,
          endDate: passActionDraft.endDate,
          reason: passActionDraft.reason,
        });
        const nextPasses = detailPasses.map((item) => (item.id === pass.id ? { ...item, status: "paused" } : item));
        refreshMemberPasses(member, nextPasses);
        setMemoMessage("수강권이 정지 처리되었습니다.");
      }
      if (passAction.type === "transfer") {
        if (!passActionDraft.toUserId) {
          setMemoMessage("양도 받을 회원을 검색해서 선택해 주세요.");
          return;
        }
        await transferAdminPass({
          passId: pass.id,
          fromUserId: member.id,
          toUserId: passActionDraft.toUserId,
          transferCount: Math.max(0, Number(passActionDraft.transferCount || 0)),
          reason: passActionDraft.reason,
        });
        const transferCount = Math.max(0, Number(passActionDraft.transferCount || 0));
        const nextRemaining = Math.max(0, Number(pass.remainingCount || 0) - transferCount);
        const nextPasses = detailPasses.map((item) =>
          item.id === pass.id
            ? { ...item, status: nextRemaining <= 0 ? "transferred" : item.status, remainingCount: nextRemaining }
            : item
        );
        refreshMemberPasses(member, nextPasses);
        setMemoMessage("수강권이 양도 처리되었습니다.");
      }
      if (passAction.type === "refund") {
        await requestStudioPassRefund({
          passId: pass.id,
          userId: member.id,
          refundAmount: Math.max(0, Number(passActionDraft.refundAmount || 0)),
          reason: passActionDraft.reason,
        });
        setMemoMessage("수강권 환불 요청이 등록되었습니다. 환불 관리에서 승인 처리할 수 있습니다.");
      }
      setPassAction(null);
    } catch (error) {
      setMemoMessage(error.message || "수강권 처리에 실패했습니다.");
    }
  }

  function handleDownloadCsv() {
    const headers = ["이름", "전화번호", "등록일", "최근출석일", "수강권", "상품", "앱연결", "스튜디오상태"];
    const lines = filteredRows.map(({ member }) => [
      member.name || "",
      member.phone || "",
      formatDate(member.studioRegisteredAt || member.createdAt),
      member.lastVisitAt ? formatDate(member.lastVisitAt) : "",
      getPassSummary(member),
      getProductSummary(member),
      member.appConnectionStatus === "connected" ? "연결" : "미연결",
      getStudioMemberStatusLabel(member.studioMemberStatus),
    ]);
    const csv = [headers, ...lines].map((row) => row.map(toCsvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `studio-members-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleChangeAppConnection(member, nextStatus) {
    if (!member?.id) return;
    const payload = {
      name: member.name || "",
      phone: member.phone || "",
      appConnectionStatus: nextStatus,
      studioMemberStatus: member.studioMemberStatus || "active",
      gender: member.gender || "",
      birthDate: member.birthDate ? String(member.birthDate).slice(0, 10) : "",
      address: member.address || "",
      addressDetail: member.addressDetail || "",
      primaryInstructor: member.primaryInstructor || "",
    };
    try {
      const result = await apiRequest(`/admin/members/${encodeURIComponent(String(member.id))}/studio-profile`, {
        method: "PUT",
        body: payload,
      });
      const profile = result?.profile || {};
      setMembers((previous) =>
        previous.map((item) =>
          item.id === member.id
            ? { ...item, appConnectionStatus: profile.appConnectionStatus || nextStatus }
            : item
        )
      );
      setMemoMessage(nextStatus === "connected" ? "앱 연결 상태로 변경했습니다." : "앱 미연결 상태로 변경했습니다.");
    } catch (error) {
      setMemoMessage(error.message || "앱 연결 상태 변경에 실패했습니다.");
    }
  }

  const statusOptions = [
    { value: "", label: `전체회원 (${statusCounts.전체}명)` },
    { value: "이용", label: `이용회원 (${statusCounts.이용 || 0}명)` },
    { value: "만료", label: `만료회원 (${statusCounts.만료 || 0}명)` },
    { value: "미결제", label: `미결제회원 (${statusCounts.미결제 || 0}명)` },
    { value: "수강권 없음", label: `수강권 없음 (${statusCounts["수강권 없음"] || 0}명)` },
  ];

  const usageScopeOptions = [
    { value: "", label: `통합회원 전체 (${usageScopeCounts.all}명)` },
    { value: "studioManaged", label: `스튜디오관리 (${(usageScopeCounts.studio || 0) + (usageScopeCounts.both || 0)}명)` },
    { value: "studio", label: `스튜디오회원 (${usageScopeCounts.studio || 0}명)` },
    { value: "both", label: `통합이용 (${usageScopeCounts.both || 0}명)` },
  ];

  const gradeOptions = [
    { value: "", label: "회원등급 전체" },
    { value: "member", label: "일반회원" },
    { value: "vip", label: "VIP" },
    { value: "vvip", label: "VVIP" },
    { value: "admin1", label: "관리자 1" },
    { value: "admin0", label: "관리자 0" },
  ];

  const passOptions = [
    { value: "", label: "전체수강권" },
    { value: "그룹", label: "그룹" },
    { value: "프라이빗", label: "프라이빗" },
    ...passNames.map((name) => ({ value: name, label: name })),
  ];

  const usageScopeTabs = [
    { value: "studioManaged", label: "스튜디오관리", count: (usageScopeCounts.studio || 0) + (usageScopeCounts.both || 0) },
    { value: "", label: "전체", count: usageScopeCounts.all },
    { value: "studio", label: "스튜디오회원", count: usageScopeCounts.studio || 0 },
    { value: "both", label: "통합이용", count: usageScopeCounts.both || 0 },
  ];
  const detailMember = useMemo(
    () => managedMembers.find((member) => member.id === detailMemberId) || null,
    [managedMembers, detailMemberId]
  );
  const transferCandidates = useMemo(() => {
    const query = transferSearchQuery.trim().toLowerCase();
    if (!query) return [];
    const digits = query.replace(/\D/g, "");
    return managedMembers
      .filter((member) => member.id !== detailMember?.id)
      .filter((member) => {
        const phoneDigits = String(member.phone || "").replace(/\D/g, "");
        return (
          String(member.name || "").toLowerCase().includes(query) ||
          String(member.loginId || "").toLowerCase().includes(query) ||
          String(member.phone || "").toLowerCase().includes(query) ||
          (digits && phoneDigits.includes(digits))
        );
      })
      .slice(0, 8);
  }, [managedMembers, detailMember?.id, transferSearchQuery]);

  return (
    <div className="admin-memberlist-app">
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
          <span aria-hidden="true">이름 또는 전화번호로 검색</span>
          <input
            type="search"
            placeholder="이름 또는 전화번호로 검색"
            value={searchQuery}
            onChange={(event) => handleTopSearchChange(event.target.value)}
            onKeyDown={handleTopSearchKeyDown}
          />
        </div>
        <button className="admin-schedule-profile" type="button" onClick={() => navigate("/admin/members")}>
          {currentUserName}
        </button>
      </header>

      <div className="admin-memberlist-body">
        <div className="admin-memberlist-title-row">
          <div className="admin-memberlist-tabs">
            <h1 className="admin-memberlist-heading">회원</h1>
            {usageScopeTabs.map((tab) => (
              <button
                key={tab.value || "all"}
                type="button"
                className={`admin-memberlist-scope-tab${filterUsageScope === tab.value ? " active" : ""}`}
                onClick={() => {
                  setFilterUsageScope(tab.value);
                  setPage(1);
                }}
              >
                {tab.label} {tab.count}
              </button>
            ))}
          </div>
          <div className="admin-memberlist-title-actions">
            <span className="admin-memberlist-count-text">
              필터링 회원 <strong>{filteredMembers.length}</strong>명
            </span>
            <span className="admin-memberlist-count-sep">|</span>
            <span className="admin-memberlist-count-text">
              표시 행 <strong>{filteredRows.length}</strong>건
            </span>
            <span className="admin-memberlist-count-sep">|</span>
            <span className="admin-memberlist-count-text">
              선택된 회원 <strong>{selectedIds.size}</strong>명
            </span>
            <button
              type="button"
              className="admin-classlist-btn"
              onClick={() => sendManualNotification(filteredMembers)}
            >
              필터링 회원에게 ▾
            </button>
            <button
              type="button"
              className="admin-classlist-btn"
              disabled={selectedIds.size === 0}
              onClick={() => sendManualNotification(managedMembers.filter((member) => selectedIds.has(member.id)))}
            >
              선택된 회원에게 ▾
            </button>
            <button type="button" className="admin-classlist-btn primary" onClick={handleDownloadCsv}>엑셀다운로드</button>
          </div>
        </div>

        <div className="admin-memberlist-filterbar">
          <div className="admin-memberlist-filterbar-left">
            <ListDropdown
              label={filterStatus ? statusOptions.find((option) => option.value === filterStatus)?.label.split("(")[0].trim() : `전체회원 (${statusCounts.전체}명)`}
              active={Boolean(filterStatus)}
              options={statusOptions}
              value={filterStatus}
              onChange={(value) => { setFilterStatus(value); setPage(1); }}
            />
            <ListDropdown
              label={filterUsageScope ? usageScopeOptions.find((option) => option.value === filterUsageScope)?.label.split("(")[0].trim() : "통합회원 전체"}
              active={Boolean(filterUsageScope)}
              options={usageScopeOptions}
              value={filterUsageScope}
              onChange={(value) => { setFilterUsageScope(value); setPage(1); }}
            />
            <ListDropdown
              label={filterGrade ? formatUserGradeLabel(filterGrade) : "회원등급 전체"}
              active={Boolean(filterGrade)}
              options={gradeOptions}
              value={filterGrade}
              onChange={(value) => { setFilterGrade(value); setPage(1); }}
            />
            <ListDropdown
              label={filterPass || "전체수강권"}
              active={Boolean(filterPass)}
              options={passOptions}
              value={filterPass}
              onChange={(value) => { setFilterPass(value); setPage(1); }}
            />
            <NumericDropdown
              label="잔여기간"
              unit="일"
              mode="이하"
              value={filterDaysLeft}
              onChange={(value) => { setFilterDaysLeft(value); setPage(1); }}
            />
            <NumericDropdown
              label="잔여횟수"
              unit="회"
              mode="이하"
              value={filterCountLeft}
              onChange={(value) => { setFilterCountLeft(value); setPage(1); }}
            />
            <NumericDropdown
              label="미방문일수"
              unit="일"
              mode="이상"
              value={filterNoVisit}
              onChange={(value) => { setFilterNoVisit(value); setPage(1); }}
            />
            <button type="button" className="admin-memberlist-reset-btn" onClick={resetFilters} title="필터 초기화">↻</button>
            <button
              type="button"
              className="admin-memberlist-reset-btn"
              title="설정"
              onClick={() => setMemberSettingsOpen((value) => !value)}
            >
              ⚙
            </button>
          </div>

          <div className="admin-memberlist-filterbar-right">
            <select
              className="admin-memberlist-search-type"
              value={searchType}
              onChange={(event) => setSearchType(event.target.value)}
            >
              <option>이름/전화</option>
              <option>이름</option>
              <option>전화번호</option>
            </select>
            <div className="admin-memberlist-search-box">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5.5" stroke="#9aa3ad" strokeWidth="1.5" />
                <path d="M11 11l3 3" stroke="#9aa3ad" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                placeholder="회원 이름 또는 전화번호"
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }}
              />
            </div>
          </div>
        </div>

        {memberSettingsOpen ? (
          <div className="admin-member-settings-panel">
            <strong>회원 목록 설정</strong>
            <button
              type="button"
              onClick={() => {
                setFilterUsageScope("studioManaged");
                setMemberSettingsOpen(false);
                setPage(1);
              }}
            >
              스튜디오 관리 대상만 보기
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterUsageScope("");
                setMemberSettingsOpen(false);
                setPage(1);
              }}
            >
              통합 회원 전체 보기
            </button>
            <button type="button" onClick={handleDownloadCsv}>현재 목록 내려받기</button>
          </div>
        ) : null}

        {memoMessage ? <p className="admin-memberlist-memo-message">{memoMessage}</p> : null}

        <div className="admin-memberlist-table-wrap">
          <table className="admin-memberlist-table studio-mate-member-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                {MEMBER_COLUMNS.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={MEMBER_COLUMNS.length + 1} className="admin-classlist-empty">불러오는 중입니다.</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={MEMBER_COLUMNS.length + 1} className="admin-classlist-empty">해당 조건의 회원이 없습니다.</td></tr>
              ) : pageRows.map(({ member, pass, rowId }) => (
                <tr
                  key={rowId}
                  className={`${selectedIds.has(member.id) ? "selected" : ""}${Number(member.totalArrears || 0) > 0 ? " has-arrears" : ""}`}
                  onClick={() => openMemberDetail(member)}
                >
                  <td onClick={(event) => event.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(member.id)} onChange={() => toggleOne(member.id)} />
                  </td>
                  <td>
                    <div className="admin-member-name-cell">
                      <div>
                        <strong>{member.name || "-"}</strong>
                        <div className="admin-member-compact-badges">
                          {["studio", "both"].includes(getUsageScope(member)) ? (
                            <span className={`admin-member-scope-badge ${getUsageScope(member)}`}>
                              {getUsageScopeLabel(member)}
                            </span>
                          ) : null}
                          <span className="admin-member-grade-badge">{formatUserGradeLabel(member.userGrade)}</span>
                        </div>
                      </div>
                      {Number(member.totalArrears || 0) > 0 ? (
                        <span className="admin-member-arrears-badge">미결제 {Number(member.totalArrears || 0).toLocaleString()}원</span>
                      ) : null}
                    </div>
                  </td>
                  <td>{member.phone || "-"}</td>
                  <td>{formatDate(member.studioRegisteredAt || member.createdAt)}</td>
                  <td>{member.lastVisitAt ? formatDate(member.lastVisitAt) : "-"}</td>
                  <td>
                    <div className="admin-member-pass-summary">
                      <strong>{getPassSummary(member)}</strong>
                      <span>{pass ? getPassStatusLabel(pass) : "수강권 없음"}</span>
                    </div>
                  </td>
                  <td>{getProductSummary(member)}</td>
                  <td>{member.appConnectionStatus === "connected" ? "연결" : "미연결"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {detailMember ? (
          <section className="admin-member-detail-panel">
            <div className="admin-member-detail-breadcrumb">회원 &gt; 회원 정보</div>
            <button
              type="button"
              className="admin-member-detail-close"
              onClick={() => setDetailMemberId("")}
              aria-label="회원 상세 닫기"
            >
              ×
            </button>
            <div className="admin-member-detail-hero">
              <div>
                <h2>{detailMember.name || "-"}</h2>
                <dl className="admin-member-detail-info">
                  <div>
                    <dt>등록일</dt>
                    <dd>{formatDate(detailMember.studioRegisteredAt || detailMember.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>스튜디오상태</dt>
                    <dd>
                      <select
                        className="admin-member-detail-status-select"
                        value={detailMember.studioMemberStatus || ""}
                        disabled={savingStudioStatusUserId === detailMember.id}
                        onChange={(event) => handleChangeStudioStatus(detailMember, event.target.value)}
                      >
                        <option value="">미지정</option>
                        <option value="active">관리 대상</option>
                        <option value="inactive">수강권 없음/휴면</option>
                        <option value="expired">수강권 만료</option>
                        <option value="archived">관리 제외</option>
                      </select>
                    </dd>
                  </div>
                  <div>
                    <dt>휴대폰번호</dt>
                    <dd>
                      {detailMember.phone || "-"}
                      <span className="admin-member-detail-link">앱 연결 {detailMember.appConnectionStatus === "connected" ? "완료" : "미연결"}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>성별</dt>
                    <dd>{detailMember.gender || "-"}</dd>
                  </div>
                  <div>
                    <dt>생년월일</dt>
                    <dd>{detailMember.birthDate ? formatDate(detailMember.birthDate) : "-"}</dd>
                  </div>
                  <div>
                    <dt>주소</dt>
                    <dd>{[detailMember.address, detailMember.addressDetail].filter(Boolean).join(" ") || "-"}</dd>
                  </div>
                </dl>
              </div>
              <div className="admin-member-detail-avatar" aria-hidden="true">
                <span />
              </div>
            </div>

            <div className="admin-member-detail-actions">
              <button type="button" onClick={() => sendManualNotification([detailMember])}>메시지 보내기</button>
              <button
                type="button"
                onClick={() =>
                  handleChangeAppConnection(
                    detailMember,
                    detailMember.appConnectionStatus === "connected" ? "not_connected" : "connected"
                  )
                }
              >
                {detailMember.appConnectionStatus === "connected" ? "앱 연결 해제" : "앱 연결 처리"}
              </button>
              <button type="button" onClick={() => startEditMember(detailMember)}>회원정보 수정</button>
              <button type="button" className="primary" onClick={() => handleBulkBooking(detailMember)}>일괄예약</button>
            </div>

            {editingMember ? (
              <div className="admin-member-edit-panel">
                <div className="admin-member-edit-grid">
                  <label>
                    <span>이름</span>
                    <input
                      type="text"
                      value={editDraft.name}
                      onChange={(event) => setEditDraft((previous) => ({ ...previous, name: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>휴대폰번호</span>
                    <input
                      type="tel"
                      value={editDraft.phone}
                      onChange={(event) => setEditDraft((previous) => ({ ...previous, phone: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>스튜디오 상태</span>
                    <select
                      value={editDraft.studioMemberStatus}
                      onChange={(event) => setEditDraft((previous) => ({ ...previous, studioMemberStatus: event.target.value }))}
                    >
                      <option value="active">관리 대상</option>
                      <option value="inactive">수강권 없음/휴면</option>
                      <option value="expired">수강권 만료</option>
                      <option value="archived">관리 제외</option>
                    </select>
                  </label>
                  <label>
                    <span>앱 연결</span>
                    <select
                      value={editDraft.appConnectionStatus}
                      onChange={(event) => setEditDraft((previous) => ({ ...previous, appConnectionStatus: event.target.value }))}
                    >
                      <option value="not_connected">미연결</option>
                      <option value="connected">연결</option>
                    </select>
                  </label>
                  <label>
                    <span>성별</span>
                    <input
                      type="text"
                      value={editDraft.gender}
                      onChange={(event) => setEditDraft((previous) => ({ ...previous, gender: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>생년월일</span>
                    <input
                      type="date"
                      value={editDraft.birthDate}
                      onChange={(event) => setEditDraft((previous) => ({ ...previous, birthDate: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>담당강사</span>
                    <input
                      type="text"
                      value={editDraft.primaryInstructor}
                      onChange={(event) => setEditDraft((previous) => ({ ...previous, primaryInstructor: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>주소</span>
                    <input
                      type="text"
                      value={editDraft.address}
                      onChange={(event) => setEditDraft((previous) => ({ ...previous, address: event.target.value }))}
                    />
                  </label>
                  <label className="wide">
                    <span>상세주소</span>
                    <input
                      type="text"
                      value={editDraft.addressDetail}
                      onChange={(event) => setEditDraft((previous) => ({ ...previous, addressDetail: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="admin-member-edit-actions">
                  <button type="button" onClick={() => setEditingMember(false)}>취소</button>
                  <button type="button" className="primary" disabled={savingMemberProfile} onClick={() => handleSaveMemberProfile(detailMember)}>
                    {savingMemberProfile ? "저장 중" : "저장"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="admin-member-detail-tabs">
              {[
                { value: "basic", label: "기본정보" },
                { value: "usage", label: "이용내역" },
                { value: "points", label: "포인트 내역" },
                { value: "payments", label: "결제 내역" },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={detailTab === tab.value ? "active" : ""}
                  onClick={() => setDetailTab(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {detailTab === "basic" ? (
            <>
            <div className="admin-member-detail-section">
              <div className="admin-member-detail-section-head">
                <div>
                  <h3>사용중인 수강권</h3>
                  <p>수강권을 클릭하시면 수강권의 이용내역을 확인하실 수 있습니다.</p>
                </div>
                <button type="button" onClick={() => setShowPreviousPasses((value) => !value)}>
                  {showPreviousPasses ? "사용중인 수강권 보기" : "이전 수강권 보기"}
                </button>
              </div>
              <button
                type="button"
                className="admin-member-inline-add-btn"
                onClick={() => setShowCreatePassForm((value) => !value)}
              >
                + 새 수강권
              </button>
              <div className="admin-member-detail-card-row">
                {detailLoading ? (
                  <p className="admin-member-detail-empty">불러오는 중입니다.</p>
                ) : detailPasses.filter((pass) => showPreviousPasses ? !isCurrentPass(pass) : isCurrentPass(pass)).length ? (
                  detailPasses.filter((pass) => showPreviousPasses ? !isCurrentPass(pass) : isCurrentPass(pass)).map((pass) => (
                    <article key={pass.id} className="admin-member-detail-pass-card">
                      <strong>{pass.passName || "수강권"}</strong>
                      <span>{getPassStatusLabel(pass)}</span>
                      <p>잔여 {formatCount(pass.remainingCount)}회 / 전체 {formatCount(pass.totalCount)}회</p>
                      <p>만료 {pass.expiresAt ? formatDate(pass.expiresAt) : "만료일 없음"}</p>
                      {pass.payment ? (
                        <p>결제 {formatCurrency(pass.payment.amount)} · {pass.payment.paymentMethod || "-"}</p>
                      ) : null}
                      <div className="admin-member-pass-card-actions">
                        {pass.status === "paused" ? (
                          <button type="button" onClick={() => handleChangePassStatus(detailMember, pass, "active")}>재개</button>
                        ) : (
                          <button type="button" onClick={() => openPassAction("pause", pass)}>정지</button>
                        )}
                        <button type="button" onClick={() => openPassAction("transfer", pass)}>양도</button>
                        <button type="button" onClick={() => openPassAction("refund", pass)}>환불</button>
                        <button type="button" onClick={() => handleChangePassStatus(detailMember, pass, "refunded")}>종료</button>
                      </div>
                    </article>
                  ))
                ) : (
                  <button type="button" className="admin-member-detail-create-card" onClick={() => setShowCreatePassForm((value) => !value)}>
                    <span>＋</span>
                    <small>새로운 수강권 만들기</small>
                  </button>
                )}
              </div>
              {showCreatePassForm ? (
                <div className="admin-member-pass-create-form">
                  <input
                    type="text"
                    placeholder="수강권명"
                    value={passDraft.passName}
                    onChange={(event) => setPassDraft((previous) => ({ ...previous, passName: event.target.value }))}
                  />
                  <select
                    value={passDraft.passType}
                    onChange={(event) => setPassDraft((previous) => ({ ...previous, passType: event.target.value }))}
                  >
                    <option value="group">그룹</option>
                    <option value="personal">프라이빗</option>
                    <option value="duet">듀엣</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    placeholder="전체횟수"
                    value={passDraft.totalCount}
                    onChange={(event) => setPassDraft((previous) => ({ ...previous, totalCount: event.target.value }))}
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="잔여횟수"
                    value={passDraft.remainingCount}
                    onChange={(event) => setPassDraft((previous) => ({ ...previous, remainingCount: event.target.value }))}
                  />
                  <input
                    type="date"
                    value={passDraft.expiresAt}
                    onChange={(event) => setPassDraft((previous) => ({ ...previous, expiresAt: event.target.value }))}
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="결제금액"
                    value={passDraft.amount}
                    onChange={(event) => setPassDraft((previous) => ({ ...previous, amount: event.target.value }))}
                  />
                  <select
                    value={passDraft.paymentMethod}
                    onChange={(event) => setPassDraft((previous) => ({ ...previous, paymentMethod: event.target.value }))}
                  >
                    <option value="card">카드</option>
                    <option value="cash">현금</option>
                    <option value="transfer">계좌이체</option>
                    <option value="etc">기타</option>
                  </select>
                  <input
                    type="text"
                    placeholder="할부/메모"
                    value={passDraft.paymentNote}
                    onChange={(event) => setPassDraft((previous) => ({ ...previous, paymentNote: event.target.value }))}
                  />
                  <button type="button" disabled={creatingPass} onClick={() => handleCreatePass(detailMember)}>
                    {creatingPass ? "생성 중" : "수강권 생성"}
                  </button>
                </div>
              ) : null}
              {passAction ? (
                <form className="admin-member-pass-action-form" onSubmit={(event) => submitPassAction(event, detailMember)}>
                  <strong>
                    {passAction.type === "pause" ? "수강권 정지" : passAction.type === "transfer" ? "수강권 양도" : "수강권 환불"} · {passAction.pass?.passName || "수강권"}
                  </strong>
                  {passAction.type === "pause" ? (
                    <>
                      <input
                        type="date"
                        value={passActionDraft.startDate}
                        onChange={(event) => setPassActionDraft((previous) => ({ ...previous, startDate: event.target.value }))}
                        required
                      />
                      <input
                        type="date"
                        value={passActionDraft.endDate}
                        onChange={(event) => setPassActionDraft((previous) => ({ ...previous, endDate: event.target.value }))}
                        required
                      />
                    </>
                  ) : null}
                  {passAction.type === "transfer" ? (
                    <>
                      <div className="admin-member-transfer-picker">
                        <input
                          type="search"
                          placeholder="양도 받을 회원 이름 또는 전화번호 검색"
                          value={transferSearchQuery}
                          onChange={(event) => setTransferSearchQuery(event.target.value)}
                        />
                        {passActionDraft.toUserId ? (
                          <span className="admin-member-transfer-selected">선택 회원 ID: {passActionDraft.toUserId}</span>
                        ) : null}
                        {transferSearchQuery.trim() ? (
                          <div className="admin-member-transfer-results">
                            {transferCandidates.length ? (
                              transferCandidates.map((member) => (
                                <button
                                  key={member.id}
                                  type="button"
                                  onClick={() => {
                                    setPassActionDraft((previous) => ({ ...previous, toUserId: member.id }));
                                    setTransferSearchQuery(`${member.name || "-"} ${member.phone || ""}`.trim());
                                  }}
                                >
                                  <strong>{member.name || "-"}</strong>
                                  <span>{member.phone || "-"} · {getStudioMemberStatusLabel(member.studioMemberStatus)}</span>
                                </button>
                              ))
                            ) : (
                              <p>검색된 회원이 없습니다.</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="양도 횟수"
                        value={passActionDraft.transferCount}
                        onChange={(event) => setPassActionDraft((previous) => ({ ...previous, transferCount: event.target.value }))}
                      />
                    </>
                  ) : null}
                  {passAction.type === "refund" ? (
                    <input
                      type="number"
                      min="0"
                      placeholder="환불 금액"
                      value={passActionDraft.refundAmount}
                      onChange={(event) => setPassActionDraft((previous) => ({ ...previous, refundAmount: event.target.value }))}
                    />
                  ) : null}
                  <input
                    type="text"
                    placeholder="사유"
                    value={passActionDraft.reason}
                    onChange={(event) => setPassActionDraft((previous) => ({ ...previous, reason: event.target.value }))}
                  />
                  <div>
                    <button type="button" onClick={() => setPassAction(null)}>취소</button>
                    <button type="submit">처리</button>
                  </div>
                </form>
              ) : null}
            </div>

            <div className="admin-member-detail-section">
              <div className="admin-member-detail-section-head">
                <div>
                  <h3>사용중인 상품</h3>
                  <p>상품을 클릭하시면 상품의 이용내역을 확인하실 수 있습니다.</p>
                </div>
                <button type="button" onClick={() => setDetailTab("payments")}>이전 상품 보기</button>
              </div>
              <div className="admin-member-detail-card-row">
                {Number(detailMember.orderCount || 0) > 0 ? (
                  <article className="admin-member-detail-pass-card">
                    <strong>교육 상품</strong>
                    <span>{getProductSummary(detailMember)}</span>
                    <p>이끌림 교육 사이트 구매 이력</p>
                  </article>
                ) : (
                  <button type="button" className="admin-member-detail-create-card" onClick={() => navigate("/admin/products")}>
                    <span>＋</span>
                    <small>새로운 상품 만들기</small>
                  </button>
                )}
              </div>
            </div>
            </>
            ) : null}

            {detailTab === "usage" ? (
              <div className="admin-member-detail-section">
                <h3>이용내역</h3>
                <div className="admin-member-detail-memos">
                  {detailPasses.length ? (
                    detailPasses.map((pass) => (
                      <article key={`usage-${pass.id}`}>
                        <small>{pass.createdAt ? formatDate(pass.createdAt) : "-"}</small>
                        <p>{pass.passName || "수강권"} · {getPassStatusLabel(pass)} · 잔여 {formatCount(pass.remainingCount)}회</p>
                      </article>
                    ))
                  ) : (
                    <p className="admin-member-detail-empty">이용내역이 없습니다.</p>
                  )}
                </div>
              </div>
            ) : null}

            {detailTab === "points" ? (
              <div className="admin-member-detail-section">
                <h3>포인트 내역</h3>
                <p className="admin-member-detail-empty">현재 포인트 잔액: {formatCount(detailMember.points)}P</p>
              </div>
            ) : null}

            {detailTab === "payments" ? (
              <div className="admin-member-detail-section">
                <h3>결제 내역</h3>
                <div className="admin-member-detail-memos">
                  {detailPasses.some((pass) => pass.payment) ? (
                    detailPasses.filter((pass) => pass.payment).map((pass) => (
                      <article key={`payment-${pass.id}`}>
                        <small>{pass.payment?.paidAt ? formatDate(pass.payment.paidAt) : formatDate(pass.createdAt)} · {pass.payment?.paymentType || "수강권 결제"}</small>
                        <p>
                          {pass.passName || "수강권"} · {formatCurrency(pass.payment?.amount)} · {pass.payment?.paymentMethod || "-"}
                          {pass.payment?.installmentMonths ? ` · ${pass.payment.installmentMonths}개월` : ""}
                        </p>
                        {pass.payment?.note ? <p>{pass.payment.note}</p> : null}
                      </article>
                    ))
                  ) : (
                    <p className="admin-member-detail-empty">수강권 결제 내역이 없습니다.</p>
                  )}
                  {Number(detailMember.orderCount || 0) > 0 ? (
                    <article>
                      <small>교육상품</small>
                      <p>{getProductSummary(detailMember)} · 상세 구매 내역은 교육 매출/회원 대시보드에서 확인합니다.</p>
                    </article>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="admin-member-detail-section">
              <div className="admin-member-detail-section-head">
                <div>
                  <h3>메모</h3>
                  <p>회원 특이사항과 상담 내용을 기록합니다.</p>
                </div>
              </div>
              <div className="admin-member-detail-memo-form">
                <textarea
                  value={memoDrafts[detailMember.id] || ""}
                  placeholder="특이사항 메모"
                  onChange={(event) => setMemoDrafts((previous) => ({ ...previous, [detailMember.id]: event.target.value }))}
                />
                <button
                  type="button"
                  disabled={savingMemoUserId === detailMember.id}
                  onClick={() => handleSaveDetailMemo(detailMember)}
                >
                  메모 추가
                </button>
              </div>
              <div className="admin-member-detail-memos">
                {detailMemos.length ? (
                  detailMemos.map((memo) => (
                    <article key={memo.id || `${memo.createdAt}-${memo.memo}`}>
                      <small>{formatDate(memo.createdAt)} · {memo.authorName || "시스템"}</small>
                      <p>{memo.memo}</p>
                    </article>
                  ))
                ) : (
                  <p className="admin-member-detail-empty">기록된 메모가 없습니다.</p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        <div className="admin-classlist-pagination" style={{ marginTop: 20 }}>
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => value - 1)}>‹</button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button key={pageNumber} type="button" className={pageNumber === safePage ? "active" : ""} onClick={() => setPage(pageNumber)}>
              {pageNumber}
            </button>
          ))}
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((value) => value + 1)}>›</button>
          <span className="admin-classlist-perpage">{PAGE_SIZE}/page</span>
        </div>
      </div>

      <button className="admin-memberlist-floating-add" type="button" onClick={() => navigate("/admin/members")} title="회원 상세 관리">
        +
      </button>

      {notificationDraft.open ? (
        <div className="admin-member-modal-backdrop" role="presentation">
          <form className="admin-member-notification-modal" onSubmit={submitManualNotification}>
            <div>
              <strong>회원 알림 기록</strong>
              <p>
                대상 {notificationDraft.targetMembers.length}명 · 문자 API 발송은 보류 상태라 현재는 알림 기록만 저장합니다.
              </p>
            </div>
            <label>
              <span>제목</span>
              <input
                type="text"
                value={notificationDraft.title}
                onChange={(event) => setNotificationDraft((previous) => ({ ...previous, title: event.target.value }))}
              />
            </label>
            <label>
              <span>내용</span>
              <textarea
                rows={6}
                value={notificationDraft.message}
                placeholder="회원에게 남길 안내 내용을 입력해 주세요."
                onChange={(event) => setNotificationDraft((previous) => ({ ...previous, message: event.target.value }))}
              />
            </label>
            <div className="admin-member-notification-targets">
              {notificationDraft.targetMembers.slice(0, 8).map((member) => (
                <span key={member.id}>{member.name || member.phone || member.id}</span>
              ))}
              {notificationDraft.targetMembers.length > 8 ? <span>+{notificationDraft.targetMembers.length - 8}</span> : null}
            </div>
            <div className="admin-member-notification-actions">
              <button
                type="button"
                onClick={() => setNotificationDraft({ open: false, title: "이끌림 필라테스 안내", message: "", targetMembers: [] })}
              >
                취소
              </button>
              <button type="submit" className="primary" disabled={sendingNotification}>
                {sendingNotification ? "저장 중" : "알림 저장"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

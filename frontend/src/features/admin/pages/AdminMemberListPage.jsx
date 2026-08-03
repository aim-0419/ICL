/**
 * [관리자 회원 목록 페이지]
 *
 * 필라테스 관리용 회원 목록입니다.
 * 교육영상 구매 이력과 별개로 스튜디오 수강권/출석/미수금/회원상태가 있는 회원만 표시합니다.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout.jsx";
import { apiRequest } from "../../../shared/api/client.js";

async function createAdminStudioMember(payload) {
  const result = await apiRequest("/admin/members", { method: "POST", body: payload });
  return result?.member || result;
}
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { formatUserGradeLabel } from "../../../shared/auth/userRoles.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { downloadXlsx } from "../../../shared/utils/exportXlsx.js";
import {
  createAdminMemberMemo,
  createAdminPass,
  listAdminPassTransactions,
  listAdminMemberMemos,
  listAdminPassesByUser,
  pauseAdminPass,
  requestStudioPassRefund,
  transferAdminPass,
  updateAdminPassStatus,
  listAdminConsultations,
  createAdminConsultation,
  deleteAdminConsultation,
  listAdminPassProducts,
  listAdminGoods,
} from "../../studio/api/studioApi.js";
import { DEFAULT_STUDIO_BRANCH_ID, STUDIO_BRANCHES, getStudioBranchName } from "../../studio/constants/studioBranches.js";
import { SmsSendModal } from "../components/SmsSendModal.jsx";
import "./AdminMemberListPage.css";

const PAGE_SIZE = 10;

const MEMBER_COLUMNS = [
  "이름",
  "전화번호",
  "가입일",
  "최근출석일",
  "수강권",
  "상품",
  "앱연결",
];

const MEMBER_TABS = [
  { id: "members", label: "회원" },
  { id: "consulting", label: "상담고객" },
  { id: "passHistory", label: "수강권 정보 변경이력" },
  { id: "contracts", label: "전자계약서", beta: true },
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

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toDateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function getPassTransactionTypeLabel(transaction) {
  const deltaCount = Number(transaction?.deltaCount || 0);
  if (String(transaction?.reason || "").includes("환불")) return "환불";
  if (String(transaction?.reason || "").includes("양도")) return "양도";
  if (deltaCount < 0) return "차감";
  if (deltaCount > 0) return "충전";
  return "변경";
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
  const totalArrears = Number(member?.totalArrears || 0);
  if (totalArrears > 0) return `미수금 ${formatCurrency(totalArrears)}`;
  return "-";
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
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsReceivers, setSmsReceivers] = useState([]);
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
    branchId: DEFAULT_STUDIO_BRANCH_ID,
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
  const [activeMemberTab, setActiveMemberTab] = useState("members");
  const [showCreateMember, setShowCreateMember] = useState(false);
  const [creatingMember, setCreatingMember] = useState(false);
  const [createMemberDraft, setCreateMemberDraft] = useState({
    name: "",
    phone: "",
    gender: "",
    birthDate: "",
    userGrade: "member",
    primaryInstructor: "",
    registeredAt: toDateInputValue(),
    memo: "",
  });
  const [consultations, setConsultations] = useState([]);
  const [consultLoading, setConsultLoading] = useState(false);
  const [consultSearch, setConsultSearch] = useState("");
  const [consultTypeFilter, setConsultTypeFilter] = useState("");
  const [consultStaffFilter, setConsultStaffFilter] = useState("");
  const [consultDraft, setConsultDraft] = useState({
    type: "전화상담",
    staff: currentUserName,
    date: toDateInputValue(),
    startTime: "15:10",
    endTime: "15:40",
    name: "",
    phone: "",
    memo: "",
  });
  const [passTransactions, setPassTransactions] = useState([]);
  const [passHistoryLoading, setPassHistoryLoading] = useState(false);
  const [passHistoryDate, setPassHistoryDate] = useState(toDateInputValue());
  const [passHistorySearch, setPassHistorySearch] = useState("");
  const [passHistoryStaff, setPassHistoryStaff] = useState("");

  const [showPassModal, setShowPassModal] = useState(false);
  const [passModalStep, setPassModalStep] = useState(1);
  const [passProducts, setPassProducts] = useState([]);
  const [passProductsLoading, setPassProductsLoading] = useState(false);
  const [passSearch, setPassSearch] = useState("");
  const [passTabFilter, setPassTabFilter] = useState("");
  const [selectedPassProduct, setSelectedPassProduct] = useState(null);
  const [newMemberPassDraft, setNewMemberPassDraft] = useState({
    startDate: toDateInputValue(),
    expiresAt: "",
    remainingCount: "",
    amount: "",
    paymentMethod: "card",
    paymentNote: "",
  });
  const [newMemberPassConfig, setNewMemberPassConfig] = useState(null);

  const [showGoodsModal, setShowGoodsModal] = useState(false);
  const [goodsList, setGoodsList] = useState([]);
  const [goodsLoading, setGoodsLoading] = useState(false);
  const [goodsSearch, setGoodsSearch] = useState("");
  const [goodsTabFilter, setGoodsTabFilter] = useState("");
  const [newMemberGoodsConfig, setNewMemberGoodsConfig] = useState(null);

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

  async function loadConsultations() {
    try {
      setConsultLoading(true);
      const items = await listAdminConsultations({
        type: consultTypeFilter,
        staffName: consultStaffFilter,
        search: consultSearch,
      });
      setConsultations(items);
    } catch {
      setConsultations([]);
    } finally {
      setConsultLoading(false);
    }
  }

  async function loadPassHistory() {
    try {
      setPassHistoryLoading(true);
      const txs = await listAdminPassTransactions({ date: passHistoryDate, limit: 500 });
      setPassTransactions(Array.isArray(txs) ? txs : []);
    } catch {
      setPassTransactions([]);
    } finally {
      setPassHistoryLoading(false);
    }
  }

  async function handleSaveConsultation() {
    const name = String(consultDraft.name || "").trim();
    if (!name) {
      setMemoMessage("이름을 입력해 주세요.");
      return;
    }
    try {
      setConsultLoading(true);
      await createAdminConsultation({
        type: consultDraft.type,
        staffName: consultDraft.staff,
        customerName: name,
        customerPhone: consultDraft.phone,
        consultDate: consultDraft.date,
        startTime: consultDraft.startTime,
        endTime: consultDraft.endTime,
        memo: consultDraft.memo,
      });
      setConsultDraft({
        type: "전화상담",
        staff: currentUserName,
        date: toDateInputValue(),
        startTime: "15:10",
        endTime: "15:40",
        name: "",
        phone: "",
        memo: "",
      });
      await loadConsultations();
      setMemoMessage("상담이 저장되었습니다.");
    } catch (error) {
      setMemoMessage(error.message || "상담 저장에 실패했습니다.");
      setConsultLoading(false);
    }
  }

  async function handleDeleteConsultation(id) {
    if (!window.confirm("상담을 삭제하시겠습니까?")) return;
    try {
      await deleteAdminConsultation(id);
      setConsultations((previous) => previous.filter((item) => item.id !== id));
    } catch (error) {
      setMemoMessage(error.message || "상담 삭제에 실패했습니다.");
    }
  }

  useEffect(() => {
    if (activeMemberTab === "consulting") loadConsultations();
  }, [activeMemberTab, consultTypeFilter, consultStaffFilter, consultSearch]);

  useEffect(() => {
    if (activeMemberTab === "passHistory") loadPassHistory();
  }, [activeMemberTab, passHistoryDate]);

  const managedMembers = useMemo(
    () =>
      members
        .filter((member) => !isAdminAccount(member) && isStudioManagedMember(member))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko-KR")),
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

  const passNames = useMemo(() => {
    const names = new Set();
    managedMembers.forEach((member) => (member.passes || []).forEach((pass) => names.add(pass.passName)));
    return [...names].filter(Boolean).sort();
  }, [managedMembers]);

  const filteredMembers = useMemo(() => {
    return managedMembers.filter((member) => {
      if (filterStatus && getMemberStatus(member) !== filterStatus) return false;
      if (filterGrade && member.userGrade !== filterGrade) return false;
      if (filterPass) {
        const passes = Array.isArray(member.passes) ? member.passes : [];
        const hasPass = passes.some((pass) => {
          const passText = `${pass.passName || ""} ${getPassTypeLabel(pass.passType)}`;
          return passText.includes(filterPass);
        });
        if (!hasPass) return false;
      }
      if (filterNoVisit) {
        const daysSinceVisit = calcDaysSinceVisit(member.lastVisitAt);
        if (daysSinceVisit === null || daysSinceVisit < Number(filterNoVisit)) return false;
      }
      if (filterDaysLeft) {
        const pass = getPrimaryPass(member);
        const daysLeft = calcDaysLeft(pass?.expiresAt);
        if (daysLeft === null || daysLeft > Number(filterDaysLeft)) return false;
      }
      if (filterCountLeft) {
        const pass = getPrimaryPass(member);
        if (!pass || Number(pass.remainingCount || 0) > Number(filterCountLeft)) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const memberRows = buildMemberPassRows([member]);
        if (!memberRows.some((row) => getRowSearchText(row).includes(query))) return false;
      }
      return true;
    });
  }, [managedMembers, filterStatus, filterGrade, filterPass, filterNoVisit, filterDaysLeft, filterCountLeft, searchQuery]);

  const filteredRows = useMemo(() => buildMemberPassRows(filteredMembers), [filteredMembers]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginationItems = useMemo(() => {
    if (totalPages <= 9) return Array.from({ length: totalPages }, (_, index) => index + 1);

    const pageSet = new Set([1, totalPages]);
    for (let pageNumber = safePage - 2; pageNumber <= safePage + 2; pageNumber += 1) {
      if (pageNumber > 1 && pageNumber < totalPages) pageSet.add(pageNumber);
    }

    const pages = [...pageSet].sort((a, b) => a - b);
    const items = [];
    pages.forEach((pageNumber, index) => {
      const previous = pages[index - 1];
      if (previous && pageNumber - previous > 1) items.push(`ellipsis-${previous}-${pageNumber}`);
      items.push(pageNumber);
    });
    return items;
  }, [safePage, totalPages]);
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

  function sendManualNotification(targetMembers) {
    const targets = Array.isArray(targetMembers) ? targetMembers.filter(Boolean) : [];
    if (!targets.length) {
      setMemoMessage("알림을 보낼 회원이 없습니다.");
      return;
    }
    setSmsReceivers(targets.map((m) => ({ phone: m.phone, name: m.name, userId: m.id })));
    setSmsOpen(true);
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
        branchId: passDraft.branchId || DEFAULT_STUDIO_BRANCH_ID,
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
        branchId: DEFAULT_STUDIO_BRANCH_ID,
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

  function handleDownloadXlsx() {
    const headers = ["이름", "전화번호", "가입일", "최근출석일", "수강권", "상품", "앱연결", "스튜디오상태"];
    const lines = filteredRows.map(({ member }) => [
      member.name || "",
      member.phone || "",
      formatDate(member.studioRegisteredAt || member.createdAt),
      formatDate(member.lastVisitAt),
      getPassSummary(member),
      getProductSummary(member),
      member.appConnectionStatus === "connected" ? "연결" : "미연결",
      getStudioMemberStatusLabel(member.studioMemberStatus),
    ]);
    downloadXlsx(`studio-members-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      { name: "필라테스회원목록", rows: [headers, ...lines] },
    ]);
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

  async function loadPassProductList() {
    try {
      setPassProductsLoading(true);
      const products = await listAdminPassProducts();
      setPassProducts(Array.isArray(products) ? products.filter((p) => !p.status || p.status === "active") : []);
    } catch {
      setPassProducts([]);
    } finally {
      setPassProductsLoading(false);
    }
  }

  async function loadGoodsList() {
    try {
      setGoodsLoading(true);
      const items = await listAdminGoods();
      setGoodsList(Array.isArray(items) ? items.filter((g) => !g.status || g.status === "active") : []);
    } catch {
      setGoodsList([]);
    } finally {
      setGoodsLoading(false);
    }
  }

  function openPassModal() {
    setShowPassModal(true);
    setPassModalStep(1);
    setSelectedPassProduct(null);
    setPassSearch("");
    setPassTabFilter("");
    loadPassProductList();
  }

  function openGoodsModal() {
    setShowGoodsModal(true);
    setGoodsSearch("");
    setGoodsTabFilter("");
    loadGoodsList();
  }

  function handleSelectPassProduct(product) {
    setSelectedPassProduct(product);
    const expiryMs = product.validDays ? Date.now() + Number(product.validDays) * 86400000 : null;
    setNewMemberPassDraft({
      startDate: createMemberDraft.registeredAt || toDateInputValue(),
      expiresAt: expiryMs ? toDateInputValue(new Date(expiryMs)) : "",
      remainingCount: String(product.totalCount || 0),
      amount: String(product.price || 0),
      paymentMethod: "card",
      paymentNote: "",
    });
    setPassModalStep(2);
  }

  function handleConfirmPass() {
    if (!selectedPassProduct) return;
    setNewMemberPassConfig({ product: selectedPassProduct, draft: { ...newMemberPassDraft } });
    setShowPassModal(false);
  }

  function handleSelectGoods(goods) {
    setNewMemberGoodsConfig({ goods });
    setShowGoodsModal(false);
  }

  async function handleCreateMemberSubmit() {
    const name = String(createMemberDraft.name || "").trim();
    if (!name) {
      setMemoMessage("이름을 입력해 주세요.");
      return;
    }
    try {
      setCreatingMember(true);
      setMemoMessage("");
      const created = await createAdminStudioMember({
        name,
        phone: createMemberDraft.phone,
        gender: createMemberDraft.gender,
        birthDate: createMemberDraft.birthDate,
        userGrade: createMemberDraft.userGrade,
        primaryInstructor: createMemberDraft.primaryInstructor,
        registeredAt: createMemberDraft.registeredAt,
      });
      if (newMemberPassConfig && created.id) {
        const { product, draft } = newMemberPassConfig;
        await createAdminPass({
          userId: created.id,
          branchId: product.branchId || DEFAULT_STUDIO_BRANCH_ID,
          passName: product.name,
          passType: product.passType,
          totalCount: Number(product.totalCount || 0),
          remainingCount: Number(draft.remainingCount || product.totalCount || 0),
          expiresAt: draft.expiresAt || null,
          amount: Number(draft.amount || 0),
          paymentMethod: draft.paymentMethod,
          installmentMonths: "",
          paymentNote: draft.paymentNote,
        }).catch(() => null);
      }
      setShowCreateMember(false);
      setCreateMemberDraft({ name: "", phone: "", gender: "", birthDate: "", userGrade: "member", primaryInstructor: "", registeredAt: toDateInputValue(), memo: "" });
      setNewMemberPassConfig(null);
      setNewMemberGoodsConfig(null);
      await loadMembers();
      setMemoMessage(`${created.name || name} 회원이 등록되었습니다.`);
    } catch (error) {
      setMemoMessage(error.message || "회원 등록에 실패했습니다.");
    } finally {
      setCreatingMember(false);
    }
  }

  const statusOptions = [
    { value: "", label: `전체회원 (${statusCounts.전체}명)` },
    { value: "이용", label: `이용회원 (${statusCounts.이용 || 0}명)` },
    { value: "만료", label: `만료회원 (${statusCounts.만료 || 0}명)` },
    { value: "미결제", label: `미결제회원 (${statusCounts.미결제 || 0}명)` },
    { value: "수강권 없음", label: `수강권 없음 (${statusCounts["수강권 없음"] || 0}명)` },
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
    <AdminLayout
      appClass="admin-memberlist-app"
      userName={currentUserName}
      searchValue={searchQuery}
      onSearchChange={(e) => handleTopSearchChange(e.target.value)}
      onSearchKeyDown={handleTopSearchKeyDown}
      onAddMember={() => navigate("/admin")}
      showNotification
    >

      <div className="admin-memberlist-body">
        <div className="admin-memberlist-title-row">
          <div className="admin-memberlist-tabs">
            {MEMBER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`admin-memberlist-tab-btn${activeMemberTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveMemberTab(tab.id)}
              >
                {tab.label}
                {tab.beta ? <em> Beta</em> : null}
              </button>
            ))}
          </div>
          {activeMemberTab === "members" ? (
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
              <button type="button" className="admin-classlist-btn primary" onClick={handleDownloadXlsx}>엑셀다운로드</button>
            </div>
          ) : null}
        </div>

        {activeMemberTab === "members" ? (
        <>
        <div className="admin-memberlist-filterbar">
          <div className="admin-memberlist-filterbar-left">
            <ListDropdown
              label={filterStatus ? `${filterStatus}회원` : `전체회원 (${managedMembers.length}명)`}
              active={Boolean(filterStatus)}
              options={statusOptions}
              value={filterStatus}
              onChange={(value) => { setFilterStatus(value); setPage(1); }}
            />
            <ListDropdown
              label={filterPass || "전체수강권"}
              active={Boolean(filterPass)}
              options={passOptions}
              value={filterPass}
              onChange={(value) => { setFilterPass(value); setPage(1); }}
            />
            <ListDropdown
              label={filterGrade ? formatUserGradeLabel(filterGrade) : "회원등급 전체"}
              active={Boolean(filterGrade)}
              options={gradeOptions}
              value={filterGrade}
              onChange={(value) => { setFilterGrade(value); setPage(1); }}
            />
            <NumericDropdown
              label="미방문일수"
              unit="일"
              mode="이상"
              value={filterNoVisit}
              onChange={(value) => { setFilterNoVisit(value); setPage(1); }}
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
            <p>현재 화면은 스튜디오 수강권, 출석, 미수금, 회원상태가 있는 필라테스 회원만 표시합니다.</p>
            <button type="button" onClick={handleDownloadXlsx}>현재 목록 내려받기</button>
          </div>
        ) : null}

        {memoMessage ? <p className="admin-memberlist-memo-message">{memoMessage}</p> : null}

        <div className="admin-memberlist-table-wrap">
          <table className="admin-memberlist-table icl-studio-member-table">
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
              ) : pageRows.map(({ member, rowId }) => (
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
                      <span className="admin-member-avatar" aria-hidden="true">
                        <svg viewBox="0 0 40 40" role="img">
                          <circle cx="20" cy="20" r="20" fill="#d7dee7" />
                          <circle cx="20" cy="15" r="6" fill="#9eacba" />
                          <path d="M8 34c2.6-7 6.8-10.5 12-10.5S29.4 27 32 34" fill="#9eacba" />
                        </svg>
                      </span>
                      <div>
                        <strong>{member.name || "-"}</strong>
                        <div className="admin-member-compact-badges">
                          <span className={`admin-member-scope-badge ${getUsageScope(member)}`}>
                            {getUsageScopeLabel(member) || "필라테스회원"}
                          </span>
                          {member.studioMemberStatus === "expired" ? (
                            <span className="admin-member-scope-badge expired">만료 회원</span>
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
                  <td>{formatDate(member.lastVisitAt)}</td>
                  <td>
                    <div className="admin-member-pass-summary">
                      <strong>{getPassSummary(member)}</strong>
                      {getPrimaryPass(member) ? (
                        <span>{getStudioBranchName(getPrimaryPass(member)?.branchId)} · {getPassStatusLabel(getPrimaryPass(member))}</span>
                      ) : (
                        <span>수강권 없음</span>
                      )}
                    </div>
                  </td>
                  <td>{getProductSummary(member)}</td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className={`admin-member-app-link ${member.appConnectionStatus === "connected" ? "connected" : ""}`}
                      onClick={() => handleChangeAppConnection(member, member.appConnectionStatus === "connected" ? "not_connected" : "connected")}
                      title={member.appConnectionStatus === "connected" ? "앱 연결 해제" : "앱 연결 처리"}
                    >
                      {member.appConnectionStatus === "connected" ? "연결" : "미연결"}
                    </button>
                  </td>
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
                      <span>{getStudioBranchName(pass.branchId)} · {getPassStatusLabel(pass)}</span>
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
                  <select
                    value={passDraft.branchId || DEFAULT_STUDIO_BRANCH_ID}
                    onChange={(event) => setPassDraft((previous) => ({ ...previous, branchId: event.target.value }))}
                    aria-label="수강권 지점"
                  >
                    {STUDIO_BRANCHES.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
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
                  <p>스튜디오에서 별도 판매한 상품 이용내역을 확인합니다.</p>
                </div>
                <button type="button" onClick={() => setDetailTab("payments")}>이전 상품 보기</button>
              </div>
              <div className="admin-member-detail-card-row">
                <button type="button" className="admin-member-detail-create-card" onClick={() => navigate("/admin/passes")}>
                  <span>＋</span>
                  <small>새로운 상품 만들기</small>
                </button>
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
          {paginationItems.map((item) =>
            typeof item === "number" ? (
              <button key={item} type="button" className={item === safePage ? "active" : ""} onClick={() => setPage(item)}>
                {item}
              </button>
            ) : (
              <span key={item} className="admin-classlist-pagination-ellipsis">…</span>
            )
          )}
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((value) => value + 1)}>›</button>
          <span className="admin-classlist-perpage">{PAGE_SIZE}/page</span>
        </div>
        </>
        ) : null}

        {activeMemberTab === "consulting" ? (
          <div className="admin-consulting-panel">
            <div className="admin-consulting-form-card">
              <h3 className="admin-consulting-form-title">상담 등록</h3>
              <div className="admin-consulting-form-grid">
                <label className="admin-consulting-label">
                  <span>상담유형</span>
                  <select
                    value={consultDraft.type}
                    onChange={(e) => setConsultDraft((p) => ({ ...p, type: e.target.value }))}
                  >
                    <option value="전화상담">전화상담</option>
                    <option value="방문상담">방문상담</option>
                    <option value="온라인상담">온라인상담</option>
                    <option value="문자상담">문자상담</option>
                  </select>
                </label>
                <label className="admin-consulting-label">
                  <span>담당스태프</span>
                  <input
                    type="text"
                    value={consultDraft.staff}
                    onChange={(e) => setConsultDraft((p) => ({ ...p, staff: e.target.value }))}
                  />
                </label>
                <label className="admin-consulting-label">
                  <span>상담일자</span>
                  <input
                    type="date"
                    value={consultDraft.date}
                    onChange={(e) => setConsultDraft((p) => ({ ...p, date: e.target.value }))}
                  />
                </label>
                <div className="admin-consulting-time-row">
                  <label className="admin-consulting-label">
                    <span>시작시간</span>
                    <input
                      type="time"
                      value={consultDraft.startTime}
                      onChange={(e) => setConsultDraft((p) => ({ ...p, startTime: e.target.value }))}
                    />
                  </label>
                  <span className="admin-consulting-time-sep">~</span>
                  <label className="admin-consulting-label">
                    <span>종료시간</span>
                    <input
                      type="time"
                      value={consultDraft.endTime}
                      onChange={(e) => setConsultDraft((p) => ({ ...p, endTime: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="admin-consulting-label">
                  <span>이름</span>
                  <input
                    type="text"
                    placeholder="고객 이름"
                    value={consultDraft.name}
                    onChange={(e) => setConsultDraft((p) => ({ ...p, name: e.target.value }))}
                  />
                </label>
                <label className="admin-consulting-label">
                  <span>휴대폰번호</span>
                  <input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={consultDraft.phone}
                    onChange={(e) => setConsultDraft((p) => ({ ...p, phone: e.target.value }))}
                  />
                </label>
                <label className="admin-consulting-label wide">
                  <span>상담내용</span>
                  <textarea
                    rows={3}
                    placeholder="상담 내용을 입력하세요"
                    value={consultDraft.memo}
                    onChange={(e) => setConsultDraft((p) => ({ ...p, memo: e.target.value }))}
                  />
                </label>
              </div>
              <div className="admin-consulting-form-actions">
                <button
                  type="button"
                  className="admin-consulting-save-btn"
                  disabled={consultLoading}
                  onClick={handleSaveConsultation}
                >
                  저장
                </button>
                <button
                  type="button"
                  className="admin-consulting-cancel-btn"
                  onClick={() => setConsultDraft({ type: "전화상담", staff: currentUserName, date: toDateInputValue(), startTime: "15:10", endTime: "15:40", name: "", phone: "", memo: "" })}
                >
                  취소
                </button>
              </div>
            </div>

            <div className="admin-consulting-filterbar">
              <select
                value={consultTypeFilter}
                onChange={(e) => setConsultTypeFilter(e.target.value)}
              >
                <option value="">유형 전체</option>
                <option value="전화상담">전화상담</option>
                <option value="방문상담">방문상담</option>
                <option value="온라인상담">온라인상담</option>
                <option value="문자상담">문자상담</option>
              </select>
              <input
                type="text"
                placeholder="담당스태프"
                value={consultStaffFilter}
                onChange={(e) => setConsultStaffFilter(e.target.value)}
              />
              <button type="button" className="admin-consulting-refresh-btn" onClick={loadConsultations} title="새로고침">↻</button>
              <input
                type="search"
                className="admin-consulting-search"
                placeholder="이름/전화번호/내용 검색"
                value={consultSearch}
                onChange={(e) => setConsultSearch(e.target.value)}
              />
            </div>

            <div className="admin-consulting-table-wrap">
              <table className="admin-consulting-table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>상담일자</th>
                    <th>상담내용</th>
                    <th>담당스태프</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {consultLoading ? (
                    <tr><td colSpan={5} className="admin-classlist-empty">불러오는 중입니다.</td></tr>
                  ) : consultations.length === 0 ? (
                    <tr><td colSpan={5} className="admin-classlist-empty">등록된 상담 내역이 없습니다.</td></tr>
                  ) : consultations.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.customerName || "-"}</strong>
                        {c.customerPhone ? <small>{c.customerPhone}</small> : null}
                      </td>
                      <td>
                        <div>{formatDate(c.consultDate)}</div>
                        {c.startTime ? <small>{c.startTime}{c.endTime ? ` ~ ${c.endTime}` : ""}</small> : null}
                      </td>
                      <td>
                        <span className={`admin-consult-type-badge type-${String(c.type || "").replace(/\s/g, "")}`}>{c.type || "-"}</span>
                        {c.memo ? <span className="admin-consult-memo-text">{c.memo}</span> : null}
                      </td>
                      <td>{c.staffName || "-"}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-consulting-del-btn"
                          onClick={() => handleDeleteConsultation(c.id)}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeMemberTab === "passHistory" ? (
          <div className="admin-passhistory-panel">
            <div className="admin-passhistory-filterbar">
              <button
                type="button"
                className="admin-passhistory-nav-btn"
                onClick={() => {
                  const d = new Date(passHistoryDate);
                  d.setDate(d.getDate() - 1);
                  setPassHistoryDate(toDateInputValue(d));
                }}
              >‹</button>
              <input
                type="date"
                className="admin-passhistory-date-input"
                value={passHistoryDate}
                onChange={(e) => setPassHistoryDate(e.target.value)}
              />
              <button
                type="button"
                className="admin-passhistory-nav-btn"
                onClick={() => {
                  const d = new Date(passHistoryDate);
                  d.setDate(d.getDate() + 1);
                  setPassHistoryDate(toDateInputValue(d));
                }}
              >›</button>
              <button
                type="button"
                className="admin-passhistory-today-btn"
                onClick={() => setPassHistoryDate(toDateInputValue())}
              >오늘</button>
              <input
                type="text"
                className="admin-passhistory-staff-input"
                placeholder="변경 사유"
                value={passHistoryStaff}
                onChange={(e) => setPassHistoryStaff(e.target.value)}
              />
              <button type="button" className="admin-consulting-refresh-btn" onClick={loadPassHistory} title="새로고침">↻</button>
              <input
                type="search"
                className="admin-passhistory-search"
                placeholder="회원명/수강권명 검색"
                value={passHistorySearch}
                onChange={(e) => setPassHistorySearch(e.target.value)}
              />
            </div>

            <div className="admin-passhistory-table-wrap">
              <table className="admin-passhistory-table">
                <thead>
                  <tr>
                    <th>변경일시</th>
                    <th>변경한 사람</th>
                    <th>회원명</th>
                    <th>수강권명</th>
                    <th>종류</th>
                    <th>변경 전·후 내용</th>
                  </tr>
                </thead>
                <tbody>
                  {passHistoryLoading ? (
                    <tr><td colSpan={6} className="admin-classlist-empty">불러오는 중입니다.</td></tr>
                  ) : passTransactions.filter((tx) => {
                    const staffQ = passHistoryStaff.toLowerCase();
                    const searchQ = passHistorySearch.toLowerCase();
                    if (staffQ && !String(tx.reason || tx.classTitle || "").toLowerCase().includes(staffQ)) return false;
                    if (
                      searchQ &&
                      !String(tx.userName || "").toLowerCase().includes(searchQ) &&
                      !String(tx.passName || "").toLowerCase().includes(searchQ) &&
                      !String(tx.reason || "").toLowerCase().includes(searchQ)
                    ) return false;
                    return true;
                  }).length === 0 ? (
                    <tr><td colSpan={6} className="admin-classlist-empty">해당 날짜의 변경 이력이 없습니다.</td></tr>
                  ) : passTransactions.filter((tx) => {
                    const staffQ = passHistoryStaff.toLowerCase();
                    const searchQ = passHistorySearch.toLowerCase();
                    if (staffQ && !String(tx.reason || tx.classTitle || "").toLowerCase().includes(staffQ)) return false;
                    if (
                      searchQ &&
                      !String(tx.userName || "").toLowerCase().includes(searchQ) &&
                      !String(tx.passName || "").toLowerCase().includes(searchQ) &&
                      !String(tx.reason || "").toLowerCase().includes(searchQ)
                    ) return false;
                    return true;
                  }).map((tx) => (
                    <tr key={tx.id}>
                      <td>{formatDateTime(tx.createdAt)}</td>
                      <td>관리자</td>
                      <td>{tx.userName || "-"}</td>
                      <td>{tx.passName || "-"}</td>
                      <td><span className="admin-passkind-badge">{getPassTransactionTypeLabel(tx)}</span></td>
                      <td>
                        <strong>{tx.reason || tx.classTitle || "수강권 변경"}</strong>
                        <small>변동 {Number(tx.deltaCount || 0).toLocaleString()}회</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeMemberTab === "contracts" ? (
          <div className="admin-coming-soon-panel">
            <div className="admin-coming-soon-inner">
              <div className="admin-coming-soon-icon">📋</div>
              <h3>전자계약서</h3>
              <p>준비중입니다.</p>
            </div>
          </div>
        ) : null}
      </div>

      <button className="admin-memberlist-floating-add" type="button" onClick={() => setShowCreateMember(true)} title="회원 등록">
        +
      </button>

      {showCreateMember ? (
        <div className="admin-create-member-overlay">
          <div className="admin-create-member-body">
            <div className="admin-create-member-hero">
              <div className="admin-create-member-hero-left">
                <input
                  className="admin-create-member-name-input"
                  type="text"
                  placeholder="이름을 입력해주세요"
                  value={createMemberDraft.name}
                  onChange={(e) => setCreateMemberDraft((p) => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
                <div className="admin-create-member-fields">
                  <div className="admin-create-member-field">
                    <span>등록일</span>
                    <input
                      type="date"
                      value={createMemberDraft.registeredAt}
                      onChange={(e) => setCreateMemberDraft((p) => ({ ...p, registeredAt: e.target.value }))}
                    />
                  </div>
                  <div className="admin-create-member-field">
                    <span>회원등급</span>
                    <select
                      value={createMemberDraft.userGrade}
                      onChange={(e) => setCreateMemberDraft((p) => ({ ...p, userGrade: e.target.value }))}
                    >
                      <option value="member">일반회원</option>
                      <option value="vip">VIP</option>
                      <option value="vvip">VVIP</option>
                    </select>
                  </div>
                  <div className="admin-create-member-field">
                    <span>휴대폰번호</span>
                    <input
                      type="tel"
                      placeholder="휴대폰 번호"
                      value={createMemberDraft.phone}
                      onChange={(e) => setCreateMemberDraft((p) => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                  <div className="admin-create-member-field">
                    <span>성별</span>
                    <select
                      value={createMemberDraft.gender}
                      onChange={(e) => setCreateMemberDraft((p) => ({ ...p, gender: e.target.value }))}
                    >
                      <option value="">선택안함</option>
                      <option value="여성">여성</option>
                      <option value="남성">남성</option>
                    </select>
                  </div>
                  <div className="admin-create-member-field">
                    <span>생년월일</span>
                    <input
                      type="date"
                      placeholder="생년월일 (YYYY-MM-DD)"
                      value={createMemberDraft.birthDate}
                      onChange={(e) => setCreateMemberDraft((p) => ({ ...p, birthDate: e.target.value }))}
                    />
                  </div>
                  <div className="admin-create-member-field">
                    <span>담당강사</span>
                    <input
                      type="text"
                      placeholder="담당강사"
                      value={createMemberDraft.primaryInstructor}
                      onChange={(e) => setCreateMemberDraft((p) => ({ ...p, primaryInstructor: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="admin-create-member-avatar-col">
                <div className="admin-create-member-avatar">
                  <svg viewBox="0 0 80 80" aria-hidden="true">
                    <circle cx="40" cy="40" r="40" fill="#d7dee7" />
                    <circle cx="40" cy="30" r="14" fill="#9eacba" />
                    <path d="M14 72c5-15 13-20 26-20s21 5 26 20" fill="#9eacba" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="admin-create-member-section">
              <h3>01. 사용중인 수강권</h3>
              <p className="admin-create-member-section-desc">수강권을 등록해 주세요.</p>
              <div className="admin-create-member-card-row">
                {newMemberPassConfig ? (
                  <div
                    className="admin-create-member-selected-pass"
                    style={{ background: newMemberPassConfig.product.color || "#4aa3ff" }}
                  >
                    <div className="admin-create-member-selected-pass-tags">
                      {getPassTypeLabel(newMemberPassConfig.product.passType)}
                    </div>
                    <div className="admin-create-member-selected-pass-name">
                      {newMemberPassConfig.product.name}
                    </div>
                    <div className="admin-create-member-selected-pass-meta">
                      잔여 {newMemberPassConfig.draft.remainingCount}회 · 만료 {newMemberPassConfig.draft.expiresAt || "-"}
                    </div>
                    <button
                      type="button"
                      className="admin-create-member-selected-remove-btn"
                      onClick={() => setNewMemberPassConfig(null)}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="admin-create-member-plus-card"
                    onClick={openPassModal}
                  >
                    <span>＋</span>
                    <small>새로운 수강권 만들기</small>
                  </button>
                )}
              </div>
              {!newMemberPassConfig && (
                <p className="admin-create-member-hint">회원 등록 후 수강권 탭에서 추가할 수 있습니다.</p>
              )}
            </div>

            <div className="admin-create-member-section">
              <h3>02. 사용중인 상품</h3>
              <p className="admin-create-member-section-desc">상품을 등록해 주세요.</p>
              <div className="admin-create-member-card-row">
                {newMemberGoodsConfig ? (
                  <div className="admin-create-member-selected-goods">
                    <div className="admin-create-member-selected-goods-name">
                      {newMemberGoodsConfig.goods.name}
                    </div>
                    <div className="admin-create-member-selected-goods-meta">
                      {newMemberGoodsConfig.goods.goodsType === "rental" ? "대여" : "판매"} · {Number(newMemberGoodsConfig.goods.price || 0).toLocaleString()}원
                    </div>
                    <button
                      type="button"
                      className="admin-create-member-selected-remove-btn admin-create-member-selected-remove-btn--goods"
                      onClick={() => setNewMemberGoodsConfig(null)}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="admin-create-member-plus-card"
                    onClick={openGoodsModal}
                  >
                    <span>＋</span>
                    <small>새로운 상품 만들기</small>
                  </button>
                )}
              </div>
              {!newMemberGoodsConfig && (
                <p className="admin-create-member-hint">회원 등록 후 상품을 추가할 수 있습니다.</p>
              )}
            </div>

            <div className="admin-create-member-section">
              <div className="admin-create-member-section-head">
                <h3>03. 메모</h3>
              </div>
              <textarea
                className="admin-create-member-memo-input"
                rows={3}
                placeholder="특이사항 메모"
                value={createMemberDraft.memo}
                onChange={(e) => setCreateMemberDraft((p) => ({ ...p, memo: e.target.value }))}
              />
            </div>
          </div>

          <div className="admin-create-member-footer">
            <button
              type="button"
              className="admin-create-member-back-btn"
              onClick={() => setShowCreateMember(false)}
            >
              ‹ 뒤로가기
            </button>
            <button
              type="button"
              className="admin-create-member-submit-btn"
              disabled={creatingMember}
              onClick={handleCreateMemberSubmit}
            >
              {creatingMember ? "등록 중…" : "회원 등록 완료"}
            </button>
          </div>
        </div>
      ) : null}

      {showPassModal ? (
        <div className="reg-modal-overlay" onClick={() => setShowPassModal(false)}>
          <div className="reg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reg-modal-header">
              <span className="reg-modal-title">수강권 등록</span>
              <div className="reg-modal-steps">
                <span className={`reg-modal-step${passModalStep >= 1 ? " active" : ""}`}>1</span>
                <span className="reg-modal-step-line" />
                <span className={`reg-modal-step${passModalStep >= 2 ? " active" : ""}`}>2</span>
                <span className="reg-modal-step-line" />
                <span className={`reg-modal-step${passModalStep >= 3 ? " active" : ""}`}>3</span>
              </div>
              <button type="button" className="reg-modal-close" onClick={() => setShowPassModal(false)}>×</button>
            </div>

            {passModalStep === 1 && (
              <div className="reg-modal-body">
                <p className="reg-modal-subtitle">수강권을 선택해주세요</p>
                <div className="reg-modal-search-wrap">
                  <input
                    type="search"
                    placeholder="수강권명 검색"
                    value={passSearch}
                    onChange={(e) => setPassSearch(e.target.value)}
                  />
                </div>
                <div className="reg-modal-tabs">
                  {[
                    { v: "", l: "전체" },
                    { v: "personal", l: "프라이빗" },
                    { v: "group", l: "그룹" },
                    { v: "duet", l: "듀엣" },
                    { v: "featured", l: "즐겨찾기" },
                  ].map((t) => (
                    <button
                      key={t.v}
                      type="button"
                      className={passTabFilter === t.v ? "active" : ""}
                      onClick={() => setPassTabFilter(t.v)}
                    >
                      {t.l}
                    </button>
                  ))}
                </div>
                <div className="reg-modal-grid">
                  {passProductsLoading ? (
                    <p className="reg-modal-empty">불러오는 중...</p>
                  ) : passProducts
                      .filter((p) => {
                        if (passTabFilter === "personal") return p.passType === "personal";
                        if (passTabFilter === "group") return p.passType === "group";
                        if (passTabFilter === "duet") return p.passType === "duet";
                        if (passTabFilter === "featured") return p.isFeatured;
                        return true;
                      })
                      .filter((p) => !passSearch || String(p.name || "").toLowerCase().includes(passSearch.toLowerCase()))
                      .length === 0 ? (
                    <p className="reg-modal-empty">등록된 수강권이 없습니다.</p>
                  ) : (
                    passProducts
                      .filter((p) => {
                        if (passTabFilter === "personal") return p.passType === "personal";
                        if (passTabFilter === "group") return p.passType === "group";
                        if (passTabFilter === "duet") return p.passType === "duet";
                        if (passTabFilter === "featured") return p.isFeatured;
                        return true;
                      })
                      .filter((p) => !passSearch || String(p.name || "").toLowerCase().includes(passSearch.toLowerCase()))
                      .map((p) => (
                        <div key={p.id} className="reg-pass-card" onClick={() => handleSelectPassProduct(p)}>
                          <div className="reg-pass-card-top" style={{ background: p.color || "#4aa3ff" }}>
                            <div className="reg-pass-card-tags">
                              {p.totalCount > 0 ? "횟수제" : "기간제"} · {getPassTypeLabel(p.passType)}
                            </div>
                            <div className="reg-pass-card-name">{p.name}</div>
                            <div className="reg-pass-card-meta">
                              {p.validDays ? `${p.validDays}일` : ""}{p.totalCount ? ` · ${p.totalCount}회` : ""}
                            </div>
                          </div>
                          <div className="reg-pass-card-bottom">
                            <span>판매 금액 {Number(p.price || 0).toLocaleString()}원</span>
                            {p.totalCount > 0 && (
                              <small>회당 {Math.round((p.price || 0) / p.totalCount).toLocaleString()}원</small>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}

            {passModalStep === 2 && selectedPassProduct && (
              <div className="reg-modal-body">
                <p className="reg-modal-subtitle">수강권 정보를 입력해주세요</p>
                <div className="reg-modal-selected-info">
                  <span
                    className="reg-modal-selected-badge"
                    style={{ background: selectedPassProduct.color || "#4aa3ff" }}
                  >
                    {selectedPassProduct.name}
                  </span>
                </div>
                <div className="reg-modal-form">
                  <label>
                    <span>시작일</span>
                    <input
                      type="date"
                      value={newMemberPassDraft.startDate}
                      onChange={(e) => setNewMemberPassDraft((p) => ({ ...p, startDate: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>만료일</span>
                    <input
                      type="date"
                      value={newMemberPassDraft.expiresAt}
                      onChange={(e) => setNewMemberPassDraft((p) => ({ ...p, expiresAt: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>잔여횟수</span>
                    <input
                      type="number"
                      min="0"
                      value={newMemberPassDraft.remainingCount}
                      onChange={(e) => setNewMemberPassDraft((p) => ({ ...p, remainingCount: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>결제금액</span>
                    <input
                      type="number"
                      min="0"
                      value={newMemberPassDraft.amount}
                      onChange={(e) => setNewMemberPassDraft((p) => ({ ...p, amount: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>결제방법</span>
                    <select
                      value={newMemberPassDraft.paymentMethod}
                      onChange={(e) => setNewMemberPassDraft((p) => ({ ...p, paymentMethod: e.target.value }))}
                    >
                      <option value="card">카드</option>
                      <option value="cash">현금</option>
                      <option value="transfer">계좌이체</option>
                      <option value="etc">기타</option>
                    </select>
                  </label>
                  <label>
                    <span>메모</span>
                    <input
                      type="text"
                      placeholder="할부/메모"
                      value={newMemberPassDraft.paymentNote}
                      onChange={(e) => setNewMemberPassDraft((p) => ({ ...p, paymentNote: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="reg-modal-actions">
                  <button type="button" onClick={() => setPassModalStep(1)}>이전</button>
                  <button type="button" className="primary" onClick={handleConfirmPass}>수강권 추가</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showGoodsModal ? (
        <div className="reg-modal-overlay" onClick={() => setShowGoodsModal(false)}>
          <div className="reg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reg-modal-header">
              <span className="reg-modal-title">상품 등록</span>
              <div className="reg-modal-steps">
                <span className="reg-modal-step active">1</span>
                <span className="reg-modal-step-line" />
                <span className="reg-modal-step">2</span>
                <span className="reg-modal-step-line" />
                <span className="reg-modal-step">3</span>
              </div>
              <button type="button" className="reg-modal-close" onClick={() => setShowGoodsModal(false)}>×</button>
            </div>
            <div className="reg-modal-body">
              <p className="reg-modal-subtitle">상품을 선택해주세요</p>
              <div className="reg-modal-search-wrap">
                <input
                  type="search"
                  placeholder="상품명 검색"
                  value={goodsSearch}
                  onChange={(e) => setGoodsSearch(e.target.value)}
                />
              </div>
              <div className="reg-modal-tabs">
                {[
                  { v: "", l: "전체" },
                  { v: "sale", l: "판매" },
                  { v: "rental", l: "대여" },
                  { v: "featured", l: "즐겨찾기" },
                ].map((t) => (
                  <button
                    key={t.v}
                    type="button"
                    className={goodsTabFilter === t.v ? "active" : ""}
                    onClick={() => setGoodsTabFilter(t.v)}
                  >
                    {t.l}
                  </button>
                ))}
              </div>
              <div className="reg-modal-grid">
                {goodsLoading ? (
                  <p className="reg-modal-empty">불러오는 중...</p>
                ) : goodsList
                    .filter((g) => {
                      if (goodsTabFilter === "sale") return g.goodsType === "sale";
                      if (goodsTabFilter === "rental") return g.goodsType === "rental";
                      if (goodsTabFilter === "featured") return g.isFeatured;
                      return true;
                    })
                    .filter((g) => !goodsSearch || String(g.name || "").toLowerCase().includes(goodsSearch.toLowerCase()))
                    .length === 0 ? (
                  <p className="reg-modal-empty">등록된 상품이 없습니다.</p>
                ) : (
                  goodsList
                    .filter((g) => {
                      if (goodsTabFilter === "sale") return g.goodsType === "sale";
                      if (goodsTabFilter === "rental") return g.goodsType === "rental";
                      if (goodsTabFilter === "featured") return g.isFeatured;
                      return true;
                    })
                    .filter((g) => !goodsSearch || String(g.name || "").toLowerCase().includes(goodsSearch.toLowerCase()))
                    .map((g) => (
                      <div key={g.id} className="reg-pass-card" onClick={() => handleSelectGoods(g)}>
                        <div className="reg-pass-card-top" style={{ background: g.color || "#7c5cbf" }}>
                          <div className="reg-pass-card-tags">
                            {g.goodsType === "rental" ? "대여" : "판매"}
                          </div>
                          <div className="reg-pass-card-name">{g.name}</div>
                          <div className="reg-pass-card-meta">&nbsp;</div>
                        </div>
                        <div className="reg-pass-card-bottom">
                          <span>가격 {Number(g.price || 0).toLocaleString()}원</span>
                          {g.points > 0 && <small>포인트 {Number(g.points).toLocaleString()}P</small>}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <SmsSendModal open={smsOpen} onClose={() => setSmsOpen(false)} receivers={smsReceivers} />
    </AdminLayout>
  );
}

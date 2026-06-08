import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import {
  createAdminStudioStaff,
  createStudioNotification,
  deleteAdminStudioStaff,
  listAdminStudioStaff,
  listAdminStudioClasses,
  listAdminRolePermissions,
  saveAdminRolePermissions,
  updateAdminStudioStaff,
} from "../../studio/api/studioApi.js";

const NAV_ITEMS = [
  { label: "일정", path: "/admin" },
  { label: "수업", path: "/admin/classes" },
  { label: "회원", path: "/admin/member-list" },
  { label: "강사", path: "/admin/instructors", active: true },
  { label: "수강권", path: "/admin/products" },
  { label: "설정", path: "/admin/members" },
  { label: "매출", path: "/admin/sales" },
];

const ROLE_LABELS = {
  owner: "스튜디오 오너",
  manager: "매니저",
  instructor: "강사",
};

const EMPLOYMENT_LABELS = {
  full_time: "정규",
  part_time: "파트타임",
  freelance: "프리랜서",
};

const SALARY_LABELS = {
  fixed: "고정급",
  hourly: "시급",
  commission: "비율",
};

const PERMISSION_ROLES = [
  { value: "owner", label: "스튜디오 오너" },
  { value: "manager", label: "매니저" },
  { value: "instructor", label: "강사" },
];

const PERMISSION_GROUPS = [
  {
    value: "facility",
    label: "시설 관리",
    ownerNotice: "스튜디오 오너는 모든 권한을 가집니다.",
    description: "시설 관리에 관한 접근 권한입니다.",
    permissions: [
      { code: "settings.facility", label: "시설 정보 설정", description: "상호, 주소, 연락처, 운영시간 등 시설 정보를 추가 및 수정할 수 있습니다." },
      { code: "settings.booking", label: "운영정보 설정", description: "수업의 예약, 취소, 미리 알림을 설정할 수 있습니다." },
      { code: "settings.role", label: "역할별 권한설정", description: "역할별로 접근 권한을 설정할 수 있습니다." },
      { code: "locker.write", label: "룸 관리 설정", description: "룸을 추가, 수정, 삭제하는 권한을 설정할 수 있습니다." },
      { code: "staff.read", label: "스태프 조회", description: "스튜디오 오너, 관리자, 강사 등 스태프를 조회할 수 있습니다." },
      { code: "staff.salary", label: "스태프 급여 설정", description: "스태프의 급여 형태와 금액을 설정할 수 있습니다." },
    ],
  },
  {
    value: "customer",
    label: "고객 관리",
    description: "회원 조회와 상담, 체크인 관리 권한입니다.",
    permissions: [
      {
        code: "member.read",
        label: "회원 목록 조회",
        description: "전체 회원 목록을 조회할 수 있습니다.",
        children: [
          { code: "member.export", label: "회원 목록 엑셀 다운로드", description: "회원 목록을 엑셀 파일로 다운로드할 수 있습니다." },
          { code: "member.create", label: "회원 등록", description: "회원을 등록 할 수 있습니다." },
          { code: "member.write", label: "회원 정보 수정", description: "회원 정보를 수정할 수 있습니다." },
          { code: "member.phone.read", label: "회원의 휴대폰 번호 보기", description: "회원의 휴대폰 번호를 볼 수 있습니다." },
          { code: "member.delete", label: "회원 삭제", description: "회원을 삭제할 수 있습니다." },
          { code: "pass.issue", label: "회원에게 수강권 발급", description: "회원에게 수강권을 발급할 수 있습니다." },
          { code: "pass.detail.write", label: "회원의 수강권 상세정보 조회 및 수정", description: "회원에게 발급된 수강권 상세정보를 조회, 수정할 수 있습니다. 포인트 및 결제내역을 조회할 수 있습니다." },
        ],
      },
      {
        code: "member.memo.read",
        label: "회원 메모 조회",
        description: "회원에게 등록된 메모를 조회할 수 있습니다.",
        children: [
          { code: "member.memo.create", label: "회원 메모 등록", description: "회원에게 메모를 등록할 수 있습니다." },
          { code: "member.memo.write", label: "회원 메모 수정", description: "본인이 작성한 메모를 수정할 수 있습니다.\n(단, 스튜디오 오너는 모든 메모를 수정할 수 있습니다.)" },
          { code: "member.memo.delete", label: "회원 메모 삭제", description: "본인이 작성한 메모를 삭제할 수 있습니다.\n(단, 스튜디오 오너는 모든 메모를 삭제할 수 있습니다.)" },
        ],
      },
      {
        code: "consulting.read",
        label: "상담 고객 조회",
        description: "상담 기록, 방문 일정 등을 조회할 수 있습니다.",
        children: [
          { code: "consulting.create", label: "상담 고객 등록", description: "상담 기록, 방문 일정 등을 등록할 수 있습니다." },
          { code: "consulting.write", label: "상담 고객 수정", description: "상담 기록, 방문 일정을 수정할 수 있습니다." },
          { code: "consulting.delete", label: "상담 고객 삭제", description: "상담 기록, 방문 일정을 삭제할 수 있습니다." },
        ],
      },
    ],
  },
  {
    value: "pass",
    label: "수강권",
    description: "수강권에 관한 접근 권한입니다.",
    permissions: [
      { code: "sales.read", label: "매출 열람", description: "매출 페이지를 열람할 수 있습니다." },
      { code: "pass.create", label: "수강권 등록", description: "새로운 수강권을 만들 수 있습니다." },
      { code: "pass.write", label: "수강권 수정", description: "수강권 정보를 수정할 수 있습니다." },
      { code: "pass.status", label: "수강권 판매 정지 및 판매 재개", description: "수강권 판매정지를 설정 할 수 있고 판매를 재개할 수 있습니다." },
    ],
  },
  {
    value: "schedule",
    label: "일정",
    description: "수업 일정 등록과 예약자 관리 권한입니다.",
    permissions: [
      {
        code: "own.etc.read",
        label: "본인의 기타 일정",
        description: "본인의 기타 일정을 조회할 수 있습니다.",
        children: [
          { code: "own.etc.create", label: "본인의 기타 일정 등록", description: "기타 일정을 등록할 수 있습니다." },
          { code: "own.etc.write", label: "본인의 기타 일정 수정", description: "기타 일정을 수정할 수 있습니다." },
          { code: "own.etc.delete", label: "본인의 기타 일정 삭제", description: "기타 일정을 삭제할 수 있습니다." },
        ],
      },
      {
        code: "own.group.read",
        label: "본인의 그룹 수업",
        description: "본인의 그룹 수업을 조회할 수 있습니다.",
        children: [
          { code: "own.group.past.create", label: "본인의 과거 그룹 수업 등록", description: "과거 날짜에 그룹 수업을 등록할 수 있습니다." },
          { code: "own.group.past.write", label: "본인의 과거 그룹 수업 수정", description: "과거 그룹 수업의 담당 강사를 수정할 수 있습니다." },
          { code: "own.group.past.booking.write", label: "본인의 과거 그룹 수업 예약 변경", description: "과거 그룹 수업의 회원 예약, 출결 상태를 변경할 수 있습니다." },
          { code: "own.group.past.booking.cancel", label: "본인의 과거 그룹 수업 예약 취소", description: "과거 그룹 수업의 회원 예약을 취소할 수 있습니다." },
          { code: "own.group.past.delete", label: "본인의 과거 그룹 수업 삭제", description: "과거 그룹 수업을 삭제할 수 있습니다." },
          { code: "own.group.create", label: "본인의 그룹 수업 등록", description: "그룹 수업을 등록할 수 있습니다." },
          { code: "own.group.write", label: "본인의 그룹 수업 수정", description: "그룹 수업의 담당 강사, 수업 시간, 최소 수강 인원을 수정할 수 있습니다." },
          { code: "own.group.booking.write", label: "본인의 그룹 수업 예약 변경", description: "그룹 수업의 회원 예약, 출결 상태를 변경할 수 있습니다." },
          { code: "own.group.booking.cancel", label: "본인의 그룹 수업 예약 취소", description: "그룹 수업의 회원 예약을 취소할 수 있습니다." },
          { code: "own.group.delete", label: "본인의 그룹 수업 삭제", description: "그룹 수업을 삭제할 수 있습니다." },
        ],
      },
      {
        code: "own.private.read",
        label: "본인의 프라이빗 수업",
        description: "본인의 프라이빗 수업을 조회할 수 있습니다.",
        children: [
          { code: "own.private.past.create", label: "본인의 과거 프라이빗 수업 등록", description: "과거 날짜에 프라이빗 수업을 등록할 수 있습니다." },
          { code: "own.private.past.write", label: "본인의 과거 프라이빗 수업 수정", description: "과거 프라이빗 수업의 담당 강사, 수업 시간을 수정할 수 있습니다." },
          { code: "own.private.past.booking.write", label: "본인의 과거 프라이빗 수업 예약 변경", description: "과거 프라이빗 수업의 회원 예약, 출결 상태를 변경할 수 있습니다." },
          { code: "own.private.past.booking.cancel", label: "본인의 과거 프라이빗 수업 예약 취소", description: "과거 프라이빗 수업의 회원 예약을 취소할 수 있습니다." },
          { code: "own.private.past.delete", label: "본인의 과거 프라이빗 수업 삭제", description: "과거 프라이빗 수업을 삭제할 수 있습니다." },
          { code: "own.private.create", label: "본인의 프라이빗 수업 등록", description: "프라이빗 수업을 등록할 수 있습니다." },
          { code: "own.private.write", label: "본인의 프라이빗 수업 수정", description: "프라이빗 수업의 담당 강사, 수업 시간을 수정할 수 있습니다." },
          { code: "own.private.booking.write", label: "본인의 프라이빗 수업 예약 변경", description: "프라이빗 수업의 회원 예약, 출결 상태를 변경할 수 있습니다." },
          { code: "own.private.booking.cancel", label: "본인의 프라이빗 수업 예약 취소", description: "프라이빗 수업의 회원 예약을 취소할 수 있습니다." },
          { code: "own.private.delete", label: "본인의 프라이빗 수업 삭제", description: "프라이빗 수업을 삭제할 수 있습니다." },
        ],
      },
      {
        code: "other.group.read",
        label: "다른 스태프의 그룹 수업",
        description: "다른 스태프의 그룹 수업을 조회할 수 있습니다.",
        children: [
          { code: "other.group.view", label: "다른 스태프의 그룹 수업 조회", description: "그룹 수업을 조회할 수 있습니다." },
        ],
      },
      {
        code: "other.private.read",
        label: "다른 스태프의 프라이빗 수업",
        description: "다른 스태프의 프라이빗 수업을 조회할 수 있습니다.",
        children: [
          { code: "other.private.view", label: "다른 스태프의 프라이빗 수업 조회", description: "프라이빗 수업을 조회할 수 있습니다." },
        ],
      },
      {
        code: "schedule.memo.create",
        label: "메모 등록",
        description: "일정 상세페이지에 메모를 등록할 수 있습니다.",
        children: [
          { code: "schedule.memo.write", label: "메모 수정", description: "본인이 작성한 메모를 수정할 수 있습니다.\n(단, 스튜디오 오너는 모든 메모를 수정할 수 있습니다.)" },
          { code: "schedule.memo.delete", label: "메모 삭제", description: "본인이 작성한 메모를 삭제할 수 있습니다.\n(단, 스튜디오 오너는 모든 메모를 삭제할 수 있습니다.)" },
        ],
      },
    ],
  },
  {
    value: "board",
    label: "게시판",
    description: "게시판에 관한 접근 권한입니다.",
    permissions: [
      {
        code: "notice.read",
        label: "공지사항 조회",
        description: "공지사항을 조회할 수 있습니다.",
        children: [
          { code: "notice.write", label: "공지사항 등록, 수정", description: "공지사항을 등록, 수정할 수 있습니다." },
          { code: "notice.delete", label: "공지사항 삭제", description: "공지사항을 삭제할 수 있습니다." },
        ],
      },
      {
        code: "inquiry.read",
        label: "문의사항 조회",
        description: "문의 게시판을 조회할 수 있습니다.",
        children: [
          { code: "inquiry.comment.write", label: "문의 게시판에 댓글 등록, 수정, 삭제", description: "문의 게시판에 댓글을 등록, 수정, 삭제 할 수 있습니다." },
          { code: "inquiry.comment.other.delete", label: "문의 게시판의 다른 스태프 댓글 삭제", description: "문의 게시판에 다른 스태프가 등록한 댓글을 삭제할 수 있습니다." },
        ],
      },
    ],
  },
  {
    value: "message",
    label: "메시지",
    description: "메시지에 관한 접근 권한입니다.",
    permissions: [
      {
        code: "sms.read",
        label: "문자 메시지 조회",
        description: "문자 메시지를 조회할 수 있습니다.",
        children: [
          { code: "sms.send", label: "문자 메시지 보내기", description: "문자 메시지를 보낼 수 있습니다." },
          { code: "sms.write", label: "문자 메시지 수정 및 예약 취소", description: "문자 메시지를 수정하거나 예약된 메시지를 취소 할 수 있습니다." },
          { code: "sms.delete", label: "문자 메시지 삭제", description: "문자 메시지를 삭제 할 수 있습니다." },
        ],
      },
      {
        code: "push.read",
        label: "앱 푸시 메시지 조회",
        description: "앱 푸시 메시지를 조회할 수 있습니다.",
        children: [
          { code: "push.send", label: "앱 푸시 메시지 보내기", description: "앱 푸시 메시지를 보낼 수 있습니다." },
          { code: "push.write", label: "앱 푸시 메시지 수정 및 예약 취소", description: "앱 푸시 메시지를 수정하거나, 예약된 메시지를 취소할 수 있습니다." },
          { code: "push.delete", label: "앱 푸시 메시지 삭제", description: "앱 푸시 메시지를 삭제할 수 있습니다." },
        ],
      },
    ],
  },
  {
    value: "contract",
    label: "전자계약서",
    description: "전자계약서에 관한 접근 권한입니다.",
    permissions: [
      {
        code: "contract.list.read",
        label: "계약서 목록 조회",
        description: "계약서 목록을 조회 할 수 있습니다.",
        children: [
          { code: "contract.detail.read", label: "계약서 상세 조회", description: "계약서 상세 내용을 조회 할 수 있습니다." },
        ],
      },
      {
        code: "contract.template.read",
        label: "템플릿 조회",
        description: "템플릿을 조회할 수 있습니다.",
        children: [
          { code: "contract.template.write", label: "템플릿 등록/수정", description: "템플릿을 등록 및 수정 할 수 있습니다." },
          { code: "contract.template.delete", label: "템플릿 삭제", description: "템플릿을 삭제 할 수 있습니다." },
          { code: "contract.terms.write", label: "약관관리", description: "약관을 등록/수정/삭제할 수 있습니다." },
        ],
      },
    ],
  },
];

const EMPTY_FORM = {
  id: "",
  name: "",
  roleCode: "instructor",
  employmentType: "full_time",
  phone: "",
  appConnectionStatus: "not_connected",
  color: "#4aa3ff",
  status: "active",
  canManageSchedule: true,
  canViewMembers: true,
  canManagePasses: false,
  canViewSales: false,
  salaryType: "fixed",
  basePay: "",
  hourlyWage: "",
  commissionRate: "",
  memo: "",
};

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!amount) return "-";
  return `₩${amount.toLocaleString()}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toDateKey(value) {
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeStaffForm(staff) {
  return {
    ...EMPTY_FORM,
    ...staff,
    basePay: staff?.basePay ? String(staff.basePay) : "",
    hourlyWage: staff?.hourlyWage ? String(staff.hourlyWage) : "",
    commissionRate: staff?.commissionRate ? String(staff.commissionRate) : "",
    canManageSchedule: Boolean(staff?.canManageSchedule),
    canViewMembers: Boolean(staff?.canViewMembers),
    canManagePasses: Boolean(staff?.canManagePasses),
    canViewSales: Boolean(staff?.canViewSales),
  };
}

function getStaffSearchText(staff) {
  return [
    staff.name,
    staff.phone,
    ROLE_LABELS[staff.roleCode],
    EMPLOYMENT_LABELS[staff.employmentType],
    staff.memo,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function AdminInstructorPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [staff, setStaff] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("list");
  const [detailTab, setDetailTab] = useState("basic");
  const [permissionRole, setPermissionRole] = useState("owner");
  const [permissionGroup, setPermissionGroup] = useState("facility");
  const [expandedPermissions, setExpandedPermissions] = useState({});
  const [rolePermissions, setRolePermissions] = useState([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [employmentFilter, setEmploymentFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationTargets, setNotificationTargets] = useState([]);
  const [savingPermissions, setSavingPermissions] = useState(false);

  async function loadStaff() {
    setLoading(true);
    try {
      const rows = await listAdminStudioStaff();
      setStaff(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setStaff([]);
      setMessage({ type: "error", text: error.message || "강사 목록을 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStaff();
  }, []);

  useEffect(() => {
    listAdminRolePermissions().then(setRolePermissions).catch(() => setRolePermissions([]));
  }, []);

  useEffect(() => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01 00:00:00`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")} 23:59:59`;
    listAdminStudioClasses({ from, to }).then(setClasses).catch(() => setClasses([]));
  }, []);

  const filteredStaff = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return staff.filter((item) => {
      if (roleFilter && item.roleCode !== roleFilter) return false;
      if (employmentFilter && item.employmentType !== employmentFilter) return false;
      if (query && !getStaffSearchText(item).includes(query)) return false;
      return true;
    });
  }, [staff, roleFilter, employmentFilter, searchQuery]);

  const allChecked = filteredStaff.length > 0 && filteredStaff.every((item) => selectedIds.has(item.id));
  const selectedStaff = useMemo(
    () => staff.find((item) => item.id === selectedStaffId) || null,
    [staff, selectedStaffId]
  );
  const selectedStaffClasses = useMemo(() => {
    if (!selectedStaff) return [];
    return classes
      .filter((item) => String(item.instructorName || "").trim() === String(selectedStaff.name || "").trim())
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  }, [classes, selectedStaff]);
  const todayClasses = useMemo(() => {
    const todayKey = toDateKey(new Date());
    return selectedStaffClasses.filter((item) => toDateKey(item.startAt) === todayKey);
  }, [selectedStaffClasses]);
  const rolePermissionMap = useMemo(() => {
    const map = new Map();
    rolePermissions.forEach((item) => {
      map.set(`${item.roleCode || item.role_code}:${item.permissionCode || item.permission_code}`, Boolean(item.isAllowed ?? item.is_allowed));
    });
    return map;
  }, [rolePermissions]);
  const activePermissionGroup = PERMISSION_GROUPS.find((group) => group.value === permissionGroup) || PERMISSION_GROUPS[0];
  const permissionRoleIsOwner = permissionRole === "owner";

  function isPermissionAllowed(permissionCode) {
    if (permissionRoleIsOwner) return true;
    const key = `${permissionRole}:${permissionCode}`;
    if (rolePermissionMap.has(key)) return rolePermissionMap.get(key);
    return permissionRole === "manager";
  }

  function getPermissionCodes(permission) {
    return [
      permission.code,
      ...(Array.isArray(permission.children) ? permission.children.flatMap(getPermissionCodes) : []),
    ];
  }

  function isPermissionNodeAllowed(permission) {
    const codes = getPermissionCodes(permission);
    return codes.every((code) => isPermissionAllowed(code));
  }

  function toggleAll() {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allChecked) filteredStaff.forEach((item) => next.delete(item.id));
      else filteredStaff.forEach((item) => next.add(item.id));
      return next;
    });
  }

  function toggleOne(id) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openCreateForm() {
    setEditing(true);
    setForm({ ...EMPTY_FORM, color: ["#b35a52", "#ff6b6b", "#2ec4b6", "#4aa3ff", "#9b7bff", "#f2c94c"][staff.length % 6] });
  }

  function openEditForm(item) {
    setEditing(true);
    setForm(normalizeStaffForm(item));
  }

  function openDetail(item) {
    setSelectedStaffId(item.id);
    setDetailTab("basic");
  }

  function openNotification(targets) {
    const list = Array.isArray(targets) ? targets.filter(Boolean) : [];
    setNotificationTargets(list);
    setNotificationOpen(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setMessage({ type: "error", text: "강사 이름을 입력해 주세요." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        basePay: Number(form.basePay || 0),
        hourlyWage: Number(form.hourlyWage || 0),
        commissionRate: Number(form.commissionRate || 0),
      };
      const saved = form.id && !String(form.id).startsWith("class-")
        ? await updateAdminStudioStaff(form.id, payload)
        : await createAdminStudioStaff(payload);
      setStaff((previous) => {
        const without = previous.filter((item) => item.id !== form.id && item.id !== saved.id && item.name !== saved.name);
        return [saved, ...without].sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
      });
      setEditing(false);
      setMessage({ type: "success", text: "강사 정보가 저장되었습니다." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "강사 정보 저장에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSelected() {
    const deletableIds = [...selectedIds].filter((id) => !String(id).startsWith("class-"));
    const virtualCount = selectedIds.size - deletableIds.length;
    if (!selectedIds.size) return;
    if (!deletableIds.length) {
      setMessage({ type: "error", text: "수업 일정에서 자동 생성된 강사는 먼저 저장한 뒤 삭제할 수 있습니다." });
      return;
    }
    if (!window.confirm(`선택한 강사 ${deletableIds.length}명을 삭제 처리할까요?`)) return;
    try {
      await Promise.all(deletableIds.map((id) => deleteAdminStudioStaff(id)));
      setStaff((previous) => previous.filter((item) => !deletableIds.includes(item.id)));
      setSelectedIds(new Set());
      setMessage({
        type: "success",
        text: virtualCount ? `저장된 강사 ${deletableIds.length}명을 삭제했습니다. 자동 생성 강사 ${virtualCount}명은 제외했습니다.` : "삭제 처리했습니다.",
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "삭제 처리에 실패했습니다." });
    }
  }

  async function handleSendNotification(event) {
    event.preventDefault();
    const targets = (notificationTargets.length ? notificationTargets : staff.filter((item) => selectedIds.has(item.id)))
      .filter((item) => !String(item.id).startsWith("class-"));
    if (!targets.length) {
      setMessage({ type: "error", text: "알림을 보낼 저장된 강사를 선택해 주세요." });
      return;
    }
    if (!notificationMessage.trim()) {
      setMessage({ type: "error", text: "메시지 내용을 입력해 주세요." });
      return;
    }
    try {
      await Promise.all(targets.map((item) =>
        createStudioNotification({
          userId: item.id,
          type: "manual",
          title: "이끌림 필라테스 안내",
          message: notificationMessage.trim(),
          status: "pending",
        }).catch(() => null)
      ));
      setNotificationOpen(false);
      setNotificationMessage("");
      setNotificationTargets([]);
      setMessage({ type: "success", text: "강사 알림 기록을 저장했습니다. 실제 문자 API는 외부 연동 시 연결됩니다." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "알림 저장에 실패했습니다." });
    }
  }

  function handleTogglePermission(permissionCode) {
    if (permissionRoleIsOwner) return;
    const nextAllowed = !isPermissionAllowed(permissionCode);
    setRolePermissions((previous) => {
      const without = previous.filter((item) =>
        !((item.roleCode || item.role_code) === permissionRole && (item.permissionCode || item.permission_code) === permissionCode)
      );
      return [
        ...without,
        { roleCode: permissionRole, permissionCode, isAllowed: nextAllowed ? 1 : 0 },
      ];
    });
  }

  function handleTogglePermissionNode(permission) {
    if (permissionRoleIsOwner) return;
    const codes = getPermissionCodes(permission);
    const nextAllowed = !isPermissionNodeAllowed(permission);
    setRolePermissions((previous) => {
      const without = previous.filter((item) =>
        !((item.roleCode || item.role_code) === permissionRole && codes.includes(item.permissionCode || item.permission_code))
      );
      return [
        ...without,
        ...codes.map((code) => ({ roleCode: permissionRole, permissionCode: code, isAllowed: nextAllowed ? 1 : 0 })),
      ];
    });
  }

  function handleSelectAllPermissions() {
    if (permissionRoleIsOwner) return;
    const allCodes = activePermissionGroup.permissions.flatMap(getPermissionCodes);
    const allAllowed = allCodes.every((code) => isPermissionAllowed(code));
    const nextAllowed = !allAllowed;
    setRolePermissions((previous) => {
      const without = previous.filter((item) =>
        !((item.roleCode || item.role_code) === permissionRole && allCodes.includes(item.permissionCode || item.permission_code))
      );
      return [
        ...without,
        ...allCodes.map((code) => ({ roleCode: permissionRole, permissionCode: code, isAllowed: nextAllowed ? 1 : 0 })),
      ];
    });
  }

  async function handleSavePermissions() {
    setSavingPermissions(true);
    try {
      await saveAdminRolePermissions(rolePermissions);
      setMessage({ type: "success", text: "역할별 권한 설정을 저장했습니다." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "권한 설정 저장에 실패했습니다." });
    } finally {
      setSavingPermissions(false);
    }
  }

  return (
    <div className="admin-instructor-app">
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
          <span aria-hidden="true">이름 또는 휴대폰 번호로 검색</span>
          <input
            type="search"
            placeholder="이름 또는 휴대폰 번호로 검색"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <button className="admin-schedule-profile" type="button" onClick={() => navigate("/admin/members")}>
          {currentUserName}
        </button>
      </header>

      {selectedStaff ? (
        <main className="admin-instructor-detail">
          <button type="button" className="admin-instructor-detail-crumb" onClick={() => setSelectedStaffId("")}>
            강사 &gt; 상세 정보
          </button>
          <button type="button" className="admin-member-detail-close" onClick={() => setSelectedStaffId("")} aria-label="상세 닫기">
            ×
          </button>
          <section className="admin-instructor-detail-hero">
            <div>
              <h1>{selectedStaff.name}</h1>
              <p>
                {ROLE_LABELS[selectedStaff.roleCode] || "강사"}
                <span>·</span>
                등록일: {formatDate(selectedStaff.createdAt)}
              </p>
              <p>
                {selectedStaff.phone || "-"}
                <button
                  type="button"
                  className="admin-instructor-inline-link"
                  onClick={() => openEditForm({ ...selectedStaff, appConnectionStatus: selectedStaff.appConnectionStatus === "connected" ? "not_connected" : "connected" })}
                >
                  앱 연결 {selectedStaff.appConnectionStatus === "connected" ? "완료" : "미연결"}
                </button>
              </p>
              <p>{EMPLOYMENT_LABELS[selectedStaff.employmentType] || "-"} · {selectedStaff.status === "active" ? "재직" : "비활성"}</p>
            </div>
            <div className="admin-instructor-detail-side">
              <span className="admin-instructor-detail-avatar" style={{ "--staff-color": selectedStaff.color }} />
              <div>
                <button type="button" onClick={() => openNotification([selectedStaff])}>메시지 보내기</button>
                <button type="button" onClick={() => openEditForm(selectedStaff)}>강사 정보 수정</button>
              </div>
            </div>
          </section>

          <nav className="admin-instructor-detail-tabs">
            {[
              ["basic", "기본정보"],
              ["time", "시간정보"],
              ["classes", "수업"],
              ["members", "담당회원"],
              ["pay", "급여관리"],
              ["fees", "수업료 내역"],
            ].map(([value, label]) => (
              <button key={value} type="button" className={detailTab === value ? "active" : ""} onClick={() => setDetailTab(value)}>
                {label}
              </button>
            ))}
          </nav>

          {detailTab === "basic" ? (
            <>
              <section className="admin-instructor-detail-section">
                <h2>오늘의 일정</h2>
                {todayClasses.length ? (
                  <div className="admin-instructor-detail-list">
                    {todayClasses.map((item) => (
                      <article key={item.id}>
                        <strong>{formatTime(item.startAt)} - {formatTime(item.endAt)}</strong>
                        <p>{item.title || "수업"} · {item.roomName || "-"} · {item.reservedCount || 0}/{item.capacity || 0}명</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="admin-instructor-detail-empty">오늘 일정이 없습니다.</p>
                )}
              </section>
              <section className="admin-instructor-detail-section">
                <h2>강사 프로필</h2>
                <dl className="admin-instructor-profile-grid">
                  <div><dt>자기 소개</dt><dd>{selectedStaff.memo || "자기소개 없음"}</dd></div>
                  <div><dt>주요 이력</dt><dd>{selectedStaff.memo || "주요이력 없음"}</dd></div>
                </dl>
              </section>
            </>
          ) : null}

          {detailTab === "time" ? (
            <section className="admin-instructor-detail-section">
              <h2>시간정보</h2>
              <p className="admin-instructor-detail-empty">강사별 요일 근무시간은 운영 설정의 강사 근무시간과 연동됩니다.</p>
            </section>
          ) : null}

          {detailTab === "classes" ? (
            <section className="admin-instructor-detail-section">
              <h2>이번 달 수업</h2>
              {selectedStaffClasses.length ? (
                <div className="admin-instructor-detail-list">
                  {selectedStaffClasses.map((item) => (
                    <article key={item.id}>
                      <strong>{formatDate(item.startAt)} {formatTime(item.startAt)}</strong>
                      <p>{item.title || "수업"} · {item.roomName || "-"} · 예약 {item.reservedCount || 0}/{item.capacity || 0}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="admin-instructor-detail-empty">등록된 수업이 없습니다.</p>
              )}
            </section>
          ) : null}

          {detailTab === "members" ? (
            <section className="admin-instructor-detail-section">
              <h2>담당회원</h2>
              <p className="admin-instructor-detail-empty">회원관리의 담당강사 값과 연결해 표시할 수 있습니다.</p>
            </section>
          ) : null}

          {detailTab === "pay" ? (
            <section className="admin-instructor-detail-section">
              <h2>급여관리</h2>
              <dl className="admin-instructor-profile-grid">
                <div><dt>급여 기준</dt><dd>{SALARY_LABELS[selectedStaff.salaryType] || "-"}</dd></div>
                <div><dt>고정급</dt><dd>{formatCurrency(selectedStaff.basePay)}</dd></div>
                <div><dt>시급</dt><dd>{formatCurrency(selectedStaff.hourlyWage)}</dd></div>
                <div><dt>비율</dt><dd>{Number(selectedStaff.commissionRate || 0)}%</dd></div>
              </dl>
            </section>
          ) : null}

          {detailTab === "fees" ? (
            <section className="admin-instructor-detail-section">
              <h2>수업료 내역</h2>
              <p className="admin-instructor-detail-empty">수업료 정산 내역은 매출/급여 정책 확정 후 연결합니다.</p>
            </section>
          ) : null}
        </main>
      ) : (
      <main className="admin-instructor-body">
        <section className="admin-instructor-title-row">
          <div>
            <h1>강사</h1>
            <div className="admin-instructor-tabs">
              {[
                { value: "list", label: "강사목록" },
                { value: "permission", label: "권한설정" },
                { value: "salary", label: "급여설정" },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={activeTab === tab.value ? "active" : ""}
                  onClick={() => setActiveTab(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {activeTab === "list" ? (
          <>
            <section className="admin-instructor-toolbar">
              <div>
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="">역할 전체</option>
                  <option value="owner">스튜디오 오너</option>
                  <option value="manager">매니저</option>
                  <option value="instructor">강사</option>
                </select>
                <select value={employmentFilter} onChange={(event) => setEmploymentFilter(event.target.value)}>
                  <option value="">근무형태 전체</option>
                  <option value="full_time">정규</option>
                  <option value="part_time">파트타임</option>
                  <option value="freelance">프리랜서</option>
                </select>
                <button type="button" className="admin-memberlist-reset-btn" onClick={loadStaff}>↻</button>
              </div>
              <div>
                <select className="admin-instructor-view-select" defaultValue="list">
                  <option value="list">목록형 보기</option>
                </select>
                <button type="button" className="admin-classlist-btn" disabled={!selectedIds.size} onClick={() => openNotification(staff.filter((item) => selectedIds.has(item.id)))}>
                  메시지 보내기
                </button>
                <button type="button" className="admin-classlist-btn danger" disabled={!selectedIds.size} onClick={handleDeleteSelected}>
                  삭제
                </button>
              </div>
            </section>
            <div className="admin-instructor-count-row">
              <strong>총 {filteredStaff.length}명</strong>
              <span>선택 {selectedIds.size}명</span>
            </div>
          </>
        ) : null}

        {message.text ? <p className={`admin-classlist-message ${message.type}`}>{message.text}</p> : null}

        {activeTab === "list" ? (
          <section className="admin-instructor-table-wrap">
            <table className="admin-instructor-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                  <th>이름</th>
                  <th>역할</th>
                  <th>근무형태</th>
                  <th>휴대폰 번호</th>
                  <th>앱연결</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6}>불러오는 중입니다.</td></tr>
                ) : filteredStaff.length ? filteredStaff.map((item) => (
                  <tr key={item.id} onClick={() => openDetail(item)}>
                    <td onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleOne(item.id)} />
                    </td>
                    <td>
                      <div className="admin-instructor-name-cell">
                        <span className="admin-instructor-avatar" style={{ "--staff-color": item.color }} />
                        <strong>{item.name}</strong>
                        <i style={{ background: item.color }} />
                        {item.source === "class" ? <em>자동</em> : null}
                      </div>
                    </td>
                    <td>{ROLE_LABELS[item.roleCode] || item.roleCode}</td>
                    <td>{EMPLOYMENT_LABELS[item.employmentType] || "-"}</td>
                    <td>{item.phone || "-"}</td>
                    <td>
                      <span className={`admin-instructor-app-chip ${item.appConnectionStatus}`}>
                        {item.appConnectionStatus === "connected" ? "연결" : "미연결"}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6}>등록된 강사가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        ) : null}

        {activeTab === "permission" ? (
          <section className="admin-instructor-permission-page">
            <aside className="admin-instructor-role-panel">
              <strong>역할을 선택해주세요</strong>
              {PERMISSION_ROLES.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  className={permissionRole === role.value ? "active" : ""}
                  onClick={() => setPermissionRole(role.value)}
                >
                  {role.label}
                  {permissionRole === role.value ? <span /> : null}
                </button>
              ))}
              <button type="button" className="admin-instructor-add-role">+ 새로운 역할 추가</button>
            </aside>
            <section className="admin-instructor-permission-main">
              <div className="admin-instructor-permission-head">
                <strong>접근을 허용할 기능들을 체크해주세요</strong>
                {permissionRoleIsOwner ? <em>스튜디오 오너는 모든 권한을 가집니다.</em> : null}
              </div>
              <div className="admin-instructor-permission-tabs">
                <div className="admin-instructor-permission-tab-list">
                  {PERMISSION_GROUPS.map((group) => (
                    <button
                      key={group.value}
                      type="button"
                      className={permissionGroup === group.value ? "active" : ""}
                      onClick={() => setPermissionGroup(group.value)}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
                <div className="admin-instructor-permission-actions">
                  <button type="button" className="admin-classlist-btn" disabled={permissionRoleIsOwner} onClick={handleSelectAllPermissions}>
                    모두 선택
                  </button>
                  <button type="button" className="admin-classlist-btn primary" disabled={savingPermissions || permissionRoleIsOwner} onClick={handleSavePermissions}>
                    {savingPermissions ? "저장 중" : "저장"}
                  </button>
                </div>
              </div>
              <div className="admin-instructor-permission-scroll">
                <p className="admin-instructor-permission-desc">{activePermissionGroup.description}</p>
                {activePermissionGroup.permissions.map((permission) => (
                  <div key={permission.code} className="admin-instructor-permission-branch">
                    <div className="admin-instructor-permission-item-row">
                      <label className={`admin-instructor-permission-item${permission.children?.length ? " has-children" : ""}`}>
                        <input
                          type="checkbox"
                          checked={permission.children?.length ? isPermissionNodeAllowed(permission) : isPermissionAllowed(permission.code)}
                          disabled={permissionRoleIsOwner}
                          onChange={() => permission.children?.length ? handleTogglePermissionNode(permission) : handleTogglePermission(permission.code)}
                        />
                        <span>
                          <strong>{permission.label}</strong>
                          <small>{permission.description}</small>
                        </span>
                      </label>
                      {permission.children?.length ? (
                        <button
                          type="button"
                          className={`admin-instructor-permission-toggle${expandedPermissions[permission.code] ? " open" : ""}`}
                          onClick={() => setExpandedPermissions(prev => ({ ...prev, [permission.code]: !prev[permission.code] }))}
                        />
                      ) : null}
                    </div>
                    {permission.children?.length && expandedPermissions[permission.code] ? (
                      <div className="admin-instructor-permission-children">
                        {permission.children.map((child) => (
                          <label key={child.code} className="admin-instructor-permission-item child">
                            <input
                              type="checkbox"
                              checked={isPermissionAllowed(child.code)}
                              disabled={permissionRoleIsOwner || !isPermissionAllowed(permission.code)}
                              onChange={() => handleTogglePermission(child.code)}
                            />
                            <span>
                              <strong>{child.label}</strong>
                              <small>{child.description}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        {activeTab === "salary" ? (
          <section className="admin-instructor-card-grid">
            {filteredStaff.map((item) => (
              <article key={item.id} className="admin-instructor-card" onClick={() => openDetail(item)}>
                <strong>{item.name}</strong>
                <span>{SALARY_LABELS[item.salaryType]}</span>
                <p>
                  고정급 {formatCurrency(item.basePay)} · 시급 {formatCurrency(item.hourlyWage)} · 비율 {Number(item.commissionRate || 0)}%
                </p>
              </article>
            ))}
          </section>
        ) : null}
      </main>
      )}

      <button className="admin-memberlist-floating-add" type="button" onClick={openCreateForm} title="강사 추가">+</button>

      {editing ? (
        <div className="admin-member-modal-backdrop" role="presentation">
          <form className="admin-instructor-modal" onSubmit={handleSave}>
            <div className="admin-instructor-modal-head">
              <strong>{form.id ? "강사 정보 수정" : "강사 추가"}</strong>
              <button type="button" onClick={() => setEditing(false)}>×</button>
            </div>
            <div className="admin-instructor-form-grid">
              <label><span>이름</span><input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label>
              <label><span>휴대폰 번호</span><input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></label>
              <label><span>역할</span><select value={form.roleCode} onChange={(e) => setForm((p) => ({ ...p, roleCode: e.target.value }))}><option value="owner">스튜디오 오너</option><option value="manager">매니저</option><option value="instructor">강사</option></select></label>
              <label><span>근무형태</span><select value={form.employmentType} onChange={(e) => setForm((p) => ({ ...p, employmentType: e.target.value }))}><option value="full_time">정규</option><option value="part_time">파트타임</option><option value="freelance">프리랜서</option></select></label>
              <label><span>앱 연결</span><select value={form.appConnectionStatus} onChange={(e) => setForm((p) => ({ ...p, appConnectionStatus: e.target.value }))}><option value="connected">연결</option><option value="not_connected">미연결</option></select></label>
              <label><span>색상</span><input type="color" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} /></label>
              <label><span>급여 기준</span><select value={form.salaryType} onChange={(e) => setForm((p) => ({ ...p, salaryType: e.target.value }))}><option value="fixed">고정급</option><option value="hourly">시급</option><option value="commission">비율</option></select></label>
              <label><span>고정급</span><input type="number" min="0" value={form.basePay} onChange={(e) => setForm((p) => ({ ...p, basePay: e.target.value }))} /></label>
              <label><span>시급</span><input type="number" min="0" value={form.hourlyWage} onChange={(e) => setForm((p) => ({ ...p, hourlyWage: e.target.value }))} /></label>
              <label><span>비율(%)</span><input type="number" min="0" step="0.1" value={form.commissionRate} onChange={(e) => setForm((p) => ({ ...p, commissionRate: e.target.value }))} /></label>
            </div>
            <div className="admin-instructor-permission-grid">
              {[
                ["canManageSchedule", "일정 관리"],
                ["canViewMembers", "회원 조회"],
                ["canManagePasses", "수강권 관리"],
                ["canViewSales", "매출 조회"],
              ].map(([key, label]) => (
                <label key={key}>
                  <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked }))} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <label className="admin-instructor-memo-field">
              <span>메모</span>
              <textarea rows={4} value={form.memo} onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))} />
            </label>
            <div className="admin-member-notification-actions">
              <button type="button" onClick={() => setEditing(false)}>취소</button>
              <button type="submit" className="primary" disabled={saving}>{saving ? "저장 중" : "저장"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {notificationOpen ? (
        <div className="admin-member-modal-backdrop" role="presentation">
          <form className="admin-member-notification-modal" onSubmit={handleSendNotification}>
            <div>
              <strong>강사 메시지</strong>
              <p>선택한 강사에게 남길 알림 기록을 저장합니다. 문자 API는 외부 연동 시 연결됩니다.</p>
            </div>
            <label>
              <span>내용</span>
              <textarea rows={5} value={notificationMessage} onChange={(e) => setNotificationMessage(e.target.value)} />
            </label>
            <div className="admin-member-notification-actions">
              <button type="button" onClick={() => setNotificationOpen(false)}>취소</button>
              <button type="submit" className="primary">알림 저장</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

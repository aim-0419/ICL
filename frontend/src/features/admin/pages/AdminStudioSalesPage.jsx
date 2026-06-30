import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout.jsx";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { downloadXlsx } from "../../../shared/utils/exportXlsx.js";
import {
  createAdminStudioExpense,
  getAdminSalesPin,
  getAdminStudioSalesReport,
  verifyAdminSalesPin,
} from "../../studio/api/studioApi.js";
import { DEFAULT_STUDIO_BRANCH_ID, STUDIO_BRANCHES } from "../../studio/constants/studioBranches.js";

const MAIN_TABS = [
  { value: "sales", label: "매출" },
  { value: "expenses", label: "지출" },
  { value: "arrears", label: "미수금" },
  { value: "points", label: "포인트" },
  { value: "report", label: "매출 리포트" },
];

const SALES_TABS = [
  { value: "pass", label: "수강권 매출" },
  { value: "class", label: "수업 매출" },
  { value: "other", label: "기타 매출" },
];

const PERIOD_TABS = [
  { value: "month", label: "월간" },
  { value: "week", label: "주간" },
  { value: "day", label: "일간" },
  { value: "custom", label: "사용자 지정" },
];

const PAGE_SIZE = 10;

const EMPTY_REPORT = {
  summary: {},
  sales: [],
  classSales: [],
  otherSales: [],
  refunds: [],
  expenses: [],
  arrears: [],
  points: [],
  staff: [],
};

const EMPTY_EXPENSE_FORM = {
  branchId: DEFAULT_STUDIO_BRANCH_ID,
  expenseDate: "",
  category: "기타",
  title: "",
  amount: "",
  paymentMethod: "카드",
  installmentMonths: "",
  instructorName: "",
  attachmentUrl: "",
  memo: "",
};

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function formatWon(value) {
  return `₩${Number(value || 0).toLocaleString("ko-KR")}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, "0")}. ${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, "0")}. ${String(date.getDate()).padStart(2, "0")} (${weekday})`;
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getRange(baseDate, mode) {
  const date = new Date(baseDate);
  if (mode === "day") return { from: toDateInputValue(date), to: toDateInputValue(date), label: formatDate(date) };
  if (mode === "week") {
    const day = date.getDay();
    const start = new Date(date);
    start.setDate(date.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: toDateInputValue(start), to: toDateInputValue(end), label: `${formatDate(start)} ~ ${formatDate(end)}` };
  }
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: toDateInputValue(first), to: toDateInputValue(last), label: `${date.getFullYear()}년 ${date.getMonth() + 1}월` };
}

function getBranchLabel(branchId) {
  return STUDIO_BRANCHES.find((item) => item.id === branchId)?.name || "전체 지점";
}

function getTrendText(value) {
  const n = Number(value || 0);
  return `${n >= 0 ? "▲" : "▼"} ${Math.abs(n).toFixed(1)}% 전월 대비`;
}

function getSearchText(row) {
  return Object.values(row || {}).map((value) => String(value ?? "")).join(" ").toLowerCase();
}

function paginate(items, page) {
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

function buildMonthlyChartRows(items) {
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = `2026.${String(index + 1).padStart(2, "0")}`;
    return { key, gross: 0, net: 0, count: 0 };
  });
  for (const item of items) {
    const date = new Date(item.paidAt || item.createdAt || item.expenseDate || Date.now());
    const index = date.getMonth();
    if (!months[index]) continue;
    months[index].gross += Number(item.amount || 0);
    months[index].net += Number(item.amount || 0);
    months[index].count += 1;
  }
  return months;
}

function PasswordGate({ onUnlock }) {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState({ loading: true, hasPin: false, error: "" });

  useEffect(() => {
    let alive = true;
    getAdminSalesPin()
      .then((result) => {
        if (!alive) return;
        setStatus({ loading: false, hasPin: Boolean(result?.hasPin), error: "" });
      })
      .catch((error) => {
        if (!alive) return;
        setStatus({ loading: false, hasPin: false, error: error.message || "비밀번호 상태를 확인하지 못했습니다." });
      });
    return () => { alive = false; };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus((prev) => ({ ...prev, error: "" }));
    try {
      await verifyAdminSalesPin(pin);
      sessionStorage.setItem("icl-studio-sales-unlocked", "1");
      onUnlock();
    } catch (error) {
      setStatus((prev) => ({ ...prev, error: error.message || "비밀번호가 올바르지 않습니다." }));
    }
  }

  return (
    <div className="studio-sales-lock">
      <div className="studio-sales-lock-header">
        <h2 className="studio-sales-lock-title">매출 비밀번호 입력</h2>
        <p className="studio-sales-lock-desc">매출 페이지 접근을 위한 비밀번호를 입력해주세요.</p>
      </div>

      <section className="studio-sales-lock-card">
        {status.loading ? (
          <p className="studio-sales-message">확인 중...</p>
        ) : !status.hasPin ? (
          <div className="studio-sales-nopin">
            <div className="studio-sales-nopin-icon-wrap">
              <span className="studio-sales-nopin-icon-emoji">🔒</span>
              <span className="studio-sales-nopin-badge">!</span>
            </div>
            <p className="studio-sales-nopin-title">매출 비밀번호가 설정되지 않았습니다.</p>
            <p className="studio-sales-nopin-sub">
              매출 비밀번호를 먼저 등록하시면<br />
              안전하게 매출 페이지에 접근하실 수 있습니다.
            </p>
            <div className="studio-sales-nopin-info">
              <span className="studio-sales-nopin-info-icon">🛡</span>
              <span>매출 비밀번호는 관리자만 설정 및 변경할 수 있으며, 매출 정보 보호를 위해 꼭 필요한 보안 절차입니다.</span>
            </div>
            <button
              type="button"
              className="studio-sales-nopin-btn"
              onClick={() => navigate("/admin/settings/basic")}
            >
              ⚙ 설정 페이지로 이동
            </button>
          </div>
        ) : (
          <form className="studio-sales-lock-form" onSubmit={handleSubmit}>
            <input
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="비밀번호를 입력해주세요."
              autoFocus
            />
            {status.error ? <p className="studio-sales-form-error">{status.error}</p> : null}
            <div className="studio-sales-lock-actions">
              <button type="submit" className="studio-sales-primary-btn" disabled={!pin.trim()}>확인</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, trend = 0, danger = false }) {
  return (
    <article className={`studio-sales-kpi-card${danger ? " danger" : ""}`}>
      <span className="studio-sales-kpi-icon">₩</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small className={Number(trend) >= 0 ? "up" : "down"}>{getTrendText(trend)}</small>
    </article>
  );
}

function PillButton({ active, children, onClick }) {
  return <button type="button" className={`studio-sales-pill${active ? " active" : ""}`} onClick={onClick}>{children}</button>;
}

function DataTable({ columns, rows, emptyText = "데이터 없음" }) {
  return (
    <div className="studio-sales-table-wrap">
      <table className="studio-sales-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key} className={column.highlight ? "studio-sales-cell-highlight" : ""}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          )) : (
            <tr><td colSpan={columns.length} className="studio-sales-empty">{emptyText}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ page, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="studio-sales-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
      {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
        <button key={item} type="button" className={page === item ? "active" : ""} onClick={() => onChange(item)}>{item}</button>
      ))}
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>›</button>
      <span>{PAGE_SIZE}/page</span>
    </div>
  );
}

function ExpenseModal({ staff, onClose, onCreate }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_EXPENSE_FORM, expenseDate: toDateInputValue(new Date()) }));
  const [error, setError] = useState("");

  function setValue(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!form.title.trim()) {
      setError("지출 내역을 입력해 주세요.");
      return;
    }
    if (Number(form.amount || 0) <= 0) {
      setError("지출 금액을 입력해 주세요.");
      return;
    }
    try {
      await onCreate(form);
      onClose();
    } catch (error) {
      setError(error.message || "지출 등록에 실패했습니다.");
    }
  }

  return (
    <div className="studio-sales-modal-backdrop" role="presentation" onClick={onClose}>
      <form className="studio-sales-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="studio-sales-modal-head">
          <h2>지출 등록</h2>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="studio-sales-form-grid">
          <label>지점
            <select value={form.branchId} onChange={(event) => setValue("branchId", event.target.value)}>
              {STUDIO_BRANCHES.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label>지출일
            <input type="date" value={form.expenseDate} onChange={(event) => setValue("expenseDate", event.target.value)} />
          </label>
          <label>구분
            <select value={form.category} onChange={(event) => setValue("category", event.target.value)}>
              {["급여", "소모품", "임대료", "마케팅", "기타"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>결제 방법
            <select value={form.paymentMethod} onChange={(event) => setValue("paymentMethod", event.target.value)}>
              {["카드", "계좌이체", "현금", "기타"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="wide">지출 내역
            <input value={form.title} onChange={(event) => setValue("title", event.target.value)} placeholder="예: 6월 소모품 구매" />
          </label>
          <label>금액
            <input type="number" min="0" value={form.amount} onChange={(event) => setValue("amount", event.target.value)} placeholder="0" />
          </label>
          <label>담당 강사
            <select value={form.instructorName} onChange={(event) => setValue("instructorName", event.target.value)}>
              <option value="">선택 안 함</option>
              {staff.map((person) => <option key={person.id} value={person.name}>{person.name}</option>)}
            </select>
          </label>
          <label>할부
            <input value={form.installmentMonths} onChange={(event) => setValue("installmentMonths", event.target.value)} placeholder="예: 3개월" />
          </label>
          <label className="wide">증빙 파일 URL
            <input value={form.attachmentUrl} onChange={(event) => setValue("attachmentUrl", event.target.value)} placeholder="영수증 파일 주소" />
          </label>
          <label className="wide">메모
            <textarea value={form.memo} onChange={(event) => setValue("memo", event.target.value)} placeholder="관리 메모" />
          </label>
        </div>
        {error ? <p className="studio-sales-form-error">{error}</p> : null}
        <div className="studio-sales-modal-actions">
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit" className="studio-sales-primary-btn">저장</button>
        </div>
      </form>
    </div>
  );
}

function SalesReportTab({ report, onSave }) {
  const [selected, setSelected] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState({
    allSales: true,
    newPayment: true,
    renewal: true,
    refund: true,
    memberCount: true,
    scheduleCount: true,
    daily: true,
    weekly: true,
    monthly: true,
  });
  const staff = report.staff || [];
  const filteredStaff = staff.filter((item) => getSearchText(item).includes(keyword.toLowerCase()));
  const selectedStaff = staff.filter((item) => selected.includes(item.id));

  function toggleStaff(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : (prev.length >= 5 ? prev : [...prev, id]));
  }

  function toggleOption(key) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const preview = useMemo(() => {
    const gross = formatCurrency(report.summary?.grossSales);
    const net = formatCurrency(report.summary?.netSales);
    return `[이끌림 필라테스] 월간 매출 리포트\n\n[매출]\n- 매출 합계: ${gross}\n- 순매출: ${net}\n- 주문건수: ${report.summary?.orderCount || 0}건\n- 환불률: ${report.summary?.refundRate || 0}%\n\n[회원]\n- 미수금: ${formatCurrency(report.summary?.arrearsAmount)}\n- 포인트 변동: ${(report.points || []).length}건`;
  }, [report]);

  function handleSave() {
    const payload = { selected, options, preview, savedAt: new Date().toISOString() };
    localStorage.setItem("icl-studio-sales-report-settings", JSON.stringify(payload));
    onSave("매출 리포트 설정을 저장했습니다.");
  }

  return (
    <section className="studio-sales-report-grid">
      <div className="studio-sales-info-box">
        <strong>리포트 발송 안내</strong>
        <ol>
          <li>카카오 알림톡·SMS API 키를 등록하면 이 설정을 그대로 발송에 사용할 수 있습니다.</li>
          <li>대상은 최대 5명까지 선택할 수 있습니다.</li>
          <li>저장된 설정은 브라우저에 보관되며, 이후 서버 저장 방식으로 확장할 수 있습니다.</li>
        </ol>
      </div>
      <div className="studio-sales-report-panel">
        <h3>리포트 대상 선택 ({selected.length}/5)</h3>
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="이름, 휴대폰 번호 검색" />
        <div className="studio-sales-staff-list">
          {filteredStaff.map((person) => (
            <label key={person.id} className="studio-sales-staff-row">
              <input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggleStaff(person.id)} />
              <span>{person.name}</span>
              <small>{person.roleCode === "owner" ? "스튜디오 오너" : person.roleCode === "manager" ? "매니저" : "강사"}</small>
              <em>{person.phone || "휴대폰 번호 없음"}</em>
            </label>
          ))}
        </div>
      </div>
      <div className="studio-sales-report-panel">
        <h3>리포트 항목 선택</h3>
        {[
          ["allSales", "매출 모두 선택"],
          ["newPayment", "신규 결제"],
          ["renewal", "재결제"],
          ["refund", "환불"],
          ["memberCount", "회원 수"],
          ["scheduleCount", "일정 수"],
          ["daily", "일일 리포트"],
          ["weekly", "주간 리포트"],
          ["monthly", "월간 리포트"],
        ].map(([key, label]) => (
          <label key={key} className="studio-sales-check-row">
            <input type="checkbox" checked={Boolean(options[key])} onChange={() => toggleOption(key)} />
            {label}
          </label>
        ))}
      </div>
      <div className="studio-sales-report-preview">
        <h3>리포트 미리 보기</h3>
        <p>{selectedStaff.length ? selectedStaff.map((item) => item.name).join(", ") : "대상을 선택해 주세요."}</p>
        <pre>{preview}</pre>
        <button type="button" className="studio-sales-primary-btn" onClick={handleSave}>저장 완료</button>
      </div>
    </section>
  );
}

export function AdminStudioSalesPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const userName = getUserDisplayName(store.currentUser);
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem("icl-studio-sales-unlocked") === "1");
  const [mainTab, setMainTab] = useState("sales");
  const [salesTab, setSalesTab] = useState("pass");
  const [rankTab, setRankTab] = useState("sales");
  const [viewMode, setViewMode] = useState("list");
  const [periodMode, setPeriodMode] = useState("month");
  const [baseDate, setBaseDate] = useState(() => new Date());
  const [customRange, setCustomRange] = useState(() => getRange(new Date(), "month"));
  const [branchId, setBranchId] = useState("");
  const [report, setReport] = useState(EMPTY_REPORT);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterA, setFilterA] = useState("");
  const [filterB, setFilterB] = useState("");
  const [page, setPage] = useState(1);
  const [expenseOpen, setExpenseOpen] = useState(false);

  const range = periodMode === "custom" ? customRange : getRange(baseDate, periodMode);

  const loadReport = useCallback(async () => {
    if (!unlocked) return;
    setLoading(true);
    setError("");
    try {
      const data = await getAdminStudioSalesReport({ from: range.from, to: range.to, branchId });
      setReport({ ...EMPTY_REPORT, ...data });
    } catch (error) {
      setError(error.message || "매출 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [branchId, range.from, range.to, unlocked]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    setPage(1);
    setSearch("");
    setFilterA("");
    setFilterB("");
  }, [mainTab, salesTab, branchId, range.from, range.to]);

  const activeRows = useMemo(() => {
    let rows = [];
    if (mainTab === "sales") {
      if (salesTab === "pass") rows = report.sales || [];
      if (salesTab === "class") rows = report.classSales || [];
      if (salesTab === "other") rows = report.otherSales || [];
    }
    if (mainTab === "expenses") rows = report.expenses || [];
    if (mainTab === "arrears") rows = report.arrears || [];
    if (mainTab === "points") rows = report.points || [];
    const keyword = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (keyword && !getSearchText(row).includes(keyword)) return false;
      if (filterA && !getSearchText(row).includes(filterA.toLowerCase())) return false;
      if (filterB && !getSearchText(row).includes(filterB.toLowerCase())) return false;
      return true;
    });
  }, [filterA, filterB, mainTab, report, salesTab, search]);

  const pageRows = paginate(activeRows, page);
  const chartRows = buildMonthlyChartRows(report.sales || []);
  const rankRows = useMemo(() => {
    if (rankTab === "volume") {
      return Object.entries((report.sales || []).reduce((acc, item) => {
        const key = item.passName || "미분류";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => ({ name, value: count, label: `${count.toLocaleString("ko-KR")}건` }));
    }
    if (rankTab === "age") {
      return [];
    }
    return Object.entries((report.sales || []).reduce((acc, item) => {
      const key = item.passName || "미분류";
      acc[key] = (acc[key] || 0) + Number(item.amount || 0);
      return acc;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, amount]) => ({ name, value: amount, label: formatCurrency(amount) }));
  }, [rankTab, report.sales]);

  const tableColumns = useMemo(() => {
    if (mainTab === "expenses") {
      return [
        { key: "category", label: "구분" },
        { key: "expenseDate", label: "결제일", render: (row) => formatDateTime(row.expenseDate) },
        { key: "title", label: "지출 내용" },
        { key: "amount", label: "지출 금액", render: (row) => formatCurrency(row.amount), highlight: true },
        { key: "paymentMethod", label: "결제 방법" },
        { key: "installmentMonths", label: "할부" },
        { key: "instructorName", label: "담당 강사" },
        { key: "attachmentUrl", label: "첨부파일", render: (row) => row.attachmentUrl ? <a href={row.attachmentUrl} target="_blank" rel="noreferrer">보기</a> : "-" },
      ];
    }
    if (mainTab === "arrears") {
      return [
        { key: "branchName", label: "구분" },
        { key: "createdAt", label: "최근 결제일", render: (row) => formatDateTime(row.createdAt) },
        { key: "paymentMethod", label: "최근 결제방법", render: () => "-" },
        { key: "userName", label: "회원명" },
        { key: "passName", label: "상품명" },
        { key: "amount", label: "남은 미수금", render: (row) => formatCurrency(row.amount), highlight: true },
      ];
    }
    if (mainTab === "points") {
      return [
        { key: "createdAt", label: "일시", render: (row) => formatDateTime(row.createdAt) },
        { key: "staff", label: "스태프", render: () => "-" },
        { key: "userName", label: "회원명" },
        { key: "type", label: "구분", render: (row) => Number(row.amount || 0) >= 0 ? "적립" : "차감" },
        { key: "reason", label: "분류" },
        { key: "amount", label: "내용", render: (row) => `${Number(row.amount || 0).toLocaleString("ko-KR")}P`, highlight: true },
      ];
    }
    if (salesTab === "class") {
      return [
        { key: "branchName", label: "수업" },
        { key: "passName", label: "수강권" },
        { key: "classStartAt", label: "수업 일시", render: (row) => formatDateTime(row.classStartAt || row.createdAt) },
        { key: "userName", label: "회원명" },
        { key: "classTitle", label: "수강권명" },
        { key: "amount", label: "회당 금액", render: (row) => formatCurrency(row.amount), highlight: true },
        { key: "instructorName", label: "수업 강사" },
        { key: "attendance", label: "출결", render: () => "출석" },
      ];
    }
    return [
      { key: "paymentType", label: "구분" },
      { key: "branchName", label: "수업" },
      { key: "paidAt", label: "결제일", render: (row) => formatDateTime(row.paidAt) },
      { key: "userName", label: "회원명" },
      { key: "passName", label: "수강권명" },
      { key: "amount", label: "결제 금액", render: (row) => formatCurrency(row.amount), highlight: true },
      { key: "paymentMethod", label: "결제 방법" },
      { key: "instructorName", label: "담당 강사" },
    ];
  }, [mainTab, salesTab]);

  function shiftPeriod(direction) {
    const next = new Date(baseDate);
    if (periodMode === "day") next.setDate(next.getDate() + direction);
    else if (periodMode === "week") next.setDate(next.getDate() + (direction * 7));
    else next.setMonth(next.getMonth() + direction);
    setBaseDate(next);
  }

  function handleDownload() {
    const rows = activeRows.map((row) => tableColumns.map((column) => column.render ? String(column.render(row)?.props?.children ?? column.render(row)) : String(row[column.key] ?? "")));
    downloadXlsx(`studio-sales-${mainTab}-${range.from}-${range.to}.xlsx`, [
      { name: "데이터", rows: [tableColumns.map((column) => column.label), ...rows] },
    ]);
    setMessage("엑셀 파일을 다운로드했습니다.");
  }

  async function handleCreateExpense(payload) {
    await createAdminStudioExpense(payload);
    setMessage("지출 내역을 등록했습니다.");
    await loadReport();
  }

  return (
    <AdminLayout
      appClass="studio-sales-app"
      userName={userName}
      searchValue={search}
      onSearchChange={(e) => setSearch(e.target.value)}
    >

      {!unlocked ? (
        <PasswordGate onUnlock={() => setUnlocked(true)} />
      ) : (
        <>
          <main className="studio-sales-page">
        <section className="studio-sales-header">
          <div className="studio-sales-main-tabs">
            {MAIN_TABS.map((tab) => (
              <button key={tab.value} type="button" className={mainTab === tab.value ? "active" : ""} onClick={() => setMainTab(tab.value)}>{tab.label}</button>
            ))}
          </div>
          <div className="studio-sales-period">
            <select value={periodMode} onChange={(event) => setPeriodMode(event.target.value)}>
              {PERIOD_TABS.map((tab) => <option key={tab.value} value={tab.value}>{tab.label}</option>)}
            </select>
            <button type="button" onClick={() => shiftPeriod(-1)}>‹</button>
            <strong>{range.label}</strong>
            <button type="button" onClick={() => shiftPeriod(1)}>›</button>
            {periodMode === "custom" ? (
              <>
                <input type="date" value={customRange.from} onChange={(event) => setCustomRange((prev) => ({ ...prev, from: event.target.value }))} />
                <span>~</span>
                <input type="date" value={customRange.to} onChange={(event) => setCustomRange((prev) => ({ ...prev, to: event.target.value }))} />
              </>
            ) : null}
          </div>
        </section>

        {mainTab === "sales" ? (
          <>
            <section className="studio-sales-kpis">
              <SummaryCard label="순매출" value={formatWon(report.summary?.netSales)} trend={report.summary?.monthOverMonthRate} />
              <SummaryCard label="주문건수" value={`${report.summary?.orderCount || 0}건`} trend={0} />
              <SummaryCard label="객단가" value={formatWon(report.summary?.averageOrderAmount)} trend={0} />
              <SummaryCard label="환불률" value={`${report.summary?.refundRate || 0}%`} trend={Number(report.summary?.refundRate || 0)} danger={Number(report.summary?.refundRate || 0) >= 3} />
              <SummaryCard label="실매출" value={formatWon(report.summary?.realSales)} trend={report.summary?.monthOverMonthRate} />
            </section>

            <section className="studio-sales-grid">
              <article className="studio-sales-panel studio-sales-chart-panel">
                <div className="studio-sales-panel-head">
                  <div>
                    <h2>매출 추세</h2>
                    <p>월간 매출 추이</p>
                  </div>
                  <div className="studio-sales-toggle-group">
                    <PillButton active={viewMode === "chart"} onClick={() => setViewMode("chart")}>차트</PillButton>
                    <PillButton active={viewMode === "list"} onClick={() => setViewMode("list")}>리스트</PillButton>
                  </div>
                </div>
                {viewMode === "chart" ? (
                  <ReactApexChart
                    type="line"
                    height={270}
                    options={{
                      chart: { toolbar: { show: false }, fontFamily: "inherit" },
                      colors: ["#8D6841", "#C7B29A"],
                      stroke: { curve: "smooth", width: 3 },
                      markers: { size: 3 },
                      xaxis: { categories: chartRows.map((item) => item.key) },
                      yaxis: { labels: { formatter: (value) => `${Math.round(value / 1000)}K` } },
                      legend: { position: "top" },
                    }}
                    series={[
                      { name: "총매출", data: chartRows.map((item) => item.gross) },
                      { name: "순매출", data: chartRows.map((item) => item.net) },
                    ]}
                  />
                ) : (
                  <div className="studio-sales-month-list">
                    {chartRows.map((item) => (
                      <div key={item.key}>
                        <strong>{item.key}</strong>
                        <span>{item.count}건</span>
                        <em>{formatCurrency(item.gross)}</em>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="studio-sales-panel">
                <div className="studio-sales-panel-head">
                  <div>
                    <h2>주의가 필요한 항목</h2>
                    <p>환불률 3% 이상이면 경고로 표시됩니다.</p>
                  </div>
                  <button type="button" onClick={() => setMainTab("arrears")}>자세히 보기 ›</button>
                </div>
                <div className="studio-sales-risk-grid">
                  <div><span>환불 요청</span><strong>{(report.refunds || []).length}건</strong><small>{formatCurrency(report.summary?.refundAmount)}</small></div>
                  <div className={Number(report.summary?.refundRate || 0) >= 3 ? "danger" : ""}><span>환불률</span><strong>{report.summary?.refundRate || 0}%</strong><small>{Number(report.summary?.refundRate || 0) >= 3 ? "평균보다 높음" : "안정 범위"}</small></div>
                  <div><span>미수금</span><strong>{formatCurrency(report.summary?.arrearsAmount)}</strong><small>{(report.arrears || []).length}건</small></div>
                  <div><span>지출</span><strong>{formatCurrency(report.summary?.expenseAmount)}</strong><small>등록 지출 합계</small></div>
                </div>
              </article>
            </section>
          </>
        ) : null}

        {mainTab === "sales" ? (
          <section className="studio-sales-panel">
            <div className="studio-sales-panel-head">
              <h2>TOP 성과 분석</h2>
              <div className="studio-sales-toggle-group">
                <PillButton active={rankTab === "sales"} onClick={() => setRankTab("sales")}>매출 TOP3</PillButton>
                <PillButton active={rankTab === "volume"} onClick={() => setRankTab("volume")}>판매량 TOP3</PillButton>
                <PillButton active={rankTab === "age"} onClick={() => setRankTab("age")}>연령대 TOP3</PillButton>
              </div>
            </div>
            <div className="studio-sales-rank-list">
              {rankRows.map((item, index) => (
                <div key={item.name} className="studio-sales-rank-row">
                  <span>{index + 1}</span>
                  <strong>{item.name}</strong>
                  <div><i style={{ width: `${Math.max(10, Math.min(100, (item.value / Math.max(1, rankTab === "volume" ? report.sales?.length || 1 : report.summary?.grossSales || 1)) * 100))}%` }} /></div>
                  <em>{item.label}</em>
                </div>
              ))}
              {!rankRows.length ? <p className="studio-sales-empty">{rankTab === "age" ? "연령대 데이터는 회원 생년월일 입력 후 표시됩니다." : "매출 데이터가 없습니다."}</p> : null}
            </div>
          </section>
        ) : null}

        {mainTab !== "report" ? (
          <section className="studio-sales-panel">
            <div className="studio-sales-panel-head">
              <div>
                <h2>{mainTab === "sales" ? "매출 상세" : mainTab === "expenses" ? "지출" : mainTab === "arrears" ? "미수금" : "포인트"}</h2>
                <p>{loading ? "데이터를 불러오는 중입니다." : `총 ${activeRows.length}건`}</p>
              </div>
              <button type="button" className="studio-sales-blue-btn" onClick={handleDownload}>엑셀 다운로드</button>
            </div>

            {mainTab === "sales" ? (
              <div className="studio-sales-sub-tabs">
                {SALES_TABS.map((tab) => <PillButton key={tab.value} active={salesTab === tab.value} onClick={() => setSalesTab(tab.value)}>{tab.label}</PillButton>)}
              </div>
            ) : null}

            <div className="studio-sales-filterbar">
              <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                <option value="">전체 지점</option>
                {STUDIO_BRANCHES.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <select value={filterA} onChange={(event) => setFilterA(event.target.value)}>
                <option value="">전체 구분</option>
                <option value="신규">신규</option>
                <option value="재결제">재결제</option>
                <option value="환불">환불</option>
                <option value="급여">급여</option>
                <option value="카드">카드</option>
                <option value="계좌">계좌이체</option>
              </select>
              <select value={filterB} onChange={(event) => setFilterB(event.target.value)}>
                <option value="">강사 전체</option>
                {(report.staff || []).map((person) => <option key={person.id} value={person.name}>{person.name}</option>)}
              </select>
              <button type="button" onClick={loadReport}>↻</button>
              <input type="search" placeholder="회원명 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>

            <div className="studio-sales-total-line">
              <strong>총 {activeRows.length}건</strong>
              <span>{getBranchLabel(branchId)} · {range.label}</span>
            </div>

            <DataTable columns={tableColumns} rows={pageRows} />
            <Pagination page={page} total={activeRows.length} onChange={setPage} />
          </section>
        ) : (
          <SalesReportTab report={report} onSave={setMessage} />
        )}

        {message ? <p className="studio-sales-toast">{message}<button type="button" onClick={() => setMessage("")}>확인</button></p> : null}
        {error ? <p className="studio-sales-toast error">{error}<button type="button" onClick={() => setError("")}>확인</button></p> : null}
          </main>

          {mainTab === "expenses" ? (
            <button type="button" className="studio-sales-floating-btn" onClick={() => setExpenseOpen(true)}>＋</button>
          ) : null}
          {expenseOpen ? <ExpenseModal staff={report.staff || []} onClose={() => setExpenseOpen(false)} onCreate={handleCreateExpense} /> : null}
        </>
      )}
    </AdminLayout>
  );
}

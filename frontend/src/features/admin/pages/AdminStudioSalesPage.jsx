import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout.jsx";
import { SalesTrendChart } from "../components/SalesTrendChart.jsx";
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
import "./AdminStudioSalesPage.css";

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

function isSalesPinRequiredError(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || error?.data?.code || "");
  if (error?.status === 403 && (code === "SALES_PIN_REQUIRED" || code === "SALES_PIN_NOT_SET")) {
    return true;
  }
  return message.includes("SALES_PIN_REQUIRED") || message.includes("SALES_PIN_NOT_SET") || message.includes("매출 비밀번호");
}

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
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

function normalizePaymentMethod(value) {
  const method = String(value || "").trim();
  if (method.includes("카드")) return "card";
  if (method.includes("현금")) return "cash";
  if (method.includes("계좌") || method.includes("이체")) return "transfer";
  if (method.includes("포인트")) return "point";
  return "";
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPaymentMethodLabel(value) {
  const method = String(value || "").trim();
  return method || "-";
}

function buildStudioSalesExcelRows(rows, salesTab) {
  const headers = [
    "구분",
    "수업",
    "결제일",
    "회원명",
    "수강권명",
    "카드결제금액",
    "현금결제금",
    "계좌이체금",
    "포인트금액",
    "결제금액",
    "회당 금액",
    "전체 횟수",
    "미수금(위약금)",
    "결제 방법",
    "담당 강사",
  ];

  const body = rows.map((row) => {
    const amount = numberValue(row.amount);
    const pointAmount = numberValue(row.pointAmount);
    const totalCount = numberValue(row.totalCount || row.classCount || row.count);
    const perClassAmount = totalCount > 0 ? Math.round(amount / totalCount) : numberValue(row.perClassAmount);
    const methodKind = normalizePaymentMethod(row.paymentMethod);
    const paymentLabel = getPaymentMethodLabel(row.paymentMethod);
    const isOther = salesTab === "other";
    const isClass = salesTab === "class";

    return [
      row.paymentType || row.paymentKindLabel || (isClass ? "수업 매출" : isOther ? "기타 매출" : "-"),
      row.branchName || row.passType || "-",
      formatDateTime(row.paidAt || row.classStartAt || row.createdAt),
      row.userName || "-",
      row.passName || row.classTitle || row.productName || "-",
      methodKind === "card" ? amount : 0,
      methodKind === "cash" ? amount : 0,
      methodKind === "transfer" ? amount : 0,
      methodKind === "point" ? amount : pointAmount,
      amount,
      perClassAmount,
      totalCount,
      numberValue(row.arrearsAmount || row.penaltyAmount),
      paymentLabel,
      row.instructorName || row.staffName || "-",
    ];
  });

  return [headers, ...body];
}

function buildGenericExcelRows(columns, rows) {
  return [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => {
      if (!column.render) return row[column.key] ?? "";
      const rendered = column.render(row);
      if (typeof rendered === "string" || typeof rendered === "number") return rendered;
      return row[column.key] ?? "";
    })),
  ];
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

function getSalesSummaryCards(salesTab, report, salesBreakdown) {
  if (salesTab === "class") {
    const classRows = Array.isArray(report.classSales) ? report.classSales : [];
    const groupRows = classRows.filter((item) => item.passType !== "private");
    const privateRows = classRows.filter((item) => item.passType === "private");
    const amountOf = (rows) => rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return [
      { key: "total", label: "합계", count: classRows.length, amount: amountOf(classRows), highlight: true },
      { key: "group", label: "그룹", count: groupRows.length, amount: amountOf(groupRows) },
      { key: "private", label: "프라이빗", count: privateRows.length, amount: amountOf(privateRows) },
    ];
  }

  if (salesTab === "other") {
    const otherRows = Array.isArray(report.otherSales) ? report.otherSales : [];
    const amountOf = (kind) => otherRows.filter((item) => item.paymentKind === kind).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const countOf = (kind) => otherRows.filter((item) => item.paymentKind === kind).length;
    return [
      { key: "total", label: "합계", count: otherRows.length, amount: otherRows.reduce((sum, item) => sum + Number(item.amount || 0), 0), highlight: true },
      { key: "rental", label: "대여", count: countOf("rental"), amount: amountOf("rental") },
      { key: "sale", label: "판매", count: countOf("sale"), amount: amountOf("sale") },
      { key: "transfer", label: "양도 / 환불 수수료", count: salesBreakdown.transfer.count, amount: salesBreakdown.transfer.amount },
      { key: "refund", label: "환불", count: salesBreakdown.refund.count, amount: salesBreakdown.refund.amount },
      { key: "arrears", label: "미수금 결제", count: 0, amount: 0 },
    ];
  }

  return [
    { key: "total", label: "합계", count: salesBreakdown.total.count, amount: salesBreakdown.total.amount, highlight: true },
    { key: "new", label: "신규결제", count: salesBreakdown.new.count, amount: salesBreakdown.new.amount },
    { key: "renewal", label: "재결제", count: salesBreakdown.renewal.count, amount: salesBreakdown.renewal.amount },
    { key: "trial", label: "체험", count: salesBreakdown.trial.count, amount: salesBreakdown.trial.amount },
    { key: "refund", label: "환불", count: salesBreakdown.refund.count, amount: salesBreakdown.refund.amount },
    { key: "upgrade", label: "업그레이드", count: salesBreakdown.upgrade.count, amount: salesBreakdown.upgrade.amount },
    { key: "arrears", label: "미수금 결제", count: 0, amount: 0 },
    { key: "transfer", label: "양도 / 환불 수수료", count: salesBreakdown.transfer.count, amount: salesBreakdown.transfer.amount },
  ];
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
      sessionStorage.removeItem("icl-studio-sales-unlocked");
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

function PillButton({ active, children, onClick }) {
  return <button type="button" className={`studio-sales-pill${active ? " active" : ""}`} onClick={onClick}>{children}</button>;
}

function DataTable({ columns, rows, emptyText = "데이터 없음" }) {
  return (
    <div className="studio-sales-table-wrap">
      <table className="studio-sales-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>
                {column.label}
                {column.sublabel ? <span className="studio-sales-th-sub">{column.sublabel}</span> : null}
              </th>
            ))}
          </tr>
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
  const userName = getUserDisplayName(store.currentUser);
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem("icl-studio-sales-unlocked") === "1");
  const [mainTab, setMainTab] = useState("sales");
  const [salesTab, setSalesTab] = useState("pass");
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
  const [filterKind, setFilterKind] = useState("");
  const [filterPass, setFilterPass] = useState("");
  const [filterPayMethod, setFilterPayMethod] = useState("");
  const [filterInstructor, setFilterInstructor] = useState("");
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
    } catch (err) {
      if (isSalesPinRequiredError(err)) {
        sessionStorage.removeItem("icl-studio-sales-unlocked");
        setUnlocked(false);
        setReport(EMPTY_REPORT);
        return;
      }
      setError(err.message || "매출 데이터를 불러오지 못했습니다.");
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
    setFilterKind("");
    setFilterPass("");
    setFilterPayMethod("");
    setFilterInstructor("");
  }, [mainTab, salesTab, branchId, range.from, range.to]);

  const salesBreakdown = useMemo(() => {
    const allSales = report.sales || [];
    const group = (kind) => {
      const items = allSales.filter((i) => i.paymentKind === kind);
      return { count: items.length, amount: items.reduce((s, i) => s + (i.amount || 0), 0) };
    };
    const nonRefund = allSales.filter((i) => i.paymentKind !== "refund");
    return {
      total: { count: nonRefund.length, amount: nonRefund.reduce((s, i) => s + (i.amount || 0), 0) },
      new: group("new"),
      renewal: group("renewal"),
      trial: group("trial"),
      refund: { count: (report.refunds || []).length, amount: report.summary?.refundAmount || 0 },
      upgrade: group("upgrade"),
      transfer: group("transfer"),
    };
  }, [report]);

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
      if (keyword) {
        if (mainTab === "sales") {
          const name = String(row.userName || "").toLowerCase();
          if (!name.includes(keyword)) return false;
        } else {
          if (!getSearchText(row).includes(keyword)) return false;
        }
      }
      if (mainTab === "sales") {
        if (filterKind && row.paymentKind !== filterKind) return false;
        if (filterPass && row.passName !== filterPass) return false;
        if (filterPayMethod && row.paymentMethod !== filterPayMethod) return false;
        if (filterInstructor && row.instructorName !== filterInstructor) return false;
      }
      return true;
    });
  }, [filterInstructor, filterKind, filterPass, filterPayMethod, mainTab, report, salesTab, search]);

  const pageRows = paginate(activeRows, page);
  const chartRows = buildMonthlyChartRows(report.sales || []);
  const salesSummaryCards = useMemo(
    () => getSalesSummaryCards(salesTab, report, salesBreakdown),
    [report, salesBreakdown, salesTab]
  );

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
        { key: "passType", label: "수강권", render: (row) => row.passType === "private" ? "프라이빗" : "그룹" },
        { key: "classStartAt", label: "수업 일시", render: (row) => formatDate(row.classStartAt || row.createdAt) },
        { key: "userName", label: "회원명" },
        { key: "classTitle", label: "수강권명" },
        { key: "amount", label: "회당 금액", sublabel: "(전체 횟수)", render: (row) => formatCurrency(row.amount), highlight: true },
        { key: "deductedAmount", label: "차감 금액", sublabel: "(차감 횟수)", render: (row) => `${formatCurrency(row.amount)} (${row.usedCount || 1}회)` },
        { key: "usedAmount", label: "누적사용 금액", sublabel: "(누적사용 횟수)", render: (row) => `${formatCurrency(Number(row.amount || 0) * Number(row.usedCount || 1))} (${row.usedCount || 1}회)` },
        { key: "arrears", label: "미수입금", sublabel: "(잔여 횟수)", render: () => "0원" },
        { key: "paymentAmount", label: "결제 금액", render: (row) => formatCurrency(row.amount) },
        { key: "instructorName", label: "수업 강사" },
        { key: "attendance", label: "출결", render: () => "출석" },
      ];
    }
    if (salesTab === "other") {
      return [
        { key: "paymentType", label: "구분", render: (row) => row.paymentType || "-" },
        { key: "paidAt", label: "결제일", render: (row) => formatDate(row.paidAt || row.createdAt) },
        { key: "userName", label: "회원명" },
        { key: "productName", label: "상품명", render: (row) => row.productName || row.passName || "-" },
        { key: "amount", label: "결제 금액", sublabel: "(환불금액)", render: (row) => formatCurrency(row.amount), highlight: true },
        { key: "pointAmount", label: "포인트 금액", sublabel: "(환불 포인트)", render: () => "0P" },
        { key: "arrearsAmount", label: "미수금", sublabel: "(위약금)", render: () => "0원" },
        { key: "paymentMethod", label: "결제 방법" },
        { key: "instructorName", label: "담당 강사", render: (row) => row.instructorName || "-" },
      ];
    }
    return [
      { key: "paymentType", label: "구분", render: (row) => row.paymentType || "-" },
      { key: "branchName", label: "수업" },
      { key: "paidAt", label: "결제일", render: (row) => formatDate(row.paidAt) },
      { key: "userName", label: "회원명" },
      { key: "passName", label: "수강권명" },
      {
        key: "amount",
        label: "결제금액",
        sublabel: "(환불금액)",
        render: (row) => formatCurrency(row.amount),
        highlight: true,
      },
      {
        key: "pointAmount",
        label: "포인트금액",
        sublabel: "(환불포인트)",
        render: () => "-",
      },
      {
        key: "perClassAmount",
        label: "회당금액",
        sublabel: "(전체횟수)",
        render: (row) => {
          const total = Number(row.totalCount || 0);
          if (!total) return "-";
          return (
            <span>
              {formatCurrency(Math.round((row.amount || 0) / total))}
              <span className="studio-sales-cell-sub">({total}회)</span>
            </span>
          );
        },
      },
      {
        key: "arrearsAmount",
        label: "미수금",
        sublabel: "(위약금)",
        render: () => "-",
      },
      { key: "paymentMethod", label: "결제방법" },
      { key: "instructorName", label: "담당강사" },
    ];
  }, [mainTab, salesTab]);

  function shiftPeriod(direction) {
    const next = new Date(baseDate);
    if (periodMode === "day") next.setDate(next.getDate() + direction);
    else if (periodMode === "week") next.setDate(next.getDate() + (direction * 7));
    else next.setMonth(next.getMonth() + direction);
    setBaseDate(next);
  }

  function goToThisMonth() {
    setBaseDate(new Date());
    setPeriodMode("month");
  }

  function handleDownload() {
    const isSalesDownload = mainTab === "sales";
    const rows = isSalesDownload
      ? buildStudioSalesExcelRows(activeRows, salesTab)
      : buildGenericExcelRows(tableColumns, activeRows);
    const salesLabel = salesTab === "class" ? "수업매출" : salesTab === "other" ? "기타매출" : "수강권매출";
    const filePrefix = isSalesDownload ? `${salesLabel}_현황` : `studio-${mainTab}`;
    downloadXlsx(`${filePrefix}${range.from}~${range.to}.xlsx`, [
      { name: "Sheet1", rows },
    ]);
    setMessage("엑셀 파일을 다운로드했습니다.");
  }

  async function handleCreateExpense(payload) {
    await createAdminStudioExpense(payload);
    setMessage("지출 내역을 등록했습니다.");
    await loadReport();
  }

  const totalAmount = activeRows.reduce((s, r) => s + (r.amount || 0), 0);
  const displayTotalAmount = mainTab === "sales"
    ? activeRows.reduce((sum, row) => sum + (row.paymentKind === "refund" ? 0 : Number(row.amount || 0)), 0)
    : totalAmount;
  const passNames = useMemo(() => [...new Set((report.sales || []).map((s) => s.passName).filter(Boolean))], [report.sales]);

  return (
    <AdminLayout appClass="studio-sales-app" userName={userName}>
      {!unlocked ? (
        <PasswordGate onUnlock={() => setUnlocked(true)} />
      ) : (
        <>
          <main className="studio-sales-page">

            {/* Header: main tabs + period selector */}
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
                {periodMode !== "custom" && (
                  <button type="button" className="studio-sales-this-month-btn" onClick={goToThisMonth}>이번달</button>
                )}
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
                {/* Sub-tabs bar */}
                <section className="studio-sales-subtabs-bar">
                  <div className="studio-sales-sub-tabs">
                    {SALES_TABS.map((tab) => (
                      <PillButton key={tab.value} active={salesTab === tab.value} onClick={() => setSalesTab(tab.value)}>{tab.label}</PillButton>
                    ))}
                    <button type="button" className="studio-sales-refresh-btn" onClick={loadReport} title="새로고침">↻</button>
                  </div>
                  <div className="studio-sales-toggle-group">
                    <PillButton active={viewMode === "chart"} onClick={() => setViewMode("chart")}>차트</PillButton>
                    <PillButton active={viewMode === "list"} onClick={() => setViewMode("list")}>리스트</PillButton>
                  </div>
                </section>

                {/* Summary cards */}
                <section className="studio-sales-summary-section">
                  <div className="studio-sales-prev-card">
                    <div className="studio-sales-prev-card-title">지난달</div>
                    <div className="studio-sales-prev-row"><span>총</span><strong>{salesBreakdown.total.count}건</strong></div>
                    <div className="studio-sales-prev-row"><span>총</span><strong>{formatCurrency(report.summary?.previousGross)}</strong></div>
                    <div className="studio-sales-prev-divider" />
                    <div className="studio-sales-prev-row"><span>신규</span><strong>{formatCurrency(salesBreakdown.new.amount)}</strong></div>
                    <div className="studio-sales-prev-row"><span>재등록</span><strong>{formatCurrency(salesBreakdown.renewal.amount)}</strong></div>
                    <div className="studio-sales-prev-row"><span>환불</span><strong>{formatCurrency(salesBreakdown.refund.amount)}</strong></div>
                  </div>
                  <div className="studio-sales-summary-cards">
                    {salesSummaryCards.map((card) => (
                      <div key={card.key} className={`studio-sales-summary-card${card.highlight ? " highlight" : ""}`}>
                        <div className="studio-sales-summary-card-title">
                          {card.highlight ? <span aria-hidden="true">✓</span> : null}
                          {card.label}
                        </div>
                        <div className="studio-sales-summary-card-bottom">
                          <span>{card.count}건</span>
                          <strong>{formatCurrency(card.amount)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Chart view (only when viewMode === 'chart') */}
                {viewMode === "chart" ? (
                  <section className="studio-sales-panel studio-sales-chart-panel">
                    <div className="studio-sales-panel-head">
                      <div>
                        <h2>매출 추세</h2>
                        <p>월간 매출 추이</p>
                      </div>
                    </div>
                    <SalesTrendChart rows={chartRows} labelKey="key" height={240} />
                  </section>
                ) : null}

                {/* Filter bar */}
                <div className="studio-sales-filterbar">
                  <select value={filterKind} onChange={(event) => setFilterKind(event.target.value)}>
                    <option value="">결제구분 전체</option>
                    <option value="new">신규결제</option>
                    <option value="renewal">재결제</option>
                    <option value="trial">체험</option>
                    <option value="refund">환불</option>
                    <option value="upgrade">업그레이드</option>
                    <option value="transfer">양도</option>
                  </select>
                  <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                    <option value="">수업 전체</option>
                    {STUDIO_BRANCHES.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                  <select value={filterPass} onChange={(event) => setFilterPass(event.target.value)}>
                    <option value="">수강권 전체</option>
                    {passNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <select value={filterPayMethod} onChange={(event) => setFilterPayMethod(event.target.value)}>
                    <option value="">결제방법 전체</option>
                    <option value="카드">카드</option>
                    <option value="계좌이체">계좌이체</option>
                    <option value="현금">현금</option>
                    <option value="기타">기타</option>
                  </select>
                  <select value={filterInstructor} onChange={(event) => setFilterInstructor(event.target.value)}>
                    <option value="">강사 전체</option>
                    {(report.staff || []).map((person) => <option key={person.id} value={person.name}>{person.name}</option>)}
                  </select>
                  <button type="button" onClick={loadReport}>↻</button>
                  <button type="button" className="studio-sales-blue-btn" onClick={handleDownload}>엑셀 다운로드</button>
                </div>

                {/* Total + search */}
                <div className="studio-sales-total-line">
                  <strong>총 {activeRows.length}건 {loading ? "" : `(${formatCurrency(displayTotalAmount)})`}</strong>
                  <input type="search" placeholder="회원명 검색" value={search} onChange={(event) => setSearch(event.target.value)} className="studio-sales-member-search" />
                </div>

                <DataTable columns={tableColumns} rows={pageRows} emptyText={loading ? "불러오는 중..." : "매출 데이터가 없습니다."} />
                <Pagination page={page} total={activeRows.length} onChange={setPage} />
              </>
            ) : mainTab !== "report" ? (
              <>
                <div className="studio-sales-filterbar">
                  <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                    <option value="">전체 지점</option>
                    {STUDIO_BRANCHES.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                  <button type="button" onClick={loadReport}>↻</button>
                  {mainTab === "expenses" && (
                    <button type="button" className="studio-sales-blue-btn" onClick={handleDownload}>엑셀 다운로드</button>
                  )}
                  <input type="search" placeholder="검색" value={search} onChange={(event) => setSearch(event.target.value)} className="studio-sales-member-search" />
                </div>
                <div className="studio-sales-total-line">
                  <strong>총 {activeRows.length}건</strong>
                </div>
                <DataTable columns={tableColumns} rows={pageRows} emptyText={loading ? "불러오는 중..." : "데이터가 없습니다."} />
                <Pagination page={page} total={activeRows.length} onChange={setPage} />
              </>
            ) : (
              <SalesReportTab report={report} onSave={setMessage} />
            )}

          </main>

          {message ? <p className="studio-sales-toast">{message}<button type="button" onClick={() => setMessage("")}>확인</button></p> : null}
          {error ? <p className="studio-sales-toast error">{error}<button type="button" onClick={() => setError("")}>확인</button></p> : null}

          {mainTab === "expenses" ? (
            <button type="button" className="studio-sales-floating-btn" onClick={() => setExpenseOpen(true)}>＋</button>
          ) : null}
          {expenseOpen ? <ExpenseModal staff={report.staff || []} onClose={() => setExpenseOpen(false)} onCreate={handleCreateExpense} /> : null}
        </>
      )}
    </AdminLayout>
  );
}

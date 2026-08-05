import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout.jsx";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
// 파일 역할: 관리자가 스튜디오 수강권 상품과 판매/대여 상품을 등록, 수정, 판매중지하는 화면입니다.
import {
  listAdminPassProducts,
  createAdminPassProduct,
  updateAdminPassProduct,
  deleteAdminPassProduct,
  listAdminGoods,
  createAdminGoods,
  updateAdminGoods,
  deleteAdminGoods,
  listIssuedPassesByProduct,
  extendAdminIssuedPasses,
} from "../../studio/api/studioApi.js";
import { DEFAULT_STUDIO_BRANCH_ID, STUDIO_BRANCHES, getStudioBranchName } from "../../studio/constants/studioBranches.js";

const PASS_TYPE_LABELS = { count: "횟수제", period: "기간제" };
const CLASS_TYPE_LABELS = { private: "프라이빗", group: "그룹형" };

const PASS_COLORS = [
  "#2ec4b6", "#ff6b6b", "#9b7bff", "#f2994a",
  "#4aa3ff", "#e91e8c", "#27ae60", "#b35a52",
];

const VALID_DAYS_PRESETS = [
  { label: "1개월 (30일)", value: 30 },
  { label: "2개월 (60일)", value: 60 },
  { label: "3개월 (90일)", value: 90 },
  { label: "6개월 (180일)", value: 180 },
  { label: "1년 (365일)", value: 365 },
  { label: "직접입력", value: 0 },
];

const USAGE_LIMIT_OPTS = [
  { label: "제한없음", value: 0 },
  { label: "1회", value: 1 },
  { label: "2회", value: 2 },
  { label: "3회", value: 3 },
  { label: "4회", value: 4 },
  { label: "직접입력", value: -1 },
];

const EMPTY_GOODS_FORM = {
  id: "",
  name: "",
  goodsType: "sale",
  color: PASS_COLORS[4],
  price: "",
  points: 0,
  status: "active",
  description: "",
};

const EMPTY_FORM = {
  id: "",
  branchId: DEFAULT_STUDIO_BRANCH_ID,
  name: "",
  passType: "count",
  classType: "group",
  isTrial: false,
  color: PASS_COLORS[2],
  totalCount: 10,
  cancelCount: 10,
  validDays: 30,
  validDaysCustom: false,
  capacity: 1,
  price: "",
  points: 0,
  usageLimitType: "week",
  usageLimit: 0,
  usageLimitCustom: false,
  autoDeduct: false,
  classCategory: "",
  sameDay: false,
  sameDayCount: 0,
  bookingStartTime: "",
  bookingEndTime: "",
  isFeatured: false,
  status: "active",
  description: "",
};

function formatCurrency(value) {
  const n = Number(value || 0);
  if (!n) return "0원";
  return `${n.toLocaleString("ko-KR")}원`;
}

function Stepper({ value, onChange, min = 0, unit = "회" }) {
  return (
    <div className="admin-pass-stepper">
      <button type="button" className="admin-pass-stepper-btn" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className="admin-pass-stepper-val">
        <span>{value}</span>
        <span className="admin-pass-stepper-unit">{unit}</span>
      </span>
      <button type="button" className="admin-pass-stepper-btn" onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

export function AdminStudioPassPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);

  const [statusFilter, setStatusFilter] = useState("active");
  const [selectedBranchId, setSelectedBranchId] = useState(DEFAULT_STUDIO_BRANCH_ID);
  const [passTypeFilter, setPassTypeFilter] = useState("");
  const [classTypeFilter, setClassTypeFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const [editingGoods, setEditingGoods] = useState(false);
  const [goodsForm, setGoodsForm] = useState(EMPTY_GOODS_FORM);
  const [goodsSaving, setGoodsSaving] = useState(false);
  const [goods, setGoods] = useState([]);

  const [viewingPass, setViewingPass] = useState(null);
  const [issuedPasses, setIssuedPasses] = useState([]);
  const [issuedLoading, setIssuedLoading] = useState(false);
  const [issuedPage, setIssuedPage] = useState(1);

  const [bulkExtendOpen, setBulkExtendOpen] = useState(false);
  const [bulkExtendDays, setBulkExtendDays] = useState(30);
  const [bulkExtending, setBulkExtending] = useState(false);
  const ISSUED_PAGE_SIZE = 10;

  const [mainTab, setMainTab] = useState("pass");

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  async function loadProducts() {
    setLoading(true);
    try {
      const rows = await listAdminPassProducts({ branchId: selectedBranchId });
      setProducts(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "수강권 목록을 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  async function loadGoods() {
    try {
      const rows = await listAdminGoods();
      setGoods(Array.isArray(rows) ? rows : []);
    } catch {}
  }

  useEffect(() => { loadProducts(); loadGoods(); }, [selectedBranchId]);

  const filtered = useMemo(() => {
    return products.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (passTypeFilter && item.passType !== passTypeFilter) return false;
      if (classTypeFilter && item.classType !== classTypeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.trim().toLowerCase();
        if (!item.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [products, statusFilter, passTypeFilter, classTypeFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function openDetail(item) {
    setViewingPass(item);
    setIssuedPage(1);
    setIssuedLoading(true);
    try {
      const rows = await listIssuedPassesByProduct(item.id);
      setIssuedPasses(rows);
    } catch {
      setIssuedPasses([]);
    } finally {
      setIssuedLoading(false);
    }
  }

  function closeDetail() {
    setViewingPass(null);
    setIssuedPasses([]);
    setBulkExtendOpen(false);
  }

  async function handleBulkExtend() {
    if (!viewingPass) return;
    setBulkExtending(true);
    try {
      const result = await extendAdminIssuedPasses(viewingPass.id, bulkExtendDays);
      setMessage({ type: "success", text: `${result.extendedCount}개 수강권이 ${bulkExtendDays}일 연장되었습니다.` });
      setBulkExtendOpen(false);
      const rows = await listIssuedPassesByProduct(viewingPass.id);
      setIssuedPasses(rows);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "연장에 실패했습니다." });
    } finally {
      setBulkExtending(false);
    }
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM, branchId: selectedBranchId, color: PASS_COLORS[products.length % PASS_COLORS.length] });
    setEditing(true);
  }

  function openEdit(item) {
    const presetVals = VALID_DAYS_PRESETS.filter(p => p.value > 0).map(p => p.value);
    setForm({
      id: item.id,
      branchId: item.branchId || selectedBranchId,
      name: item.name,
      passType: item.passType,
      classType: item.classType,
      isTrial: Boolean(item.isTrial),
      color: item.color,
      totalCount: item.totalCount,
      cancelCount: item.cancelCount ?? 0,
      validDays: item.validDays,
      validDaysCustom: !presetVals.includes(item.validDays),
      capacity: item.capacity,
      price: String(item.price),
      points: item.points ?? 0,
      usageLimitType: item.usageLimitType || "week",
      usageLimit: item.usageLimit ?? 0,
      usageLimitCustom: (item.usageLimit ?? 0) > 4,
      autoDeduct: Boolean(item.autoDeduct),
      classCategory: item.classCategory || "",
      sameDay: Boolean(item.sameDay),
      sameDayCount: item.sameDayCount ?? 0,
      bookingStartTime: item.bookingStartTime || "",
      bookingEndTime: item.bookingEndTime || "",
      isFeatured: item.isFeatured,
      status: item.status,
      description: item.description || "",
    });
    setEditing(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setMessage({ type: "error", text: "수강권 이름을 입력해 주세요." });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, price: Number(form.price || 0) };
      const saved = form.id
        ? await updateAdminPassProduct(form.id, payload)
        : await createAdminPassProduct(payload);
      setProducts((prev) => {
        const without = prev.filter((item) => item.id !== form.id && item.id !== saved.id);
        return [saved, ...without].sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt));
      });
      setEditing(false);
      setMessage({ type: "success", text: "수강권이 저장되었습니다." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "저장에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("이 수강권 상품을 삭제할까요?")) return;
    try {
      await deleteAdminPassProduct(id);
      setProducts((prev) => prev.filter((item) => item.id !== id));
      setMessage({ type: "success", text: "삭제되었습니다." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "삭제에 실패했습니다." });
    }
  }

  async function handleToggleStatus(item) {
    try {
      const saved = await updateAdminPassProduct(item.id, { ...item, status: item.status === "active" ? "inactive" : "active" });
      setProducts((prev) => prev.map((p) => p.id === saved.id ? saved : p));
    } catch (error) {
      setMessage({ type: "error", text: error.message || "상태 변경에 실패했습니다." });
    }
  }

  async function handleToggleFeatured(item) {
    try {
      const saved = await updateAdminPassProduct(item.id, { ...item, isFeatured: !item.isFeatured });
      setProducts((prev) => prev.map((p) => p.id === saved.id ? saved : p));
      setViewingPass((prev) => (prev && prev.id === saved.id ? saved : prev));
    } catch (error) {
      setMessage({ type: "error", text: error.message || "변경에 실패했습니다." });
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((item) => item.id)));
  }

  async function handleDeleteGoods(id) {
    if (!window.confirm("이 상품을 삭제할까요?")) return;
    try {
      await deleteAdminGoods(id);
      setGoods((prev) => prev.filter((g) => g.id !== id));
    } catch (error) {
      setMessage({ type: "error", text: error.message || "삭제에 실패했습니다." });
    }
  }

  function openCreateGoods() {
    setGoodsForm({ ...EMPTY_GOODS_FORM });
    setEditingGoods(true);
  }

  function openEditGoods(item) {
    setGoodsForm({
      id: item.id,
      name: item.name,
      goodsType: item.goodsType,
      color: item.color,
      price: String(item.price),
      points: item.points ?? 0,
      status: item.status,
      description: item.description || "",
    });
    setEditingGoods(true);
  }

  async function handleGoodsSave(e) {
    e.preventDefault();
    if (!goodsForm.name.trim()) {
      setMessage({ type: "error", text: "상품명을 입력해 주세요." });
      return;
    }
    setGoodsSaving(true);
    try {
      const payload = { ...goodsForm, price: Number(goodsForm.price || 0) };
      goodsForm.id
        ? await updateAdminGoods(goodsForm.id, payload)
        : await createAdminGoods(payload);
      await loadGoods();
      setEditingGoods(false);
      setMessage({ type: "success", text: "상품이 저장되었습니다." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "저장에 실패했습니다." });
    } finally {
      setGoodsSaving(false);
    }
  }

  const F = form;
  const setF = (update) => setForm((prev) => ({ ...prev, ...update }));
  const GF = goodsForm;
  const setGF = (update) => setGoodsForm((prev) => ({ ...prev, ...update }));

  return (
    <AdminLayout
      appClass="admin-pass-app"
      userName={currentUserName}
      searchValue={searchQuery}
      onSearchChange={(e) => setSearchQuery(e.target.value)}
    >

      {editingGoods ? (
        <form className="admin-pass-fp" onSubmit={handleGoodsSave}>
          <div className="admin-pass-fp-titlebar">
            <div className="admin-pass-fp-titlebar-inner">
              <div className="admin-pass-fp-crumb">수강권 &gt; {GF.id ? "상품 수정" : "상품 등록"}</div>
              <div className="admin-pass-fp-title-row">
                <h2 className="admin-pass-fp-h1">{GF.id ? "상품 수정" : "상품 등록"}</h2>
              </div>
            </div>
          </div>
          <div className="admin-pass-fp-hr" />

          <div className="admin-pass-fp-body">
            {message.text ? (
              <div className={`admin-pass-message ${message.type}`} style={{ marginBottom: 24 }} onClick={() => setMessage({ type: "", text: "" })}>
                {message.text}
              </div>
            ) : null}

            {/* 01 상품 종류 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">01</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">상품 종류</div>
                <div className="admin-pass-fp-radio-row">
                  {[{ v: "sale", l: "판매 상품" }, { v: "rental", l: "대여 상품" }].map((o) => (
                    <label key={o.v} className="admin-pass-fp-radio">
                      <input type="radio" checked={GF.goodsType === o.v} onChange={() => setGF({ goodsType: o.v })} />
                      <span>{o.l}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* 02 상품명 입력 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">02</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">상품명 입력</div>
                <input
                  className="admin-pass-fp-underline-input"
                  value={GF.name}
                  onChange={(e) => setGF({ name: e.target.value })}
                  placeholder="상품명을 입력해 주세요"
                />
              </div>
            </div>

            {/* 03 상품 색상 설정 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">03</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">상품 색상 설정</div>
                <p className="admin-pass-fp-desc">
                  수강권 유형별(그룹형, 프라이빗형)로 기본 색상이 설정되어 있습니다.<br />
                  다른 색상을 지정하려면 색상 추가 버튼을 클릭해서 색상을 변경 할 수 있습니다.<br />
                  기본 색상 외 다른 색상을 지정하면 웹 페이지에서만 반영됩니다.
                </p>
                <div className="admin-pass-fp-color-area">
                  <div className="admin-pass-fp-color-left">
                    <div className="admin-pass-fp-swatches">
                      {PASS_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`admin-pass-fp-swatch${GF.color === c ? " on" : ""}`}
                          style={{ backgroundColor: c }}
                          onClick={() => setGF({ color: c })}
                        >
                          {GF.color === c ? "✓" : null}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    className="admin-pass-fp-color-preview"
                    style={{ background: `linear-gradient(135deg, ${GF.color}ee, ${GF.color}99)` }}
                  >
                    <span className="admin-pass-fp-preview-type">상품</span>
                    <span className="admin-pass-fp-preview-name">{GF.name || "상품 색상 설정 예시"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 04 상품 판매정보 입력 */}
            <div className="admin-pass-fp-sec last">
              <span className="admin-pass-fp-num">04</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">상품 판매정보 입력</div>
                <div className="admin-pass-fp-price-row">
                  <div className="admin-pass-fp-price-group">
                    <div className="admin-pass-fp-price-label">판매가 입력</div>
                    <div className="admin-pass-fp-price-wrap">
                      <input
                        type="number"
                        min="0"
                        value={GF.price}
                        onChange={(e) => setGF({ price: e.target.value })}
                        placeholder="0"
                      />
                      <span>원</span>
                    </div>
                  </div>
                  <div className="admin-pass-fp-price-group">
                    <div className="admin-pass-fp-price-label">
                      적립 포인트 입력 <span className="admin-pass-fp-help-badge">?</span>
                    </div>
                    <div className="admin-pass-fp-price-wrap">
                      <input
                        type="number"
                        min="0"
                        value={GF.points}
                        onChange={(e) => setGF({ points: Number(e.target.value) })}
                        placeholder="0"
                      />
                      <span>P</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-pass-fp-footer">
            <button type="button" className="admin-pass-fp-back-btn" onClick={() => setEditingGoods(false)}>
              ← 뒤로가기
            </button>
            <button type="submit" className="admin-pass-fp-submit-btn" disabled={goodsSaving}>
              {goodsSaving ? "저장 중..." : GF.id ? "상품 수정 완료" : "상품 등록 완료"}
            </button>
          </div>
        </form>
      ) : editing ? (
        <form className="admin-pass-fp" onSubmit={handleSave}>
          {/* 타이틀 바 */}
          <div className="admin-pass-fp-titlebar">
            <div className="admin-pass-fp-titlebar-inner">
              <div className="admin-pass-fp-crumb">수강권 &gt; {F.id ? "수강권 수정" : "수강권 등록"}</div>
              <div className="admin-pass-fp-title-row">
                <h2 className="admin-pass-fp-h1">{F.id ? "수강권 수정" : "수강권 등록"}</h2>
                <select
                  className="admin-pass-fp-class-select"
                  aria-label="수강권 지점"
                  value={F.branchId || selectedBranchId}
                  onChange={(e) => setF({ branchId: e.target.value })}
                >
                  {STUDIO_BRANCHES.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
                <select
                  className="admin-pass-fp-class-select"
                  aria-label="수강권 수업 형태"
                  value={F.classType}
                  onChange={(e) => setF({ classType: e.target.value })}
                >
                  <option value="group">그룹형 수업 전용</option>
                  <option value="private">프라이빗 전용</option>
                </select>
              </div>
            </div>
          </div>
          <div className="admin-pass-fp-hr" />

          <div className="admin-pass-fp-body">
            {message.text ? (
              <div className={`admin-pass-message ${message.type}`} style={{ marginBottom: 24 }} onClick={() => setMessage({ type: "", text: "" })}>
                {message.text}
              </div>
            ) : null}

            {/* 01 체험권 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">01</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">체험권</div>
              </div>
              <label className="admin-pass-fp-check-right">
                <input type="checkbox" checked={F.isTrial} onChange={(e) => setF({ isTrial: e.target.checked })} />
                <span>사용함</span>
              </label>
            </div>

            {/* 02 수강권 종류 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">02</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">수강권 종류</div>
                <div className="admin-pass-fp-radio-row">
                  {[{ v: "count", l: "횟수제" }, { v: "period", l: "기간제" }].map((o) => (
                    <label key={o.v} className="admin-pass-fp-radio">
                      <input type="radio" checked={F.passType === o.v} onChange={() => setF({ passType: o.v })} />
                      <span>{o.l}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* 03 수강권명 입력 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">03</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">수강권명 입력</div>
                <input
                  className="admin-pass-fp-underline-input"
                  value={F.name}
                  onChange={(e) => setF({ name: e.target.value })}
                  placeholder="수강권명을 입력해 주세요"
                />
              </div>
            </div>

            {/* 04 수강권 색상 설정 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">04</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">수강권 색상 설정</div>
                <p className="admin-pass-fp-desc">
                  수강권 유형별(그룹형, 프라이빗형)로 기본 색상이 설정되어 있습니다.<br />
                  다른 색상을 지정하려면 색상 추가 버튼을 클릭해서 색상을 변경 할 수 있습니다.<br />
                  기본 색상 외 다른 색상을 지정하면 웹 페이지에서만 반영됩니다.
                </p>
                <div className="admin-pass-fp-color-area">
                  <div className="admin-pass-fp-color-left">
                    <div className="admin-pass-fp-swatches">
                      {PASS_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`admin-pass-fp-swatch${F.color === c ? " on" : ""}`}
                          style={{ backgroundColor: c }}
                          onClick={() => setF({ color: c })}
                        >
                          {F.color === c ? "✓" : null}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    className="admin-pass-fp-color-preview"
                    style={{ background: `linear-gradient(135deg, ${F.color}ee, ${F.color}99)` }}
                  >
                    <span className="admin-pass-fp-preview-type">
                      {F.classType === "group" ? "그룹형" : "프라이빗"} 수강권
                    </span>
                    <span className="admin-pass-fp-preview-name">
                      {F.name || "수강권 색상 설정 예시"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 05 이용횟수 설정 (횟수제만) */}
            {F.passType === "count" ? (
              <div className="admin-pass-fp-sec">
                <span className="admin-pass-fp-num">05</span>
                <div className="admin-pass-fp-sec-content">
                  <div className="admin-pass-fp-sec-title">이용횟수 설정</div>
                  <div className="admin-pass-fp-stepper-row">
                    <div className="admin-pass-fp-stepper-group">
                      <div className="admin-pass-fp-stepper-label">총 이용횟수</div>
                      <Stepper value={F.totalCount} onChange={(v) => setF({ totalCount: v })} min={1} unit="회" />
                    </div>
                    <div className="admin-pass-fp-stepper-group">
                      <div className="admin-pass-fp-stepper-label">취소 가능 횟수</div>
                      <Stepper value={F.cancelCount} onChange={(v) => setF({ cancelCount: v })} min={0} unit="회" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* 06 수강권 사용기한 설정 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">06</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">수강권 사용기한 설정</div>
                <div className="admin-pass-fp-radio-grid">
                  {VALID_DAYS_PRESETS.map((o) => (
                    <label key={o.value} className="admin-pass-fp-radio">
                      <input
                        type="radio"
                        checked={o.value === 0 ? F.validDaysCustom : (!F.validDaysCustom && F.validDays === o.value)}
                        onChange={() => {
                          if (o.value === 0) setF({ validDaysCustom: true });
                          else setF({ validDays: o.value, validDaysCustom: false });
                        }}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
                {F.validDaysCustom ? (
                  <div className="admin-pass-fp-custom-wrap">
                    <input
                      type="number"
                      min="1"
                      value={F.validDays}
                      onChange={(e) => setF({ validDays: Number(e.target.value) })}
                      placeholder="일 수 직접 입력"
                      className="admin-pass-fp-custom-input"
                    />
                    <span>일</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* 07 수강인원 설정 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">07</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">수강인원 설정</div>
                <Stepper value={F.capacity} onChange={(v) => setF({ capacity: v })} min={1} unit="명" />
              </div>
            </div>

            {/* 08 수강권 판매정보 입력 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">08</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">수강권 판매정보 입력</div>
                <div className="admin-pass-fp-price-row">
                  <div className="admin-pass-fp-price-group">
                    <div className="admin-pass-fp-price-label">판매가 입력</div>
                    <div className="admin-pass-fp-price-wrap">
                      <input
                        type="number"
                        min="0"
                        value={F.price}
                        onChange={(e) => setF({ price: e.target.value })}
                        placeholder="0"
                      />
                      <span>원</span>
                    </div>
                  </div>
                  <div className="admin-pass-fp-price-group">
                    <div className="admin-pass-fp-price-label">
                      적립 포인트 입력 <span className="admin-pass-fp-help-badge">?</span>
                    </div>
                    <div className="admin-pass-fp-price-wrap">
                      <input
                        type="number"
                        min="0"
                        value={F.points}
                        onChange={(e) => setF({ points: Number(e.target.value) })}
                        placeholder="0"
                      />
                      <span>P</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 09 주간/월간 이용 횟수 설정 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">09</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">주간/월간 이용 횟수 설정</div>
                <p className="admin-pass-fp-desc">
                  주간 이용 횟수의 제한 기준은 <strong>매주 월요일 ~ 일요일</strong> 기준입니다.<br />
                  월간 이용 횟수의 제한 기준은 <strong>매월 1일 ~ 말일</strong> 기준입니다.
                </p>
                <div className="admin-pass-fp-tabs">
                  {[{ v: "week", l: "주간 이용 횟수" }, { v: "month", l: "월간 이용 횟수" }].map((t) => (
                    <button
                      key={t.v}
                      type="button"
                      className={`admin-pass-fp-tab${F.usageLimitType === t.v ? " active" : ""}`}
                      onClick={() => setF({ usageLimitType: t.v })}
                    >{t.l}</button>
                  ))}
                </div>
                <div className="admin-pass-fp-radio-grid">
                  {USAGE_LIMIT_OPTS.map((o) => (
                    <label key={o.value} className="admin-pass-fp-radio">
                      <input
                        type="radio"
                        checked={
                          o.value === -1
                            ? (F.usageLimitCustom || F.usageLimit > 4)
                            : (!F.usageLimitCustom && F.usageLimit === o.value)
                        }
                        onChange={() => {
                          if (o.value === -1) setF({ usageLimitCustom: true });
                          else setF({ usageLimit: o.value, usageLimitCustom: false });
                        }}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
                {(F.usageLimitCustom || F.usageLimit > 4) ? (
                  <div className="admin-pass-fp-custom-wrap">
                    <input
                      type="number"
                      min="1"
                      value={F.usageLimit > 0 ? F.usageLimit : ""}
                      onChange={(e) => setF({ usageLimit: Number(e.target.value), usageLimitCustom: true })}
                      placeholder="횟수 직접 입력"
                      className="admin-pass-fp-custom-input"
                    />
                    <span>회</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* 10 주간/월간 이용 횟수 자동 차감 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">10</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">주간/월간 이용 횟수 자동 차감</div>
                <p className="admin-pass-fp-desc gray">
                  주간 이용 횟수 만큼 수강권 잔여 횟수가 <strong>매주 월요일 0시</strong>에 사용하지 않아도 자동으로 차감됩니다.<br />
                  월간 이용 횟수 만큼 수강권 잔여 횟수가 <strong>매월 1일 0시</strong>에 사용하지 않아도 자동으로 차감됩니다.
                </p>
              </div>
              <label className="admin-pass-fp-check-right">
                <input type="checkbox" checked={F.autoDeduct} onChange={(e) => setF({ autoDeduct: e.target.checked })} />
                <span>설정함</span>
              </label>
            </div>

            {/* 11 수업 구분 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">11</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">수업 구분</div>
                <p className="admin-pass-fp-desc">
                  수업의 종목을 지정할 수 있습니다. 수업 종목은 하나 이상 다중선택할 수 있습니다.<br />
                  수업 종목을 지정하면 특정 수강권을 가진 회원만 수업을 예약할 수 있습니다.
                </p>
                <select
                  className="admin-pass-fp-select-field"
                  aria-label="수강권 수업 구분"
                  value={F.classCategory}
                  onChange={(e) => setF({ classCategory: e.target.value })}
                >
                  <option value="">수업 구분 없음</option>
                </select>
              </div>
            </div>

            {/* 12 당일 예약 변경 */}
            <div className="admin-pass-fp-sec">
              <span className="admin-pass-fp-num">12</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">당일 예약 변경</div>
                {F.sameDay ? (
                  <div className="admin-pass-fp-sameday-row">
                    <span>회원은 당일 수업 예약을 최대</span>
                    <Stepper value={F.sameDayCount} onChange={(v) => setF({ sameDayCount: v })} min={0} unit="회" />
                    <span>까지 예약 변경 가능합니다.</span>
                  </div>
                ) : null}
              </div>
              <label className="admin-pass-fp-check-right">
                <input type="checkbox" checked={F.sameDay} onChange={(e) => setF({ sameDay: e.target.checked })} />
                <span>사용함</span>
              </label>
            </div>

            {/* 13 예약 가능한 시간 설정 */}
            <div className="admin-pass-fp-sec last">
              <span className="admin-pass-fp-num">13</span>
              <div className="admin-pass-fp-sec-content">
                <div className="admin-pass-fp-sec-title">예약 가능한 시간 설정</div>
                <div className="admin-pass-fp-time-row">
                  <span className="admin-pass-fp-time-icon">⊙</span>
                  <input
                    type="time"
                    value={F.bookingStartTime}
                    onChange={(e) => setF({ bookingStartTime: e.target.value })}
                    className="admin-pass-fp-time-input"
                  />
                  <span className="admin-pass-fp-time-sep">~</span>
                  <span className="admin-pass-fp-time-icon">⊙</span>
                  <input
                    type="time"
                    value={F.bookingEndTime}
                    onChange={(e) => setF({ bookingEndTime: e.target.value })}
                    className="admin-pass-fp-time-input"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 하단 푸터 */}
          <div className="admin-pass-fp-footer">
            <button type="button" className="admin-pass-fp-back-btn" onClick={() => setEditing(false)}>
              ← 뒤로가기
            </button>
            <button type="submit" className="admin-pass-fp-submit-btn" disabled={saving}>
              {saving ? "저장 중..." : F.id ? "수강권 수정 완료" : "수강권 등록 완료"}
            </button>
          </div>
        </form>
      ) : viewingPass ? (
        <div className="admin-pass-detail">
          {/* 히어로 헤더 */}
          <div className="admin-pass-detail-hero" style={{ backgroundColor: viewingPass.color }}>
            <div className="admin-pass-detail-hero-inner">
              <div className="admin-pass-detail-left">
                <div className="admin-pass-detail-breadcrumb">
                  <button type="button" onClick={closeDetail}>수강권</button>
                  <span>›</span>
                  <span>수강권 상세보기</span>
                </div>
                <h2 className="admin-pass-detail-name">{viewingPass.name}</h2>
                <div className="admin-pass-detail-btns">
                  <button
                    type="button"
                    className="admin-pass-detail-btn"
                    onClick={() => { closeDetail(); openEdit(viewingPass); }}
                  >수정</button>
                  <button
                    type="button"
                    className="admin-pass-detail-btn"
                    onClick={() => handleToggleStatus(viewingPass)}
                  >{viewingPass.status === "active" ? "판매 정지" : "판매 재개"}</button>
                  <button type="button" className="admin-pass-detail-btn-ghost" onClick={() => { setBulkExtendDays(30); setBulkExtendOpen(true); }}>수강권 일괄 연장</button>
                </div>
                <div className="admin-pass-detail-price">판매가 {formatCurrency(viewingPass.price)}</div>
              </div>
              <div className="admin-pass-detail-card-wrap">
                <div className="admin-pass-detail-card" style={{ backgroundColor: viewingPass.color }}>
                  <div className="admin-pass-card-tags">
                    <span>{viewingPass.branchName || getStudioBranchName(viewingPass.branchId)}</span>
                    <span>·</span>
                    <span>{PASS_TYPE_LABELS[viewingPass.passType]}</span>
                    <span>·</span>
                    <span>{CLASS_TYPE_LABELS[viewingPass.classType]}</span>
                    <span>·</span>
                    <span>{viewingPass.capacity}:{viewingPass.capacity === 1 ? "1" : String(viewingPass.capacity)}</span>
                  </div>
                  <button
                    type="button"
                    className={`admin-pass-star${viewingPass.isFeatured ? " on" : ""}`}
                    onClick={() => handleToggleFeatured(viewingPass)}
                    title="즐겨찾기"
                  >★</button>
                  <div className="admin-pass-detail-card-name">{viewingPass.name}</div>
                  <div className="admin-pass-card-meta">{viewingPass.validDays}일 · {viewingPass.totalCount}회</div>
                </div>
              </div>
            </div>
          </div>

          {/* 바디 */}
          <div className="admin-pass-detail-body">
            <div className="admin-pass-detail-tab-bar">
              <span className="admin-pass-detail-tab active">발급된 수강권 ({issuedPasses.length})</span>
            </div>
            <table className="admin-pass-detail-table">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>전화번호</th>
                  <th>수강권정보</th>
                  <th>결제정보</th>
                </tr>
              </thead>
              <tbody>
                {issuedLoading ? (
                  <tr><td colSpan={4} className="admin-pass-detail-empty">불러오는 중...</td></tr>
                ) : issuedPasses.length === 0 ? (
                  <tr><td colSpan={4} className="admin-pass-detail-empty">데이터 없음</td></tr>
                ) : (
                  issuedPasses
                    .slice((issuedPage - 1) * ISSUED_PAGE_SIZE, issuedPage * ISSUED_PAGE_SIZE)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>{p.userName || "-"}</td>
                        <td>{p.userPhone || "-"}</td>
                        <td>
                          <div>{p.passName}</div>
                          <div className="admin-pass-detail-cell-sub">잔여 {p.remainingCount}회 · {p.expiresAt || "기간 없음"} 만료</div>
                        </td>
                        <td>
                          {p.amount ? (
                            <>
                              <div>{Number(p.amount).toLocaleString("ko-KR")}원</div>
                              <div className="admin-pass-detail-cell-sub">{p.paymentMethod || ""} {p.paidAt || ""}</div>
                            </>
                          ) : "-"}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
            {Math.ceil(issuedPasses.length / ISSUED_PAGE_SIZE) > 1 ? (
              <div className="admin-pass-pagination">
                <button type="button" disabled={issuedPage <= 1} onClick={() => setIssuedPage((p) => p - 1)}>‹</button>
                {Array.from({ length: Math.ceil(issuedPasses.length / ISSUED_PAGE_SIZE) }, (_, i) => (
                  <button
                    key={i + 1}
                    type="button"
                    className={issuedPage === i + 1 ? "active" : ""}
                    onClick={() => setIssuedPage(i + 1)}
                  >{i + 1}</button>
                ))}
                <button type="button" disabled={issuedPage >= Math.ceil(issuedPasses.length / ISSUED_PAGE_SIZE)} onClick={() => setIssuedPage((p) => p + 1)}>›</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <main className="admin-pass-body">
            {message.text ? (
              <div className={`admin-pass-message ${message.type}`} onClick={() => setMessage({ type: "", text: "" })}>
                {message.text}
              </div>
            ) : null}

            {/* 탭 */}
            <div className="admin-schedule-category-tabs" role="tablist" aria-label="지점 선택" style={{ marginBottom: 14 }}>
              {STUDIO_BRANCHES.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  className={selectedBranchId === branch.id ? "active" : ""}
                  onClick={() => {
                    setSelectedBranchId(branch.id);
                    setPage(1);
                    setSelectedIds(new Set());
                  }}
                >
                  {branch.name}
                </button>
              ))}
            </div>
            <div className="admin-pass-main-tabs">
              <button
                type="button"
                className={`admin-pass-main-tab${mainTab === "pass" ? " active" : ""}`}
                onClick={() => setMainTab("pass")}
              >수강권 <span>{filtered.length}</span></button>
              <button
                type="button"
                className={`admin-pass-main-tab${mainTab === "goods" ? " active" : ""}`}
                onClick={() => setMainTab("goods")}
              >상품 <span>{goods.length}</span></button>
            </div>

            {/* 필터 바 */}
            {mainTab === "pass" ? <div className="admin-pass-filterbar">
              <div className="admin-pass-filterbar-left">
                <select aria-label="수강권 판매 상태 필터" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                  <option value="active">판매중인 수강권</option>
                  <option value="inactive">판매 정지된 수강권</option>
                  <option value="">전체 수강권</option>
                </select>
                <select aria-label="수강권 타입 필터" value={passTypeFilter} onChange={(e) => { setPassTypeFilter(e.target.value); setPage(1); }}>
                  <option value="">모든 타입</option>
                  <option value="count">횟수제</option>
                  <option value="period">기간제</option>
                </select>
                <select aria-label="수강권 수업 형태 필터" value={classTypeFilter} onChange={(e) => { setClassTypeFilter(e.target.value); setPage(1); }}>
                  <option value="">모든 형태</option>
                  <option value="private">프라이빗</option>
                  <option value="group">그룹형</option>
                </select>
                <button type="button" className="admin-pass-icon-btn" onClick={loadProducts} title="새로고침">↻</button>
              </div>
              <div className="admin-pass-filterbar-right">
                <button
                  type="button"
                  className={`admin-pass-outline-btn${selectedIds.size === filtered.length && filtered.length > 0 ? " active" : ""}`}
                  onClick={selectAll}
                >
                  전체 선택
                </button>
                <span className="admin-pass-total">총 {filtered.length}개의 수강권</span>
              </div>
            </div> : null}

            {/* 수강권 탭 */}
            {mainTab === "pass" ? (<>
            {/* 카드 그리드 */}
            {loading ? (
              <div className="admin-pass-loading">불러오는 중...</div>
            ) : paged.length === 0 ? (
              <div className="admin-pass-empty">등록된 수강권이 없습니다.</div>
            ) : (
              <div className="admin-pass-grid">
                {paged.map((item) => (
                  <div
                    key={item.id}
                    className={`admin-pass-card${selectedIds.has(item.id) ? " selected" : ""}${item.status === "inactive" ? " inactive" : ""}`}
                    onClick={() => openDetail(item)}
                  >
                    <div className="admin-pass-card-top" style={{ backgroundColor: item.color }}>
                      <div className="admin-pass-card-tags">
                        <span>{item.branchName || getStudioBranchName(item.branchId)}</span>
                        <span>·</span>
                        <span>{PASS_TYPE_LABELS[item.passType]}</span>
                        <span>·</span>
                        <span>{CLASS_TYPE_LABELS[item.classType]}</span>
                        <span>·</span>
                        <span>{item.capacity}:{item.capacity === 1 ? "1" : String(item.capacity)}</span>
                      </div>
                      <button
                        type="button"
                        className={`admin-pass-star${item.isFeatured ? " on" : ""}`}
                        onClick={(e) => { e.stopPropagation(); handleToggleFeatured(item); }}
                        title="즐겨찾기"
                      >★</button>
                      <div className="admin-pass-card-name">{item.name}</div>
                      <div className="admin-pass-card-meta">
                        {item.validDays}일 · {item.totalCount}회
                      </div>
                    </div>
                    <div className="admin-pass-card-bottom">
                      <div>
                        <div className="admin-pass-price-row">
                          <span>판매 금액</span>
                          <strong>{formatCurrency(item.price)}</strong>
                        </div>
                        <div className="admin-pass-price-row sub">
                          <span>회당 가격</span>
                          <span>{formatCurrency(item.pricePerSession)}</span>
                        </div>
                      </div>
                      <div className="admin-pass-card-actions">
                        <button
                          type="button"
                          className={`admin-pass-status-btn${item.status === "active" ? " on" : ""}`}
                          onClick={(e) => { e.stopPropagation(); handleToggleStatus(item); }}
                          title={item.status === "active" ? "판매중" : "판매 정지"}
                        >✓</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 페이지네이션 */}
            {totalPages > 1 ? (
              <div className="admin-pass-pagination">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i + 1}
                    type="button"
                    className={page === i + 1 ? "active" : ""}
                    onClick={() => setPage(i + 1)}
                  >{i + 1}</button>
                ))}
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
              </div>
            ) : null}
            </>) : (
            /* 상품 탭 */
            <div className="admin-pass-goods-grid" style={{ marginTop: 24 }}>
              {goods.length === 0 ? (
                <div className="admin-pass-empty" style={{ gridColumn: "1/-1" }}>등록된 상품이 없습니다.</div>
              ) : goods.map((g) => (
                <div key={g.id} className={`admin-pass-goods-card${g.status === "inactive" ? " inactive" : ""}`}>
                  <div className="admin-pass-goods-card-top" style={{ backgroundColor: g.color }}>
                    <span className="admin-pass-goods-badge">{g.goodsType === "rental" ? "대여" : "판매"}</span>
                    <div className="admin-pass-goods-name">{g.name}</div>
                  </div>
                  <div className="admin-pass-goods-card-bottom">
                    <div>
                      <div className="admin-pass-price-row">
                        <span>판매 금액</span>
                        <strong>{formatCurrency(g.price)}</strong>
                      </div>
                    </div>
                    <div className="admin-pass-card-actions">
                      <button type="button" className="admin-pass-edit-btn" onClick={() => openEditGoods(g)}>수정</button>
                      <button type="button" className="admin-pass-del-btn" onClick={() => handleDeleteGoods(g.id)}>삭제</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </main>

          <button className="admin-memberlist-floating-add" type="button" onClick={() => setShowAddMenu(true)} title="상품 등록" aria-label="상품 등록">+</button>

          {showAddMenu ? (
            <div className="admin-pass-add-menu-backdrop" role="presentation" onClick={() => setShowAddMenu(false)}>
              <div className="admin-pass-add-menu" onClick={(e) => e.stopPropagation()}>
                <div className="admin-pass-add-menu-head">
                  <strong>상품 등록</strong>
                  <button type="button" onClick={() => setShowAddMenu(false)}>×</button>
                </div>
                <button
                  type="button"
                  className="admin-pass-add-menu-item"
                  onClick={() => { setShowAddMenu(false); openCreate(); }}
                >
                  <span className="admin-pass-add-menu-icon">
                    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="4" y="11" width="28" height="14" rx="3" stroke="white" strokeWidth="2"/>
                      <line x1="4" y1="18" x2="8" y2="18" stroke="white" strokeWidth="2"/>
                      <line x1="28" y1="18" x2="32" y2="18" stroke="white" strokeWidth="2"/>
                      <circle cx="8" cy="18" r="3" fill="white"/>
                      <circle cx="28" cy="18" r="3" fill="white"/>
                    </svg>
                  </span>
                  <span className="admin-pass-add-menu-text">
                    <strong>수강권</strong>
                    <span>프라이빗 수업 / 그룹 수업</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="admin-pass-add-menu-item"
                  onClick={() => { setShowAddMenu(false); openCreateGoods(); }}
                >
                  <span className="admin-pass-add-menu-icon">
                    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M13 8 L6 13 L9 15 L9 28 L27 28 L27 15 L30 13 L23 8 C22 11 14 11 13 8Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none"/>
                    </svg>
                  </span>
                  <span className="admin-pass-add-menu-text">
                    <strong>상품</strong>
                    <span>운동복, 락커 등 대여 또는 판매 상품</span>
                  </span>
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* 수강권 일괄 연장 모달 */}
      {bulkExtendOpen && viewingPass && (
        <div className="admin-pass-modal-backdrop" role="presentation" onClick={() => setBulkExtendOpen(false)}>
          <div className="admin-pass-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="admin-pass-modal-header">
              <strong>수강권 일괄 연장</strong>
              <button type="button" className="admin-pass-modal-close" onClick={() => setBulkExtendOpen(false)}>✕</button>
            </div>
            <div className="admin-pass-modal-body">
              <p className="admin-pass-modal-desc">
                <strong>{viewingPass.name}</strong>으로 발급된 수강권 중<br />
                활성·정지 상태인 수강권의 만료일을 일괄 연장합니다.
              </p>
              <label className="admin-pass-modal-label">
                연장 일수
                <div className="admin-pass-modal-row">
                  <input
                    type="number"
                    className="admin-pass-modal-input"
                    min={1}
                    max={365}
                    value={bulkExtendDays}
                    onChange={(e) => setBulkExtendDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                  />
                  <span>일</span>
                </div>
              </label>
            </div>
            <div className="admin-pass-modal-footer">
              <button type="button" className="admin-pass-modal-btn-cancel" onClick={() => setBulkExtendOpen(false)}>취소</button>
              <button type="button" className="admin-pass-modal-btn-confirm" onClick={handleBulkExtend} disabled={bulkExtending}>
                {bulkExtending ? "연장 중..." : `${bulkExtendDays}일 연장`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// 파일 역할: 관리자가 상품을 조회, 추가, 수정, 삭제하는 페이지 컴포넌트입니다.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { apiRequest } from "../../../shared/api/client.js";

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `₩${num.toLocaleString("ko-KR")}`;
}

const EMPTY_FORM = { name: "", price: "", description: "", period: "" };

// 컴포넌트 역할: 관리자가 상품을 조회, 추가, 수정, 삭제하는 페이지 컴포넌트입니다.
export function AdminProductPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  async function loadProducts() {
    setLoading(true);
    setLoadError("");
    try {
      const result = await apiRequest("/products");
      setProducts(Array.isArray(result) ? result : []);
    } catch (error) {
      setLoadError(error?.message || "상품 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  function handleEdit(product) {
    setEditingId(product.id);
    setForm({
      name: product.name || "",
      price: String(product.price ?? ""),
      description: product.description || "",
      period: product.period || "",
    });
    setMessage({ type: "", text: "" });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage({ type: "", text: "" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name = form.name.trim();
    const price = Number(form.price);
    const description = form.description.trim();
    const period = form.period.trim();

    if (!name) {
      setMessage({ type: "error", text: "상품 이름을 입력해주세요." });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setMessage({ type: "error", text: "올바른 가격을 입력해주세요." });
      return;
    }

    setSubmitting(true);
    setMessage({ type: "", text: "" });
    try {
      if (editingId) {
        await apiRequest(`/products/${editingId}`, {
          method: "PATCH",
          body: { name, price, description, period },
        });
        setMessage({ type: "success", text: "상품이 수정되었습니다." });
      } else {
        await apiRequest("/products", {
          method: "POST",
          body: { name, price, description, period },
        });
        setMessage({ type: "success", text: "상품이 등록되었습니다." });
      }
      setEditingId(null);
      setForm(EMPTY_FORM);
      await loadProducts();
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "저장에 실패했습니다." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(productId) {
    setSubmitting(true);
    setMessage({ type: "", text: "" });
    try {
      await apiRequest(`/products/${productId}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      setMessage({ type: "success", text: "상품이 삭제되었습니다." });
      await loadProducts();
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "삭제에 실패했습니다." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="content-page">
        <section className="admin-section">
          <section className="admin-dashboard-switch">
            <Link className="admin-dashboard-switch-link" to="/admin">
              회원 관리
            </Link>
            <Link className="admin-dashboard-switch-link active" to="/admin/products">
              상품 관리
            </Link>
            <Link className="admin-dashboard-switch-link" to="/admin/refunds">
              환불 관리
            </Link>
            <Link className="admin-dashboard-switch-link" to="/admin/sales">
              매출 대시보드
            </Link>
            <Link className="admin-dashboard-switch-link admin-dashboard-switch-studio" to="/admin/studio">
              🏃 필라테스 관리
            </Link>
          </section>
          <div className="admin-section-header">
            <h1 className="admin-section-title">상품 관리</h1>
          </div>

          {message.text && (
            <p className={`admin-message ${message.type === "error" ? "admin-message-error" : "admin-message-success"}`}>
              {message.text}
            </p>
          )}

          <section className="admin-card">
            <h2 className="admin-card-title">{editingId ? "상품 수정" : "새 상품 등록"}</h2>
            <form className="admin-product-form" onSubmit={handleSubmit}>
              <div className="admin-form-row">
                <label className="admin-form-label">
                  상품 이름 <span className="required">*</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="상품 이름"
                    disabled={submitting}
                  />
                </label>
                <label className="admin-form-label">
                  가격 (원) <span className="required">*</span>
                  <input
                    type="number"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="0"
                    disabled={submitting}
                  />
                </label>
                <label className="admin-form-label">
                  수강 기간
                  <input
                    type="text"
                    value={form.period}
                    onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                    placeholder="예: 90일, 365일"
                    disabled={submitting}
                  />
                </label>
              </div>
              <label className="admin-form-label">
                설명
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="상품 설명"
                  disabled={submitting}
                />
              </label>
              <div className="admin-form-actions">
                <button type="submit" className="primary-button" disabled={submitting}>
                  {submitting ? "저장 중..." : editingId ? "수정 저장" : "상품 등록"}
                </button>
                {editingId && (
                  <button type="button" className="ghost-button" onClick={handleCancelEdit} disabled={submitting}>
                    취소
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="admin-card">
            <h2 className="admin-card-title">상품 목록 ({products.length}개)</h2>
            {loading ? (
              <p className="admin-loading">불러오는 중...</p>
            ) : loadError ? (
              <p className="admin-error">{loadError}</p>
            ) : products.length === 0 ? (
              <p className="admin-empty">등록된 상품이 없습니다.</p>
            ) : (
              <div className="admin-product-list">
                {products.map((product) => (
                  <div key={product.id} className="admin-product-item">
                    <div className="admin-product-info">
                      <strong className="admin-product-name">{product.name}</strong>
                      <span className="admin-product-price">{formatCurrency(product.price)}</span>
                      {product.period && (
                        <span className="admin-product-period">수강기간: {product.period}</span>
                      )}
                      {product.description && (
                        <p className="admin-product-desc">{product.description}</p>
                      )}
                    </div>
                    <div className="admin-product-actions">
                      <button
                        type="button"
                        className="ghost-button small-ghost"
                        onClick={() => handleEdit(product)}
                        disabled={submitting}
                      >
                        수정
                      </button>
                      {deleteConfirmId === product.id ? (
                        <>
                          <span className="admin-delete-confirm-text">정말 삭제할까요?</span>
                          <button
                            type="button"
                            className="ghost-button small-ghost danger"
                            onClick={() => handleDelete(product.id)}
                            disabled={submitting}
                          >
                            확인
                          </button>
                          <button
                            type="button"
                            className="ghost-button small-ghost"
                            onClick={() => setDeleteConfirmId(null)}
                            disabled={submitting}
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ghost-button small-ghost"
                          onClick={() => setDeleteConfirmId(product.id)}
                          disabled={submitting}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

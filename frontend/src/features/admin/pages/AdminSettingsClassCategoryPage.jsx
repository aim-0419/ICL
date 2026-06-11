import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listAdminClassCategories, createAdminClassCategory, updateAdminClassCategory, deleteAdminClassCategory } from "../../studio/api/studioApi.js";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

const NAV_ITEMS = [
  { label: "← 교육관리", path: "/admin" }, { label: "일정", path: "/admin/studio" },
  { label: "수업", path: "/admin/classes" },
  { label: "회원", path: "/admin/member-list" },
  { label: "강사", path: "/admin/instructors" },
  { label: "수강권", path: "/admin/passes" },
  { label: "메시지", path: "/admin/messages" },
  { label: "게시판", path: "/admin/board" },
  { label: "설정", path: "/admin/settings", active: true },
  { label: "매출", path: "/admin/sales" },
];

export function AdminSettingsClassCategoryPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [categories, setCategories] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [addingLoading, setAddingLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    listAdminClassCategories().then(setCategories).catch(() => {});
  }, []);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setAddingLoading(true);
    try {
      const cat = await createAdminClassCategory(name);
      setCategories((prev) => [...prev, cat]);
      setNewName("");
      setAdding(false);
    } catch (err) {
      setMessage(err.message || "추가에 실패했습니다.");
    } finally {
      setAddingLoading(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteAdminClassCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setMessage(err.message || "삭제에 실패했습니다.");
    }
  }

  async function handleUpdate(id) {
    const name = editingName.trim();
    if (!name) return;
    try {
      await updateAdminClassCategory(id, name);
      setCategories((prev) => prev.map((c) => c.id === id ? { ...c, name } : c));
      setEditingId(null);
      setEditingName("");
    } catch (err) {
      setMessage(err.message || "수정에 실패했습니다.");
    }
  }

  function startEdit(cat) {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setAdding(false);
  }

  return (
    <div className="admin-sroom-app">
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
          <input type="search" placeholder="검색" readOnly />
        </div>
        <button className="admin-schedule-profile" type="button" onClick={() => navigate("/admin")}>
          {currentUserName}
        </button>
      </header>

      <div className="admin-sroom-wrap">
        <div className="admin-sroom-crumb">
          <button type="button" onClick={() => navigate("/admin/settings")}>시설정보수정</button>
          <span>›</span>
          <span>수업 구분 설정</span>
        </div>
        <h1 className="admin-sroom-title">수업 구분 설정</h1>
        <p className="admin-sroom-required-note">* 필수항목입니다</p>

        {/* 01* 수업 구분 추가 */}
        <div className="admin-sroom-sec">
          <div className="admin-sroom-sec-header">
            <span className="admin-sroom-num">01<span className="admin-sroom-req">*</span></span>
            <span className="admin-sroom-sec-title">수업 구분 추가</span>
          </div>
          <div className="admin-sroom-sec-body">
            {/* 추가 버튼 or 입력폼 */}
            {adding ? (
              <div className="admin-sroom-add-form" style={{ marginBottom: 16 }}>
                <input
                  className="admin-sroom-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
                  placeholder="수업 구분을 입력해주세요."
                  autoFocus
                  disabled={addingLoading}
                />
                <button type="button" className="admin-sroom-cancel-btn" onClick={() => { setAdding(false); setNewName(""); }}>취소</button>
                <button type="button" className="admin-sroom-save-btn" onClick={handleAdd} disabled={addingLoading}>
                  {addingLoading ? "저장 중..." : "저장"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="admin-sroom-add-btn"
                style={{ marginBottom: 16 }}
                onClick={() => { setAdding(true); setEditingId(null); }}
              >
                + 수업 구분 추가
              </button>
            )}

            {/* 기존 구분 목록 */}
            {categories.map((cat) => (
              <div key={cat.id} className="admin-sroom-item">
                {editingId === cat.id ? (
                  <>
                    <input
                      className="admin-sroom-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(cat.id); if (e.key === "Escape") { setEditingId(null); setEditingName(""); } }}
                      autoFocus
                      placeholder="수업 구분을 입력해주세요."
                    />
                    <button type="button" className="admin-sroom-cancel-btn" onClick={() => { setEditingId(null); setEditingName(""); }}>취소</button>
                    <button type="button" className="admin-sroom-save-btn" onClick={() => handleUpdate(cat.id)}>저장</button>
                  </>
                ) : (
                  <>
                    <span className="admin-sroom-item-name">{cat.name}</span>
                    <button type="button" className="admin-sroom-edit-btn" onClick={() => startEdit(cat)}>수정</button>
                    <button type="button" className="admin-sroom-delete-btn" onClick={() => handleDelete(cat.id)}>삭제</button>
                  </>
                )}
              </div>
            ))}

            {message && <p style={{ color: "#f04a5e", fontSize: "0.82rem", marginTop: 8 }}>{message}</p>}
          </div>
        </div>

        {/* 하단 footer - 이 페이지는 즉시저장 방식이라 안내만 표시 */}
        <div className="admin-sroom-footer">
          <button type="button" className="admin-sroom-back-btn" onClick={() => navigate("/admin/settings")}>
            ← 뒤로가기
          </button>
          <span className="admin-sroom-footer-msg" />
          <button type="button" className="admin-sroom-submit-btn" onClick={() => navigate("/admin/settings")}>
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

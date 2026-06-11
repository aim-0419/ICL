import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAdminRoleSettings, saveAdminRoleEnabled, createAdminRole, updateAdminRole, deleteAdminRole } from "../../studio/api/studioApi.js";
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

export function AdminSettingsRolePage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [rolesEnabled, setRolesEnabled] = useState(false);
  const [roles, setRoles] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingLoading, setAddingLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getAdminRoleSettings().then((data) => {
      setRolesEnabled(Boolean(data?.rolesEnabled));
      setRoles(Array.isArray(data?.roles) ? data.roles : []);
    }).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await saveAdminRoleEnabled(rolesEnabled);
      setUpdatedAt(new Date().toISOString());
      setMessage("저장되었습니다.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(err.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRole() {
    const name = newRoleName.trim();
    if (!name) return;
    setAddingLoading(true);
    try {
      const role = await createAdminRole(name);
      setRoles((prev) => [...prev, role]);
      setNewRoleName("");
      setAdding(false);
    } catch (err) {
      setMessage(err.message || "롤 추가에 실패했습니다.");
    } finally {
      setAddingLoading(false);
    }
  }

  async function handleDeleteRole(id) {
    try {
      await deleteAdminRole(id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setMessage(err.message || "삭제에 실패했습니다.");
    }
  }

  async function handleUpdateRole(id) {
    const name = editingName.trim();
    if (!name) return;
    try {
      await updateAdminRole(id, name);
      setRoles((prev) => prev.map((r) => r.id === id ? { ...r, name } : r));
      setEditingId(null);
      setEditingName("");
    } catch (err) {
      setMessage(err.message || "수정에 실패했습니다.");
    }
  }

  function startEdit(role) {
    setEditingId(role.id);
    setEditingName(role.name);
    setAdding(false);
  }

  const fmtUpdatedAt = updatedAt
    ? new Date(updatedAt).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

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
          <span>롤 설정</span>
        </div>
        <h1 className="admin-sroom-title">롤 설정</h1>
        <p className="admin-sroom-required-note">* 필수항목입니다</p>

        {/* 01 롤 사용 */}
        <div className="admin-sroom-sec">
          <div className="admin-sroom-sec-header">
            <span className="admin-sroom-num">01<span className="admin-sroom-req">*</span></span>
            <span className="admin-sroom-sec-title">롤 사용</span>
            <span className="admin-sroom-sec-right">
              <label className="admin-sroom-toggle">
                <input
                  type="checkbox"
                  checked={rolesEnabled}
                  onChange={(e) => setRolesEnabled(e.target.checked)}
                />
                <span>사용함</span>
              </label>
            </span>
          </div>
          <div className="admin-sroom-sec-body">
            <p className="admin-sroom-hint">롤 기능을 사용하려면 설정해 주세요.</p>
          </div>
        </div>
        <div className="admin-sroom-divider" />

        {/* 02 롤 추가 */}
        <div className="admin-sroom-sec">
          <div className="admin-sroom-sec-header">
            <span className="admin-sroom-num">02<span className="admin-sroom-req">*</span></span>
            <span className="admin-sroom-sec-title">롤 추가</span>
          </div>
          <div className="admin-sroom-sec-body">
            {roles.map((role) => (
              <div key={role.id} className="admin-sroom-item">
                {editingId === role.id ? (
                  <>
                    <input
                      className="admin-sroom-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleUpdateRole(role.id); if (e.key === "Escape") { setEditingId(null); setEditingName(""); } }}
                      autoFocus
                      placeholder="롤 이름을 입력하세요."
                    />
                    <button type="button" className="admin-sroom-cancel-btn" onClick={() => { setEditingId(null); setEditingName(""); }}>취소</button>
                    <button type="button" className="admin-sroom-save-btn" onClick={() => handleUpdateRole(role.id)}>저장</button>
                  </>
                ) : (
                  <>
                    <span className="admin-sroom-item-name">{role.name}</span>
                    <button type="button" className="admin-sroom-edit-btn" onClick={() => startEdit(role)}>수정</button>
                    <button type="button" className="admin-sroom-delete-btn" onClick={() => handleDeleteRole(role.id)}>삭제</button>
                  </>
                )}
              </div>
            ))}

            {adding ? (
              <div className="admin-sroom-add-form">
                <input
                  className="admin-sroom-input"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddRole(); if (e.key === "Escape") { setAdding(false); setNewRoleName(""); } }}
                  placeholder="롤 이름을 입력하세요."
                  autoFocus
                  disabled={addingLoading}
                />
                <button type="button" className="admin-sroom-cancel-btn" onClick={() => { setAdding(false); setNewRoleName(""); }}>취소</button>
                <button type="button" className="admin-sroom-save-btn" onClick={handleAddRole} disabled={addingLoading}>
                  {addingLoading ? "저장 중..." : "저장"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="admin-sroom-add-btn"
                onClick={() => { setAdding(true); setEditingId(null); }}
              >
                + 새로운 롤 추가
              </button>
            )}
          </div>
        </div>

        {/* 하단 저장 바 */}
        <div className="admin-sroom-footer">
          <button type="button" className="admin-sroom-back-btn" onClick={() => navigate("/admin/settings")}>
            ← 뒤로가기
          </button>
          <span className="admin-sroom-footer-msg">
            {message || (fmtUpdatedAt ? `${fmtUpdatedAt} 에 마지막으로 수정됨` : "")}
          </span>
          <button type="button" className="admin-sroom-submit-btn" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : "정보 수정 완료"}
          </button>
        </div>
      </div>
    </div>
  );
}

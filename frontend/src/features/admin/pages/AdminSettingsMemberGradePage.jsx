import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAdminMemberGradeSettings, saveAdminMemberGradeEnabled, createAdminMemberGrade, updateAdminMemberGrade, deleteAdminMemberGrade } from "../../studio/api/studioApi.js";
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

const PRESET_COLORS = [
  "#f06292", "#f48fb1", "#ff8a65", "#ffa726", "#ffca28",
  "#66bb6a", "#26c6da", "#29b6f6", "#42a5f5", "#5c6bc0", "#ab47bc",
];

function ColorPalette({ selected, onChange }) {
  const colorInputRef = useRef(null);
  return (
    <div className="admin-smg-palette">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`admin-smg-color-dot${selected === c ? " selected" : ""}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        >
          {selected === c && <span className="admin-smg-check">✓</span>}
        </button>
      ))}
      <button
        type="button"
        className="admin-smg-color-add"
        onClick={() => colorInputRef.current?.click()}
      >
        색상 추가
      </button>
      <input
        ref={colorInputRef}
        type="color"
        style={{ display: "none" }}
        value={selected || "#f06292"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function AdminSettingsMemberGradePage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [gradesEnabled, setGradesEnabled] = useState(false);
  const [grades, setGrades] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState(PRESET_COLORS[0]);
  const [addingLoading, setAddingLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getAdminMemberGradeSettings().then((data) => {
      setGradesEnabled(Boolean(data?.memberGradesEnabled));
      setGrades(Array.isArray(data?.grades) ? data.grades : []);
    }).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await saveAdminMemberGradeEnabled(gradesEnabled);
      setUpdatedAt(new Date().toISOString());
      setMessage("저장되었습니다.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(err.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setAddingLoading(true);
    try {
      const grade = await createAdminMemberGrade(name, newColor);
      setGrades((prev) => [...prev, grade]);
      setNewName("");
      setNewColor(PRESET_COLORS[0]);
      setAdding(false);
    } catch (err) {
      setMessage(err.message || "추가에 실패했습니다.");
    } finally {
      setAddingLoading(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteAdminMemberGrade(id);
      setGrades((prev) => prev.filter((g) => g.id !== id));
    } catch (err) {
      setMessage(err.message || "삭제에 실패했습니다.");
    }
  }

  async function handleUpdate(id) {
    const name = editingName.trim();
    if (!name) return;
    try {
      await updateAdminMemberGrade(id, name, editingColor);
      setGrades((prev) => prev.map((g) => g.id === id ? { ...g, name, color: editingColor } : g));
      setEditingId(null);
    } catch (err) {
      setMessage(err.message || "수정에 실패했습니다.");
    }
  }

  function startEdit(grade) {
    setEditingId(grade.id);
    setEditingName(grade.name);
    setEditingColor(grade.color || PRESET_COLORS[0]);
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
          <span>회원 등급 설정</span>
        </div>
        <h1 className="admin-sroom-title">회원 등급 설정</h1>
        <p className="admin-sroom-required-note">* 필수항목입니다</p>

        {/* 01* 회원 등급 사용 */}
        <div className="admin-sroom-sec">
          <div className="admin-sroom-sec-header">
            <span className="admin-sroom-num">01<span className="admin-sroom-req">*</span></span>
            <span className="admin-sroom-sec-title">회원 등급 사용</span>
            <span className="admin-sroom-sec-right">
              <label className="admin-sroom-toggle">
                <input type="checkbox" checked={gradesEnabled} onChange={(e) => setGradesEnabled(e.target.checked)} />
                <span>사용함</span>
              </label>
            </span>
          </div>
          <div className="admin-sroom-sec-body">
            <p className="admin-sroom-hint">회원 등급을 사용하려면 설정해 주세요.</p>
          </div>
        </div>
        {gradesEnabled && <div className="admin-sroom-divider" />}

        {/* 02* 회원 등급 추가 */}
        {gradesEnabled && <div className="admin-sroom-sec">
          <div className="admin-sroom-sec-header">
            <span className="admin-sroom-num">02<span className="admin-sroom-req">*</span></span>
            <span className="admin-sroom-sec-title">회원 등급 추가</span>
          </div>
          <div className="admin-sroom-sec-body">
            {adding ? (
              <div className="admin-smg-add-block">
                <div className="admin-sroom-add-form">
                  <input
                    className="admin-sroom-input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
                    placeholder="회원 등급 이름을 입력하세요."
                    autoFocus
                    disabled={addingLoading}
                  />
                  <button type="button" className="admin-sroom-cancel-btn" onClick={() => { setAdding(false); setNewName(""); setNewColor(PRESET_COLORS[0]); }}>취소</button>
                  <button type="button" className="admin-sroom-save-btn" onClick={handleAdd} disabled={addingLoading}>
                    {addingLoading ? "저장 중..." : "저장"}
                  </button>
                </div>
                <ColorPalette selected={newColor} onChange={setNewColor} />
              </div>
            ) : (
              <button
                type="button"
                className="admin-sroom-add-btn"
                style={{ marginBottom: 16 }}
                onClick={() => { setAdding(true); setEditingId(null); }}
              >
                + 회원 등급 추가
              </button>
            )}

            {grades.map((grade) => (
              <div key={grade.id} className="admin-smg-item">
                {editingId === grade.id ? (
                  <div className="admin-smg-add-block">
                    <div className="admin-sroom-add-form">
                      <input
                        className="admin-sroom-input"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(grade.id); if (e.key === "Escape") { setEditingId(null); } }}
                        autoFocus
                        placeholder="회원 등급 이름을 입력하세요."
                      />
                      <button type="button" className="admin-sroom-cancel-btn" onClick={() => setEditingId(null)}>취소</button>
                      <button type="button" className="admin-sroom-save-btn" onClick={() => handleUpdate(grade.id)}>저장</button>
                    </div>
                    <ColorPalette selected={editingColor} onChange={setEditingColor} />
                  </div>
                ) : (
                  <div className="admin-smg-item-row">
                    <span className="admin-smg-color-badge" style={{ background: grade.color || PRESET_COLORS[0] }} />
                    <span className="admin-sroom-item-name">{grade.name}</span>
                    <button type="button" className="admin-sroom-edit-btn" onClick={() => startEdit(grade)}>수정</button>
                    <button type="button" className="admin-sroom-delete-btn" onClick={() => handleDelete(grade.id)}>삭제</button>
                  </div>
                )}
              </div>
            ))}

            {message && <p style={{ color: "#f04a5e", fontSize: "0.82rem", marginTop: 8 }}>{message}</p>}
          </div>
        </div>}

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

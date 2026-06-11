import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAdminRoomSettings, saveAdminRoomEnabled, createAdminRoom, updateAdminRoom, deleteAdminRoom } from "../../studio/api/studioApi.js";
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

export function AdminSettingsRoomPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [roomsEnabled, setRoomsEnabled] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingLoading, setAddingLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getAdminRoomSettings().then((data) => {
      setRoomsEnabled(Boolean(data?.roomsEnabled));
      setRooms(Array.isArray(data?.rooms) ? data.rooms : []);
    }).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await saveAdminRoomEnabled(roomsEnabled);
      setUpdatedAt(new Date().toISOString());
      setMessage("저장되었습니다.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(err.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRoom() {
    const name = newRoomName.trim();
    if (!name) return;
    setAddingLoading(true);
    try {
      const room = await createAdminRoom(name);
      setRooms((prev) => [...prev, room]);
      setNewRoomName("");
      setAdding(false);
    } catch (err) {
      setMessage(err.message || "룸 추가에 실패했습니다.");
    } finally {
      setAddingLoading(false);
    }
  }

  async function handleDeleteRoom(id) {
    try {
      await deleteAdminRoom(id);
      setRooms((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setMessage(err.message || "삭제에 실패했습니다.");
    }
  }

  async function handleUpdateRoom(id) {
    const name = editingName.trim();
    if (!name) return;
    try {
      await updateAdminRoom(id, name);
      setRooms((prev) => prev.map((r) => r.id === id ? { ...r, name } : r));
      setEditingId(null);
      setEditingName("");
    } catch (err) {
      setMessage(err.message || "수정에 실패했습니다.");
    }
  }

  function startEdit(room) {
    setEditingId(room.id);
    setEditingName(room.name);
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
          <span>룸 설정</span>
        </div>
        <h1 className="admin-sroom-title">룸 설정</h1>
        <p className="admin-sroom-required-note">* 필수항목입니다</p>

        {/* 01 룸 사용 */}
        <div className="admin-sroom-sec">
          <div className="admin-sroom-sec-header">
            <span className="admin-sroom-num">01<span className="admin-sroom-req">*</span></span>
            <span className="admin-sroom-sec-title">룸 사용</span>
            <span className="admin-sroom-sec-right">
              <label className="admin-sroom-toggle">
                <input
                  type="checkbox"
                  checked={roomsEnabled}
                  onChange={(e) => setRoomsEnabled(e.target.checked)}
                />
                <span>사용함</span>
              </label>
            </span>
          </div>
          <div className="admin-sroom-sec-body">
            <p className="admin-sroom-hint">룸 기능을 사용하려면 설정해 주세요.</p>
          </div>
        </div>
        <div className="admin-sroom-divider" />

        {/* 02 룸 추가 */}
        <div className="admin-sroom-sec">
          <div className="admin-sroom-sec-header">
            <span className="admin-sroom-num">02<span className="admin-sroom-req">*</span></span>
            <span className="admin-sroom-sec-title">룸 추가</span>
          </div>
          <div className="admin-sroom-sec-body">
            {/* 기존 룸 목록 */}
            {rooms.map((room) => (
              <div key={room.id} className="admin-sroom-item">
                {editingId === room.id ? (
                  <>
                    <input
                      className="admin-sroom-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleUpdateRoom(room.id); if (e.key === "Escape") { setEditingId(null); setEditingName(""); } }}
                      autoFocus
                      placeholder="룸 이름을 입력하세요."
                    />
                    <button type="button" className="admin-sroom-cancel-btn" onClick={() => { setEditingId(null); setEditingName(""); }}>취소</button>
                    <button type="button" className="admin-sroom-save-btn" onClick={() => handleUpdateRoom(room.id)}>저장</button>
                  </>
                ) : (
                  <>
                    <span className="admin-sroom-item-name">{room.name}</span>
                    <button type="button" className="admin-sroom-edit-btn" onClick={() => startEdit(room)}>수정</button>
                    <button type="button" className="admin-sroom-delete-btn" onClick={() => handleDeleteRoom(room.id)}>삭제</button>
                  </>
                )}
              </div>
            ))}

            {/* 추가 입력폼 */}
            {adding ? (
              <div className="admin-sroom-add-form">
                <input
                  className="admin-sroom-input"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddRoom(); if (e.key === "Escape") { setAdding(false); setNewRoomName(""); } }}
                  placeholder="룸 이름을 입력하세요."
                  autoFocus
                  disabled={addingLoading}
                />
                <button type="button" className="admin-sroom-cancel-btn" onClick={() => { setAdding(false); setNewRoomName(""); }}>취소</button>
                <button type="button" className="admin-sroom-save-btn" onClick={handleAddRoom} disabled={addingLoading}>
                  {addingLoading ? "저장 중..." : "저장"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="admin-sroom-add-btn"
                onClick={() => { setAdding(true); setEditingId(null); }}
              >
                + 새로운 룸 추가
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

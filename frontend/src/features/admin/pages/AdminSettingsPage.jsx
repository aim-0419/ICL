import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout.jsx";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

const SETTINGS_ITEMS = [
  {
    key: "basic",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
        <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="12" cy="15.5" r="1" fill="currentColor"/>
      </svg>
    ),
    title: "필수정보",
    desc: "상호명, 주소, 전화번호, 운영시간 설정",
    path: "/admin/settings/basic",
  },
  {
    key: "operation",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="2"/>
        <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="2"/>
        <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="2"/>
        <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
    title: "운영정보",
    desc: "예약, 게시판, 락커, 체크인, 미수금 자동입력 설정",
    path: "/admin/settings/operation",
  },
  {
    key: "roles",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C17.5 22.15 21 17.25 21 12V6l-8-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    ),
    title: "롤 설정",
    desc: "롤 생성, 수정, 삭제",
    path: "/admin/settings/roles",
  },
  {
    key: "class-category",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="5" width="18" height="3" rx="1.5" fill="currentColor" opacity="0.3"/>
        <rect x="3" y="10.5" width="18" height="3" rx="1.5" fill="currentColor" opacity="0.6"/>
        <rect x="3" y="16" width="18" height="3" rx="1.5" fill="currentColor"/>
      </svg>
    ),
    title: "수업 구분 설정",
    desc: "수업 구분 생성, 수정, 삭제",
    path: "/admin/settings/class-categories",
  },
  {
    key: "member-grade",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 20h18M6 20V10m4 10V4m4 16v-7m4 7v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    title: "회원 등급 설정",
    desc: "회원 등급 생성, 수정, 삭제",
    path: "/admin/settings/member-grades",
  },
  {
    key: "notifications",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 4h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" stroke="currentColor" strokeWidth="2"/>
        <path d="M8 20h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M12 20v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    title: "자동 알림 설정",
    desc: "수업 시작 전, 잔여횟수 만료 알림 설정",
    path: "/admin/settings/notifications",
  },
  {
    key: "rooms",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="8" height="18" rx="1.5" stroke="currentColor" strokeWidth="2"/>
        <rect x="13" y="3" width="8" height="18" rx="1.5" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
    title: "룸 설정",
    desc: "룸 생성, 수정, 삭제",
    path: "/admin/settings/rooms",
  },
];

export function AdminSettingsPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = searchQuery.trim()
    ? SETTINGS_ITEMS.filter((item) =>
        item.title.includes(searchQuery.trim()) || item.desc.includes(searchQuery.trim())
      )
    : SETTINGS_ITEMS;

  return (
    <AdminLayout
      appClass="admin-settings-app"
      userName={currentUserName}
      searchValue={searchQuery}
      onSearchChange={(e) => setSearchQuery(e.target.value)}
    >

      <main className="admin-settings-body">
        <h1 className="admin-settings-title">시설 정보 수정</h1>
        <div className="admin-settings-list">
          {filteredItems.length === 0 ? (
            <p className="admin-settings-empty">검색 결과가 없습니다.</p>
          ) : (
            filteredItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className="admin-settings-row"
                onClick={() => navigate(item.path)}
              >
                <span className="admin-settings-icon">{item.icon}</span>
                <span className="admin-settings-text">
                  <span className="admin-settings-row-title">{item.title}</span>
                  <span className="admin-settings-row-desc">{item.desc}</span>
                </span>
                <span className="admin-settings-arrow">›</span>
              </button>
            ))
          )}
        </div>
      </main>
    </AdminLayout>
  );
}

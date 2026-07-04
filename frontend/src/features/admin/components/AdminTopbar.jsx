import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { label: "← 교육관리", path: "/admin" },
  { label: "일정",         path: "/admin/studio" },
  { label: "수업",         path: "/admin/classes" },
  { label: "회원",         path: "/admin/member-list" },
  { label: "강사",         path: "/admin/instructors" },
  { label: "수강권",       path: "/admin/passes" },
  { label: "메시지",       path: "/admin/messages" },
  { label: "게시판",       path: "/admin/board" },
  { label: "설정",         path: "/admin/settings" },
  { label: "매출",         path: "/admin/studio/sales" },
];

/**
 * 어드민 공통 상단 네비게이션 바
 *
 * Props:
 *   userName        {string}    우측 프로필 버튼 텍스트
 *   searchValue     {string}    검색 input value (없으면 기본 회원검색 동작)
 *   onSearchChange  {Function}  검색 onChange (없으면 기본 회원검색 동작)
 *   onSearchKeyDown {Function}  검색 onKeyDown (optional)
 *   searchSlot      {ReactNode} 검색 영역에 커스텀 컴포넌트 삽입
 *   onAddMember     {Function}  "+" 버튼 onClick (없으면 /admin/member-list 이동)
 *   showNotification {boolean}  알림 벨 아이콘 표시 여부 (기본 false)
 */
export function AdminTopbar({
  userName,
  searchValue,
  onSearchChange,
  onSearchKeyDown,
  searchSlot,
  onAddMember,
  showNotification = false,
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [localSearch, setLocalSearch] = useState("");

  const activePath = useMemo(() => {
    return NAV_ITEMS
      .filter((item) => item.path !== "/admin")
      .sort((a, b) => b.path.length - a.path.length)
      .find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))?.path;
  }, [pathname]);

  const isActive = (item) => item.path !== "/admin" && activePath === item.path;

  // 페이지별 onSearchChange가 없으면 기본 동작: Enter 시 회원 목록으로 이동
  const isControlled = Boolean(onSearchChange);
  const inputValue = isControlled ? (searchValue ?? "") : localSearch;
  const handleChange = isControlled
    ? onSearchChange
    : (e) => setLocalSearch(e.target.value);
  const handleKeyDown = isControlled
    ? onSearchKeyDown
    : (e) => {
        if (e.key === "Enter" && localSearch.trim()) {
          navigate(`/admin/member-list?q=${encodeURIComponent(localSearch.trim())}`);
        }
      };

  return (
    <header className="admin-schedule-topbar">
      {/* col 1 — 로고 */}
      <button className="admin-schedule-logo" type="button" onClick={() => navigate("/")}>
        <span>ICL</span>
      </button>

      {/* col 2 — 네비게이션 */}
      <nav className="admin-schedule-nav" aria-label="admin menu">
        {NAV_ITEMS.map((item) => (
          <Link key={item.path} to={item.path} className={isActive(item) ? "active" : ""}>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* col 3 — 검색 */}
      <div className="admin-schedule-search">
        {searchSlot ?? (
          <input
            type="search"
            placeholder="이름 또는 전화번호 검색"
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>

      {/* col 4 — 회원 추가 버튼 */}
      <button
        className="admin-schedule-add-member"
        type="button"
        aria-label="add member"
        onClick={onAddMember ?? (() => navigate("/admin/member-list"))}
      >
        +
      </button>

      {/* col 5 — 프로필 */}
      <button className="admin-schedule-profile" type="button" onClick={() => navigate("/admin")}>
        {userName}
      </button>

      {/* col 6 — 알림 */}
      <button
        className="admin-schedule-notification-icon"
        type="button"
        aria-label="알림"
        onClick={() => navigate("/admin/board")}
      >
        <span aria-hidden="true" />
      </button>
    </header>
  );
}

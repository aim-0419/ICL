import React, { useMemo, useState } from "react";
import { Bell, ChevronDown, Search, UserPlus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const PAGE_TITLES = [
  { path: "/admin/studio/sales", title: "매출 관리", description: "지점별 매출과 운영 지표" },
  { path: "/admin/settings", title: "설정", description: "스튜디오 운영 환경" },
  { path: "/admin/member-list", title: "회원 관리", description: "회원과 상담 이력" },
  { path: "/admin/instructors", title: "강사 관리", description: "강사 정보와 권한" },
  { path: "/admin/operations", title: "운영 관리", description: "체크인, 미수금과 락커" },
  { path: "/admin/messages", title: "메시지", description: "고객 안내와 발송 이력" },
  { path: "/admin/classes", title: "수업 관리", description: "수업과 예약 현황" },
  { path: "/admin/passes", title: "수강권 관리", description: "수강권 상품과 이용 조건" },
  { path: "/admin/board", title: "게시판 관리", description: "공지와 운영 소식" },
  { path: "/admin/studio", title: "일정", description: "스튜디오 통합 캘린더" },
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

  const currentPage = useMemo(() => {
    return [...PAGE_TITLES]
      .sort((a, b) => b.path.length - a.path.length)
      .find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
      ?? { title: "필라테스 관리", description: "스튜디오 관리자" };
  }, [pathname]);

  // 페이지별 검색 핸들러가 없을 때는 회원 통합 검색으로 연결합니다.
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
      <div className="icl-admin-topbar-title">
        <p>STUDIO MANAGEMENT</p>
        <div>
          <h1>{currentPage.title}</h1>
          <span>{currentPage.description}</span>
        </div>
      </div>

      <div className="admin-schedule-search">
        <Search aria-hidden="true" size={18} strokeWidth={1.8} />
        {searchSlot ?? (
          <input
            type="search"
            aria-label="회원 이름 또는 전화번호 검색"
            placeholder="이름 또는 전화번호 검색"
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>

      <button
        className="admin-schedule-add-member"
        type="button"
        aria-label="회원 추가"
        title="회원 추가"
        onClick={onAddMember ?? (() => navigate("/admin/member-list"))}
      >
        <UserPlus aria-hidden="true" size={20} strokeWidth={1.8} />
      </button>

      <button
        className="admin-schedule-notification-icon"
        type="button"
        aria-label="알림"
        title="알림 및 게시판"
        data-emphasis={showNotification ? "true" : "false"}
        onClick={() => navigate("/admin/board")}
      >
        <Bell aria-hidden="true" size={20} strokeWidth={1.8} />
        {showNotification ? <span className="icl-admin-notification-dot" aria-hidden="true" /> : null}
      </button>

      <button className="admin-schedule-profile" type="button" onClick={() => navigate("/admin")}>
        <span className="icl-admin-profile-avatar" aria-hidden="true">
          {String(userName || "관").trim().slice(0, 1)}
        </span>
        <span className="icl-admin-profile-copy">
          <strong>{userName || "관리자"}</strong>
          <small>관리자</small>
        </span>
        <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} />
      </button>
    </header>
  );
}

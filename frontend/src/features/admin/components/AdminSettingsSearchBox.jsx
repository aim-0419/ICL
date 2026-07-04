import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const SETTINGS_SEARCH_ITEMS = [
  { title: "필수정보", keywords: "상호명 주소 전화번호 운영시간 발신번호 비밀번호", path: "/admin/settings/basic" },
  { title: "운영정보", keywords: "예약 취소 당일변경 폐강 대기 락커 체크인 미수금 게시판", path: "/admin/settings/operation" },
  { title: "롤 설정", keywords: "역할 권한 오너 매니저 강사 접근권한", path: "/admin/settings/roles" },
  { title: "수업 구분 설정", keywords: "프라이빗 그룹 상담 기타일정 카테고리", path: "/admin/settings/class-categories" },
  { title: "회원 등급 설정", keywords: "회원등급 색상 일반회원 관리자 스튜디오회원", path: "/admin/settings/member-grades" },
  { title: "자동 알림 설정", keywords: "문자 푸시 카카오 알림톡 수강권 만료 수업 알림 생일 락커", path: "/admin/settings/notifications" },
  { title: "룸 설정", keywords: "룸 강의실 리포머룸 바렐룸 공간", path: "/admin/settings/rooms" },
];

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

export function AdminSettingsSearchBox({ placeholder = "설정 검색" }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const matches = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return [];
    return SETTINGS_SEARCH_ITEMS.filter((item) => (
      normalizeSearch(`${item.title} ${item.keywords}`).includes(q)
    )).slice(0, 5);
  }, [query]);

  function goTo(path) {
    setFocused(false);
    setQuery("");
    navigate(path);
  }

  function handleKeyDown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (matches[0]) goTo(matches[0].path);
    else navigate("/admin/settings");
  }

  return (
    <div className="admin-schedule-search admin-settings-search-box">
      <span aria-hidden="true">검색</span>
      <input
        type="search"
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={handleKeyDown}
        aria-label="설정 메뉴 검색"
      />
      {focused && query.trim() ? (
        <div className="admin-settings-search-suggestions" role="listbox">
          {matches.length ? matches.map((item) => (
            <button key={item.path} type="button" onMouseDown={() => goTo(item.path)}>
              <strong>{item.title}</strong>
              <span>{item.keywords.split(" ").slice(0, 4).join(" · ")}</span>
            </button>
          )) : (
            <p>검색 결과가 없습니다.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

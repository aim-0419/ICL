/**
 * [사이트 헤더 컴포넌트]
 *
 * 모든 페이지 상단에 표시되는 공통 내비게이션 바입니다.
 * - 로고 클릭 시 홈으로 이동합니다
 * - 로그인 상태에 따라 메뉴가 달라집니다:
 *   · 비로그인: 로그인·회원가입 버튼
 *   · 일반 회원: 마이페이지·로그아웃 버튼
 *   · 관리자(admin0/admin1): 관리자 대시보드 링크 추가
 * - 장바구니 아이콘에 담긴 상품 수를 뱃지로 표시합니다
 * - 관리자 편집 모드(adminPageEditMode)가 켜져 있으면 편집 버튼이 노출됩니다
 * - 820px 이하에서 햄버거 메뉴로 전환됩니다
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { canEditPage, getAdminLandingPath, isAdminStaff } from "../auth/userRoles.js";
import { getUserDisplayName } from "../auth/userDisplay.js";
import { useAppStore } from "../store/AppContext.jsx";
import { isNativeApp } from "../platform/runtime.js";
import { API_BASE_URL } from "../api/client.js";

// 컴포넌트 역할: 공통 상단 헤더와 메뉴, 로그인/로그아웃, 장바구니 이동 버튼을 렌더링합니다.
export function SiteHeader({ subpage = false }) {
  const {
    currentUser,
    logoutUser,
    cart,
    adminPageEditMode,
    setAdminPageEditMode,
    largeControlsEnabled,
    setLargeControlsEnabled,
  } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const currentUserDisplayName = getUserDisplayName(currentUser);
  const nativeApp = isNativeApp();

  const cartQuantity = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [cart]
  );

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 240);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 모바일 메뉴 열릴 때 스크롤 잠금
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileNavOpen]);

  // 라우트 변경 시 메뉴 닫기
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  function handleBrandClick(event) {
    event.preventDefault();
    closeMobileNav();
    if (location.pathname !== "/") {
      navigate("/");
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleScrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleResetCardPositions() {
    const confirmed = window.confirm("현재 페이지 카드 위치를 기본 상태로 되돌릴까요?");
    if (!confirmed) return;

    try {
      localStorage.removeItem("icl_admin_position_overrides_v1");
      localStorage.removeItem("icl_admin_class_overrides_v1");
      localStorage.removeItem("icl_admin_home_section_order_v1");
    } catch {}

    try {
      const res = await fetch(`${API_BASE_URL}/admin/page-overrides`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const overrides = data?.overrides || {};
        const deleteJobs = [];
        for (const type of ["position", "class"]) {
          const keys = Object.keys(overrides[type] || {});
          for (const key of keys) {
            deleteJobs.push(
              fetch(`${API_BASE_URL}/admin/page-overrides`, {
                method: "DELETE",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, key }),
              })
            );
          }
        }
        await Promise.allSettled(deleteJobs);
      }
    } catch {}

    window.dispatchEvent(
      new CustomEvent("admin-editor-reset-positions", {
        detail: { pathname: location.pathname },
      })
    );
    window.location.reload();
  }

  async function handleLogout() {
    closeMobileNav();
    try {
      await logoutUser();
    } finally {
      navigate("/");
    }
  }

  return (
    <>
      <header className={`topbar${subpage ? " subpage-topbar" : ""}`}>
        <Link to="/" className="brand brand-logo" aria-label="메인 페이지로 이동" onClick={handleBrandClick}>
          <img src="/assets/images/이끌림로고.png" alt="ICL Pilates" />
        </Link>

        {/* 데스크톱 nav */}
        <nav className="nav">
          <Link className="nav-link" to="/" onClick={closeMobileNav}>메인</Link>
          <div className="nav-dropdown">
            <button className="nav-trigger" type="button">스튜디오</button>
            <div className="nav-menu">
              <Link to="/ikleulrim/equipment" onClick={closeMobileNav}>이끌림 소개</Link>
              <Link to="/ikleulrim/intro" onClick={closeMobileNav}>수업 소개</Link>
              <Link to="/ikleulrim/instructors" onClick={closeMobileNav}>강사진</Link>
              <Link to="/ikleulrim/directions" onClick={closeMobileNav}>오시는 길</Link>
            </div>
          </div>
          <div className="nav-dropdown">
            <button className="nav-trigger" type="button">아카데미</button>
            <div className="nav-menu">
              <Link to="/academy" onClick={closeMobileNav}>교육 영상</Link>
            </div>
          </div>
          <div className="nav-dropdown">
            <button className="nav-trigger" type="button">커뮤니티</button>
            <div className="nav-menu">
              <Link to="/community/reviews" onClick={closeMobileNav}>후기</Link>
              <Link to="/community/inquiry" onClick={closeMobileNav}>문의하기</Link>
            </div>
          </div>
          <Link className="nav-link" to="/community/events" onClick={closeMobileNav}>이벤트</Link>
        </nav>

        <div className="header-actions">
          <button
            className={`text-link-button header-pill-button accessibility-toggle${largeControlsEnabled ? " active" : ""}`}
            type="button"
            aria-pressed={largeControlsEnabled}
            title="큰 글씨와 큰 버튼 전환"
            onClick={() => setLargeControlsEnabled((current) => !current)}
          >
            가+
          </button>
          {currentUser ? (
            <>
              <Link className="text-link-button header-pill-button user-greeting-link" to="/mypage">
                {currentUserDisplayName}님
              </Link>
              {isAdminStaff(currentUser) ? (
                <Link className="text-link-button header-pill-button" to={getAdminLandingPath(currentUser)}>
                  관리자 대시보드
                </Link>
              ) : null}
              {canEditPage(currentUser) ? (
                <div className="admin-page-edit-stack">
                  <button
                    className={`text-link-button header-pill-button admin-page-edit-button${adminPageEditMode ? " active" : ""}`}
                    type="button"
                    onClick={() => setAdminPageEditMode((current) => !current)}
                  >
                    {adminPageEditMode ? "페이지 수정 ON" : "페이지 수정"}
                  </button>
                  {adminPageEditMode ? (
                    <button
                      className="text-link-button header-pill-button admin-page-reset-button"
                      type="button"
                      onClick={handleResetCardPositions}
                    >
                      위치초기화
                    </button>
                  ) : null}
                </div>
              ) : null}
              <button className="text-link-button header-pill-button" type="button" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link className="text-link-button" to="/login">로그인</Link>
              <Link className="text-link-button" to="/signup">회원가입</Link>
            </>
          )}
          {!nativeApp ? (
            <Link
              className="cart-header-link"
              to="/cart"
              aria-label={cartQuantity > 0 ? `장바구니 ${cartQuantity}개` : "장바구니"}
              title="장바구니"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="cart-header-icon">
                <path
                  d="M3 5h2l2.1 9.1a1.2 1.2 0 0 0 1.2.9h8.9a1.2 1.2 0 0 0 1.2-.9L20 8H7.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="10" cy="19" r="1.2" />
                <circle cx="17" cy="19" r="1.2" />
              </svg>
              {cartQuantity > 0 ? <span className="cart-count-badge">{cartQuantity}</span> : null}
            </Link>
          ) : null}
        </div>

        {/* 모바일 우측: 장바구니 + 햄버거 */}
        <div className="mobile-header-right">
          {!nativeApp ? (
            <Link
              className="cart-header-link"
              to="/cart"
              aria-label={cartQuantity > 0 ? `장바구니 ${cartQuantity}개` : "장바구니"}
              title="장바구니"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="cart-header-icon">
                <path
                  d="M3 5h2l2.1 9.1a1.2 1.2 0 0 0 1.2.9h8.9a1.2 1.2 0 0 0 1.2-.9L20 8H7.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="10" cy="19" r="1.2" />
                <circle cx="17" cy="19" r="1.2" />
              </svg>
              {cartQuantity > 0 ? <span className="cart-count-badge">{cartQuantity}</span> : null}
            </Link>
          ) : null}

          <button
            type="button"
            className={`mobile-nav-toggle${mobileNavOpen ? " is-open" : ""}`}
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? "메뉴 닫기" : "메뉴 열기"}
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        {/* 모바일 풀스크린 메뉴 */}
        {mobileNavOpen ? (
          <div className="mobile-nav-overlay" onClick={closeMobileNav}>
            <nav className="mobile-nav-panel" onClick={(e) => e.stopPropagation()}>
              <Link className="mobile-nav-item" to="/" onClick={closeMobileNav}>메인</Link>

              <div className="mobile-nav-group">
                <span className="mobile-nav-group-label">스튜디오</span>
                <Link className="mobile-nav-sub" to="/ikleulrim/equipment" onClick={closeMobileNav}>이끌림 소개</Link>
                <Link className="mobile-nav-sub" to="/ikleulrim/intro" onClick={closeMobileNav}>수업 소개</Link>
                <Link className="mobile-nav-sub" to="/ikleulrim/instructors" onClick={closeMobileNav}>강사진</Link>
                <Link className="mobile-nav-sub" to="/ikleulrim/directions" onClick={closeMobileNav}>오시는 길</Link>
              </div>

              <div className="mobile-nav-group">
                <span className="mobile-nav-group-label">아카데미</span>
                <Link className="mobile-nav-sub" to="/academy" onClick={closeMobileNav}>교육 영상</Link>
              </div>

              <div className="mobile-nav-group">
                <span className="mobile-nav-group-label">커뮤니티</span>
                <Link className="mobile-nav-sub" to="/community/reviews" onClick={closeMobileNav}>후기</Link>
                <Link className="mobile-nav-sub" to="/community/inquiry" onClick={closeMobileNav}>문의하기</Link>
              </div>

              <Link className="mobile-nav-item" to="/community/events" onClick={closeMobileNav}>이벤트</Link>

              <div className="mobile-nav-auth">
                {currentUser ? (
                  <>
                    <Link className="mobile-nav-auth-link" to="/mypage" onClick={closeMobileNav}>
                      {currentUserDisplayName}님 마이페이지
                    </Link>
                    {isAdminStaff(currentUser) ? (
                      <Link className="mobile-nav-auth-link" to={getAdminLandingPath(currentUser)} onClick={closeMobileNav}>
                        관리자 대시보드
                      </Link>
                    ) : null}
                    <button className="mobile-nav-auth-link mobile-nav-logout" type="button" onClick={handleLogout}>
                      로그아웃
                    </button>
                  </>
                ) : (
                  <>
                    <Link className="mobile-nav-auth-link" to="/login" onClick={closeMobileNav}>로그인</Link>
                    <Link className="mobile-nav-auth-link mobile-nav-signup" to="/signup" onClick={closeMobileNav}>회원가입</Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        ) : null}
      </header>

      <button
        type="button"
        className={`scroll-top-fab${showScrollTop ? " visible" : ""}`}
        onClick={handleScrollTop}
        aria-label="맨 위로 이동"
      >
        ↑
      </button>
    </>
  );
}

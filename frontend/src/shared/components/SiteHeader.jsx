import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppContext.jsx";

function isAdminUser(user) {
  if (!user) return false;
  const normalizedRole = String(user.role || "").toLowerCase();
  const adminFlag = user.isAdmin === true || user.isAdmin === 1 || user.isAdmin === "1";
  return normalizedRole === "admin" || adminFlag || user.email === "admin@iclpilates.com";
}

export function SiteHeader({ subpage = false }) {
  const { currentUser, logoutUser, cart, adminPageEditMode, setAdminPageEditMode } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [showScrollTop, setShowScrollTop] = useState(false);

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

  function handleBrandClick(event) {
    event.preventDefault();

    if (location.pathname !== "/") {
      navigate("/");
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 0);
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleScrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleLogout() {
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
        {!subpage ? (
          <nav className="nav">
            <div className="nav-dropdown">
              <button className="nav-trigger" type="button">
                이끌림
              </button>
              <div className="nav-menu">
                <Link to="/ikleulrim/intro">소개</Link>
                <Link to="/ikleulrim/instructors">강사</Link>
                <Link to="/ikleulrim/tour">둘러보기</Link>
                <Link to="/ikleulrim/equipment">장비소개</Link>
                <Link to="/ikleulrim/directions">오시는길</Link>
              </div>
            </div>
            <Link className="nav-link" to="/academy">
              교육 영상
            </Link>
            <div className="nav-dropdown">
              <button className="nav-trigger" type="button">
                커뮤니티
              </button>
              <div className="nav-menu">
                <Link to="/community/events">이벤트</Link>
                <Link to="/community/reviews">후기</Link>
                <Link to="/community/inquiry">문의하기</Link>
              </div>
            </div>
          </nav>
        ) : null}
        <div className="header-actions">
          {currentUser ? (
            <>
              <Link className="text-link-button user-greeting-link" to="/mypage">
                {currentUser.name}님
              </Link>
              {isAdminUser(currentUser) ? (
                <button
                  className={`text-link-button admin-page-edit-button${adminPageEditMode ? " active" : ""}`}
                  type="button"
                  onClick={() => setAdminPageEditMode((current) => !current)}
                >
                  {adminPageEditMode ? "페이지수정 ON" : "페이지수정"}
                </button>
              ) : null}
              <button className="text-link-button" type="button" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link className="text-link-button" to="/login">
                로그인
              </Link>
              <Link className="text-link-button" to="/signup">
                회원가입
              </Link>
            </>
          )}
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
        </div>
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

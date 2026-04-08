import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppContext.jsx";

export function SiteHeader({ subpage = false }) {
  const { currentUser } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [showScrollTop, setShowScrollTop] = useState(false);

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
          <Link className="text-link-button" to="/login">
            로그인
          </Link>
          <Link className="text-link-button" to="/signup">
            회원가입
          </Link>
          <Link className="text-link-button" to="/cart">
            장바구니
          </Link>
          {currentUser ? (
            <Link className="text-link-button" to="/mypage">
              마이페이지
            </Link>
          ) : null}
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

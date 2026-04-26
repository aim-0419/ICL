// 파일 역할: 사이트 하단 브랜드 정보와 고객 안내 영역을 렌더링합니다.
import { Link } from "react-router-dom";

// 컴포넌트 역할: 공통 푸터 영역을 렌더링합니다.
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="site-footer-nav" aria-label="푸터 메뉴">
        <Link to="/ikleulrim/intro">ABOUT</Link>
        <Link to="/ikleulrim/instructors">INSTRUCTORS</Link>
        <Link to="/academy">CLASSES</Link>
        <Link to="/community/events">NEWS & NOTICE</Link>
        <Link to="/community/inquiry">CONTACT</Link>
      </nav>

      <div className="site-footer-info-grid">
        <p className="site-footer-info-line footer-left">
          <strong>대표</strong> 정지윤 <span aria-hidden="true">|</span>{" "}
          <strong>Business License</strong> 123-45-67890
        </p>
        <p className="site-footer-info-line footer-right">
          <span className="footer-right-main">
            <strong>장덕점</strong> 광주광역시 광산구 풍영로 189, 2층
          </span>
          <span className="footer-right-tel">
            <span aria-hidden="true">|</span> <strong>Tel</strong> 062-000-0001
          </span>
        </p>

        <p className="site-footer-info-line footer-left footer-no-wrap">
          <strong>상담예약·제휴문의</strong> hello@iclpilates.kr <span aria-hidden="true">|</span>{" "}
          카카오채널 @icl_pilates
        </p>
        <p className="site-footer-info-line footer-right">
          <span className="footer-right-main">
            <strong>효천점</strong> 광주광역시 남구 효천2로가길 5, 201·202호
          </span>
          <span className="footer-right-tel">
            <span aria-hidden="true">|</span> <strong>Tel</strong> 062-000-0002
          </span>
        </p>
      </div>

      <div className="site-footer-socials">
        <span className="site-footer-copy-inline">Copyright ICL Pilates</span>
        <a
          href="https://www.instagram.com/icl.pilates/"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="인스타그램"
          title="인스타그램"
          className="site-footer-social"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="3.5" width="17" height="17" rx="5" ry="5" />
            <circle cx="12" cy="12" r="4.1" />
            <circle cx="17.6" cy="6.4" r="1.1" />
          </svg>
        </a>
        <a
          href="https://blog.naver.com/icl_pilates"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="네이버 블로그"
          title="네이버 블로그"
          className="site-footer-social"
        >
          <span>B</span>
        </a>
      </div>
    </footer>
  );
}

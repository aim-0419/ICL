// 사이트 공통 푸터:
// 브랜드/연락처/지점 정보와 외부 SNS 링크를 제공합니다.
import { Link } from "react-router-dom";

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

      <div className="site-footer-info">
        <p>
          <strong>대표</strong> 정지윤 <span aria-hidden="true">|</span> <strong>Business License</strong>{" "}
          123-45-67890
        </p>
        <p>
          <strong>상담예약·제휴문의</strong> hello@iclpilates.kr <span aria-hidden="true">|</span>{" "}
          카카오채널 @icl_pilates
        </p>
        <p>
          <strong>장덕점</strong> 광주광역시 광산구 풍영로 189, 2층 <span aria-hidden="true">|</span>{" "}
          <strong>Tel</strong> 062-000-0001
        </p>
        <p>
          <strong>효천점</strong> 광주광역시 남구 효천2로가길 5, 201·202호 <span aria-hidden="true">|</span>{" "}
          <strong>Tel</strong> 062-000-0002
        </p>
      </div>

      <div className="site-footer-socials">
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

      <p className="site-footer-copy">Copyright © ICL Pilates</p>
    </footer>
  );
}

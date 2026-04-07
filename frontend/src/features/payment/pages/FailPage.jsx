import { Link, useSearchParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";

export function FailPage() {
  const [params] = useSearchParams();

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="section-block">
        <section className="contact-panel">
          <div>
            <p className="section-kicker">Payment Failed</p>
            <h2>결제가 완료되지 않았습니다</h2>
            <p className="section-text">다시 시도하시거나 다른 결제 수단으로 진행해주세요.</p>
            <Link className="pill-button" to="/cart">
              장바구니로 돌아가기
            </Link>
          </div>
          <div className="contact-list">
            <div>
              <strong>에러코드</strong>
              <p>{params.get("code") || "미확인"}</p>
            </div>
            <div>
              <strong>사유</strong>
              <p>{params.get("message") || "사용자 취소 또는 결제 실패"}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

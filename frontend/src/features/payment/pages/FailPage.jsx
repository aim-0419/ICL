import { Link, useSearchParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";

export function FailPage() {
  const [params] = useSearchParams();
  const reason = params.get("message") || "사용자가 결제를 취소했거나 결제 승인에 실패했습니다.";

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="content-page payment-result-page">
        <section className="payment-result-card payment-result-fail">
          <div className="payment-result-copy">
            <p className="section-kicker">결제 실패</p>
            <h2 className="payment-result-title-sm">결제가 완료되지 않았습니다.</h2>
            <p className="section-text">
              다시 시도하거나 다른 결제 수단으로 진행해 주세요.
            </p>
          </div>
          <div className="payment-result-meta">
            <div className="payment-result-row">
              <strong>사유</strong>
              <p>{reason}</p>
            </div>
            <div className="payment-result-meta-action">
              <Link className="pill-button full" to="/cart">
                장바구니로 돌아가기
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

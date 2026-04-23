// 결제 성공 페이지:
// 쿼리스트링(orderId/orderName/amount)으로 전달된 결제 결과를 표시합니다.
import { Link, useSearchParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";

export function SuccessPage() {
  const [params] = useSearchParams();
  const amountValue = Number(params.get("amount"));
  const amountLabel = Number.isFinite(amountValue)
    ? `${amountValue.toLocaleString("ko-KR")}원`
    : "확인 예정";

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="content-page payment-result-page">
        <section className="payment-result-card">
          <div className="payment-result-copy">
            <p className="section-kicker">결제 완료</p>
            <h2 className="payment-result-success-title">결제 요청이 정상적으로 접수되었습니다</h2>
            <p className="section-text">주문 정보를 확인한 뒤 영상 수강 안내를 전달드립니다.</p>
            <Link className="pill-button" to="/mypage">
              바로 수강하러 가기
            </Link>
          </div>
          <div className="payment-result-meta">
            <div className="payment-result-row">
              <strong>주문번호</strong>
              <p>{params.get("orderId") || "생성 중"}</p>
            </div>
            <div className="payment-result-row">
              <strong>상품명</strong>
              <p>{params.get("orderName") || "교육 영상 상품"}</p>
            </div>
            <div className="payment-result-row">
              <strong>결제금액</strong>
              <p>{amountLabel}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

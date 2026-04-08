// 결제 성공 페이지:
// 쿼리스트링(orderId/orderName/amount)으로 전달된 결제 결과를 표시합니다.
import { Link, useSearchParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";

export function SuccessPage() {
  const [params] = useSearchParams();

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="section-block">
        <section className="contact-panel">
          <div>
            <p className="section-kicker">Payment Complete</p>
            <h2>결제 요청이 정상적으로 접수되었습니다</h2>
            <p className="section-text">주문 정보를 확인한 뒤 영상 수강 안내를 전달드립니다.</p>
            <Link className="pill-button" to="/">
              메인으로 돌아가기
            </Link>
          </div>
          <div className="contact-list">
            <div>
              <strong>주문번호</strong>
              <p>{params.get("orderId") || "생성됨"}</p>
            </div>
            <div>
              <strong>상품명</strong>
              <p>{params.get("orderName") || "교육 영상 상품"}</p>
            </div>
            <div>
              <strong>결제금액</strong>
              <p>
                {params.get("amount")
                  ? `${Number(params.get("amount")).toLocaleString("ko-KR")}원`
                  : "확인 예정"}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

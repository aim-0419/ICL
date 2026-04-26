// 파일 역할: 결제 실패 사유를 정리해 사용자에게 안내하는 페이지 컴포넌트입니다.
import { Link, useSearchParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";

// 함수 역할: 실패 사유 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeFailReason(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) return "";

  if (text.includes("%")) {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  }

  return text;
}

// 컴포넌트 역할: 결제 실패 사유를 정리해 사용자에게 안내하는 페이지 컴포넌트입니다.
export function FailPage() {
  const [params] = useSearchParams();
  const reason =
    normalizeFailReason(params.get("message")) ||
    "사용자가 결제를 취소했거나 결제 승인 확인에 실패했습니다.";
  const code = String(params.get("code") || "").trim();

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="content-page payment-result-page">
        <section className="payment-result-card payment-result-fail">
          <div className="payment-result-copy">
            <p className="section-kicker">결제 실패</p>
            <h2 className="payment-result-title-sm">결제가 완료되지 않았습니다.</h2>
            <p className="section-text">잠시 후 다시 시도하시거나 다른 결제 수단으로 진행해 주세요.</p>
          </div>
          <div className="payment-result-meta">
            <div className="payment-result-row">
              <strong>실패 사유</strong>
              <p>{reason}</p>
            </div>
            {code ? (
              <div className="payment-result-row">
                <strong>오류 코드</strong>
                <p>{code}</p>
              </div>
            ) : null}
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

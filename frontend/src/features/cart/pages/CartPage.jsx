import { useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

export function CartPage() {
  const navigate = useNavigate();
  const store = useAppStore();

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="dashboard-page">
        <section className="dashboard-hero">
          <p className="section-kicker">Cart</p>
          <h1>장바구니</h1>
          <p className="section-text">{store.cartDetailed.length}개 상품</p>
        </section>

        <section className="cart-layout">
          <div>
            {store.cartDetailed.length === 0 ? (
              <div className="dashboard-card empty-state">
                <h3>장바구니가 비어 있습니다</h3>
                <p>메인 페이지에서 원하는 교육 영상을 담아보세요.</p>
                <button className="pill-button" type="button" onClick={() => navigate("/#academy")}>
                  상품 보러가기
                </button>
              </div>
            ) : (
              <div className="cart-items">
                {store.cartDetailed.map((item) => (
                  <article key={item.productId} className="cart-item-card">
                    <div>
                      <p className="mini-kicker">Academy Video</p>
                      <h3>{item.product.name}</h3>
                      <p>{item.product.description}</p>
                    </div>
                    <div className="cart-item-meta">
                      <label>
                        수량
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) =>
                            store.updateCartItem(item.productId, Number(event.target.value))
                          }
                        />
                      </label>
                      <strong>{store.formatCurrency(item.lineTotal)}</strong>
                      <button
                        className="ghost-button small-ghost"
                        type="button"
                        onClick={() => store.removeCartItem(item.productId)}
                      >
                        삭제
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside className="cart-summary">
            <div className="dashboard-card">
              <p className="mini-kicker">Order Summary</p>
              <h3>결제 예정 금액</h3>
              <strong>{store.formatCurrency(store.cartTotal)}</strong>
              <p className="section-text">
                장바구니 상품은 메인 결제 영역에서 데모 결제를 진행할 수 있습니다.
              </p>
              <button
                className="pill-button full"
                type="button"
                disabled={store.cartDetailed.length === 0}
                onClick={() => navigate("/#checkout")}
              >
                결제 페이지로 이동
              </button>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

import { useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

export function MyPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const userOrders = store.orders.filter((order) => order.customerEmail === store.currentUser?.email);

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="dashboard-page">
        <section className="dashboard-hero">
          <p className="section-kicker">My Page</p>
          <h1>{store.currentUser?.name} 님의 마이페이지</h1>
          <p className="section-text">
            {store.currentUser?.email} · {store.currentUser?.phone || "연락처 미등록"}
          </p>
        </section>

        <section className="dashboard-grid">
          <div>
            <div className="dashboard-section-header">
              <h2>수강 중인 교육</h2>
            </div>
            <div className="dashboard-card-grid">
              {userOrders.length ? (
                userOrders.map((order) => (
                  <article key={order.orderId} className="dashboard-card">
                    <p className="mini-kicker">Enrolled Course</p>
                    <h3>{order.orderName}</h3>
                    <p>결제금액 {store.formatCurrency(order.amount)}</p>
                  </article>
                ))
              ) : (
                <article className="dashboard-card empty-state">
                  <h3>아직 구매한 교육 영상이 없습니다</h3>
                  <p>메인 페이지에서 상품을 선택하고 수강을 시작해보세요.</p>
                </article>
              )}
            </div>
          </div>

          <aside>
            <div className="dashboard-section-header">
              <h2>최근 주문 내역</h2>
            </div>
            <div className="dashboard-card order-list">
              {userOrders.length ? (
                userOrders.map((order) => (
                  <article key={order.orderId} className="order-row">
                    <div>
                      <strong>{order.orderName}</strong>
                      <p>{new Date(order.createdAt).toLocaleDateString("ko-KR")}</p>
                    </div>
                    <strong>{store.formatCurrency(order.amount)}</strong>
                  </article>
                ))
              ) : (
                <p className="empty-copy">주문 내역이 없습니다.</p>
              )}
              <button
                className="pill-button white full"
                type="button"
                onClick={() => {
                  store.logoutUser();
                  navigate("/");
                }}
              >
                로그아웃
              </button>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

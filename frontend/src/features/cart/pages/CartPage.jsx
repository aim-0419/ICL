import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ACADEMY_VIDEOS } from "../../academy/data/academyVideos.js";
import { requestExternalPayment } from "../../payment/lib/requestExternalPayment.js";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

const DEMO_POINT_BALANCE = 60000;

const PAYMENT_METHODS = [
  {
    id: "naverpay",
    label: "네이버페이",
    description: "최대 1.2% 적립",
    badge: "적립",
  },
  {
    id: "tosspay",
    label: "토스페이",
    description: "최대 4% 적립",
    badge: "추천",
  },
  {
    id: "card",
    label: "카드 / 간편결제",
    description: "신용카드, 체크카드, 간편결제",
    badge: "",
  },
  {
    id: "transfer",
    label: "무통장입금",
    description: "가상계좌 발급 후 입금",
    badge: "",
  },
];

function getPreviewByProductId(productId) {
  const video = ACADEMY_VIDEOS.find((item) => item.productId === productId);
  if (!video) {
    return {
      image: "",
      instructor: "ICL Pilates",
      category: "교육 영상",
    };
  }

  return {
    image: video.image,
    instructor: video.instructor,
    category: video.category,
  };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CartPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("tosspay");
  const [pointInput, setPointInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const cartItems = useMemo(
    () =>
      store.cartDetailed.map((item) => ({
        ...item,
        preview: getPreviewByProductId(item.productId),
      })),
    [store.cartDetailed]
  );

  const cartProductIds = useMemo(() => cartItems.map((item) => item.productId), [cartItems]);

  useEffect(() => {
    setSelectedProductIds((current) => {
      const currentSet = new Set(current);
      const nextSelected = cartProductIds.filter((id) => currentSet.has(id));
      if (nextSelected.length > 0) return nextSelected;
      return cartProductIds;
    });
  }, [cartProductIds]);

  const selectedItems = useMemo(() => {
    const selectedSet = new Set(selectedProductIds);
    return cartItems.filter((item) => selectedSet.has(item.productId));
  }, [cartItems, selectedProductIds]);

  const selectedSubtotal = selectedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const maxPointUsage = Math.min(DEMO_POINT_BALANCE, selectedSubtotal);
  const parsedPoint = toNumber(String(pointInput).replace(/[^0-9]/g, ""));
  const appliedPoint = Math.min(parsedPoint, maxPointUsage);
  const finalAmount = Math.max(0, selectedSubtotal - appliedPoint);
  const allSelected = cartProductIds.length > 0 && selectedProductIds.length === cartProductIds.length;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedProductIds([]);
      return;
    }
    setSelectedProductIds(cartProductIds);
  }

  function toggleSelectItem(productId) {
    setSelectedProductIds((current) => {
      if (current.includes(productId)) {
        return current.filter((id) => id !== productId);
      }
      return [...current, productId];
    });
  }

  function updateQuantity(productId, quantity) {
    const safeQuantity = Math.max(1, toNumber(quantity));
    store.updateCartItem(productId, safeQuantity);
  }

  function removeSelectedItems() {
    if (selectedProductIds.length === 0) {
      alert("삭제할 상품을 먼저 선택해주세요.");
      return;
    }
    selectedProductIds.forEach((productId) => store.removeCartItem(productId));
    setSelectedProductIds([]);
  }

  async function handleCheckout() {
    if (selectedItems.length === 0) {
      alert("결제할 상품을 먼저 선택해주세요.");
      return;
    }

    if (!store.currentUser) {
      alert("결제는 로그인 후 이용 가능합니다.");
      navigate("/login");
      return;
    }

    const primaryProduct = selectedItems[0].product.name;
    const orderName =
      selectedItems.length > 1 ? `${primaryProduct} 외 ${selectedItems.length - 1}건` : primaryProduct;

    const orderPayload = {
      orderId: store.buildOrderId(),
      orderName,
      amount: finalAmount,
      customerName: store.currentUser?.name || "회원",
      customerEmail: store.currentUser?.email || "",
      customerPhone: store.currentUser?.phone || "",
      selectedProductIds,
      paymentMethod: selectedPaymentMethod,
      discountPoint: appliedPoint,
      createdAt: new Date().toISOString(),
    };

    setIsProcessing(true);
    store.persistOrder(orderPayload);

    try {
      const result = await requestExternalPayment({
        orderPayload,
        paymentMethod: selectedPaymentMethod,
      });

      if (result.type === "external_redirect") {
        return;
      }

      if (result.type === "fail") {
        navigate(
          `/fail?code=${encodeURIComponent(result.code || "PAYMENT_FAIL")}&message=${encodeURIComponent(
            result.message || "결제가 정상적으로 처리되지 않았습니다."
          )}`
        );
        return;
      }

      if (result.type === "success" || result.type === "mock_success") {
        if (result.type === "mock_success") {
          alert(
            "현재는 데모 결제 상태입니다. 외부 결제 API 또는 토스페이먼츠 운영 키를 연결하면 실결제가 열립니다."
          );
        }

        navigate(
          `/success?orderId=${encodeURIComponent(orderPayload.orderId)}&orderName=${encodeURIComponent(
            orderPayload.orderName
          )}&amount=${orderPayload.amount}`
        );
      }
    } catch (error) {
      navigate(
        `/fail?code=${encodeURIComponent("PAYMENT_EXCEPTION")}&message=${encodeURIComponent(
          error?.message || "결제 요청 중 오류가 발생했습니다."
        )}`
      );
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="dashboard-page cart-checkout-page">
        <section className="dashboard-hero cart-hero">
          <p className="section-kicker">Cart Checkout</p>
          <h1>장바구니</h1>
          <p className="section-text">상품 선택부터 결제수단 선택까지 한 번에 진행할 수 있습니다.</p>
        </section>

        {cartItems.length === 0 ? (
          <section className="checkout-empty checkout-surface">
            <h3>장바구니가 비어 있습니다</h3>
            <p>교육 영상 페이지에서 원하는 상품을 담아보세요.</p>
            <button className="pill-button" type="button" onClick={() => navigate("/academy")}>
              상품 보러가기
            </button>
          </section>
        ) : (
          <section className="checkout-cart-layout">
            <div className="checkout-cart-left">
              <section className="checkout-surface checkout-cart-box">
                <header className="checkout-select-row">
                  <label>
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                    <span>
                      전체선택 {selectedProductIds.length} / {cartItems.length}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="checkout-text-button"
                    onClick={removeSelectedItems}
                  >
                    선택삭제
                  </button>
                </header>

                <div className="checkout-cart-list">
                  {cartItems.map((item) => {
                    const selected = selectedProductIds.includes(item.productId);
                    return (
                      <article
                        key={item.productId}
                        className={`checkout-cart-item${selected ? " selected" : ""}`}
                      >
                        <label className="checkout-item-check">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelectItem(item.productId)}
                          />
                        </label>
                        <div className="checkout-item-thumb">
                          {item.preview.image ? (
                            <img src={item.preview.image} alt={item.product.name} />
                          ) : (
                            <span>NO IMAGE</span>
                          )}
                        </div>
                        <div className="checkout-item-copy">
                          <h3>{item.product.name}</h3>
                          <p>{item.product.description}</p>
                          <div className="checkout-item-meta-line">
                            <span>{item.preview.instructor}</span>
                            <span>{item.preview.category}</span>
                            <span>{item.product.period} 수강</span>
                          </div>
                        </div>
                        <div className="checkout-item-controls">
                          <label>
                            수량
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(event) => updateQuantity(item.productId, event.target.value)}
                            />
                          </label>
                          <strong>{store.formatCurrency(item.lineTotal)}</strong>
                        </div>
                        <button
                          type="button"
                          className="checkout-item-remove"
                          onClick={() => store.removeCartItem(item.productId)}
                          aria-label={`${item.product.name} 삭제`}
                        >
                          ×
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="checkout-surface checkout-buyer-box">
                <div>
                  <strong>구매자 정보</strong>
                  <p>
                    {store.currentUser
                      ? `${store.currentUser.name} · ${store.currentUser.email}`
                      : "로그인 후 결제를 진행하면 구매자 정보가 자동 입력됩니다."}
                  </p>
                </div>
                {!store.currentUser ? (
                  <button
                    type="button"
                    className="checkout-text-button"
                    onClick={() => navigate("/login")}
                  >
                    로그인
                  </button>
                ) : (
                  <button type="button" className="checkout-text-button" onClick={() => navigate("/mypage")}>
                    정보 확인
                  </button>
                )}
              </section>
            </div>

            <aside className="checkout-cart-right">
              <section className="checkout-surface checkout-summary-box">
                <h2>할인</h2>
                <div className="checkout-summary-row">
                  <span>쿠폰</span>
                  <strong>사용가능 0</strong>
                </div>
                <div className="checkout-point-row">
                  <span>포인트</span>
                  <div>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={pointInput}
                      onChange={(event) => setPointInput(event.target.value)}
                    />
                    <button type="button" onClick={() => setPointInput(String(maxPointUsage))}>
                      전액사용
                    </button>
                  </div>
                </div>
                <p className="checkout-point-note">
                  보유 {store.formatCurrency(DEMO_POINT_BALANCE)} / 최대 사용{" "}
                  {store.formatCurrency(maxPointUsage)}
                </p>
              </section>

              <section className="checkout-surface checkout-method-box">
                <h2>결제수단</h2>
                <div className="checkout-method-list">
                  {PAYMENT_METHODS.map((method) => (
                    <label key={method.id} className="checkout-method-item">
                      <input
                        type="radio"
                        name="payment-method"
                        checked={selectedPaymentMethod === method.id}
                        onChange={() => setSelectedPaymentMethod(method.id)}
                      />
                      <span className="checkout-method-copy">
                        <strong>{method.label}</strong>
                        <small>{method.description}</small>
                      </span>
                      {method.badge ? (
                        <em className={`checkout-method-badge ${method.badge === "추천" ? "recommend" : ""}`}>
                          {method.badge}
                        </em>
                      ) : null}
                    </label>
                  ))}
                </div>
              </section>

              <section className="checkout-surface checkout-total-box">
                <div className="checkout-total-row">
                  <span>선택 상품금액</span>
                  <strong>{store.formatCurrency(selectedSubtotal)}</strong>
                </div>
                <div className="checkout-total-row">
                  <span>포인트 할인</span>
                  <strong className="minus">- {store.formatCurrency(appliedPoint)}</strong>
                </div>
                <div className="checkout-total-row final">
                  <span>최종 결제금액</span>
                  <strong>{store.formatCurrency(finalAmount)}</strong>
                </div>
              </section>

              <button
                type="button"
                className="checkout-pay-button"
                disabled={selectedItems.length === 0 || isProcessing}
                onClick={handleCheckout}
              >
                {isProcessing
                  ? "결제 요청 중..."
                  : `${store.formatCurrency(finalAmount)} 결제하기`}
              </button>
              <p className="checkout-disclaimer">
                결제 버튼 클릭 시 주문내역 확인 및 결제대행 서비스 이용에 동의한 것으로 처리됩니다.
              </p>
            </aside>
          </section>
        )}
      </main>
    </div>
  );
}

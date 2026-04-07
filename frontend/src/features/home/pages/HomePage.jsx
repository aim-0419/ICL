import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

const PAYMENT_CONFIG = {
  clientKey: "test_ck_your_client_key",
  successUrl: `${window.location.origin}/success`,
  failUrl: `${window.location.origin}/fail`,
  ...window.PILATES_PAYMENT_CONFIG,
};

export function HomePage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [selectedProductId, setSelectedProductId] = useState("starter");
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerMemo: "",
  });

  useEffect(() => {
    if (window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  function scrollToSelector(selector) {
    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleFormChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function handleMockCheckout(orderPayload) {
    store.persistOrder({ ...orderPayload, status: "pending_mock_payment" });

    navigate(
      `/success?orderId=${encodeURIComponent(orderPayload.orderId)}&orderName=${encodeURIComponent(
        orderPayload.orderName
      )}&amount=${orderPayload.amount}&customerName=${encodeURIComponent(
        orderPayload.customerName
      )}&customerEmail=${encodeURIComponent(orderPayload.customerEmail)}`
    );
  }

  function handleCheckout(event) {
    event.preventDefault();

    const product = store.products[selectedProductId];
    const orderPayload = {
      orderId: store.buildOrderId(),
      orderName: product.name,
      amount: product.price,
      customerName: form.customerName.trim(),
      customerEmail: form.customerEmail.trim(),
      customerPhone: form.customerPhone.trim(),
      customerMemo: form.customerMemo.trim(),
      selectedProductId,
      createdAt: new Date().toISOString(),
    };

    store.persistOrder(orderPayload);

    if (
      typeof window.TossPayments !== "function" ||
      PAYMENT_CONFIG.clientKey === "test_ck_your_client_key"
    ) {
      alert(
        "현재는 데모 결제 상태입니다. 운영용 토스페이먼츠 clientKey를 입력하면 실제 결제창으로 연결됩니다."
      );
      handleMockCheckout(orderPayload);
      return;
    }

    const tossPayments = window.TossPayments(PAYMENT_CONFIG.clientKey);
    tossPayments.requestPayment("카드", {
      amount: orderPayload.amount,
      orderId: orderPayload.orderId,
      orderName: orderPayload.orderName,
      customerName: orderPayload.customerName,
      customerEmail: orderPayload.customerEmail,
      customerMobilePhone: orderPayload.customerPhone,
      successUrl: PAYMENT_CONFIG.successUrl,
      failUrl: PAYMENT_CONFIG.failUrl,
    });
  }

  const selectedProduct = store.products[selectedProductId];

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-panel" id="hero">
          <div className="hero-center">
            <div className="hero-star">✳</div>
            <h1>ICL Pilates is different.</h1>
            <p className="hero-text">
              이끌림 필라테스는 고급스러운 공간 경험과 실전 중심 교육 콘텐츠를 함께 제안합니다.
              스튜디오 홍보부터 수강생용 가이드 영상 판매까지 한 흐름으로 이어집니다.
            </p>
            <button
              className="pill-button white"
              type="button"
              onClick={() => scrollToSelector("#contact")}
            >
              상담 문의하기
            </button>
          </div>
          <div className="hero-image">
            <img
              src="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1600&q=80"
              alt="필라테스 수업 장면"
            />
          </div>
        </section>

        <section className="intro-panel bright-panel section-block" id="story">
          <div className="section-intro center">
            <div className="section-star">✳</div>
            <p className="section-kicker">Brand</p>
            <h2>특별한 시작</h2>
            <p className="section-text narrow">
              회원에게는 프리미엄 필라테스 경험을, 강사와 예비 창업자에게는 실전형 교육 콘텐츠를
              제공합니다. 오프라인과 온라인 수익 구조를 동시에 설계할 수 있는 브랜드형 홈페이지입니다.
            </p>
          </div>
          <div className="mosaic-grid">
            <div className="mosaic-card tall">
              <img src="/assets/images/gallery/brand-1.jpg" alt="매트 필라테스 동작" />
            </div>
            <div className="mosaic-card short offset-down">
              <img src="/assets/images/gallery/brand-2.jpg" alt="발끝 정렬을 보여주는 필라테스" />
            </div>
            <div className="mosaic-card tall">
              <img src="/assets/images/gallery/brand-3.jpg" alt="필라테스 자세를 보여주는 상체" />
            </div>
            <div className="mosaic-card wide offset-up">
              <img src="/assets/images/gallery/brand-4.jpg" alt="옆구리 스트레칭 필라테스" />
            </div>
          </div>
        </section>

        <section className="feature-panel dark-panel section-block" id="features">
          <div className="feature-layout">
            <div className="feature-image">
              <img
                src="https://images.unsplash.com/photo-1506629905607-c36a594d95f3?auto=format&fit=crop&w=1200&q=80"
                alt="스튜디오에서 필라테스 하는 모습"
              />
            </div>
            <div className="feature-copy">
              <h2 className="feature-title">이끌림을 선택하는 3가지 이유</h2>
              <button
                className="ghost-button"
                type="button"
                onClick={() => scrollToSelector("#academy")}
              >
                교육 상품 보러가기
              </button>

              <article className="reason-item">
                <span>special feature 01.</span>
                <h3>프리미엄 무드의 브랜딩</h3>
                <p>
                  차분한 아이보리와 골드 포인트를 바탕으로 고급스러운 첫인상을 전달합니다.
                  상담 문의 전환에 유리한 구조를 고려했습니다.
                </p>
              </article>

              <article className="reason-item">
                <span>special feature 02.</span>
                <h3>오프라인과 온라인의 결합</h3>
                <p>
                  스튜디오 소개뿐 아니라 교육 가이드 영상 판매까지 같은 브랜드 경험 안에서
                  이어지도록 설계했습니다.
                </p>
              </article>

              <article className="reason-item">
                <span>special feature 03.</span>
                <h3>실결제로 확장 가능한 구조</h3>
                <p>
                  토스페이먼츠 연동을 고려한 체크아웃 흐름이 들어 있어 실제 판매 사이트로
                  확장하기 좋습니다.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="status-panel section-block">
          <div className="section-intro center on-dark">
            <div className="section-star">✳</div>
            <p className="section-kicker">Brand Status</p>
            <h2>브랜드 운영 현황</h2>
          </div>
          <div className="status-grid">
            <article className="status-card">
              <div className="status-icon">↗</div>
              <p>상담 전환 중심 구조</p>
              <strong>프리미엄 랜딩 구성</strong>
            </article>
            <article className="status-card">
              <div className="status-icon">⌘</div>
              <p>교육 상품 판매</p>
              <strong>영상 3종 즉시 선택</strong>
            </article>
            <article className="status-card">
              <div className="status-icon">◎</div>
              <p>실결제 확장 가능</p>
              <strong>토스페이먼츠 연동</strong>
            </article>
          </div>
        </section>

        <section className="academy-panel bright-panel section-block" id="academy">
          <div className="section-intro center">
            <div className="section-star">✳</div>
            <p className="section-kicker">Academy Shop</p>
            <h2>교육 가이드 영상 판매</h2>
            <p className="section-text narrow">
              입문 강사부터 스튜디오 운영자까지 선택할 수 있도록 난이도와 목적이 다른 3가지
              교육 상품을 준비했습니다.
            </p>
          </div>

          <div className="academy-layout">
            <div className="product-list">
              {Object.values(store.products).map((product) => (
                <article
                  key={product.id}
                  className={`product-card${selectedProductId === product.id ? " selected" : ""}`}
                  onClick={() => setSelectedProductId(product.id)}
                >
                  <div className="product-badge">
                    {product.id === "starter"
                      ? "Best for New Instructors"
                      : product.id === "cueing"
                        ? "Most Popular"
                        : "Studio Owner Pack"}
                  </div>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <ul>
                    <li>
                      {product.id === "starter"
                        ? "총 12개 영상"
                        : product.id === "cueing"
                          ? "총 20개 영상"
                          : "총 32개 영상"}
                    </li>
                    <li>{product.id === "premium" ? "운영 템플릿 제공" : "다운로드 PDF 포함"}</li>
                    <li>수강 기간 {product.period}</li>
                  </ul>
                  <div className="product-footer">
                    <strong>{store.formatCurrency(product.price)}</strong>
                    <div className="product-actions">
                      <button
                        className="ghost-button small-ghost product-cart"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          store.addToCart(product.id, 1);
                          alert("장바구니에 담았습니다.");
                        }}
                      >
                        장바구니
                      </button>
                      <button className="pill-button small product-select" type="button">
                        선택하기
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <aside className="checkout-card" id="checkout">
              <p className="section-kicker left">Checkout</p>
              <h3>교육 영상 결제</h3>
              <div className="summary-box">
                <span>선택 상품</span>
                <strong>{selectedProduct.name}</strong>
              </div>
              <div className="summary-box">
                <span>결제 금액</span>
                <strong>{store.formatCurrency(selectedProduct.price)}</strong>
              </div>
              <form className="checkout-form" onSubmit={handleCheckout}>
                <label>
                  구매자명
                  <input
                    name="customerName"
                    type="text"
                    placeholder="홍길동"
                    required
                    value={form.customerName}
                    onChange={handleFormChange}
                  />
                </label>
                <label>
                  이메일
                  <input
                    name="customerEmail"
                    type="email"
                    placeholder="hello@example.com"
                    required
                    value={form.customerEmail}
                    onChange={handleFormChange}
                  />
                </label>
                <label>
                  연락처
                  <input
                    name="customerPhone"
                    type="tel"
                    placeholder="010-1234-5678"
                    required
                    value={form.customerPhone}
                    onChange={handleFormChange}
                  />
                </label>
                <label>
                  요청 사항
                  <textarea
                    name="customerMemo"
                    rows="3"
                    placeholder="세금계산서 또는 별도 문의가 있으면 적어주세요."
                    value={form.customerMemo}
                    onChange={handleFormChange}
                  />
                </label>
                <button type="submit" className="pill-button full">
                  토스페이먼츠로 결제하기
                </button>
              </form>
              <p className="payment-note">
                테스트용 기본 설정이 포함되어 있습니다. 실제 결제를 위해서는 clientKey,
                successUrl, failUrl을 운영 정보로 교체해야 합니다.
              </p>
            </aside>
          </div>
        </section>

        <section className="reviews-panel bright-panel section-block" id="reviews">
          <div className="section-intro center">
            <div className="section-star">✳</div>
            <p className="section-kicker">Reviews</p>
            <h2>함께하고 있는 회원 후기</h2>
            <p className="section-text narrow">
              공간의 무드와 수업의 전문성, 그리고 교육 콘텐츠의 실용성까지 자연스럽게
              연결되는 브랜드 경험을 전달합니다.
            </p>
          </div>

          <div className="review-gallery">
            <article className="review-card image-first">
              <img
                src="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80"
                alt="후기 이미지 1"
              />
              <div className="review-copy">
                <p>“상담 전부터 브랜드 무드가 명확해서 신뢰감이 높았어요.”</p>
                <strong>개인 레슨 회원</strong>
              </div>
            </article>
            <article className="review-card image-first">
              <img
                src="https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=900&q=80"
                alt="후기 이미지 2"
              />
              <div className="review-copy">
                <p>“교육 영상이 현장 티칭에 바로 연결돼서 복습 자료로도 좋았습니다.”</p>
                <strong>예비 필라테스 강사</strong>
              </div>
            </article>
            <article className="review-card image-first">
              <img
                src="https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=900&q=80"
                alt="후기 이미지 3"
              />
              <div className="review-copy">
                <p>“오프라인 홍보와 온라인 판매가 자연스럽게 이어져 운영에 도움이 됐어요.”</p>
                <strong>스튜디오 운영자</strong>
              </div>
            </article>
          </div>
        </section>

        <section className="process-panel bright-panel section-block">
          <div className="section-intro center">
            <div className="section-star">✳</div>
            <p className="section-kicker">Process</p>
            <h2>상담부터 결제까지 간결한 흐름</h2>
          </div>
          <div className="process-grid">
            <article className="process-card">
              <span>step 01.</span>
              <h3>상담 문의</h3>
              <p>홈페이지에서 브랜드와 상품을 확인한 뒤 상담이나 구매 목적에 맞게 문의합니다.</p>
            </article>
            <article className="process-card">
              <span>step 02.</span>
              <h3>상품 선택</h3>
              <p>입문형, 심화형, 운영 번들 중 필요한 교육 상품을 선택합니다.</p>
            </article>
            <article className="process-card">
              <span>step 03.</span>
              <h3>결제 진행</h3>
              <p>체크아웃 폼 작성 후 토스페이먼츠 결제 흐름으로 연결됩니다.</p>
            </article>
            <article className="process-card">
              <span>step 04.</span>
              <h3>수강 안내 발송</h3>
              <p>결제 완료 후 이메일 또는 메시지로 영상 시청 안내를 전달합니다.</p>
            </article>
          </div>
        </section>

        <section className="contact-panel-wrapper dark-panel section-block" id="contact">
          <div className="section-intro center on-dark">
            <div className="section-star">✳</div>
            <p className="section-kicker">Contact</p>
            <h2>상담 예약과 제휴 문의</h2>
          </div>
          <div className="contact-panel">
            <div className="contact-brand">
              <div className="contact-logo">ICL Pilates</div>
              <div className="contact-box">
                <strong>브랜드 상담 안내</strong>
                <p>
                  참여 완료 시 입력하신 번호로 연락드립니다. 스튜디오 이용 문의와 교육 영상
                  제휴 문의 모두 가능합니다.
                </p>
              </div>
            </div>
            <div className="contact-form-like">
              <div className="contact-row">
                <span>상담 채널</span>
                <strong>전화 / 이메일 / 카카오채널</strong>
              </div>
              <div className="contact-row">
                <span>대표 연락처</span>
                <strong>02-1234-5678</strong>
              </div>
              <div className="contact-row">
                <span>이메일</span>
                <strong>hello@iclpilates.kr</strong>
              </div>
              <div className="contact-row">
                <span>운영 안내</span>
                <strong>평일 10:00 - 18:00</strong>
              </div>
              <button
                className="pill-button white full"
                type="button"
                onClick={() => scrollToSelector("#checkout")}
              >
                영상 결제하러 가기
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/**
 * [앱에서 구매 대신 보여 주는 안내 화면]
 *
 * 앱에서는 교육영상을 새로 구매할 수 없고 이미 산 영상만 볼 수 있습니다.
 * 그래서 장바구니나 결제 화면으로 들어오면 이 안내 화면을 대신 보여 줍니다.
 */
import React from "react";
import { BookOpenCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "./PageLayout.jsx";

export function NativePurchaseNotice() {
  const navigate = useNavigate();

  return (
    <PageLayout subpage mainClass="content-page native-purchase-page">
      <section className="native-purchase-notice" aria-labelledby="native-purchase-title">
        <BookOpenCheck size={34} strokeWidth={1.6} aria-hidden="true" />
        <h1 id="native-purchase-title">앱에서는 수강에 집중할 수 있어요</h1>
        <p>
          이미 구매한 교육 영상은 같은 계정으로 로그인한 뒤 바로 수강할 수 있습니다.
          신규 교육 영상 구매는 앱에서 지원하지 않습니다.
        </p>
        <div className="native-purchase-actions">
          <button className="pill-button" type="button" onClick={() => navigate("/mypage")}>내 수강 영상 보기</button>
          <button className="ghost-button" type="button" onClick={() => navigate("/academy")}>아카데미 둘러보기</button>
        </div>
      </section>
    </PageLayout>
  );
}

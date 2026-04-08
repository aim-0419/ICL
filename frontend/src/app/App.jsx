// 전역 라우팅 테이블:
// 페이지 URL과 화면 컴포넌트 매핑을 한 곳에서 관리합니다.
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "../shared/components/RequireAuth.jsx";
import { SiteFooter } from "../shared/components/SiteFooter.jsx";
import { HomePage } from "../features/home/pages/HomePage.jsx";
import { LoginPage } from "../features/auth/pages/LoginPage.jsx";
import { SignupPage } from "../features/auth/pages/SignupPage.jsx";
import { CartPage } from "../features/cart/pages/CartPage.jsx";
import { MyPage } from "../features/mypage/pages/MyPage.jsx";
import { AcademyPage } from "../features/academy/pages/AcademyPage.jsx";
import { AcademyDetailPage } from "../features/academy/pages/AcademyDetailPage.jsx";
import { SuccessPage } from "../features/payment/pages/SuccessPage.jsx";
import { FailPage } from "../features/payment/pages/FailPage.jsx";
import {
  BrandDirectionsPage,
  BrandEquipmentPage,
  BrandInstructorsPage,
  BrandIntroPage,
  BrandTourPage,
} from "../features/brand/pages/BrandPages.jsx";
import {
  CommunityEventDetailPage,
  CommunityEventsPage,
  CommunityInquiryDetailPage,
  CommunityInquiryPage,
  CommunityReviewDetailPage,
  CommunityReviewsPage,
} from "../features/community/pages/CommunityPages.jsx";

export default function App() {
  return (
    <>
      <Routes>
        {/* 메인/인증/쇼핑 플로우 */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/academy" element={<AcademyPage />} />
        <Route path="/academy/:videoId" element={<AcademyDetailPage />} />

        {/* 브랜드 소개 서브페이지 */}
        <Route path="/ikleulrim/intro" element={<BrandIntroPage />} />
        <Route path="/ikleulrim/instructors" element={<BrandInstructorsPage />} />
        <Route path="/ikleulrim/tour" element={<BrandTourPage />} />
        <Route path="/ikleulrim/equipment" element={<BrandEquipmentPage />} />
        <Route path="/ikleulrim/directions" element={<BrandDirectionsPage />} />

        {/* 커뮤니티(이벤트/후기/문의) */}
        <Route path="/community/events" element={<CommunityEventsPage />} />
        <Route path="/community/events/:eventId" element={<CommunityEventDetailPage />} />
        <Route path="/community/reviews" element={<CommunityReviewsPage />} />
        <Route path="/community/reviews/:reviewId" element={<CommunityReviewDetailPage />} />
        <Route path="/community/inquiry" element={<CommunityInquiryPage />} />
        <Route path="/community/inquiry/:inquiryId" element={<CommunityInquiryDetailPage />} />

        {/* 로그인 사용자 전용 페이지 */}
        <Route
          path="/mypage"
          element={
            <RequireAuth>
              <MyPage />
            </RequireAuth>
          }
        />

        {/* 결제 결과 페이지 */}
        <Route path="/success" element={<SuccessPage />} />
        <Route path="/fail" element={<FailPage />} />

        {/* 존재하지 않는 경로는 홈으로 리다이렉트 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* 모든 페이지 하단에 공통 푸터 노출 */}
      <SiteFooter />
    </>
  );
}

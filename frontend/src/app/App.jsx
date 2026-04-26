// 파일 역할: 프론트엔드 전체 라우팅 구조와 권한 보호 페이지 연결을 정의합니다.
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "../shared/components/RequireAuth.jsx";
import { RequireAdminStaff } from "../shared/components/RequireAdminStaff.jsx";
import { SiteHeader } from "../shared/components/SiteHeader.jsx";
import { SiteFooter } from "../shared/components/SiteFooter.jsx";
import { AdminImageEditor } from "../shared/components/AdminImageEditor.jsx";

const HomePage = lazy(() => import("../features/home/pages/HomePage.jsx").then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import("../features/auth/pages/LoginPage.jsx").then((m) => ({ default: m.LoginPage })));
const FindIdPage = lazy(() => import("../features/auth/pages/FindIdPage.jsx").then((m) => ({ default: m.FindIdPage })));
const ResetPasswordPage = lazy(() => import("../features/auth/pages/ResetPasswordPage.jsx").then((m) => ({ default: m.ResetPasswordPage })));
const SignupPage = lazy(() => import("../features/auth/pages/SignupPage.jsx").then((m) => ({ default: m.SignupPage })));
const CartPage = lazy(() => import("../features/cart/pages/CartPage.jsx").then((m) => ({ default: m.CartPage })));
const MyPage = lazy(() => import("../features/mypage/pages/MyPage.jsx").then((m) => ({ default: m.MyPage })));
const AdminDashboardPage = lazy(() => import("../features/admin/pages/AdminDashboardPage.jsx").then((m) => ({ default: m.AdminDashboardPage })));
const AdminSalesDashboardPage = lazy(() => import("../features/admin/pages/AdminSalesDashboardPage.jsx").then((m) => ({ default: m.AdminSalesDashboardPage })));
const AdminRefundPage = lazy(() => import("../features/admin/pages/AdminRefundPage.jsx").then((m) => ({ default: m.AdminRefundPage })));
const AdminVideoGiftPage = lazy(() => import("../features/admin/pages/AdminVideoGiftPage.jsx").then((m) => ({ default: m.AdminVideoGiftPage })));
const AcademyPage = lazy(() => import("../features/academy/pages/AcademyPage.jsx").then((m) => ({ default: m.AcademyPage })));
const AcademyDetailPage = lazy(() => import("../features/academy/pages/AcademyDetailPage.jsx").then((m) => ({ default: m.AcademyDetailPage })));
const AcademyPlayerPage = lazy(() => import("../features/academy/pages/AcademyPlayerPage.jsx").then((m) => ({ default: m.AcademyPlayerPage })));
const AcademyCertificatePage = lazy(() => import("../features/academy/pages/AcademyCertificatePage.jsx").then((m) => ({ default: m.AcademyCertificatePage })));
const SuccessPage = lazy(() => import("../features/payment/pages/SuccessPage.jsx").then((m) => ({ default: m.SuccessPage })));
const FailPage = lazy(() => import("../features/payment/pages/FailPage.jsx").then((m) => ({ default: m.FailPage })));

const BrandIntroPage = lazy(() => import("../features/brand/pages/BrandPages.jsx").then((m) => ({ default: m.BrandIntroPage })));
const BrandInstructorsPage = lazy(() => import("../features/brand/pages/BrandPages.jsx").then((m) => ({ default: m.BrandInstructorsPage })));
const BrandTourPage = lazy(() => import("../features/brand/pages/BrandPages.jsx").then((m) => ({ default: m.BrandTourPage })));
const BrandEquipmentPage = lazy(() => import("../features/brand/pages/BrandPages.jsx").then((m) => ({ default: m.BrandEquipmentPage })));
const BrandDirectionsPage = lazy(() => import("../features/brand/pages/BrandPages.jsx").then((m) => ({ default: m.BrandDirectionsPage })));

const CommunityEventsPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityEventsPage })));
const CommunityEventDetailPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityEventDetailPage })));
const CommunityReviewsPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityReviewsPage })));
const CommunityReviewDetailPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityReviewDetailPage })));
const CommunityInquiryPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityInquiryPage })));
const CommunityInquiryDetailPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityInquiryDetailPage })));

// 컴포넌트 역할: 지연 로딩 중에 사용자에게 보여줄 공통 로딩 화면을 렌더링합니다.
function AppRouteFallback() {
  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="content-page">
        <section className="community-board-empty">
          <p>페이지를 불러오는 중입니다...</p>
        </section>
      </main>
    </div>
  );
}

// 컴포넌트 역할: 프론트엔드 전체 페이지 라우팅과 관리자 편집 도구 표시 조건을 구성합니다.
export default function App() {
  return (
    <>
      <Suspense fallback={<AppRouteFallback />}>
        <Routes>
          {/* 메인/인증/쇼핑 플로우 */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/find-id" element={<FindIdPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/academy" element={<AcademyPage />} />
          <Route path="/academy/:videoId" element={<AcademyDetailPage />} />
          <Route
            path="/academy/player/:videoId"
            element={
              <RequireAuth>
                <AcademyPlayerPage />
              </RequireAuth>
            }
          />
          <Route
            path="/academy/certificate/:videoId"
            element={
              <RequireAuth>
                <AcademyCertificatePage />
              </RequireAuth>
            }
          />

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
          <Route
            path="/admin"
            element={
              <RequireAdminStaff>
                <AdminSalesDashboardPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/members"
            element={
              <RequireAdminStaff>
                <AdminDashboardPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/refunds"
            element={
              <RequireAdminStaff>
                <AdminRefundPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/members/:userId/gift-videos"
            element={
              <RequireAdminStaff>
                <AdminVideoGiftPage />
              </RequireAdminStaff>
            }
          />

          {/* 결제 결과 페이지 */}
          <Route path="/success" element={<SuccessPage />} />
          <Route path="/fail" element={<FailPage />} />

          {/* 존재하지 않는 경로는 홈으로 리다이렉트 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <AdminImageEditor />
      <SiteFooter />
    </>
  );
}

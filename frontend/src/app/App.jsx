/**
 * 앱 라우팅(App) 구조
 * - React Router로 전체 페이지 경로를 정의하고 권한에 따라 접근을 제한
 * - 모든 페이지는 lazy()로 지연 로딩해 초기 번들 크기를 최소화
 * - RequireAuth: 로그인한 사용자만 접근 가능 (마이페이지, 플레이어)
 * - RequireAdminStaff: 관리자(admin/staff)만 접근 가능 (어드민 페이지 전체)
 * - AdminImageEditor: 모든 페이지에 오버레이로 렌더링, 관리자 편집 모드에서만 활성화
 *
 * 페이지 목록:
 * /                             → 홈페이지
 * /login, /signup               → 로그인·회원가입
 * /find-id, /reset-password     → 계정 찾기·비밀번호 재설정
 * /cart                         → 장바구니
 * /academy                      → 강의 목록
 * /academy/:videoId             → 강의 상세
 * /academy/player/:videoId      → 강의 플레이어 (로그인 필요)
 * /ikleulrim/*                  → 브랜드 소개 5개 서브페이지
 * /community/*                  → 이벤트·후기·문의 커뮤니티
 * /mypage                       → 마이페이지 (로그인 필요)
 * /admin, /admin/*              → 관리자 대시보드 (관리자 전용)
 * /success, /fail               → 결제 결과 페이지
 */
// 파일 역할: 프론트엔드 전체 라우팅 구조와 권한 보호 페이지 연결을 정의합니다.
import React, { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "../shared/components/RequireAuth.jsx";
import { RequireAdminStaff } from "../shared/components/RequireAdminStaff.jsx";
import { PageLayout } from "../shared/components/PageLayout.jsx";
import { SiteFooter } from "../shared/components/SiteFooter.jsx";
import { canEditPage } from "../shared/auth/userRoles.js";
import { useAppStore } from "../shared/store/AppContext.jsx";
import { useMidnightRefresh } from "../shared/hooks/useMidnightRefresh.js";
import { useNativePushNotifications } from "../shared/hooks/useNativePushNotifications.js";

const HomePage = lazy(() => import("../features/home/pages/HomePage.jsx").then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import("../features/auth/pages/LoginPage.jsx").then((m) => ({ default: m.LoginPage })));
const FindIdPage = lazy(() => import("../features/auth/pages/FindIdPage.jsx").then((m) => ({ default: m.FindIdPage })));
const ResetPasswordPage = lazy(() => import("../features/auth/pages/ResetPasswordPage.jsx").then((m) => ({ default: m.ResetPasswordPage })));
const SignupPage = lazy(() => import("../features/auth/pages/SignupPage.jsx").then((m) => ({ default: m.SignupPage })));
const CartPage = lazy(() => import("../features/cart/pages/CartPage.jsx").then((m) => ({ default: m.CartPage })));
const MyPage = lazy(() => import("../features/mypage/pages/MyPage.jsx").then((m) => ({ default: m.MyPage })));
const StudioReservationPage = lazy(() => import("../features/studio/pages/StudioReservationPage.jsx").then((m) => ({ default: m.StudioReservationPage })));
const AdminSchedulePage = lazy(() => import("../features/admin/pages/AdminSchedulePage.jsx").then((m) => ({ default: m.AdminSchedulePage })));
const AdminDashboardPage = lazy(() => import("../features/admin/pages/AdminDashboardPage.jsx").then((m) => ({ default: m.AdminDashboardPage })));
const AdminStudioSalesPage = lazy(() => import("../features/admin/pages/AdminStudioSalesPage.jsx").then((m) => ({ default: m.AdminStudioSalesPage })));
const AdminSalesDashboardPage = lazy(() => import("../features/admin/pages/AdminSalesDashboardPage.jsx").then((m) => ({ default: m.AdminSalesDashboardPage })));
const AdminRefundPage = lazy(() => import("../features/admin/pages/AdminRefundPage.jsx").then((m) => ({ default: m.AdminRefundPage })));
const AdminVideoGiftPage = lazy(() => import("../features/admin/pages/AdminVideoGiftPage.jsx").then((m) => ({ default: m.AdminVideoGiftPage })));
const AdminProductPage = lazy(() => import("../features/admin/pages/AdminProductPage.jsx").then((m) => ({ default: m.AdminProductPage })));
const AdminStudioPassPage = lazy(() => import("../features/admin/pages/AdminStudioPassPage.jsx").then((m) => ({ default: m.AdminStudioPassPage })));
const AdminOperationsPage = lazy(() => import("../features/admin/pages/AdminOperationsPage.jsx").then((m) => ({ default: m.AdminOperationsPage })));
const AdminClassListPage = lazy(() => import("../features/admin/pages/AdminClassListPage.jsx").then((m) => ({ default: m.AdminClassListPage })));
const AdminMemberListPage = lazy(() => import("../features/admin/pages/AdminMemberListPage.jsx").then((m) => ({ default: m.AdminMemberListPage })));
const AdminInstructorPage = lazy(() => import("../features/admin/pages/AdminInstructorPage.jsx").then((m) => ({ default: m.AdminInstructorPage })));
const AdminSettingsPage = lazy(() => import("../features/admin/pages/AdminSettingsPage.jsx").then((m) => ({ default: m.AdminSettingsPage })));
const AdminSettingsBasicPage = lazy(() => import("../features/admin/pages/AdminSettingsBasicPage.jsx").then((m) => ({ default: m.AdminSettingsBasicPage })));
const AdminSettingsOperationPage = lazy(() => import("../features/admin/pages/AdminSettingsOperationPage.jsx").then((m) => ({ default: m.AdminSettingsOperationPage })));
const AdminSettingsRolePage = lazy(() => import("../features/admin/pages/AdminSettingsRolePage.jsx").then((m) => ({ default: m.AdminSettingsRolePage })));
const AdminSettingsClassCategoryPage = lazy(() => import("../features/admin/pages/AdminSettingsClassCategoryPage.jsx").then((m) => ({ default: m.AdminSettingsClassCategoryPage })));
const AdminSettingsMemberGradePage = lazy(() => import("../features/admin/pages/AdminSettingsMemberGradePage.jsx").then((m) => ({ default: m.AdminSettingsMemberGradePage })));
const AdminSettingsNotificationsPage = lazy(() => import("../features/admin/pages/AdminSettingsNotificationsPage.jsx").then((m) => ({ default: m.AdminSettingsNotificationsPage })));
const AdminSettingsRoomPage = lazy(() => import("../features/admin/pages/AdminSettingsRoomPage.jsx").then((m) => ({ default: m.AdminSettingsRoomPage })));
const AdminNoticePage = lazy(() => import("../features/admin/pages/AdminNoticePage.jsx").then((m) => ({ default: m.AdminNoticePage })));
const AdminMessagesPage = lazy(() => import("../features/admin/pages/AdminMessagesPage.jsx").then((m) => ({ default: m.AdminMessagesPage })));
const AcademyPage = lazy(() => import("../features/academy/pages/AcademyPage.jsx").then((m) => ({ default: m.AcademyPage })));
const AcademyDetailPage = lazy(() => import("../features/academy/pages/AcademyDetailPage.jsx").then((m) => ({ default: m.AcademyDetailPage })));
const AcademyPlayerPage = lazy(() => import("../features/academy/pages/AcademyPlayerPage.jsx").then((m) => ({ default: m.AcademyPlayerPage })));
const SuccessPage = lazy(() => import("../features/payment/pages/SuccessPage.jsx").then((m) => ({ default: m.SuccessPage })));
const FailPage = lazy(() => import("../features/payment/pages/FailPage.jsx").then((m) => ({ default: m.FailPage })));

const BrandIntroPage = lazy(() => import("../features/brand/pages/BrandPages.jsx").then((m) => ({ default: m.BrandIntroPage })));
const BrandInstructorsPage = lazy(() => import("../features/brand/pages/BrandPages.jsx").then((m) => ({ default: m.BrandInstructorsPage })));
const BrandEquipmentPage = lazy(() => import("../features/brand/pages/BrandPages.jsx").then((m) => ({ default: m.BrandEquipmentPage })));
const BrandDirectionsPage = lazy(() => import("../features/brand/pages/BrandPages.jsx").then((m) => ({ default: m.BrandDirectionsPage })));

const CommunityEventsPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityEventsPage })));
const CommunityEventDetailPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityEventDetailPage })));
const CommunityReviewsPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityReviewsPage })));
const CommunityReviewDetailPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityReviewDetailPage })));
const CommunityInquiryPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityInquiryPage })));
const CommunityInquiryDetailPage = lazy(() => import("../features/community/pages/CommunityPages.jsx").then((m) => ({ default: m.CommunityInquiryDetailPage })));
const AdminImageEditor = lazy(() => import("../shared/components/AdminImageEditor.jsx").then((m) => ({ default: m.AdminImageEditor })));

// 컴포넌트 역할: 지연 로딩 중에 사용자에게 보여줄 공통 로딩 화면을 렌더링합니다.
function AppRouteFallback() {
  return (
    <PageLayout subpage>
      <section className="community-board-empty">
        <p>페이지를 불러오는 중입니다...</p>
      </section>
    </PageLayout>
  );
}

// 컴포넌트 역할: 프론트엔드 전체 페이지 라우팅과 관리자 편집 도구 표시 조건을 구성합니다.
export default function App() {
  const { currentUser, adminPageEditMode } = useAppStore();
  const canUsePageEditor = canEditPage(currentUser);

  useMidnightRefresh();
  useNativePushNotifications();

  React.useEffect(() => {
    if (!canUsePageEditor || !adminPageEditMode) return;
    import("../shared/components/AdminImageEditor.jsx");
  }, [adminPageEditMode, canUsePageEditor]);

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
          {/* 브랜드 소개 서브페이지 */}
          <Route path="/ikleulrim/intro" element={<BrandIntroPage />} />
          <Route path="/ikleulrim/instructors" element={<BrandInstructorsPage />} />
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
            path="/pilates/reservation"
            element={
              <RequireAuth>
                <StudioReservationPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdminStaff>
                <AdminDashboardPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/members"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/admin/studio"
            element={
              <RequireAdminStaff>
                <AdminSchedulePage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/sales"
            element={
              <RequireAdminStaff>
                <AdminSalesDashboardPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/studio/sales"
            element={
              <RequireAdminStaff>
                <AdminStudioSalesPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/classes"
            element={
              <RequireAdminStaff>
                <AdminClassListPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/member-list"
            element={
              <RequireAdminStaff>
                <AdminMemberListPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/instructors"
            element={
              <RequireAdminStaff>
                <AdminInstructorPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/products"
            element={
              <RequireAdminStaff>
                <AdminProductPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/passes"
            element={
              <RequireAdminStaff>
                <AdminStudioPassPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/operations"
            element={
              <RequireAdminStaff>
                <AdminOperationsPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <RequireAdminStaff>
                <AdminSettingsPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/settings/basic"
            element={
              <RequireAdminStaff>
                <AdminSettingsBasicPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/settings/operation"
            element={
              <RequireAdminStaff>
                <AdminSettingsOperationPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/settings/roles"
            element={
              <RequireAdminStaff>
                <AdminSettingsRolePage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/settings/class-categories"
            element={
              <RequireAdminStaff>
                <AdminSettingsClassCategoryPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/settings/member-grades"
            element={
              <RequireAdminStaff>
                <AdminSettingsMemberGradePage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/settings/notifications"
            element={
              <RequireAdminStaff>
                <AdminSettingsNotificationsPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/settings/rooms"
            element={
              <RequireAdminStaff>
                <AdminSettingsRoomPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/messages"
            element={
              <RequireAdminStaff>
                <AdminMessagesPage />
              </RequireAdminStaff>
            }
          />
          <Route
            path="/admin/board"
            element={
              <RequireAdminStaff>
                <AdminNoticePage />
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
            path="/admin/video-gifts"
            element={
              <RequireAdminStaff>
                <AdminVideoGiftPage />
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
      <Suspense fallback={null}>
        <AdminImageEditor />
      </Suspense>
      <SiteFooter />
    </>
  );
}

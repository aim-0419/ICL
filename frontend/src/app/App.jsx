import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "../shared/components/RequireAuth.jsx";
import { HomePage } from "../features/home/pages/HomePage.jsx";
import { LoginPage } from "../features/auth/pages/LoginPage.jsx";
import { SignupPage } from "../features/auth/pages/SignupPage.jsx";
import { CartPage } from "../features/cart/pages/CartPage.jsx";
import { MyPage } from "../features/mypage/pages/MyPage.jsx";
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
  CommunityEventsPage,
  CommunityInquiryPage,
  CommunityReviewsPage,
} from "../features/community/pages/CommunityPages.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/ikleulrim/intro" element={<BrandIntroPage />} />
      <Route path="/ikleulrim/instructors" element={<BrandInstructorsPage />} />
      <Route path="/ikleulrim/tour" element={<BrandTourPage />} />
      <Route path="/ikleulrim/equipment" element={<BrandEquipmentPage />} />
      <Route path="/ikleulrim/directions" element={<BrandDirectionsPage />} />
      <Route path="/community/events" element={<CommunityEventsPage />} />
      <Route path="/community/reviews" element={<CommunityReviewsPage />} />
      <Route path="/community/inquiry" element={<CommunityInquiryPage />} />
      <Route
        path="/mypage"
        element={
          <RequireAuth>
            <MyPage />
          </RequireAuth>
        }
      />
      <Route path="/success" element={<SuccessPage />} />
      <Route path="/fail" element={<FailPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

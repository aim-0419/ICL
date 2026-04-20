import { Navigate } from "react-router-dom";
import { isAdminStaff } from "../auth/userRoles.js";
import { useAppStore } from "../store/AppContext.jsx";

// 관리자0/관리자1만 접근 가능한 화면 보호 컴포넌트다.
export function RequireAdminStaff({ children }) {
  const { currentUser, isAuthResolved } = useAppStore();

  if (!isAuthResolved) {
    return null;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdminStaff(currentUser)) {
    return <Navigate to="/mypage" replace />;
  }

  return children;
}

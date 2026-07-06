// 파일 역할: 관리자/스태프 권한이 있는 사용자만 접근할 수 있는 보호 라우트를 제공합니다.
import React from "react";
import { Navigate } from "react-router-dom";
import { isAdminStaff } from "../auth/userRoles.js";
import { useAppStore } from "../store/AppContext.jsx";

// 컴포넌트 역할: 관리자/스태프 권한이 없으면 마이페이지로 돌려보내고, 권한이 있으면 자식 화면을 보여줍니다.
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

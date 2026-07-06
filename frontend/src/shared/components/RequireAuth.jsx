// 파일 역할: 로그인한 사용자만 접근할 수 있는 프론트엔드 보호 라우트를 제공합니다.
// 로그인 상태가 아니면 로그인 페이지로 보내고, 로그인 후 원래 경로로 돌아오게 state.from을 전달합니다.
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppStore } from "../store/AppContext.jsx";

// 컴포넌트 역할: 로그인하지 않은 사용자를 로그인 페이지로 보내고 인증된 사용자만 자식 화면을 보여줍니다.
export function RequireAuth({ children }) {
  const { currentUser, isAuthResolved } = useAppStore();
  const location = useLocation();

  if (!isAuthResolved) {
    return null;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

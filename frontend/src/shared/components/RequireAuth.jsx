// 인증 가드 컴포넌트:
// 로그인 상태가 아니면 로그인 페이지로 보내고,
// 로그인 후 원래 가려던 페이지로 돌아오게 state.from을 함께 전달합니다.
import { Navigate, useLocation } from "react-router-dom";
// 로그인 보호가 필요한 페이지를 감싸는 컴포넌트다.
// 인증이 없으면 로그인 화면으로 보내고, 원래 가려던 경로를 state.from에 남긴다.
import { useAppStore } from "../store/AppContext.jsx";

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

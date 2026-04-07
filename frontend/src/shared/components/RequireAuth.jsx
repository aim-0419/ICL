import { Navigate, useLocation } from "react-router-dom";
import { useAppStore } from "../store/AppContext.jsx";

export function RequireAuth({ children }) {
  const { currentUser } = useAppStore();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

// 훅 역할: 로그인한 네이티브 앱에서 푸시 이벤트를 연결하고 이미 허용된 기기 토큰만 갱신합니다.
import { useEffect } from "react";
import { useAppStore } from "../store/AppContext.jsx";
import { initializeNativePushNotifications } from "../notifications/pushNotifications.js";

export function useNativePushNotifications() {
  const { currentUser, isAuthResolved } = useAppStore();

  useEffect(() => {
    if (!isAuthResolved || !currentUser?.id) return undefined;
    let disposed = false;
    let cleanup = () => {};

    initializeNativePushNotifications()
      .then((removeListeners) => {
        if (disposed) removeListeners();
        else cleanup = removeListeners;
      })
      .catch((error) => console.error("[push] 초기화 실패:", error?.message || "unknown error"));

    return () => {
      disposed = true;
      cleanup();
    };
  }, [currentUser?.id, isAuthResolved]);
}

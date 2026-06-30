// 훅 역할: 로그인 상태가 확인된 네이티브 앱에서 푸시 권한 요청과 기기 등록을 한 번 수행합니다.
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
      .catch((error) => console.error("[push] 초기화 실패", error));

    return () => {
      disposed = true;
      cleanup();
    };
  }, [currentUser?.id, isAuthResolved]);
}

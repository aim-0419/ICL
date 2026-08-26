/**
 * [앱 전용 화면 요소와 동작]
 *
 * 이 파일은 안드로이드·iOS 앱에서만 동작하고, 웹 브라우저에서는 아무것도 하지 않습니다.
 *
 * 앱에서만 필요한 것들을 담당합니다.
 * - 위쪽 앱 바와 아래쪽 탭 메뉴(홈·예약·아카데미·마이)
 * - 인터넷이 끊겼을 때 안내 띠 표시
 * - 안드로이드 뒤로가기 버튼 처리
 * - 알림을 눌렀을 때 해당 화면으로 이동
 * - 문자나 링크로 앱을 열었을 때 알맞은 화면으로 이동
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { SplashScreen } from "@capacitor/splash-screen";
import { Bell, CalendarDays, GraduationCap, Home, UserRound, WifiOff } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppContext.jsx";
import {
  getPushNavigationPath,
  isNativeApp,
  isNativeDevice,
  resolveNativeNavigationPath,
} from "../platform/runtime.js";
import { registerNativePushEventListeners } from "../notifications/pushNotifications.js";

const ROOT_PATHS = new Set(["/", "/academy", "/pilates/reservation", "/mypage", "/login"]);

// 하단 탐색을 숨기는 화면은 body의 하단 여백도 함께 해제해야 빈 띠가 남지 않습니다.
function isBottomNavigationHidden(currentPath) {
  return (
    currentPath.startsWith("/academy/player/") ||
    currentPath.startsWith("/admin") ||
    currentPath === "/signup"
  );
}

function isNavigationActive(currentPath, targetPath) {
  if (targetPath === "/") return currentPath === "/";
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function NativeTopBar() {
  const navigate = useNavigate();

  return (
    <header className="native-app-topbar">
      <button className="native-app-brand" type="button" onClick={() => navigate("/")}>
        <img src="/assets/images/이끌림로고.png" alt="" aria-hidden="true" />
        <span>이끌림 필라테스</span>
      </button>
      <button
        className="native-app-topbar-action"
        type="button"
        aria-label="알림 설정 열기"
        title="알림 설정"
        onClick={() => navigate({ pathname: "/mypage", hash: "#push-settings" })}
      >
        <Bell size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </header>
  );
}

function NativeBottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAppStore();
  const accountPath = currentUser ? "/mypage" : "/login";
  const items = useMemo(
    () => [
      { path: "/", label: "홈", Icon: Home },
      { path: "/pilates/reservation", label: "예약", Icon: CalendarDays },
      { path: "/academy", label: "아카데미", Icon: GraduationCap },
      { path: accountPath, label: currentUser ? "마이" : "로그인", Icon: UserRound },
    ],
    [accountPath, currentUser],
  );

  if (isBottomNavigationHidden(location.pathname)) {
    return null;
  }

  return (
    <nav className="native-bottom-nav" aria-label="앱 주요 메뉴">
      {items.map(({ path, label, Icon }) => {
        const active = isNavigationActive(location.pathname, path);
        return (
          <button
            key={path}
            type="button"
            className={`native-bottom-nav-item${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => navigate(path)}
          >
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function NativeAppRuntime() {
  const nativeApp = isNativeApp();
  const nativeDevice = isNativeDevice();
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!nativeApp) return undefined;
    document.documentElement.classList.add("native-app");
    document.body.classList.add("native-app");
    return () => {
      document.documentElement.classList.remove("native-app");
      document.body.classList.remove("native-app");
    };
  }, [nativeApp]);

  useEffect(() => {
    if (!nativeApp) return undefined;
    const hidden = isBottomNavigationHidden(location.pathname);
    document.body.classList.toggle("native-app-no-bottom-nav", hidden);
    return () => document.body.classList.remove("native-app-no-bottom-nav");
  }, [nativeApp, location.pathname]);

  useEffect(() => {
    if (!nativeApp) return undefined;
    const openPath = (rawValue) => {
      const path = resolveNativeNavigationPath(rawValue);
      if (path) navigate(path);
    };
    const handlePushOpened = (event) => {
      const path = getPushNavigationPath(event.detail);
      if (path) navigate(path);
    };

    window.addEventListener("icl:push-opened", handlePushOpened);
    if (!nativeDevice) {
      return () => window.removeEventListener("icl:push-opened", handlePushOpened);
    }

    // 알림 탭 이벤트는 로그인 여부와 무관하게 받아야 목적지를 잃지 않습니다.
    // 여기서는 토큰을 다루지 않으므로 로그아웃 상태에서 재등록되지 않습니다.
    let removePushEventListeners = () => {};
    registerNativePushEventListeners()
      .then((remove) => { removePushEventListeners = remove; })
      .catch((error) => console.error("[push] 알림 리스너 등록 실패:", error?.message || "unknown error"));

    const listeners = [];
    let disposed = false;
    Promise.all([
      CapacitorApp.addListener("appUrlOpen", ({ url }) => openPath(url)),
      CapacitorApp.addListener("backButton", ({ canGoBack }) => {
        const currentPath = pathnameRef.current;
        if (canGoBack && !ROOT_PATHS.has(currentPath)) {
          navigate(-1);
          return;
        }
        if (currentPath !== "/") {
          navigate("/");
          return;
        }
        CapacitorApp.minimizeApp().catch(() => {});
      }),
    ]).then((registered) => {
      if (disposed) registered.forEach((listener) => listener.remove());
      else listeners.push(...registered);
    });
    CapacitorApp.getLaunchUrl().then((result) => openPath(result?.url)).catch(() => {});
    SplashScreen.hide().catch(() => {});

    return () => {
      disposed = true;
      window.removeEventListener("icl:push-opened", handlePushOpened);
      listeners.forEach((listener) => listener.remove().catch(() => {}));
      removePushEventListeners();
    };
  }, [nativeApp, nativeDevice, navigate]);

  useEffect(() => {
    if (!nativeApp) return undefined;
    if (!nativeDevice) {
      const updateOnline = () => setIsOnline(navigator.onLine !== false);
      window.addEventListener("online", updateOnline);
      window.addEventListener("offline", updateOnline);
      return () => {
        window.removeEventListener("online", updateOnline);
        window.removeEventListener("offline", updateOnline);
      };
    }

    let listener;
    Network.getStatus().then((status) => setIsOnline(status.connected)).catch(() => {});
    Network.addListener("networkStatusChange", (status) => setIsOnline(status.connected))
      .then((registered) => { listener = registered; })
      .catch(() => {});
    return () => listener?.remove().catch(() => {});
  }, [nativeApp, nativeDevice]);

  if (!nativeApp) return null;

  return (
    <>
      <NativeTopBar />
      {!isOnline ? (
        <div className="native-offline-banner" role="status">
          <WifiOff size={17} aria-hidden="true" />
          <span>인터넷 연결을 확인해 주세요. 연결되면 자동으로 다시 이용할 수 있습니다.</span>
        </div>
      ) : null}
      <NativeBottomNavigation />
    </>
  );
}

/**
 * [지금 웹인지 앱인지 판단]
 *
 * 같은 코드가 웹과 앱에서 함께 돌기 때문에,
 * 지금 실행 중인 곳이 어디인지 알아야 화면을 다르게 보여 줄 수 있습니다.
 *
 * 또한 알림이나 외부 링크로 전달받은 주소를 검사해
 * 허용된 우리 서비스 주소일 때만 앱 안의 화면으로 이동시킵니다.
 * 이 검사가 없으면 낯선 주소로 사용자를 보내는 데 악용될 수 있습니다.
 */
import { Capacitor } from "@capacitor/core";

const DEFAULT_APP_LINK_HOSTS = ["icl-pilates.com", "www.icl-pilates.com"];
const CUSTOM_APP_SCHEMES = new Set(["iclpilates:", "com.iclpilates.app:"]);

export function isNativeDevice() {
  return Capacitor.isNativePlatform();
}

export function isNativeApp() {
  return isNativeDevice() || String(import.meta.env.VITE_APP_SHELL || "").toLowerCase() === "native";
}

// [현재 미사용] 지금 실행 중인 곳이 안드로이드인지 iOS인지 웹인지 알려줍니다. 현재 호출하는 곳이 없습니다.
export function getNativePlatform() {
  return isNativeDevice() ? Capacitor.getPlatform() : "web";
}

function getAllowedAppLinkHosts() {
  const configured = String(import.meta.env.VITE_APP_LINK_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_APP_LINK_HOSTS, ...configured]);
}

function normalizeInternalPath(pathname, search = "", hash = "") {
  const path = String(pathname || "/").trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  return `${path}${search || ""}${hash || ""}`;
}

// 푸시와 딥링크에서 받은 문자열은 허용된 앱 도메인 또는 내부 경로만 라우터에 전달합니다.
export function resolveNativeNavigationPath(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return normalizeInternalPath(raw);

  try {
    const url = new URL(raw);
    if (CUSTOM_APP_SCHEMES.has(url.protocol)) {
      const customPath = `/${url.hostname || ""}${url.pathname || ""}`.replace(/\/{2,}/g, "/");
      return normalizeInternalPath(customPath || "/", url.search, url.hash);
    }

    if (url.protocol !== "https:" || !getAllowedAppLinkHosts().has(url.hostname.toLowerCase())) {
      return "";
    }
    return normalizeInternalPath(url.pathname, url.search, url.hash);
  } catch {
    return "";
  }
}

export function getPushNavigationPath(notification) {
  const data = notification?.data || notification?.notification?.data || {};
  return resolveNativeNavigationPath(data.path || data.route || data.url || data.link || "");
}

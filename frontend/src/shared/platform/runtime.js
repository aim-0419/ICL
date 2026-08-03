import { Capacitor } from "@capacitor/core";

const DEFAULT_APP_LINK_HOSTS = ["icl-pilates.com", "www.icl-pilates.com"];
const CUSTOM_APP_SCHEMES = new Set(["iclpilates:", "com.iclpilates.app:"]);

export function isNativeDevice() {
  return Capacitor.isNativePlatform();
}

export function isNativeApp() {
  return isNativeDevice() || String(import.meta.env.VITE_APP_SHELL || "").toLowerCase() === "native";
}

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

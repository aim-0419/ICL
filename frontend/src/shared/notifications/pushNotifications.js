import { Capacitor } from "@capacitor/core";
import {
  registerMyPushDevice,
  unregisterMyPushDevice,
} from "../../features/studio/api/studioApi.js";

const TOKEN_STORAGE_KEY = "icl_push_device_token";

async function getFirebaseMessaging() {
  const module = await import("@capacitor-firebase/messaging");
  return module.FirebaseMessaging;
}

function dispatchPushStatus(detail = {}) {
  window.dispatchEvent(new CustomEvent("icl:push-status", { detail }));
}

function normalizeToken(result) {
  return String(result?.token || result?.value || "").trim();
}

async function saveDeviceToken(rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) return false;
  await registerMyPushDevice({
    token,
    platform: Capacitor.getPlatform(),
    deviceName: navigator.userAgent.slice(0, 120),
  });
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  dispatchPushStatus({ permission: "granted", registered: true });
  return true;
}

export async function getNativePushPermissionStatus() {
  if (!Capacitor.isNativePlatform()) {
    return { permission: "unsupported", registered: false };
  }
  const FirebaseMessaging = await getFirebaseMessaging();
  const supported = await FirebaseMessaging.isSupported();
  if (!supported.isSupported) return { permission: "unsupported", registered: false };
  const status = await FirebaseMessaging.checkPermissions();
  return {
    permission: status.receive,
    registered: Boolean(localStorage.getItem(TOKEN_STORAGE_KEY)),
  };
}

export async function requestNativePushPermissionAndRegister() {
  if (!Capacitor.isNativePlatform()) {
    return { permission: "unsupported", registered: false };
  }

  const FirebaseMessaging = await getFirebaseMessaging();
  let permission = await FirebaseMessaging.checkPermissions();
  if (permission.receive === "prompt") permission = await FirebaseMessaging.requestPermissions();
  if (permission.receive !== "granted") {
    dispatchPushStatus({ permission: permission.receive, registered: false });
    return { permission: permission.receive, registered: false };
  }

  const tokenResult = await FirebaseMessaging.getToken();
  const registered = await saveDeviceToken(normalizeToken(tokenResult));
  return { permission: "granted", registered };
}

// 로그인 시 권한을 새로 묻지 않고, 이미 허용된 기기만 토큰을 갱신합니다.
export async function initializeNativePushNotifications() {
  if (!Capacitor.isNativePlatform()) return () => {};

  const FirebaseMessaging = await getFirebaseMessaging();
  const listeners = [];
  listeners.push(await FirebaseMessaging.addListener("tokenReceived", async (event) => {
    try {
      await saveDeviceToken(normalizeToken(event));
    } catch (error) {
      console.error("[push] 기기 토큰 등록 실패:", error?.message || "unknown error");
    }
  }));
  listeners.push(await FirebaseMessaging.addListener("notificationReceived", (notification) => {
    window.dispatchEvent(new CustomEvent("icl:push-received", { detail: notification }));
  }));
  listeners.push(await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
    window.dispatchEvent(new CustomEvent("icl:push-opened", { detail: event.notification || event }));
  }));

  try {
    const status = await getNativePushPermissionStatus();
    if (status.permission === "granted") {
      const tokenResult = await FirebaseMessaging.getToken();
      await saveDeviceToken(normalizeToken(tokenResult));
    } else {
      dispatchPushStatus(status);
    }
  } catch (error) {
    console.error("[push] 초기화 실패:", error?.message || "unknown error");
  }

  return () => {
    listeners.forEach((listener) => listener.remove().catch(() => {}));
  };
}

export async function unregisterCurrentPushDevice() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  let serverError;
  if (token) {
    try {
      await unregisterMyPushDevice(token);
    } catch (error) {
      serverError = error;
    }
  }

  if (Capacitor.isNativePlatform()) {
    const FirebaseMessaging = await getFirebaseMessaging();
    await FirebaseMessaging.deleteToken().catch(() => {});
  }
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  dispatchPushStatus({ permission: "granted", registered: false });
  return { serverUnregistered: !serverError };
}

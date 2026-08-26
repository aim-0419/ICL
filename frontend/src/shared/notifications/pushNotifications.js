/**
 * [앱 알림 받기 준비]
 *
 * 앱에서 알림을 받기 위해 필요한 절차를 처리합니다.
 * - 사용자에게 알림 권한을 물어봅니다.
 * - 이 기기를 알림 받을 기기로 서버에 등록합니다.
 * - 알림이 오거나 사용자가 알림을 눌렀을 때를 감지합니다.
 *
 * 웹 브라우저에서는 동작하지 않습니다.
 */
import { Capacitor } from "@capacitor/core";
import {
  registerMyPushDevice,
  unregisterMyPushDevice,
} from "../../features/studio/api/studioApi.js";

const TOKEN_STORAGE_KEY = "icl_push_device_token";

async function getFirebaseMessaging() {
  const module = await import("@capacitor-firebase/messaging");
  // Capacitor plugin proxy를 async 함수에서 그대로 반환하면 await 과정에서
  // proxy의 then이 네이티브 메서드 "FirebaseMessaging.then()"으로 호출되어
  // Android에서 unhandled rejection이 발생하고 푸시 초기화가 중단된다.
  // then 접근만 차단해 await가 값 그대로 resolve되도록 감싼다.
  return new Proxy(module.FirebaseMessaging, {
    get(target, prop) {
      if (prop === "then") return undefined;
      return Reflect.get(target, prop);
    },
  });
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

/**
 * 알림 수신·탭 이벤트만 연결합니다. 토큰을 다루지 않으므로 로그아웃 상태에서도 안전하며,
 * 로그아웃 중 도착한 알림을 탭했을 때도 앱이 목적지를 알 수 있게 합니다.
 */
export async function registerNativePushEventListeners() {
  if (!Capacitor.isNativePlatform()) return () => {};

  const FirebaseMessaging = await getFirebaseMessaging();
  const listeners = [];
  listeners.push(await FirebaseMessaging.addListener("notificationReceived", (notification) => {
    window.dispatchEvent(new CustomEvent("icl:push-received", { detail: notification }));
  }));
  listeners.push(await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
    window.dispatchEvent(new CustomEvent("icl:push-opened", { detail: event.notification || event }));
  }));

  return () => {
    listeners.forEach((listener) => listener.remove().catch(() => {}));
  };
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

/**
 * 이 기기의 푸시 연결만 해제합니다. 로그아웃 경로에서도 쓰이므로 어떤 단계가 실패해도
 * 예외를 밖으로 던지지 않고, 같은 사용자의 다른 기기는 건드리지 않습니다.
 */
export async function unregisterCurrentPushDevice() {
  let token = localStorage.getItem(TOKEN_STORAGE_KEY);

  // 저장된 토큰이 없어도 기기에 발급된 토큰이 있으면 서버 등록이 남아 있을 수 있습니다.
  if (!token && Capacitor.isNativePlatform()) {
    try {
      const FirebaseMessaging = await getFirebaseMessaging();
      token = normalizeToken(await FirebaseMessaging.getToken());
    } catch {
      token = "";
    }
  }

  let serverError;
  if (token) {
    try {
      await unregisterMyPushDevice(token);
    } catch (error) {
      // 세션이 이미 끊겼거나 네트워크가 불안정해도 로그아웃을 막지 않습니다.
      serverError = error;
      console.error("[push] 기기 등록 해제 실패:", error?.message || "unknown error");
    }
  }

  let tokenDeleted = false;
  if (Capacitor.isNativePlatform()) {
    try {
      const FirebaseMessaging = await getFirebaseMessaging();
      await FirebaseMessaging.deleteToken();
      tokenDeleted = true;
    } catch (error) {
      console.error("[push] 기기 토큰 삭제 실패:", error?.message || "unknown error");
    }
  }

  localStorage.removeItem(TOKEN_STORAGE_KEY);
  dispatchPushStatus({ permission: "granted", registered: false });
  return { serverUnregistered: !serverError, tokenDeleted };
}

// 파일 역할: Android/iOS 앱에서 FCM 토큰을 발급받아 로그인 회원의 기기로 서버에 등록합니다.
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import {
  registerMyPushDevice,
  unregisterMyPushDevice,
} from "../../features/studio/api/studioApi.js";

const TOKEN_STORAGE_KEY = "icl_push_device_token";

export async function initializeNativePushNotifications() {
  if (!Capacitor.isNativePlatform()) return () => {};

  const listeners = [];
  listeners.push(await PushNotifications.addListener("registration", async ({ value }) => {
    const token = String(value || "").trim();
    if (!token) return;
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    await registerMyPushDevice({
      token,
      platform: Capacitor.getPlatform(),
      deviceName: navigator.userAgent.slice(0, 120),
    });
  }));
  listeners.push(await PushNotifications.addListener("registrationError", (error) => {
    console.error("[push] 기기 토큰 등록 실패", error);
  }));
  listeners.push(await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    window.dispatchEvent(new CustomEvent("icl:push-received", { detail: notification }));
  }));
  listeners.push(await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
    window.dispatchEvent(new CustomEvent("icl:push-opened", { detail: event.notification }));
  }));

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") permission = await PushNotifications.requestPermissions();
  if (permission.receive === "granted") await PushNotifications.register();

  return () => {
    listeners.forEach((listener) => listener.remove().catch(() => {}));
  };
}

export async function unregisterCurrentPushDevice() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return;
  try {
    await unregisterMyPushDevice(token);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // 네트워크가 끊긴 로그아웃에서도 다음 로그인 시 같은 토큰이 새 사용자에게 다시 연결됩니다.
  }
}

import React, { useCallback, useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { isNativeApp } from "../platform/runtime.js";
import {
  getNativePushPermissionStatus,
  requestNativePushPermissionAndRegister,
  unregisterCurrentPushDevice,
} from "../notifications/pushNotifications.js";

function getStatusLabel(status) {
  if (status === "granted") return "허용됨";
  if (status === "denied") return "차단됨";
  if (status === "prompt") return "설정 안 함";
  if (status === "unsupported") return "실기기에서 확인 가능";
  return "확인 중";
}

export function NativePushSettings() {
  const nativeApp = isNativeApp();
  const [permission, setPermission] = useState("loading");
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const status = await getNativePushPermissionStatus();
    setPermission(status.permission);
    setRegistered(status.registered);
  }, []);

  useEffect(() => {
    if (!nativeApp) return undefined;
    refresh().catch(() => setPermission("unsupported"));
    const handleStatus = () => refresh().catch(() => {});
    window.addEventListener("icl:push-status", handleStatus);
    return () => window.removeEventListener("icl:push-status", handleStatus);
  }, [nativeApp, refresh]);

  if (!nativeApp) return null;

  async function handleEnable() {
    setBusy(true);
    setMessage("");
    try {
      const result = await requestNativePushPermissionAndRegister();
      setPermission(result.permission);
      setRegistered(result.registered);
      setMessage(result.registered ? "예약 확정과 변경 알림을 받을 수 있습니다." : "기기 설정에서 알림 권한을 허용해 주세요.");
    } catch (error) {
      setMessage(error?.message || "알림 설정을 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setMessage("");
    try {
      const result = await unregisterCurrentPushDevice();
      await refresh();
      setMessage(
        result?.serverUnregistered === false
          ? "기기 알림은 해제했습니다. 서버 연결 후 한 번 더 확인해 주세요."
          : "이 기기의 앱 푸시 알림을 해제했습니다.",
      );
    } catch (error) {
      setMessage(error?.message || "알림 해제를 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const enabled = permission === "granted" && registered;
  return (
    <div id="push-settings" className="mypage-marketing-inline native-push-settings">
      <div className="mypage-marketing-row">
        <div>
          <strong className="native-push-settings-title">
            {enabled ? <Bell size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}
            앱 푸시 알림
          </strong>
          <p className="mypage-marketing-desc">예약 확정, 취소, 대기 전환 등 필요한 소식을 이 기기에서 받습니다.</p>
        </div>
        <button
          type="button"
          className={`ghost-button small-ghost mypage-marketing-toggle${enabled ? " active" : ""}`}
          onClick={enabled ? handleDisable : handleEnable}
          disabled={busy || permission === "unsupported"}
        >
          {busy ? "처리 중..." : enabled ? "알림 끄기" : "알림 켜기"}
        </button>
      </div>
      <span className="mypage-marketing-status">현재 상태: <strong>{getStatusLabel(permission)}</strong></span>
      {message ? <p className="mypage-save-message">{message}</p> : null}
    </div>
  );
}

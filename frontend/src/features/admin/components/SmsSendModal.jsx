// 파일 역할: 관리자 화면 어디서든 특정 회원에게 문자/SMS를 발송할 수 있게 여는 공통 모달입니다.
import React, { useEffect, useState } from "react";
import { sendAdminSms, getSmsConfig } from "../../studio/api/studioApi.js";

function calcBytes(text) {
  let b = 0;
  for (const ch of String(text || "")) b += ch.charCodeAt(0) > 127 ? 2 : 1;
  return b;
}

function parseManualPhones(raw) {
  return String(raw || "")
    .split(/[\n,；;]+/)
    .map((s) => s.trim().replace(/\s/g, ""))
    .filter(Boolean)
    .map((phone) => ({ phone, name: phone }));
}

/**
 * 문자/알림톡 발송 공용 모달
 *
 * Props:
 *   open           - 모달 표시 여부
 *   onClose        - 닫기 콜백
 *   receivers      - [{ phone, name, userId? }] 초기 수신자 목록 (없으면 직접 입력)
 *   defaultMessage - 기본 메시지 텍스트 (선택)
 *   defaultTitle   - 기본 제목 (LMS/알림톡용)
 */
export function SmsSendModal({ open, onClose, receivers = [], defaultMessage = "", defaultTitle = "" }) {
  const [channel, setChannel] = useState("sms");
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [config, setConfig] = useState(null);
  const [manualInput, setManualInput] = useState("");

  const bytes = calcBytes(message);
  const msgType = bytes > 90 ? "LMS" : "SMS";
  const maxBytes = 2000;

  const isManualMode = receivers.length === 0;
  const manualReceivers = isManualMode ? parseManualPhones(manualInput) : [];
  const allReceivers = isManualMode ? manualReceivers : receivers;
  const validReceivers = allReceivers.filter((r) => String(r.phone || "").replace(/\D/g, "").length >= 10);

  useEffect(() => {
    if (!open) return;
    setMessage(defaultMessage);
    setTitle(defaultTitle);
    setResult(null);
    setManualInput("");
    getSmsConfig().then(setConfig).catch(() => setConfig(null));
  }, [open, defaultMessage, defaultTitle]);

  if (!open) return null;

  async function handleSend(e) {
    e.preventDefault();
    if (!message.trim()) return;
    if (validReceivers.length === 0) {
      setResult({ ok: false, message: "유효한 전화번호가 없습니다." });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await sendAdminSms({ channel, receivers: validReceivers, message: message.trim(), title: title.trim() });
      setResult({ ok: true, ...res });
    } catch (err) {
      setResult({ ok: false, message: err.message || "발송 실패" });
    } finally {
      setSending(false);
    }
  }

  const notConfigured = config && (channel === "sms" ? !config.aligoConfigured : !config.kakaoConfigured);

  return (
    <div className="sms-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sms-modal">
        <div className="sms-modal-header">
          <strong>문자 발송</strong>
          <button type="button" className="sms-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* 채널 탭 */}
        <div className="sms-channel-tabs">
          <button
            type="button"
            className={`sms-channel-tab ${channel === "sms" ? "active" : ""}`}
            onClick={() => setChannel("sms")}
          >
            📱 SMS / LMS
          </button>
          <button
            type="button"
            className={`sms-channel-tab ${channel === "kakao" ? "active" : ""}`}
            onClick={() => setChannel("kakao")}
          >
            💬 카카오 알림톡
          </button>
        </div>

        {notConfigured ? (
          <div className="sms-config-warning">
            {channel === "sms"
              ? "알리고 SMS 설정이 없습니다. backend/.env에서 ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER를 입력해 주세요."
              : "카카오 알림톡 설정이 없습니다. backend/.env에서 KAKAO_SENDER_KEY를 입력해 주세요."}
          </div>
        ) : null}

        {config?.testMode ? (
          <div className="sms-test-badge">🧪 테스트 모드 (실제 발송 안 됨)</div>
        ) : null}

        {/* 수신자 — 직접입력 모드 vs 미리 선택된 수신자 */}
        {isManualMode ? (
          <div className="sms-field">
            <label className="sms-label">수신자 전화번호</label>
            <textarea
              className="sms-textarea"
              rows={3}
              placeholder={"010-1234-5678\n010-9876-5432\n(줄바꿈 또는 쉼표로 여러 명 입력)"}
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
            />
            {validReceivers.length > 0 && (
              <span className="sms-byte-count">{validReceivers.length}명 인식됨</span>
            )}
          </div>
        ) : (
          <div className="sms-receivers-area">
            <span className="sms-label">수신자 {validReceivers.length}명</span>
            <div className="sms-receiver-chips">
              {receivers.slice(0, 10).map((r, i) => {
                const hasPhone = String(r.phone || "").replace(/\D/g, "").length >= 10;
                return (
                  <span key={i} className={`sms-receiver-chip ${!hasPhone ? "no-phone" : ""}`}>
                    {r.name || "이름 없음"}
                    {!hasPhone ? " (전화번호 없음)" : ""}
                  </span>
                );
              })}
              {receivers.length > 10 && <span className="sms-receiver-chip">+{receivers.length - 10}</span>}
            </div>
          </div>
        )}

        <form onSubmit={handleSend}>
          {/* LMS 또는 알림톡 제목 */}
          {(channel === "kakao" || msgType === "LMS") && (
            <div className="sms-field">
              <label className="sms-label">제목</label>
              <input
                type="text"
                className="sms-input"
                placeholder="제목 입력 (선택)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={30}
              />
            </div>
          )}

          {/* 메시지 */}
          <div className="sms-field">
            <div className="sms-label-row">
              <label className="sms-label">메시지</label>
              <span className={`sms-byte-count ${bytes > maxBytes ? "over" : ""}`}>
                {bytes}바이트 · {msgType}
                {bytes > 90 && bytes <= maxBytes ? " (LMS 요금 적용)" : ""}
                {bytes > maxBytes ? ` (초과! 최대 ${maxBytes}바이트)` : ""}
              </span>
            </div>
            <textarea
              className="sms-textarea"
              rows={6}
              placeholder="메시지를 입력하세요"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>

          {result && (
            <div className={`sms-result ${result.ok ? "success" : "error"}`}>
              {result.ok
                ? `✅ 발송 완료 — 성공 ${result.successCnt}건${result.errorCnt > 0 ? `, 실패 ${result.errorCnt}건` : ""}${result.testMode ? " (테스트 모드)" : ""}`
                : `❌ ${result.message}`}
            </div>
          )}

          <div className="sms-modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>취소</button>
            <button
              type="submit"
              className="pill-button"
              disabled={sending || !message.trim() || validReceivers.length === 0 || bytes > maxBytes}
            >
              {sending ? "발송 중..." : validReceivers.length > 0 ? `${validReceivers.length}명에게 발송` : "발송"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

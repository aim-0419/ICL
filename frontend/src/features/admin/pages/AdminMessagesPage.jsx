import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import {
  sendAdminSms,
  getSmsConfig,
  getSmsHistory,
  getAutoSmsHistory,
  listAdminStudioStaff,
  searchMembersForPicker,
} from "../../studio/api/studioApi.js";

const NAV_ITEMS = [
  { label: "← 교육관리", path: "/admin" },
  { label: "일정", path: "/admin/studio" },
  { label: "수업", path: "/admin/classes" },
  { label: "회원", path: "/admin/member-list" },
  { label: "강사", path: "/admin/instructors" },
  { label: "수강권", path: "/admin/passes" },
  { label: "메시지", path: "/admin/messages", active: true },
  { label: "게시판", path: "/admin/board" },
  { label: "설정", path: "/admin/settings" },
  { label: "매출", path: "/admin/sales" },
];

const AUTO_TYPE_LABELS = {
  pass_expiry: "수강권 만료",
  pass_expiry_warning: "잔여 횟수 만료",
  class_reminder: "수업 알림",
  booking_confirmed: "예약 확정",
  booking_cancelled: "예약 취소",
  pass_issued: "수강권 발급",
};

function calcBytes(text) {
  let b = 0;
  for (const ch of String(text || "")) b += ch.charCodeAt(0) > 127 ? 2 : 1;
  return b;
}

function formatDt(str) {
  if (!str) return "-";
  const d = new Date(str);
  if (isNaN(d)) return String(str).slice(0, 16);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function thisMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function groupSentRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.providerMsgId || `solo-${row.id}`;
    if (!map.has(key)) {
      map.set(key, { key, sentAt: row.createdAt, message: row.message, title: row.title, channel: row.channel || "sms", names: [], successCnt: 0, failCnt: 0, pendingCnt: 0 });
    }
    const g = map.get(key);
    g.names.push(row.userName || row.userId || "?");
    if (row.resultStatus === "sent") g.successCnt++;
    else if (row.resultStatus === "failed") g.failCnt++;
    else g.pendingCnt++;
  }
  return [...map.values()].sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
}

function recipientLabel(names) {
  if (!names?.length) return "-";
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}명`;
}

// ── 수신자 선택 피커 ──────────────────────────────────────────────────────────

function RecipientPicker({ mode, onClose, onAdd, existingIds }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(new Set());
  const debounceRef = useRef(null);

  useEffect(() => {
    if (mode === "instructor") {
      setLoading(true);
      listAdminStudioStaff()
        .then((rows) => setResults(rows.filter((r) => !String(r.id).startsWith("class-")).map((r) => ({ id: r.id, name: r.name, phone: r.phone, label: `${r.name} (${r.role || "강사"})` }))))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "member") return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      searchMembersForPicker(search, 40)
        .then((rows) => setResults(rows.map((r) => ({ id: r.id, name: r.name || r.loginId, phone: r.phone, label: `${r.name || r.loginId}${r.phone ? ` (${r.phone})` : ""}` }))))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, mode]);

  function toggle(id) {
    setChecked((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  const filtered = mode === "instructor" ? results.filter((r) => !search || r.label.includes(search)) : results;

  return (
    <div className="stm-picker-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="stm-picker-panel">
        <div className="stm-picker-header">
          <strong>{mode === "member" ? "회원 선택" : "강사 선택"}</strong>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <input className="stm-picker-search" type="text" placeholder="이름 또는 전화번호 검색" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        <div className="stm-picker-list">
          {loading && <div className="stm-picker-empty">불러오는 중...</div>}
          {!loading && filtered.length === 0 && <div className="stm-picker-empty">결과 없음</div>}
          {filtered.map((r) => {
            const already = existingIds.has(r.id);
            return (
              <label key={r.id} className={`stm-picker-item${already ? " already" : ""}`}>
                <input type="checkbox" checked={checked.has(r.id) || already} disabled={already} onChange={() => toggle(r.id)} />
                <span className="stm-picker-name">{r.label}</span>
                {!r.phone && <span className="stm-picker-nophone">전화번호 없음</span>}
              </label>
            );
          })}
        </div>
        <div className="stm-picker-footer">
          <button type="button" className="stm-btn-outline" onClick={onClose}>취소</button>
          <button type="button" className="stm-btn-primary" onClick={() => { onAdd(filtered.filter((r) => checked.has(r.id))); onClose(); }} disabled={checked.size === 0}>
            {checked.size > 0 ? `${checked.size}명 추가` : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메시지 보내기 탭 ──────────────────────────────────────────────────────────

function SendTab({ config }) {
  const [channel, setChannel] = useState("sms");
  const [recipients, setRecipients] = useState([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [pickerMode, setPickerMode] = useState(null);
  const [senderNo, setSenderNo] = useState(config?.sender || "");
  const [senderDraft, setSenderDraft] = useState(config?.sender || "");
  const [modal, setModal] = useState(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [templateName, setTemplateName] = useState("");

  const bytes = calcBytes(message);
  const msgType = bytes > 90 ? "LMS" : "SMS";
  const maxBytes = 2000;
  const validRecipients = recipients.filter((r) => String(r.phone || "").replace(/\D/g, "").length >= 10);
  const existingIds = new Set(recipients.map((r) => r.id));

  function addRecipients(newItems) {
    setRecipients((prev) => {
      const merged = [...prev];
      for (const item of newItems) if (!merged.some((r) => r.id === item.id)) merged.push(item);
      return merged;
    });
  }

  function removeRecipient(id) { setRecipients((prev) => prev.filter((r) => r.id !== id)); }

  useEffect(() => {
    const savedSender = localStorage.getItem("icl_studio_sender_no");
    if (savedSender) {
      setSenderNo(savedSender);
      setSenderDraft(savedSender);
      return;
    }
    setSenderNo(config?.sender || "");
    setSenderDraft(config?.sender || "");
  }, [config?.sender]);

  function validateMessageDraft() {
    if (!message.trim()) return "메시지를 입력해 주세요.";
    if (validRecipients.length === 0) return "휴대폰 번호가 있는 수신자를 1명 이상 선택해 주세요.";
    if (bytes > maxBytes) return "메시지가 2000바이트를 초과했습니다.";
    return "";
  }

  function saveSenderNo() {
    const normalized = senderDraft.replace(/\D/g, "");
    if (normalized.length < 9) {
      setResult({ ok: false, message: "발송번호는 숫자 9자리 이상으로 입력해 주세요." });
      return;
    }
    const formatted = normalized.length === 10
      ? normalized.replace(/(\d{2,3})(\d{3,4})(\d{4})/, "$1-$2-$3")
      : normalized.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
    localStorage.setItem("icl_studio_sender_no", formatted);
    setSenderNo(formatted);
    setSenderDraft(formatted);
    setModal(null);
    setResult({ ok: true, successCnt: 0, errorCnt: 0, message: "발송번호가 저장되었습니다." });
  }

  function openScheduleModal() {
    const error = validateMessageDraft();
    if (error) {
      setResult({ ok: false, message: error });
      return;
    }
    setScheduleAt("");
    setModal("schedule");
  }

  function saveSchedule() {
    if (!scheduleAt) {
      setResult({ ok: false, message: "예약 발송 일시를 선택해 주세요." });
      return;
    }
    const selected = new Date(scheduleAt);
    if (Number.isNaN(selected.getTime()) || selected <= new Date()) {
      setResult({ ok: false, message: "현재 이후의 일시로 예약해 주세요." });
      return;
    }
    const schedules = JSON.parse(localStorage.getItem("icl_studio_scheduled_messages") || "[]");
    schedules.unshift({
      id: `schedule-${Date.now()}`,
      channel,
      title: title.trim(),
      message: message.trim(),
      sender: senderNo || config?.sender || "",
      scheduleAt,
      receivers: validRecipients.map((r) => ({ id: r.id, name: r.name, phone: r.phone })),
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem("icl_studio_scheduled_messages", JSON.stringify(schedules.slice(0, 100)));
    setModal(null);
    setResult({ ok: true, successCnt: validRecipients.length, errorCnt: 0, message: "예약 발송이 저장되었습니다." });
  }

  function saveTemplate() {
    if (!message.trim()) {
      setResult({ ok: false, message: "보관할 메시지를 입력해 주세요." });
      return;
    }
    const templates = JSON.parse(localStorage.getItem("icl_studio_message_templates") || "[]");
    templates.unshift({
      id: `template-${Date.now()}`,
      name: templateName.trim() || title.trim() || `보관 메시지 ${templates.length + 1}`,
      title: title.trim(),
      message: message.trim(),
      channel,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem("icl_studio_message_templates", JSON.stringify(templates.slice(0, 100)));
    setTemplateName("");
    setModal(null);
    setResult({ ok: true, successCnt: 0, errorCnt: 0, message: "문자보관함에 저장되었습니다." });
  }

  function openPreviewModal() {
    const error = validateMessageDraft();
    if (error) {
      setResult({ ok: false, message: error });
      return;
    }
    setModal("preview");
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!message.trim() || validRecipients.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      const res = await sendAdminSms({ channel, receivers: validRecipients.map((r) => ({ phone: r.phone, name: r.name, userId: r.id })), message: message.trim(), title: title.trim() });
      setResult({ ok: true, ...res });
      setRecipients([]);
      setMessage("");
      setTitle("");
    } catch (err) {
      setResult({ ok: false, message: err.message || "발송 실패" });
    } finally {
      setSending(false);
    }
  }

  const notConfigured = config && (channel === "sms" ? !config.aligoConfigured : !config.kakaoConfigured);

  return (
    <div className="stm-send-wrap">
      {/* 채널 선택 */}
      <div className="stm-channel-tabs">
        <button type="button" className={`stm-ch-tab${channel === "sms" ? " active" : ""}`} onClick={() => setChannel("sms")}>문자 메시지</button>
        <button type="button" className={`stm-ch-tab${channel === "kakao" ? " active" : ""}`} onClick={() => setChannel("kakao")}>카카오 알림톡</button>
      </div>

      {notConfigured && (
        <div className="stm-config-warn">
          {channel === "sms"
            ? "알리고 SMS 미설정 — backend/.env에 ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER를 입력하세요."
            : "카카오 알림톡 미설정 — backend/.env에 KAKAO_SENDER_KEY를 입력하세요."}
        </div>
      )}

      {/* 주의사항 */}
      <div className="stm-notice-box">
        <div className="stm-notice-icon-col">
          <span className="stm-notice-triangle">▲</span>
          <span className="stm-notice-excl">!</span>
        </div>
        <div className="stm-notice-body">
          <p><strong>1. 문자 발송 시 통신사 사정에 의해 최대 72시간까지 발송결과에 대한 응답 대기 시간이 소요될 수 있습니다.</strong></p>
          <p><strong>2. 응답 대기 중인 메시지는 '처리중..'으로 표시되며 통신사 응답이 완료되면 '전송 성공'으로 변경되고 '전송 실패'에 한해 차감된 포인트는 환불됩니다.</strong></p>
          <p>3. 제목은 40byte까지만 입력되어야 하며 한글, 영어, 숫자, 띄어쓰기 및 (), [], &lt; &gt;만 입력할 것을 권장합니다. 이 외 특수 기호 사용 시 전송이 실패될 수 있습니다.</p>
          <p>4. 다음과 같은 경우, 기타 에러로 표시되어 전송에 실패할 수 있습니다.</p>
          <p className="stm-notice-bullet">■ 음영 지역, 잘못된 번호, 통신사 수신 거부, 일반 수신 거부, 네트워크 에러</p>
          <p className="stm-notice-bullet">■ 수신 번호를 찾을 수 없음, 단말기 일시정지, LMS 미지원 단말기 등 기타 사유</p>
        </div>
      </div>

      {/* 요금 안내 */}
      <div className="stm-cost-bar">
        <span className="stm-cost-icon">✉</span>
        <span>SMS 건당 12 포인트 / 90 바이트</span>
        <span className="stm-cost-sep"> &nbsp; </span>
        <span>LMS 건당 37 포인트 / 2000 바이트</span>
        {config?.testMode && <span className="stm-test-badge">🧪 테스트 모드 — 실제 발송 안 됨</span>}
        {config?.sender && <span className="stm-sender-label">발신번호: {config.sender}</span>}
      </div>

      {/* 폼 카드 */}
      <form className="stm-form-card" onSubmit={handleSend}>
        {/* 발송번호 행 */}
        <div className="stm-row stm-sender-row">
          <span className="stm-row-label">발송번호</span>
          <input className="stm-sender-input" value={senderNo || "미설정"} readOnly />
          <button type="button" className="stm-outline-btn" onClick={() => { setSenderDraft(senderNo || config?.sender || ""); setModal("sender"); }}>발송번호 설정</button>
          <div className="stm-row-spacer" />
          <button type="button" className="stm-ad-warn-btn" onClick={() => setModal("adGuide")}>⚠ 광고 문자 표기 의무사항 확인</button>
        </div>

        {/* 제목 + 받는 사람 행 */}
        <div className="stm-row stm-meta-row">
          <div className="stm-title-col">
            <span className="stm-row-label">제목</span>
            <input
              className="stm-title-input"
              placeholder="제목을 입력해주세요. (LMS 기준 40바이트 이내로 입력가능합니다.)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={40}
            />
          </div>
          <div className="stm-rcpt-header-col">
            <span className="stm-row-label">받는 사람</span>
            <span className="stm-total-count">총 {validRecipients.length}명</span>
            <button type="button" className="stm-rcpt-type-btn" onClick={() => setPickerMode("member")}>회원</button>
            <button type="button" className="stm-rcpt-type-btn" onClick={() => setPickerMode("instructor")}>강사</button>
          </div>
        </div>

        {/* 메시지 | 수신자 2분할 */}
        <div className="stm-content-split">
          <div className="stm-msg-col">
            <textarea
              className="stm-msg-textarea"
              placeholder="메시지를 입력해주세요."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>
          <div className="stm-rcpt-list-col">
            {recipients.length === 0 ? (
              <span className="stm-rcpt-placeholder">받는 사람을 선택해 주세요.</span>
            ) : (
              <div className="stm-rcpt-chips">
                {recipients.map((r) => (
                  <span key={r.id} className={`stm-rcpt-chip${!r.phone ? " no-phone" : ""}`}>
                    {r.name}{!r.phone && " ⚠"}
                    <button type="button" onClick={() => removeRecipient(r.id)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 하단 액션 바 */}
        <div className="stm-action-bar">
          <button type="button" className="stm-action-ghost" onClick={openScheduleModal}>보내기 예약</button>
          <div className="stm-action-right">
            {result && (
              <span className={`stm-send-result ${result.ok ? "ok" : "err"}`}>
                {result.ok
                  ? (result.message || `✅ 성공 ${result.successCnt}건${result.errorCnt > 0 ? `, 실패 ${result.errorCnt}건` : ""}`)
                  : `❌ ${result.message}`}
              </span>
            )}
            <span className="stm-byte-badge">
              {bytes}/{maxBytes}바이트 · {msgType}
              {bytes > 90 && bytes <= maxBytes ? " (LMS)" : ""}
              {bytes > maxBytes ? " ⚠초과" : ""}
            </span>
            <button type="button" className="stm-action-ghost" onClick={() => setModal("template")}>문자보관함 저장</button>
            <button type="button" className="stm-action-ghost" onClick={openPreviewModal}>미리보기</button>
            <button
              type="submit"
              className="stm-action-send"
              disabled={sending || !message.trim() || validRecipients.length === 0 || bytes > maxBytes}
            >
              {sending ? "발송 중..." : "보내기"}
            </button>
          </div>
        </div>
      </form>

      {pickerMode && (
        <RecipientPicker
          mode={pickerMode}
          onClose={() => setPickerMode(null)}
          onAdd={addRecipients}
          existingIds={existingIds}
        />
      )}

      {modal === "sender" && (
        <div className="stm-picker-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="stm-dialog-panel">
            <div className="stm-picker-header">
              <strong>발송번호 설정</strong>
              <button type="button" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="stm-dialog-body">
              <label className="stm-dialog-field">
                <span>발송번호</span>
                <input
                  className="stm-picker-search"
                  value={senderDraft}
                  onChange={(e) => setSenderDraft(e.target.value)}
                  placeholder="예: 010-1234-5678"
                  autoFocus
                />
              </label>
              <p className="stm-dialog-help">실제 외부 문자 API를 연결하면 인증된 발신번호만 사용할 수 있습니다. 현재 화면에서는 운영 테스트용으로 저장됩니다.</p>
            </div>
            <div className="stm-picker-footer">
              <button type="button" className="stm-btn-outline" onClick={() => setModal(null)}>취소</button>
              <button type="button" className="stm-btn-primary" onClick={saveSenderNo}>저장</button>
            </div>
          </div>
        </div>
      )}

      {modal === "adGuide" && (
        <div className="stm-picker-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="stm-dialog-panel">
            <div className="stm-picker-header">
              <strong>광고 문자 표기 의무사항</strong>
              <button type="button" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="stm-dialog-body">
              <ul className="stm-guide-list">
                <li>광고성 메시지는 제목 또는 본문 앞에 (광고)를 표시해야 합니다.</li>
                <li>본문에는 상호명과 수신거부 방법을 함께 안내해야 합니다.</li>
                <li>야간 광고 발송은 수신자의 별도 동의가 필요합니다.</li>
                <li>예약 확정, 취소, 수강권 만료 안내처럼 거래 관계 안내는 정보성 메시지로 관리합니다.</li>
              </ul>
            </div>
            <div className="stm-picker-footer">
              <button type="button" className="stm-btn-primary" onClick={() => setModal(null)}>확인</button>
            </div>
          </div>
        </div>
      )}

      {modal === "schedule" && (
        <div className="stm-picker-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="stm-dialog-panel">
            <div className="stm-picker-header">
              <strong>보내기 예약</strong>
              <button type="button" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="stm-dialog-body">
              <label className="stm-dialog-field">
                <span>예약 일시</span>
                <input
                  className="stm-picker-search"
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  autoFocus
                />
              </label>
              <p className="stm-dialog-help">수신자 {validRecipients.length}명에게 예약 발송으로 저장됩니다. 실제 발송 스케줄러는 외부 문자 API 연동 단계에서 서버 작업으로 연결합니다.</p>
            </div>
            <div className="stm-picker-footer">
              <button type="button" className="stm-btn-outline" onClick={() => setModal(null)}>취소</button>
              <button type="button" className="stm-btn-primary" onClick={saveSchedule}>예약 저장</button>
            </div>
          </div>
        </div>
      )}

      {modal === "template" && (
        <div className="stm-picker-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="stm-dialog-panel">
            <div className="stm-picker-header">
              <strong>문자보관함 저장</strong>
              <button type="button" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="stm-dialog-body">
              <label className="stm-dialog-field">
                <span>보관함 이름</span>
                <input
                  className="stm-picker-search"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="예: 예약 확정 안내"
                  autoFocus
                />
              </label>
              <div className="stm-preview-card">
                <strong>{title || "제목 없음"}</strong>
                <p>{message || "저장할 메시지를 입력해 주세요."}</p>
              </div>
            </div>
            <div className="stm-picker-footer">
              <button type="button" className="stm-btn-outline" onClick={() => setModal(null)}>취소</button>
              <button type="button" className="stm-btn-primary" onClick={saveTemplate}>저장</button>
            </div>
          </div>
        </div>
      )}

      {modal === "preview" && (
        <div className="stm-picker-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="stm-dialog-panel">
            <div className="stm-picker-header">
              <strong>메시지 미리보기</strong>
              <button type="button" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="stm-dialog-body">
              <div className="stm-preview-meta">
                <span>채널: {channel === "sms" ? "문자 메시지" : "카카오 알림톡"}</span>
                <span>발송번호: {senderNo || config?.sender || "미설정"}</span>
                <span>수신자: {recipientLabel(validRecipients.map((r) => r.name))}</span>
                <span>용량: {bytes}/{maxBytes}바이트 · {msgType}</span>
              </div>
              <div className="stm-preview-card">
                <strong>{title || "제목 없음"}</strong>
                <p>{message}</p>
              </div>
            </div>
            <div className="stm-picker-footer">
              <button type="button" className="stm-btn-primary" onClick={() => setModal(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 보낸 메시지 목록 탭 ───────────────────────────────────────────────────────

function SentHistoryTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(thisMonthStart());
  const [dateTo, setDateTo] = useState(todayStr());
  const [detailBatch, setDetailBatch] = useState(null);

  useEffect(() => {
    setLoading(true);
    getSmsHistory(500).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  const batches = groupSentRows(rows).filter((b) => {
    const d = b.sentAt ? b.sentAt.slice(0, 10) : "";
    return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  });

  return (
    <div className="stm-history-wrap">
      {/* 주의사항 */}
      <div className="stm-notice-box" style={{ marginBottom: 16 }}>
        <div className="stm-notice-icon-col"><span className="stm-notice-triangle">▲</span><span className="stm-notice-excl">!</span></div>
        <div className="stm-notice-body">
          <p><strong>1. 문자 발송 시 통신사 사정에 의해 최대 72시간까지 발송결과에 대한 응답 대기 시간이 소요될 수 있습니다.</strong></p>
          <p><strong>2. 응답 대기 중인 메시지는 '처리중..'으로 표시되며 통신사 응답이 완료되면 '전송 성공'으로 변경됩니다.</strong></p>
          <p>3. 제목은 40byte까지만 입력되어야 하며 한글, 영어, 숫자, 띄어쓰기 및 (), [], &lt; &gt;만 입력할 것을 권장합니다.</p>
          <p>4. 다음과 같은 경우, 기타 에러로 표시되어 전송에 실패할 수 있습니다.</p>
          <p className="stm-notice-bullet">■ 음영 지역, 잘못된 번호, 통신사 수신 거부, 일반 수신 거부, 네트워크 에러</p>
          <p className="stm-notice-bullet">■ 수신 번호를 찾을 수 없음, 단말기 일시정지, LMS 미지원 단말기 등 기타 사유</p>
        </div>
      </div>

      <div className="stm-filter-bar">
        <select className="stm-select"><option>메시지 상태 전체</option></select>
        <input type="date" className="stm-date-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span className="stm-date-sep">-</span>
        <input type="date" className="stm-date-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <span className="stm-count-label">발송건수 : {batches.length}건</span>
      </div>

      {loading ? <div className="stm-empty">불러오는 중...</div> : batches.length === 0 ? <div className="stm-empty">데이터 없음</div> : (
        <div className="stm-table-wrap">
          <table className="stm-table">
            <thead>
              <tr>
                <th>발송시간</th><th>메시지</th><th>종류</th><th>받는 사람</th><th>발송 건수</th>
                <th>처리현황<br /><span className="stm-th-sub">성공 / 실패 / 처리 중</span></th>
                <th>발송 결과</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.key}>
                  <td className="stm-td-time">{formatDt(b.sentAt)}</td>
                  <td className="stm-td-msg"><span className="stm-msg-preview">{b.message}</span></td>
                  <td>{b.channel === "kakao" ? "알림톡" : calcBytes(b.message) > 90 ? "LMS" : "SMS"}</td>
                  <td>{recipientLabel(b.names)}</td>
                  <td>{b.names.length}건</td>
                  <td>
                    <span className="stm-stat ok">{b.successCnt}</span>
                    {" / "}
                    <span className="stm-stat fail">{b.failCnt}</span>
                    {" / "}
                    <span className="stm-stat pending">{b.pendingCnt}</span>
                  </td>
                  <td><button type="button" className="stm-result-btn" onClick={() => setDetailBatch(b)}>결과 보기</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailBatch && (
        <div className="stm-picker-overlay" onClick={(e) => e.target === e.currentTarget && setDetailBatch(null)}>
          <div className="stm-picker-panel">
            <div className="stm-picker-header"><strong>발송 결과 상세</strong><button type="button" onClick={() => setDetailBatch(null)}>✕</button></div>
            <div style={{ padding: "12px 20px", fontSize: 13, color: "#666", display: "flex", gap: 16 }}>
              <span>발송시간: {formatDt(detailBatch.sentAt)}</span>
              <span>종류: {detailBatch.channel === "kakao" ? "알림톡" : "SMS/LMS"}</span>
            </div>
            <div style={{ margin: "0 20px 12px", padding: 12, background: "#f8f9fb", borderRadius: 4, fontSize: 13, whiteSpace: "pre-wrap" }}>{detailBatch.message}</div>
            <div style={{ display: "flex", gap: 8, padding: "0 20px 12px" }}>
              <span className="stm-chip ok">성공 {detailBatch.successCnt}건</span>
              <span className="stm-chip fail">실패 {detailBatch.failCnt}건</span>
              <span className="stm-chip pending">처리중 {detailBatch.pendingCnt}건</span>
            </div>
            <div style={{ padding: "0 20px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {detailBatch.names.map((n, i) => <span key={i} className="stm-name-chip">{n}</span>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 자동 발송 목록 탭 ─────────────────────────────────────────────────────────

function AutoHistoryTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(thisMonthStart());
  const [dateTo, setDateTo] = useState(todayStr());

  useEffect(() => {
    setLoading(true);
    getAutoSmsHistory({ limit: 500 }).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  const allTypes = [...new Set(rows.map((r) => r.type).filter(Boolean))];
  const filtered = rows.filter((r) => {
    const d = r.sentAt ? r.sentAt.slice(0, 10) : "";
    return (!typeFilter || r.type === typeFilter) && (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  });

  return (
    <div className="stm-history-wrap">
      <div className="stm-filter-bar">
        <select className="stm-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">알림 종류 전체</option>
          {allTypes.map((t) => <option key={t} value={t}>{AUTO_TYPE_LABELS[t] || t}</option>)}
        </select>
        <input type="date" className="stm-date-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span className="stm-date-sep">-</span>
        <input type="date" className="stm-date-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <span className="stm-count-label">발송건수 : {filtered.length}건</span>
      </div>

      {loading ? <div className="stm-empty">불러오는 중...</div> : filtered.length === 0 ? <div className="stm-empty">데이터 없음</div> : (
        <div className="stm-table-wrap">
          <table className="stm-table">
            <thead>
              <tr>
                <th>발송시간</th><th>알림 종류</th><th>메시지</th><th>종류</th><th>받는 사람</th>
                <th>처리현황<br /><span className="stm-th-sub">성공 / 실패 / 처리 중</span></th>
                <th>발송 결과</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="stm-td-time">{formatDt(r.sentAt)}</td>
                  <td>{AUTO_TYPE_LABELS[r.type] || r.type}</td>
                  <td className="stm-td-msg"><span className="stm-msg-preview">{r.message}</span></td>
                  <td>{r.channel === "kakao" ? "알림톡" : "앱 알림"}</td>
                  <td>{r.userName || r.userId || "-"}</td>
                  <td>
                    <span className="stm-stat ok">{r.resultStatus === "sent" ? 1 : 0}</span>
                    {" / "}
                    <span className="stm-stat fail">{r.resultStatus === "failed" ? 1 : 0}</span>
                    {" / "}
                    <span className="stm-stat pending">{!r.resultStatus || r.resultStatus === "pending" ? 1 : 0}</span>
                  </td>
                  <td>
                    <span className={`stm-status-badge ${r.resultStatus === "sent" ? "ok" : r.resultStatus === "failed" ? "fail" : "pending"}`}>
                      {r.resultStatus === "sent" ? "전송 성공" : r.resultStatus === "failed" ? "전송 실패" : "처리 중"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export function AdminMessagesPage() {
  const { currentUser } = useAppStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState("send");
  const [config, setConfig] = useState(null);

  useEffect(() => {
    getSmsConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  return (
    <div className="admin-schedule-page">
      <header className="admin-schedule-topbar">
        <button className="admin-schedule-logo" type="button" onClick={() => navigate("/")}>
          <span>ICL</span>
        </button>
        <nav className="admin-schedule-nav">
          {NAV_ITEMS.map((item) => (
            <Link key={item.label} className={item.active ? "active" : ""} to={item.path}>{item.label}</Link>
          ))}
        </nav>
        <div className="admin-schedule-user">
          <span>{getUserDisplayName(currentUser)}님</span>
        </div>
      </header>

      <main className="stm-page-main">
        <div className="stm-page-title-row">
          <h1 className="stm-page-title">문자 메시지</h1>
          <span className="stm-page-subtitle">앱 푸시 메시지</span>
        </div>

        <div className="stm-page-tabs">
          <button type="button" className={`stm-page-tab${tab === "send" ? " active" : ""}`} onClick={() => setTab("send")}>메시지 보내기</button>
          <button type="button" className={`stm-page-tab${tab === "sent" ? " active" : ""}`} onClick={() => setTab("sent")}>보낸 메시지 목록</button>
          <button type="button" className={`stm-page-tab${tab === "auto" ? " active" : ""}`} onClick={() => setTab("auto")}>자동 발송 목록</button>
        </div>

        <div className="stm-page-tab-body">
          {tab === "send" && <SendTab config={config} />}
          {tab === "sent" && <SentHistoryTab />}
          {tab === "auto" && <AutoHistoryTab />}
        </div>
      </main>
    </div>
  );
}

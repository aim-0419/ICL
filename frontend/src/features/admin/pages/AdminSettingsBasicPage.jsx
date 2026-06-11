import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAdminStudioInfo, saveAdminStudioInfo, getAdminStudioSettings, saveAdminBusinessHours, getAdminSalesPin, saveAdminSalesPin } from "../../studio/api/studioApi.js";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

const NAV_ITEMS = [
  { label: "← 교육관리", path: "/admin" }, { label: "일정", path: "/admin/studio" },
  { label: "수업", path: "/admin/classes" },
  { label: "회원", path: "/admin/member-list" },
  { label: "강사", path: "/admin/instructors" },
  { label: "수강권", path: "/admin/passes" },
  { label: "메시지", path: "/admin/messages" },
  { label: "게시판", path: "/admin/board" },
  { label: "설정", path: "/admin/settings", active: true },
  { label: "매출", path: "/admin/sales" },
];

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const PHONE_TYPES = ["유선전화", "휴대전화", "팩스"];

function calcHours(open, close) {
  if (!open || !close) return null;
  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  const diff = (ch * 60 + cm) - (oh * 60 + om);
  if (diff <= 0) return null;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m ? `${h}시간 ${m}분` : `${h}.0시간`;
}

function defaultHours() {
  return WEEKDAYS.map((_, i) => ({
    weekday: i + 1,
    openTime: i === 6 ? "09:00" : "08:00",
    closeTime: i === 6 ? "18:00" : "22:00",
    isClosed: i === 6,
  }));
}

export function AdminSettingsBasicPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [studioName, setStudioName] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [phones, setPhones] = useState([{ type: "유선전화", number: "" }]);
  const [smsSender, setSmsSender] = useState("");
  const [hours, setHours] = useState(defaultHours());
  const [updatedAt, setUpdatedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [hasPin, setHasPin] = useState(false);
  const [pinModal, setPinModal] = useState(null); // 'change' | 'reset' | null
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    getAdminSalesPin().then((data) => { if (data?.hasPin !== undefined) setHasPin(data.hasPin); }).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([getAdminStudioInfo(), getAdminStudioSettings()]).then(([info, settings]) => {
      if (info.studioName !== undefined) setStudioName(info.studioName);
      if (info.address !== undefined) setAddress(info.address);
      if (info.addressDetail !== undefined) setAddressDetail(info.addressDetail);
      if (Array.isArray(info.phones) && info.phones.length > 0) setPhones(info.phones);
      if (info.smsSender !== undefined) setSmsSender(info.smsSender);
      if (info.updatedAt) setUpdatedAt(info.updatedAt);
      if (Array.isArray(settings?.businessHours) && settings.businessHours.length > 0) {
        setHours(
          WEEKDAYS.map((_, i) => {
            const row = settings.businessHours.find((h) => Number(h.weekday) === i + 1);
            return row
              ? { weekday: i + 1, openTime: (row.openTime || "08:00").slice(0, 5), closeTime: (row.closeTime || "22:00").slice(0, 5), isClosed: Boolean(row.isClosed) }
              : { weekday: i + 1, openTime: "08:00", closeTime: "22:00", isClosed: false };
          })
        );
      }
    }).catch(() => {});
  }, []);

  function setHourField(idx, field, value) {
    setHours((prev) => prev.map((h, i) => i === idx ? { ...h, [field]: value } : h));
  }

  function applyAllDays() {
    const base = hours[0];
    setHours((prev) => prev.map((h) => ({ ...h, openTime: base.openTime, closeTime: base.closeTime })));
  }

  function addPhone() {
    setPhones((prev) => [...prev, { type: "유선전화", number: "" }]);
  }

  function setPhoneField(idx, field, value) {
    setPhones((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  function removePhone(idx) {
    setPhones((prev) => prev.filter((_, i) => i !== idx));
  }

  function openPinModal(mode) {
    setPinNew("");
    setPinConfirm("");
    setPinError("");
    setPinModal(mode);
  }

  async function handleSavePin() {
    if (pinModal === "change") {
      if (!pinNew.trim()) { setPinError("새 비밀번호를 입력해 주세요."); return; }
      if (pinNew !== pinConfirm) { setPinError("비밀번호가 일치하지 않습니다."); return; }
    }
    setPinSaving(true);
    setPinError("");
    try {
      await saveAdminSalesPin(pinModal === "reset" ? "" : pinNew.trim());
      setHasPin(pinModal === "change");
      setPinModal(null);
      setMessage(pinModal === "reset" ? "비밀번호가 초기화되었습니다." : "비밀번호가 변경되었습니다.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setPinError(err.message || "저장에 실패했습니다.");
    } finally {
      setPinSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const info = await saveAdminStudioInfo({ studioName, address, addressDetail, phones, smsSender });
      await saveAdminBusinessHours(hours);
      setUpdatedAt(info.updatedAt || new Date().toISOString());
      setMessage("저장되었습니다.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(err.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const fmtUpdatedAt = updatedAt ? new Date(updatedAt).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <>
    <div className="admin-sbasic-app">
      <header className="admin-schedule-topbar">
        <button className="admin-schedule-logo" type="button" onClick={() => navigate("/")}>
          <span>ICL</span>
        </button>
        <nav className="admin-schedule-nav">
          {NAV_ITEMS.map((item) => (
            <Link key={item.label} className={item.active ? "active" : ""} to={item.path}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="admin-schedule-search">
          <input type="search" placeholder="검색" readOnly />
        </div>
        <button className="admin-schedule-profile" type="button" onClick={() => navigate("/admin")}>
          {currentUserName}
        </button>
      </header>

    <div className="admin-sbasic-wrap">
      {/* 브레드크럼 */}
      <div className="admin-sbasic-crumb">
        <button type="button" onClick={() => navigate("/admin/settings")}>시설정보수정</button>
        <span>›</span>
        <span>필수정보 설정</span>
      </div>

      <h1 className="admin-sbasic-title">필수정보 설정</h1>
      <div className="admin-sbasic-divider" />

      {/* 01 상호명 */}
      <div className="admin-sbasic-sec">
        <div className="admin-sbasic-num">01</div>
        <div className="admin-sbasic-content">
          <div className="admin-sbasic-label">상호명</div>
          <input
            className="admin-sbasic-input"
            value={studioName}
            onChange={(e) => setStudioName(e.target.value)}
            placeholder="상호명을 입력해 주세요"
          />
        </div>
      </div>
      <div className="admin-sbasic-divider" />

      {/* 02 주소 */}
      <div className="admin-sbasic-sec">
        <div className="admin-sbasic-num">02</div>
        <div className="admin-sbasic-content">
          <div className="admin-sbasic-label">주소</div>
          <input
            className="admin-sbasic-input admin-sbasic-input-addr"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="도로명 주소 또는 지번 주소"
          />
          <input
            className="admin-sbasic-input admin-sbasic-input-addr"
            value={addressDetail}
            onChange={(e) => setAddressDetail(e.target.value)}
            placeholder="상세 주소 (층, 호수 등)"
            style={{ marginTop: 10 }}
          />
        </div>
      </div>
      <div className="admin-sbasic-divider" />

      {/* 03 연락처 */}
      <div className="admin-sbasic-sec">
        <div className="admin-sbasic-num">03</div>
        <div className="admin-sbasic-content">
          <div className="admin-sbasic-label">연락처</div>
          {phones.map((p, idx) => (
            <div key={idx} className="admin-sbasic-phone-row">
              <select
                className="admin-sbasic-phone-type"
                value={p.type}
                onChange={(e) => setPhoneField(idx, "type", e.target.value)}
              >
                {PHONE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                className="admin-sbasic-phone-num"
                value={p.number}
                onChange={(e) => setPhoneField(idx, "number", e.target.value)}
                placeholder="전화번호"
              />
              {idx === 0 ? (
                <button type="button" className="admin-sbasic-phone-add" onClick={addPhone} title="추가">+</button>
              ) : (
                <button type="button" className="admin-sbasic-phone-del" onClick={() => removePhone(idx)} title="삭제">×</button>
              )}
            </div>
          ))}
          <div className="admin-sbasic-phone-row" style={{ marginTop: 10 }}>
            <span className="admin-sbasic-sms-label">SMS발신자 번호</span>
            <input
              className="admin-sbasic-phone-num"
              value={smsSender}
              onChange={(e) => setSmsSender(e.target.value)}
              placeholder="발신자 번호"
            />
          </div>
        </div>
      </div>
      <div className="admin-sbasic-divider" />

      {/* 04 영업시간 */}
      <div className="admin-sbasic-sec">
        <div className="admin-sbasic-num">04</div>
        <div className="admin-sbasic-content">
          <div className="admin-sbasic-label">영업시간 설정</div>
          <div className="admin-sbasic-hours-table">
            {hours.map((h, idx) => (
              <div key={h.weekday} className={`admin-sbasic-hours-row${h.isClosed ? " closed" : ""}`}>
                <span className="admin-sbasic-day">{WEEKDAYS[idx]}</span>
                <span className="admin-sbasic-hours-label">영업시간</span>
                <span className="admin-sbasic-clock">⊙</span>
                <input
                  type="time"
                  className="admin-sbasic-time"
                  value={h.openTime}
                  disabled={h.isClosed}
                  onChange={(e) => setHourField(idx, "openTime", e.target.value)}
                />
                <span className="admin-sbasic-tilde">~</span>
                <span className="admin-sbasic-clock">⊙</span>
                <input
                  type="time"
                  className="admin-sbasic-time"
                  value={h.closeTime}
                  disabled={h.isClosed}
                  onChange={(e) => setHourField(idx, "closeTime", e.target.value)}
                />
                <span className="admin-sbasic-hours-calc">
                  {h.isClosed ? "" : `(${calcHours(h.openTime, h.closeTime) || "-"})`}
                </span>
                <label className="admin-sbasic-closed-label">
                  <input
                    type="checkbox"
                    checked={h.isClosed}
                    onChange={(e) => setHourField(idx, "isClosed", e.target.checked)}
                  />
                  <span>휴무일</span>
                </label>
                {idx === 0 && (
                  <button type="button" className="admin-sbasic-apply-all" onClick={applyAllDays}>
                    모든 요일에 일괄 적용
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="admin-sbasic-divider" />

      {/* 05 매출 페이지 비밀번호 */}
      <div className="admin-sbasic-sec">
        <div className="admin-sbasic-num">05</div>
        <div className="admin-sbasic-content">
          <div className="admin-sbasic-label">
            매출 페이지 비밀번호 설정
            {hasPin && <span className="admin-sbasic-pin-status">설정됨</span>}
          </div>
          <div className="admin-sbasic-pin-row">
            <button type="button" className="admin-sbasic-pin-btn" onClick={() => openPinModal("change")}>비밀번호 변경</button>
            <button type="button" className="admin-sbasic-pin-btn" onClick={() => openPinModal("reset")} disabled={!hasPin}>비밀번호 초기화</button>
          </div>
        </div>
      </div>

      {/* 하단 저장 바 */}
      <div className="admin-sbasic-footer">
        <button type="button" className="admin-sbasic-back-btn" onClick={() => navigate("/admin/settings")}>
          ← 뒤로가기
        </button>
        <span className="admin-sbasic-footer-msg">
          {message || (fmtUpdatedAt ? `${fmtUpdatedAt} 에 마지막으로 수정됨` : "")}
        </span>
        <button type="button" className="admin-sbasic-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "정보 수정 완료"}
        </button>
      </div>
    </div>
    </div>

    {/* 비밀번호 모달 */}
    {pinModal && (
      <div className="admin-pass-modal-backdrop" role="presentation" onClick={() => setPinModal(null)}>
        <div className="admin-pass-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
          <div className="admin-pass-modal-header">
            <strong>{pinModal === "reset" ? "비밀번호 초기화" : "비밀번호 변경"}</strong>
            <button type="button" className="admin-pass-modal-close" onClick={() => setPinModal(null)}>✕</button>
          </div>
          <div className="admin-pass-modal-body">
            {pinModal === "reset" ? (
              <p className="admin-pass-modal-desc">매출 페이지 비밀번호를 초기화합니다.<br />이후 비밀번호 없이 접근할 수 있습니다.</p>
            ) : (
              <>
                <label className="admin-pass-modal-label">
                  새 비밀번호
                  <input
                    type="password"
                    className="admin-pass-modal-input"
                    placeholder="새 비밀번호를 입력해 주세요"
                    value={pinNew}
                    onChange={(e) => setPinNew(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                <label className="admin-pass-modal-label">
                  비밀번호 확인
                  <input
                    type="password"
                    className="admin-pass-modal-input"
                    placeholder="비밀번호를 다시 입력해 주세요"
                    value={pinConfirm}
                    onChange={(e) => setPinConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              </>
            )}
            {pinError && <p className="admin-pass-modal-error">{pinError}</p>}
          </div>
          <div className="admin-pass-modal-footer">
            <button type="button" className="admin-pass-modal-btn-cancel" onClick={() => setPinModal(null)}>취소</button>
            <button type="button" className="admin-pass-modal-btn-confirm" onClick={handleSavePin} disabled={pinSaving}>
              {pinSaving ? "저장 중..." : pinModal === "reset" ? "초기화" : "변경"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

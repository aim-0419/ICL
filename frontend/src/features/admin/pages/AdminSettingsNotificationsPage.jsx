/**
 * [관리자 - 자동 알림 설정]
 *
 * 수업 리마인더, 수강권 만료 안내처럼 자동으로 나가는 알림을
 * 종류별로 켜고 끄고, 보낼 문구를 고치는 화면입니다.
 * 앱 푸시, 문자, 카카오 알림톡 중 어느 방법으로 보낼지 고를 수 있습니다.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout.jsx";
import { getAdminNotificationTemplates, saveAdminNotificationTemplate } from "../../studio/api/studioApi.js";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { AdminSettingsSearchBox } from "../components/AdminSettingsSearchBox.jsx";

const DEFAULTS = {
  pass_expire:       { pushEnabled: true,  smsEnabled: false, message: "[[회원명]]님! [[수강권명]]의 잔여일이 [[수강권 잔여일]]일 남았습니다.",                          param1: 5,    param2: null, skipExpired: false },
  pass_count_expire: { pushEnabled: true,  smsEnabled: false, message: "[[회원명]]님! [[수강권명]]의 잔여횟수가 [[수강권 잔여횟수]]회 남았습니다.",                     param1: 5,    param2: null, skipExpired: false },
  pass_pause_expire: { pushEnabled: true,  smsEnabled: false, message: "[[회원명]]님! [[수강권명]]의 정지기간이 [[수강권 정지만료일]]일 남았습니다.",                    param1: 3,    param2: null, skipExpired: false },
  class_waitlist:    { pushEnabled: true,  smsEnabled: false, message: "[[수업 시작시간]] [[수업명]] [[강사명]] 강사 예약대기 수업이 예약되었습니다.",                   param1: null, param2: null, skipExpired: false },
  class_cancelled:   { pushEnabled: true,  smsEnabled: false, message: "최소 수강인원 미달로 [[수업 시작시간]] [[수업명]] [[강사명]] 강사 수업이 취소되었습니다.",      param1: null, param2: null, skipExpired: false },
  class_reminder:    { pushEnabled: true,  smsEnabled: false, message: "[[수업 시작시간]] [[수업명]] 수업 일정이 있습니다.",                                            param1: 3,    param2: 3,    skipExpired: false },
  member_birthday:   { pushEnabled: true,  smsEnabled: false, message: "[[회원명]]님! 생일을 축하드립니다. 행복한 하루 되세요!",                                        param1: null, param2: null, skipExpired: false },
  locker_expire:     { pushEnabled: true,  smsEnabled: false, message: "[[회원명]]님! [[락커 번호]]번 락커 만료일이 [[락커 종료일]]일 남았습니다.",                      param1: 3,    param2: null, skipExpired: false },
};

const SAMPLE_VALUES = {
  "[[회원명]]": "홍길동",
  "[[수강권명]]": "1개월 자유이용권",
  "[[수강권 잔여일]]": "5",
  "[[수강권 잔여횟수]]": "5",
  "[[수강권 정지만료일]]": "3",
  "[[수업 시작시간]]": "09:00",
  "[[수업명]]": "그룹 필라테스",
  "[[강사명]]": "김지영",
  "[[락커 번호]]": "A-05",
  "[[락커 종료일]]": "3",
};

function calcBytes(text) {
  let b = 0;
  for (const ch of String(text || "")) b += ch.charCodeAt(0) > 127 ? 2 : 1;
  return b;
}

function renderPreview(msg) {
  return Object.entries(SAMPLE_VALUES).reduce((s, [k, v]) => s.replaceAll(k, v), String(msg || ""));
}

function NumInput({ value, onChange, min = 1, max = 99, label = "알림 발송 기준 숫자" }) {
  return (
    <input
      type="number"
      className="admin-snoti-num"
      aria-label={label}
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
    />
  );
}

function NotificationCard({ id, title, note, renderTiming, tpl, onChange, onSave }) {
  const [saving, setSaving] = useState(false);
  const [cardMsg, setCardMsg] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const bytes = calcBytes(tpl?.message);
  const msgType = bytes <= 90 ? "SMS" : "LMS";

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(id, tpl);
      setCardMsg("저장되었습니다.");
      setTimeout(() => setCardMsg(""), 2500);
    } catch (e) {
      setCardMsg(e.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function update(patch) {
    onChange(id, { ...tpl, ...patch });
  }

  return (
    <div className="admin-snoti-card">
      <div className="admin-snoti-card-title">{title}</div>

      {renderTiming && renderTiming(tpl, update)}

      {note && <div className="admin-snoti-note">{note}</div>}

      <div className="admin-snoti-channels">
        <label className="admin-snoti-ch-label">
          <input type="checkbox" checked={Boolean(tpl?.pushEnabled)} onChange={(e) => update({ pushEnabled: e.target.checked })} />
          <span>Push</span>
        </label>
        <label className="admin-snoti-ch-label">
          <input type="checkbox" checked={Boolean(tpl?.smsEnabled)} onChange={(e) => update({ smsEnabled: e.target.checked })} />
          <span>문자</span>
        </label>
        <label className="admin-snoti-ch-label">
          <input type="checkbox" checked={Boolean(tpl?.kakaoEnabled)} onChange={(e) => update({ kakaoEnabled: e.target.checked })} />
          <span>카카오 알림톡</span>
        </label>
      </div>

      {tpl?.kakaoEnabled && (
        <label className="admin-snoti-template-code">
          <span>알림톡 승인 템플릿 코드</span>
          <input
            type="text"
            value={tpl?.kakaoTemplateCode || ""}
            onChange={(e) => update({ kakaoTemplateCode: e.target.value })}
            placeholder="알리고에 등록된 템플릿 코드"
          />
        </label>
      )}

      <textarea
        className="admin-snoti-textarea"
        aria-label={`${title} 메시지 내용`}
        value={tpl?.message || ""}
        onChange={(e) => update({ message: e.target.value })}
        rows={5}
      />

      <div className="admin-snoti-byte-row">
        <span>예상바이트&nbsp;&nbsp;<strong>{bytes}</strong> 바이트</span>
        <span className="admin-snoti-msg-type">{msgType}</span>
      </div>

      {cardMsg && (
        <p className={`admin-snoti-card-msg${cardMsg.includes("실패") ? " error" : ""}`}>{cardMsg}</p>
      )}

      <div className="admin-snoti-btn-row">
        <button type="button" className="admin-snoti-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "수정"}
        </button>
        <button type="button" className="admin-snoti-preview-btn" onClick={() => setShowPreview(true)}>
          미리보기
        </button>
      </div>

      {showPreview && (
        <div className="admin-snoti-overlay" onClick={() => setShowPreview(false)}>
          <div className="admin-snoti-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-snoti-modal-title">미리보기</div>
            <div className="admin-snoti-modal-body">{renderPreview(tpl?.message)}</div>
            <button type="button" className="admin-snoti-modal-close" onClick={() => setShowPreview(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminSettingsNotificationsPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [tpls, setTpls] = useState({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getAdminNotificationTemplates()
      .then((data) => {
        if (data && typeof data === "object") {
          setTpls((prev) => {
            const merged = { ...prev };
            for (const id of Object.keys(DEFAULTS)) {
              if (data[id]) merged[id] = { ...prev[id], ...data[id] };
            }
            return merged;
          });
        }
      })
      .catch((e) => setLoadError(e.message || "템플릿을 불러오지 못했습니다. 기본값으로 표시됩니다."))
      .finally(() => setLoading(false));
  }, []);

  function handleChange(id, updated) {
    setTpls((prev) => ({ ...prev, [id]: updated }));
  }

  async function handleSave(id, tpl) {
    await saveAdminNotificationTemplate(id, tpl);
  }

  const cardProps = (id, title, note, renderTiming) => ({
    id, title, note, renderTiming,
    tpl: tpls[id],
    onChange: handleChange,
    onSave: handleSave,
  });

  return (
    <AdminLayout
      appClass="admin-snoti-app"
      userName={currentUserName}
      searchSlot={<AdminSettingsSearchBox placeholder="설정 검색" />}
    >

      <div className="admin-snoti-wrap">
        <div className="admin-sroom-crumb">
          <button type="button" onClick={() => navigate("/admin/settings")}>시설정보수정</button>
          <span>›</span>
          <span>자동 알림 설정</span>
        </div>
        <h2 className="admin-sroom-title">자동 알림 설정</h2>

        {/* 이용 가이드 */}
        <div className="admin-snoti-guide-wrap">
          <div className="admin-snoti-guide-header">
            <span className="admin-snoti-guide-label">이용 가이드</span>
            <span className="admin-snoti-guide-pricing">
              SMS 건당 12 포인트 / 90바이트&nbsp;&nbsp;&nbsp;LMS 건당 37 포인트 / 2,000바이트
            </span>
          </div>
          <div className="admin-snoti-guide-box">
            <span className="admin-snoti-guide-icon">⚠</span>
            <ol className="admin-snoti-guide-list">
              <li>
                <strong>LMS 메시지는 한/영 구분 없이 띄어쓰기 포함 최대 2,000자까지 입력 가능하며 초과 시 전송에 실패할 수 있습니다.</strong>
                <br />
                <span className="admin-snoti-guide-sub">■ 예상 바이트 수는 시설명, 회원명, 수강권명 등 메시지 내용에 따라 달라질 수 있습니다.</span>
              </li>
              <li>대기 - 예약전환 메시지는 실시간으로 발송되며, 발송시간을 설정할 수 없습니다.</li>
              <li>폐강 시 발송되는 메시지는 폐강시간에 맞게 전송됩니다. 폐강시간은 운영 정보에서 설정할 수 있습니다.</li>
              <li>생일 축하 메시지는 오후 3시에 발송되며 발송시간 변경은 불가합니다.</li>
            </ol>
          </div>
        </div>

        {loadError && (
          <div className="admin-snoti-load-error">⚠ {loadError}</div>
        )}

        {loading ? (
          <div className="admin-snoti-loading">불러오는 중...</div>
        ) : (
          <>
            {/* 수강권 */}
            <div className="admin-snoti-section">
              <h3 className="admin-snoti-section-title">수강권</h3>
              <div className="admin-snoti-card-grid">
                <NotificationCard
                  {...cardProps("pass_expire", "기간 만료", null, (tpl, update) => (
                    <div className="admin-snoti-timing">
                      수강권 만료&nbsp;
                      <NumInput value={tpl?.param1} onChange={(v) => update({ param1: v })} />
                      &nbsp;일 전에 전송합니다.
                    </div>
                  ))}
                />
                <NotificationCard
                  {...cardProps("pass_count_expire", "잔여횟수 만료", null, (tpl, update) => (
                    <div className="admin-snoti-timing">
                      수강권 잔여 횟수&nbsp;
                      <NumInput value={tpl?.param1} onChange={(v) => update({ param1: v })} />
                      &nbsp;회일 때 전송합니다.
                    </div>
                  ))}
                />
                <NotificationCard
                  {...cardProps("pass_pause_expire", "정지기간 만료", null, (tpl, update) => (
                    <div className="admin-snoti-timing">
                      수강권 정지 만료&nbsp;
                      <NumInput value={tpl?.param1} onChange={(v) => update({ param1: v })} />
                      &nbsp;일 전에 전송합니다.
                    </div>
                  ))}
                />
              </div>
            </div>

            {/* 수업 */}
            <div className="admin-snoti-section">
              <h3 className="admin-snoti-section-title">수업</h3>
              <div className="admin-snoti-card-grid">
                <NotificationCard
                  {...cardProps("class_waitlist", "대기에서 예약으로 전환 시", "이 문자는 실시간으로 전송됩니다.", null)}
                />
                <NotificationCard
                  {...cardProps("class_cancelled", "최소 수강인원 미달 폐강 시", "이 문자는 폐강시간에 맞춰 전송됩니다.", null)}
                />
                <NotificationCard
                  {...cardProps("class_reminder", "수업 시작 전 알림", null, (tpl, update) => (
                    <>
                      <div className="admin-snoti-timing">
                        프라이빗 수업 시작&nbsp;
                        <NumInput value={tpl?.param1} onChange={(v) => update({ param1: v })} />
                        &nbsp;시간 전에 전송합니다.
                      </div>
                      <div className="admin-snoti-timing">
                        그룹 수업 시작&nbsp;
                        <NumInput value={tpl?.param2} onChange={(v) => update({ param2: v })} />
                        &nbsp;시간 전에 전송합니다.
                      </div>
                    </>
                  ))}
                />
              </div>
            </div>

            {/* 회원 */}
            <div className="admin-snoti-section">
              <h3 className="admin-snoti-section-title">회원</h3>
              <div className="admin-snoti-card-single">
                <NotificationCard
                  {...cardProps("member_birthday", "생일축하", "이 문자는 실시간으로 전송됩니다.", null)}
                />
                <div className="admin-snoti-skip-row">
                  <span>만료된 회원에게 전송하지 않기</span>
                  <button
                    type="button"
                    className={`admin-snoti-toggle${tpls.member_birthday?.skipExpired ? " on" : ""}`}
                    onClick={() =>
                      setTpls((prev) => ({
                        ...prev,
                        member_birthday: { ...prev.member_birthday, skipExpired: !prev.member_birthday?.skipExpired },
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* 락커 */}
            <div className="admin-snoti-section">
              <h3 className="admin-snoti-section-title">락커</h3>
              <div className="admin-snoti-card-single">
                <NotificationCard
                  {...cardProps("locker_expire", "락커 기간 만료 알림", null, (tpl, update) => (
                    <div className="admin-snoti-timing">
                      락커 기간 만료&nbsp;
                      <NumInput value={tpl?.param1} onChange={(v) => update({ param1: v })} />
                      &nbsp;일 전에 전송합니다.
                    </div>
                  ))}
                />
              </div>
            </div>
          </>
        )}

        <div className="admin-sroom-footer">
          <button type="button" className="admin-sroom-back-btn" onClick={() => navigate("/admin/settings")}>
            ← 뒤로가기
          </button>
          <span className="admin-sroom-footer-msg" />
          <span />
        </div>
      </div>
    </AdminLayout>
  );
}

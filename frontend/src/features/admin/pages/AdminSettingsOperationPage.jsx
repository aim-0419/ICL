import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout.jsx";
import { getAdminStudioSettings, saveAdminBookingPolicy } from "../../studio/api/studioApi.js";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { AdminSettingsSearchBox } from "../components/AdminSettingsSearchBox.jsx";

const DEFAULTS = {
  privateBookHours: 12, privateBookMins: 0,
  groupBookHours: 0, groupBookMins: 0,
  privateCancelHours: 12, privateCancelMins: 0,
  groupCancelHours: 5, groupCancelMins: 0,
  applyBookToExisting: false,
  sameDayChangeHours: 3, sameDayChangeMins: 0,
  applyChangeToExisting: false,
  closureHours: 5, closureMins: 0,
  applyClosureToExisting: false,
  waitlistAutoHours: 3, waitlistAutoMins: 0,
  maxWaitlistPerWeek: 3,
  dailyLimitEnabled: false, dailyLimitTab: "pass", maxDailyBookings: 1,
  bookDeadlineTab: "private", bookDeadlineDate: "", bookDeadlineAutoExtend: 1, bookDeadlineAdvanced: false,
  privateBookDeadlineType: "class_start",
  groupBookDeadlineType: "class_start",
  privateCancelDeadlineType: "class_start",
  groupCancelDeadlineType: "class_start",
  privateTimeUnit: "30",
  maxPrivateClassesEnabled: false, maxPrivateClassCount: 1,
  showGroupBookedCount: true, showGroupWaitlistCount: true,
  inquiryBoardEnabled: false, showAllClassesEnabled: false, lockerEnabled: false,
  penaltyCancelEnabled: false, hideExpiredPassEnabled: true, autoArrearsEnabled: true, loungeEnabled: false,
};

function NumSpinner({ value, onChange, min = 0, max = 99, label = "운영 설정 숫자 입력" }) {
  return (
    <span className="admin-sop-spinner">
      <input
        type="number"
        className="admin-sop-spin-input"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      />
      <span className="admin-sop-spin-btns">
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))}>▲</button>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))}>▼</button>
      </span>
    </span>
  );
}

function ToggleCheck({ checked, onChange, label = "사용함" }) {
  return (
    <label className="admin-sop-toggle-label">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function TabSwitch({ options, value, onChange }) {
  return (
    <div className="admin-sop-tab-switch">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`admin-sop-tab-btn${value === opt.value ? " active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function AdminSettingsOperationPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const currentUserName = getUserDisplayName(store.currentUser) || "관리자";

  const [s, setS] = useState(DEFAULTS);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function set(key, value) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    getAdminStudioSettings().then((settings) => {
      if (settings?.operationSettings && Object.keys(settings.operationSettings).length > 0) {
        setS((prev) => ({ ...prev, ...settings.operationSettings }));
      }
    }).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await saveAdminBookingPolicy({ operationSettings: s });
      const now = new Date().toISOString();
      setUpdatedAt(now);
      setMessage("저장되었습니다.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(err.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const fmtUpdatedAt = updatedAt
    ? new Date(updatedAt).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <AdminLayout
      appClass="admin-sop-app"
      userName={currentUserName}
      searchSlot={<AdminSettingsSearchBox placeholder="설정 검색" />}
    >

      <div className="admin-sop-wrap">
        <div className="admin-sop-crumb">
          <button type="button" onClick={() => navigate("/admin/settings")}>시설정보수정</button>
          <span>›</span>
          <span>운영정보 설정</span>
        </div>
        <h2 className="admin-sop-title">운영정보 설정</h2>
        <p className="admin-sop-required-note">* 필수항목입니다</p>

        {/* 01 예약·취소 가능 시간 설정 */}
        <div className="admin-sop-sec">
          <div className="admin-sop-sec-header">
            <span className="admin-sop-num">01<span className="admin-sop-required">*</span></span>
            <span className="admin-sop-sec-title">예약·취소 가능 시간 설정</span>
            <span className="admin-sop-sec-right">
              <ToggleCheck checked={s.applyBookToExisting} onChange={(v) => set("applyBookToExisting", v)} label="이미 생성된 수업에도 모두 적용" />
            </span>
          </div>
          <div className="admin-sop-sec-body">
            <p className="admin-sop-sub-title">회원 예약 가능 시간을 설정해주세요.</p>
            <div className="admin-sop-time-row">
              <select className="admin-sop-deadline-select" aria-label="프라이빗 수업 예약 마감 기준" value={s.privateBookDeadlineType} onChange={(e) => set("privateBookDeadlineType", e.target.value)}>
                <option value="class_start">수업시간 기준 · 마감시간</option>
                <option value="fixed_time">절대시간 기준 · 마감시간</option>
              </select>
              <span>프라이빗 수업은 수업 시작</span>
              <NumSpinner value={s.privateBookHours} onChange={(v) => set("privateBookHours", v)} />
              <span>시간</span>
              <NumSpinner value={s.privateBookMins} onChange={(v) => set("privateBookMins", v)} max={59} />
              <span>분 전까지 <strong>예약 가능</strong>합니다.</span>
            </div>
            <div className="admin-sop-time-row">
              <select className="admin-sop-deadline-select" aria-label="그룹 수업 예약 마감 기준" value={s.groupBookDeadlineType} onChange={(e) => set("groupBookDeadlineType", e.target.value)}>
                <option value="class_start">수업시간 기준 · 마감시간</option>
                <option value="fixed_time">절대시간 기준 · 마감시간</option>
              </select>
              <span>그룹 수업은 수업 시작</span>
              <NumSpinner value={s.groupBookHours} onChange={(v) => set("groupBookHours", v)} />
              <span>시간</span>
              <NumSpinner value={s.groupBookMins} onChange={(v) => set("groupBookMins", v)} max={59} />
              <span>분 전까지 <strong>예약 가능</strong>합니다.</span>
            </div>
            <p className="admin-sop-sub-title" style={{ marginTop: 20 }}>회원 예약 취소 가능 시간을 설정해주세요.</p>
            <div className="admin-sop-time-row">
              <select className="admin-sop-deadline-select" aria-label="프라이빗 수업 취소 마감 기준" value={s.privateCancelDeadlineType} onChange={(e) => set("privateCancelDeadlineType", e.target.value)}>
                <option value="class_start">수업시간 기준 · 마감시간</option>
                <option value="fixed_time">절대시간 기준 · 마감시간</option>
              </select>
              <span>프라이빗 수업은 수업 시작</span>
              <NumSpinner value={s.privateCancelHours} onChange={(v) => set("privateCancelHours", v)} />
              <span>시간</span>
              <NumSpinner value={s.privateCancelMins} onChange={(v) => set("privateCancelMins", v)} max={59} />
              <span>분 전까지 <strong>예약 취소</strong> 가능합니다.</span>
            </div>
            <div className="admin-sop-time-row">
              <select className="admin-sop-deadline-select" aria-label="그룹 수업 취소 마감 기준" value={s.groupCancelDeadlineType} onChange={(e) => set("groupCancelDeadlineType", e.target.value)}>
                <option value="class_start">수업시간 기준 · 마감시간</option>
                <option value="fixed_time">절대시간 기준 · 마감시간</option>
              </select>
              <span>그룹 수업은 수업 시작</span>
              <NumSpinner value={s.groupCancelHours} onChange={(v) => set("groupCancelHours", v)} />
              <span>시간</span>
              <NumSpinner value={s.groupCancelMins} onChange={(v) => set("groupCancelMins", v)} max={59} />
              <span>분 전까지 <strong>예약 취소</strong> 가능합니다.</span>
            </div>
          </div>
        </div>
        <div className="admin-sop-divider" />

        {/* 02 당일 예약 변경 */}
        <div className="admin-sop-sec">
          <div className="admin-sop-sec-header">
            <span className="admin-sop-num">02</span>
            <span className="admin-sop-sec-title">당일 예약 변경 가능 시간 설정</span>
            <span className="admin-sop-sec-right">
              <ToggleCheck checked={s.applyChangeToExisting} onChange={(v) => set("applyChangeToExisting", v)} label="이미 생성된 수업에도 모두 적용" />
            </span>
          </div>
          <div className="admin-sop-sec-body">
            <p className="admin-sop-sub-title">그룹 수업의 당일 예약 변경 가능 시간을 설정해주세요.</p>
            <div className="admin-sop-time-row">
              <span>그룹 수업은 수업 시작</span>
              <NumSpinner value={s.sameDayChangeHours} onChange={(v) => set("sameDayChangeHours", v)} />
              <span>시간</span>
              <NumSpinner value={s.sameDayChangeMins} onChange={(v) => set("sameDayChangeMins", v)} max={59} />
              <span>분 전까지 <strong>당일 예약 변경</strong> 가능합니다.</span>
            </div>
          </div>
        </div>
        <div className="admin-sop-divider" />

        {/* 03 수업 폐강 시간 */}
        <div className="admin-sop-sec">
          <div className="admin-sop-sec-header">
            <span className="admin-sop-num">03<span className="admin-sop-required">*</span></span>
            <span className="admin-sop-sec-title">수업 폐강 시간 설정</span>
            <span className="admin-sop-sec-right">
              <ToggleCheck checked={s.applyClosureToExisting} onChange={(v) => set("applyClosureToExisting", v)} label="이미 생성된 수업에도 모두 적용" />
            </span>
          </div>
          <div className="admin-sop-sec-body">
            <p className="admin-sop-sub-title">최소 수강인원 미달 수업의 폐강 시간을 설정해주세요.</p>
            <div className="admin-sop-time-row">
              <span>최소 수강인원 미달 수업은 수업 시작</span>
              <NumSpinner value={s.closureHours} onChange={(v) => set("closureHours", v)} />
              <span>시간</span>
              <NumSpinner value={s.closureMins} onChange={(v) => set("closureMins", v)} max={59} />
              <span>분 전에 <strong>폐강</strong>됩니다.</span>
            </div>
          </div>
        </div>
        <div className="admin-sop-divider" />

        {/* 04 예약대기 자동 예약 */}
        <div className="admin-sop-sec">
          <div className="admin-sop-sec-header">
            <span className="admin-sop-num">04<span className="admin-sop-required">*</span></span>
            <span className="admin-sop-sec-title">예약대기 자동 예약 시간 설정</span>
          </div>
          <div className="admin-sop-sec-body">
            <p className="admin-sop-sub-title">예약대기가 예약으로 변경되는 시간을 설정해주세요.</p>
            <p className="admin-sop-sub-title">값을 변경하지 않는 경우 '취소 가능한 시간'으로 적용됩니다.</p>
            <div className="admin-sop-time-row">
              <span>예약대기는 공석이 발생할 경우 수업시작</span>
              <NumSpinner value={s.waitlistAutoHours} onChange={(v) => set("waitlistAutoHours", v)} />
              <span>시간</span>
              <NumSpinner value={s.waitlistAutoMins} onChange={(v) => set("waitlistAutoMins", v)} max={59} />
              <span>분 전 까지 <strong>자동 예약</strong>됩니다.</span>
            </div>
          </div>
        </div>
        <div className="admin-sop-divider" />

        {/* 05 예약 대기 가능 횟수 */}
        <div className="admin-sop-sec">
          <div className="admin-sop-sec-header">
            <span className="admin-sop-num">05<span className="admin-sop-required">*</span></span>
            <span className="admin-sop-sec-title">예약 대기 가능 횟수 설정</span>
          </div>
          <div className="admin-sop-sec-body">
            <p className="admin-sop-sub-title">한 주간 그룹 수업에 예약 대기 가능한 횟수를 설정해주세요.</p>
            <p className="admin-sop-sub-title">0을 입력하거나 값을 입력하지 않는 경우 회원은 예약 대기 기능을 사용할 수 없습니다.</p>
            <div className="admin-sop-time-row">
              <span>회원은 일주일동안 그룹수업에 최대</span>
              <NumSpinner value={s.maxWaitlistPerWeek} onChange={(v) => set("maxWaitlistPerWeek", v)} />
              <span>회까지 <strong>예약 대기</strong> 가능합니다.</span>
            </div>
            <p className="admin-sop-notice">설정값을 수정할 경우 수정 시점 이후부터 적용됩니다.</p>
          </div>
        </div>
        <div className="admin-sop-divider" />

        {/* 06 일일 예약 가능횟수 */}
        <div className="admin-sop-sec">
          <div className="admin-sop-sec-header">
            <span className="admin-sop-num">06</span>
            <span className="admin-sop-sec-title">일일 예약 가능횟수 설정</span>
            <span className="admin-sop-sec-right">
              <ToggleCheck checked={s.dailyLimitEnabled} onChange={(v) => set("dailyLimitEnabled", v)} />
            </span>
          </div>
          <div className="admin-sop-sec-body">
            <TabSwitch
              options={[{ value: "pass", label: "수강권별 제한" }, { value: "date", label: "날짜별 제한" }]}
              value={s.dailyLimitTab}
              onChange={(v) => set("dailyLimitTab", v)}
            />
            <p className="admin-sop-sub-title" style={{ marginTop: 14 }}>당일 그룹 수업에 예약 가능한 횟수를 설정해주세요.</p>
            <div className="admin-sop-time-row">
              <span>회원은 하루에 그룹 수업을 최대</span>
              <NumSpinner value={s.maxDailyBookings} onChange={(v) => set("maxDailyBookings", v)} min={1} />
              <span>회까지 <strong>예약 가능</strong>합니다.</span>
            </div>
            <p className="admin-sop-notice">설정값을 수정할 경우 수정 시점 이후부터 적용됩니다.</p>
          </div>
        </div>
        <div className="admin-sop-divider" />

        {/* 07 예약 가능 기한 */}
        <div className="admin-sop-sec">
          <div className="admin-sop-sec-header">
            <span className="admin-sop-num">07<span className="admin-sop-required">*</span></span>
            <span className="admin-sop-sec-title">예약 가능 기한 설정</span>
            <span className="admin-sop-sec-right">
              <ToggleCheck checked={s.bookDeadlineAdvanced} onChange={(v) => set("bookDeadlineAdvanced", v)} label="고급설정" />
            </span>
          </div>
          <div className="admin-sop-sec-body">
            <TabSwitch
              options={[{ value: "private", label: "프라이빗 수업" }, { value: "group", label: "그룹 수업" }]}
              value={s.bookDeadlineTab}
              onChange={(v) => set("bookDeadlineTab", v)}
            />
            <p className="admin-sop-sub-title" style={{ marginTop: 14 }}>예약 가능한 기한을 설정하여, 예약 기한을 제한할 수 있습니다.</p>
            <div className="admin-sop-time-row">
              <span>회원은</span>
              <input
                type="date"
                className="admin-sop-date-input"
                aria-label="예약 가능 기한 날짜"
                value={s.bookDeadlineDate}
                onChange={(e) => set("bookDeadlineDate", e.target.value)}
              />
              <span>까지 <strong>예약 가능</strong>합니다.</span>
            </div>
            <div className="admin-sop-time-row" style={{ marginTop: 8 }}>
              <span>{s.bookDeadlineDate ? new Date(s.bookDeadlineDate).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : "날짜 미설정"}</span>
              <span style={{ marginLeft: 8 }}>에 자동으로</span>
              <NumSpinner value={s.bookDeadlineAutoExtend} onChange={(v) => set("bookDeadlineAutoExtend", v)} min={1} />
              <span>일 연장합니다.</span>
            </div>
            <div className="admin-sop-congestion-box">
              <p className="admin-sop-congestion-title">실시간 혼잡도 안내</p>
              <p className="admin-sop-sub-title">실시간 혼잡도는 서버로 부터 전달받은 실시간 정보입니다. 서버 상태에 따라 요일 및 시간대별 예측 정보가 표시됩니다.</p>
              <div className="admin-sop-congestion-grid-wrap">
                {[["0시 ~ 8시", 0], ["8시 ~ 16시", 8], ["16시 ~ 24시", 16]].map(([label, startH]) => (
                  <div key={label} className="admin-sop-congestion-block">
                    <p className="admin-sop-congestion-block-title">· {label}</p>
                    <table className="admin-sop-congestion-table">
                      <thead>
                        <tr>
                          <th></th>
                          {["일","월","화","수","목","금","토"].map((d) => <th key={d}>{d}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 8 }, (_, i) => (
                          <tr key={i}>
                            <td className="admin-sop-cg-time">{startH + i}~{startH + i + 1}시</td>
                            {[0,1,2,3,4,5,6].map((d) => (
                              <td key={d} className="admin-sop-cg-cell admin-sop-cg-green" />
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              <div className="admin-sop-congestion-legend">
                <span className="admin-sop-cg-dot admin-sop-cg-green" /> <span>원활</span>
                <span className="admin-sop-cg-dot admin-sop-cg-yellow" style={{ marginLeft: 16 }} /> <span>주의</span>
                <span className="admin-sop-cg-dot admin-sop-cg-red" style={{ marginLeft: 16 }} /> <span>혼잡</span>
              </div>
            </div>
          </div>
        </div>
        <div className="admin-sop-divider" />

        {/* 08 프라이빗 수업 예약 시간 단위 */}
        <div className="admin-sop-sec">
          <div className="admin-sop-sec-header">
            <span className="admin-sop-num">08</span>
            <span className="admin-sop-sec-title">프라이빗 수업 예약 시간 단위 설정</span>
          </div>
          <div className="admin-sop-sec-body">
            <p className="admin-sop-sub-title">회원 앱에서 프라이빗 수업을 예약할 때 설정한 시간 단위로 나타납니다.</p>
            <div className="admin-sop-radio-row">
              {["정시","30","20","15","10","5"].map((unit) => (
                <label key={unit} className="admin-sop-radio-label">
                  <input
                    type="radio"
                    name="privateTimeUnit"
                    value={unit}
                    checked={s.privateTimeUnit === unit}
                    onChange={() => set("privateTimeUnit", unit)}
                  />
                  <span>{unit === "정시" ? "정시" : `${unit}분`}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="admin-sop-divider" />

        {/* 09 프라이빗 수업 최대 개수 */}
        <div className="admin-sop-sec">
          <div className="admin-sop-sec-header">
            <span className="admin-sop-num">09</span>
            <span className="admin-sop-sec-title">프라이빗 수업 생성 최대 개수 설정</span>
            <span className="admin-sop-sec-right">
              <ToggleCheck checked={s.maxPrivateClassesEnabled} onChange={(v) => set("maxPrivateClassesEnabled", v)} />
            </span>
          </div>
          <div className="admin-sop-sec-body">
            <p className="admin-sop-sub-title">프라이빗 수업을 같은 시간대에 만들 수 있는 최대 개수를 제한합니다.</p>
            {s.maxPrivateClassesEnabled && (
              <div className="admin-sop-time-row">
                <span>같은 시간대에 최대</span>
                <NumSpinner value={s.maxPrivateClassCount} onChange={(v) => set("maxPrivateClassCount", v)} min={1} />
                <span>개까지 생성 가능합니다.</span>
              </div>
            )}
            <p className="admin-sop-notice">설정값을 수정할 경우 수정 시점 이후부터 적용됩니다.</p>
          </div>
        </div>
        <div className="admin-sop-divider" />

        {/* 10 그룹 수업 예약/대기 인원 표시 */}
        <div className="admin-sop-sec">
          <div className="admin-sop-sec-header">
            <span className="admin-sop-num">10</span>
            <span className="admin-sop-sec-title">그룹 수업 예약/대기 인원 표시 설정</span>
          </div>
          <div className="admin-sop-sec-body">
            <p className="admin-sop-sub-title">회원 앱에서 그룹 수업의 예약된 인원 표시 여부를 설정합니다.</p>
            <div className="admin-sop-radio-row">
              <label className="admin-sop-radio-label">
                <input type="radio" checked={s.showGroupBookedCount} onChange={() => set("showGroupBookedCount", true)} />
                <span>그룹 수업 예약 인원 표시</span>
              </label>
              <label className="admin-sop-radio-label">
                <input type="radio" checked={!s.showGroupBookedCount} onChange={() => set("showGroupBookedCount", false)} />
                <span>그룹 수업 예약 인원 표시 안함</span>
              </label>
            </div>
            <p className="admin-sop-sub-title" style={{ marginTop: 14 }}>회원 앱에서 그룹 수업의 예약대기 중인 인원 표시 여부를 설정합니다.</p>
            <div className="admin-sop-radio-row">
              <label className="admin-sop-radio-label">
                <input type="radio" checked={s.showGroupWaitlistCount} onChange={() => set("showGroupWaitlistCount", true)} />
                <span>그룹 수업 예약대기 인원 표시</span>
              </label>
              <label className="admin-sop-radio-label">
                <input type="radio" checked={!s.showGroupWaitlistCount} onChange={() => set("showGroupWaitlistCount", false)} />
                <span>그룹 수업 예약대기 인원 표시 안함</span>
              </label>
            </div>
          </div>
        </div>
        <div className="admin-sop-divider" />

        {/* 11~17 토글 섹션들 */}
        {[
          { num: "11", title: "문의 게시판 설정", key: "inquiryBoardEnabled", desc: "체크시 문의 게시판 기능을 사용합니다." },
          { num: "12", title: "모든 수업 보기 설정", key: "showAllClassesEnabled", desc: "체크시 회원 앱에서 회원들이 가진 수강권으로 볼 수 없는 수업 목록도 보이게됩니다." },
          { num: "13", title: "락커 설정", key: "lockerEnabled", desc: "체크시, 메뉴 상단에 락커 기능이 추가됩니다.\n회원 탭에 회원 별 사용 중인 락커와 만료일이 표시됩니다." },
          { num: "14", title: "횟수 차감되는 취소 설정", key: "penaltyCancelEnabled", desc: "취소 가능 시간이 지난 후 회원이 예약을 취소하면 횟수가 차감되며 취소됩니다." },
          { num: "15", title: "회원앱에서 만료된 수강권 숨기기", key: "hideExpiredPassEnabled", desc: "만료된 수강권은 회원앱에서 보이지 않게 됩니다." },
          { num: "16", title: "수강권 미수금 자동 입력", key: "autoArrearsEnabled", desc: "체크시, 수강권 발급 및 결제 정보 수정시 미수금이 자동 입력됩니다." },
          { num: "17", title: "회원앱 라운지 설정", key: "loungeEnabled", desc: "체크시, 회원앱에서 라운지 기능을 사용할 수 있습니다." },
        ].map((item, idx, arr) => (
          <React.Fragment key={item.num}>
            <div className="admin-sop-sec">
              <div className="admin-sop-sec-header">
                <span className="admin-sop-num">{item.num}</span>
                <span className="admin-sop-sec-title">{item.title}</span>
                <span className="admin-sop-sec-right">
                  <ToggleCheck checked={s[item.key]} onChange={(v) => set(item.key, v)} />
                </span>
              </div>
              <div className="admin-sop-sec-body">
                <p className="admin-sop-sub-title" style={{ whiteSpace: "pre-line" }}>{item.desc}</p>
              </div>
            </div>
            {idx < arr.length - 1 && <div className="admin-sop-divider" />}
          </React.Fragment>
        ))}

        {/* 하단 저장 바 */}
        <div className="admin-sop-footer">
          <button type="button" className="admin-sop-back-btn" onClick={() => navigate("/admin/settings")}>
            ← 뒤로가기
          </button>
          <span className="admin-sop-footer-msg">
            {message || (fmtUpdatedAt ? `${fmtUpdatedAt} 에 마지막으로 수정됨` : "")}
          </span>
          <button type="button" className="admin-sop-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : "정보 수정 완료"}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}

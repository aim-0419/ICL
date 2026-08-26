/**
 * [회원가입 페이지]
 *
 * 새로운 회원이 아이디·이름·이메일·비밀번호를 입력하고 약관에 동의한 뒤 가입하는 화면입니다.
 * - 이메일 인증 코드를 발송하고 확인하는 단계를 포함합니다
 * - 이용약관·개인정보 처리방침 전문을 모달로 확인할 수 있습니다
 * - 가입 완료 후 자동으로 로그인되어 홈 화면으로 이동합니다
 */
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "../../../shared/components/PageLayout.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { apiRequest } from "../../../shared/api/client.js";
import { TERMS_CONTENT } from "../../../shared/legal/termsContent.jsx";

// 컴포넌트 역할: 신규 회원 가입 입력과 제출을 처리하는 페이지 컴포넌트입니다.
export function SignupPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [form, setForm] = useState({
    loginId: "",
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    phone: "",
    birthYear: "",
  });
  const [agreements, setAgreements] = useState({
    service: false,
    privacy: false,
    age: false,
    marketing: false,
  });

  // 약관 모달 상태
  const [termsModal, setTermsModal] = useState(null); // 'service' | 'privacy' | 'marketing' | null

  // 이메일 인증 상태
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailConfirming, setEmailConfirming] = useState(false);
  const [timerSec, setTimerSec] = useState(0);
  const timerRef = useRef(null);

  // 이메일이 바뀌면 인증 상태 초기화
  function handleEmailChange(e) {
    setForm((cur) => ({ ...cur, email: e.target.value }));
    setEmailCodeSent(false);
    setEmailVerified(false);
    setEmailCode("");
    setTimerSec(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function startTimer(seconds) {
    setTimerSec(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimerSec((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function formatTimer(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  async function handleSendCode() {
    const email = form.email.trim();
    if (!email) { alert("이메일을 먼저 입력해 주세요."); return; }
    setEmailSending(true);
    try {
      const result = await apiRequest("/auth/signup/email-verification/request", {
        method: "POST",
        body: { email },
      });
      setEmailCodeSent(true);
      setEmailVerified(false);
      setEmailCode("");
      startTimer(result.expiresInSeconds || 300);
      alert("메일 서버가 인증번호 발송을 접수했습니다. 받은편지함과 스팸함을 확인해 주세요.");
    } catch (err) {
      alert(err.message);
    } finally {
      setEmailSending(false);
    }
  }

  async function handleConfirmCode() {
    if (!emailCode.trim()) { alert("인증번호를 입력해 주세요."); return; }
    if (timerSec === 0) { alert("인증번호가 만료되었습니다. 다시 발송해 주세요."); return; }
    setEmailConfirming(true);
    try {
      await apiRequest("/auth/signup/email-verification/confirm", {
        method: "POST",
        body: { email: form.email.trim(), code: emailCode.trim() },
      });
      setEmailVerified(true);
      if (timerRef.current) clearInterval(timerRef.current);
      setTimerSec(0);
    } catch (err) {
      alert(err.message);
    } finally {
      setEmailConfirming(false);
    }
  }

  const allAgree = Object.values(agreements).every(Boolean);
  const requiredAgree = agreements.service && agreements.privacy && agreements.age;

  const canSubmit =
    form.loginId.trim() &&
    form.name.trim() &&
    form.email.trim() &&
    form.phone.trim() &&
    form.password.trim() &&
    form.passwordConfirm.trim() &&
    form.password === form.passwordConfirm &&
    requiredAgree &&
    emailVerified;

  function toggleAgreement(key) {
    setAgreements((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleAllAgreement() {
    const next = !allAgree;
    setAgreements({ service: next, privacy: next, age: next, marketing: next });
  }

  function handleViewDetail(key) {
    setTermsModal(key);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      if (!requiredAgree) { alert("필수 약관에 동의해 주세요."); return; }
      if (form.password !== form.passwordConfirm) { alert("비밀번호 확인이 일치하지 않습니다."); return; }
      if (!emailVerified) { alert("이메일 인증을 완료해 주세요."); return; }

      await store.signupUser({
        loginId: form.loginId.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        phone: form.phone.trim(),
        birthYear: form.birthYear.trim() ? form.birthYear.trim() : null,
        marketingAgree: agreements.marketing,
      });
      alert("회원가입이 완료되었습니다.");
      navigate("/mypage");
    } catch (error) {
      alert(error.message);
    }
  }

  const activeTerms = termsModal ? TERMS_CONTENT[termsModal] : null;

  return (
    <>
      {activeTerms && (
        <div
          onClick={() => setTermsModal(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9000, padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "560px",
              maxHeight: "80vh", display: "flex", flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "20px 24px", borderBottom: "1px solid #eee", flexShrink: 0,
            }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#2c2c2c" }}>
                {activeTerms.title}
              </h3>
              <button
                onClick={() => setTermsModal(null)}
                style={{
                  background: "none", border: "none", fontSize: "18px",
                  cursor: "pointer", color: "#888", padding: "0 4px", lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{
              overflowY: "auto", padding: "20px 24px",
              fontSize: "13px", lineHeight: "1.85", color: "#444",
              whiteSpace: "pre-wrap", wordBreak: "keep-all",
            }}>
              {activeTerms.body}
            </div>
            <div style={{
              padding: "16px 24px", borderTop: "1px solid #eee",
              flexShrink: 0, textAlign: "right",
            }}>
              <button
                onClick={() => setTermsModal(null)}
                style={{
                  background: "#2c2c2c", color: "#fff", border: "none",
                  borderRadius: "30px", padding: "10px 32px", fontSize: "14px",
                  fontWeight: 600, cursor: "pointer",
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
      <PageLayout subpage mainClass="auth-page">
        <section className="auth-card signup-auth-card">
          <p className="section-kicker">회원가입</p>
          <h1>회원가입</h1>
          <p className="section-text">회원가입 후 교육 영상 구매와 수강 이력을 관리할 수 있습니다.</p>
          <div className="signup-coupon-box">
            <strong>신규 회원 웰컴 혜택 진행 중</strong>
            <p>10초만에 가입하고 다양한 혜택을 받아보세요.</p>
          </div>

          <form className="auth-form signup-form-shell" onSubmit={handleSubmit}>
            <label>
              아이디
              <input
                type="text"
                placeholder="영문/숫자 조합 아이디를 입력해 주세요"
                required
                value={form.loginId}
                onChange={(event) => setForm((current) => ({ ...current, loginId: event.target.value }))}
              />
            </label>

            <label>
              이름
              <input
                type="text"
                placeholder="실명으로 공백 없이 입력해 주세요"
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>

            <div>
              <label>이메일</label>
              <div className="field-inline">
                <input
                  type="email"
                  required
                  placeholder="실제 사용하시는 이메일 주소"
                  value={form.email}
                  onChange={handleEmailChange}
                  disabled={emailVerified}
                />
                <button
                  className="field-inline-button"
                  type="button"
                  onClick={handleSendCode}
                  disabled={emailSending || emailVerified}
                >
                  {emailVerified ? "인증 완료" : emailCodeSent ? "재발송" : "인증메일 발송"}
                </button>
              </div>

              {emailVerified && (
                <p style={{ marginTop: "6px", fontSize: "13px", color: "#2e7d32", fontWeight: 600 }}>
                  ✓ 이메일 인증이 완료되었습니다.
                </p>
              )}

              {emailCodeSent && !emailVerified && (
                <div style={{ marginTop: "8px" }}>
                  <div className="field-inline">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="인증번호 6자리 입력"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    <button
                      className="field-inline-button"
                      type="button"
                      onClick={handleConfirmCode}
                      disabled={emailConfirming || timerSec === 0}
                    >
                      확인
                    </button>
                  </div>
                  {timerSec > 0 ? (
                    <p style={{ marginTop: "4px", fontSize: "12px", color: "#888" }}>
                      남은 시간 <strong style={{ color: timerSec <= 60 ? "#c0392b" : "#555" }}>{formatTimer(timerSec)}</strong>
                    </p>
                  ) : (
                    <p style={{ marginTop: "4px", fontSize: "12px", color: "#c0392b" }}>
                      인증번호가 만료되었습니다. 재발송해 주세요.
                    </p>
                  )}
                </div>
              )}
            </div>

            <label>
              연락처 (숫자만)
              <input
                type="tel"
                required
                placeholder="- 없이 숫자만 입력해 주세요"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value.replace(/\D/g, ""),
                  }))
                }
              />
            </label>

            <label>
              출생연도 (선택)
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="예: 1994"
                value={form.birthYear}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    birthYear: event.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
              />
            </label>

            <label>
              비밀번호
              <input
                type="password"
                required
                placeholder="비밀번호를 입력해 주세요"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>

            <label>
              비밀번호 확인
              <input
                type="password"
                required
                placeholder="비밀번호를 다시 입력해 주세요"
                value={form.passwordConfirm}
                onChange={(event) =>
                  setForm((current) => ({ ...current, passwordConfirm: event.target.value }))
                }
              />
            </label>

            <section className="agreement-box">
              <label className="agreement-all">
                <input type="checkbox" checked={allAgree} onChange={toggleAllAgreement} />
                <span>전체 동의</span>
              </label>

              <div className="agreement-list">
                <div className="agreement-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={agreements.service}
                      onChange={() => toggleAgreement("service")}
                    />
                    <span>서비스 이용약관 동의 (필수)</span>
                  </label>
                  <button type="button" className="agreement-view-btn" onClick={() => handleViewDetail("service")}>
                    보기
                  </button>
                </div>

                <div className="agreement-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={agreements.privacy}
                      onChange={() => toggleAgreement("privacy")}
                    />
                    <span>개인정보 수집 및 이용 동의 (필수)</span>
                  </label>
                  <button type="button" className="agreement-view-btn" onClick={() => handleViewDetail("privacy")}>
                    보기
                  </button>
                </div>

                <div className="agreement-row">
                  <label>
                    <input type="checkbox" checked={agreements.age} onChange={() => toggleAgreement("age")} />
                    <span>만 14세 이상입니다 (필수)</span>
                  </label>
                </div>

                <div className="agreement-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={agreements.marketing}
                      onChange={() => toggleAgreement("marketing")}
                    />
                    <span>마케팅 정보 수신 동의 (선택)</span>
                  </label>
                  <button type="button" className="agreement-view-btn" onClick={() => handleViewDetail("marketing")}>
                    보기
                  </button>
                </div>
              </div>
            </section>

            <button className="pill-button full" type="submit" disabled={!canSubmit}>
              회원가입하기
            </button>
          </form>
        </section>
      </PageLayout>
    </>
  );
}

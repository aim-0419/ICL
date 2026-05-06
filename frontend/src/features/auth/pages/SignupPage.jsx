// 파일 역할: 신규 회원 가입 입력과 제출을 처리하는 페이지 컴포넌트입니다.
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { apiRequest } from "../../../shared/api/client.js";

const TERMS_CONTENT = {
  service: {
    title: "서비스 이용약관",
    body: `제1조 (목적)
이 약관은 이끌림 필라테스(이하 "회사")가 제공하는 온라인 교육 서비스(이하 "서비스")의 이용에 관한 조건 및 절차, 회사와 회원 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.

제2조 (정의)
① "서비스"란 회사가 제공하는 필라테스 온라인 강의, 커뮤니티 등 일체의 서비스를 말합니다.
② "회원"이란 이 약관에 동의하고 회원 가입을 완료한 자를 말합니다.
③ "콘텐츠"란 회사가 서비스를 통해 제공하는 동영상 강의, 텍스트, 이미지 등 일체의 자료를 말합니다.

제3조 (약관의 효력 및 변경)
① 이 약관은 서비스를 이용하고자 하는 모든 회원에게 적용됩니다.
② 회사는 관련 법령에 위배되지 않는 범위 내에서 약관을 변경할 수 있으며, 변경 시 공지사항을 통해 사전 고지합니다.

제4조 (서비스 이용)
① 서비스 이용은 회사의 업무상 또는 기술상 특별한 지장이 없는 한 연중무휴, 1일 24시간 제공함을 원칙으로 합니다.
② 회사는 서비스의 유지·보수를 위한 작업이 필요한 경우 서비스 제공을 일시 중단할 수 있으며, 사전에 공지합니다.

제5조 (회원 의무)
① 회원은 타인의 정보를 도용하거나 허위 정보를 등록하여서는 안 됩니다.
② 회원은 서비스에서 제공하는 콘텐츠를 무단으로 복제, 배포, 전송하여서는 안 됩니다.
③ 회원은 서비스 이용 시 관련 법령 및 이 약관을 준수하여야 합니다.

제6조 (결제 및 환불)
① 유료 서비스는 회사가 정한 방법으로 결제합니다.
② 콘텐츠 구매 후 7일 이내, 수강 이력이 없는 경우 전액 환불이 가능합니다.
③ 수강이 시작된 경우 「콘텐츠산업진흥법」 등 관련 법령에 따라 환불 금액이 산정됩니다.

제7조 (지식재산권)
서비스에서 제공하는 모든 콘텐츠의 저작권은 회사 또는 콘텐츠 제공자에게 있으며, 회원은 서비스를 이용해 얻은 정보를 회사의 사전 승낙 없이 상업적으로 이용할 수 없습니다.

제8조 (면책조항)
① 회사는 천재지변, 전쟁, 기간통신사업자의 서비스 중지 등 불가항력적인 사유로 서비스를 제공할 수 없는 경우 책임이 면제됩니다.
② 회원의 귀책 사유로 인한 서비스 이용 장애에 대해 회사는 책임을 지지 않습니다.

제9조 (분쟁 해결)
이 약관에 관한 분쟁은 회사의 본사 소재지를 관할하는 법원을 전속 관할로 합니다.

부칙
이 약관은 2026년 4월 1일부터 시행합니다.`,
  },
  privacy: {
    title: "개인정보 수집 및 이용 동의",
    body: `이끌림 필라테스(이하 "회사")는 개인정보보호법에 따라 회원의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보 처리방침을 수립·공개합니다.

1. 수집하는 개인정보 항목

[필수 항목]
· 아이디, 비밀번호, 이름, 이메일 주소, 휴대폰 번호

[선택 항목]
· 출생연도

[서비스 이용 과정에서 자동 수집]
· 서비스 이용 기록, 접속 로그, 쿠키, 결제 기록

2. 개인정보의 수집 및 이용 목적

· 회원 가입 및 관리: 본인 확인, 회원 식별, 불량회원 방지
· 서비스 제공: 강의 구매, 수강 이력 관리, 고객 상담
· 결제 처리: 유료 서비스 결제 및 환불 처리

3. 개인정보 보유 및 이용 기간

· 회원 탈퇴 시까지 (탈퇴 후 90일간 보관 후 파기)
· 단, 관련 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안 보관

[관련 법령에 따른 보존 기간]
· 계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래법)
· 소비자 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래법)
· 접속에 관한 기록: 3개월 (통신비밀보호법)

4. 개인정보의 제3자 제공

회사는 원칙적으로 회원의 개인정보를 외부에 제공하지 않습니다. 다만, 아래의 경우는 예외로 합니다.
· 회원이 사전에 동의한 경우
· 법령에 의해 요구되는 경우

5. 개인정보 처리 위탁

회사는 원활한 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁합니다.
· 결제 처리: (주)포트원 (결제 처리 목적, 계약 종료 시까지)

6. 이용자의 권리

회원은 언제든지 본인의 개인정보에 대해 열람, 수정, 삭제, 처리 정지를 요청할 수 있습니다. 해당 요청은 마이페이지 또는 고객센터를 통해 처리됩니다.

7. 개인정보 보호책임자

- 성명: 정지윤 (대표)
- 이메일: jjy@aimcoltd.com
- 전화: 0507-1377-6302

개인정보 관련 문의사항은 위 연락처 또는 마이페이지를 통해 처리됩니다.

※ 위 사항에 동의하지 않으실 경우 서비스 이용이 제한될 수 있습니다.`,
  },
  marketing: {
    title: "마케팅 정보 수신 동의",
    body: `이끌림 필라테스는 더 나은 서비스와 혜택을 제공하기 위해 아래와 같이 마케팅 정보를 발송합니다.

1. 수신 정보 유형

· 신규 강의 출시 및 업데이트 안내
· 할인 이벤트, 프로모션, 쿠폰 및 혜택 정보
· 회원 전용 이벤트 및 설문 참여 안내
· 서비스 관련 뉴스레터

2. 발송 채널

· 이메일

3. 수신 동의 철회

마케팅 수신 동의는 언제든지 철회하실 수 있습니다.
· 마이페이지 > 마케팅 정보 수신 동의에서 직접 변경

4. 유의사항

· 마케팅 수신 동의는 선택사항으로, 동의하지 않아도 서비스 이용에 불이익이 없습니다.
· 마케팅 수신에 동의하신 경우 관련 법령에 따라 동의 사실이 보관됩니다.`,
  },
};

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
      alert("인증번호가 발송되었습니다. 이메일을 확인해 주세요.");
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
    <div className="site-shell">
      <SiteHeader subpage />

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
      <main className="auth-page">
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
      </main>
    </div>
  );
}

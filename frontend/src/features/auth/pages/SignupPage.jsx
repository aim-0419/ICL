import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

export function SignupPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    phone: "",
  });
  const [agreements, setAgreements] = useState({
    service: false,
    privacy: false,
    age: false,
    marketing: false,
  });

  const allAgree = Object.values(agreements).every(Boolean);
  const requiredAgree = agreements.service && agreements.privacy && agreements.age;

  const canSubmit =
    form.name.trim() &&
    form.email.trim() &&
    form.phone.trim() &&
    form.password.trim() &&
    form.passwordConfirm.trim() &&
    form.password === form.passwordConfirm &&
    requiredAgree;

  function toggleAgreement(key) {
    setAgreements((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleAllAgreement() {
    const next = !allAgree;
    setAgreements({
      service: next,
      privacy: next,
      age: next,
      marketing: next,
    });
  }

  function handleViewDetail() {
    alert("약관 상세 내용은 다음 단계에서 연결 예정입니다.");
  }

  function handleSubmit(event) {
    event.preventDefault();

    try {
      if (!requiredAgree) {
        alert("필수 약관에 동의해주세요.");
        return;
      }

      if (form.password !== form.passwordConfirm) {
        alert("비밀번호 확인이 일치하지 않습니다.");
        return;
      }

      store.signupUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        phone: form.phone.trim(),
      });
      alert("회원가입이 완료되었습니다.");
      navigate("/mypage");
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="auth-page">
        <section className="auth-card signup-auth-card">
          <p className="section-kicker">Create Account</p>
          <h1>회원가입</h1>
          <p className="section-text">
            회원가입 후 교육 영상 구매와 수강 이력을 관리할 수 있습니다.
          </p>
          <div className="signup-coupon-box">
            <strong>신규 회원 웰컴 혜택 진행 중</strong>
            <p>10초만에 가입하고 다양한 혜택을 받아보세요.</p>
          </div>

          <form className="auth-form signup-form-shell" onSubmit={handleSubmit}>
            <label>
              이름
              <input
                type="text"
                placeholder="한글로 공백 없이 입력해주세요."
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
                  placeholder="실제 사용하는 이메일 주소"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
                <button className="field-inline-button" type="button" onClick={handleViewDetail}>
                  인증메일 발송
                </button>
              </div>
            </div>

            <label>
              휴대폰 번호 (숫자만)
              <input
                type="tel"
                required
                placeholder="- 없이 숫자만 입력해주세요."
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
              비밀번호
              <input
                type="password"
                required
                placeholder="비밀번호를 입력해주세요."
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>

            <label>
              비밀번호 확인
              <input
                type="password"
                required
                placeholder="비밀번호를 다시 입력해주세요."
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
                  <button type="button" className="agreement-view-btn" onClick={handleViewDetail}>
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
                  <button type="button" className="agreement-view-btn" onClick={handleViewDetail}>
                    보기
                  </button>
                </div>
                <div className="agreement-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={agreements.age}
                      onChange={() => toggleAgreement("age")}
                    />
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
                    <span>마케팅 수신 동의 (선택)</span>
                  </label>
                  <button type="button" className="agreement-view-btn" onClick={handleViewDetail}>
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

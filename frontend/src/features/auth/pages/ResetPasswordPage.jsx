/**
 * [비밀번호 재설정 페이지]
 * 아이디와 이메일을 입력하면 재설정 링크를 이메일로 전송합니다.
 * URL에 포함된 토큰(token)이 있으면 새 비밀번호 입력 단계로 전환됩니다.
 * - 1단계: 아이디·이메일 입력 → 재설정 메일 발송
 * - 2단계: 새 비밀번호 입력 → 비밀번호 변경 완료
 */
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

// 컴포넌트 역할: 회원 비밀번호 재설정 흐름을 처리하는 페이지 컴포넌트입니다.
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [step, setStep] = useState("request");
  const [form, setForm] = useState({
    loginId: "",
    email: "",
    code: "",
    newPassword: "",
    newPasswordConfirm: "",
  });
  const [isRequesting, setIsRequesting] = useState(false);

  function handleChange(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleRequestCode(event) {
    event.preventDefault();
    if (!form.loginId.trim() || !form.email.trim()) {
      alert("아이디와 이메일을 입력해 주세요.");
      return;
    }
    setIsRequesting(true);
    try {
      await store.requestPasswordResetEmailVerification({
        loginId: form.loginId.trim(),
        email: form.email.trim(),
      });
      alert("인증번호가 이메일로 발송되었습니다. 5분 안에 입력해 주세요.");
      setStep("reset");
    } catch (error) {
      alert(error.message);
    } finally {
      setIsRequesting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (form.newPassword.trim() !== form.newPasswordConfirm.trim()) {
      alert("새 비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    try {
      await store.resetUserPassword({
        loginId: form.loginId.trim(),
        email: form.email.trim(),
        code: form.code.trim(),
        newPassword: form.newPassword.trim(),
      });
      alert("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.");
      navigate("/login");
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="auth-page">
        <section className="auth-card">
          <p className="section-kicker">비밀번호 재설정</p>
          <h1>비밀번호 찾기</h1>

          {step === "request" ? (
            <>
              <p className="section-text">아이디와 가입 이메일을 입력하면 인증번호를 보내드립니다.</p>
              <form className="auth-form" onSubmit={handleRequestCode}>
                <label>
                  아이디
                  <input
                    type="text"
                    required
                    value={form.loginId}
                    onChange={handleChange("loginId")}
                  />
                </label>
                <label>
                  가입 이메일
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={handleChange("email")}
                  />
                </label>
                <button className="pill-button full" type="submit" disabled={isRequesting}>
                  {isRequesting ? "발송 중…" : "인증번호 받기"}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="section-text">
                <strong>{form.email}</strong>로 발송된 인증번호와 새 비밀번호를 입력해 주세요.
              </p>
              <form className="auth-form" onSubmit={handleSubmit}>
                <label>
                  인증번호
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={form.code}
                    onChange={handleChange("code")}
                    placeholder="6자리 숫자"
                  />
                </label>
                <label>
                  새 비밀번호
                  <input
                    type="password"
                    required
                    value={form.newPassword}
                    onChange={handleChange("newPassword")}
                  />
                </label>
                <label>
                  새 비밀번호 확인
                  <input
                    type="password"
                    required
                    value={form.newPasswordConfirm}
                    onChange={handleChange("newPasswordConfirm")}
                  />
                </label>
                <button className="pill-button full" type="submit">
                  비밀번호 변경
                </button>
                <button
                  type="button"
                  className="pill-button full"
                  style={{ marginTop: "0.5rem", background: "transparent", border: "1px solid currentColor" }}
                  onClick={() => setStep("request")}
                >
                  인증번호 다시 받기
                </button>
              </form>
            </>
          )}

          <div className="auth-sub-links">
            <Link to="/login">로그인</Link>
            <span aria-hidden="true">|</span>
            <Link to="/find-id">아이디 찾기</Link>
          </div>
        </section>
      </main>
    </div>
  );
}

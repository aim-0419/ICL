// 파일 역할: 회원 비밀번호 재설정 흐름을 처리하는 페이지 컴포넌트입니다.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

// 컴포넌트 역할: 회원 비밀번호 재설정 흐름을 처리하는 페이지 컴포넌트입니다.
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [form, setForm] = useState({
    loginId: "",
    name: "",
    phone: "",
    newPassword: "",
    newPasswordConfirm: "",
  });

  async function handleSubmit(event) {
    event.preventDefault();

    if (form.newPassword.trim() !== form.newPasswordConfirm.trim()) {
      alert("새 비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    try {
      await store.resetUserPassword({
        loginId: form.loginId.trim(),
        name: form.name.trim(),
        phone: form.phone.trim(),
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
          <p className="section-text">아이디, 이름, 휴대폰 번호를 확인한 뒤 새 비밀번호를 설정합니다.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              아이디
              <input
                type="text"
                required
                value={form.loginId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, loginId: event.target.value }))
                }
              />
            </label>
            <label>
              이름
              <input
                type="text"
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              휴대폰 번호 (숫자만)
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "") }))
                }
              />
            </label>
            <label>
              새 비밀번호
              <input
                type="password"
                required
                value={form.newPassword}
                onChange={(event) =>
                  setForm((current) => ({ ...current, newPassword: event.target.value }))
                }
              />
            </label>
            <label>
              새 비밀번호 확인
              <input
                type="password"
                required
                value={form.newPasswordConfirm}
                onChange={(event) =>
                  setForm((current) => ({ ...current, newPasswordConfirm: event.target.value }))
                }
              />
            </label>
            <button className="pill-button full" type="submit">
              비밀번호 변경
            </button>
          </form>
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

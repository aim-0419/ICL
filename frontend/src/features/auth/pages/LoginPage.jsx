import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

export function LoginPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [form, setForm] = useState({ loginId: "", password: "" });

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      await store.loginUser(form.loginId.trim(), form.password.trim());
      navigate("/");
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="auth-page">
        <section className="auth-card">
          <p className="section-kicker">로그인</p>
          <h1 className="login-title">몸이 바뀌는 방향, 이끌림에서 시작됩니다</h1>
          <p className="section-text">
            {store.currentUser
              ? `${store.currentUser.name} 님으로 이용 중입니다.`
              : "로그인 후 수강 내역을 관리할 수 있습니다."}
          </p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              아이디
              <input
                type="text"
                required
                autoComplete="username"
                value={form.loginId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, loginId: event.target.value }))
                }
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                required
                autoComplete="current-password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>
            <button className="pill-button full" type="submit">
              로그인
            </button>
          </form>
          <div className="auth-sub-links">
            <Link to="/find-id">아이디 찾기</Link>
            <span aria-hidden="true">|</span>
            <Link to="/reset-password">비밀번호 찾기</Link>
          </div>
          <p className="section-text login-signup-cta">
            아직 계정이 없으신가요?
            <Link className="login-signup-link" to="/signup">
              회원가입
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}

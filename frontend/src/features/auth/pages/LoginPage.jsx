import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const store = useAppStore();
  const [form, setForm] = useState({ email: "", password: "" });

  function handleSubmit(event) {
    event.preventDefault();

    try {
      store.loginUser(form.email.trim(), form.password.trim());
      alert("로그인되었습니다.");
      navigate(location.state?.from || "/mypage");
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="auth-page">
        <section className="auth-card">
          <p className="section-kicker">Member Login</p>
          <h1 className="login-title">몸이 바뀌는 방향, 이끌림에서 시작됩니다</h1>
          <p className="section-text">
            {store.currentUser
              ? `${store.currentUser.name} 님으로 이용 중입니다.`
              : "로그인 후 수강 내역을 관리할 수 있습니다."}
          </p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              이메일
              <input
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                required
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
          <p className="section-text">
            아직 계정이 없으신가요? <Link to="/signup">회원가입</Link>
          </p>
        </section>
      </main>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

export function FindIdPage() {
  const store = useAppStore();
  const [form, setForm] = useState({ name: "", phone: "" });
  const [resultId, setResultId] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      const loginId = await store.findUserLoginId(form.name.trim(), form.phone.trim());
      setResultId(loginId);
    } catch (error) {
      alert(error.message);
      setResultId("");
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="auth-page">
        <section className="auth-card">
          <p className="section-kicker">Find ID</p>
          <h1>아이디 찾기</h1>
          <p className="section-text">이름과 휴대폰 번호를 입력하면 가입된 아이디를 확인할 수 있습니다.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
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
            <button className="pill-button full" type="submit">
              아이디 확인
            </button>
          </form>
          {resultId ? (
            <div className="auth-result-box">
              <strong>조회된 아이디</strong>
              <p>{resultId}</p>
            </div>
          ) : null}
          <div className="auth-sub-links">
            <Link to="/login">로그인</Link>
            <span aria-hidden="true">|</span>
            <Link to="/reset-password">비밀번호 찾기</Link>
          </div>
        </section>
      </main>
    </div>
  );
}

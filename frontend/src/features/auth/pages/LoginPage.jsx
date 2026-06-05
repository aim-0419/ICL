/**
 * [로그인 페이지]
 *
 * 아이디(loginId)와 비밀번호를 입력받아 로그인을 처리합니다.
 * - 로그인 성공 시 이전 페이지 또는 홈으로 이동합니다
 * - 이미 로그인된 상태라면 홈으로 리다이렉트합니다
 * - 아이디 찾기(/auth/find-id), 비밀번호 재설정(/auth/reset-password) 링크도 제공합니다
 */
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

// 컴포넌트 역할: 회원 로그인을 처리하고 로그인 후 이동을 담당하는 페이지 컴포넌트입니다.
export function LoginPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [form, setForm] = useState({ loginId: "", password: "" });
  const currentUserDisplayName = getUserDisplayName(store.currentUser);

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
              ? `${currentUserDisplayName} 님으로 이용 중입니다.`
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

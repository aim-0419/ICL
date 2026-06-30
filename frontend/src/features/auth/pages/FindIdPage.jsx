/**
 * [아이디 찾기 페이지]
 * 가입 시 등록한 이름과 이메일로 아이디(loginId)를 조회합니다.
 * 찾은 아이디는 화면에 표시되며, 로그인 페이지로 바로 이동할 수 있습니다.
 */
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { PageLayout } from "../../../shared/components/PageLayout.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

// 컴포넌트 역할: 휴대폰 정보로 가입 아이디를 찾는 페이지 컴포넌트입니다.
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
    <PageLayout subpage mainClass="auth-page">
        <section className="auth-card">
          <p className="section-kicker">아이디 찾기</p>
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
    </PageLayout>
  );
}

/**
 * [약관·개인정보 전문 페이지]
 *
 * 회원가입 모달과 동일한 원문을 고정 URL로 보여줍니다.
 * 스토어 심사와 앱 안에서의 법적 고지는 모달이 아니라 접근 가능한 URL을 요구하므로
 * /terms, /privacy 경로로 직접 열 수 있어야 합니다.
 */
import React, { useEffect } from "react";
import { PageLayout } from "../components/PageLayout.jsx";
import { TERMS_CONTENT } from "./termsContent.jsx";

export function LegalPage({ docKey }) {
  const doc = TERMS_CONTENT[docKey];

  useEffect(() => {
    // 전문 페이지는 항상 맨 위에서 시작해야 읽기 흐름이 끊기지 않습니다.
    window.scrollTo({ top: 0 });
  }, [docKey]);

  if (!doc) {
    return (
      <PageLayout subpage mainClass="content-page legal-page">
        <section className="legal-page-inner">
          <h1>문서를 찾을 수 없습니다</h1>
          <p>주소를 다시 확인해 주세요.</p>
        </section>
      </PageLayout>
    );
  }

  // service 항목은 일반 문자열이라 줄바꿈을 그대로 살려야 합니다. 나머지는 JSX 본문입니다.
  const body =
    typeof doc.body === "string" ? <div className="legal-page-text">{doc.body}</div> : doc.body;

  return (
    <PageLayout subpage mainClass="content-page legal-page">
      <section className="legal-page-inner">
        <h1>{doc.title}</h1>
        <div className="legal-page-body">{body}</div>
      </section>
    </PageLayout>
  );
}

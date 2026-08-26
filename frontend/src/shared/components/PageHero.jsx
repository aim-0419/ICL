/**
 * [페이지 상단 제목 영역]
 *
 * 각 페이지 맨 위에 큰 제목과 짧은 설명을 보여 주는 공통 부분입니다.
 */
import React from "react";

export function PageHero({ kicker, title, description, children }) {
  return (
    <section className="content-hero">
      {kicker && <p className="section-kicker">{kicker}</p>}
      <h1>{title}</h1>
      {description && <p className="section-text">{description}</p>}
      {children}
    </section>
  );
}

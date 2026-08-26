/**
 * [페이지 공통 뼈대]
 *
 * 일반 페이지들이 공통으로 쓰는 바깥 틀입니다.
 * 위쪽 머리말과 본문 자리를 잡아 주어 페이지마다 같은 구조를 유지합니다.
 */
import React from "react";
import { SiteHeader } from "./SiteHeader.jsx";

export function PageLayout({ children, subpage = false, mainClass = "content-page" }) {
  return (
    <div className="site-shell">
      <SiteHeader subpage={subpage} />
      <main className={mainClass}>
        {children}
      </main>
    </div>
  );
}

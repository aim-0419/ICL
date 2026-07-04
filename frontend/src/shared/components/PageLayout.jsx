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

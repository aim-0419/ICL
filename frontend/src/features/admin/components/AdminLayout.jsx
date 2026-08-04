import React from "react";
import { AdminSidebar } from "./AdminSidebar.jsx";
import { AdminTopbar } from "./AdminTopbar.jsx";
import "./AdminStudioTheme.css";

export function AdminLayout({ children, appClass, ...topbarProps }) {
  return (
    <div className="icl-admin-shell">
      <AdminSidebar />
      <div className="icl-admin-workspace">
        <AdminTopbar {...topbarProps} />
        <div className={`icl-admin-page-content${appClass ? ` ${appClass}` : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

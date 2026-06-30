import React from "react";
import { AdminTopbar } from "./AdminTopbar.jsx";

export function AdminLayout({ children, appClass, ...topbarProps }) {
  return (
    <div className={appClass}>
      <AdminTopbar {...topbarProps} />
      {children}
    </div>
  );
}

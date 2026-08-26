/**
 * [관리자 화면 공통 뼈대]
 *
 * 관리자 화면들이 공통으로 쓰는 바깥 틀입니다.
 * 왼쪽 메뉴, 위쪽 막대, 가운데 본문 자리를 잡아 주어서
 * 어느 관리자 화면에 들어가도 같은 위치에 같은 메뉴가 보이게 합니다.
 */
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

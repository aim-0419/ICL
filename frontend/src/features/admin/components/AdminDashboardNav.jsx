/**
 * [관리자 대시보드 안쪽 탭 메뉴]
 *
 * 관리자 대시보드 안에서 회원, 주문, 매출처럼 보고 싶은 항목을 골라 넘나드는 탭 줄입니다.
 */
import React from "react";
import { Link } from "react-router-dom";

export function AdminDashboardNav({ active }) {
  const links = [
    { key: "members",  label: "회원 관리",      to: "/admin" },
    { key: "products", label: "상품 관리",      to: "/admin/products" },
    { key: "refunds",  label: "환불 관리",      to: "/admin/refunds" },
    { key: "sales",    label: "매출 대시보드",  to: "/admin/sales" },
    { key: "gifts",    label: "선물 관리",      to: "/admin/video-gifts" },
  ];
  return (
    <section className="admin-dashboard-switch">
      {links.map(({ key, label, to }) => (
        <Link
          key={key}
          className={`admin-dashboard-switch-link${active === key ? " active" : ""}`}
          to={to}
        >
          {label}
        </Link>
      ))}
      <Link className="admin-dashboard-switch-link admin-dashboard-switch-studio" to="/admin/studio">
        🏃 필라테스 관리
      </Link>
    </section>
  );
}

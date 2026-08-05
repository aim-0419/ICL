import React, { useMemo } from "react";
import {
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  GraduationCap,
  MessageSquareText,
  Settings,
  TicketCheck,
  UserRoundCog,
  Users,
  Workflow,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const NAV_GROUPS = [
  {
    label: "스튜디오 관리",
    items: [
      { label: "일정", path: "/admin/studio", icon: CalendarDays },
      { label: "수업", path: "/admin/classes", icon: ClipboardList },
      { label: "회원", path: "/admin/member-list", icon: Users },
      { label: "강사", path: "/admin/instructors", icon: UserRoundCog },
      { label: "수강권", path: "/admin/passes", icon: TicketCheck },
      { label: "운영 관리", path: "/admin/operations", icon: Workflow },
      { label: "매출", path: "/admin/studio/sales", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "소통 및 설정",
    items: [
      { label: "메시지", path: "/admin/messages", icon: MessageSquareText },
      { label: "게시판", path: "/admin/board", icon: ClipboardList },
      { label: "설정", path: "/admin/settings", icon: Settings },
    ],
  },
];

const FLAT_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export function AdminSidebar() {
  const { pathname } = useLocation();

  const activePath = useMemo(
    () =>
      [...FLAT_NAV_ITEMS]
        .sort((a, b) => b.path.length - a.path.length)
        .find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
        ?.path,
    [pathname],
  );

  return (
    <aside className="icl-admin-sidebar" aria-label="필라테스 관리자 메뉴">
      <Link className="icl-admin-sidebar-brand" to="/admin/studio" aria-label="이끌림 필라테스 일정">
        <span className="icl-admin-sidebar-mark" aria-hidden="true">ICL</span>
        <span className="icl-admin-sidebar-brand-copy">
          <strong>이끌림 필라테스</strong>
          <small>Studio Admin</small>
        </span>
      </Link>

      <nav className="icl-admin-sidebar-nav">
        {NAV_GROUPS.map((group) => (
          <section className="icl-admin-sidebar-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = activePath === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={active ? "active" : ""}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                >
                  <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </section>
        ))}
      </nav>

      <div className="icl-admin-sidebar-footer">
        <Link to="/admin" title="교육 관리">
          <GraduationCap aria-hidden="true" size={19} strokeWidth={1.8} />
          <span>
            <strong>교육 관리</strong>
            <small>홈페이지 관리자</small>
          </span>
        </Link>
      </div>
    </aside>
  );
}

// 파일 역할: BrandPages 화면의 UI, 상태, API 연동 흐름을 담당합니다.
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageLayout } from "../../../shared/components/PageLayout.jsx";
import { PageHero } from "../../../shared/components/PageHero.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { useSeoMeta } from "../../../shared/hooks/useSeoMeta.js";
import { canEditPage } from "../../../shared/auth/userRoles.js";

// 컴포넌트 역할: BrandPageLayout 컴포넌트의 화면 구조와 상호작용 상태를 렌더링합니다.
function BrandPageLayout({ kicker, title, description, points }) {
  return (
    <PageLayout>
      <PageHero kicker={kicker} title={title} description={description} />
      <section className="content-grid">
        {points.map((point) => (
          <article className="content-card" key={point.title}>
            <h3>{point.title}</h3>
            <p>{point.description}</p>
          </article>
        ))}
      </section>
    </PageLayout>
  );
}

const INTRO_CLASS_TYPES = [
  {
    id: "private",
    badge: "1:1 PRIVATE",
    title: "1대1 개인 수업",
    desc: "개인의 체형과 목표에 맞게 설계된 수업으로 집중적인 케어로 빠른 변화를 경험하세요.",
    points: ["체형 교정 & 통증 개선", "체형 & 컨디셔닝", "운동 수행 능력 향상"],
  },
  {
    id: "duet",
    badge: "DUET",
    title: "듀엣 (2인) 수업",
    desc: "친구, 가족과 함께 받을 수 있는 프리미엄 수업으로 서로 동기 부여하며 빠른 변화를 느껴보세요.",
    points: ["2인 맞춤 프로그램", "함께하는 즐거움", "합리적인 수강료"],
  },
  {
    id: "group",
    badge: "GROUP",
    title: "그룹 (3~5인) 수업",
    desc: "소규모 그룹으로 진행되어 세밀한 케어와 함께 건강한 습관을 만들어갑니다.",
    points: ["3~5인 소규모 그룹", "체계적인 그룹 프로그램", "꾸준한 운동 습관 형성"],
  },
];

const INTRO_PROCESS_STEPS = [
  {
    title: "상담 문의",
    desc: "카카오톡, 전화, 또는 방문을 통해 상담을 신청합니다.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: "체형 분석",
    desc: "체형, 움직임, 근육 밸런스를 정밀하게 분석합니다.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="4" rx="1" /><path d="M9 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3" /><path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    title: "수업 설계",
    desc: "분석 결과를 바탕으로 개인에게 맞춘 맞춤 프로그램을 설계합니다.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    title: "수업 시작",
    desc: "설계된 프로그램으로 안전하고 효과적인 수업을 시작합니다.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13" cy="5" r="1.5" /><path d="M9 20l2-5 2 3 2-7 3 4" /><path d="M6 12c1-2 3-3 5-2" />
      </svg>
    ),
  },
];

// 컴포넌트 역할: BrandIntroPage 화면을 렌더링하고 필요한 API 호출과 사용자 입력 상태를 관리합니다.
export function BrandIntroPage() {
  useSeoMeta({
    title: "수업 소개",
    description: "이끌림 필라테스 수업 소개. 원장 직강, 1대1 개인·듀엣·그룹 수업 안내.",
  });
  const [instructors, setInstructors] = useState(DEFAULT_INSTRUCTORS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("icl_admin_image_overrides_v1");
      if (!raw) return;
      const overrides = JSON.parse(raw);
      const cleaned = Object.fromEntries(
        Object.entries(overrides).filter(([, val]) => !String(val).startsWith("blob:"))
      );
      localStorage.setItem("icl_admin_image_overrides_v1", JSON.stringify(cleaned));
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/brand/instructors", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const rows = Array.isArray(data?.instructors) ? data.instructors : Array.isArray(data) ? data : null;
        if (rows?.length) setInstructors(rows);
      })
      .catch(() => {});
  }, []);

  return (
    <PageLayout mainClass="intro-v2-page">

        {/* 히어로 */}
        <section className="intro-v2-hero">
          <img
            className="intro-v2-hero-img"
            src="/assets/images/intro/intro-main.png"
            alt="수업 소개 메인 이미지"
          />
          <div className="intro-v2-hero-copy">
            <h1>
              몸을 이해하는 수업,<br />
              이끌림이 직접 설계합니다
            </h1>
            <p className="intro-v2-kicker">광주 프리미엄 필라테스 스튜디오</p>
            <p className="intro-v2-hero-sub">원장이 직접 강의하고, 전문 강사진이 함께합니다.</p>
          </div>
        </section>

        {/* 원장 직강 */}
        <section className="intro-v2-director-section">
          <div className="intro-v2-director-card">
            <div
              className="intro-v2-director-photo"
              role="img"
              aria-label="원장 사진"
              data-admin-edit-key="/ikleulrim/intro::director-photo"
            />
            <div className="intro-v2-director-copy">
              <p className="intro-v2-eyebrow">이끌림은 다릅니다</p>
              <h2>원장이 직접 강의합니다</h2>
              <p className="intro-v2-director-desc">
                단순한 동작이 아닌, 내 몸을 정밀히 이해하고<br />
                근본적인 변화를 만드는 수업을 제공합니다.
              </p>
              <ul className="intro-v2-feature-list">
                <li>
                  <span className="intro-v2-feature-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </span>
                  <div>
                    <strong>체형 분석 기반 맞춤 수업</strong>
                    <span>체형, 움직임, 근육 밸런스를 정밀 분석하여 개인에게 최적화된 수업을 설계합니다.</span>
                  </div>
                </li>
                <li>
                  <span className="intro-v2-feature-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                  </span>
                  <div>
                    <strong>재활 &amp; 기능 회복 특화</strong>
                    <span>재활 전문 지식을 바탕으로 통증 완화와 기능 회복을 돕는 안전한 수업을 진행합니다.</span>
                  </div>
                </li>
                <li>
                  <span className="intro-v2-feature-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </span>
                  <div>
                    <strong>지속 가능한 아름다운 변화</strong>
                    <span>올바른 정렬과 균형 잡힌 움직임으로 건강하고 아름다운 변화를 만들어갑니다.</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* 수업 유형 */}
        <section className="intro-v2-classes-section">
          <div className="intro-v2-section-head">
            <h2>나에게 맞는 수업을 선택하세요</h2>
            <p>개인의 목표와 상황에 맞춰 다양한 수업을 제공합니다.</p>
          </div>
          <div className="intro-v2-class-grid">
            {INTRO_CLASS_TYPES.map((cls) => (
              <article className="intro-v2-class-card" key={cls.id}>
                <div className="intro-v2-class-body">
                  <span className="intro-v2-class-badge">{cls.badge}</span>
                  <h3>{cls.title}</h3>
                  <p>{cls.desc}</p>
                  <ul>
                    {cls.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
          <p className="intro-v2-classes-note">※ 모든 수업은 100% 예약제로 운영됩니다.</p>
        </section>

        {/* 프로세스 */}
        <section className="intro-v2-process-section">
          <div className="intro-v2-section-head">
            <h2>수업 신청 프로세스</h2>
            <p>체계적인 과정을 통해 최적의 수업을 경험하세요.</p>
          </div>
          <div className="intro-v2-process-steps">
            {INTRO_PROCESS_STEPS.map((s, i) => (
              <React.Fragment key={s.title}>
                <div className="intro-v2-step">
                  <div className="intro-v2-step-icon">{s.icon}</div>
                  <strong>{s.title}</strong>
                  <p>{s.desc}</p>
                </div>
                {i < INTRO_PROCESS_STEPS.length - 1 && (
                  <span className="intro-v2-step-arrow" aria-hidden="true">→</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </section>

        {/* 강사진 */}
        <section className="intro-v2-instructors-section">
          <div className="intro-v2-section-head">
            <h2>전문성과 진심을 갖춘 강사진</h2>
            <p>이끌림 필라테스는 체형 분석, 재활 운동, 움직임 교육 경험을 갖춘<br />전문 강사진이 함께합니다.</p>
          </div>
          <div className="intro-v2-instructor-features">
            <div className="intro-v2-instructor-feature">
              <div className="intro-v2-instructor-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <strong>원장 직강</strong>
              <p>원장이 직접 설계하고 지도합니다.</p>
            </div>
            <div className="intro-v2-instructor-feature">
              <div className="intro-v2-instructor-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2c0 0-4 4-4 9s4 9 4 9 4-4 4-9-4-9-4-9z"/><path d="M12 8v8M9 11h6M9 14h6"/>
                </svg>
              </div>
              <strong>재활 특화</strong>
              <p>재활 &amp; 기능 회복에 특화된 수업</p>
            </div>
            <div className="intro-v2-instructor-feature">
              <div className="intro-v2-instructor-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a5 5 0 0 1 0 10A5 5 0 0 1 12 2z"/><path d="M6 21c0-3.314 2.686-6 6-6s6 2.686 6 6"/><line x1="12" y1="12" x2="12" y2="15"/>
                </svg>
              </div>
              <strong>체형 분석</strong>
              <p>과학적 분석을 기반으로 한 맞춤 설계</p>
            </div>
          </div>
          <div className="intro-v2-instructor-cta">
            <div className="intro-v2-instructor-cta-copy">
              <strong>좋은 수업은 좋은 강사로부터 시작됩니다.</strong>
              <p>이끌림 필라테스의 강사진을 더 자세히 만나보세요.</p>
            </div>
            <Link className="intro-v2-instructor-cta-btn" to="/ikleulrim/instructors">
              강사진 소개 보기 →
            </Link>
          </div>
        </section>

        {/* CTA */}
        <section className="intro-v2-cta-section">
          <img src="/assets/images/이끌림로고.png" alt="ICL Pilates" className="intro-v2-cta-logo" />
          <div className="intro-v2-cta-copy">
            <h2>수업이 궁금하신가요?</h2>
            <p>상담을 통해 나에게 맞는 수업을 찾아보세요.</p>
          </div>
          <Link className="intro-v2-cta-button" to="/community/inquiry">
            상담 문의하기 →
          </Link>
        </section>

    </PageLayout>
  );
}
const DEFAULT_INSTRUCTORS = [
  {
    name: "대표 강사 소개",
    role: "대표원장 · Master Instructor",
    intro:
      "움직임의 원리를 회원의 몸에 맞게 적용하는 수업을 지향합니다. 정확한 기본기와 섬세한 큐잉으로 변화의 방향을 설계합니다.",
    careers: [
      "이끌림 필라테스 대표원장",
      "국내외 필라테스 지도자 과정 이수",
      "재활/체형교정 기반 개인 레슨 운영",
    ],
  },
  {
    name: "전문 강사팀",
    role: "프로페셔널 티칭 팀",
    intro:
      "이끌림 강사진은 수업 전후 회원 상태를 꼼꼼히 체크하고, 개인 목표에 맞는 프로그램을 유연하게 조정합니다.",
    careers: [
      "기구/매트 통합 수업 운영",
      "회원별 컨디션 기록 및 단계별 피드백",
      "정기 티칭 트레이닝 진행",
    ],
  },
  {
    name: "케어 & 코칭 팀",
    role: "멤버 케어 팀",
    intro:
      "첫 상담부터 루틴 정착까지 끝까지 동행합니다. 수업 만족도와 지속 관리 품질을 높이는 커뮤니케이션을 담당합니다.",
    careers: [
      "상담/예약/수강 관리 프로세스 운영",
      "회원별 목표 기반 수강 플랜 제안",
      "수강 후 피드백 및 루틴 코칭",
    ],
  },
];

// 컴포넌트 역할: BrandInstructorsPage 화면을 렌더링하고 필요한 API 호출과 사용자 입력 상태를 관리합니다.
export function BrandInstructorsPage() {
  const store = useAppStore();
  const isAdmin = canEditPage(store?.currentUser);
  const isPageEditMode = Boolean(store?.adminPageEditMode);
  const [instructors, setInstructors] = useState(DEFAULT_INSTRUCTORS);
  const [deletingInstructorKey, setDeletingInstructorKey] = useState("");

  useEffect(() => {
    fetch("/api/brand/instructors", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const rows = Array.isArray(data?.instructors) ? data.instructors : Array.isArray(data) ? data : null;
        if (rows && rows.length > 0) setInstructors(rows);
      })
      .catch(() => {});
  }, []);

  async function handleAddInstructor() {
    const newCard = {
      name: "강사 이름",
      role: "",
      intro: "강사 소개 내용을 입력하세요.",
      careers: ["경력 1", "경력 2"],
    };
    try {
      const res = await fetch("/api/brand/instructors", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCard),
      });
      const data = res.ok ? await res.json() : null;
      setInstructors((prev) => [...prev, { ...newCard, id: data?.id || String(Date.now()) }]);
    } catch {
      setInstructors((prev) => [...prev, { ...newCard, id: String(Date.now()) }]);
    }
  }

  async function handleRemoveInstructor(item, index) {
    if (!isAdmin || !isPageEditMode) return;

    const confirmed = window.confirm("해당 강사 카드를 삭제하시겠습니까?");
    if (!confirmed) return;

    const cardKey = String(item?.id || `${item?.name || "instructor"}-${index}`);
    const id = String(item?.id || "").trim();
    if (!id) {
      setInstructors((prev) => prev.filter((_, idx) => idx !== index));
      return;
    }

    setDeletingInstructorKey(cardKey);
    try {
      const res = await fetch(`/api/brand/instructors/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "강사 카드 삭제에 실패했습니다.");
      }
      setInstructors((prev) => prev.filter((_, idx) => idx !== index));
    } catch (error) {
      window.alert(error?.message || "강사 카드 삭제에 실패했습니다.");
    } finally {
      setDeletingInstructorKey("");
    }
  }

  return (
    <PageLayout>
        <section className="content-hero">
          <p className="section-kicker">이끌림 · 강사진</p>
          <h1>강사 소개</h1>
          <p className="section-text">
            경력과 전문성, 그리고 코칭 철학을 바탕으로 구성된 강사진을 안내합니다.
          </p>
        </section>

        <section className="staff-split-list">
          {instructors.map((item, index) => {
            const cardKey = String(item.id || `${item.name || "instructor"}-${index}`);
            return (
            <article
              className={`staff-split${index % 2 === 1 ? " reverse" : ""}`}
              key={cardKey}
            >
              {isAdmin && isPageEditMode && (
                <button
                  type="button"
                  className="staff-card-delete-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemoveInstructor(item, index);
                  }}
                  disabled={deletingInstructorKey === cardKey}
                >
                  {deletingInstructorKey === cardKey ? "삭제 중..." : "삭제"}
                </button>
              )}
              <div className="staff-image-slot"><span>비어있는 이미지 {index + 1}</span></div>
              <div
                className="staff-text-panel"
                data-admin-text-group
                data-admin-edit-key={`/ikleulrim/instructors::staff-card:${index + 1}:content`}
              >
                <h3>{item.name}</h3>
                <p>{item.intro}</p>
                <ul className="staff-career-list">
                  {item.careers.map((career) => (
                    <li key={career}>{career}</li>
                  ))}
                </ul>
              </div>
            </article>
            );
          })}
        </section>

        {isAdmin && isPageEditMode && (
          <button type="button" className="instructor-add-button" onClick={handleAddInstructor}>
            강사 카드 추가
          </button>
        )}
    </PageLayout>
  );
}


const EQUIPMENT_STORAGE_KEY = "icl_equipment_items_v1";

const DEFAULT_EQUIPMENT_ITEMS = Array.from({ length: 4 }, (_, index) => ({
  id: `equipment-slot-${index + 1}`,
  name: "비어있는 장비명",
  tags: "비어있는 태그",
}));

function loadEquipmentItems() {
  try {
    const raw = localStorage.getItem(EQUIPMENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_EQUIPMENT_ITEMS;
}

function saveEquipmentItems(items) {
  try {
    localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

// 컴포넌트 역할: BrandEquipmentPage 화면을 렌더링하고 필요한 API 호출과 사용자 입력 상태를 관리합니다.
export function BrandEquipmentPage() {
  const store = useAppStore();
  const isAdmin = canEditPage(store?.currentUser);
  const isPageEditMode = Boolean(store?.adminPageEditMode);
  const [equipmentItems, setEquipmentItems] = useState(loadEquipmentItems);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("icl_admin_size_overrides_v1");
      if (!raw) return;
      const overrides = JSON.parse(raw);
      const PREFIX = "/ikleulrim/equipment::";
      const cleaned = Object.fromEntries(
        Object.entries(overrides).filter(([key]) => {
          if (!key.startsWith(PREFIX)) return true;
          const suffix = key.slice(PREFIX.length);
          return !suffix.includes(">");
        })
      );
      localStorage.setItem("icl_admin_size_overrides_v1", JSON.stringify(cleaned));
    } catch {}
  }, []);

  async function handleAddEquipment() {
    const newItem = {
      id: String(Date.now()),
      name: "비어있는 장비명",
      tags: "비어있는 태그",
    };
    setEquipmentItems((prev) => {
      const next = [...prev, newItem];
      saveEquipmentItems(next);
      return next;
    });
  }

  async function handleRemoveEquipment(item, index) {
    if (!isAdmin || !isPageEditMode) return;
    const confirmed = window.confirm("해당 장비 카드를 삭제하시겠습니까?");
    if (!confirmed) return;

    setEquipmentItems((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      saveEquipmentItems(next);
      return next;
    });
  }

  return (
    <PageLayout mainClass="content-page equipment-reference-page">
        <section className="equipment-reference-hero">
          <div
            className="equipment-reference-hero-media"
            role="img"
            aria-label="장비소개 배경 이미지"
          />
          <div className="equipment-reference-hero-overlay" />
        </section>

        <section className="equipment-reference-heading">
          <h2>이끌림 소개</h2>
        </section>

        <section className="equipment-card-grid-section" aria-label="장비 목록">
          <div className="equipment-card-grid">
            {equipmentItems.map((item, index) => {
              const cardKey = String(item.id || `equipment-${index}`);
              return (
                <article className="equipment-card" key={cardKey}>
                  {isAdmin && isPageEditMode && (
                    <button
                      type="button"
                      className="staff-card-delete-button"
                      onClick={(e) => { e.stopPropagation(); handleRemoveEquipment(item, index); }}
                    >
                      삭제
                    </button>
                  )}
                  <div className="equipment-card-image-wrapper">
                    <div
                      className="equipment-card-image"
                      role="img"
                      aria-label={`장비 ${index + 1} 이미지`}
                      data-admin-edit-key={`/ikleulrim/equipment::equipment-image-${item.id}`}
                    />
                  </div>
                  <div className="equipment-card-copy">
                    <h3 className="equipment-card-name">{item.name}</h3>
                    <p className="equipment-card-tags">{item.tags}</p>
                  </div>
                </article>
              );
            })}
          </div>

          {isAdmin && isPageEditMode && (
            <button type="button" className="instructor-add-button" onClick={handleAddEquipment}>
              장비 카드 추가
            </button>
          )}
        </section>
    </PageLayout>
  );
}
// ─── 네이버 지도 Client ID ───────────────────────────────────────
// 아래 값을 채우면 자동으로 네이버 지도로 전환됩니다. 비워두면 구글 지도 사용.
// Naver Cloud Platform → Application → Maps(JavaScript API) 에서 발급
const NAVER_MAP_CLIENT_ID = "";
// ────────────────────────────────────────────────────────────────

const DEFAULT_BRANCHES = [
  {
    name: "이끌림 필라테스 장덕점",
    address: "광주광역시 광산구 풍영로 189, 2층",
    phone: "0507-1377-6302",
    parking: "건물 앞 주차 가능 (방문 전 문의)",
    lat: 35.188459164928,
    lng: 126.81392571847,
    mapEmbedUrl: "https://maps.google.com/maps?hl=ko&q=35.188459164928,126.81392571847&z=16&output=embed",
    mapLink: "https://www.google.com/maps/search/?api=1&query=35.188459164928,126.81392571847",
  },
  {
    name: "이끌림 필라테스 효천점",
    address: "광주광역시 남구 효천2로가길 5, 201-202호",
    phone: "0507-1343-8650",
    parking: "인근 공영/건물 주차장 이용 가능",
    lat: 35.102161560951,
    lng: 126.87396526156,
    mapEmbedUrl: "https://maps.google.com/maps?hl=ko&q=35.102161560951,126.87396526156&z=16&output=embed",
    mapLink: "https://www.google.com/maps/search/?api=1&query=35.102161560951,126.87396526156",
  },
];

// 함수 역할: 지점 맵 urls 구조나 문구를 조립해 반환합니다.
function buildBranchMapUrls(branch) {
  const lat = Number(branch.lat);
  const lng = Number(branch.lng);
  if (!lat || !lng) return branch;
  return {
    ...branch,
    lat,
    lng,
    mapEmbedUrl: `https://maps.google.com/maps?hl=ko&q=${lat},${lng}&z=16&output=embed`,
    mapLink: branch.mapLink || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  };
}

// 컴포넌트 역할: 네이버 지도 JavaScript API를 동적으로 로드해 지도를 렌더링합니다.
function NaverMapEmbed({ lat, lng, title }) {
  const mapRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;

    function initMap() {
      const center = new window.naver.maps.LatLng(lat, lng);
      const map = new window.naver.maps.Map(mapRef.current, { center, zoom: 16 });
      new window.naver.maps.Marker({ position: center, map });
    }

    if (window.naver?.maps) {
      initMap();
      return;
    }

    const SCRIPT_ID = "naver-map-sdk";
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${NAVER_MAP_CLIENT_ID}`;
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      const timer = setInterval(() => {
        if (window.naver?.maps) {
          clearInterval(timer);
          initMap();
        }
      }, 100);
      return () => clearInterval(timer);
    }
  }, [lat, lng]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} title={title} />;
}

// 컴포넌트 역할: NAVER_MAP_CLIENT_ID 설정 여부에 따라 네이버/구글 지도를 선택 렌더링합니다.
function BranchMap({ branch }) {
  if (NAVER_MAP_CLIENT_ID && branch.lat && branch.lng) {
    return <NaverMapEmbed lat={branch.lat} lng={branch.lng} title={`${branch.name} 지도`} />;
  }
  return (
    <iframe
      title={`${branch.name} 지도`}
      src={branch.mapEmbedUrl}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}

// 함수 역할: NAVER_MAP_CLIENT_ID 설정 여부에 따라 적절한 "지도 크게 보기" URL을 반환합니다.
function getMapLink(branch) {
  if (NAVER_MAP_CLIENT_ID && branch.lat && branch.lng) {
    return `https://map.naver.com/p/entry/address/${branch.lat},${branch.lng}?c=${branch.lng},${branch.lat},16,0,0,0,dh`;
  }
  return branch.mapLink;
}

// 컴포넌트 역할: BrandDirectionsPage 화면을 렌더링하고 필요한 API 호출과 사용자 입력 상태를 관리합니다.
export function BrandDirectionsPage() {
  useSeoMeta({
    title: "오시는 길",
    description: "이끌림 필라테스 장덕점(광산구 풍영로 189)·효천점(남구 효천2로가길 5) 위치 안내.",
  });
  const [branches, setBranches] = useState(DEFAULT_BRANCHES);

  useEffect(() => {
    fetch("/api/brand/branches", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const rows = Array.isArray(data?.branches) ? data.branches : Array.isArray(data) ? data : null;
        if (rows && rows.length > 0) setBranches(rows.map(buildBranchMapUrls));
      })
      .catch(() => {});
  }, []);

  return (
    <PageLayout mainClass="content-page directions-page">
        <section className="content-hero">
          <p className="section-kicker">이끌림 · 오시는 길</p>
          <h1>오시는 길</h1>
          <p className="section-text">
            장덕점과 효천점을 한 페이지에서 확인할 수 있습니다.
          </p>
        </section>

        <section className="directions-stack">
          {branches.map((branch) => (
            <article className="direction-branch-card" key={branch.name}>
              <div className="direction-branch-head">
                <h3>{branch.name}</h3>
                <a href={getMapLink(branch)} target="_blank" rel="noreferrer">
                  지도 크게 보기
                </a>
              </div>
              <div className="direction-branch-content">
                <div className="direction-branch-meta">
                  <p>
                    <strong>주소</strong>
                    <span>{branch.address}</span>
                  </p>
                  <p>
                    <strong>연락처</strong>
                    <span>{branch.phone}</span>
                  </p>
                  <p>
                    <strong>주차 안내</strong>
                    <span>{branch.parking}</span>
                  </p>
                </div>
                <div className="direction-map-wrap">
                  <BranchMap branch={branch} />
                </div>
              </div>
            </article>
          ))}
        </section>
    </PageLayout>
  );
}

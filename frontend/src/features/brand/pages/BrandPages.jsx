import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";

function BrandPageLayout({ kicker, title, description, points }) {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page">
        <section className="content-hero">
          <p className="section-kicker">{kicker}</p>
          <h1>{title}</h1>
          <p className="section-text">{description}</p>
        </section>
        <section className="content-grid">
          {points.map((point) => (
            <article className="content-card" key={point.title}>
              <h3>{point.title}</h3>
              <p>{point.description}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

export function BrandIntroPage() {
  const specialityCards = [
    {
      id: "01",
      title: "개인 체형 기반 수업 설계",
      description:
        "상담과 움직임 체크를 바탕으로 회원별 루틴을 맞춤 구성합니다. 입문자부터 경력자까지 목표에 맞는 난이도로 단계별 진행합니다.",
    },
    {
      id: "02",
      title: "강사 코칭 매뉴얼 운영",
      description:
        "강사별 편차를 줄이기 위해 공통 코칭 기준을 운영하고, 수업 흐름과 피드백 품질을 일정하게 유지합니다.",
    },
    {
      id: "03",
      title: "교육 콘텐츠 연동 시스템",
      description:
        "오프라인 수업과 온라인 가이드 영상이 끊기지 않도록 연결해 복습과 자가학습이 자연스럽게 이어집니다.",
    },
    {
      id: "04",
      title: "사후 루틴 체크",
      description:
        "수업 직후 피드백과 주간 루틴 안내를 통해 변화가 일회성으로 끝나지 않도록 관리하며 회원 만족도를 높입니다.",
    },
  ];

  const promises = [
    "이끌림은 회원의 안전을 최우선 기준으로 수업을 운영합니다.",
    "작은 불편도 놓치지 않도록 지속적으로 소통합니다.",
    "상담과 수업의 기준이 흔들리지 않도록 시스템을 유지합니다.",
  ];

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page intro-content-page">
        <section className="intro-cover-section">
          <div className="intro-image-slot intro-cover-media" role="img" aria-label="소개 메인 비주얼 이미지 영역">
            <span>메인 비주얼 이미지 영역</span>
            <div className="intro-cover-overlay">
              <p className="section-kicker">이끌림 · 소개</p>
              <h1>브랜드 케어의 시작</h1>
              <p>
                상담부터 수업, 학습까지 하나의 흐름으로 설계했습니다.
              </p>
              <a href="#intro-identity" className="intro-scroll-link" aria-label="다음 섹션으로 이동">
                ↓
              </a>
            </div>
          </div>
        </section>

        <section className="intro-identity-section" id="intro-identity">
          <div className="intro-identity-grid">
            <div className="intro-image-slot intro-identity-media" role="img" aria-label="브랜드 소개 이미지 영역">
              <span>이미지 영역 01</span>
            </div>
            <article className="intro-text-block intro-identity-copy">
              <p className="intro-eyebrow">고객 맞춤 케어 시스템</p>
              <h2>브랜드 고객맞춤 관리법</h2>
              <p>
                고객의 현재 상태와 목표를 기준으로 수업을 설계합니다.
                상담·수업·교육 콘텐츠까지 끊김 없이 통합된 경험을 제공합니다.
              </p>
            </article>
          </div>
        </section>

        <section className="intro-speciality-section">
          <div className="intro-speciality-grid">
            <div
              className="intro-image-slot intro-speciality-main-media"
              role="img"
              aria-label="브랜드 강점 대표 이미지 영역"
            >
              <span>이미지 영역 02</span>
              <div className="intro-speciality-main-copy">
                <p>고객만족을 위한 단계별 운영</p>
                <h2>ICL 스페셜리티</h2>
              </div>
            </div>
            <div className="intro-speciality-list">
              {specialityCards.map((card) => (
                <article className="intro-speciality-card" key={card.id}>
                  <p className="intro-special-number">SPECIAL {card.id}</p>
                  <h3>{card.title}</h3>
                  <div
                    className="intro-image-slot intro-image-slot-inline"
                    role="img"
                    aria-label={`스페셜 ${card.id} 이미지 영역`}
                  >
                    <span>이미지 영역 {Number(card.id) + 2}</span>
                  </div>
                  <p>{card.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="intro-promise-band">
          <div className="intro-image-slot intro-promise-bg" role="img" aria-label="브랜드 약속 배경 이미지 영역">
            <span>배경 이미지 영역</span>
          </div>
          <div className="intro-promise-inner">
            <div className="section-intro center">
              <p className="section-kicker">이끌림 약속</p>
              <h2>이끌림의 세 가지 약속</h2>
            </div>
            <div className="intro-promise-grid">
              {promises.map((promise) => (
                <article className="intro-promise-card" key={promise}>
                  <div className="intro-promise-icon" aria-hidden>
                    *
                  </div>
                  <p>{promise}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="intro-booking-section">
          <div className="intro-image-slot intro-booking-media" role="img" aria-label="상담 예약 배경 이미지 영역">
            <span>배경 이미지 영역</span>
            <div className="intro-booking-overlay">
              <p>온라인으로 예약하시면 원하는 일정에 맞춰 상담이 가능합니다.</p>
              <p className="intro-cta-copy">상담 후 목표에 맞는 수업/교육 플랜을 안내해드립니다.</p>
              <div className="intro-cta-actions">
                <Link className="pill-button white" to="/community/inquiry">
                  상담 문의하기
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
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

export function BrandInstructorsPage() {
  const [instructors, setInstructors] = useState(DEFAULT_INSTRUCTORS);

  useEffect(() => {
    fetch("/api/brand/instructors", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const rows = Array.isArray(data?.instructors) ? data.instructors : Array.isArray(data) ? data : null;
        if (rows && rows.length > 0) setInstructors(rows);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page">
        <section className="content-hero">
          <p className="section-kicker">이끌림 · 강사진</p>
          <h1>강사 소개</h1>
          <p className="section-text">
            경력과 전문성, 그리고 코칭 철학을 바탕으로 구성된 강사진을 안내합니다.
          </p>
        </section>

        <section className="staff-split-list">
          {instructors.map((item, index) => (
            <article
              className={`staff-split${index % 2 === 1 ? " reverse" : ""}`}
              key={item.name}
            >
              <div className="staff-image-slot" />
              <div className="staff-text-panel">
                <p className="mini-kicker">{item.role}</p>
                <h3>{item.name}</h3>
                <p>{item.intro}</p>
                <ul className="staff-career-list">
                  {item.careers.map((career) => (
                    <li key={career}>{career}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

export function BrandTourPage() {
  const galleryItems = [
    { id: "01", name: "로비 & 웰컴 라운지" },
    { id: "02", name: "프라이빗 상담 공간" },
    { id: "03", name: "리포머 메인룸" },
    { id: "04", name: "체어 & 바렐 존" },
    { id: "05", name: "소도구 트레이닝 존" },
    { id: "06", name: "샤워 & 파우더 룸" },
    { id: "07", name: "휴식 무드 라운지" },
    { id: "08", name: "프라이빗 대기 공간" },
  ];

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page tour-content-page">
        <section className="tour-hero-section">
          <div className="tour-hero-media">
            <div className="img-placeholder" style={{ minHeight: "480px" }}><span>비어있는 이미지 1입니다</span></div>
            <div className="tour-hero-overlay">
              <p className="section-kicker">이끌림 · 스튜디오 둘러보기</p>
              <h1>스튜디오 투어</h1>
              <p>동선과 균형을 고려한 공간 설계로 수업 전후의 경험까지 편안하게 이어집니다.</p>
            </div>
          </div>
        </section>

        <section className="tour-intro-section">
          <div className="section-intro center">
            <p className="section-kicker">공간 미리보기</p>
            <h2>안락함과 집중도를 높인 공간</h2>
            <p className="section-text narrow">
              라운지부터 수업룸, 상담 공간까지 하나의 무드로 연결했습니다.
              실제 동선을 고려한 설계로 처음 방문하는 회원도 자연스럽게 적응할 수 있습니다.
            </p>
          </div>
        </section>

        <section className="tour-gallery-section">
          <div className="tour-gallery-track" aria-label="스튜디오 갤러리">
            {galleryItems.map((item, index) => (
              <article className="tour-gallery-item" key={item.id}>
                <div className="tour-gallery-image">
                  <div className="img-placeholder"><span>비어있는 이미지 {index + 2}입니다</span></div>
                </div>
                <div className="tour-gallery-caption">
                  <p className="tour-gallery-number">{item.id}</p>
                  <h3>{item.name}</h3>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export function BrandEquipmentPage() {
  const equipmentItems = Array.from({ length: 5 }, (_, index) => ({
    id: `equipment-slot-${index + 1}`,
  }));

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page equipment-reference-page">
        <section className="equipment-reference-hero">
          <div className="equipment-reference-hero-media" role="img" aria-label="장비소개 배경 이미지" />
          <div className="equipment-reference-hero-overlay" />
          <div className="equipment-reference-hero-copy">
            <p>ICL PILATES STUDIO</p>
            <h1>장비소개</h1>
            <span>정확한 움직임의 시작, 빈틈없는 필라테스 장비 구성</span>
          </div>
        </section>

        <section className="equipment-reference-heading">
          <h2>장비소개</h2>
          <p>이끌림 필라테스는 회원 만족을 위해 장비 선택 기준을 엄격하게 유지합니다.</p>
        </section>

        <section className="equipment-reference-list" aria-label="장비 목록">
          {equipmentItems.map((item, index) => (
            <article
              className={`equipment-reference-item${index % 2 === 1 ? " reverse" : ""}`}
              key={item.id}
            >
              <div className="equipment-reference-image equipment-reference-image-placeholder" role="img" aria-label="비어있는 이미지 영역">
                <span>비어있는 이미지</span>
              </div>
              <div className="equipment-reference-copy equipment-reference-copy-placeholder">
                <h5>비어있는 텍스트</h5>
                <h3>비어있는 텍스트</h3>
                <p className="equipment-reference-lead">비어있는 텍스트</p>
                <p>비어있는 텍스트</p>
                <p className="equipment-reference-effect">비어있는 텍스트</p>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
const DEFAULT_BRANCHES = [
  {
    name: "이끌림 필라테스 장덕점",
    address: "광주광역시 광산구 풍영로 189, 2층",
    phone: "062-000-0001",
    parking: "건물 앞 주차 가능 (방문 전 문의)",
    mapEmbedUrl: "https://maps.google.com/maps?hl=ko&q=35.188459164928,126.81392571847&z=16&output=embed",
    mapLink: "https://www.google.com/maps/search/?api=1&query=35.188459164928,126.81392571847",
  },
  {
    name: "이끌림 필라테스 효천점",
    address: "광주광역시 남구 효천2로가길 5, 201-202호",
    phone: "062-000-0002",
    parking: "인근 공영/건물 주차장 이용 가능",
    mapEmbedUrl: "https://maps.google.com/maps?hl=ko&q=35.102161560951,126.87396526156&z=16&output=embed",
    mapLink: "https://www.google.com/maps/search/?api=1&query=35.102161560951,126.87396526156",
  },
];

function buildBranchMapUrls(branch) {
  const lat = Number(branch.lat);
  const lng = Number(branch.lng);
  if (!lat || !lng) return branch;
  return {
    ...branch,
    mapEmbedUrl: `https://maps.google.com/maps?hl=ko&q=${lat},${lng}&z=16&output=embed`,
    mapLink: branch.mapLink || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  };
}

export function BrandDirectionsPage() {
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
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page directions-page">
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
                <a href={branch.mapLink} target="_blank" rel="noreferrer">
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
                  <iframe
                    title={`${branch.name} 지도`}
                    src={branch.mapEmbedUrl}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}



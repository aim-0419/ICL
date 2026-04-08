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
        "상담과 움직임 체크를 바탕으로 회원마다 다른 수업 루틴을 구성합니다. 입문자부터 경력자까지 목표에 맞춰 난이도를 세밀하게 조정합니다.",
    },
    {
      id: "02",
      title: "강사 코칭 매뉴얼 운영",
      description:
        "강사별 큐잉 편차를 줄이기 위해 내부 코칭 가이드를 운영합니다. 회원이 느끼는 수업 품질이 지점과 시간대에 따라 흔들리지 않도록 설계했습니다.",
    },
    {
      id: "03",
      title: "교육 콘텐츠 연동 시스템",
      description:
        "오프라인 수업과 온라인 교육 가이드가 끊기지 않도록 연결합니다. 복습과 재학습이 필요한 순간에 바로 활용할 수 있는 학습 흐름을 제공합니다.",
    },
    {
      id: "04",
      title: "사후 루틴 케어",
      description:
        "수업 직후 피드백과 주간 루틴 점검을 통해 변화가 일회성으로 끝나지 않게 관리합니다. 회원 만족도와 지속률을 함께 높이는 운영을 지향합니다.",
    },
  ];

  const promises = [
    "이끌림은 회원의 안전을 최우선 기준으로 수업을 운영합니다.",
    "이끌림은 작은 불편도 놓치지 않도록 꾸준히 소통합니다.",
    "이끌림은 상담 전과 수업 후의 태도가 달라지지 않습니다.",
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
              <h1>특별한 케어의 시작</h1>
              <p>
                브랜드 소개와 교육 콘텐츠 경험이 끊기지 않도록, 시작부터 상담-수업-학습까지 하나의 흐름으로
                설계합니다.
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
              <p className="intro-eyebrow">Special Care for You</p>
              <h2>특별한 고객님께 특별한 관리를</h2>
              <p>
                이끌림은 고객님의 몸 상태와 목표를 기준으로 수업을 맞춤 설계합니다. 상담부터 수업 운영, 그리고
                강사용 교육 콘텐츠까지 경험이 분절되지 않도록 구조를 통합했습니다.
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
                <p>고객만족을 위한 개별 맞춤 운영</p>
                <h2>ICL Speciality</h2>
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
              <p className="section-kicker">Our Promise</p>
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
            <span>CTA 배경 이미지 영역</span>
            <div className="intro-booking-overlay">
              <p>온라인으로 예약하시면 원하는 일정에 맞춰 시작할 수 있습니다.</p>
              <p className="intro-cta-copy">상담 후 목표에 맞는 수업/교육 플랜을 함께 설계해드립니다.</p>
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

export function BrandInstructorsPage() {
  const instructors = [
    {
      name: "대표 강사 소개",
      role: "대표 원장 · Master Instructor",
      intro:
        "움직임의 원리를 회원의 몸에 맞게 통역하는 수업을 지향합니다. 정확한 기본기와 섬세한 큐잉으로 변화의 방향을 설계합니다.",
      careers: [
        "現 이끌림 필라테스 대표 원장",
        "국내외 필라테스 지도자 과정 이수",
        "재활/체형교정 기반 개인 수업 운영",
      ],
    },
    {
      name: "Instructor Team",
      role: "Professional Teaching Team",
      intro:
        "이끌림 강사진은 수업 전후 회원 상태를 꼼꼼히 체크하고, 개인 목표에 맞는 프로그램을 유연하게 조정합니다.",
      careers: [
        "기구/매트 통합 수업 운영",
        "회원별 컨디션 기록 및 단계별 피드백",
        "정기 내부 트레이닝 진행",
      ],
    },
    {
      name: "Care & Coaching Team",
      role: "Member Care Team",
      intro:
        "첫 상담부터 루틴 정착까지 꾸준히 동행합니다. 수업 만족도와 지속률을 높이는 커뮤니케이션을 담당합니다.",
      careers: [
        "상담/예약/수강 관리 프로세스 운영",
        "회원별 목표 기반 수강 플랜 제안",
        "수강 후 피드백 및 루틴 코칭",
      ],
    },
  ];

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page">
        <section className="content-hero">
          <p className="section-kicker">이끌림 · 강사</p>
          <h1>강사 소개</h1>
          <p className="section-text">
            경력과 전문성, 티칭 철학을 바탕으로 구성된 강사진을 안내합니다.
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
    {
      id: "01",
      name: "로비 & 웰컴 라운지",
      image:
        "https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=1400&q=80",
    },
    {
      id: "02",
      name: "프라이빗 상담 공간",
      image:
        "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80",
    },
    {
      id: "03",
      name: "리포머 메인룸",
      image:
        "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1400&q=80",
    },
    {
      id: "04",
      name: "체어 & 바렐 존",
      image:
        "https://images.unsplash.com/photo-1591291621164-2c6367723315?auto=format&fit=crop&w=1400&q=80",
    },
    {
      id: "05",
      name: "소도구 트레이닝 존",
      image:
        "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1400&q=80",
    },
    {
      id: "06",
      name: "샤워 & 파우더 룸",
      image:
        "https://images.unsplash.com/photo-1630699144339-420fe5f7f8d8?auto=format&fit=crop&w=1400&q=80",
    },
    {
      id: "07",
      name: "야간 무드 라운지",
      image:
        "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=1400&q=80",
    },
    {
      id: "08",
      name: "클래스 대기 공간",
      image:
        "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1400&q=80",
    },
  ];

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page tour-content-page">
        <section className="tour-hero-section">
          <div className="tour-hero-media">
            <img
              src="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=2000&q=80"
              alt="이끌림 필라테스 스튜디오 메인 공간"
            />
            <div className="tour-hero-overlay">
              <p className="section-kicker">이끌림 · 스튜디오 둘러보기</p>
              <h1>Studio Tour</h1>
              <p>안락한 동선과 균형 잡힌 공간 설계로, 수업 전후의 경험까지 편안하게 이어집니다.</p>
            </div>
          </div>
        </section>

        <section className="tour-intro-section">
          <div className="section-intro center">
            <p className="section-kicker">Interior Preview</p>
            <h2>편안함과 집중을 함께 담은 공간</h2>
            <p className="section-text narrow">
              라운지부터 수업룸, 상담 공간까지 하나의 무드로 연결했습니다. 실제 동선에 맞춘 공간 설계로 처음
              방문하는 날에도 자연스럽게 적응할 수 있습니다.
            </p>
          </div>
        </section>

        <section className="tour-gallery-section">
          <div className="tour-gallery-track" aria-label="스튜디오 갤러리">
            {galleryItems.map((item) => (
              <article className="tour-gallery-item" key={item.id}>
                <div className="tour-gallery-image">
                  <img src={item.image} alt={item.name} />
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
  return (
    <BrandPageLayout
      kicker="이끌림 · 장비소개"
      title="장비 소개"
      description="리포머, 캐딜락, 체어 등 수업 목적에 맞춘 장비 구성을 안내합니다."
      points={[
        {
          title: "기구 구성",
          description: "개인/듀엣/소그룹 수업을 모두 지원하는 기구 라인업을 갖추고 있습니다.",
        },
        {
          title: "점검/위생",
          description: "정기 점검과 위생 관리 기준을 운영하여 안전한 수업 환경을 유지합니다.",
        },
      ]}
    />
  );
}

export function BrandDirectionsPage() {
  const branches = [
    {
      name: "이끌림 필라테스 장덕점",
      address: "광주광역시 광산구 풍영로 189, 2층",
      phone: "062-000-0001",
      parking: "건물 내 주차 가능 (방문 전 문의)",
      mapEmbedUrl:
        "https://maps.google.com/maps?hl=ko&q=35.188459164928,126.81392571847&z=16&output=embed",
      mapLink:
        "https://www.google.com/maps/search/?api=1&query=35.188459164928,126.81392571847",
    },
    {
      name: "이끌림 필라테스 효천점",
      address: "광주광역시 남구 효천2로가길 5, 201·202호",
      phone: "062-000-0002",
      parking: "인근 공영/건물 주차 이용 가능",
      mapEmbedUrl:
        "https://maps.google.com/maps?hl=ko&q=35.102161560951,126.87396526156&z=16&output=embed",
      mapLink:
        "https://www.google.com/maps/search/?api=1&query=35.102161560951,126.87396526156",
    },
  ];

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page directions-page">
        <section className="content-hero">
          <p className="section-kicker">이끌림 · 오시는길</p>
          <h1>오시는 길</h1>
          <p className="section-text">
            장덕점과 효천점을 한 페이지에서 확인할 수 있도록, 가로 기준 레이아웃을 세로 섹션으로 나눠
            구성했습니다.
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

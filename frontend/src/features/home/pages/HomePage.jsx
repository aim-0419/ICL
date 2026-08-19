// 파일 역할: 메인 홈 화면에서 브랜드 소개, 최신 소식, 추천 강의, 후기를 보여주는 페이지 컴포넌트입니다.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { canEditPage, getAdminLandingPath, isAdminStaff } from "../../../shared/auth/userRoles.js";
import { getUserDisplayName } from "../../../shared/auth/userDisplay.js";
import { apiRequest } from "../../../shared/api/client.js";
import { useSeoMeta } from "../../../shared/hooks/useSeoMeta.js";
import { isNativeApp } from "../../../shared/platform/runtime.js";
import { resolveApiAssetUrl } from "../../../shared/api/client.js";

const HOME_SECTION_ORDER_KEY = "icl_admin_home_section_order_v1";
const DEFAULT_SECTION_ORDER = ["hero", "story", "features", "status", "academy", "reviews"];

function readSectionOrder() {
  try {
    const raw = localStorage.getItem(HOME_SECTION_ORDER_KEY);
    if (!raw) return DEFAULT_SECTION_ORDER;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== DEFAULT_SECTION_ORDER.length) return DEFAULT_SECTION_ORDER;
    return parsed;
  } catch {
    return DEFAULT_SECTION_ORDER;
  }
}


const SOCIAL_SOURCE_NAME_MAP = {
  event: "진행중 이벤트",
  youtube: "YouTube",
  blog: "Naver Blog",
  instagram: "Instagram",
};

const DEFAULT_SOCIAL_ITEMS = [
  {
    source: "blog",
    label: "네이버 블로그 최신 글",
    title: "최신 게시글을 불러오는 중입니다.",
    url: "https://blog.naver.com/icl_pilates",
    publishedAt: "",
    thumbnail: "",
  },
  {
    source: "instagram",
    label: "인스타 최신 게시글",
    title: "최신 게시글을 불러오는 중입니다.",
    url: "https://www.instagram.com/icl.pilates/",
    publishedAt: "",
    thumbnail: "",
  },
];

const DEFAULT_EVENT_NEWS_ITEM = {
  source: "event",
  label: "현재 진행중인 이벤트",
  title: "현재 진행 중인 이벤트가 없습니다.",
  url: "/community/events",
  publishedAt: "",
  thumbnail: "",
  image: "/assets/images/home/window-equipment.jpg",
  isInternal: true,
};

const HOME_IMAGES = {
  hero: "/assets/images/home/main-hero/이끌림 필라테스 메인 페이지 상단 이미지.png",
  studio: "/assets/images/home/studio-main.jpg",
  window: "/assets/images/home/window-equipment.jpg",
  sun: "/assets/images/home/sun-window.jpg",
  reformer: "/assets/images/home/reformer-light.jpg",
  room: "/assets/images/home/training-room.jpg",
};

const SERVICE_POINTS = [
  {
    icon: "01",
    title: "상담",
    description: "목표와 불편함을 먼저 듣습니다.",
  },
  {
    icon: "02",
    title: "체형 분석",
    description: "움직임 패턴을 확인합니다.",
  },
  {
    icon: "03",
    title: "개인 맞춤",
    description: "필요한 루틴을 설계합니다.",
  },
  {
    icon: "04",
    title: "기구 수업",
    description: "안전한 난이도로 진행합니다.",
  },
  {
    icon: "05",
    title: "복습 영상",
    description: "수업 후에도 이어갑니다.",
  },
  {
    icon: "06",
    title: "후기 기록",
    description: "변화를 차분히 남깁니다.",
  },
];

const SUNLIT_NAV_ITEMS = [
  { label: "메인", path: "/" },
  {
    label: "스튜디오",
    path: "/ikleulrim/instructors",
    children: [
      { label: "이끌림 소개", path: "/ikleulrim/equipment" },
      { label: "수업 소개", path: "/ikleulrim/intro" },
      { label: "강사진", path: "/ikleulrim/instructors" },
      { label: "오시는 길", path: "/ikleulrim/directions" },
    ],
  },
  {
    label: "아카데미",
    path: "/academy",
    children: [
      { label: "교육 영상", path: "/academy" },
    ],
  },
  {
    label: "커뮤니티",
    path: "/community/reviews",
    children: [
      { label: "후기", path: "/community/reviews" },
      { label: "문의하기", path: "/community/inquiry" },
    ],
  },
  { label: "이벤트", path: "/community/events" },
];

const SUNLIT_SERVICE_CARDS = [
  { icon: "bag", title: "수업 안내", text: "개인·그룹·듀엣", path: "/ikleulrim/intro" },
  { icon: "calendar", title: "예약 안내", text: "간편한 예약 시스템", path: "/pilates/reservation" },
  { icon: "user", title: "강사진 소개", text: "전문 강사진", path: "/ikleulrim/instructors" },
  { icon: "studio", title: "스튜디오", text: "공간 & 시설 안내", path: "/ikleulrim/tour" },
  { icon: "thumb", title: "아카데미", text: "전문가 교육 과정", path: "/academy" },
  { icon: "play", title: "커뮤니티", text: "이벤트 & 소식", path: "/community/reviews" },
  { icon: "pin", title: "오시는 길", text: "위치 안내", path: "/ikleulrim/directions" },
];

const SUNLIT_FEATURE_CARDS = [
  {
    icon: "balance",
    title: "움직임 분석\n& 맞춤 설계",
    text: "체형 분석과 움직임 평가를 통해 개인의 불균형을 정확히 파악하고 올바른 방향으로 이끌어갑니다.",
  },
  {
    icon: "ladder",
    title: "기능적 움직임\n전문 프로그램",
    text: "단순한 운동이 아닌, 몸의 기능을 회복하고 강화하는 맞춤형 필라테스를 경험하세요.",
  },
  {
    icon: "video",
    title: "온라인으로 배우는 ICL\n아카데미",
    text: "언제 어디서든 ICL의 전문적인 교육 콘텐츠를 통해 올바른 움직임을 배워보세요.",
  },
];

// 함수 역할: 소셜 썸네일 error 사용자 이벤트를 처리합니다.
function handleSocialThumbnailError(event) {
  const image = event.currentTarget;
  const wrapper = image.closest(".social-thumb-link");
  if (wrapper) wrapper.style.display = "none";
  if (!wrapper) image.style.display = "none";
}

// 함수 역할: 소셜 게시일 날짜 값을 화면에 보여주기 좋은 문구로 변환합니다.
function formatSocialPublishedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// 컴포넌트 역할: 유튜브, 블로그, 인스타그램 소스별 아이콘을 렌더링합니다.
function SocialSourceIcon({ source }) {
  if (source === "event") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="6.5" width="15" height="12" rx="2.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 4.5v4M16 4.5v4M5 10.5h14M8.5 14h3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (source === "youtube") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M23.2 7.2a3.1 3.1 0 0 0-2.2-2.2C19 4.5 12 4.5 12 4.5s-7 0-9 .5A3.1 3.1 0 0 0 .8 7.2 32.9 32.9 0 0 0 .3 12c0 1.6.2 3.2.5 4.8A3.1 3.1 0 0 0 3 19c2 .5 9 .5 9 .5s7 0 9-.5a3.1 3.1 0 0 0 2.2-2.2c.3-1.6.5-3.2.5-4.8s-.2-3.2-.5-4.8M9.8 15.7V8.3L16 12z"
        />
      </svg>
    );
  }

  if (source === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="3.6"
          y="3.6"
          width="16.8"
          height="16.8"
          rx="5"
          ry="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        />
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.8" y="2.8" width="18.4" height="18.4" rx="3.5" ry="3.5" fill="currentColor" />
      <path d="M7.7 7.2h3.6l5 9.6h-3.7z" fill="#fff" />
      <path d="M11.4 7.2h3.5l-5.1 9.6H6.3z" fill="#fff" />
    </svg>
  );
}

// 컴포넌트 역할: 햇빛 콘셉트 홈 목업의 라인 아이콘을 렌더링합니다.
function SunlitLineIcon({ type }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
  };

  if (type === "calendar") {
    return (
      <svg {...commonProps}>
        <rect x="5" y="6.5" width="14" height="12" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.5v4M16 4.5v4M5.5 10h13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "user") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="8.2" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.5 19c.9-3.1 2.8-4.7 5.5-4.7s4.6 1.6 5.5 4.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "studio") {
    return (
      <svg {...commonProps}>
        <path d="M12 4.5v15M8.4 8.5h7.2M7 19.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  if (type === "thumb") {
    return (
      <svg {...commonProps}>
        <path d="M8.5 10.2 11 5.3c.6-1.1 2.1-.7 2.1.6v3.2h3.4c1.2 0 2.1 1.1 1.8 2.3l-1.1 5.2c-.2.9-1 1.5-1.9 1.5H8.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M5 10.2h3.5v7.9H5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "play" || type === "video") {
    return (
      <svg {...commonProps}>
        <rect x="4.5" y="6" width="15" height="12" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="m10.5 9.2 4.2 2.8-4.2 2.8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "pin") {
    return (
      <svg {...commonProps}>
        <path d="M12 20s5.2-5.1 5.2-9.6A5.2 5.2 0 0 0 6.8 10.4C6.8 14.9 12 20 12 20Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="10.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  if (type === "clock") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 8.2v4.2l3 1.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "ticket") {
    return (
      <svg {...commonProps}>
        <path d="M5.5 8.2h13v3a1.8 1.8 0 0 0 0 3.6v3h-13v-3a1.8 1.8 0 0 0 0-3.6z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 8.6v6.8M13 10.6h2.6M13 13.4h2.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "bell") {
    return (
      <svg {...commonProps}>
        <path d="M7.2 17h9.6l-.9-1.7v-3.8a3.9 3.9 0 0 0-7.8 0v3.8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10.2 18.2a2 2 0 0 0 3.6 0M12 5.2v1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "users") {
    return (
      <svg {...commonProps}>
        <circle cx="9.5" cy="8.8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="16" cy="9.8" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.2 18.5c.7-3 2.2-4.4 4.3-4.4s3.7 1.4 4.4 4.4M13.8 15.1c1.9.1 3.2 1.2 3.9 3.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "settings") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 5.2v2M12 16.8v2M6.9 6.9l1.4 1.4M15.7 15.7l1.4 1.4M5.2 12h2M16.8 12h2M6.9 17.1l1.4-1.4M15.7 8.3l1.4-1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "chart") {
    return (
      <svg {...commonProps}>
        <path d="M5.5 18.5h13M7.2 16v-4.8M12 16V7.5M16.8 16v-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="m7.2 10.6 3.2-3.1 2.8 2.4 3.6-3.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "message") {
    return (
      <svg {...commonProps}>
        <path d="M5.2 6.8h13.6v9.4H9.4l-4.2 2.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8.5 10.2h7M8.5 13h4.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "balance") {
    return (
      <svg {...commonProps}>
        <path d="M12 5v12M8 17h8M7 12c.8 1.8 2.1 2.7 5 2.7s4.2-.9 5-2.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  if (type === "ladder") {
    return (
      <svg {...commonProps}>
        <path d="M8 4.5v15M16 4.5v15M8 8h8M8 12h8M8 16h8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M7 9h10v8.5H7zM9 9V7.6a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 13h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// 함수 역할: 소셜 항목 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeSocialItems(apiItems) {
  const sourceMap = new Map(
    (Array.isArray(apiItems) ? apiItems : [])
      .map((item) => (item?.source ? [String(item.source).toLowerCase(), item] : null))
      .filter(Boolean)
  );

  return DEFAULT_SOCIAL_ITEMS.map((fallbackItem) => {
    const fromApi = sourceMap.get(fallbackItem.source);
    return {
      ...fallbackItem,
      ...(fromApi || {}),
      source: fallbackItem.source,
      label: String(fromApi?.label || fallbackItem.label),
      title: String(fromApi?.title || fallbackItem.title),
      url: String(fromApi?.url || fallbackItem.url),
      publishedAt: formatSocialPublishedDate(fromApi?.publishedAt),
      thumbnail: String(fromApi?.thumbnail || ""),
      isLive: Boolean(fromApi?.isLive),
    };
  });
}

function readEventSortTime(eventItem) {
  const created = new Date(eventItem?.createdAt || "").getTime();
  if (!Number.isNaN(created)) return created;

  const idTime = Number(String(eventItem?.id || "").match(/^event-(\d+)/)?.[1]);
  if (Number.isFinite(idTime)) return idTime;

  const start = new Date(eventItem?.startDate || "").getTime();
  return Number.isNaN(start) ? 0 : start;
}

function pickLatestActiveEvent(events) {
  return (Array.isArray(events) ? events : [])
    .filter((eventItem) => String(eventItem?.status || "").trim() === "진행중")
    .sort((a, b) => readEventSortTime(b) - readEventSortTime(a))[0] || null;
}

function toEventNewsItem(eventItem) {
  if (!eventItem) return DEFAULT_EVENT_NEWS_ITEM;

  const title = String(eventItem.title || "").trim() || DEFAULT_EVENT_NEWS_ITEM.title;
  const summary = String(eventItem.summary || "").trim();
  const image = String(eventItem.image || "").trim() || DEFAULT_EVENT_NEWS_ITEM.image;

  return {
    source: "event",
    label: "현재 진행중인 이벤트",
    title,
    summary,
    url: `/community/events/${encodeURIComponent(String(eventItem.id || ""))}`,
    publishedAt: formatSocialPublishedDate(eventItem.createdAt || eventItem.startDate),
    thumbnail: image,
    image,
    isInternal: true,
  };
}

// 컴포넌트 역할: 메인 홈 화면에서 브랜드 소개, 최신 소식, 추천 강의, 후기를 보여주는 페이지 컴포넌트입니다.
export function HomePage() {
  useSeoMeta({
    title: "광주 필라테스 스튜디오",
    description: "광주 이끌림 필라테스. 장덕점·효천점 운영, 전문 필라테스 교육 영상 판매. 입문부터 전문가 과정까지.",
  });
  const navigate = useNavigate();
  const location = useLocation();
  const store = useAppStore();
  const currentUserDisplayName = getUserDisplayName(store.currentUser);
  const canOpenAdminDashboard = isAdminStaff(store.currentUser);
  const canEditHomePage = canEditPage(store.currentUser);
  const nativeApp = isNativeApp();

  function handleReservationClick() {
    if (!store.currentUser) return navigate("/login");
    if (isAdminStaff(store.currentUser)) return navigate("/admin/studio");
    navigate("/pilates/reservation");
  }
  const [socialItems, setSocialItems] = useState(() => DEFAULT_SOCIAL_ITEMS);
  const [latestActiveEvent, setLatestActiveEvent] = useState(null);
  const [openSunlitNav, setOpenSunlitNav] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showRenewalPopup, setShowRenewalPopup] = useState(() => {
    try {
      const hideUntil = localStorage.getItem("renewal_popup_hide_until");
      const today = new Date().toLocaleDateString("sv");
      return hideUntil !== today;
    } catch {
      return true;
    }
  });

  function closeRenewalPopup() { setShowRenewalPopup(false); }

  function hideRenewalPopupToday() {
    try {
      localStorage.setItem("renewal_popup_hide_until", new Date().toLocaleDateString("sv"));
    } catch {}
    setShowRenewalPopup(false);
  }

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileNavOpen]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  async function handleHomeLogout() {
    closeMobileNav();
    try {
      await store.logoutUser();
    } finally {
      navigate("/");
    }
  }

  const [sectionOrder, setSectionOrder] = useState(() => readSectionOrder());

  useEffect(() => {
    function onReorder(event) {
      const { id1, id2 } = event.detail || {};
      if (!id1 || !id2 || id1 === id2) return;
      setSectionOrder((prev) => {
        const next = [...prev];
        const i = next.indexOf(id1);
        const j = next.indexOf(id2);
        if (i === -1 || j === -1) return prev;
        [next[i], next[j]] = [next[j], next[i]];
        try { localStorage.setItem(HOME_SECTION_ORDER_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    }
    window.addEventListener("admin-home-section-reorder", onReorder);
    return () => window.removeEventListener("admin-home-section-reorder", onReorder);
  }, []);

  useEffect(() => {
    if (window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    apiRequest("/community/social/latest")
      .then((result) => {
        if (!mounted) return;
        setSocialItems(normalizeSocialItems(result?.items));
      })
      .catch(() => {
        if (!mounted) return;
        setSocialItems(DEFAULT_SOCIAL_ITEMS);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    apiRequest("/community/events")
      .then((rows) => {
        if (!mounted) return;
        setLatestActiveEvent(pickLatestActiveEvent(rows));
      })
      .catch(() => {
        if (!mounted) return;
        setLatestActiveEvent(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const cartQuantity = useMemo(
    () => (Array.isArray(store.cart) ? store.cart : []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [store.cart]
  );

  const eventNewsItem = useMemo(() => toEventNewsItem(latestActiveEvent), [latestActiveEvent]);

  const sunlitNewsItems = [
    eventNewsItem,
    ...socialItems.map((item, itemIndex) => ({
      ...item,
      image: item.thumbnail || [HOME_IMAGES.sun, HOME_IMAGES.studio][itemIndex % 2],
      isInternal: false,
    })),
  ];

  return (
    <div className="site-shell sunlit-site-shell">
      {showRenewalPopup && !nativeApp && (
        <div className="renewal-popup-overlay" onClick={closeRenewalPopup}>
          <div className="renewal-popup" onClick={(e) => e.stopPropagation()}>
            <button
              className="renewal-popup-close"
              type="button"
              aria-label="닫기"
              onClick={closeRenewalPopup}
            >
              ✕
            </button>
            <div className="renewal-popup-icon">🔧</div>
            <h2 className="renewal-popup-title">홈페이지 리뉴얼 중입니다</h2>
            <p className="renewal-popup-message">
              더 나은 서비스를 위해 홈페이지를<br/>
              새롭게 단장하고 있습니다.<br />
              빠른 시일 내에 더 나은 모습으로 찾아뵙겠습니다
            </p>
            <button
              className="renewal-popup-confirm"
              type="button"
              onClick={closeRenewalPopup}
            >
              확인
            </button>
            <button
              className="renewal-popup-hide-today"
              type="button"
              onClick={hideRenewalPopupToday}
            >
              오늘 하루 보지 않기
            </button>
          </div>
        </div>
      )}

      <main className="sunlit-home">
        <section className="sunlit-hero home-section-card" id="hero" data-admin-draggable-card="true" style={{ order: sectionOrder.indexOf("hero") }}>
          <header className="sunlit-header" aria-label="홈 메인 내비게이션">
            <button className="sunlit-brand" type="button" onClick={() => navigate("/")}>
              <img src="/assets/images/이끌림로고.png" alt="ICL Pilates" />
            </button>

            <nav className="sunlit-nav">
              {SUNLIT_NAV_ITEMS.map((item) => (
                <div
                  className={`sunlit-nav-item${item.children?.length ? " has-menu" : ""}${
                    openSunlitNav === item.label ? " open" : ""
                  }`}
                  key={item.label}
                  onMouseEnter={() => item.children?.length && setOpenSunlitNav(item.label)}
                  onMouseLeave={() => item.children?.length && setOpenSunlitNav("")}
                >
                  <button
                    type="button"
                    aria-expanded={item.children?.length ? openSunlitNav === item.label : undefined}
                    onClick={() => {
                      if (item.children?.length) {
                        setOpenSunlitNav((current) => (current === item.label ? "" : item.label));
                        return;
                      }
                      navigate(item.path);
                    }}
                  >
                    {item.label}
                  </button>
                  {item.children?.length ? (
                    <div className="sunlit-nav-menu">
                      {item.children.map((child) => (
                        <button
                          type="button"
                          key={child.path}
                          onClick={() => {
                            setOpenSunlitNav("");
                            navigate(child.path);
                          }}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </nav>

            <div className="sunlit-actions">
              <button
                className={`sunlit-admin-button accessibility-toggle${store.largeControlsEnabled ? " active" : ""}`}
                type="button"
                aria-pressed={store.largeControlsEnabled}
                title="큰 글씨와 큰 버튼 전환"
                onClick={() => store.setLargeControlsEnabled((current) => !current)}
              >
                가+
              </button>
              {store.currentUser ? (
                <>
                  <button className="sunlit-user-button" type="button" onClick={() => navigate("/mypage")}>
                    {currentUserDisplayName}님
                  </button>
                  {canOpenAdminDashboard ? (
                    <button
                      className="sunlit-admin-button"
                      type="button"
                      onClick={() => navigate(getAdminLandingPath(store.currentUser))}
                    >
                      관리자 대시보드
                    </button>
                  ) : null}
                  {canEditHomePage ? (
                    <button
                      className={`sunlit-admin-button sunlit-edit-button${
                        store.adminPageEditMode ? " active" : ""
                      }`}
                      type="button"
                      onClick={() => store.setAdminPageEditMode((current) => !current)}
                    >
                      {store.adminPageEditMode ? "페이지 수정 ON" : "페이지 수정"}
                    </button>
                  ) : null}
                  <button type="button" onClick={handleHomeLogout}>
                    로그아웃
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => navigate("/login")}>
                    로그인
                  </button>
                  <button type="button" onClick={() => navigate("/signup")}>
                    회원가입
                  </button>
                </>
              )}
              <button className="sunlit-reserve" type="button" onClick={handleReservationClick}>
                수업 예약하기
              </button>
              {!nativeApp ? (
                <button className="sunlit-menu" type="button" onClick={() => navigate("/cart")} aria-label={cartQuantity > 0 ? `장바구니 ${cartQuantity}개` : "장바구니"}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">
                    <path
                      d="M3 5h2l2.1 9.1a1.2 1.2 0 0 0 1.2.9h8.9a1.2 1.2 0 0 0 1.2-.9L20 8H7.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="10" cy="19" r="1.2" />
                    <circle cx="17" cy="19" r="1.2" />
                  </svg>
                  {cartQuantity > 0 ? <span className="cart-count-badge">{cartQuantity}</span> : null}
                </button>
              ) : null}
            </div>

            {/* 모바일: 장바구니 + 햄버거 버튼 */}
            <div className="sunlit-mobile-right">
              <button
                className={`sunlit-mobile-accessibility accessibility-toggle${store.largeControlsEnabled ? " active" : ""}`}
                type="button"
                aria-pressed={store.largeControlsEnabled}
                title="큰 글씨와 큰 버튼 전환"
                onClick={() => store.setLargeControlsEnabled((current) => !current)}
              >
                가+
              </button>
              {!nativeApp ? (
                <button
                  type="button"
                  className="sunlit-menu"
                  onClick={() => navigate("/cart")}
                  aria-label={cartQuantity > 0 ? `장바구니 ${cartQuantity}개` : "장바구니"}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">
                    <path
                      d="M3 5h2l2.1 9.1a1.2 1.2 0 0 0 1.2.9h8.9a1.2 1.2 0 0 0 1.2-.9L20 8H7.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="10" cy="19" r="1.2" />
                    <circle cx="17" cy="19" r="1.2" />
                  </svg>
                  {cartQuantity > 0 ? <span className="cart-count-badge">{cartQuantity}</span> : null}
                </button>
              ) : null}
              <button
                type="button"
                className={`mobile-nav-toggle${mobileNavOpen ? " is-open" : ""}`}
                onClick={() => setMobileNavOpen((prev) => !prev)}
                aria-expanded={mobileNavOpen}
                aria-label={mobileNavOpen ? "메뉴 닫기" : "메뉴 열기"}
              >
                <span /><span /><span />
              </button>
            </div>
          </header>

          {/* 모바일 전체 메뉴 오버레이 */}
          {mobileNavOpen ? (
            <div className="mobile-nav-overlay" onClick={closeMobileNav}>
              <nav className="mobile-nav-panel" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="mobile-nav-item" onClick={() => { navigate("/"); closeMobileNav(); }}>메인</button>

                <div className="mobile-nav-group">
                  <span className="mobile-nav-group-label">스튜디오</span>
                  <button type="button" className="mobile-nav-sub" onClick={() => { navigate("/ikleulrim/equipment"); closeMobileNav(); }}>이끌림 소개</button>
                  <button type="button" className="mobile-nav-sub" onClick={() => { navigate("/ikleulrim/intro"); closeMobileNav(); }}>수업 소개</button>
                  <button type="button" className="mobile-nav-sub" onClick={() => { navigate("/ikleulrim/instructors"); closeMobileNav(); }}>강사진</button>
                  <button type="button" className="mobile-nav-sub" onClick={() => { navigate("/ikleulrim/directions"); closeMobileNav(); }}>오시는 길</button>
                </div>

                <div className="mobile-nav-group">
                  <span className="mobile-nav-group-label">아카데미</span>
                  <button type="button" className="mobile-nav-sub" onClick={() => { navigate("/academy"); closeMobileNav(); }}>교육 영상</button>
                </div>

                <div className="mobile-nav-group">
                  <span className="mobile-nav-group-label">커뮤니티</span>
                  <button type="button" className="mobile-nav-sub" onClick={() => { navigate("/community/reviews"); closeMobileNav(); }}>후기</button>
                  <button type="button" className="mobile-nav-sub" onClick={() => { navigate("/community/inquiry"); closeMobileNav(); }}>문의하기</button>
                </div>

                <button type="button" className="mobile-nav-item" onClick={() => { navigate("/community/events"); closeMobileNav(); }}>이벤트</button>

                <div className="mobile-nav-auth">
                  {store.currentUser ? (
                    <>
                      <button type="button" className="mobile-nav-auth-link" onClick={() => { navigate("/mypage"); closeMobileNav(); }}>
                        {currentUserDisplayName}님 마이페이지
                      </button>
                      {canOpenAdminDashboard ? (
                        <button type="button" className="mobile-nav-auth-link" onClick={() => { navigate(getAdminLandingPath(store.currentUser)); closeMobileNav(); }}>
                          관리자 대시보드
                        </button>
                      ) : null}
                      {canEditHomePage ? (
                        <button
                          type="button"
                          className="mobile-nav-auth-link"
                          onClick={() => {
                            store.setAdminPageEditMode((current) => !current);
                            closeMobileNav();
                          }}
                        >
                          {store.adminPageEditMode ? "페이지 수정 ON" : "페이지 수정"}
                        </button>
                      ) : null}
                      <button className="mobile-nav-auth-link mobile-nav-logout" type="button" onClick={handleHomeLogout}>
                        로그아웃
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="mobile-nav-auth-link" onClick={() => { navigate("/login"); closeMobileNav(); }}>로그인</button>
                      <button type="button" className="mobile-nav-auth-link mobile-nav-signup" onClick={() => { navigate("/signup"); closeMobileNav(); }}>회원가입</button>
                    </>
                  )}
                </div>
              </nav>
            </div>
          ) : null}

          <div className="sunlit-hero-copy">
            <span className="sunlit-plant-mark" aria-hidden="true" />
            <p className="sunlit-kicker">ICL PILATES · GWANGJU</p>
            <h1>
              몸을 읽고,<br />
              움직임을 설계합니다
            </h1>
            <p>
              이끌림필라테스는 움직임 교육을 기반으로 개인의 몸을 이해하고,
              건강한 움직임을 설계합니다.
            </p>
            <div className="sunlit-hero-buttons">
              <button className="sunlit-primary-button" type="button" onClick={handleReservationClick}>
                수업 예약하기
              </button>
              <button className="sunlit-outline-button" type="button" onClick={() => navigate("/ikleulrim/tour")}>
                스튜디오 둘러보기
              </button>
            </div>
          </div>

          <figure className="sunlit-hero-photo">
            <img
              src={HOME_IMAGES.hero}
              alt="자연광이 들어오는 이끌림 필라테스 메인 스튜디오"
              decoding="async"
              fetchpriority="high"
            />
          </figure>
        </section>

        <section className="sunlit-service-dock home-section-card" aria-label="주요 서비스 바로가기">
          {SUNLIT_SERVICE_CARDS.map((item) => (
            <button type="button" className="sunlit-service-card" key={item.title} onClick={() => navigate(item.path)}>
              <span className="sunlit-service-icon"><SunlitLineIcon type={item.icon} /></span>
              <strong>{item.title}</strong>
              <em>{item.text}</em>
            </button>
          ))}
        </section>

        <section className="sunlit-program-section home-section-card" id="story" data-admin-draggable-card="true" style={{ order: sectionOrder.indexOf("story") }}>
          <article className="sunlit-studio-feature">
            <div className="sunlit-studio-copy">
              <h2>
                자연과 함께하는<br />
                이끌림의 움직임 공간
              </h2>
              <p>자연 속에서 완성되는 움직임의 순환</p>
              <button className="sunlit-outline-button" type="button" onClick={() => navigate("/ikleulrim/tour")}>
                스튜디오 둘러보기 <span>→</span>
              </button>
            </div>
            <img src={HOME_IMAGES.window} alt="창가에 배치된 필라테스 기구" loading="lazy" />
          </article>

          <div className="sunlit-feature-grid" id="features" data-admin-draggable-card="true" style={{ order: sectionOrder.indexOf("features") }}>
            {SUNLIT_FEATURE_CARDS.map((item) => (
              <article className="sunlit-feature-card" key={item.title}>
                <span><SunlitLineIcon type={item.icon} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <button type="button" onClick={() => navigate(item.icon === "video" ? "/academy" : "/ikleulrim/intro")}>
                  자세히 보기 <span>→</span>
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="sunlit-news-panel home-section-card" id="status" data-admin-bg-editable data-admin-draggable-card="true" style={{ order: sectionOrder.indexOf("status") }}>
          <div className="sunlit-news-intro">
            <p>ICL NEWS</p>
            <h2>지금 이끌림의 소식</h2>
            <span>이끌림의 다양한 소식과 이벤트, 새로운 프로그램을 만나보세요.</span>
            <button type="button" onClick={() => navigate("/community/events")}>
              전체 소식 보기 <em>→</em>
            </button>
          </div>

          <div className="sunlit-news-list">
            {sunlitNewsItems.map((item, itemIndex) => (
              <article className="sunlit-news-card" key={item.source}>
                <div>
                  <span className={`sunlit-source ${item.source}`}>
                    <SocialSourceIcon source={item.source} />
                    {SOCIAL_SOURCE_NAME_MAP[item.source] || item.source}
                  </span>
                  <h3>
                    <a
                      href={item.url}
                      target={item.isInternal ? undefined : "_blank"}
                      rel={item.isInternal ? undefined : "noreferrer noopener"}
                    >
                      {item.title}
                    </a>
                  </h3>
                  <a
                    href={item.url}
                    target={item.isInternal ? undefined : "_blank"}
                    rel={item.isInternal ? undefined : "noreferrer noopener"}
                  >
                    자세히 보기 <span>→</span>
                  </a>
                </div>
                {item.source === "blog" ? (
                  <div className="sunlit-news-platform-thumb sunlit-news-platform-thumb--blog">
                    <img src="/assets/images/naver-blog-logo.webp" alt="Naver Blog" />
                  </div>
                ) : item.source === "instagram" ? (
                  <div className="sunlit-news-platform-thumb sunlit-news-platform-thumb--instagram">
                    <img src="/assets/images/instagram-logo.jpg" alt="Instagram" />
                  </div>
                ) : itemIndex > 0 || item.image ? (
                  <img src={resolveApiAssetUrl(item.image)} alt={item.title} loading="lazy" onError={handleSocialThumbnailError} />
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

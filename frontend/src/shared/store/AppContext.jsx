// 파일 역할: 로그인 사용자, 장바구니, 주문, 강의, 진도 등 앱 전역 상태를 관리합니다.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/client.js";
import {
  ACADEMY_VIDEOS,
  getAcademyPlaybackSourceByVideoId,
} from "../../features/academy/data/academyVideos.js";
import {
  listAcademyProgress,
  listAcademyVideos,
  saveAcademyChapterProgress as saveAcademyChapterProgressApi,
  saveAcademyProgress as saveAcademyProgressApi,
} from "../../features/academy/api/academyApi.js";
import { canEditPage } from "../auth/userRoles.js";

const AppContext = createContext(null);

// 서버가 비어 있거나 로딩에 실패해도 화면이 최소한으로 동작하도록 사용하는 기본 상품 데이터다.
const DEFAULT_PRODUCTS = [
  {
    id: "starter",
    name: "Starter Guide Pack",
    price: 129000,
    description: "입문자를 위한 필라테스 기본 가이드",
    period: "90일",
  },
  {
    id: "cueing",
    name: "Cueing & Sequencing Master",
    price: 219000,
    description: "실전 코칭 큐잉과 시퀀싱 심화 과정",
    period: "180일",
  },
  {
    id: "premium",
    name: "Premium Academy Bundle",
    price: 349000,
    description: "강사 교육 + 운영 가이드를 묶은 통합 번들",
    period: "365일",
  },
];

const DEFAULT_VIDEO_PRODUCTS = ACADEMY_VIDEOS.map((video) => ({
  id: video.productId || video.id,
  name: video.title,
  price: Number(video.salePrice || 0),
  description: `${video.instructor} · ${video.category}`,
  period: "온라인 수강",
}));

const FALLBACK_PRODUCT_MAP = toProductMap([...DEFAULT_PRODUCTS, ...DEFAULT_VIDEO_PRODUCTS]);

const DEFAULT_ACADEMY_VIDEOS = ACADEMY_VIDEOS.map((video) => ({
  ...video,
  productId: video.productId || video.id,
  videoUrl: video.videoUrl || getAcademyPlaybackSourceByVideoId(video.id),
}));

// 함수 역할: 상품 맵 값으로 안전하게 변환합니다.
function toProductMap(products) {
  return Object.fromEntries(products.map((item) => [item.id, item]));
}

// 함수 역할: 통화 값을 화면에 보여주기 좋은 문구로 변환합니다.
function formatCurrency(amount) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}

// 함수 역할: 학습 진도 항목 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeProgressItem(item) {
  const duration = Number(item?.duration || 0);
  const currentTime = Number(item?.currentTime || 0);
  const completed = Boolean(item?.completed);
  const fallbackProgress =
    duration > 0 ? Math.round((Math.max(0, Math.min(duration, currentTime)) / duration) * 100) : 0;
  const progressPercent = Math.max(
    0,
    Math.min(100, Number(item?.progressPercent ?? fallbackProgress) || 0)
  );

  return {
    videoId: String(item?.videoId || ""),
    currentTime: Math.max(0, currentTime),
    duration: Math.max(0, duration),
    progressPercent,
    completed,
    lastWatchedAt: item?.lastWatchedAt || item?.updatedAt || item?.createdAt || "",
  };
}

// 함수 역할: 차시 학습 진도 항목 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeChapterProgressItem(item) {
  const duration = Number(item?.duration || 0);
  const currentTime = Number(item?.currentTime || 0);
  const completed = Boolean(item?.completed);
  const fallbackProgress =
    duration > 0 ? Math.round((Math.max(0, Math.min(duration, currentTime)) / duration) * 100) : 0;
  const progressPercent = Math.max(
    0,
    Math.min(100, Number(item?.progressPercent ?? fallbackProgress) || 0)
  );

  return {
    videoId: String(item?.videoId || ""),
    chapterId: String(item?.chapterId || ""),
    chapterOrder: Number(item?.chapterOrder || 0),
    chapterTitle: String(item?.chapterTitle || ""),
    currentTime: Math.max(0, currentTime),
    duration: Math.max(0, duration),
    progressPercent,
    completed,
    lastWatchedAt: item?.lastWatchedAt || item?.updatedAt || item?.createdAt || "",
  };
}

// AppProvider는 로그인 사용자, 장바구니, 주문, 강의 목록처럼
// 여러 페이지에서 함께 쓰는 데이터를 한곳에서 관리한다.
// 컴포넌트 역할: 전역 상태와 액션을 준비해 하위 컴포넌트에서 공유할 수 있게 제공합니다.
export function AppProvider({ children }) {
  const [products, setProducts] = useState(() => FALLBACK_PRODUCT_MAP);
  const [academyVideos, setAcademyVideos] = useState([]);
  const [academyProgress, setAcademyProgress] = useState([]);
  const [academyChapterProgress, setAcademyChapterProgress] = useState([]);
  const [users] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [adminPageEditMode, setAdminPageEditMode] = useState(false);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [userPoints, setUserPoints] = useState(0);

  // 상품 목록은 서버 데이터에 기본값을 섞어 화면이 비는 상황을 줄인다.
  async function refreshProducts() {
    const rows = await apiRequest("/products");
    if (!Array.isArray(rows) || rows.length === 0) return;
    setProducts(toProductMap([...DEFAULT_PRODUCTS, ...DEFAULT_VIDEO_PRODUCTS, ...rows]));
  }

  // 강의 메타데이터는 서버 응답과 프론트 기본값을 합쳐 누락 필드를 보완한다.
  async function refreshAcademyVideos() {
    const rows = await listAcademyVideos();
    if (!Array.isArray(rows) || rows.length === 0) {
      setAcademyVideos([]);
      return;
    }

    const fallbackMap = new Map(
      DEFAULT_ACADEMY_VIDEOS.map((video) => [String(video.id || video.productId), video])
    );

    const merged = rows.map((row) => {
      const fallback = fallbackMap.get(String(row.id || row.productId)) || {};
      return {
        ...fallback,
        ...row,
        id: String(row.id || row.productId || fallback.id || ""),
        productId: String(row.productId || row.id || fallback.productId || ""),
        image: row.image || fallback.image || "",
        videoUrl:
          row.videoUrl || fallback.videoUrl || getAcademyPlaybackSourceByVideoId(row.id || row.productId),
        chapters: Array.isArray(row.chapters) ? row.chapters : Array.isArray(fallback.chapters) ? fallback.chapters : [],
      };
    });

    setAcademyVideos(merged);
  }

  // 로그인한 사용자 기준으로 장바구니를 다시 가져온다.
  async function refreshCart(userId = currentUser?.id) {
    if (!userId) {
      setCart([]);
      return;
    }

    const result = await apiRequest(`/cart?userId=${encodeURIComponent(userId)}`);
    setCart(Array.isArray(result?.items) ? result.items : []);
  }

  // 주문 내역은 고객 이메일 기준으로 조회한다.
  async function refreshOrders(customerEmail = currentUser?.email) {
    const normalizedEmail = String(customerEmail || "").trim();
    const rows = normalizedEmail
      ? await apiRequest(`/orders?email=${encodeURIComponent(normalizedEmail)}`)
      : await apiRequest("/orders");
    setOrders(Array.isArray(rows) ? rows : []);
  }

  async function refreshPoints() {
    try {
      const result = await apiRequest("/users/me/points");
      setUserPoints(Number(result?.points ?? 0));
    } catch {
      setUserPoints(0);
    }
  }

  async function refreshAcademyProgress(userId = currentUser?.id) {
    if (!userId) {
      setAcademyProgress([]);
      setAcademyChapterProgress([]);
      return [];
    }

    const result = await listAcademyProgress();
    const normalized = (Array.isArray(result?.items) ? result.items : [])
      .map(normalizeProgressItem)
      .filter((item) => item.videoId);
    const normalizedChapter = (Array.isArray(result?.chapterItems) ? result.chapterItems : [])
      .map(normalizeChapterProgressItem)
      .filter((item) => item.videoId && item.chapterId);

    setAcademyProgress(normalized);
    setAcademyChapterProgress(normalizedChapter);
    return normalized;
  }

  async function saveAcademyProgress(videoId, payload) {
    if (!currentUser?.id) {
      throw new Error("학습 진도 저장은 로그인 후 이용 가능합니다.");
    }

    const saved = normalizeProgressItem(
      await saveAcademyProgressApi(videoId, {
        currentTime: Number(payload?.currentTime || 0),
        duration: Number(payload?.duration || 0),
        completed: Boolean(payload?.completed),
      })
    );

    if (!saved.videoId) return saved;

    setAcademyProgress((current) => {
      const next = current.filter((item) => item.videoId !== saved.videoId);
      next.push(saved);
      return next.sort(
        (a, b) => new Date(b.lastWatchedAt || 0).getTime() - new Date(a.lastWatchedAt || 0).getTime()
      );
    });

    return saved;
  }

  async function saveAcademyChapterProgress(videoId, chapterId, payload) {
    if (!currentUser?.id) {
      throw new Error("학습 진도 저장은 로그인 후 이용 가능합니다.");
    }

    const response = await saveAcademyChapterProgressApi(videoId, chapterId, {
      currentTime: Number(payload?.currentTime || 0),
      duration: Number(payload?.duration || 0),
      completed: Boolean(payload?.completed),
    });
    const savedChapter = normalizeChapterProgressItem(response);
    const savedLecture = normalizeProgressItem(response?.lectureProgress || {});

    if (savedChapter.videoId && savedChapter.chapterId) {
      setAcademyChapterProgress((current) => {
        const next = current.filter(
          (item) => !(item.videoId === savedChapter.videoId && item.chapterId === savedChapter.chapterId)
        );
        next.push(savedChapter);
        return next.sort(
          (a, b) => new Date(b.lastWatchedAt || 0).getTime() - new Date(a.lastWatchedAt || 0).getTime()
        );
      });
    }

    if (savedLecture.videoId) {
      setAcademyProgress((current) => {
        const next = current.filter((item) => item.videoId !== savedLecture.videoId);
        next.push(savedLecture);
        return next.sort(
          (a, b) => new Date(b.lastWatchedAt || 0).getTime() - new Date(a.lastWatchedAt || 0).getTime()
        );
      });
    }

    return { ...savedChapter, lectureProgress: savedLecture };
  }

  // 앱 최초 진입 시 세션 복구와 공개 데이터를 병렬로 불러온다.
  // 세션 복구가 끝난 뒤 사용자 전용 데이터(cart/orders/progress)는
  // currentUser 변경 이펙트에서 자동으로 로드된다.
  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const [, , authResult] = await Promise.allSettled([
        refreshProducts(),
        refreshAcademyVideos(),
        apiRequest("/auth/me"),
      ]);

      if (!mounted) return;

      const user = authResult.status === "fulfilled" ? (authResult.value?.user || null) : null;
      setCurrentUser(user);
      setIsAuthResolved(true);
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  // 로그인 사용자가 바뀌면 장바구니/주문 데이터를 함께 갱신한다.
  useEffect(() => {
    if (!currentUser?.id || !currentUser?.email) {
      setCart([]);
      setOrders([]);
      setAcademyProgress([]);
      setAcademyChapterProgress([]);
      setAdminPageEditMode(false);
      setUserPoints(0);
      return;
    }

    Promise.all([
      refreshCart(currentUser.id),
      refreshOrders(currentUser.email),
      refreshAcademyProgress(currentUser.id),
      refreshPoints(),
    ]).catch((error) => {
      console.error("[store] user data load failed", error);
    });
  }, [currentUser?.id, currentUser?.email]);

  // 관리자0이 아니면 페이지 수정 모드를 강제로 끈다.
  useEffect(() => {
    if (!canEditPage(currentUser)) {
      setAdminPageEditMode(false);
    }
  }, [currentUser]);

  async function signupUser(payload) {
    const result = await apiRequest("/auth/signup", {
      method: "POST",
      body: payload,
    });

    const authenticatedUser = { ...(result.user || {}) };
    setCurrentUser(authenticatedUser);
    return authenticatedUser;
  }

  async function loginUser(loginId, password) {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: { loginId, password },
    });

    const authenticatedUser = { ...(result.user || {}) };
    setCurrentUser(authenticatedUser);
    return authenticatedUser;
  }

  async function findUserLoginId(name, phone) {
    const result = await apiRequest("/auth/find-id", {
      method: "POST",
      body: { name, phone },
    });
    return String(result?.loginId || "");
  }

  async function resetUserPassword({ loginId, name, phone, newPassword }) {
    return apiRequest("/auth/reset-password", {
      method: "POST",
      body: { loginId, name, phone, newPassword },
    });
  }

  async function requestEmailVerification(email) {
    return apiRequest("/users/me/email-verification/request", {
      method: "POST",
      body: { email },
    });
  }

  async function confirmEmailVerification(email, code) {
    return apiRequest("/users/me/email-verification/confirm", {
      method: "POST",
      body: { email, code },
    });
  }

  async function requestWithdrawPhoneVerification(phone) {
    // 회원 탈퇴 전 휴대폰 인증번호 발송 요청 처리
    return apiRequest("/users/me/withdraw/phone-verification/request", {
      method: "POST",
      body: { phone },
    });
  }

  async function confirmWithdrawPhoneVerification(phone, code) {
    // 회원 탈퇴 전 휴대폰 인증번호 확인 요청 처리
    return apiRequest("/users/me/withdraw/phone-verification/confirm", {
      method: "POST",
      body: { phone, code },
    });
  }

  async function updateMyProfile(payload) {
    const result = await apiRequest("/users/me", {
      method: "PATCH",
      body: payload,
    });
    const updatedUser = { ...(result?.user || {}) };
    setCurrentUser(updatedUser);
    await Promise.all([
      refreshCart(updatedUser.id),
      refreshOrders(updatedUser.email),
      refreshAcademyProgress(updatedUser.id),
    ]);
    return updatedUser;
  }

  async function logoutUser() {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      // 로그아웃 API 실패 시에도 클라이언트 상태는 비웁니다.
    } finally {
      setCurrentUser(null);
      setCart([]);
      setOrders([]);
      setAcademyProgress([]);
      setAcademyChapterProgress([]);
      setAdminPageEditMode(false);
      setUserPoints(0);
    }
  }

  async function withdrawMe(phone) {
    // 회원 탈퇴 완료 후 전역 사용자 상태 초기화 처리
    const result = await apiRequest("/users/me/withdraw", {
      method: "POST",
      body: { phone },
    });

    setCurrentUser(null);
    setCart([]);
    setOrders([]);
    setAcademyProgress([]);
    setAcademyChapterProgress([]);
    setAdminPageEditMode(false);
    setUserPoints(0);
    return result;
  }

  async function addToCart(productId, quantity = 1) {
    if (!currentUser?.id) {
      throw new Error("장바구니는 로그인 후 이용 가능합니다.");
    }

    const result = await apiRequest(`/cart/items?userId=${encodeURIComponent(currentUser.id)}`, {
      method: "POST",
      body: { productId, quantity },
    });
    setCart(Array.isArray(result?.items) ? result.items : []);
    return result;
  }

  async function updateCartItem(productId, quantity) {
    if (!currentUser?.id) {
      throw new Error("장바구니 수정은 로그인 후 이용 가능합니다.");
    }

    const result = await apiRequest(
      `/cart/items/${encodeURIComponent(productId)}?userId=${encodeURIComponent(currentUser.id)}`,
      {
        method: "PUT",
        body: { quantity },
      }
    );
    setCart(Array.isArray(result?.items) ? result.items : []);
    return result;
  }

  async function removeCartItem(productId) {
    if (!currentUser?.id) {
      throw new Error("장바구니 삭제는 로그인 후 이용 가능합니다.");
    }

    const result = await apiRequest(
      `/cart/items/${encodeURIComponent(productId)}?userId=${encodeURIComponent(currentUser.id)}`,
      {
        method: "DELETE",
      }
    );
    setCart(Array.isArray(result?.items) ? result.items : []);
    return result;
  }

  async function persistOrder(order) {
    const createdOrder = await apiRequest("/orders", {
      method: "POST",
      body: order,
    });

    await refreshOrders(order?.customerEmail || currentUser?.email || "");
    return createdOrder;
  }

  function buildOrderId() {
    return `pilates-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // 장바구니 항목에 실제 상품 정보를 붙여 결제/합계 계산에 바로 쓸 수 있게 만든다.
  const cartDetailed = useMemo(
    () =>
      cart
        .map((item) => {
          const product = products[item.productId] || FALLBACK_PRODUCT_MAP[item.productId];
          if (!product) {
            return {
              ...item,
              product: {
                id: item.productId,
                name: "상품 정보 확인 중",
                price: 0,
                description: "상품 정보를 불러오는 중입니다.",
                period: "-",
              },
              lineTotal: 0,
            };
          }

          return {
            ...item,
            product,
            lineTotal: Number(product.price || 0) * Number(item.quantity || 0),
          };
        })
        .filter(Boolean),
    [cart, products]
  );

  const cartTotal = cartDetailed.reduce((sum, item) => sum + item.lineTotal, 0);

  return (
    <AppContext.Provider
      value={{
        products,
        academyVideos,
        academyProgress,
        academyChapterProgress,
        users,
        currentUser,
        adminPageEditMode,
        setAdminPageEditMode,
        isAuthResolved,
        cart,
        cartDetailed,
        cartTotal,
        orders,
        formatCurrency,
        addToCart,
        updateCartItem,
        removeCartItem,
        signupUser,
        loginUser,
        findUserLoginId,
        resetUserPassword,
        requestEmailVerification,
        confirmEmailVerification,
        requestWithdrawPhoneVerification,
        confirmWithdrawPhoneVerification,
        updateMyProfile,
        logoutUser,
        withdrawMe,
        refreshCart,
        refreshOrders,
        refreshProducts,
        refreshAcademyVideos,
        refreshAcademyProgress,
        saveAcademyProgress,
        saveAcademyChapterProgress,
        persistOrder,
        buildOrderId,
        userPoints,
        refreshPoints,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// 함수 역할: 전역 앱 컨텍스트를 안전하게 꺼내 쓰기 위한 커스텀 훅입니다.
export function useAppStore() {
  return useContext(AppContext);
}

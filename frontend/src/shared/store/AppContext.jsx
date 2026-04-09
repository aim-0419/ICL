import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/client.js";
import { ACADEMY_VIDEOS } from "../../features/academy/data/academyVideos.js";

const AppContext = createContext(null);

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

function toProductMap(products) {
  return Object.fromEntries(products.map((item) => [item.id, item]));
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function AppProvider({ children }) {
  const [products, setProducts] = useState(() => FALLBACK_PRODUCT_MAP);
  const [users] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [adminPageEditMode, setAdminPageEditMode] = useState(false);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);

  async function refreshProducts() {
    const rows = await apiRequest("/products");
    if (!Array.isArray(rows) || rows.length === 0) return;
    setProducts(toProductMap([...DEFAULT_PRODUCTS, ...DEFAULT_VIDEO_PRODUCTS, ...rows]));
  }

  async function refreshCart(userId = currentUser?.id) {
    if (!userId) {
      setCart([]);
      return;
    }

    const result = await apiRequest(`/cart?userId=${encodeURIComponent(userId)}`);
    setCart(Array.isArray(result?.items) ? result.items : []);
  }

  async function refreshOrders(customerEmail = currentUser?.email) {
    if (!customerEmail) {
      setOrders([]);
      return;
    }

    const rows = await apiRequest(`/orders?email=${encodeURIComponent(customerEmail)}`);
    setOrders(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    refreshProducts().catch((error) => {
      console.error("[products] load failed", error);
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const result = await apiRequest("/auth/me");
        if (!mounted) return;
        setCurrentUser(result?.user || null);
      } catch {
        if (!mounted) return;
        setCurrentUser(null);
      } finally {
        if (mounted) setIsAuthResolved(true);
      }
    }

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.id || !currentUser?.email) {
      setCart([]);
      setOrders([]);
      setAdminPageEditMode(false);
      return;
    }

    Promise.all([refreshCart(currentUser.id), refreshOrders(currentUser.email)]).catch((error) => {
      console.error("[store] user data load failed", error);
    });
  }, [currentUser?.id, currentUser?.email]);

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

  async function updateMyProfile(payload) {
    const result = await apiRequest("/users/me", {
      method: "PATCH",
      body: payload,
    });
    const updatedUser = { ...(result?.user || {}) };
    setCurrentUser(updatedUser);
    await Promise.all([refreshCart(updatedUser.id), refreshOrders(updatedUser.email)]);
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
      setAdminPageEditMode(false);
    }
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
        updateMyProfile,
        logoutUser,
        refreshCart,
        refreshOrders,
        persistOrder,
        buildOrderId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  return useContext(AppContext);
}

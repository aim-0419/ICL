import { createContext, useContext, useEffect, useState } from "react";

const AppContext = createContext(null);

const PRODUCTS = {
  starter: {
    id: "starter",
    name: "Starter Guide Pack",
    price: 129000,
    description: "기초 해부학, 자세 분석, 수업 도입 스크립트를 담은 입문 패키지",
    period: "90일",
  },
  cueing: {
    id: "cueing",
    name: "Cueing & Sequencing Master",
    price: 219000,
    description: "회원 반응을 끌어내는 큐잉 언어와 시퀀스 설계 노하우 집중 과정",
    period: "180일",
  },
  premium: {
    id: "premium",
    name: "Premium Academy Bundle",
    price: 349000,
    description: "강사 교육, 회원 상담, 스튜디오 운영 가이드를 한 번에 묶은 통합 번들",
    period: "365일",
  },
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function AppProvider({ children }) {
  const [users, setUsers] = useState(() => readJson("pilates-users", []));
  const [currentUser, setCurrentUser] = useState(() => readJson("pilates-current-user", null));
  const [cart, setCart] = useState(() => readJson("pilates-cart", []));
  const [orders, setOrders] = useState(() => readJson("pilates-orders", []));

  useEffect(() => {
    localStorage.setItem("pilates-users", JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("pilates-current-user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("pilates-current-user");
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem("pilates-cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem("pilates-orders", JSON.stringify(orders));
  }, [orders]);

  function addToCart(productId, quantity = 1) {
    setCart((current) => {
      const next = [...current];
      const existing = next.find((item) => item.productId === productId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        next.push({ productId, quantity });
      }
      return next;
    });
  }

  function updateCartItem(productId, quantity) {
    setCart((current) =>
      current
        .map((item) => (item.productId === productId ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  function removeCartItem(productId) {
    setCart((current) => current.filter((item) => item.productId !== productId));
  }

  function signupUser(payload) {
    if (users.some((user) => user.email === payload.email)) {
      throw new Error("이미 가입된 이메일입니다.");
    }

    const user = {
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...payload,
    };

    setUsers((current) => [user, ...current]);
    setCurrentUser(user);
    return user;
  }

  function loginUser(email, password) {
    const user = users.find((item) => item.email === email && item.password === password);
    if (!user) {
      throw new Error("이메일 또는 비밀번호를 확인해주세요.");
    }
    setCurrentUser(user);
    return user;
  }

  function logoutUser() {
    setCurrentUser(null);
  }

  function persistOrder(order) {
    setOrders((current) => [order, ...current].slice(0, 20));
  }

  function buildOrderId() {
    return `pilates-${Date.now()}`;
  }

  const cartDetailed = cart
    .map((item) => {
      const product = PRODUCTS[item.productId];
      if (!product) {
        return null;
      }

      return {
        ...item,
        product,
        lineTotal: product.price * item.quantity,
      };
    })
    .filter(Boolean);

  const cartTotal = cartDetailed.reduce((sum, item) => sum + item.lineTotal, 0);

  return (
    <AppContext.Provider
      value={{
        products: PRODUCTS,
        users,
        currentUser,
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
        logoutUser,
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

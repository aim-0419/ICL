/**
 * 백엔드 애플리케이션 진입점 (app.js)
 * - Express 앱을 생성하고 모든 미들웨어, 라우터, 에러 핸들러를 조립
 *
 * 미들웨어 순서:
 * 1. 보안 헤더 (X-Content-Type-Options, X-Frame-Options, HSTS 등)
 * 2. CORS (프론트엔드 도메인 허용, credentials: true)
 * 3. JSON 파서
 * 4. 헬스 체크 (GET /api/health)
 * 5. 기능별 API 라우터 11개
 * 6. 업로드 파일 정적 서빙 (/uploads, 단 /uploads/academy/videos는 403 차단)
 * 7. 404 핸들러 → 공통 에러 핸들러
 *
 * 라우터 매핑:
 * /api/auth       → 인증 (로그인·가입·세션)
 * /api/users      → 회원 프로필·탈퇴·포인트
 * /api/products   → 상품 목록·관리
 * /api/cart       → 장바구니
 * /api/orders     → 주문
 * /api/payments   → 결제 확정 (PortOne)
 * /api/community  → 후기·이벤트·문의·소셜피드
 * /api/admin      → 관리자 대시보드·회원관리·선물·페이지오버라이드
 * /api/academy    → 강의·재생·진도·수강평·Q&A
 * /api/brand      → 강사·지점 정보
 * /api/refunds    → 환불 신청·처리
 */
// 파일 역할: Express 앱을 만들고 공통 미들웨어, 정적 업로드, 기능별 API 라우터, 에러 핸들러를 연결합니다.
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { authRoutes } from "./features/auth/auth.routes.js";
import { usersRoutes } from "./features/users/users.routes.js";
import { productsRoutes } from "./features/products/products.routes.js";
import { cartRoutes } from "./features/cart/cart.routes.js";
import { ordersRoutes } from "./features/orders/orders.routes.js";
import { paymentsRoutes } from "./features/payments/payments.routes.js";
import { communityRoutes } from "./features/community/community.routes.js";
import { adminRoutes } from "./features/admin/admin.routes.js";
import { academyRoutes } from "./features/academy/academy.routes.js";
import { brandRoutes } from "./features/brand/brand.routes.js";
import { refundsRoutes } from "./features/refunds/refunds.routes.js";
import { pingDatabase } from "./shared/db/mysql.js";
import { errorHandler, notFoundHandler } from "./shared/middlewares/error-handler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, "..", "uploads");
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function resolveOriginHeader(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = String(rawValue || "").trim();
  if (!normalized) return "";

  try {
    return new URL(normalized).origin;
  } catch {
    return "";
  }
}

// 함수 역할: Express 인스턴스를 만들고 CORS, JSON 파서, 기능별 API 라우터, 업로드 정적 경로를 등록합니다.
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (env.nodeEnv === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
  });

  // 프론트엔드에서 쿠키 기반 세션을 사용할 수 있도록 CORS와 JSON 파서를 먼저 연결한다.
  const allowedOrigins = new Set(
    String(env.corsOrigin || "").split(",").map((o) => o.trim()).filter(Boolean)
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        callback(new Error(`CORS: origin not allowed — ${origin}`));
      },
      credentials: true,
      exposedHeaders: ["Content-Range", "Accept-Ranges", "Content-Length"],
    })
  );
  app.use((req, res, next) => {
    if (!STATE_CHANGING_METHODS.has(String(req.method || "").toUpperCase())) {
      next();
      return;
    }

    const requestOrigin = resolveOriginHeader(req.headers.origin) || resolveOriginHeader(req.headers.referer);
    if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
      res.status(403).json({ message: "허용되지 않은 요청 출처입니다." });
      return;
    }

    next();
  });
  app.use("/api/payments/webhook", express.raw({ type: "application/json", limit: "128kb" }));
  app.use(express.json());

  // 헬스 체크는 DB 연결까지 확인해서 프론트/배포 환경에서 빠르게 상태를 진단할 수 있게 한다.
  app.get("/api/health", async (req, res, next) => {
    try {
      await pingDatabase();
      res.json({
        ok: true,
        service: "icl-pilates-api",
        database: "mysql",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  // 기능별 라우터를 도메인 단위로 분리해 연결한다.
  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/products", productsRoutes);
  app.use("/api/cart", cartRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/payments", paymentsRoutes);
  app.use("/api/community", communityRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/academy", academyRoutes);
  app.use("/api/brand", brandRoutes);
  app.use("/api/refunds", refundsRoutes);
  app.use("/uploads/academy/videos", (req, res) => {
    res.status(403).json({ message: "직접 영상 접근이 차단되었습니다. 보안 재생 링크를 사용해 주세요." });
  });
  app.use("/uploads", express.static(uploadRoot));

  // 등록되지 않은 경로와 예외는 마지막에 공통 핸들러로 정리한다.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

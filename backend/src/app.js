import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "./config/env.js";
import { academyRoutes } from "./features/academy/academy.routes.js";
import { adminRoutes } from "./features/admin/admin.routes.js";
import { getPageOverrides } from "./features/admin/admin.controller.js";
import { authRoutes } from "./features/auth/auth.routes.js";
import { brandRoutes } from "./features/brand/brand.routes.js";
import { cartRoutes } from "./features/cart/cart.routes.js";
import { communityRoutes } from "./features/community/community.routes.js";
import { ordersRoutes } from "./features/orders/orders.routes.js";
import { paymentsRoutes } from "./features/payments/payments.routes.js";
import { productsRoutes } from "./features/products/products.routes.js";
import { refundsRoutes } from "./features/refunds/refunds.routes.js";
import { smsRoutes } from "./features/sms/sms.routes.js";
import { studioRoutes } from "./features/studio/studio.routes.js";
import { usersRoutes } from "./features/users/users.routes.js";
import { pingDatabase } from "./shared/db/mysql.js";
import { errorHandler, notFoundHandler } from "./shared/middlewares/error-handler.js";
import { createRateLimiter } from "./shared/middlewares/rate-limit.js";
import { requestContext } from "./shared/middlewares/request-context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, "..", "uploads");
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const apiWriteRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 180,
  skip: (req) => !STATE_CHANGING_METHODS.has(req.method) || req.path === "/payments/webhook",
});

function resolveOriginHeader(req) {
  return req.get("origin") || req.get("referer") || "";
}

export function createApp() {
  const app = express();
  const allowedOrigins = new Set(
    String(env.corsOrigin || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  if (env.nodeEnv !== "production") {
    allowedOrigins.add("http://localhost:5173");
    allowedOrigins.add("http://127.0.0.1:5173");
    allowedOrigins.add("http://localhost:4175");
    allowedOrigins.add("http://127.0.0.1:4175");
  }

  const isAllowedOrigin = (origin) => {
    if (!origin) return true;

    try {
      const parsedOrigin = new URL(origin).origin;
      if (allowedOrigins.has(parsedOrigin)) return true;

      if (env.nodeEnv !== "production") {
        const hostname = new URL(origin).hostname;
        if (hostname.endsWith(".ngrok-free.dev")) return true;
      }

      return false;
    } catch {
      return false;
    }
  };

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestContext);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );

    if (env.nodeEnv === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  });

  app.use("/api", apiWriteRateLimiter);

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        const error = new Error("허용되지 않은 출처의 요청입니다.");
        error.status = 403;
        error.code = "CORS_ORIGIN_DENIED";
        callback(error);
      },
      credentials: true,
      exposedHeaders: ["Content-Disposition", "X-Request-Id"],
    }),
  );

  app.use((req, res, next) => {
    if (!STATE_CHANGING_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = resolveOriginHeader(req);
    if (isAllowedOrigin(origin)) {
      next();
      return;
    }

    res.status(403).json({
      message: "허용되지 않은 출처의 요청입니다.",
      code: "REQUEST_ORIGIN_DENIED",
      requestId: req.requestId,
    });
  });

  app.use(
    "/api/payments/webhook",
    express.raw({ type: "application/json", limit: "128kb" }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", async (req, res, next) => {
    try {
      await pingDatabase();
      res.json({
        status: "ok",
        database: "connected",
        requestId: req.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/products", productsRoutes);
  app.use("/api/cart", cartRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/payments", paymentsRoutes);
  app.use("/api/community", communityRoutes);
  app.use("/api/admin", adminRoutes);
  app.get("/api/page-overrides", getPageOverrides);
  app.use("/api/academy", academyRoutes);
  app.use("/api/brand", brandRoutes);
  app.use("/api/refunds", refundsRoutes);
  app.use("/api/studio", studioRoutes);
  app.use("/api/sms", smsRoutes);

  app.use("/uploads/videos", (req, res) => {
    res.status(403).json({
      message: "영상 파일에 직접 접근할 수 없습니다. 보안 재생 링크를 사용해 주세요.",
      code: "DIRECT_VIDEO_ACCESS_DENIED",
      requestId: req.requestId,
    });
  });
  app.use("/uploads", express.static(uploadRoot));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

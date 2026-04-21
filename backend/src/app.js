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
import { pingDatabase } from "./shared/db/mysql.js";
import { errorHandler, notFoundHandler } from "./shared/middlewares/error-handler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, "..", "uploads");

export function createApp() {
  const app = express();

  // 프론트엔드에서 쿠키 기반 세션을 사용할 수 있도록 CORS와 JSON 파서를 먼저 연결한다.
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    })
  );
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
  app.use("/uploads", express.static(uploadRoot));

  // 등록되지 않은 경로와 예외는 마지막에 공통 핸들러로 정리한다.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

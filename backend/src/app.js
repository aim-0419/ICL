import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { authRoutes } from "./features/auth/auth.routes.js";
import { usersRoutes } from "./features/users/users.routes.js";
import { productsRoutes } from "./features/products/products.routes.js";
import { cartRoutes } from "./features/cart/cart.routes.js";
import { ordersRoutes } from "./features/orders/orders.routes.js";
import { paymentsRoutes } from "./features/payments/payments.routes.js";
import { errorHandler, notFoundHandler } from "./shared/middlewares/error-handler.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "icl-pilates-api", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/products", productsRoutes);
  app.use("/api/cart", cartRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/payments", paymentsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

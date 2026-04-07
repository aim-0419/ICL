import { Router } from "express";
import * as ordersController from "./orders.controller.js";

export const ordersRoutes = Router();

ordersRoutes.get("/", ordersController.getOrders);
ordersRoutes.post("/", ordersController.createOrder);

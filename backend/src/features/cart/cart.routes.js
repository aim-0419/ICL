import { Router } from "express";
import * as cartController from "./cart.controller.js";

export const cartRoutes = Router();

cartRoutes.get("/", cartController.getCart);
cartRoutes.post("/items", cartController.addItem);
cartRoutes.put("/items/:productId", cartController.updateItem);
cartRoutes.delete("/items/:productId", cartController.removeItem);

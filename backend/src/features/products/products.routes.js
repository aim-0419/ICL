import { Router } from "express";
import * as productsController from "./products.controller.js";

export const productsRoutes = Router();

productsRoutes.get("/", productsController.getProducts);

import { Router } from "express";
import * as paymentsController from "./payments.controller.js";

export const paymentsRoutes = Router();

paymentsRoutes.post("/confirm", paymentsController.confirm);

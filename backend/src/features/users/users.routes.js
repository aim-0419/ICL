import { Router } from "express";
import * as usersController from "./users.controller.js";

export const usersRoutes = Router();

usersRoutes.get("/", usersController.getUsers);
usersRoutes.patch("/me", usersController.updateMe);
usersRoutes.post("/me/email-verification/request", usersController.requestEmailVerification);
usersRoutes.post("/me/email-verification/confirm", usersController.confirmEmailVerification);

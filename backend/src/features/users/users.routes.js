import express, { Router } from "express";
import * as usersController from "./users.controller.js";

export const usersRoutes = Router();

usersRoutes.get("/", usersController.getUsers);
usersRoutes.patch("/me", usersController.updateMe);
usersRoutes.post("/me/email-verification/request", usersController.requestEmailVerification);
usersRoutes.post("/me/email-verification/confirm", usersController.confirmEmailVerification);
usersRoutes.post(
  "/me/withdraw/phone-verification/request",
  express.json(),
  usersController.requestWithdrawPhoneVerification
);
usersRoutes.post(
  "/me/withdraw/phone-verification/confirm",
  express.json(),
  usersController.confirmWithdrawPhoneVerification
);
usersRoutes.post("/me/withdraw", express.json(), usersController.withdrawMe);
usersRoutes.get("/me/points", usersController.getMyPoints);
usersRoutes.post("/me/points/use", express.json(), usersController.usePoints);
usersRoutes.post("/me/points/earn", express.json(), usersController.earnPoints);

import express, { Router } from "express";
import * as brandController from "./brand.controller.js";

export const brandRoutes = Router();

brandRoutes.get("/instructors", brandController.getInstructors);
brandRoutes.post("/instructors", express.json(), brandController.saveInstructor);
brandRoutes.put("/instructors/:id", express.json(), brandController.saveInstructor);
brandRoutes.delete("/instructors/:id", brandController.removeInstructor);

brandRoutes.get("/branches", brandController.getBranches);
brandRoutes.post("/branches", express.json(), brandController.saveBranch);
brandRoutes.put("/branches/:id", express.json(), brandController.saveBranch);
brandRoutes.delete("/branches/:id", brandController.removeBranch);

import express, { Router } from "express";
import * as academyController from "./academy.controller.js";

export const academyRoutes = Router();

academyRoutes.get("/videos", academyController.getAcademyVideos);
academyRoutes.get("/videos/:videoId/chapters", academyController.getAcademyVideoChapters);
academyRoutes.get("/instructors", academyController.getAcademyInstructors);
academyRoutes.get("/progress", academyController.getAcademyProgress);
academyRoutes.put("/progress/:videoId", express.json(), academyController.saveAcademyProgress);
academyRoutes.put(
  "/progress/:videoId/chapters/:chapterId",
  express.json(),
  academyController.saveAcademyChapterProgress
);
academyRoutes.post("/videos", academyController.createAcademyVideo);
academyRoutes.put("/videos/:videoId", express.json(), academyController.updateAcademyVideoHandler);
academyRoutes.delete("/videos/:videoId", academyController.deleteAcademyVideoHandler);
academyRoutes.post(
  "/uploads",
  express.raw({ type: "application/octet-stream", limit: "1024mb" }),
  academyController.uploadAcademyAsset
);

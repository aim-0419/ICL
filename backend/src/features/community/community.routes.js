import { Router } from "express";
import * as communityController from "./community.controller.js";

export const communityRoutes = Router();

communityRoutes.get("/social/latest", communityController.getSocialLatest);
communityRoutes.get("/reviews", communityController.getReviews);
communityRoutes.post("/reviews", communityController.createReview);
communityRoutes.get("/reviews/:reviewId", communityController.getReview);
communityRoutes.post("/reviews/:reviewId/views", communityController.addReviewView);
communityRoutes.get("/reviews/:reviewId/comments", communityController.getReviewComments);
communityRoutes.post("/reviews/:reviewId/comments", communityController.createReviewComment);
communityRoutes.delete("/reviews/:reviewId/comments/:commentId", communityController.deleteReviewComment);

communityRoutes.get("/events", communityController.getEvents);
communityRoutes.post("/events", communityController.createEvent);
communityRoutes.get("/events/:eventId", communityController.getEvent);

communityRoutes.get("/inquiries", communityController.getInquiries);
communityRoutes.get("/inquiries/:inquiryId", communityController.getInquiry);
communityRoutes.post("/inquiries/:inquiryId/views", communityController.addInquiryView);
communityRoutes.post("/inquiries", communityController.createInquiry);

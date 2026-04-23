import { Router } from "express";
import * as communityController from "./community.controller.js";

export const communityRoutes = Router();

communityRoutes.get("/social/latest", communityController.getSocialLatest);
communityRoutes.get("/reviews", communityController.getReviews);
communityRoutes.post("/reviews", communityController.createReview);
communityRoutes.post("/reviews/bulk-delete", communityController.bulkDeleteReviews);
communityRoutes.get("/reviews/:reviewId", communityController.getReview);
communityRoutes.patch("/reviews/:reviewId", communityController.updateReview);
communityRoutes.delete("/reviews/:reviewId", communityController.deleteReview);
communityRoutes.post("/reviews/:reviewId/views", communityController.addReviewView);
communityRoutes.get("/reviews/:reviewId/comments", communityController.getReviewComments);
communityRoutes.post("/reviews/:reviewId/comments", communityController.createReviewComment);
communityRoutes.delete("/reviews/:reviewId/comments/:commentId", communityController.deleteReviewComment);

communityRoutes.get("/events", communityController.getEvents);
communityRoutes.post("/events", communityController.createEvent);
communityRoutes.get("/events/:eventId", communityController.getEvent);
communityRoutes.delete("/events/:eventId", communityController.deleteEvent);

communityRoutes.get("/inquiries", communityController.getInquiries);
communityRoutes.post("/inquiries/bulk-delete", communityController.bulkDeleteInquiries);
communityRoutes.get("/inquiries/:inquiryId", communityController.getInquiry);
communityRoutes.patch("/inquiries/:inquiryId", communityController.updateInquiry);
communityRoutes.delete("/inquiries/:inquiryId", communityController.deleteInquiry);
communityRoutes.post("/inquiries/:inquiryId/views", communityController.addInquiryView);
communityRoutes.post("/inquiries", communityController.createInquiry);
communityRoutes.get("/inquiries/:inquiryId/replies", communityController.getInquiryReplies);
communityRoutes.post("/inquiries/:inquiryId/replies", communityController.createInquiryReply);
communityRoutes.delete("/inquiries/replies/:replyId", communityController.deleteInquiryReply);

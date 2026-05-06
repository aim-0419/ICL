/**
 * 커뮤니티(Community) 기능
 * - 후기(Reviews): 회원이 수강 후기 게시글을 작성·수정·삭제, 댓글 기능 포함
 * - 이벤트(Events): 관리자가 프로모션·이벤트 게시물을 관리
 * - 문의(Inquiries): 회원이 상담 문의를 작성하고, 관리자가 답변 등록
 * - 소셜 피드: YouTube·네이버 블로그 최신 콘텐츠를 캐싱해서 홈 화면에 표시
 * - 파일 업로드: 게시글 이미지/영상 업로드 (로그인 필요)
 * - 비밀글: 문의는 is_secret 플래그로 작성자·관리자만 열람 가능
 *
 * 엔드포인트 (후기):
 * GET    /api/community/reviews                      - 후기 목록
 * POST   /api/community/reviews                      - 후기 작성
 * GET    /api/community/reviews/:reviewId            - 후기 상세
 * PATCH  /api/community/reviews/:reviewId            - 후기 수정 (작성자/관리자)
 * DELETE /api/community/reviews/:reviewId            - 후기 삭제
 * POST   /api/community/reviews/:reviewId/views      - 조회수 증가
 * GET    /api/community/reviews/:reviewId/comments   - 댓글 목록
 * POST   /api/community/reviews/:reviewId/comments   - 댓글 작성
 * DELETE /api/community/reviews/:reviewId/comments/:commentId - 댓글 삭제
 * POST   /api/community/reviews/bulk-delete          - 다중 삭제 (관리자)
 *
 * 엔드포인트 (이벤트):
 * GET    /api/community/events              - 이벤트 목록
 * POST   /api/community/events              - 이벤트 등록 (관리자)
 * GET    /api/community/events/:eventId     - 이벤트 상세
 * PATCH  /api/community/events/:eventId     - 이벤트 수정 (관리자)
 * DELETE /api/community/events/:eventId     - 이벤트 삭제 (관리자)
 *
 * 엔드포인트 (문의):
 * GET    /api/community/inquiries                       - 문의 목록
 * POST   /api/community/inquiries                       - 문의 작성
 * GET    /api/community/inquiries/:inquiryId            - 문의 상세
 * PATCH  /api/community/inquiries/:inquiryId            - 문의 수정
 * DELETE /api/community/inquiries/:inquiryId            - 문의 삭제
 * POST   /api/community/inquiries/:inquiryId/views      - 조회수 증가
 * GET    /api/community/inquiries/:inquiryId/replies    - 답변 목록
 * POST   /api/community/inquiries/:inquiryId/replies    - 답변 작성 (관리자)
 * PATCH  /api/community/inquiries/replies/:replyId      - 답변 수정 (관리자)
 * DELETE /api/community/inquiries/replies/:replyId      - 답변 삭제 (관리자)
 * POST   /api/community/inquiries/bulk-delete           - 다중 삭제 (관리자)
 *
 * 기타:
 * GET  /api/community/social/latest   - 소셜 피드 캐시 조회
 * POST /api/community/uploads         - 파일 업로드 (로그인)
 */
// 파일 역할: 커뮤니티 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import express, { Router } from "express";
import * as communityController from "./community.controller.js";

// 라우터 역할: 커뮤니티 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const communityRoutes = Router();

communityRoutes.post(
  "/uploads",
  communityController.requireCommunityUploadAuth,
  express.raw({ type: "application/octet-stream", limit: "1024mb" }),
  communityController.uploadCommunityAsset
);

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
communityRoutes.patch("/events/:eventId", communityController.updateEvent);
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
communityRoutes.patch("/inquiries/replies/:replyId", communityController.updateInquiryReply);
communityRoutes.delete("/inquiries/replies/:replyId", communityController.deleteInquiryReply);

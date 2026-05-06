/**
 * 아카데미(Academy) 기능
 * - 강의(Videos): 강의 목록 조회, 관리자의 강의 등록·수정·삭제·공개설정
 * - 차시(Chapters): 강의를 차시 단위로 분리, 각 차시에 영상 파일 연결
 * - 보안 재생(Playback): 세션 토큰 기반 스트리밍으로 직접 URL 접근 차단
 *   → 세션 생성 → heartbeat으로 유효성 유지 → stream/:chapterId로 청크 스트리밍
 * - 학습 진도(Progress): 영상·차시별 현재 시간·완료 여부를 서버에 저장
 * - 수강평(Reviews): 강의별 별점·리뷰 작성·삭제, 최신 리뷰 홈 표시용 조회
 * - Q&A: 강의별 질문 작성·답변 달기, 비밀글 설정 가능
 * - 파일 업로드: 영상·이미지 파일 업로드 (관리자 전용, octet-stream 최대 1GB)
 * - 강사 목록: 강사 프로필 조회
 *
 * 엔드포인트 (강의):
 * GET    /api/academy/videos                        - 강의 목록 (비로그인 허용)
 * GET    /api/academy/videos/:videoId/chapters      - 차시 목록
 * POST   /api/academy/videos                        - 강의 등록 (관리자)
 * PUT    /api/academy/videos/:videoId               - 강의 수정 (관리자)
 * DELETE /api/academy/videos/:videoId               - 강의 삭제 (관리자)
 * PATCH  /api/academy/videos/:videoId/visibility    - 공개/비공개 전환 (관리자)
 *
 * 엔드포인트 (재생·진도):
 * POST /api/academy/playback/session                           - 재생 세션 생성
 * POST /api/academy/playback/heartbeat                        - 재생 세션 유지
 * GET  /api/academy/playback/stream/:chapterId                - 영상 청크 스트리밍
 * GET  /api/academy/progress                                  - 내 전체 학습 진도
 * PUT  /api/academy/progress/:videoId                         - 영상 진도 저장
 * PUT  /api/academy/progress/:videoId/chapters/:chapterId     - 차시 진도 저장
 *
 * 엔드포인트 (수강평·Q&A):
 * GET    /api/academy/reviews/latest                  - 최신 수강평 목록 (홈 노출용)
 * GET    /api/academy/videos/:videoId/reviews         - 강의별 수강평
 * POST   /api/academy/videos/:videoId/reviews         - 수강평 작성
 * DELETE /api/academy/reviews/:reviewId               - 수강평 삭제
 * GET    /api/academy/videos/:videoId/qna             - Q&A 목록
 * GET    /api/academy/qna/my                          - 내 Q&A 목록
 * POST   /api/academy/videos/:videoId/qna             - Q&A 질문 작성
 * POST   /api/academy/qna/:postId/replies             - Q&A 답변 작성
 * DELETE /api/academy/qna/:postId                     - Q&A 질문 삭제
 * DELETE /api/academy/qna/replies/:replyId            - Q&A 답변 삭제
 *
 * 기타:
 * GET  /api/academy/instructors   - 강사 목록
 * POST /api/academy/uploads       - 파일 업로드 (관리자)
 */
// 파일 역할: 아카데미 관련 API 경로와 컨트롤러를 Express Router에 연결합니다.
import express, { Router } from "express";
import * as academyController from "./academy.controller.js";

// 라우터 역할: 아카데미 라우터는 해당 기능의 API 경로와 컨트롤러 함수를 연결합니다.
export const academyRoutes = Router();

academyRoutes.get("/videos", academyController.getAcademyVideos);
academyRoutes.get("/videos/:videoId/chapters", academyController.getAcademyVideoChapters);
academyRoutes.post("/playback/session", express.json(), academyController.createAcademyPlaybackSession);
academyRoutes.post("/playback/heartbeat", express.json(), academyController.heartbeatAcademyPlaybackSession);
academyRoutes.get("/playback/stream/:chapterId", academyController.streamAcademyPlayback);
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
academyRoutes.patch("/videos/:videoId/visibility", express.json(), academyController.setAcademyVideoVisibilityHandler);
academyRoutes.post(
  "/uploads",
  academyController.requireAcademyUploadAdmin,
  express.raw({ type: "application/octet-stream", limit: "1024mb" }),
  academyController.uploadAcademyAsset
);

academyRoutes.get("/reviews/latest", academyController.getLatestAcademyReviews);
academyRoutes.get("/videos/:videoId/reviews", academyController.getAcademyReviews);
academyRoutes.post("/videos/:videoId/reviews", express.json(), academyController.createAcademyReview);
academyRoutes.delete("/reviews/:reviewId", academyController.deleteAcademyReview);

academyRoutes.get("/videos/:videoId/qna", academyController.getAcademyQna);
academyRoutes.get("/qna/my", academyController.getMyAcademyQna);
academyRoutes.post("/videos/:videoId/qna", express.json(), academyController.createAcademyQnaPost);
academyRoutes.post("/qna/:postId/replies", express.json(), academyController.createAcademyQnaReply);
academyRoutes.delete("/qna/:postId", academyController.deleteAcademyQnaPost);
academyRoutes.delete("/qna/replies/:replyId", academyController.deleteAcademyQnaReply);

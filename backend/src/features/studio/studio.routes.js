/**
 * [스튜디오 API 라우터]
 *
 * 필라테스 스튜디오 운영에 필요한 모든 API 경로를 등록합니다.
 * URL은 app.js 에서 /studio 접두사로 마운트되어 있습니다.
 * 예) GET /studio/classes → 수업 목록 조회
 *
 * ─ 회원용 API (로그인 필요) ───────────────────────────────────────
 *  GET  /classes                   - 수업 목록 조회 (날짜·기간 필터 가능)
 *  GET  /me/summary                - 내 수강권·예약·이용 내역 한번에 조회
 *  POST /classes/:id/book          - 수업 예약 (잔여석 없으면 대기 등록)
 *  POST /classes/:id/cancel        - 내 예약 취소 (취소 마감 정책 적용)
 *  POST /passes/refund-requests    - 수강권 환불 요청
 *  GET  /users/:id/notifications   - 내 알림 이력 조회
 *
 * ─ 관리자용 API (admin 권한 필요) ────────────────────────────────
 *  수업 관리: 등록·수정·취소·삭제, 예약자 목록, 체크인
 *  수강권 관리: 생성·상태변경·정지·양도, 회원별 조회
 *  환불 관리: 수강권 환불 요청 목록 조회·승인·거절
 *  운영 설정: 영업시간·예약정책·공휴일·강사시간·역할권한
 *  락커 관리: 생성·상태변경·배정·반납
 *  회원 관리: 미수금·메모·알림 발송
 */
import express, { Router } from "express";
import * as studioController from "./studio.controller.js";

export const studioRoutes = Router();

// ─── 회원용 라우트 ─────────────────────────────────────────────────────────────
studioRoutes.get("/classes", studioController.listClasses);
studioRoutes.get("/me/summary", studioController.listMySummary);
studioRoutes.post("/classes/:classId/book", studioController.bookClass);
studioRoutes.post("/classes/:classId/cancel", studioController.cancelMyBooking);

// ─── 관리자용 라우트 ────────────────────────────────────────────────────────────
studioRoutes.get("/admin/bookings", studioController.listAllBookings);
studioRoutes.post("/admin/classes", express.json(), studioController.createClass);
studioRoutes.put("/admin/classes/:classId", express.json(), studioController.updateClass);
studioRoutes.post("/admin/classes/:classId/cancel", studioController.cancelClassByAdmin);
studioRoutes.delete("/admin/classes/:classId", studioController.deleteClassByAdmin);
studioRoutes.get("/admin/classes/:classId/bookings", studioController.listClassBookings);
studioRoutes.post("/admin/classes/:classId/bookings", express.json(), studioController.bookClassByAdmin);
studioRoutes.get("/admin/classes", studioController.listClassesForAdmin);
studioRoutes.post("/admin/passes", express.json(), studioController.createPassByAdmin);
studioRoutes.patch("/admin/passes/:passId/status", express.json(), studioController.updatePassStatus);
studioRoutes.get("/admin/pass-transactions", studioController.listPassTransactionsForAdmin);
studioRoutes.get("/admin/member-summaries", studioController.listStudioMemberSummaries);
studioRoutes.get("/admin/users/:userId/passes", studioController.listPassesByUser);
studioRoutes.get("/admin/settings", studioController.getStudioSettings);
studioRoutes.get("/admin/settings/info", studioController.getStudioInfo);
studioRoutes.put("/admin/settings/info", express.json(), studioController.saveStudioInfo);
studioRoutes.put("/admin/settings/business-hours", express.json(), studioController.saveBusinessHours);
studioRoutes.put("/admin/settings/booking-policy", express.json(), studioController.saveBookingPolicy);
studioRoutes.get("/admin/settings/rooms", studioController.getRoomSettings);
studioRoutes.put("/admin/settings/rooms/enabled", express.json(), studioController.saveRoomEnabled);
studioRoutes.get("/admin/rooms", studioController.getRoomSettings);
studioRoutes.post("/admin/rooms", express.json(), studioController.createRoom);
studioRoutes.put("/admin/rooms/:roomId", express.json(), studioController.updateRoom);
studioRoutes.delete("/admin/rooms/:roomId", studioController.deleteRoom);
studioRoutes.get("/admin/settings/roles", studioController.getRoleSettings);
studioRoutes.put("/admin/settings/roles/enabled", express.json(), studioController.saveRoleEnabled);
studioRoutes.post("/admin/roles", express.json(), studioController.createRole);
studioRoutes.put("/admin/roles/:roleId", express.json(), studioController.updateRole);
studioRoutes.delete("/admin/roles/:roleId", studioController.deleteRole);
studioRoutes.get("/admin/member-grades", studioController.getMemberGradeSettings);
studioRoutes.put("/admin/member-grades/enabled", express.json(), studioController.saveMemberGradeEnabled);
studioRoutes.post("/admin/member-grades", express.json(), studioController.createMemberGrade);
studioRoutes.put("/admin/member-grades/:gradeId", express.json(), studioController.updateMemberGrade);
studioRoutes.delete("/admin/member-grades/:gradeId", studioController.deleteMemberGrade);
studioRoutes.get("/admin/class-categories", studioController.listClassCategories);
studioRoutes.post("/admin/class-categories", express.json(), studioController.createClassCategory);
studioRoutes.put("/admin/class-categories/:categoryId", express.json(), studioController.updateClassCategory);
studioRoutes.delete("/admin/class-categories/:categoryId", studioController.deleteClassCategory);
studioRoutes.get("/admin/notification-templates", studioController.getNotificationTemplates);
studioRoutes.put("/admin/notification-templates/:templateId", express.json(), studioController.saveNotificationTemplate);
studioRoutes.get("/admin/settings/sales-pin", studioController.getSalesPinHandler);
studioRoutes.put("/admin/settings/sales-pin", express.json(), studioController.saveSalesPinHandler);
studioRoutes.get("/admin/notices", studioController.listAdminNotices);
studioRoutes.post("/admin/notices", express.json(), studioController.createAdminNoticeHandler);
studioRoutes.get("/admin/notices/:noticeId", studioController.getAdminNoticeHandler);
studioRoutes.put("/admin/notices/:noticeId", express.json(), studioController.updateAdminNoticeHandler);
studioRoutes.delete("/admin/notices", express.json(), studioController.deleteAdminNoticesHandler);
studioRoutes.post("/admin/notices/upload-image", express.raw({ type: ["image/jpeg", "image/png", "image/gif"], limit: "10mb" }), studioController.uploadNoticeImageHandler);
studioRoutes.post("/admin/settings/holidays", express.json(), studioController.addHoliday);
studioRoutes.delete("/admin/settings/holidays/:holidayId", studioController.deleteHoliday);
studioRoutes.post("/admin/checkins", express.json(), studioController.checkInMember);
studioRoutes.get("/admin/classes/:classId/checkins", studioController.listClassCheckins);
studioRoutes.post("/admin/arrears", express.json(), studioController.createArrears);
studioRoutes.patch("/admin/arrears/:arrearsId/resolve", studioController.resolveArrears);
studioRoutes.get("/admin/users/:userId/arrears", studioController.listArrearsByUser);
studioRoutes.post("/admin/lockers", express.json(), studioController.createLocker);
studioRoutes.get("/admin/lockers", studioController.listLockers);
studioRoutes.patch("/admin/lockers/:lockerId/status", express.json(), studioController.updateLockerStatus);
studioRoutes.get("/admin/locker-assignments", studioController.listLockerAssignments);
studioRoutes.post("/admin/locker-assignments", express.json(), studioController.assignLocker);
studioRoutes.patch("/admin/locker-assignments/:assignmentId/end", studioController.endLockerAssignment);
studioRoutes.post("/admin/notifications", express.json(), studioController.createNotification);
studioRoutes.get("/users/:userId/notifications", studioController.listNotificationsByUser);
studioRoutes.get("/admin/instructor-hours", studioController.listInstructorHours);
studioRoutes.put("/admin/instructor-hours", express.json(), studioController.saveInstructorHours);
studioRoutes.get("/admin/role-permissions", studioController.listRolePermissions);
studioRoutes.put("/admin/role-permissions", express.json(), studioController.saveRolePermissions);
studioRoutes.get("/admin/users/:userId/memos", studioController.listMemberMemos);
studioRoutes.post("/admin/memos", express.json(), studioController.createMemberMemo);
studioRoutes.post("/admin/passes/pause", express.json(), studioController.pausePass);
studioRoutes.post("/admin/passes/transfer", express.json(), studioController.transferPass);
studioRoutes.post("/passes/refund-requests", express.json(), studioController.requestPassRefund);
studioRoutes.get("/admin/pass-refunds", studioController.listAdminPassRefunds);
studioRoutes.patch("/admin/pass-refunds/:refundId", express.json(), studioController.resolvePassRefund);

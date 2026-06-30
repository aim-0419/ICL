import { apiRequest, API_BASE_URL } from "../../../shared/api/client.js";

export async function listStudioClasses(params = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.branchId) query.set("branchId", params.branchId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest(`/studio/classes${suffix}`);
  return Array.isArray(result?.classes) ? result.classes : [];
}

export async function listMyStudioSummary(params = {}) {
  const query = new URLSearchParams();
  if (params.branchId) query.set("branchId", params.branchId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest(`/studio/me/summary${suffix}`);
  return {
    passes: Array.isArray(result?.passes) ? result.passes : [],
    bookings: Array.isArray(result?.bookings) ? result.bookings : [],
    passTransactions: Array.isArray(result?.passTransactions) ? result.passTransactions : [],
  };
}

export async function bookStudioClass(classId) {
  return apiRequest(`/studio/classes/${encodeURIComponent(String(classId))}/book`, { method: "POST" });
}

export async function cancelStudioClass(classId) {
  return apiRequest(`/studio/classes/${encodeURIComponent(String(classId))}/cancel`, { method: "POST" });
}

export async function listAdminStudioClasses(params = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.status) query.set("status", params.status);
  if (params.branchId) query.set("branchId", params.branchId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest(`/studio/admin/classes${suffix}`);
  return Array.isArray(result?.classes) ? result.classes : [];
}

export async function createAdminStudioClass(payload) {
  return apiRequest("/studio/admin/classes", { method: "POST", body: payload });
}

export async function updateAdminStudioClass(classId, payload) {
  return apiRequest(`/studio/admin/classes/${encodeURIComponent(String(classId))}`, { method: "PUT", body: payload });
}

export async function cancelAdminStudioClass(classId) {
  return apiRequest(`/studio/admin/classes/${encodeURIComponent(String(classId))}/cancel`, { method: "POST" });
}

export async function deleteAdminStudioClass(classId) {
  return apiRequest(`/studio/admin/classes/${encodeURIComponent(String(classId))}`, { method: "DELETE" });
}

export async function listAdminStudioClassBookings(classId) {
  const result = await apiRequest(`/studio/admin/classes/${encodeURIComponent(String(classId))}/bookings`);
  return Array.isArray(result?.bookings) ? result.bookings : [];
}

export async function bookAdminStudioClassForMember(classId, userId) {
  return apiRequest(`/studio/admin/classes/${encodeURIComponent(String(classId))}/bookings`, {
    method: "POST",
    body: { userId },
  });
}

export async function getAdminStudioSettings() {
  return apiRequest("/studio/admin/settings");
}

export async function getAdminStudioInfo() {
  const result = await apiRequest("/studio/admin/settings/info");
  return result?.info || {};
}

export async function saveAdminStudioInfo(payload) {
  const result = await apiRequest("/studio/admin/settings/info", { method: "PUT", body: payload });
  return result?.info || {};
}

export async function saveAdminBusinessHours(businessHours) {
  return apiRequest("/studio/admin/settings/business-hours", {
    method: "PUT",
    body: { businessHours },
  });
}

export async function saveAdminBookingPolicy(policy) {
  return apiRequest("/studio/admin/settings/booking-policy", {
    method: "PUT",
    body: policy,
  });
}

export async function addAdminHoliday(payload) {
  return apiRequest("/studio/admin/settings/holidays", { method: "POST", body: payload });
}

export async function deleteAdminHoliday(holidayId) {
  return apiRequest(`/studio/admin/settings/holidays/${encodeURIComponent(String(holidayId))}`, { method: "DELETE" });
}

export async function checkInStudioMember(payload) {
  return apiRequest("/studio/admin/checkins", { method: "POST", body: payload });
}

export async function cancelStudioCheckIn(checkinId) {
  return apiRequest(`/studio/admin/checkins/${encodeURIComponent(String(checkinId))}/cancel`, { method: "PATCH" });
}

export async function listStudioClassCheckins(classId) {
  const result = await apiRequest(`/studio/admin/classes/${encodeURIComponent(String(classId))}/checkins`);
  return Array.isArray(result?.checkins) ? result.checkins : [];
}

export async function createStudioArrears(payload) {
  return apiRequest("/studio/admin/arrears", { method: "POST", body: payload });
}

export async function resolveStudioArrears(arrearsId) {
  return apiRequest(`/studio/admin/arrears/${encodeURIComponent(String(arrearsId))}/resolve`, { method: "PATCH" });
}

export async function listStudioArrearsByUser(userId) {
  const result = await apiRequest(`/studio/admin/users/${encodeURIComponent(String(userId))}/arrears`);
  return Array.isArray(result?.arrears) ? result.arrears : [];
}

export async function listAdminStudioArrears(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.userId) query.set("userId", params.userId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest(`/studio/admin/arrears${suffix}`);
  return Array.isArray(result?.arrears) ? result.arrears : [];
}

export async function listAdminPassesByUser(userId) {
  const result = await apiRequest(`/studio/admin/users/${encodeURIComponent(String(userId))}/passes`);
  return Array.isArray(result?.passes) ? result.passes : [];
}

export async function createAdminPass(payload) {
  return apiRequest("/studio/admin/passes", { method: "POST", body: payload });
}

export async function updateAdminPassStatus(passId, status) {
  return apiRequest(`/studio/admin/passes/${encodeURIComponent(String(passId))}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export async function listAdminStudioMemberSummaries() {
  const result = await apiRequest("/studio/admin/member-summaries");
  return Array.isArray(result?.members) ? result.members : [];
}

export async function listAdminPassTransactions(limit = 200) {
  const result = await apiRequest(`/studio/admin/pass-transactions?limit=${encodeURIComponent(String(limit))}`);
  return Array.isArray(result?.transactions) ? result.transactions : [];
}

export async function createStudioLocker(payload) {
  return apiRequest("/studio/admin/lockers", { method: "POST", body: payload });
}

export async function listStudioLockers() {
  const result = await apiRequest("/studio/admin/lockers");
  return Array.isArray(result?.lockers) ? result.lockers : [];
}

export async function updateStudioLockerStatus(lockerId, status) {
  return apiRequest(`/studio/admin/lockers/${encodeURIComponent(String(lockerId))}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export async function assignStudioLocker(payload) {
  return apiRequest("/studio/admin/locker-assignments", { method: "POST", body: payload });
}

export async function listStudioLockerAssignments(params = {}) {
  const query = new URLSearchParams();
  if (params.userId) query.set("userId", params.userId);
  if (params.status) query.set("status", params.status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest(`/studio/admin/locker-assignments${suffix}`);
  return Array.isArray(result?.assignments) ? result.assignments : [];
}

export async function endStudioLockerAssignment(assignmentId) {
  return apiRequest(`/studio/admin/locker-assignments/${encodeURIComponent(String(assignmentId))}/end`, { method: "PATCH" });
}

export async function createStudioNotification(payload) {
  return apiRequest("/studio/admin/notifications", { method: "POST", body: payload });
}

export async function listStudioNotificationsByUser(userId) {
  const result = await apiRequest(`/studio/users/${encodeURIComponent(String(userId))}/notifications`);
  return Array.isArray(result?.notifications) ? result.notifications : [];
}

export async function markMyStudioNotificationRead(notificationId) {
  return apiRequest(`/studio/me/notifications/${encodeURIComponent(String(notificationId))}/read`, { method: "PATCH" });
}

export async function markMyStudioNotificationsRead() {
  return apiRequest("/studio/me/notifications/read", { method: "PATCH" });
}

export async function listAdminInstructorHours() {
  const result = await apiRequest("/studio/admin/instructor-hours");
  return Array.isArray(result?.items) ? result.items : [];
}

export async function saveAdminInstructorHours(items) {
  return apiRequest("/studio/admin/instructor-hours", { method: "PUT", body: { items } });
}

export async function listAdminRolePermissions() {
  const result = await apiRequest("/studio/admin/role-permissions");
  return Array.isArray(result?.items) ? result.items : [];
}

export async function saveAdminRolePermissions(items) {
  return apiRequest("/studio/admin/role-permissions", { method: "PUT", body: { items } });
}

export async function listAdminStudioStaff() {
  const result = await apiRequest("/admin/studio-staff");
  return Array.isArray(result?.staff) ? result.staff : [];
}

export async function createAdminStudioStaff(payload) {
  const result = await apiRequest("/admin/studio-staff", { method: "POST", body: payload });
  return result?.staff || result;
}

export async function updateAdminStudioStaff(staffId, payload) {
  const result = await apiRequest(`/admin/studio-staff/${encodeURIComponent(String(staffId))}`, {
    method: "PUT",
    body: payload,
  });
  return result?.staff || result;
}

export async function deleteAdminStudioStaff(staffId) {
  return apiRequest(`/admin/studio-staff/${encodeURIComponent(String(staffId))}`, { method: "DELETE" });
}

export async function listAdminPassProducts(params = {}) {
  const query = new URLSearchParams();
  if (params.branchId) query.set("branchId", params.branchId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest(`/admin/pass-products${suffix}`);
  return Array.isArray(result?.products) ? result.products : [];
}

export async function createAdminPassProduct(payload) {
  const result = await apiRequest("/admin/pass-products", { method: "POST", body: payload });
  return result?.product || result;
}

export async function updateAdminPassProduct(productId, payload) {
  const result = await apiRequest(`/admin/pass-products/${encodeURIComponent(String(productId))}`, { method: "PUT", body: payload });
  return result?.product || result;
}

export async function deleteAdminPassProduct(productId) {
  return apiRequest(`/admin/pass-products/${encodeURIComponent(String(productId))}`, { method: "DELETE" });
}

export async function listIssuedPassesByProduct(productId) {
  const result = await apiRequest(`/admin/pass-products/${encodeURIComponent(String(productId))}/issued`);
  return Array.isArray(result?.passes) ? result.passes : [];
}

export async function listAdminGoods() {
  const result = await apiRequest("/admin/goods");
  return Array.isArray(result?.goods) ? result.goods : [];
}

export async function createAdminGoods(payload) {
  const result = await apiRequest("/admin/goods", { method: "POST", body: payload });
  return result?.goods || result;
}

export async function updateAdminGoods(goodsId, payload) {
  const result = await apiRequest(`/admin/goods/${encodeURIComponent(String(goodsId))}`, { method: "PUT", body: payload });
  return result?.goods || result;
}

export async function deleteAdminGoods(goodsId) {
  return apiRequest(`/admin/goods/${encodeURIComponent(String(goodsId))}`, { method: "DELETE" });
}

export async function getAdminStaffWorkHours(staffId) {
  const result = await apiRequest(`/admin/studio-staff/${encodeURIComponent(String(staffId))}/work-hours`);
  return Array.isArray(result?.hours) ? result.hours : [];
}

export async function saveAdminStaffWorkHours(staffId, hours) {
  const result = await apiRequest(`/admin/studio-staff/${encodeURIComponent(String(staffId))}/work-hours`, {
    method: "PUT",
    body: { hours },
  });
  return Array.isArray(result?.hours) ? result.hours : [];
}

export async function listAdminMemberMemos(userId) {
  const result = await apiRequest(`/studio/admin/users/${encodeURIComponent(String(userId))}/memos`);
  return Array.isArray(result?.memos) ? result.memos : [];
}

export async function createAdminMemberMemo(payload) {
  return apiRequest("/studio/admin/memos", { method: "POST", body: payload });
}

export async function pauseAdminPass(payload) {
  return apiRequest("/studio/admin/passes/pause", { method: "POST", body: payload });
}

export async function transferAdminPass(payload) {
  return apiRequest("/studio/admin/passes/transfer", { method: "POST", body: payload });
}

/** 전체 예약 내역을 조회합니다. from/to: "YYYY-MM-DD HH:MM:SS", status: reserved|waitlisted|cancelled */
export async function listAdminAllBookings({ from, to, status, branchId } = {}) {
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (status) query.set("status", status);
  if (branchId) query.set("branchId", branchId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest(`/studio/admin/bookings${suffix}`);
  return Array.isArray(result?.bookings) ? result.bookings : [];
}

export async function listAdminPassRefunds(status) {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
  const result = await apiRequest(`/studio/admin/pass-refunds${suffix}`);
  return Array.isArray(result?.refunds) ? result.refunds : [];
}

export async function getAdminRoomSettings() {
  return apiRequest("/studio/admin/settings/rooms");
}

export async function saveAdminRoomEnabled(enabled) {
  return apiRequest("/studio/admin/settings/rooms/enabled", { method: "PUT", body: { enabled } });
}

export async function createAdminRoom(name) {
  const result = await apiRequest("/studio/admin/rooms", { method: "POST", body: { name } });
  return result?.room || result;
}

export async function updateAdminRoom(roomId, name) {
  return apiRequest(`/studio/admin/rooms/${encodeURIComponent(String(roomId))}`, { method: "PUT", body: { name } });
}

export async function deleteAdminRoom(roomId) {
  return apiRequest(`/studio/admin/rooms/${encodeURIComponent(String(roomId))}`, { method: "DELETE" });
}

export async function getAdminRoleSettings() {
  return apiRequest("/studio/admin/settings/roles");
}

export async function saveAdminRoleEnabled(enabled) {
  return apiRequest("/studio/admin/settings/roles/enabled", { method: "PUT", body: { enabled } });
}

export async function createAdminRole(name) {
  const result = await apiRequest("/studio/admin/roles", { method: "POST", body: { name } });
  return result?.role || result;
}

export async function updateAdminRole(roleId, name) {
  return apiRequest(`/studio/admin/roles/${encodeURIComponent(String(roleId))}`, { method: "PUT", body: { name } });
}

export async function deleteAdminRole(roleId) {
  return apiRequest(`/studio/admin/roles/${encodeURIComponent(String(roleId))}`, { method: "DELETE" });
}

export async function getAdminMemberGradeSettings() {
  return apiRequest("/studio/admin/member-grades");
}

export async function saveAdminMemberGradeEnabled(enabled) {
  return apiRequest("/studio/admin/member-grades/enabled", { method: "PUT", body: { enabled } });
}

export async function createAdminMemberGrade(name, color) {
  const result = await apiRequest("/studio/admin/member-grades", { method: "POST", body: { name, color } });
  return result?.grade || result;
}

export async function updateAdminMemberGrade(gradeId, name, color) {
  return apiRequest(`/studio/admin/member-grades/${encodeURIComponent(String(gradeId))}`, { method: "PUT", body: { name, color } });
}

export async function deleteAdminMemberGrade(gradeId) {
  return apiRequest(`/studio/admin/member-grades/${encodeURIComponent(String(gradeId))}`, { method: "DELETE" });
}

export async function listAdminClassCategories() {
  const result = await apiRequest("/studio/admin/class-categories");
  return Array.isArray(result?.categories) ? result.categories : [];
}

export async function createAdminClassCategory(name) {
  const result = await apiRequest("/studio/admin/class-categories", { method: "POST", body: { name } });
  return result?.category || result;
}

export async function updateAdminClassCategory(categoryId, name) {
  return apiRequest(`/studio/admin/class-categories/${encodeURIComponent(String(categoryId))}`, { method: "PUT", body: { name } });
}

export async function deleteAdminClassCategory(categoryId) {
  return apiRequest(`/studio/admin/class-categories/${encodeURIComponent(String(categoryId))}`, { method: "DELETE" });
}

export async function getAdminNotificationTemplates() {
  const result = await apiRequest("/studio/admin/notification-templates");
  return result?.templates || {};
}

export async function saveAdminNotificationTemplate(templateId, data) {
  return apiRequest(`/studio/admin/notification-templates/${encodeURIComponent(String(templateId))}`, {
    method: "PUT",
    body: data,
  });
}

export async function listAdminNotices({ search, page, pageSize } = {}) {
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  if (page) q.set("page", String(page));
  if (pageSize) q.set("pageSize", String(pageSize));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  const result = await apiRequest(`/studio/admin/notices${suffix}`);
  return { notices: Array.isArray(result?.notices) ? result.notices : [], total: result?.total ?? 0 };
}

export async function getAdminNotice(noticeId) {
  const result = await apiRequest(`/studio/admin/notices/${encodeURIComponent(String(noticeId))}`);
  return result?.notice || null;
}

export async function createAdminNotice(payload) {
  const result = await apiRequest("/studio/admin/notices", { method: "POST", body: payload });
  return result?.notice || result;
}

export async function updateAdminNotice(noticeId, payload) {
  const result = await apiRequest(`/studio/admin/notices/${encodeURIComponent(String(noticeId))}`, { method: "PUT", body: payload });
  return result?.notice || result;
}

export async function deleteAdminNotices(ids) {
  return apiRequest("/studio/admin/notices", { method: "DELETE", body: { ids } });
}

export async function uploadNoticeImage(file) {
  const res = await fetch(`${API_BASE_URL}/studio/admin/notices/upload-image`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "이미지 업로드에 실패했습니다.");
  }
  return res.json();
}

export async function extendAdminIssuedPasses(productId, extendDays) {
  return apiRequest(`/admin/pass-products/${encodeURIComponent(String(productId))}/extend-issued`, {
    method: "POST",
    body: { extendDays },
  });
}

export async function getAdminSalesPin() {
  return apiRequest("/studio/admin/settings/sales-pin");
}

export async function saveAdminSalesPin(pin) {
  return apiRequest("/studio/admin/settings/sales-pin", { method: "PUT", body: { pin } });
}

export async function verifyAdminSalesPin(pin) {
  return apiRequest("/studio/admin/settings/sales-pin/verify", { method: "POST", body: { pin } });
}

export async function getAdminStudioSalesReport(params = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.branchId) query.set("branchId", params.branchId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`/studio/admin/sales${suffix}`);
}

export async function createAdminStudioExpense(payload) {
  const result = await apiRequest("/studio/admin/expenses", { method: "POST", body: payload });
  return result?.expense || result;
}

export async function requestStudioPassRefund(payload) {
  return apiRequest("/studio/passes/refund-requests", { method: "POST", body: payload });
}

export async function resolveStudioPassRefund(refundId, status) {
  return apiRequest(`/studio/admin/pass-refunds/${encodeURIComponent(String(refundId))}`, {
    method: "PATCH",
    body: { status },
  });
}

// ─── SMS / 알림톡 ────────────────────────────────────────────────────────────

export async function getSmsConfig() {
  return apiRequest("/sms/config");
}

export async function sendAdminSms({ channel = "sms", receivers, message, title = "", templateCode = "" }) {
  return apiRequest("/sms/send", {
    method: "POST",
    body: { channel, receivers, message, title, templateCode },
  });
}

export async function scheduleAdminMessage({ channel = "sms", receivers, message, title = "", scheduledAt, templateCode = "" }) {
  return apiRequest("/sms/schedule", {
    method: "POST",
    body: { channel, receivers, message, title, scheduledAt, templateCode },
  });
}

export async function registerMyPushDevice({ token, platform = "android", deviceName = "" }) {
  return apiRequest("/studio/me/push-devices", {
    method: "POST",
    body: { token, platform, deviceName },
  });
}

export async function unregisterMyPushDevice(token) {
  return apiRequest("/studio/me/push-devices", { method: "DELETE", body: { token } });
}

export async function getSmsHistory(limit = 100) {
  const result = await apiRequest(`/sms/history?limit=${encodeURIComponent(String(limit))}`);
  return Array.isArray(result?.items) ? result.items : [];
}

export async function listAdminMessageTemplates() {
  const result = await apiRequest("/studio/admin/message-templates");
  return Array.isArray(result?.templates) ? result.templates : [];
}

export async function createAdminMessageTemplate(payload) {
  const result = await apiRequest("/studio/admin/message-templates", { method: "POST", body: payload });
  return result?.template || result;
}

export async function updateAdminMessageTemplate(templateId, payload) {
  const result = await apiRequest(`/studio/admin/message-templates/${encodeURIComponent(String(templateId))}`, {
    method: "PUT",
    body: payload,
  });
  return result?.template || result;
}

export async function deleteAdminMessageTemplate(templateId) {
  return apiRequest(`/studio/admin/message-templates/${encodeURIComponent(String(templateId))}`, { method: "DELETE" });
}

export async function getAutoSmsHistory({ limit = 100, type = "" } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (type) params.set("type", type);
  const result = await apiRequest(`/sms/auto-history?${params}`);
  return Array.isArray(result?.items) ? result.items : [];
}

export async function searchMembersForPicker(search = "", limit = 30) {
  const params = new URLSearchParams({ tab: "all", limit: String(limit) });
  if (search) params.set("search", search);
  const result = await apiRequest(`/admin/members?${params}`);
  return Array.isArray(result?.members) ? result.members : [];
}

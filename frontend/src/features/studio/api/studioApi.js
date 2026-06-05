import { apiRequest } from "../../../shared/api/client.js";

export async function listStudioClasses(params = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest(`/studio/classes${suffix}`);
  return Array.isArray(result?.classes) ? result.classes : [];
}

export async function listMyStudioSummary() {
  const result = await apiRequest("/studio/me/summary");
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
export async function listAdminAllBookings({ from, to, status } = {}) {
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (status) query.set("status", status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest(`/studio/admin/bookings${suffix}`);
  return Array.isArray(result?.bookings) ? result.bookings : [];
}

export async function listAdminPassRefunds(status) {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
  const result = await apiRequest(`/studio/admin/pass-refunds${suffix}`);
  return Array.isArray(result?.refunds) ? result.refunds : [];
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

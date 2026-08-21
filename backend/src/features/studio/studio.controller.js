/**
 * [스튜디오 컨트롤러]
 *
 * HTTP 요청을 받아서 검증(인증·권한)을 거친 후 studioService를 호출하고
 * 결과를 JSON 응답으로 반환합니다.
 *
 * ─ 인증 흐름 ──────────────────────────────────────────────────────
 *  1. getCookieValue  → 요청 쿠키에서 세션 토큰을 꺼냅니다
 *  2. getAuthUser     → 세션 토큰으로 DB에서 현재 사용자를 조회합니다
 *  3. isAdmin         → 최고 관리자 여부를 확인합니다 (admin0/admin1)
 *  4. canAccessStudioAdmin → 역할별 권한 코드(permissionCode)로 세부 접근을 확인합니다
 *
 * ─ 권한 코드 예시 ─────────────────────────────────────────────────
 *  class.read / class.write    - 수업 조회·관리
 *  member.read / member.write  - 회원 조회·관리
 *  pass.write                  - 수강권 처리
 *  checkin.write               - 체크인 처리
 *  locker.read / locker.write  - 락커 조회·관리
 *  settings.write              - 운영 설정 변경
 */
import * as studioService from "./studio.service.js";
import { canViewMemberPii, maskMemberRows } from "../../shared/security/member-privacy.js";
import { registerPushDevice, unregisterPushDevice } from "../sms/notification-dispatch.service.js";
import * as studioAssetService from "./studio.asset.service.js";
import { resolveSessionToken, resolveSessionUser, isAdminUser as isAdmin } from "../../shared/middlewares/auth.js";

const SALES_PIN_UNLOCK_TTL_MS = 30 * 60 * 1000;
const salesPinUnlocks = new Map();

function getSalesPinUnlockKey(req, user) {
  const token = resolveSessionToken(req);
  return token || String(user?.id || "");
}

function markSalesPinUnlocked(req, user) {
  const key = getSalesPinUnlockKey(req, user);
  if (!key) return;
  salesPinUnlocks.set(key, {
    userId: String(user.id),
    expiresAt: Date.now() + SALES_PIN_UNLOCK_TTL_MS,
  });
}

function clearSalesPinUnlocks() {
  salesPinUnlocks.clear();
}

async function requireSalesPinUnlocked(req, res, user) {
  const pinState = await studioService.getSalesPin();
  if (!pinState.hasPin) {
    res.status(403).json({ code: "SALES_PIN_NOT_SET", message: "매출 비밀번호가 설정되어 있지 않습니다." });
    return false;
  }

  const key = getSalesPinUnlockKey(req, user);
  const entry = key ? salesPinUnlocks.get(key) : null;
  if (entry && entry.userId === String(user.id) && entry.expiresAt > Date.now()) {
    return true;
  }

  if (key) salesPinUnlocks.delete(key);
  res.status(403).json({ code: "SALES_PIN_REQUIRED", message: "매출 비밀번호 확인이 필요합니다." });
  return false;
}

// ─── 인증 헬퍼 함수들 ─────────────────────────────────────────────────────────

/** 세션 쿠키의 토큰으로 DB에서 현재 로그인 사용자를 조회합니다. 로그아웃 상태면 null을 반환합니다. */
function getAuthUser(req) {
  return req.authUser || resolveSessionUser(req);
}

/**
 * 사용자가 특정 스튜디오 관리 기능에 접근할 수 있는지 확인합니다.
 * - 최고 관리자(isAdmin)는 모든 권한이 있습니다
 * - 그 외 역할은 studio_role_permissions 테이블의 설정에 따라 판단합니다
 */
async function canAccessStudioAdmin(user, permissionCode) {
  if (isAdmin(user)) return true;
  const roleCode = await studioService.resolveUserStudioRole(user);
  return studioService.isRoleAllowed(roleCode, permissionCode);
}

// ─── 회원용 API 핸들러 ────────────────────────────────────────────────────────

/** 수업 목록을 조회합니다. 날짜 범위(from/to)로 필터링할 수 있습니다. */
export async function listClasses(req, res, next) {
  try {
    const user = await getAuthUser(req);
    const rows = await studioService.listClasses({
      from: String(req.query.from || "").trim(),
      to: String(req.query.to || "").trim(),
      branchId: String(req.query.branchId || "").trim(),
      userId: String(user?.id || "").trim(),
    });
    res.json({ classes: rows });
  } catch (error) {
    next(error);
  }
}

/** 로그인 회원의 수강권·예약·이용 내역을 한 번에 반환합니다. 마이페이지 스튜디오 섹션에서 사용합니다. */
export async function listMySummary(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    const [passes, bookings, passTransactions] = await Promise.all([
      studioService.listMyPasses(String(user.id), String(req.query.branchId || "").trim()),
      studioService.listMyBookings(String(user.id), String(req.query.branchId || "").trim()),
      studioService.listMyPassTransactions(String(user.id), String(req.query.branchId || "").trim()),
    ]);
    res.json({ passes, bookings, passTransactions });
  } catch (error) {
    next(error);
  }
}

/**
 * 수업을 예약합니다.
 * - 잔여석이 있으면 "reserved"(예약 완료) 상태로 저장합니다
 * - 잔여석이 없으면 "waitlisted"(대기) 상태로 저장합니다
 * - 예약 마감 시간이 지났으면 거절합니다 (bookingLimitHours 정책)
 */
export async function bookClass(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    const classId = String(req.params.classId || "").trim();
    const result = await studioService.bookClass({ userId: String(user.id), classId });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * 내 예약을 취소합니다.
 * - 취소 마감 시간이 지났으면 거절합니다 (cancelLimitHours 정책)
 * - 취소 후 대기자가 있으면 첫 번째 대기자를 자동으로 예약 확정합니다
 */
export async function cancelMyBooking(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    const classId = String(req.params.classId || "").trim();
    const result = await studioService.cancelMyBooking({ userId: String(user.id), classId });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// ─── 관리자용 API 핸들러 ─────────────────────────────────────────────────────

/** 전체 예약 내역을 조회합니다. 날짜 범위·상태 필터를 쿼리 파라미터로 받습니다. */
export async function listAllBookings(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const status = String(req.query.status || "").trim();
    const branchId = String(req.query.branchId || "").trim();
    const classStatus = String(req.query.classStatus || "").trim();
    const bookings = await studioService.listAllBookingsForAdmin({ from, to, status, branchId, classStatus });
    // 예약자 연락처는 운영 책임자만 원문으로 봅니다.
    const canViewPii = await canViewMemberPii(user, studioService.resolveUserStudioRole);
    res.json({ bookings: canViewPii ? bookings : maskMemberRows(bookings) });
  } catch (error) {
    next(error);
  }
}

/**
 * 수업을 등록합니다. (관리자 전용)
 * repeatWeeks가 2 이상이면 매주 반복 수업을 자동으로 생성합니다 (최대 24주).
 */
export async function createClass(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "class.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const repeatWeeks = Math.max(1, Number(req.body?.repeatWeeks || 1));
    if (repeatWeeks > 1) {
      const createdRows = await studioService.createClassesWithRepeat(req.body || {}, String(user.id));
      return res.status(201).json({ items: createdRows, count: createdRows.length });
    }
    const created = await studioService.createClass(req.body || {}, String(user.id));
    res.status(201).json({ item: created, count: 1 });
  } catch (error) {
    next(error);
  }
}

export async function updateClass(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "class.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const classId = String(req.params.classId || "").trim();
    const updated = await studioService.updateClass(classId, req.body || {});
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function cancelClassByAdmin(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "class.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const classId = String(req.params.classId || "").trim();
    await studioService.cancelClassByAdmin(classId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function deleteClassByAdmin(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "class.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const classId = String(req.params.classId || "").trim();
    await studioService.deleteClassByAdmin(classId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function listClassBookings(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "class.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const classId = String(req.params.classId || "").trim();
    const bookings = await studioService.listClassBookings(classId);
    res.json({ bookings });
  } catch (error) {
    next(error);
  }
}

export async function bookClassByAdmin(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "class.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const classId = String(req.params.classId || "").trim();
    const targetUserId = String(req.body?.userId || "").trim();
    if (!targetUserId) return res.status(400).json({ message: "예약할 회원을 선택해 주세요." });
    const result = await studioService.bookClass({ userId: targetUserId, classId });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listClassesForAdmin(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "class.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const rows = await studioService.listClassesForAdmin({
      from: String(req.query.from || "").trim(),
      to: String(req.query.to || "").trim(),
      status: String(req.query.status || "").trim(),
      branchId: String(req.query.branchId || "").trim(),
    });
    res.json({ classes: rows });
  } catch (error) {
    next(error);
  }
}

export async function createPassByAdmin(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "pass.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const created = await studioService.createPassByAdmin(req.body || {});
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function updatePassStatus(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "pass.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const passId = String(req.params.passId || "").trim();
    const status = String(req.body?.status || "").trim();
    const allowed = new Set(["active", "paused", "transferred", "refunded"]);
    if (!allowed.has(status)) return res.status(400).json({ message: "잘못된 상태값입니다." });
    await studioService.updatePassStatus(passId, status);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function listPassesByUser(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const userId = String(req.params.userId || "").trim();
    const passes = await studioService.listPassesByUser(userId);
    res.json({ passes });
  } catch (error) {
    next(error);
  }
}

export async function listStudioMemberSummaries(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const members = await studioService.listStudioMemberSummaries();
    res.json({ members });
  } catch (error) {
    next(error);
  }
}

export async function listPassTransactionsForAdmin(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "pass.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const transactions = await studioService.listPassTransactionsForAdmin({
      limit: req.query?.limit,
      date: req.query?.date,
    });
    res.json({ transactions });
  } catch (error) {
    next(error);
  }
}

export async function getStudioSettings(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const settings = await studioService.getStudioSettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

export async function saveBusinessHours(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.saveBusinessHours(req.body?.businessHours || []);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function saveBookingPolicy(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.saveBookingPolicy(req.body || {});
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function getStudioInfo(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const info = await studioService.getStudioInfo();
    res.json({ info });
  } catch (error) { next(error); }
}

export async function saveStudioInfo(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const info = await studioService.saveStudioInfo(req.body || {});
    res.json({ info });
  } catch (error) { next(error); }
}

export async function getRoomSettings(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const data = await studioService.getRoomSettings();
    res.json(data);
  } catch (error) { next(error); }
}

export async function saveRoomEnabled(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.saveRoomEnabled(req.body?.enabled);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function createRoom(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const room = await studioService.createRoom(req.body?.name);
    res.json({ room });
  } catch (error) { next(error); }
}

export async function deleteRoom(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.deleteRoom(req.params.roomId);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function updateRoom(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.updateRoom(req.params.roomId, req.body?.name);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function getRoleSettings(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    res.json(await studioService.getRoleSettings());
  } catch (error) { next(error); }
}

export async function saveRoleEnabled(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.saveRoleEnabled(req.body?.enabled);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function createRole(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    res.json({ role: await studioService.createRole(req.body?.name) });
  } catch (error) { next(error); }
}

export async function deleteRole(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.deleteRole(req.params.roleId);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function updateRole(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.updateRole(req.params.roleId, req.body?.name);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function getMemberGradeSettings(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    res.json(await studioService.getMemberGradeSettings());
  } catch (error) { next(error); }
}

export async function saveMemberGradeEnabled(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.saveMemberGradeEnabled(req.body?.enabled);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function createMemberGrade(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    res.json({ grade: await studioService.createMemberGrade(req.body?.name, req.body?.color) });
  } catch (error) { next(error); }
}

export async function deleteMemberGrade(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.deleteMemberGrade(req.params.gradeId);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function updateMemberGrade(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.updateMemberGrade(req.params.gradeId, req.body?.name, req.body?.color);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function listClassCategories(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    res.json({ categories: await studioService.listClassCategories() });
  } catch (error) { next(error); }
}

export async function createClassCategory(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    res.json({ category: await studioService.createClassCategory(req.body?.name) });
  } catch (error) { next(error); }
}

export async function deleteClassCategory(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.deleteClassCategory(req.params.categoryId);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function updateClassCategory(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.updateClassCategory(req.params.categoryId, req.body?.name);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function getNotificationTemplates(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    res.json({ templates: await studioService.getNotificationTemplates() });
  } catch (error) { next(error); }
}

export async function saveNotificationTemplate(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const { templateId } = req.params;
    const { pushEnabled, smsEnabled, kakaoEnabled, kakaoTemplateCode, message, param1, param2, skipExpired } = req.body || {};
    await studioService.saveNotificationTemplate(templateId, { pushEnabled, smsEnabled, kakaoEnabled, kakaoTemplateCode, message, param1, param2, skipExpired });
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function getSalesPinHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    res.json(await studioService.getSalesPin());
  } catch (error) { next(error); }
}

export async function saveSalesPinHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const pin = req.body?.pin !== undefined ? String(req.body.pin) : null;
    const result = await studioService.saveSalesPin(pin);
    clearSalesPinUnlocks();
    res.json(result);
  } catch (error) { next(error); }
}

export async function verifySalesPinHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "sales.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const result = await studioService.verifySalesPin(req.body?.pin);
    markSalesPinUnlocked(req, user);
    res.json(result);
  } catch (error) { next(error); }
}

export async function getStudioSalesReportHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "sales.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    if (!(await requireSalesPinUnlocked(req, res, user))) return;
    res.json(await studioService.listStudioSalesReport({
      from: String(req.query.from || "").trim(),
      to: String(req.query.to || "").trim(),
      branchId: String(req.query.branchId || "").trim(),
    }));
  } catch (error) { next(error); }
}

export async function createStudioExpenseHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "sales.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    if (!(await requireSalesPinUnlocked(req, res, user))) return;
    res.status(201).json({ expense: await studioService.createStudioExpense(req.body || {}, user.id) });
  } catch (error) { next(error); }
}

export async function addHoliday(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.addHoliday(req.body || {});
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function deleteHoliday(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.deleteHoliday(String(req.params.holidayId || "").trim());
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function checkInMember(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "checkin.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const row = await studioService.checkInMember(req.body || {});
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
}

export async function listClassCheckins(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "checkin.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const rows = await studioService.listCheckinsByClass(String(req.params.classId || "").trim());
    res.json({ checkins: rows });
  } catch (error) {
    next(error);
  }
}

export async function cancelCheckIn(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "checkin.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const row = await studioService.cancelCheckIn(String(req.params.checkinId || "").trim());
    res.json(row);
  } catch (error) {
    next(error);
  }
}

export async function createArrears(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const row = await studioService.createArrears(req.body || {});
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
}

export async function resolveArrears(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.resolveArrears(String(req.params.arrearsId || "").trim());
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function listArrearsByUser(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const rows = await studioService.listArrearsByUser(String(req.params.userId || "").trim());
    const canViewPii = await canViewMemberPii(user, studioService.resolveUserStudioRole);
    res.json({ arrears: canViewPii ? rows : maskMemberRows(rows) });
  } catch (error) {
    next(error);
  }
}

export async function listArrears(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const rows = await studioService.listArrears({
      status: String(req.query.status || "").trim(),
      userId: String(req.query.userId || "").trim(),
    });
    res.json({ arrears: rows });
  } catch (error) {
    next(error);
  }
}

export async function createLocker(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "locker.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const row = await studioService.createLocker(req.body || {});
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
}

export async function listLockers(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "locker.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const rows = await studioService.listLockers();
    res.json({ lockers: rows });
  } catch (error) {
    next(error);
  }
}

export async function updateLockerStatus(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "locker.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const row = await studioService.updateLockerStatus(
      String(req.params.lockerId || "").trim(),
      String(req.body?.status || "").trim()
    );
    res.json(row);
  } catch (error) {
    next(error);
  }
}

export async function listLockerAssignments(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "Login is required." });
    if (!(await canAccessStudioAdmin(user, "locker.read"))) return res.status(403).json({ message: "Admin permission is required." });
    const rows = await studioService.listLockerAssignments({
      userId: String(req.query.userId || "").trim(),
      status: String(req.query.status || "active").trim(),
    });
    res.json({ assignments: rows });
  } catch (error) {
    next(error);
  }
}

export async function assignLocker(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "locker.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const row = await studioService.assignLocker(req.body || {});
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
}

export async function endLockerAssignment(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "locker.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.endLockerAssignment(String(req.params.assignmentId || "").trim());
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function createNotification(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "communication.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const row = await studioService.createNotification(req.body || {});
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
}

export async function listNotificationsByUser(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    const targetUserId = String(req.params.userId || "").trim();
    const myId = String(user.id || "").trim();
    if (!isAdmin(user) && targetUserId !== myId && !(await canAccessStudioAdmin(user, "communication.read"))) {
      return res.status(403).json({ message: "권한이 없습니다." });
    }
    const rows = await studioService.listNotificationsByUser(targetUserId);
    res.json({ notifications: rows });
  } catch (error) {
    next(error);
  }
}

export async function markMyNotificationRead(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    const result = await studioService.markNotificationRead({
      notificationId: req.params.notificationId,
      userId: user.id,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function markMyNotificationsRead(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    const result = await studioService.markAllNotificationsRead(user.id);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function listMessageTemplates(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "communication.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    res.json({ templates: await studioService.listMessageTemplates() });
  } catch (error) {
    next(error);
  }
}

export async function createMessageTemplate(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "communication.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const row = await studioService.createMessageTemplate({ ...(req.body || {}), createdBy: user.id });
    res.status(201).json({ template: row });
  } catch (error) {
    next(error);
  }
}

export async function updateMessageTemplate(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "communication.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const row = await studioService.updateMessageTemplate(req.params.templateId, req.body || {});
    res.json({ template: row });
  } catch (error) {
    next(error);
  }
}

export async function deleteMessageTemplate(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "communication.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    res.json(await studioService.deleteMessageTemplate(req.params.templateId));
  } catch (error) {
    next(error);
  }
}

/** 로그인한 회원 앱의 FCM 토큰을 등록하거나 갱신합니다. */
export async function registerMyPushDevice(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    const result = await registerPushDevice({ userId: String(user.id), ...(req.body || {}) });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/** 로그아웃 또는 알림 해제 시 현재 기기의 FCM 토큰을 비활성화합니다. */
export async function unregisterMyPushDevice(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    const result = await unregisterPushDevice({ userId: String(user.id), token: req.body?.token });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function listInstructorHours(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const rows = await studioService.listInstructorHours();
    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
}

export async function saveInstructorHours(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.saveInstructorHours(req.body?.items || []);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function listRolePermissions(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const rows = await studioService.listRolePermissions();
    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
}

export async function saveRolePermissions(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!isAdmin(user)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.saveRolePermissions(req.body?.items || []);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function listMemberMemos(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const rows = await studioService.listMemberMemos(String(req.params.userId || "").trim());
    res.json({ memos: rows });
  } catch (error) {
    next(error);
  }
}

export async function createMemberMemo(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const row = await studioService.createMemberMemo({
      userId: req.body?.userId,
      authorId: user.id,
      memo: req.body?.memo,
    });
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
}

export async function pausePass(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "pass.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.pausePass(req.body || {});
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function transferPass(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "pass.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    await studioService.transferPass(req.body || {});
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function requestPassRefund(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    const row = await studioService.requestPassRefund({
      ...(req.body || {}),
      userId: String(user.id),
    });
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
}

export async function listAdminPassRefunds(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "pass.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const status = String(req.query.status || "").trim();
    const refunds = await studioService.listPassRefunds({ status: status || undefined });
    res.json({ refunds: Array.isArray(refunds) ? refunds : [] });
  } catch (error) {
    next(error);
  }
}

export async function resolvePassRefund(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "pass.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const status = String(req.body?.status || "").trim();
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "상태값이 올바르지 않습니다." });
    }
    await studioService.resolvePassRefund(String(req.params.refundId || "").trim(), status);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}


// ── 게시판 ──────────────────────────────────────────────────────────

export async function listAdminNotices(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const { search, page, pageSize } = req.query;
    const result = await studioService.listAdminNotices({
      search,
      page: Number(page) || 1,
      pageSize: Math.min(100, Number(pageSize) || 20),
    });
    res.json(result);
  } catch (error) { next(error); }
}

export async function getAdminNoticeHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const notice = await studioService.getAdminNotice(req.params.noticeId);
    res.json({ notice });
  } catch (error) { next(error); }
}

export async function createAdminNoticeHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const notice = await studioService.createAdminNotice(user.id, req.body || {});
    res.status(201).json({ notice });
  } catch (error) { next(error); }
}

export async function updateAdminNoticeHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const notice = await studioService.updateAdminNotice(req.params.noticeId, req.body || {});
    res.json({ notice });
  } catch (error) { next(error); }
}

export async function deleteAdminNoticesHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const result = await studioService.deleteAdminNotices(ids);
    res.json(result);
  } catch (error) { next(error); }
}

export async function uploadNoticeImageHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "settings.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return res.status(400).json({ message: "파일이 없습니다." });
    const fileName = String(req.headers["x-file-name"] || "upload.jpg");
    const mimeType = String(req.headers["content-type"] || "image/jpeg").split(";")[0].trim();
    const url = await studioAssetService.uploadNoticeImage(buffer, fileName, mimeType);
    res.json({ url });
  } catch (error) { next(error); }
}

export async function listConsultationsHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.read"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const consultations = await studioService.listConsultations({
      date: req.query?.date,
      staffName: req.query?.staffName,
      type: req.query?.type,
      search: req.query?.search,
      limit: req.query?.limit,
    });
    const canViewPii = await canViewMemberPii(user, studioService.resolveUserStudioRole);
    res.json({ consultations: canViewPii ? consultations : maskMemberRows(consultations) });
  } catch (error) { next(error); }
}

export async function createConsultationHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const result = await studioService.createConsultation(req.body || {});
    res.json({ consultation: result });
  } catch (error) { next(error); }
}

export async function deleteConsultationHandler(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) return res.status(401).json({ message: "로그인이 필요합니다." });
    if (!(await canAccessStudioAdmin(user, "member.write"))) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const result = await studioService.deleteConsultation(req.params?.consultationId);
    res.json(result);
  } catch (error) { next(error); }
}

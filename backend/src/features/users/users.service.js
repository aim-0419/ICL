import { query, queryOne } from "../../shared/db/mysql.js";
import { env } from "../../config/env.js";

// 인증 및 탈퇴 보관 정책 상수 정의
const EMAIL_VERIFICATION_EXPIRES_MS = 1000 * 60 * 5;
const PHONE_VERIFICATION_EXPIRES_MS = 1000 * 60 * 5;
const ACCOUNT_WITHDRAW_RETENTION_DAYS = 90;
const ACCOUNT_STATUS_ACTIVE = "active";
const ACCOUNT_STATUS_WITHDRAWN = "withdrawn";

// 이메일/휴대폰 인증 임시 상태 저장소
const emailVerificationStore = new Map();
const withdrawPhoneVerificationStore = new Map();

function normalizePhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .trim();
}

function normalizeBirthYear(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const year = Number.parseInt(text, 10);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) {
    return null;
  }

  return year;
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return "";
  if (normalized.length <= 4) return normalized;
  return `${"*".repeat(normalized.length - 4)}${normalized.slice(-4)}`;
}

// 탈퇴 상태 판별 유틸리티
function isWithdrawn(user) {
  return String(user?.accountStatus || "")
    .trim()
    .toLowerCase() === ACCOUNT_STATUS_WITHDRAWN;
}

async function selectUserById(userId) {
  return queryOne(
    `SELECT
      id,
      login_id AS loginId,
      name,
      email,
      phone,
      role,
      is_admin AS isAdmin,
      user_grade AS userGrade,
      birth_year AS birthYear,
      account_status AS accountStatus,
      withdrawn_at AS withdrawnAt,
      withdrawal_purge_at AS withdrawalPurgeAt,
      restored_at AS restoredAt,
      created_at AS createdAt
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
}

// 탈퇴 만료 시 연관 데이터 영구 폐기 처리
async function purgeUserData(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return;

  await query(`DELETE FROM sessions WHERE user_id = ?`, [normalizedUserId]);
  await query(`DELETE FROM cart_items WHERE user_id = ?`, [normalizedUserId]);
  await query(`DELETE FROM point_history WHERE user_id = ?`, [normalizedUserId]);
  await query(`DELETE FROM academy_reviews WHERE user_id = ?`, [normalizedUserId]);
  await query(`DELETE FROM academy_qna_replies WHERE user_id = ?`, [normalizedUserId]);
  await query(`DELETE FROM academy_qna_posts WHERE user_id = ?`, [normalizedUserId]);
  await query(`DELETE FROM inquiry_replies WHERE author_id = ?`, [normalizedUserId]);
  await query(`UPDATE review_posts SET author_id = NULL WHERE author_id = ?`, [normalizedUserId]);
  await query(`UPDATE inquiry_posts SET author_id = NULL WHERE author_id = ?`, [normalizedUserId]);
  await query(`DELETE FROM users WHERE id = ?`, [normalizedUserId]);

  emailVerificationStore.delete(normalizedUserId);
  withdrawPhoneVerificationStore.delete(normalizedUserId);
}

// 탈퇴 직전 휴대폰 인증 완료 여부 검증
function isWithdrawPhoneVerified(userId, phone) {
  const saved = withdrawPhoneVerificationStore.get(userId);
  if (!saved) return false;
  if (!saved.verifiedAt) return false;
  if (Date.now() > Number(saved.expiresAt || 0)) return false;
  return saved.phone === phone;
}

export async function listUsers() {
  return query(
    `SELECT
      id,
      login_id AS loginId,
      name,
      email,
      phone,
      role,
      is_admin AS isAdmin,
      user_grade AS userGrade,
      birth_year AS birthYear,
      account_status AS accountStatus,
      withdrawn_at AS withdrawnAt,
      withdrawal_purge_at AS withdrawalPurgeAt,
      restored_at AS restoredAt,
      created_at AS createdAt
     FROM users
     ORDER BY created_at DESC`
  );
}

// 내 정보 수정 처리
export async function updateMyProfile(userId, payload) {
  const currentPassword = String(payload.currentPassword || "").trim();
  const loginId = String(payload.loginId || "").trim();
  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  const newPassword = String(payload.newPassword || "").trim();
  const hasBirthYearInput = Object.prototype.hasOwnProperty.call(payload || {}, "birthYear");
  const birthYear = normalizeBirthYear(payload?.birthYear);

  if (!currentPassword) {
    const error = new Error("정보를 수정하려면 현재 비밀번호를 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const existing = await queryOne(
    `SELECT
      id,
      login_id AS loginId,
      name,
      email,
      phone,
      password,
      birth_year AS birthYear,
      account_status AS accountStatus
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (!existing) {
    const error = new Error("회원 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  if (isWithdrawn(existing)) {
    const error = new Error("탈퇴 처리된 계정은 개인정보를 수정할 수 없습니다.");
    error.status = 403;
    throw error;
  }

  if (existing.password !== currentPassword) {
    const error = new Error("현재 비밀번호가 일치하지 않습니다.");
    error.status = 401;
    throw error;
  }

  if (hasBirthYearInput && String(payload?.birthYear ?? "").trim() && birthYear === null) {
    const error = new Error("출생연도는 4자리 숫자로 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const nextLoginId = loginId || existing.loginId;
  const nextEmail = email || existing.email;
  const nextPhone = phone || existing.phone || null;
  const nextPassword = newPassword || existing.password;
  const nextBirthYear = hasBirthYearInput ? birthYear : existing.birthYear ?? null;
  const isEmailChanged = nextEmail !== existing.email;

  if (!nextLoginId || !nextEmail) {
    const error = new Error("아이디와 이메일은 비워둘 수 없습니다.");
    error.status = 400;
    throw error;
  }

  const duplicatedLoginId = await queryOne(
    `SELECT id FROM users WHERE login_id = ? AND id <> ? LIMIT 1`,
    [nextLoginId, userId]
  );
  if (duplicatedLoginId) {
    const error = new Error("이미 사용 중인 아이디입니다.");
    error.status = 409;
    throw error;
  }

  const duplicatedEmail = await queryOne(`SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`, [
    nextEmail,
    userId,
  ]);
  if (duplicatedEmail) {
    const error = new Error("이미 사용 중인 이메일입니다.");
    error.status = 409;
    throw error;
  }

  if (isEmailChanged) {
    const verification = emailVerificationStore.get(userId);
    const now = Date.now();
    const isVerified =
      verification &&
      verification.email === nextEmail &&
      verification.verifiedAt &&
      Number(verification.expiresAt || 0) >= now;

    if (!isVerified) {
      const error = new Error("이메일 변경 전 인증번호 확인을 완료해 주세요.");
      error.status = 400;
      throw error;
    }
  }

  await query(
    `UPDATE users
     SET login_id = ?, email = ?, phone = ?, password = ?, birth_year = ?
     WHERE id = ?`,
    [nextLoginId, nextEmail, nextPhone, nextPassword, nextBirthYear, userId]
  );

  if (isEmailChanged) {
    emailVerificationStore.delete(userId);
  }

  return selectUserById(userId);
}

// 이메일 인증번호 발송 처리
export async function requestEmailVerificationCode(userId, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const error = new Error("인증할 이메일을 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const existingUser = await queryOne(
    `SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`,
    [normalizedEmail, userId]
  );
  if (existingUser) {
    const error = new Error("이미 사용 중인 이메일입니다.");
    error.status = 409;
    throw error;
  }

  const code = generateVerificationCode();
  const expiresAt = Date.now() + EMAIL_VERIFICATION_EXPIRES_MS;

  emailVerificationStore.set(userId, {
    email: normalizedEmail,
    code,
    expiresAt,
    verifiedAt: null,
  });

  console.info("[email-verification] code generated", {
    userId,
    email: normalizedEmail,
    code,
    expiresAt,
  });

  return {
    email: normalizedEmail,
    expiresInSeconds: Math.floor(EMAIL_VERIFICATION_EXPIRES_MS / 1000),
    ...(env.nodeEnv === "production" ? {} : { debugCode: code }),
  };
}

// 이메일 인증번호 확인 처리
export async function confirmEmailVerificationCode(userId, email, code) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = String(code || "").trim();

  if (!normalizedEmail || !normalizedCode) {
    const error = new Error("이메일과 인증번호를 모두 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const saved = emailVerificationStore.get(userId);
  if (!saved || saved.email !== normalizedEmail) {
    const error = new Error("인증 요청 이력이 없습니다. 인증번호를 다시 발송해 주세요.");
    error.status = 400;
    throw error;
  }

  if (Date.now() > Number(saved.expiresAt || 0)) {
    emailVerificationStore.delete(userId);
    const error = new Error("인증번호가 만료되었습니다. 인증번호를 다시 요청해 주세요.");
    error.status = 400;
    throw error;
  }

  if (saved.code !== normalizedCode) {
    const error = new Error("인증번호가 일치하지 않습니다.");
    error.status = 400;
    throw error;
  }

  emailVerificationStore.set(userId, {
    ...saved,
    verifiedAt: Date.now(),
  });

  return {
    email: normalizedEmail,
    verified: true,
  };
}

// 탈퇴용 휴대폰 인증번호 발송 처리
export async function requestWithdrawPhoneVerificationCode(userId, phone) {
  const user = await queryOne(
    `SELECT id, phone, account_status AS accountStatus
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (!user) {
    const error = new Error("회원 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  if (isWithdrawn(user)) {
    const error = new Error("이미 탈퇴 처리된 계정입니다.");
    error.status = 400;
    throw error;
  }

  const registeredPhone = normalizePhone(user.phone);
  if (!registeredPhone) {
    const error = new Error("등록된 휴대폰 번호가 없습니다. 고객센터로 문의해 주세요.");
    error.status = 400;
    throw error;
  }

  const requestedPhone = normalizePhone(phone || registeredPhone);
  if (!requestedPhone || requestedPhone !== registeredPhone) {
    const error = new Error("등록된 휴대폰 번호와 일치하지 않습니다.");
    error.status = 400;
    throw error;
  }

  const code = generateVerificationCode();
  const expiresAt = Date.now() + PHONE_VERIFICATION_EXPIRES_MS;

  withdrawPhoneVerificationStore.set(userId, {
    phone: registeredPhone,
    code,
    expiresAt,
    verifiedAt: null,
  });

  console.info("[withdraw-phone-verification] code generated", {
    userId,
    phone: registeredPhone,
    code,
    expiresAt,
  });

  return {
    phone: maskPhone(registeredPhone),
    expiresInSeconds: Math.floor(PHONE_VERIFICATION_EXPIRES_MS / 1000),
    ...(env.nodeEnv === "production" ? {} : { debugCode: code }),
  };
}

// 탈퇴용 휴대폰 인증번호 검증 처리
export async function confirmWithdrawPhoneVerificationCode(userId, phone, code) {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) {
    const error = new Error("인증번호를 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const user = await queryOne(
    `SELECT id, phone, account_status AS accountStatus
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (!user) {
    const error = new Error("회원 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  if (isWithdrawn(user)) {
    const error = new Error("이미 탈퇴 처리된 계정입니다.");
    error.status = 400;
    throw error;
  }

  const saved = withdrawPhoneVerificationStore.get(userId);
  if (!saved) {
    const error = new Error("휴대폰 인증 요청 이력이 없습니다. 인증번호를 먼저 발송해 주세요.");
    error.status = 400;
    throw error;
  }

  if (Date.now() > Number(saved.expiresAt || 0)) {
    withdrawPhoneVerificationStore.delete(userId);
    const error = new Error("인증번호가 만료되었습니다. 인증번호를 다시 요청해 주세요.");
    error.status = 400;
    throw error;
  }

  const registeredPhone = normalizePhone(user.phone);
  const requestedPhone = normalizePhone(phone || registeredPhone);
  if (!registeredPhone || requestedPhone !== registeredPhone || saved.phone !== registeredPhone) {
    withdrawPhoneVerificationStore.delete(userId);
    const error = new Error("휴대폰 번호가 일치하지 않습니다. 인증을 다시 진행해 주세요.");
    error.status = 400;
    throw error;
  }

  if (saved.code !== normalizedCode) {
    const error = new Error("인증번호가 일치하지 않습니다.");
    error.status = 400;
    throw error;
  }

  withdrawPhoneVerificationStore.set(userId, {
    ...saved,
    verifiedAt: Date.now(),
  });

  return {
    verified: true,
    phone: maskPhone(registeredPhone),
  };
}

// 휴대폰 인증 완료 후 회원 탈퇴 처리
export async function withdrawMyAccount(userId, payload = {}) {
  const user = await selectUserById(userId);
  if (!user?.id) {
    const error = new Error("회원 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  if (isWithdrawn(user)) {
    return {
      alreadyWithdrawn: true,
      user,
    };
  }

  const registeredPhone = normalizePhone(user.phone);
  const requestedPhone = normalizePhone(payload?.phone || registeredPhone);

  if (!registeredPhone || requestedPhone !== registeredPhone) {
    const error = new Error("등록된 휴대폰 번호로 본인 인증을 완료해 주세요.");
    error.status = 400;
    throw error;
  }

  if (!isWithdrawPhoneVerified(userId, registeredPhone)) {
    const error = new Error("탈퇴 전 휴대폰 인증이 필요합니다.");
    error.status = 400;
    throw error;
  }

  await query(
    `UPDATE users
     SET account_status = ?,
         withdrawn_at = NOW(),
         withdrawal_purge_at = DATE_ADD(NOW(), INTERVAL ? DAY),
         restored_at = NULL
     WHERE id = ?`,
    [ACCOUNT_STATUS_WITHDRAWN, ACCOUNT_WITHDRAW_RETENTION_DAYS, userId]
  );

  await query(`DELETE FROM sessions WHERE user_id = ?`, [String(userId)]);
  emailVerificationStore.delete(String(userId));
  withdrawPhoneVerificationStore.delete(String(userId));

  const updatedUser = await selectUserById(userId);
  return {
    user: updatedUser,
    retentionDays: ACCOUNT_WITHDRAW_RETENTION_DAYS,
    purgeAt: updatedUser?.withdrawalPurgeAt || null,
  };
}

// 보관 기간 내 탈퇴 계정 복구 처리
export async function restoreWithdrawnUser(userId) {
  const user = await selectUserById(userId);
  if (!user?.id) {
    const error = new Error("회원 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  if (!isWithdrawn(user)) {
    const error = new Error("탈퇴 상태의 계정만 복구할 수 있습니다.");
    error.status = 400;
    throw error;
  }

  const purgeAtTime = new Date(user.withdrawalPurgeAt || "").getTime();
  if (Number.isFinite(purgeAtTime) && purgeAtTime <= Date.now()) {
    await purgeUserData(userId);
    const error = new Error("보관 기간이 만료되어 계정 복구가 불가능합니다.");
    error.status = 410;
    throw error;
  }

  await query(
    `UPDATE users
     SET account_status = ?,
         withdrawn_at = NULL,
         withdrawal_purge_at = NULL,
         restored_at = NOW()
     WHERE id = ?`,
    [ACCOUNT_STATUS_ACTIVE, userId]
  );

  return selectUserById(userId);
}

// 보관 기간 만료 탈퇴 계정 일괄 폐기 처리
export async function purgeExpiredWithdrawnUsers() {
  const rows = await query(
    `SELECT id
     FROM users
     WHERE account_status = ?
       AND withdrawal_purge_at IS NOT NULL
       AND withdrawal_purge_at <= NOW()
     LIMIT 500`,
    [ACCOUNT_STATUS_WITHDRAWN]
  );

  let purgedCount = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const targetUserId = String(row?.id || "").trim();
    if (!targetUserId) continue;
    await purgeUserData(targetUserId);
    purgedCount += 1;
  }

  return { purgedCount };
}

export async function getUserPoints(userId) {
  const row = await queryOne(`SELECT points FROM users WHERE id = ?`, [String(userId)]);
  return Number(row?.points ?? 0);
}

export async function adjustPoints(userId, amount, reason, orderId = null) {
  const { randomUUID } = await import("node:crypto");
  const currentPoints = await getUserPoints(userId);
  const newPoints = Math.max(0, currentPoints + amount);
  await query(`UPDATE users SET points = ? WHERE id = ?`, [newPoints, String(userId)]);
  await query(
    `INSERT INTO point_history (id, user_id, amount, reason, order_id, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [randomUUID(), String(userId), amount, String(reason), orderId || null]
  );
  return { points: newPoints, delta: amount };
}

export async function getPointHistory(userId) {
  const rows = await query(
    `SELECT id, amount, reason, order_id AS orderId, created_at AS createdAt
     FROM point_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [String(userId)]
  );
  return Array.isArray(rows) ? rows : [];
}

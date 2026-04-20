import { query, queryOne } from "../../shared/db/mysql.js";
import { env } from "../../config/env.js";

const EMAIL_VERIFICATION_EXPIRES_MS = 1000 * 60 * 5;
const emailVerificationStore = new Map();

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

export async function listUsers() {
  const rows = await query(
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
      created_at AS createdAt
     FROM users
     ORDER BY created_at DESC`
  );
  return rows;
}

export async function updateMyProfile(userId, payload) {
  const currentPassword = String(payload.currentPassword || "").trim();
  const loginId = String(payload.loginId || "").trim();
  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  const phone = normalizePhone(payload.phone);
  const newPassword = String(payload.newPassword || "").trim();
  const hasBirthYearInput = Object.prototype.hasOwnProperty.call(payload || {}, "birthYear");
  const birthYear = normalizeBirthYear(payload?.birthYear);

  if (!currentPassword) {
    const error = new Error("?ïÎ≥¥ ?òÏ†ï???ÑÌï¥ ?ÑÏû¨ ÎπÑÎ?Î≤àÌò∏Î•??ÖÎ†•??Ï£ºÏÑ∏??");
    error.status = 400;
    throw error;
  }

  const existing = await queryOne(
    `SELECT id, login_id AS loginId, name, email, phone, password, birth_year AS birthYear
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (!existing) {
    const error = new Error("?åÏõê ?ïÎ≥¥Î•?Ï∞æÏùÑ ???ÜÏäµ?àÎã§.");
    error.status = 404;
    throw error;
  }

  if (existing.password !== currentPassword) {
    const error = new Error("?ÑÏû¨ ÎπÑÎ?Î≤àÌò∏Í∞Ä ?ºÏπò?òÏ? ?äÏäµ?àÎã§.");
    error.status = 401;
    throw error;
  }

  if (hasBirthYearInput && String(payload?.birthYear ?? "").trim() && birthYear === null) {
    const error = new Error("Birth year must be a 4-digit number.");
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
    const error = new Error("?ÑÏù¥?îÏ? ?¥Î©î?ºÏ? ÎπÑÏõå?????ÜÏäµ?àÎã§.");
    error.status = 400;
    throw error;
  }

  const duplicatedLoginId = await queryOne(
    `SELECT id FROM users WHERE login_id = ? AND id <> ? LIMIT 1`,
    [nextLoginId, userId]
  );
  if (duplicatedLoginId) {
    const error = new Error("?¥Î? ?¨Ïö© Ï§ëÏù∏ ?ÑÏù¥?îÏûÖ?àÎã§.");
    error.status = 409;
    throw error;
  }

  const duplicatedEmail = await queryOne(`SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`, [
    nextEmail,
    userId,
  ]);
  if (duplicatedEmail) {
    const error = new Error("?¥Î? ?¨Ïö© Ï§ëÏù∏ ?¥Î©î?ºÏûÖ?àÎã§.");
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
      const error = new Error("?¥Î©î??Î≥ÄÍ≤ΩÏùÑ ?ÑÌï¥ ?∏Ï¶ùÎ≤àÌò∏ ?ïÏù∏???ÑÎ£å??Ï£ºÏÑ∏??");
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
      created_at AS createdAt
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function requestEmailVerificationCode(userId, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const error = new Error("?∏Ï¶ù???¥Î©î?ºÏùÑ ?ÖÎ†•??Ï£ºÏÑ∏??");
    error.status = 400;
    throw error;
  }

  const existingUser = await queryOne(
    `SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`,
    [normalizedEmail, userId]
  );
  if (existingUser) {
    const error = new Error("?¥Î? ?¨Ïö© Ï§ëÏù∏ ?¥Î©î?ºÏûÖ?àÎã§.");
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

export async function confirmEmailVerificationCode(userId, email, code) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = String(code || "").trim();

  if (!normalizedEmail || !normalizedCode) {
    const error = new Error("?¥Î©î?ºÍ≥º ?∏Ï¶ùÎ≤àÌò∏Î•?Î™®Îëê ?ÖÎ†•??Ï£ºÏÑ∏??");
    error.status = 400;
    throw error;
  }

  const saved = emailVerificationStore.get(userId);
  if (!saved || saved.email !== normalizedEmail) {
    const error = new Error("?∏Ï¶ù ?îÏ≤≠ ?¥Î†•???ÜÏäµ?àÎã§. ?∏Ï¶ùÎ≤àÌò∏Î•??§Ïãú Î∞úÏÜ°??Ï£ºÏÑ∏??");
    error.status = 400;
    throw error;
  }

  if (Date.now() > Number(saved.expiresAt || 0)) {
    emailVerificationStore.delete(userId);
    const error = new Error("?∏Ï¶ùÎ≤àÌò∏Í∞Ä ÎßåÎ£å?òÏóà?µÎãà?? ?§Ïãú Î∞úÏÜ°??Ï£ºÏÑ∏??");
    error.status = 400;
    throw error;
  }

  if (saved.code !== normalizedCode) {
    const error = new Error("?∏Ï¶ùÎ≤àÌò∏Í∞Ä ?ºÏπò?òÏ? ?äÏäµ?àÎã§.");
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


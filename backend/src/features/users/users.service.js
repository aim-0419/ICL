import { query, queryOne } from "../../shared/db/mysql.js";
import { env } from "../../config/env.js";

const EMAIL_VERIFICATION_EXPIRES_MS = 1000 * 60 * 5;
const emailVerificationStore = new Map();

function normalizePhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .trim();
}

export async function listUsers() {
  const rows = await query(
    `SELECT id, login_id AS loginId, name, email, phone, role, is_admin AS isAdmin, created_at AS createdAt
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

  if (!currentPassword) {
    const error = new Error("정보 수정을 위해 현재 비밀번호를 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const existing = await queryOne(
    `SELECT id, login_id AS loginId, name, email, phone, password
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

  if (existing.password !== currentPassword) {
    const error = new Error("현재 비밀번호가 일치하지 않습니다.");
    error.status = 401;
    throw error;
  }

  const nextLoginId = loginId || existing.loginId;
  const nextEmail = email || existing.email;
  const nextPhone = phone || existing.phone || null;
  const nextPassword = newPassword || existing.password;
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
      const error = new Error("이메일 변경을 위해 인증번호 확인을 완료해 주세요.");
      error.status = 400;
      throw error;
    }
  }

  await query(
    `UPDATE users
     SET login_id = ?, email = ?, phone = ?, password = ?
     WHERE id = ?`,
    [nextLoginId, nextEmail, nextPhone, nextPassword, userId]
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
    const error = new Error("인증번호가 만료되었습니다. 다시 발송해 주세요.");
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

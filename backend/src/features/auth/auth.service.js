// 파일 역할: 인증 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { query, queryOne } from "../../shared/db/mysql.js";
import { sendEmailVerificationCode } from "../../shared/email/email.service.js";
import { hashPassword, isPasswordHash, verifyPassword } from "../../shared/security/password.js";

const ACCOUNT_STATUS_ACTIVE = "active";
const ACCOUNT_STATUS_WITHDRAWN = "withdrawn";

const SIGNUP_EMAIL_VERIFICATION_EXPIRES_MS = 1000 * 60 * 5;

// 로그인 성공 시 기존 세션 정리 후 신규 세션 토큰 발급
// 함수 역할: 세션 by 회원 ID 데이터를 삭제합니다.
async function deleteSessionsByUserId(userId) {
  if (!userId) return;
  await query(`DELETE FROM sessions WHERE user_id = ?`, [String(userId)]);
}

// 함수 역할: 세션 데이터를 새로 생성합니다.
async function createSession(userId) {
  await deleteSessionsByUserId(userId);

  const token = `session-${randomUUID()}-${randomBytes(32).toString("hex")}`;
  await query(
    `INSERT INTO sessions (token, user_id, created_at)
     VALUES (?, ?, NOW())`,
    [token, userId]
  );
  return token;
}

// 함수 역할: 전화번호 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizePhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .trim();
}

// 함수 역할: 출생 연도 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
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

// 함수 역할: 탈퇴 조건에 해당하는지 참/거짓으로 판별합니다.
function isWithdrawn(status) {
  return String(status || "")
    .trim()
    .toLowerCase() === ACCOUNT_STATUS_WITHDRAWN;
}

// DB row를 API 응답용 사용자 모델로 변환
// 함수 역할: 공개 회원 값으로 안전하게 변환합니다.
function toPublicUser(userRow) {
  if (!userRow) return null;
  return {
    id: userRow.id,
    loginId: userRow.loginId,
    name: userRow.name,
    email: userRow.email,
    phone: userRow.phone,
    role: userRow.role,
    isAdmin: userRow.isAdmin,
    userGrade: userRow.userGrade,
    birthYear: userRow.birthYear,
    accountStatus: userRow.accountStatus,
    withdrawnAt: userRow.withdrawnAt || null,
    withdrawalPurgeAt: userRow.withdrawalPurgeAt || null,
    restoredAt: userRow.restoredAt || null,
    marketingAgree: Boolean(userRow.marketingAgree),
    marketingAgreedAt: userRow.marketingAgreedAt || null,
    createdAt: userRow.createdAt,
  };
}

// 함수 역할: 세션 데이터를 삭제합니다.
export async function deleteSession(token) {
  await query(`DELETE FROM sessions WHERE token = ?`, [token]);
}

// 세션 토큰 기반 인증 사용자 조회
// 함수 역할: 회원 by 세션 토큰 대상을 탐색해 반환합니다.
export async function findUserBySessionToken(token) {
  if (!token) return null;

  return queryOne(
    `SELECT
      u.id,
      u.login_id AS loginId,
      u.name,
      u.email,
      u.phone,
      u.role,
      u.is_admin AS isAdmin,
      u.user_grade AS userGrade,
      u.birth_year AS birthYear,
      u.account_status AS accountStatus,
      u.withdrawn_at AS withdrawnAt,
      u.withdrawal_purge_at AS withdrawalPurgeAt,
      u.restored_at AS restoredAt,
      u.marketing_agree AS marketingAgree,
      u.marketing_agreed_at AS marketingAgreedAt,
      u.created_at AS createdAt
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
       AND u.account_status = ?
     LIMIT 1`,
    [token, ACCOUNT_STATUS_ACTIVE]
  );
}

// 회원가입 이메일 인증번호 발송
export async function requestSignupEmailVerification(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    const error = new Error("이메일을 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const exists = await queryOne(`SELECT id FROM users WHERE email = ? LIMIT 1`, [normalizedEmail]);
  if (exists) {
    const error = new Error("이미 가입된 이메일입니다.");
    error.status = 409;
    throw error;
  }

  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + SIGNUP_EMAIL_VERIFICATION_EXPIRES_MS);

  await query(
    `INSERT INTO email_verifications (email, code, expires_at, verified_at)
     VALUES (?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at), verified_at = NULL`,
    [normalizedEmail, code, expiresAt]
  );

  void sendEmailVerificationCode(normalizedEmail, code, Math.floor(SIGNUP_EMAIL_VERIFICATION_EXPIRES_MS / 60000));
  return { expiresInSeconds: Math.floor(SIGNUP_EMAIL_VERIFICATION_EXPIRES_MS / 1000) };
}

// 회원가입 이메일 인증번호 확인
export async function confirmSignupEmailVerification(email, code) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCode = String(code || "").trim();

  if (!normalizedEmail || !normalizedCode) {
    const error = new Error("이메일과 인증번호를 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const saved = await queryOne(
    `SELECT code, expires_at AS expiresAt, verified_at AS verifiedAt
     FROM email_verifications WHERE email = ? LIMIT 1`,
    [normalizedEmail]
  );

  if (!saved) {
    const error = new Error("인증 요청 이력이 없습니다. 인증번호를 다시 발송해 주세요.");
    error.status = 400;
    throw error;
  }

  if (new Date() > new Date(saved.expiresAt)) {
    await query(`DELETE FROM email_verifications WHERE email = ?`, [normalizedEmail]);
    const error = new Error("인증번호가 만료되었습니다. 다시 요청해 주세요.");
    error.status = 400;
    throw error;
  }

  if (saved.code !== normalizedCode) {
    const error = new Error("인증번호가 일치하지 않습니다.");
    error.status = 400;
    throw error;
  }

  await query(
    `UPDATE email_verifications SET verified_at = NOW() WHERE email = ?`,
    [normalizedEmail]
  );
  return { verified: true };
}

// 회원가입 처리
// 함수 역할: signup에 서명해 변조 여부를 확인할 수 있게 합니다.
export async function signup(payload) {
  const loginId = String(payload.loginId || "").trim();
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const phone = normalizePhone(payload.phone);
  const password = String(payload.password || "").trim();
  const birthYear = normalizeBirthYear(payload.birthYear);

  if (!loginId || !name || !email || !password) {
    const error = new Error("필수 정보를 모두 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const emailExists = await queryOne(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
  if (emailExists) {
    const error = new Error("이미 가입된 이메일입니다.");
    error.status = 409;
    throw error;
  }

  const verification = await queryOne(
    `SELECT verified_at AS verifiedAt, expires_at AS expiresAt
     FROM email_verifications WHERE email = ? LIMIT 1`,
    [email]
  );
  if (!verification?.verifiedAt || new Date() > new Date(verification.expiresAt)) {
    const error = new Error("이메일 인증을 먼저 완료해 주세요.");
    error.status = 400;
    throw error;
  }

  const loginIdExists = await queryOne(`SELECT id FROM users WHERE login_id = ? LIMIT 1`, [loginId]);
  if (loginIdExists) {
    const error = new Error("이미 사용 중인 아이디입니다.");
    error.status = 409;
    throw error;
  }

  const marketingAgree = payload.marketingAgree === true ? 1 : 0;

  const user = {
    id: `user-${randomUUID()}`,
    loginId,
    name,
    email,
    password: await hashPassword(password),
    phone,
    birthYear,
    marketingAgree,
  };

  await query(
    `INSERT INTO users (
      id,
      login_id,
      name,
      email,
      password,
      phone,
      birth_year,
      account_status,
      marketing_agree,
      marketing_agreed_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? = 1, NOW(), NULL), NOW())`,
    [
      user.id,
      user.loginId,
      user.name,
      user.email,
      user.password,
      user.phone || null,
      user.birthYear,
      ACCOUNT_STATUS_ACTIVE,
      user.marketingAgree,
      user.marketingAgree,
    ]
  );

  const created = await queryOne(
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
      marketing_agree AS marketingAgree,
      marketing_agreed_at AS marketingAgreedAt,
      created_at AS createdAt
     FROM users
     WHERE id = ?`,
    [user.id]
  );

  await query(`DELETE FROM email_verifications WHERE email = ?`, [email]);
  const token = await createSession(user.id);
  return { user: toPublicUser(created), token };
}

// 로그인 처리 및 탈퇴 계정 접근 차단
// 함수 역할: login 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function login(payload) {
  const loginId = String(payload.loginId || "").trim();
  const password = String(payload.password || "").trim();

  if (!loginId || !password) {
    const error = new Error("아이디와 비밀번호를 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const user = await queryOne(
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
      password,
      account_status AS accountStatus,
      withdrawn_at AS withdrawnAt,
      withdrawal_purge_at AS withdrawalPurgeAt,
      restored_at AS restoredAt,
      created_at AS createdAt
     FROM users
     WHERE login_id = ?
     LIMIT 1`,
    [loginId]
  );

  const passwordMatches = user ? await verifyPassword(password, user.password) : false;
  if (!user || !passwordMatches) {
    const error = new Error("아이디 또는 비밀번호를 확인해 주세요.");
    error.status = 401;
    throw error;
  }

  if (isWithdrawn(user.accountStatus)) {
    const purgeAt = user.withdrawalPurgeAt ? new Date(user.withdrawalPurgeAt) : null;
    const purgeLabel = purgeAt && !Number.isNaN(purgeAt.getTime()) ? purgeAt.toLocaleDateString("ko-KR") : "";
    const error = new Error(
      purgeLabel
        ? `탈퇴 처리된 계정입니다. ${purgeLabel}까지 고객센터를 통해 복구 요청할 수 있습니다.`
        : "탈퇴 처리된 계정입니다. 고객센터를 통해 복구 요청이 가능합니다."
    );
    error.status = 403;
    throw error;
  }

  if (!isPasswordHash(user.password)) {
    await query(`UPDATE users SET password = ? WHERE id = ?`, [await hashPassword(password), user.id]);
  }

  const token = await createSession(user.id);
  return { user: toPublicUser(user), token };
}

// 함수 역할: 로그인 ID 대상을 탐색해 반환합니다.
export async function findLoginId(payload) {
  const name = String(payload.name || "").trim();
  const phone = normalizePhone(payload.phone);

  if (!name || !phone) {
    const error = new Error("이름과 휴대폰 번호를 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const user = await queryOne(
    `SELECT login_id AS loginId
     FROM users
     WHERE name = ? AND phone = ? AND account_status = ?
     LIMIT 1`,
    [name, phone, ACCOUNT_STATUS_ACTIVE]
  );

  if (!user?.loginId) {
    const error = new Error("일치하는 회원 정보를 찾지 못했습니다.");
    error.status = 404;
    throw error;
  }

  return user.loginId;
}

// 함수 역할: resetPassword 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function resetPassword(payload) {
  const loginId = String(payload.loginId || "").trim();
  const name = String(payload.name || "").trim();
  const phone = normalizePhone(payload.phone);
  const newPassword = String(payload.newPassword || "").trim();

  if (!loginId || !name || !phone || !newPassword) {
    const error = new Error("아이디, 이름, 휴대폰 번호, 새 비밀번호를 모두 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const target = await queryOne(
    `SELECT id
     FROM users
     WHERE login_id = ? AND name = ? AND phone = ? AND account_status = ?
     LIMIT 1`,
    [loginId, name, phone, ACCOUNT_STATUS_ACTIVE]
  );

  if (!target?.id) {
    const error = new Error("입력한 정보와 일치하는 회원을 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  await query(`UPDATE users SET password = ? WHERE id = ?`, [await hashPassword(newPassword), target.id]);
  return { ok: true };
}

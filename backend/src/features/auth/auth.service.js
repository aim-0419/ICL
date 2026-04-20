import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../shared/db/mysql.js";

// 로그인 성공 시 세션 테이블에 토큰을 저장해 쿠키 기반 인증을 유지한다.
async function createSession(userId) {
  const token = `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await query(
    `INSERT INTO sessions (token, user_id, created_at)
     VALUES (?, ?, NOW())`,
    [token, userId]
  );
  return token;
}

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

export async function deleteSession(token) {
  await query(`DELETE FROM sessions WHERE token = ?`, [token]);
}

// 세션 토큰으로 현재 로그인한 사용자의 공개 정보를 복원한다.
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
      u.created_at AS createdAt
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
     LIMIT 1`,
    [token]
  );
}

// 회원가입은 중복 이메일/아이디를 검증한 뒤 즉시 로그인 상태까지 만든다.
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

  const loginIdExists = await queryOne(`SELECT id FROM users WHERE login_id = ? LIMIT 1`, [loginId]);
  if (loginIdExists) {
    const error = new Error("이미 사용 중인 아이디입니다.");
    error.status = 409;
    throw error;
  }

  const user = {
    id: `user-${randomUUID()}`,
    loginId,
    name,
    email,
    password,
    phone,
    birthYear,
  };

  await query(
    `INSERT INTO users (id, login_id, name, email, password, phone, birth_year, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [user.id, user.loginId, user.name, user.email, user.password, user.phone || null, user.birthYear]
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
      created_at AS createdAt
     FROM users
     WHERE id = ?`,
    [user.id]
  );

  const token = await createSession(user.id);
  return { user: created, token };
}

// 현재 구조는 비밀번호 해시가 아니라 DB 평문 비교를 사용한다.
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
      created_at AS createdAt
     FROM users
     WHERE login_id = ? AND password = ?
     LIMIT 1`,
    [loginId, password]
  );

  if (!user) {
    const error = new Error("아이디 또는 비밀번호를 확인해 주세요.");
    error.status = 401;
    throw error;
  }

  const token = await createSession(user.id);
  return { user, token };
}

// 아이디 찾기는 이름 + 전화번호 조합으로 조회한다.
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
     WHERE name = ? AND phone = ?
     LIMIT 1`,
    [name, phone]
  );

  if (!user?.loginId) {
    const error = new Error("일치하는 회원 정보를 찾지 못했습니다.");
    error.status = 404;
    throw error;
  }

  return user.loginId;
}

// 비밀번호 재설정은 본인 확인 후 새 비밀번호로 바로 업데이트한다.
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
     WHERE login_id = ? AND name = ? AND phone = ?
     LIMIT 1`,
    [loginId, name, phone]
  );

  if (!target?.id) {
    const error = new Error("입력한 정보와 일치하는 회원을 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  await query(`UPDATE users SET password = ? WHERE id = ?`, [newPassword, target.id]);
  return { ok: true };
}

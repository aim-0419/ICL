import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../shared/db/mysql.js";

const ACCOUNT_STATUS_ACTIVE = "active";
const ACCOUNT_STATUS_WITHDRAWN = "withdrawn";

// 濡쒓렇???깃났 ???몄뀡 ?좏겙 諛쒓툒 諛????泥섎━
async function deleteSessionsByUserId(userId) {
  if (!userId) return;
  await query(`DELETE FROM sessions WHERE user_id = ?`, [String(userId)]);
}

async function createSession(userId) {
  await deleteSessionsByUserId(userId);

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

function isWithdrawn(status) {
  return String(status || "")
    .trim()
    .toLowerCase() === ACCOUNT_STATUS_WITHDRAWN;
}

// DB ?ъ슜???됱쓣 ?묐떟???ъ슜??紐⑤뜽濡?蹂??泥섎━
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
    createdAt: userRow.createdAt,
  };
}

export async function deleteSession(token) {
  await query(`DELETE FROM sessions WHERE token = ?`, [token]);
}

// ?몄뀡 ?좏겙 湲곕컲 ?몄쬆 ?ъ슜??議고쉶 泥섎━
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
      u.created_at AS createdAt
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
       AND u.account_status = ?
     LIMIT 1`,
    [token, ACCOUNT_STATUS_ACTIVE]
  );
}

// ?뚯썝媛??泥섎━
export async function signup(payload) {
  const loginId = String(payload.loginId || "").trim();
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const phone = normalizePhone(payload.phone);
  const password = String(payload.password || "").trim();
  const birthYear = normalizeBirthYear(payload.birthYear);

  if (!loginId || !name || !email || !password) {
    const error = new Error("?꾩닔 ?뺣낫瑜?紐⑤몢 ?낅젰??二쇱꽭??");
    error.status = 400;
    throw error;
  }

  const emailExists = await queryOne(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
  if (emailExists) {
    const error = new Error("?대? 媛?낅맂 ?대찓?쇱엯?덈떎.");
    error.status = 409;
    throw error;
  }

  const loginIdExists = await queryOne(`SELECT id FROM users WHERE login_id = ? LIMIT 1`, [loginId]);
  if (loginIdExists) {
    const error = new Error("?대? ?ъ슜 以묒씤 ?꾩씠?붿엯?덈떎.");
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
    `INSERT INTO users (
      id,
      login_id,
      name,
      email,
      password,
      phone,
      birth_year,
      account_status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      user.id,
      user.loginId,
      user.name,
      user.email,
      user.password,
      user.phone || null,
      user.birthYear,
      ACCOUNT_STATUS_ACTIVE,
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
      created_at AS createdAt
     FROM users
     WHERE id = ?`,
    [user.id]
  );

  const token = await createSession(user.id);
  return { user: toPublicUser(created), token };
}

// 濡쒓렇??泥섎━ 諛??덊눜 怨꾩젙 ?묎렐 李⑤떒
export async function login(payload) {
  const loginId = String(payload.loginId || "").trim();
  const password = String(payload.password || "").trim();

  if (!loginId || !password) {
    const error = new Error("?꾩씠?붿? 鍮꾨?踰덊샇瑜??낅젰??二쇱꽭??");
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

  if (!user || user.password !== password) {
    const error = new Error("?꾩씠???먮뒗 鍮꾨?踰덊샇瑜??뺤씤??二쇱꽭??");
    error.status = 401;
    throw error;
  }

  if (isWithdrawn(user.accountStatus)) {
    const purgeAt = user.withdrawalPurgeAt ? new Date(user.withdrawalPurgeAt) : null;
    const purgeLabel = purgeAt && !Number.isNaN(purgeAt.getTime()) ? purgeAt.toLocaleDateString("ko-KR") : "";
    const error = new Error(
      purgeLabel
        ? `?덊눜 泥섎━??怨꾩젙?낅땲?? ${purgeLabel} ?꾧퉴吏 怨좉컼?쇳꽣瑜??듯빐 蹂듦뎄?????덉뒿?덈떎.`
        : "?덊눜 泥섎━??怨꾩젙?낅땲?? 怨좉컼?쇳꽣瑜??듯빐 蹂듦뎄 ?붿껌??媛?ν빀?덈떎."
    );
    error.status = 403;
    throw error;
  }

  const token = await createSession(user.id);
  return { user: toPublicUser(user), token };
}

export async function findLoginId(payload) {
  const name = String(payload.name || "").trim();
  const phone = normalizePhone(payload.phone);

  if (!name || !phone) {
    const error = new Error("?대쫫怨??대???踰덊샇瑜??낅젰??二쇱꽭??");
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
    const error = new Error("?쇱튂?섎뒗 ?뚯썝 ?뺣낫瑜?李얠? 紐삵뻽?듬땲??");
    error.status = 404;
    throw error;
  }

  return user.loginId;
}

export async function resetPassword(payload) {
  const loginId = String(payload.loginId || "").trim();
  const name = String(payload.name || "").trim();
  const phone = normalizePhone(payload.phone);
  const newPassword = String(payload.newPassword || "").trim();

  if (!loginId || !name || !phone || !newPassword) {
    const error = new Error("?꾩씠?? ?대쫫, ?대???踰덊샇, ??鍮꾨?踰덊샇瑜?紐⑤몢 ?낅젰??二쇱꽭??");
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
    const error = new Error("?낅젰???뺣낫? ?쇱튂?섎뒗 ?뚯썝??李얠쓣 ???놁뒿?덈떎.");
    error.status = 404;
    throw error;
  }

  await query(`UPDATE users SET password = ? WHERE id = ?`, [newPassword, target.id]);
  return { ok: true };
}


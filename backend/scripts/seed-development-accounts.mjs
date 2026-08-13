import { pathToFileURL } from "node:url";

import mysql from "mysql2/promise";

import { assertRuntimeEnvironment, env } from "../src/config/env.js";
import { createMysqlConnectionOptions } from "../src/shared/db/connection-options.js";
import { hashPassword } from "../src/shared/security/password.js";
import { encryptedUserValues } from "../src/shared/security/pii.js";

const TARGET_DATABASE = "homepage_dev";
const TARGET_USER = "homepage_dev_user";
const ACCOUNT_IDS = Object.freeze({
  admin: "development_admin",
  member: "development_member",
});

export function validateDevelopmentCredentials({ adminLoginId, adminPassword, memberLoginId, memberPassword }) {
  const errors = [];
  const loginIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{3,39}$/;
  const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;

  if (!loginIdPattern.test(adminLoginId)) errors.push("development admin login ID is invalid");
  if (!loginIdPattern.test(memberLoginId)) errors.push("development member login ID is invalid");
  if (adminLoginId && adminLoginId === memberLoginId) errors.push("development login IDs must be different");
  if (!passwordPattern.test(adminPassword)) errors.push("development admin password is too weak");
  if (!passwordPattern.test(memberPassword)) errors.push("development member password is too weak");

  return errors;
}

function assertSafeEnvironment(credentials) {
  assertRuntimeEnvironment();
  const errors = validateDevelopmentCredentials(credentials);

  if (env.nodeEnv !== "development" || env.appEnvironment !== "development") {
    errors.push("development environment is required");
  }
  if (env.testSafeMode !== true) errors.push("TEST_SAFE_MODE must be true");
  if (env.dbName !== TARGET_DATABASE) errors.push("DB_NAME must be homepage_dev");
  if (env.dbUser !== TARGET_USER) errors.push("DB_USER must be homepage_dev_user");
  if (env.dbInitMode !== "safe") errors.push("DB_INIT_MODE must be safe");
  if (
    env.allowStartupSchemaBootstrap ||
    env.allowStartupSchemaAlter ||
    env.allowStartupDataRepair ||
    env.allowDestructiveMigrations ||
    env.allowStartupDataPurge ||
    env.allowStartupSchemaDrop ||
    env.allowStartupUserPurge
  ) {
    errors.push("all startup database mutation flags must be disabled");
  }
  if (
    env.allowExternalEmailSend ||
    env.allowExternalSmsSend ||
    env.allowExternalKakaoSend ||
    env.allowExternalPushSend ||
    env.allowExternalPaymentCalls
  ) {
    errors.push("all external side effects must be disabled");
  }
  if (env.academyPublishSchedulerEnabled || env.notificationSchedulerEnabled) {
    errors.push("all schedulers must be disabled");
  }

  const piiKey = String(env.piiEncryptionKey || "").trim();
  if (piiKey.length < 32 || /change-me|example|placeholder/i.test(piiKey)) {
    errors.push("PII_ENCRYPTION_KEY must be a non-placeholder value of at least 32 characters");
  }

  if (errors.length > 0) {
    throw new Error(`[dev-account-seed] ${errors.join("; ")}`);
  }
}

function buildAccountRows(credentials) {
  return [
    {
      id: ACCOUNT_IDS.admin,
      loginId: credentials.adminLoginId,
      password: credentials.adminPassword,
      name: "Development Administrator",
      email: "admin@homepage-development.invalid",
      role: "admin",
      isAdmin: 1,
      userGrade: "admin0",
    },
    {
      id: ACCOUNT_IDS.member,
      loginId: credentials.memberLoginId,
      password: credentials.memberPassword,
      name: "Development Member",
      email: "member@homepage-development.invalid",
      role: "user",
      isAdmin: 0,
      userGrade: "member",
    },
  ];
}

async function upsertDevelopmentAccount(connection, account) {
  const pii = encryptedUserValues({
    name: account.name,
    email: account.email,
    phone: "",
    birthYear: null,
  });
  const passwordHash = await hashPassword(account.password);

  await connection.execute(
    `INSERT INTO users (
       id, login_id, name, email, email_hash, phone_hash, name_hash, password,
       phone, role, is_admin, user_grade, birth_year_encrypted, points,
       account_status, platform, withdrawn_at, withdrawal_purge_at, restored_at,
       marketing_agree, marketing_agreed_at, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, 0,
       'active', 'education', NULL, NULL, NULL, 0, NULL, NOW())
     ON DUPLICATE KEY UPDATE
       login_id = VALUES(login_id),
       name = VALUES(name),
       email = VALUES(email),
       email_hash = VALUES(email_hash),
       phone_hash = VALUES(phone_hash),
       name_hash = VALUES(name_hash),
       password = VALUES(password),
       role = VALUES(role),
       is_admin = VALUES(is_admin),
       user_grade = VALUES(user_grade),
       account_status = 'active',
       platform = 'education',
       withdrawn_at = NULL,
       withdrawal_purge_at = NULL,
       restored_at = NULL`,
    [
      account.id,
      account.loginId,
      pii.encryptedName,
      pii.encryptedEmail,
      pii.emailHash,
      pii.phoneHash,
      pii.nameHash,
      passwordHash,
      account.role,
      account.isAdmin,
      account.userGrade,
    ],
  );
}

async function main() {
  const credentials = {
    adminLoginId: String(process.env.DEV_ADMIN_LOGIN_ID || "").trim(),
    adminPassword: String(process.env.DEV_ADMIN_PASSWORD || ""),
    memberLoginId: String(process.env.DEV_MEMBER_LOGIN_ID || "").trim(),
    memberPassword: String(process.env.DEV_MEMBER_PASSWORD || ""),
  };
  assertSafeEnvironment(credentials);

  const accounts = buildAccountRows(credentials);
  for (const account of accounts) {
    account.emailHash = encryptedUserValues({ email: account.email }).emailHash;
  }
  const connection = await mysql.createConnection(createMysqlConnectionOptions());

  try {
    const [[databaseRow]] = await connection.query("SELECT DATABASE() AS database_name");
    if (databaseRow?.database_name !== TARGET_DATABASE) {
      throw new Error("connected database is not homepage_dev");
    }

    const [conflicts] = await connection.execute(
      `SELECT id, login_id, email_hash
       FROM users
       WHERE id IN (?, ?)
          OR login_id IN (?, ?)
          OR email_hash IN (?, ?)`,
      [
        ACCOUNT_IDS.admin,
        ACCOUNT_IDS.member,
        accounts[0].loginId,
        accounts[1].loginId,
        accounts[0].emailHash,
        accounts[1].emailHash,
      ],
    );
    const unexpectedConflict = conflicts.some((row) => accounts.some((account) => (
      (row?.login_id === account.loginId || row?.email_hash === account.emailHash) &&
      row?.id !== account.id
    )));
    if (unexpectedConflict) {
      throw new Error("a non-development user conflicts with the requested development account");
    }

    await connection.beginTransaction();
    for (const account of accounts) {
      await upsertDevelopmentAccount(connection, account);
    }
    await connection.execute(
      "DELETE FROM sessions WHERE user_id IN (?, ?)",
      [ACCOUNT_IDS.admin, ACCOUNT_IDS.member],
    );
    await connection.commit();

    const [[countRow]] = await connection.execute(
      "SELECT COUNT(*) AS account_count FROM users WHERE id IN (?, ?)",
      [ACCOUNT_IDS.admin, ACCOUNT_IDS.member],
    );
    if (Number(countRow?.account_count || 0) !== 2) {
      throw new Error("development account verification failed");
    }

    console.log(JSON.stringify({
      ok: true,
      database: TARGET_DATABASE,
      accountCount: 2,
      roles: ["admin", "member"],
    }));
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    credentials.adminPassword = "";
    credentials.memberPassword = "";
    for (const account of accounts) account.password = "";
    await connection.end();
  }
}

const directRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (directRun) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error?.message || "development account seed failed" }));
    process.exit(1);
  });
}

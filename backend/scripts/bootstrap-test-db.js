import mysql from "mysql2/promise";

import { env } from "../src/config/env.js";

const TARGET_TEST_DB = "homepage_test";
const TARGET_TEST_USER = "homepage_test_user";
const BLOCKED_WRITE_SQL = /^(UPDATE|INSERT|DELETE|DROP|TRUNCATE|REPLACE|RENAME|CALL)\b/i;

const stats = {
  allowedDdl: 0,
  allowedInfoReads: 0,
  allowedShowTables: 0,
  blockedWrites: 0,
  blockedAppReads: 0,
  blockedOther: 0,
  mutedSafetyLogs: 0,
};

function normalizeSql(sql) {
  if (typeof sql === "string") return sql.replace(/\s+/g, " ").trim();
  if (sql && typeof sql.sql === "string") return sql.sql.replace(/\s+/g, " ").trim();
  return "";
}

function noRowsResult() {
  return [[], []];
}

function noWriteResult() {
  return [{ affectedRows: 0, changedRows: 0, warningStatus: 0, insertId: 0 }, []];
}

function isAllowedInfoRead(normalized) {
  const upper = normalized.toUpperCase();
  return (
    /^SELECT\s+DATABASE\s*\(\s*\)/i.test(normalized) ||
    /^SELECT\s+1\b/i.test(normalized) ||
    upper.includes(" FROM INFORMATION_SCHEMA.") ||
    upper.includes(" FROM `INFORMATION_SCHEMA`.")
  );
}

function isAllowedDdl(normalized) {
  const upper = normalized.toUpperCase();

  if (/^CREATE\s+TABLE\b/i.test(normalized)) return true;
  if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(normalized)) return true;

  if (/^ALTER\s+TABLE\b/i.test(normalized)) {
    if (/\b(DROP|TRUNCATE|RENAME)\b/i.test(normalized)) return false;
    return /\b(ADD|MODIFY|COMMENT|CONVERT)\b/i.test(normalized);
  }

  return upper === "SET NAMES UTF8MB4";
}

function evaluateSql(sql) {
  const normalized = normalizeSql(sql);
  if (!normalized) {
    stats.blockedOther += 1;
    return { allow: false, result: noRowsResult() };
  }

  if (BLOCKED_WRITE_SQL.test(normalized)) {
    stats.blockedWrites += 1;
    return { allow: false, result: noWriteResult() };
  }

  if (/^SHOW\s+TABLES\b/i.test(normalized)) {
    stats.allowedShowTables += 1;
    return { allow: true };
  }

  if (/^SELECT\b/i.test(normalized)) {
    if (isAllowedInfoRead(normalized)) {
      stats.allowedInfoReads += 1;
      return { allow: true };
    }

    stats.blockedAppReads += 1;
    return { allow: false, result: noRowsResult() };
  }

  if (isAllowedDdl(normalized)) {
    stats.allowedDdl += 1;
    return { allow: true };
  }

  stats.blockedOther += 1;
  return { allow: false, result: noRowsResult() };
}

function assertSafeBootstrapEnv() {
  const errors = [];

  if (env.nodeEnv !== "test") errors.push("NODE_ENV is not test");
  if (env.testSafeMode !== true) errors.push("TEST_SAFE_MODE is not true");
  if (env.dbName !== TARGET_TEST_DB) errors.push("DB_NAME is not the approved test DB");
  if (env.dbUser !== TARGET_TEST_USER) errors.push("DB_USER is not the approved test DB user");
  if (env.dbInitMode !== "bootstrap") errors.push("DB_INIT_MODE is not bootstrap");
  if (env.allowStartupSchemaBootstrap !== true) errors.push("schema bootstrap flag is not enabled");
  if (env.allowStartupSchemaAlter !== true) errors.push("schema alter flag is not enabled");
  if (env.allowStartupDataRepair !== false) errors.push("startup data repair must stay disabled");
  if (env.allowDestructiveMigrations !== false) errors.push("destructive migrations must stay disabled");
  if (env.allowStartupDataPurge !== false) errors.push("startup data purge must stay disabled");
  if (env.allowStartupSchemaDrop !== false) errors.push("startup schema drop must stay disabled");
  if (env.allowStartupUserPurge !== false) errors.push("startup user purge must stay disabled");
  if (env.allowExternalEmailSend) errors.push("external email send is enabled");
  if (env.allowExternalSmsSend) errors.push("external SMS send is enabled");
  if (env.allowExternalKakaoSend) errors.push("external Kakao send is enabled");
  if (env.allowExternalPushSend) errors.push("external push send is enabled");
  if (env.allowExternalPaymentCalls) errors.push("external payment/refund calls are enabled");
  if (env.academyPublishSchedulerEnabled) errors.push("academy publish scheduler is enabled");
  if (env.notificationSchedulerEnabled) errors.push("notification scheduler is enabled");
  if (!/test|e2e|qa/i.test(String(env.uploadRootPath))) {
    errors.push("UPLOAD_ROOT does not look like a test path");
  }

  if (errors.length > 0) {
    throw new Error(`Unsafe bootstrap environment: ${errors.join("; ")}`);
  }
}

function installSqlGuard() {
  const originalCreatePool = mysql.createPool.bind(mysql);

  mysql.createPool = (...args) => {
    const pool = originalCreatePool(...args);
    const rawQuery = pool.query.bind(pool);
    const rawExecute = pool.execute.bind(pool);

    pool.query = async (sql, values) => {
      const decision = evaluateSql(sql);
      if (!decision.allow) return decision.result;
      return rawQuery(sql, values);
    };

    pool.execute = async (sql, values) => {
      const decision = evaluateSql(sql);
      if (!decision.allow) return decision.result;
      return rawExecute(sql, values);
    };

    return pool;
  };
}

async function preflightDatabase() {
  const connection = await mysql.createConnection({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    charset: "utf8mb4",
    timezone: "+09:00",
  });

  try {
    const [dbRows] = await connection.query("SELECT DATABASE() AS db");
    const [oneRows] = await connection.query("SELECT 1 AS ok");
    const [tables] = await connection.query("SHOW TABLES");
    const databaseName = String(dbRows?.[0]?.db || "");
    const selectOneOk = Number(oneRows?.[0]?.ok) === 1;
    const tableCount = Array.isArray(tables) ? tables.length : 0;

    if (databaseName !== TARGET_TEST_DB) {
      throw new Error("Connected database is not the approved test DB");
    }

    if (!selectOneOk) {
      throw new Error("SELECT 1 failed");
    }

    if (tableCount > 0) {
      throw new Error("Test DB is not empty; stop before bootstrap");
    }

    return { tableCount };
  } finally {
    await connection.end();
  }
}

function muteExpectedSafetyLogs() {
  const originalInfo = console.info;
  const originalWarn = console.warn;

  console.info = (...args) => {
    const message = args.map((arg) => String(arg)).join(" ");
    if (message.startsWith("[db:init:safety]")) {
      stats.mutedSafetyLogs += 1;
      return;
    }
    originalInfo(...args);
  };

  console.warn = (...args) => {
    const message = args.map((arg) => String(arg)).join(" ");
    if (message.startsWith("[db:init:safety]")) {
      stats.mutedSafetyLogs += 1;
      return;
    }
    originalWarn(...args);
  };

  return () => {
    console.info = originalInfo;
    console.warn = originalWarn;
  };
}

async function main() {
  assertSafeBootstrapEnv();
  installSqlGuard();
  const preflight = await preflightDatabase();
  const restoreLogs = muteExpectedSafetyLogs();

  let closeDatabase;
  try {
    const dbModule = await import("../src/shared/db/mysql.js");
    closeDatabase = dbModule.closeDatabase;

    await dbModule.ensureInitialized();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const dbRows = await dbModule.query("SELECT DATABASE() AS db");
    const oneRows = await dbModule.query("SELECT 1 AS ok");
    const tables = await dbModule.query("SHOW TABLES");

    restoreLogs();

    const databaseName = String(dbRows?.[0]?.db || "");
    const selectOneOk = Number(oneRows?.[0]?.ok) === 1;
    const tableCount = Array.isArray(tables) ? tables.length : 0;

    if (databaseName !== TARGET_TEST_DB) {
      throw new Error("Post-bootstrap database check failed");
    }

    if (!selectOneOk) {
      throw new Error("Post-bootstrap SELECT 1 failed");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          preflightTableCount: preflight.tableCount,
          postBootstrapTableCount: tableCount,
          forbiddenWriteSqlExecuted: false,
          appTableDataSelected: false,
          stats,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    restoreLogs();
    throw error;
  } finally {
    if (closeDatabase) {
      await closeDatabase();
    }
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error?.message || "Test DB bootstrap failed",
      },
      null,
      2,
    ),
  );
  process.exit(1);
});

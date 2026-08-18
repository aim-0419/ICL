// 개발 DB에 코드로 정의된 테이블과 컬럼 중 누락된 것만 추가합니다.
// 서버 시작은 DB_INIT_MODE=safe라 스키마를 절대 건드리지 않으므로, 개발 배포에서
// 이 스크립트가 그 간극을 메웁니다. 기존 행을 지우거나 바꾸는 작업은 모두 차단합니다.
import path from "node:path";

import mysql from "mysql2/promise";

process.env.NODE_ENV = "development";
process.env.APP_ENV = "development";
process.env.ENV_FILE = path.resolve(".env.development");

// 스키마 생성만 열고, 데이터를 손대는 경로는 전부 닫습니다.
// dotenv는 override:false라 여기서 지정한 값이 .env.development를 이깁니다.
process.env.DB_INIT_MODE = "bootstrap";
process.env.ALLOW_STARTUP_SCHEMA_BOOTSTRAP = "true";
// SCHEMA_ALTER를 끄면 주석·collation 재적용, PII 재암호화, mojibake 수리가 모두 건너뛰어집니다.
process.env.ALLOW_STARTUP_SCHEMA_ALTER = "false";
process.env.ALLOW_STARTUP_DATA_REPAIR = "false";
// DESTRUCTIVE_MIGRATIONS 하나로 DELETE·DROP·purge 계열이 전부 막힙니다.
process.env.ALLOW_DESTRUCTIVE_MIGRATIONS = "false";
process.env.ALLOW_STARTUP_DATA_PURGE = "false";
process.env.ALLOW_STARTUP_SCHEMA_DROP = "false";
process.env.ALLOW_STARTUP_USER_PURGE = "false";

const TARGET_DATABASE = "homepage_dev";
const TARGET_USER = "homepage_dev_user";
const SETTLE_INTERVAL_MS = 500;
const SETTLE_MAX_CHECKS = 40;

const { env } = await import("../src/config/env.js");

process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ok: false, error: `schema statement failed: ${reason?.message || reason}` }));
  process.exit(1);
});

function assertSafeEnvironment() {
  const errors = [];

  if (env.nodeEnv !== "development" || env.appEnvironment !== "development") {
    errors.push("development environment is required");
  }
  if (env.testSafeMode !== true) errors.push("TEST_SAFE_MODE must be true");
  if (env.dbName !== TARGET_DATABASE) errors.push("DB_NAME must be homepage_dev");
  if (env.dbUser !== TARGET_USER) errors.push("DB_USER must be homepage_dev_user");
  if (env.dbInitMode !== "bootstrap") errors.push("DB_INIT_MODE must be bootstrap");
  if (!env.allowStartupSchemaBootstrap) errors.push("schema bootstrap must be enabled");
  if (env.allowStartupSchemaAlter) errors.push("schema alter must stay disabled");
  if (env.allowStartupDataRepair) errors.push("startup data repair must stay disabled");
  if (env.allowDestructiveMigrations) errors.push("destructive migrations must stay disabled");
  if (env.allowStartupDataPurge || env.allowStartupSchemaDrop || env.allowStartupUserPurge) {
    errors.push("all destructive startup flags must stay disabled");
  }

  if (errors.length > 0) {
    throw new Error(`[dev-schema-apply] ${errors.join("; ")}`);
  }
}

async function readSchemaSnapshot(connection) {
  const [rows] = await connection.query(
    `SELECT table_name AS tableName, column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = ?`,
    [TARGET_DATABASE],
  );

  const snapshot = new Map();
  for (const row of rows) {
    const tableName = String(row.tableName);
    if (!snapshot.has(tableName)) snapshot.set(tableName, new Set());
    snapshot.get(tableName).add(String(row.columnName));
  }
  return snapshot;
}

function snapshotKey(snapshot) {
  return [...snapshot.entries()]
    .map(([table, columns]) => `${table}:${[...columns].sort().join(",")}`)
    .sort()
    .join("|");
}

// mysql.js의 ALTER 일부는 await 없이 발행되므로, 스냅샷이 안정될 때까지 기다립니다.
async function waitForSchemaToSettle(connection) {
  let previous = snapshotKey(await readSchemaSnapshot(connection));
  let stableChecks = 0;

  for (let attempt = 0; attempt < SETTLE_MAX_CHECKS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
    const current = snapshotKey(await readSchemaSnapshot(connection));
    if (current === previous) {
      stableChecks += 1;
      if (stableChecks >= 2) return;
    } else {
      stableChecks = 0;
      previous = current;
    }
  }
}

function diffSnapshots(before, after) {
  const addedTables = [...after.keys()].filter((table) => !before.has(table)).sort();
  const removedTables = [...before.keys()].filter((table) => !after.has(table)).sort();
  const addedColumns = [];
  const removedColumns = [];

  for (const [table, columns] of after) {
    if (!before.has(table)) continue;
    for (const column of columns) {
      if (!before.get(table).has(column)) addedColumns.push(`${table}.${column}`);
    }
  }
  for (const [table, columns] of before) {
    if (!after.has(table)) continue;
    for (const column of columns) {
      if (!after.get(table).has(column)) removedColumns.push(`${table}.${column}`);
    }
  }

  return {
    addedTables,
    removedTables,
    addedColumns: addedColumns.sort(),
    removedColumns: removedColumns.sort(),
  };
}

async function main() {
  assertSafeEnvironment();

  const connection = await mysql.createConnection({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    charset: "utf8mb4",
    timezone: "+09:00",
  });

  let before;
  try {
    const [[databaseRow]] = await connection.query("SELECT DATABASE() AS databaseName");
    if (databaseRow?.databaseName !== TARGET_DATABASE) {
      throw new Error("connected database is not homepage_dev");
    }
    before = await readSchemaSnapshot(connection);
  } catch (error) {
    await connection.end();
    throw error;
  }

  const database = await import("../src/shared/db/mysql.js");
  let after;
  try {
    await database.ensureInitialized();
    await waitForSchemaToSettle(connection);
    after = await readSchemaSnapshot(connection);
  } finally {
    await database.closeDatabase();
  }

  const changes = diffSnapshots(before, after);
  await connection.end();

  // 이 스크립트는 추가만 해야 합니다. 무언가 사라졌다면 설정이 잘못된 것이므로 실패시킵니다.
  if (changes.removedTables.length > 0 || changes.removedColumns.length > 0) {
    throw new Error(
      `[dev-schema-apply] schema objects disappeared: ${[...changes.removedTables, ...changes.removedColumns].join(", ")}`,
    );
  }

  console.log(JSON.stringify({
    ok: true,
    database: TARGET_DATABASE,
    tableCount: after.size,
    addedTables: changes.addedTables,
    addedColumns: changes.addedColumns,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || "schema apply failed" }));
  process.exit(1);
});

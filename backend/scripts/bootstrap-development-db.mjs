import mysql from "mysql2/promise";

import { env } from "../src/config/env.js";
import { createMysqlConnectionOptions } from "../src/shared/db/connection-options.js";

const TARGET_DATABASE = "homepage_dev";
const TARGET_USER = "homepage_dev_user";

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
  if (!env.allowStartupSchemaAlter) errors.push("schema alter must be enabled");
  if (env.allowStartupDataRepair) errors.push("startup data repair must stay disabled");
  if (env.allowDestructiveMigrations) errors.push("destructive migrations must stay disabled");
  if (env.allowStartupDataPurge || env.allowStartupSchemaDrop || env.allowStartupUserPurge) {
    errors.push("all destructive startup flags must stay disabled");
  }
  if (
    env.allowExternalEmailSend ||
    env.allowExternalSmsSend ||
    env.allowExternalKakaoSend ||
    env.allowExternalPushSend ||
    env.allowExternalPaymentCalls
  ) {
    errors.push("external side effects must stay disabled");
  }
  if (env.academyPublishSchedulerEnabled || env.notificationSchedulerEnabled) {
    errors.push("schedulers must stay disabled");
  }

  if (errors.length > 0) {
    throw new Error(`[dev-db-bootstrap] ${errors.join("; ")}`);
  }
}

async function assertEmptyTargetDatabase() {
  const connection = await mysql.createConnection(createMysqlConnectionOptions());

  try {
    const [[databaseRow]] = await connection.query("SELECT DATABASE() AS database_name");
    const [tables] = await connection.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");

    if (databaseRow?.database_name !== TARGET_DATABASE) {
      throw new Error("connected database is not homepage_dev");
    }
    if (tables.length > 0) {
      throw new Error("homepage_dev is not empty; bootstrap was stopped without changes");
    }
  } finally {
    await connection.end();
  }
}

async function main() {
  assertSafeEnvironment();
  await assertEmptyTargetDatabase();

  const database = await import("../src/shared/db/mysql.js");
  try {
    await database.ensureInitialized();
    const tables = await database.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    if (!Array.isArray(tables) || tables.length === 0) {
      throw new Error("schema bootstrap did not create any tables");
    }
    console.log(JSON.stringify({ ok: true, database: TARGET_DATABASE, tableCount: tables.length }));
  } finally {
    await database.closeDatabase();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || "bootstrap failed" }));
  process.exit(1);
});

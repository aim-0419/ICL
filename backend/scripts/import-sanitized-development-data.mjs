import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import mysql from "mysql2/promise";

import { assertRuntimeEnvironment, env } from "../src/config/env.js";
import { createMysqlConnectionOptions } from "../src/shared/db/connection-options.js";
import { assertSanitizedDataset, EMPTY_IN_DEVELOPMENT_TABLES } from "./development-data-sanitizer.mjs";

const TARGET_DATABASE = "homepage_dev";
const TARGET_USER = "homepage_dev_user";
const PRESERVED_ACCOUNT_IDS = ["development_admin", "development_member"];
const inputPath = path.resolve(String(process.env.SANITIZED_IMPORT_PATH || "").trim());

function assertSafeImportEnvironment() {
  assertRuntimeEnvironment();
  const errors = [];
  if (process.env.ALLOW_DEV_SANITIZED_IMPORT !== "true") errors.push("explicit import approval is required");
  if (env.nodeEnv !== "development" || env.appEnvironment !== "development") errors.push("development environment is required");
  if (env.testSafeMode !== true) errors.push("TEST_SAFE_MODE must be true");
  if (env.dbName !== TARGET_DATABASE) errors.push("DB_NAME must be homepage_dev");
  if (env.dbUser !== TARGET_USER) errors.push("DB_USER must be homepage_dev_user");
  if (env.dbInitMode !== "safe") errors.push("DB_INIT_MODE must be safe");
  if (
    env.allowStartupSchemaBootstrap || env.allowStartupSchemaAlter || env.allowStartupDataRepair ||
    env.allowDestructiveMigrations || env.allowStartupDataPurge || env.allowStartupSchemaDrop ||
    env.allowStartupUserPurge
  ) errors.push("startup database mutation flags must be disabled");
  if (
    env.allowExternalEmailSend || env.allowExternalSmsSend || env.allowExternalKakaoSend ||
    env.allowExternalPushSend || env.allowExternalPaymentCalls
  ) errors.push("external side effects must be disabled");
  if (env.academyPublishSchedulerEnabled || env.notificationSchedulerEnabled) errors.push("schedulers must be disabled");
  if (!inputPath || !fs.existsSync(inputPath)) errors.push("sanitized import file does not exist");
  if (errors.length) throw new Error(`[dev-sanitized-import] ${errors.join("; ")}`);
}

function placeholders(rowCount, columnCount) {
  const row = `(${Array(columnCount).fill("?").join(",")})`;
  return Array(rowCount).fill(row).join(",");
}

async function insertRows(connection, table, columns, rows) {
  if (!rows.length || !columns.length) return;
  const quotedColumns = columns.map((column) => `\`${column}\``).join(",");
  const batchSize = 100;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = batch.flatMap((row) => columns.map((column) => row[column] ?? null));
    await connection.query(
      `INSERT INTO \`${table}\` (${quotedColumns}) VALUES ${placeholders(batch.length, columns.length)}`,
      values,
    );
  }
}

assertSafeImportEnvironment();
const compressed = fs.readFileSync(inputPath);
const expectedDigest = String(process.env.SANITIZED_IMPORT_SHA256 || "").trim().toLowerCase();
const actualDigest = createHash("sha256").update(compressed).digest("hex");
if (!expectedDigest || expectedDigest !== actualDigest) throw new Error("sanitized import checksum mismatch");

const dataset = JSON.parse(gunzipSync(compressed).toString("utf8"));
assertSanitizedDataset(dataset);
const connection = await mysql.createConnection(createMysqlConnectionOptions());

try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS database_name");
  if (databaseRow?.database_name !== TARGET_DATABASE) throw new Error("connected database is not homepage_dev");

  const [targetColumnRows] = await connection.execute(
    `SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [TARGET_DATABASE],
  );
  const targetColumns = new Map();
  for (const row of targetColumnRows) {
    if (!targetColumns.has(row.TABLE_NAME)) targetColumns.set(row.TABLE_NAME, []);
    targetColumns.get(row.TABLE_NAME).push(row);
  }

  const datasetTables = new Map(dataset.tables.map((item) => [item.table, item]));
  for (const table of datasetTables.keys()) {
    if (!targetColumns.has(table)) throw new Error(`sanitized dataset contains unknown target table: ${table}`);
  }

  const [preservedAccounts] = await connection.execute(
    "SELECT * FROM users WHERE id IN (?, ?)",
    PRESERVED_ACCOUNT_IDS,
  );

  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  await connection.beginTransaction();
  try {
    for (const table of targetColumns.keys()) {
      if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error("unsafe target table name");
      await connection.query(`DELETE FROM \`${table}\``);
    }

    let importedRowCount = 0;
    for (const [table, targetDefinitions] of targetColumns.entries()) {
      const item = datasetTables.get(table);
      if (!item) continue;
      const sourceColumns = new Set(item.columns);
      const columns = targetDefinitions
        .map((definition) => definition.COLUMN_NAME)
        .filter((column) => sourceColumns.has(column));

      const missingRequired = targetDefinitions.filter((definition) => (
        !sourceColumns.has(definition.COLUMN_NAME) &&
        definition.IS_NULLABLE === "NO" &&
        definition.COLUMN_DEFAULT === null &&
        !String(definition.EXTRA || "").includes("auto_increment")
      ));
      if (item.rows.length && missingRequired.length) {
        throw new Error(`target table ${table} has required columns absent from the sanitized dataset`);
      }

      await insertRows(connection, table, columns, item.rows);
      importedRowCount += item.rows.length;
    }

    if (preservedAccounts.length) {
      const userColumns = targetColumns.get("users").map((definition) => definition.COLUMN_NAME);
      await insertRows(connection, "users", userColumns, preservedAccounts);
    }

    for (const table of EMPTY_IN_DEVELOPMENT_TABLES) {
      if (!targetColumns.has(table)) continue;
      const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      if (Number(row.count || 0) !== 0) throw new Error(`sensitive table ${table} is not empty`);
    }

    await connection.commit();
    console.log(JSON.stringify({
      ok: true,
      database: TARGET_DATABASE,
      importedTableCount: dataset.tables.length,
      importedRowCount,
      preservedDevelopmentAccounts: preservedAccounts.length,
      sensitiveTablesEmpty: true,
      sha256: actualDigest,
    }));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
} finally {
  await connection.end();
}

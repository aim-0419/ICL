import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import "dotenv/config";
import mysql from "mysql2/promise";

import { hashPassword } from "../src/shared/security/password.js";
import {
  assertSanitizedDataset,
  createSanitizationContext,
  DEVELOPMENT_DATASET_VERSION,
  EXCLUDED_SOURCE_TABLES,
  sanitizeTableRows,
} from "./development-data-sanitizer.mjs";

const sourceHost = String(process.env.DB_HOST || "").trim();
const sourceDatabase = String(process.env.DB_NAME || "").trim();
const outputPath = path.resolve(String(process.env.SANITIZED_EXPORT_PATH || "").trim());
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

if (process.env.ALLOW_LOCAL_SANITIZED_EXPORT !== "true") {
  throw new Error("ALLOW_LOCAL_SANITIZED_EXPORT=true is required");
}
if (!["127.0.0.1", "localhost", "::1"].includes(sourceHost)) {
  throw new Error("sanitized export only accepts a localhost source database");
}
if (!sourceDatabase || ["homepage_dev", "homepage_test"].includes(sourceDatabase)) {
  throw new Error("the source database must be the existing non-target local database");
}
if (!outputPath || outputPath === path.parse(outputPath).root) throw new Error("SANITIZED_EXPORT_PATH is required");
if (outputPath.startsWith(`${repositoryRoot}${path.sep}`)) {
  throw new Error("sanitized exports must be written outside the repository");
}
if (fs.existsSync(outputPath)) throw new Error("sanitized export path already exists");

const connection = await mysql.createConnection({
  host: sourceHost,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: sourceDatabase,
  charset: "utf8mb4",
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
});

const context = createSanitizationContext();
context.disabledPasswordHash = await hashPassword(randomBytes(64).toString("hex"));

try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS database_name");
  if (databaseRow?.database_name !== sourceDatabase) throw new Error("source database mismatch");

  await connection.query("SET TRANSACTION READ ONLY");
  await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");

  const [tableRows] = await connection.execute(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME`,
    [sourceDatabase],
  );

  const tables = [];
  const sourceCounts = {};
  for (const { TABLE_NAME: table } of tableRows) {
    if (EXCLUDED_SOURCE_TABLES.has(table)) continue;
    if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error("unsafe source table name");

    const [columnRows] = await connection.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [sourceDatabase, table],
    );
    const columns = columnRows.map((row) => row.COLUMN_NAME);
    const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
    sourceCounts[table] = rows.length;
    tables.push({ table, columns, rows: sanitizeTableRows(table, rows, context) });
  }

  const dataset = {
    version: DEVELOPMENT_DATASET_VERSION,
    kind: "icl-development-sanitized-data",
    createdAt: new Date().toISOString(),
    tables,
  };
  assertSanitizedDataset(dataset);

  const payload = Buffer.from(JSON.stringify(dataset), "utf8");
  const compressed = gzipSync(payload, { level: 9 });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, compressed, { flag: "wx", mode: 0o600 });

  await connection.commit();
  const digest = createHash("sha256").update(compressed).digest("hex");
  console.log(JSON.stringify({
    ok: true,
    sourceTableCount: tableRows.length,
    exportedTableCount: tables.length,
    exportedRowCount: tables.reduce((sum, item) => sum + item.rows.length, 0),
    clearedRowCount: Object.entries(sourceCounts).reduce(
      (sum, [table, count]) => sum + (tables.find((item) => item.table === table)?.rows.length === 0 ? count : 0),
      0,
    ),
    sha256: digest,
    fileName: path.basename(outputPath),
    piiOutput: false,
  }));
} catch (error) {
  await connection.rollback().catch(() => {});
  throw error;
} finally {
  context.secret.fill(0);
  context.disabledPasswordHash = "";
  await connection.end();
}

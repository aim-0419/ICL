// 파일 역할: snapshot-development-db.mjs 가 만든 파일로 개발 DB를 되돌립니다.
//
// 이 스크립트는 개발 DB의 모든 행을 지우고 스냅샷 내용으로 바꿉니다.
// 되돌리는 순간 다른 컴퓨터와 개발 서버가 보는 데이터도 함께 바뀝니다.
// 그래서 환경 검사 외에 ALLOW_DEV_SNAPSHOT_RESTORE=true 를 따로 요구합니다.
// db:import:dev:sanitized 가 같은 이유로 명시적 승인을 요구하는 것과 같은 방식입니다.
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import mysql from "mysql2/promise";

import {
  assertSnapshotShape,
  buildSchemaFingerprint,
  describeSchemaGap,
  deserializeSnapshotValue,
  snapshotSchemaOf,
} from "./development-snapshot-format.mjs";

// env.js를 불러오기 전에 개발 환경으로 고정합니다.
// 호출한 셸의 NODE_ENV가 무엇이든 항상 .env.development 만 읽게 하기 위해서입니다.
process.env.NODE_ENV = "development";
process.env.APP_ENV = "development";
process.env.ENV_FILE = path.resolve(".env.development");

const { assertRuntimeEnvironment, env } = await import("../src/config/env.js");
const { createMysqlConnectionOptions } = await import("../src/shared/db/connection-options.js");

const TARGET_DATABASE = "homepage_dev";
const TARGET_USER = "homepage_dev_user";
const INSERT_BATCH_SIZE = 500;

const inputPath = path.resolve(String(process.env.DEV_SNAPSHOT_PATH || "").trim());

function assertSafeEnvironment() {
  assertRuntimeEnvironment();
  const errors = [];

  if (process.env.ALLOW_DEV_SNAPSHOT_RESTORE !== "true") errors.push("explicit restore approval is required");
  if (env.nodeEnv !== "development" || env.appEnvironment !== "development") {
    errors.push("development environment is required");
  }
  if (env.testSafeMode !== true) errors.push("TEST_SAFE_MODE must be true");
  if (env.dbName !== TARGET_DATABASE) errors.push("DB_NAME must be homepage_dev");
  if (env.dbUser !== TARGET_USER) errors.push("DB_USER must be homepage_dev_user");
  if (env.dbInitMode !== "safe") errors.push("DB_INIT_MODE must be safe");
  if (!process.env.DEV_SNAPSHOT_PATH || !fs.existsSync(inputPath)) errors.push("DEV_SNAPSHOT_PATH does not exist");

  if (errors.length > 0) throw new Error(`[dev-restore] ${errors.join("; ")}`);
}

// 함수 역할: 행을 나눠 담아 넣습니다.
// 한 번에 전부 보내면 큰 테이블에서 max_allowed_packet 을 넘길 수 있습니다.
async function insertRows(connection, table, columns, rows) {
  if (!rows.length) return;

  const columnList = columns.map((column) => `\`${column}\``).join(", ");
  const placeholders = `(${columns.map(() => "?").join(", ")})`;

  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
    const values = batch.flatMap((row) => row.map((value) => deserializeSnapshotValue(value)));
    await connection.query(
      `INSERT INTO \`${table}\` (${columnList}) VALUES ${batch.map(() => placeholders).join(", ")}`,
      values,
    );
  }
}

async function readCurrentSchema(connection) {
  const [rows] = await connection.execute(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?`,
    [TARGET_DATABASE],
  );

  const schema = new Map();
  for (const row of rows) {
    if (!schema.has(row.tableName)) schema.set(row.tableName, new Set());
    schema.get(row.tableName).add(row.columnName);
  }
  return schema;
}

async function main() {
  assertSafeEnvironment();

  const snapshot = JSON.parse(gunzipSync(fs.readFileSync(inputPath)).toString("utf8"));
  assertSnapshotShape(snapshot);

  const connection = await mysql.createConnection({
    ...createMysqlConnectionOptions(),
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  try {
    const [[databaseRow]] = await connection.query("SELECT DATABASE() AS databaseName");
    if (databaseRow?.databaseName !== TARGET_DATABASE) {
      throw new Error("connected database is not homepage_dev");
    }

    const currentSchema = await readCurrentSchema(connection);
    const gap = describeSchemaGap(snapshotSchemaOf(snapshot), currentSchema);

    // 스냅샷에 있는 테이블이나 컬럼이 지금 DB에 없으면 넣을 자리가 없습니다.
    // 그대로 진행하면 그 데이터가 조용히 사라지므로 손대기 전에 멈춥니다.
    if (!gap.restorable) {
      throw new Error(
        `snapshot does not fit the current schema: ${[...gap.missingTables, ...gap.missingColumns].join(", ")}`,
      );
    }

    const snapshotTables = new Map(snapshot.tables.map((table) => [table.name, table]));
    let restoredRowCount = 0;

    // 외래 키 검사를 끄고 트랜잭션으로 감쌉니다.
    // 삭제·삽입 순서를 신경 쓰지 않아도 되고, 중간에 실패하면 통째로 되돌아갑니다.
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    await connection.beginTransaction();
    try {
      // 스냅샷 이후에 생긴 테이블도 비웁니다. 스냅샷 시점 상태로 되돌리는 것이 목적이기 때문입니다.
      for (const table of currentSchema.keys()) {
        if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error("unsafe target table name");
        await connection.query(`DELETE FROM \`${table}\``);
      }

      for (const [table] of currentSchema.entries()) {
        const item = snapshotTables.get(table);
        if (!item) continue;
        await insertRows(connection, table, item.columns, item.rows);
        restoredRowCount += item.rows.length;
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    }

    console.log(JSON.stringify({
      ok: true,
      path: inputPath,
      snapshotCreatedAt: snapshot.createdAt,
      tableCount: snapshotTables.size,
      rowCount: restoredRowCount,
      // 스냅샷 이후 추가된 스키마는 막지 않되, 기본값으로 채워졌다는 사실은 알립니다.
      schemaAddedSinceSnapshot: { tables: gap.addedTables, columns: gap.addedColumns },
      schemaFingerprintMatches: snapshot.schemaFingerprint === buildSchemaFingerprint(currentSchema),
    }));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || "restore failed" }));
  process.exit(1);
});

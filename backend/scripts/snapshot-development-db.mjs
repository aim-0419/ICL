// 파일 역할: 공유 개발 DB `homepage_dev`의 현재 상태를 파일 하나로 저장합니다.
//
// 배경: 개발 DB를 두 대의 컴퓨터와 개발 서버가 함께 씁니다. 기능을 만들다 보면
// 테스트 데이터가 뒤엉키는데, 지금까지는 되돌릴 방법이 없었습니다.
// db:export:dev:sanitized 는 소스로 homepage_dev 를 거부하고,
// db-backup.sh 는 로컬 Docker 컨테이너 전용이라 AWS RDS에는 쓸 수 없습니다.
//
// 이 스크립트는 읽기만 합니다. 되돌리는 것은 restore-development-db.mjs 입니다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import mysql from "mysql2/promise";

import {
  DEVELOPMENT_SNAPSHOT_VERSION,
  buildSchemaFingerprint,
  serializeSnapshotValue,
  snapshotTypeCast,
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

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(backendRoot, "..");

// 함수 역할: 스냅샷을 저장할 경로를 정합니다.
//
// 기본값을 저장소 바깥의 형제 폴더로 둡니다. 스냅샷에는 개발용이라도 실제 회원 행이
// 들어 있어서, 저장소 안에 두면 언젠가 커밋될 위험이 있습니다.
// 파일명에 시각을 넣어 기존 스냅샷을 덮어쓰지 않게 합니다.
function resolveOutputPath() {
  const configured = String(process.env.DEV_SNAPSHOT_PATH || "").trim();
  if (configured) return path.resolve(configured);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(path.resolve(repositoryRoot, ".."), "icl-dev-snapshots", `homepage_dev_${stamp}.json.gz`);
}

function assertSafeEnvironment(outputPath) {
  assertRuntimeEnvironment();
  const errors = [];

  if (env.nodeEnv !== "development" || env.appEnvironment !== "development") {
    errors.push("development environment is required");
  }
  if (env.testSafeMode !== true) errors.push("TEST_SAFE_MODE must be true");
  if (env.dbName !== TARGET_DATABASE) errors.push("DB_NAME must be homepage_dev");
  if (env.dbUser !== TARGET_USER) errors.push("DB_USER must be homepage_dev_user");
  if (env.dbInitMode !== "safe") errors.push("DB_INIT_MODE must be safe");
  if (outputPath.startsWith(`${repositoryRoot}${path.sep}`)) {
    errors.push("snapshots must be written outside the repository");
  }
  if (fs.existsSync(outputPath)) errors.push("snapshot path already exists");

  if (errors.length > 0) throw new Error(`[dev-snapshot] ${errors.join("; ")}`);
}

async function main() {
  const outputPath = resolveOutputPath();
  assertSafeEnvironment(outputPath);

  const connection = await mysql.createConnection({
    ...createMysqlConnectionOptions(),
    // 날짜와 BIGINT를 문자열로 받습니다. 시간대 재해석이나 정밀도 손실 없이
    // 저장한 값을 그대로 되돌리기 위해서입니다.
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    typeCast: snapshotTypeCast,
  });

  try {
    const [[databaseRow]] = await connection.query("SELECT DATABASE() AS databaseName");
    if (databaseRow?.databaseName !== TARGET_DATABASE) {
      throw new Error("connected database is not homepage_dev");
    }

    // 개발 서버나 다른 컴퓨터가 동시에 쓰고 있어도 일관된 한 시점을 담기 위해
    // 읽기 전용 스냅샷 트랜잭션 안에서 모든 테이블을 읽습니다.
    await connection.query("SET TRANSACTION READ ONLY");
    await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");

    const [tableRows] = await connection.execute(
      `SELECT TABLE_NAME AS tableName
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [TARGET_DATABASE],
    );

    const tables = [];
    const schema = new Map();
    let totalRowCount = 0;

    for (const { tableName } of tableRows) {
      if (!/^[A-Za-z0-9_]+$/.test(tableName)) throw new Error("unsafe table name");

      const [columnRows] = await connection.execute(
        `SELECT COLUMN_NAME AS columnName
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [TARGET_DATABASE, tableName],
      );
      const columns = columnRows.map((row) => row.columnName);

      const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
      const serialized = rows.map((row) => columns.map((column) => serializeSnapshotValue(row[column])));

      tables.push({ name: tableName, columns, rows: serialized });
      schema.set(tableName, new Set(columns));
      totalRowCount += serialized.length;
    }

    await connection.commit();

    const snapshot = {
      version: DEVELOPMENT_SNAPSHOT_VERSION,
      database: TARGET_DATABASE,
      createdAt: new Date().toISOString(),
      schemaFingerprint: buildSchemaFingerprint(schema),
      tables,
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, gzipSync(Buffer.from(JSON.stringify(snapshot), "utf8")));

    console.log(JSON.stringify({
      ok: true,
      path: outputPath,
      tableCount: tables.length,
      rowCount: totalRowCount,
      schemaFingerprint: snapshot.schemaFingerprint,
      bytes: fs.statSync(outputPath).size,
    }));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || "snapshot failed" }));
  process.exit(1);
});

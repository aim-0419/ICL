import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import dotenv from "dotenv";
import mysql from "mysql2/promise";

const BACKEND_ROOT = process.cwd();
const SOURCE_ENV_PATH = path.resolve(BACKEND_ROOT, ".env");
const DEV_ENV_PATH = path.resolve(BACKEND_ROOT, ".env.development");
const TARGET_DATABASE = "homepage_dev";
const TARGET_USER = "homepage_dev_user";
const SOURCE_DATABASE = "icl_pilates";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

async function readSourceEnvironment() {
  const source = await fs.readFile(SOURCE_ENV_PATH, "utf8");
  const parsed = dotenv.parse(source);
  const host = String(parsed.DB_HOST || "").trim();
  const database = String(parsed.DB_NAME || "").trim();

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error("Refusing to provision: source DB host is not local loopback");
  }
  if (database !== SOURCE_DATABASE) {
    throw new Error("Refusing to provision: source DB name is not the approved local source");
  }

  return {
    host,
    port: Number(parsed.DB_PORT || 3306),
    user: parsed.DB_USER,
    password: parsed.DB_PASSWORD,
  };
}

async function cloneSchema(admin, connectionOptions) {
  const [sourceTables] = await admin.query(
    `SHOW FULL TABLES FROM ${quoteIdentifier(SOURCE_DATABASE)} WHERE Table_type = 'BASE TABLE'`,
  );
  const tableNames = sourceTables.map((row) => String(Object.values(row)[0] || "")).filter(Boolean);

  const target = await mysql.createConnection({
    ...connectionOptions,
    database: TARGET_DATABASE,
    charset: "utf8mb4",
    timezone: "+09:00",
  });

  try {
    await target.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const tableName of tableNames) {
      const [rows] = await admin.query(
        `SHOW CREATE TABLE ${quoteIdentifier(SOURCE_DATABASE)}.${quoteIdentifier(tableName)}`,
      );
      const createSql = String(rows?.[0]?.["Create Table"] || "")
        .replace(/AUTO_INCREMENT=\d+\s*/i, "AUTO_INCREMENT=1 ");
      if (!createSql) throw new Error(`Could not read schema for ${tableName}`);
      await target.query(createSql);
    }
    await target.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    await target.end();
  }

  return tableNames.length;
}

async function createRestrictedDevUser(admin, password) {
  const escapedPassword = admin.escape(password);
  for (const host of ["localhost", "127.0.0.1"]) {
    const account = `'${TARGET_USER}'@'${host}'`;
    await admin.query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${escapedPassword}`);
    await admin.query(`ALTER USER ${account} IDENTIFIED BY ${escapedPassword}`);
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${quoteIdentifier(TARGET_DATABASE)}.* TO ${account}`,
    );
  }
}

async function writeDevelopmentEnvironment(dbPassword) {
  const piiKey = randomBytes(32).toString("hex");
  const playbackSecret = randomBytes(32).toString("hex");
  const contents = `# Local development only. Never commit this file.\nNODE_ENV=development\nAPP_ENV=development\nTEST_SAFE_MODE=true\nPORT=4001\nCORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174\nMOBILE_APP_ORIGINS=https://localhost,capacitor://localhost\nSITE_URL=http://localhost:5173\nUPLOAD_ROOT=uploads-dev\n\nDB_INIT_MODE=safe\nALLOW_DESTRUCTIVE_MIGRATIONS=false\nALLOW_STARTUP_DATA_PURGE=false\nALLOW_STARTUP_SCHEMA_DROP=false\nALLOW_STARTUP_USER_PURGE=false\nALLOW_STARTUP_SCHEMA_BOOTSTRAP=false\nALLOW_STARTUP_SCHEMA_ALTER=false\nALLOW_STARTUP_DATA_REPAIR=false\nALLOW_E2E_DATA_MUTATION=false\n\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_NAME=${TARGET_DATABASE}\nDB_USER=${TARGET_USER}\nDB_PASSWORD=${dbPassword}\n\nPII_ENCRYPTION_KEY=${piiKey}\nPII_ENCRYPTION_LEGACY_KEYS=\nACADEMY_PLAYBACK_TOKEN_SECRET=${playbackSecret}\nACADEMY_PLAYBACK_TOKEN_TTL_SEC=21600\n\nALLOW_EXTERNAL_EMAIL_SEND=false\nALLOW_EXTERNAL_SMS_SEND=false\nALLOW_EXTERNAL_KAKAO_SEND=false\nALLOW_EXTERNAL_PUSH_SEND=false\nALLOW_EXTERNAL_PAYMENT_CALLS=false\nACADEMY_PUBLISH_SCHEDULER_ENABLED=false\nNOTIFICATION_SCHEDULER_ENABLED=false\nDEBUG_VERIFICATION_CODES=false\n\nSMTP_HOST=\nSMTP_PORT=587\nSMTP_USER=\nSMTP_PASS=\nSMTP_FROM=ICL Development <noreply@localhost>\nALIGO_API_KEY=\nALIGO_USER_ID=\nALIGO_SENDER=\nKAKAO_SENDER_KEY=\nKAKAO_DEFAULT_TEMPLATE=\nFCM_PROJECT_ID=\nFCM_CLIENT_EMAIL=\nFCM_PRIVATE_KEY=\nPORTONE_API_BASE_URL=https://api.portone.io\nPORTONE_API_SECRET=\nPORTONE_WEBHOOK_SECRET=\nPORTONE_WEBHOOK_SECRETS=\n`;

  await fs.writeFile(DEV_ENV_PATH, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await fs.mkdir(path.resolve(BACKEND_ROOT, "uploads-dev"), { recursive: true });
}

async function main() {
  try {
    await fs.access(DEV_ENV_PATH);
    throw new Error(".env.development already exists; refusing to rotate its DB credentials");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const connectionOptions = await readSourceEnvironment();
  const admin = await mysql.createConnection(connectionOptions);
  const devPassword = randomBytes(24).toString("hex");

  try {
    const [existing] = await admin.query(
      "SELECT COUNT(*) AS count FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [TARGET_DATABASE],
    );
    const targetExists = Number(existing?.[0]?.count || 0) > 0;
    let tableCount = 0;

    if (targetExists) {
      const [sourceCountRows] = await admin.query(
        "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
        [SOURCE_DATABASE],
      );
      const [targetCountRows] = await admin.query(
        "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
        [TARGET_DATABASE],
      );
      const sourceCount = Number(sourceCountRows?.[0]?.count || 0);
      tableCount = Number(targetCountRows?.[0]?.count || 0);

      if (tableCount !== sourceCount || tableCount === 0) {
        throw new Error(
          "homepage_dev already exists but its schema is incomplete; refusing automatic repair",
        );
      }
    } else {
      await admin.query(
        `CREATE DATABASE ${quoteIdentifier(TARGET_DATABASE)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      tableCount = await cloneSchema(admin, connectionOptions);
    }

    await createRestrictedDevUser(admin, devPassword);
    await writeDevelopmentEnvironment(devPassword);

    console.log(`[dev-db] provisioned an isolated local development DB with ${tableCount} schema tables`);
    console.log("[dev-db] no source rows were copied and no credential values were printed");
  } finally {
    await admin.end();
  }
}

await main();

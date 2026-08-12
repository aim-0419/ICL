import path from "node:path";

import mysql from "mysql2/promise";

process.env.NODE_ENV = "development";
process.env.APP_ENV = "development";
process.env.ENV_FILE = path.resolve(".env.development");

const { assertRuntimeEnvironment, env } = await import("../src/config/env.js");
const { createMysqlConnectionOptions } = await import("../src/shared/db/connection-options.js");
assertRuntimeEnvironment();

const connection = await mysql.createConnection(createMysqlConnectionOptions());

try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS database_name");
  const [tables] = await connection.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const [[userCountRow]] = await connection.query("SELECT COUNT(*) AS count FROM users");
  const [grantRows] = await connection.query("SHOW GRANTS FOR CURRENT_USER()");
  const grants = grantRows.flatMap((row) => Object.values(row).map(String));
  const productionGrantFound = grants.some((grant) => /`?icl_pilates`?\./i.test(grant));
  const globalDataGrantFound = grants.some(
    (grant) => /^GRANT\s+(?!USAGE\b).+\s+ON\s+\*\.\*/i.test(grant),
  );

  let productionDatabaseAccessDenied = false;
  try {
    await connection.query("SELECT 1 FROM icl_pilates.users LIMIT 1");
  } catch (error) {
    productionDatabaseAccessDenied = [
      "ER_BAD_DB_ERROR",
      "ER_DBACCESS_DENIED_ERROR",
      "ER_TABLEACCESS_DENIED_ERROR",
      "ER_ACCESS_DENIED_ERROR",
    ].includes(error?.code);
  }

  const result = {
    developmentDatabase: databaseRow?.database_name === "homepage_dev",
    schemaTableCount: tables.length,
    developmentUserRows: Number(userCountRow?.count || 0),
    productionGrantFound,
    globalDataGrantFound,
    productionDatabaseAccessDenied,
  };

  if (
    !result.developmentDatabase ||
    result.schemaTableCount === 0 ||
    result.productionGrantFound ||
    result.globalDataGrantFound ||
    !result.productionDatabaseAccessDenied
  ) {
    throw new Error("[dev-db-check] development database isolation validation failed");
  }

  console.log(JSON.stringify(result));
} finally {
  await connection.end();
}

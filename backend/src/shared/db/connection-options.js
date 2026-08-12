import fs from "node:fs";

import { env } from "../../config/env.js";

export function createMysqlConnectionOptions(overrides = {}) {
  const ssl = env.dbSslMode === "verify_identity"
    ? {
        ca: fs.readFileSync(env.dbSslCaPath, "utf8"),
        rejectUnauthorized: true,
      }
    : undefined;

  return {
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    charset: "utf8mb4",
    timezone: "+09:00",
    ...(ssl ? { ssl } : {}),
    ...overrides,
  };
}

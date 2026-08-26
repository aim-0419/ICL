/**
 * [데이터베이스 접속 정보 만들기]
 *
 * 설정값을 모아 데이터베이스에 접속할 때 쓸 정보를 만들어 줍니다.
 * 접속 시간 제한이나 동시 접속 수 같은 조건도 함께 정합니다.
 */
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

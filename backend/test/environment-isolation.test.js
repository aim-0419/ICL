import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const existingCaFixture = fileURLToPath(import.meta.url);

function runEnvironmentCheck(overrides = {}, { inspectSsl = false } = {}) {
  const script = inspectSsl
    ? `
        const { assertRuntimeEnvironment } = await import("./src/config/env.js");
        const { createMysqlConnectionOptions } = await import("./src/shared/db/connection-options.js");
        assertRuntimeEnvironment();
        const options = createMysqlConnectionOptions();
        if (!options.ssl?.rejectUnauthorized || typeof options.ssl.ca !== "string") process.exit(2);
      `
    : `
        const { assertRuntimeEnvironment } = await import("./src/config/env.js");
        assertRuntimeEnvironment();
      `;

  return spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: backendRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "development",
      APP_ENV: "development",
      TEST_SAFE_MODE: "true",
      DB_INIT_MODE: "safe",
      DB_HOST: "127.0.0.1",
      DB_NAME: "homepage_dev",
      DB_USER: "homepage_dev_user",
      DB_PASSWORD: "test-only-placeholder",
      DB_SSL_MODE: "disabled",
      DB_SSL_CA: "",
      UPLOAD_ROOT: "uploads-dev",
      ALLOW_E2E_DATA_MUTATION: "false",
      ...overrides,
    },
  });
}

test("development runtime accepts only the dedicated local database pairing", () => {
  assert.equal(runEnvironmentCheck().status, 0);
  assert.notEqual(runEnvironmentCheck({ DB_NAME: "icl_pilates" }).status, 0);
});

test("AWS RDS development connections require certificate verification", () => {
  const host = "development.example.us-east-2.rds.amazonaws.com";
  assert.notEqual(runEnvironmentCheck({ DB_HOST: host }).status, 0);

  const verified = runEnvironmentCheck({
    DB_HOST: host,
    DB_SSL_MODE: "verify_identity",
    DB_SSL_CA: existingCaFixture,
  }, { inspectSsl: true });
  assert.equal(verified.status, 0);
});

test("studio staff bootstrap defines user_id before its index", () => {
  const mysqlSource = fs.readFileSync(
    path.join(backendRoot, "src", "shared", "db", "mysql.js"),
    "utf8",
  );
  const tableDefinition = mysqlSource.match(
    /CREATE TABLE IF NOT EXISTS studio_staff_profiles \(([\s\S]*?)\n\s*\) COMMENT=/,
  )?.[1];

  assert.ok(tableDefinition, "studio_staff_profiles definition was not found");
  const columnPosition = tableDefinition.indexOf("user_id VARCHAR(64) NULL");
  const indexPosition = tableDefinition.indexOf("INDEX idx_studio_staff_profiles_user_id (user_id)");

  assert.notEqual(columnPosition, -1);
  assert.notEqual(indexPosition, -1);
  assert.ok(columnPosition < indexPosition);
});

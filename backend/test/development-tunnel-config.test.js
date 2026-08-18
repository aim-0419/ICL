import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDevelopmentSshArgs,
  resolveDevelopmentTunnelConfig,
} from "../scripts/development-tunnel-config.mjs";

const validEnvironment = {
  ICL_DEV_ENVIRONMENT: "development",
  ICL_DEV_DATABASE_NAME: "homepage_dev",
  ICL_DEV_SSH_HOST: "dev.example.com",
  ICL_DEV_SSH_USER: "ubuntu",
  ICL_DEV_SSH_KEY_PATH: "./development-key.pem",
  ICL_DEV_API_LOCAL_PORT: "4001",
  ICL_DEV_API_REMOTE_HOST: "127.0.0.1",
  ICL_DEV_API_REMOTE_PORT: "4001",
  ICL_DEV_DB_LOCAL_PORT: "13306",
  ICL_DEV_DB_REMOTE_HOST: "icl-dev-db.example.rds.amazonaws.com",
  ICL_DEV_DB_REMOTE_PORT: "3306",
};

test("development API tunnel forwards only the approved backend port", () => {
  const config = resolveDevelopmentTunnelConfig(validEnvironment, "api");
  const args = buildDevelopmentSshArgs(config);

  assert.ok(args.includes("127.0.0.1:4001:127.0.0.1:4001"));
  assert.equal(args.at(-1), "ubuntu@dev.example.com");
});

test("development DB tunnel maps the fixed local port to the development RDS", () => {
  const config = resolveDevelopmentTunnelConfig(validEnvironment, "db");
  const args = buildDevelopmentSshArgs(config);

  assert.ok(args.includes("127.0.0.1:13306:icl-dev-db.example.rds.amazonaws.com:3306"));
});

test("development tunnel rejects a non-development database name", () => {
  assert.throws(
    () => resolveDevelopmentTunnelConfig({
      ...validEnvironment,
      ICL_DEV_DATABASE_NAME: "icl_pilates",
    }, "db"),
    /database must be homepage_dev/,
  );
});

test("development tunnel rejects a non-development RDS endpoint", () => {
  assert.throws(
    () => resolveDevelopmentTunnelConfig({
      ...validEnvironment,
      ICL_DEV_DB_REMOTE_HOST: "production.example.rds.amazonaws.com",
    }, "db"),
    /development DB host/,
  );
});

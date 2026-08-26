import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDevelopmentSessionArgs,
  buildDevelopmentSessionParameters,
  resolveDevelopmentTunnelConfig,
} from "../scripts/development-tunnel-config.mjs";

const validEnvironment = {
  ICL_DEV_ENVIRONMENT: "development",
  ICL_DEV_DATABASE_NAME: "homepage_dev",
  ICL_DEV_AWS_REGION: "us-east-2",
  ICL_DEV_INSTANCE_ID: "i-01be6da5f9ee0ae50",
  ICL_DEV_API_LOCAL_PORT: "4001",
  ICL_DEV_API_REMOTE_PORT: "4001",
  ICL_DEV_DB_LOCAL_PORT: "13307",
  ICL_DEV_DB_REMOTE_HOST: "icl-dev-db.example.rds.amazonaws.com",
  ICL_DEV_DB_REMOTE_PORT: "3306",
};

test("development API tunnel forwards only the approved backend port", () => {
  const config = resolveDevelopmentTunnelConfig(validEnvironment, "api");
  const args = buildDevelopmentSessionArgs(config);

  assert.equal(args[0], "ssm");
  assert.equal(args[1], "start-session");
  assert.ok(args.includes("AWS-StartPortForwardingSession"));
  assert.ok(args.includes("i-01be6da5f9ee0ae50"));
  assert.deepEqual(buildDevelopmentSessionParameters(config), {
    portNumber: ["4001"],
    localPortNumber: ["4001"],
  });
});

test("development DB tunnel maps the fixed local port to the development RDS", () => {
  const config = resolveDevelopmentTunnelConfig(validEnvironment, "db");
  const args = buildDevelopmentSessionArgs(config);

  assert.ok(args.includes("AWS-StartPortForwardingSessionToRemoteHost"));
  assert.deepEqual(buildDevelopmentSessionParameters(config), {
    host: ["icl-dev-db.example.rds.amazonaws.com"],
    portNumber: ["3306"],
    localPortNumber: ["13307"],
  });
});

test("development tunnel parameters stay valid SSM string arrays", () => {
  const config = resolveDevelopmentTunnelConfig(validEnvironment, "db");
  const parameters = JSON.parse(buildDevelopmentSessionArgs(config).at(-1));

  for (const value of Object.values(parameters)) {
    assert.ok(Array.isArray(value));
    assert.ok(value.every((entry) => typeof entry === "string"));
  }
});

test("development tunnel rejects a non-development database name", () => {
  assert.throws(
    () => resolveDevelopmentTunnelConfig({ ...validEnvironment, ICL_DEV_DATABASE_NAME: "icl_pilates" }, "db"),
    /homepage_dev/,
  );
});

test("development tunnel rejects a non-development RDS endpoint", () => {
  assert.throws(
    () => resolveDevelopmentTunnelConfig(
      { ...validEnvironment, ICL_DEV_DB_REMOTE_HOST: "icl-prod-db.example.rds.amazonaws.com" },
      "db",
    ),
    /development endpoint/,
  );
});

test("development tunnel rejects an invalid instance id", () => {
  assert.throws(
    () => resolveDevelopmentTunnelConfig({ ...validEnvironment, ICL_DEV_INSTANCE_ID: "not-an-instance" }, "db"),
    /instance id/,
  );
});

test("development tunnel rejects an invalid AWS region", () => {
  assert.throws(
    () => resolveDevelopmentTunnelConfig({ ...validEnvironment, ICL_DEV_AWS_REGION: "moon-1" }, "db"),
    /region/,
  );
});

test("development tunnel rejects a port that is not the approved mapping", () => {
  assert.throws(
    () => resolveDevelopmentTunnelConfig({ ...validEnvironment, ICL_DEV_DB_LOCAL_PORT: "3306" }, "db"),
    /13307/,
  );
});

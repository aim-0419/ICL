import fs from "node:fs";
import path from "node:path";

const target = String(process.argv[2] || "").trim().toLowerCase();
const allowedTargets = new Set(["development", "test", "production"]);

if (!allowedTargets.has(target)) {
  console.error("[env-check] target must be development, test, or production");
  process.exit(1);
}

const envFile = target === "production"
  ? path.resolve(".env")
  : path.resolve(target === "test" ? ".env.test" : ".env.development");

if (!fs.existsSync(envFile)) {
  console.error(`[env-check] ${path.basename(envFile)} is missing`);
  process.exit(1);
}

process.env.NODE_ENV = target;
process.env.APP_ENV = target;
if (target === "production") {
  delete process.env.ENV_FILE;
} else {
  process.env.ENV_FILE = envFile;
}

const { assertRuntimeEnvironment, env } = await import("../src/config/env.js");
assertRuntimeEnvironment();

console.log(
  `[env-check] ${env.appEnvironment} environment is isolated and uses the approved database name`,
);

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const target = String(process.argv[2] || "").trim().toLowerCase();
const watch = process.argv.includes("--watch");
const allowedTargets = new Set(["development", "test", "production"]);

if (!allowedTargets.has(target)) {
  console.error("[backend] target must be development, test, or production");
  process.exit(1);
}

const backendRoot = process.cwd();
const envFile = target === "production"
  ? path.resolve(backendRoot, ".env")
  : path.resolve(backendRoot, target === "test" ? ".env.test" : ".env.development");

if (!fs.existsSync(envFile)) {
  console.error(`[backend] ${path.basename(envFile)} is required for ${target}`);
  process.exit(1);
}

const childEnvironment = {
  ...process.env,
  NODE_ENV: target,
  APP_ENV: target,
};

if (target === "production") {
  delete childEnvironment.ENV_FILE;
} else {
  childEnvironment.ENV_FILE = envFile;
}

const args = watch ? ["--watch", "src/server.js"] : ["src/server.js"];
const child = spawn(process.execPath, args, {
  cwd: backendRoot,
  env: childEnvironment,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

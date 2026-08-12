import { spawn } from "node:child_process";
import path from "node:path";

import { loadAppEnvironment, normalizeAppTarget, validateAppEnvironment } from "./app-env.mjs";

const command = process.argv[2] === "dev" ? "dev" : "build";
const target = normalizeAppTarget(process.argv[3] || "development");
const appEnvironment = loadAppEnvironment(target);
const errors = validateAppEnvironment(appEnvironment, target);

if (errors.length > 0) {
  console.error(`[app-${command}:${target}] environment error\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

const viteEntry = path.resolve("node_modules/vite/bin/vite.js");
const args = command === "dev"
  ? [viteEntry, "--mode", "app", "--host", "0.0.0.0", "--port", "5174"]
  : [viteEntry, "build", "--mode", "app"];

const child = spawn(process.execPath, args, {
  cwd: process.cwd(),
  env: appEnvironment,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

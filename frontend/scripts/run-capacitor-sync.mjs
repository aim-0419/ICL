import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { loadAppEnvironment, normalizeAppTarget, validateAppEnvironment } from "./app-env.mjs";

const target = normalizeAppTarget(process.argv[2] || "development");
const appEnvironment = loadAppEnvironment(target);
const errors = validateAppEnvironment(appEnvironment, target);

if (errors.length > 0) {
  console.error(`[capacitor:${target}] environment error\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

const node = process.execPath;
const capacitorCli = path.resolve(process.cwd(), "node_modules", "@capacitor", "cli", "bin", "capacitor");

if (!existsSync(capacitorCli)) {
  console.error("[capacitor] local @capacitor/cli is missing; install frontend dependencies first");
  process.exit(1);
}

const steps = [
  [node, ["scripts/run-app-vite.mjs", "build", target]],
  [node, ["scripts/ensure-native-projects.mjs"]],
  [node, [capacitorCli, "sync"]],
  [node, ["scripts/configure-native.mjs"]],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: appEnvironment,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`[capacitor:${target}] native projects synchronized`);

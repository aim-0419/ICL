import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const port = String(process.env.ICL_DEV_BACKEND_PORT || "4001").trim();
if (!/^\d+$/.test(port)) {
  console.error("[android:reverse] ICL_DEV_BACKEND_PORT must be a numeric port");
  process.exit(1);
}

const executableName = process.platform === "win32" ? "adb.exe" : "adb";
const sdkRoots = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk"),
].filter(Boolean);

const adb = sdkRoots
  .map((root) => path.join(root, "platform-tools", executableName))
  .find((candidate) => existsSync(candidate)) || executableName;

const args = [];
if (process.env.ANDROID_SERIAL) {
  args.push("-s", process.env.ANDROID_SERIAL);
}
args.push("reverse", `tcp:${port}`, `tcp:${port}`);

const result = spawnSync(adb, args, {
  cwd: process.cwd(),
  stdio: "inherit",
});

if (result.error) {
  console.error("[android:reverse] Android SDK platform-tools (adb) could not be started");
  process.exit(1);
}

if (result.status !== 0) {
  console.error("[android:reverse] start an emulator/device, then run this command again");
  process.exit(result.status || 1);
}

console.log(`[android:reverse] emulator localhost:${port} -> development backend localhost:${port}`);

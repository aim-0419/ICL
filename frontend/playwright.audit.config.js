import { defineConfig } from "@playwright/test";
import path from "node:path";
import os from "node:os";

export default defineConfig({
  testDir: "./e2e",
  outputDir: path.join(os.tmpdir(), "icl-audit-results"),
  timeout: 30000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30000,
  },
});

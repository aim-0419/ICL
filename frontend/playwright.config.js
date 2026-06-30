import { defineConfig } from "@playwright/test";
import path from "node:path";
import os from "node:os";

export default defineConfig({
  testDir: "./e2e",
  outputDir: path.join(os.tmpdir(), "icl-playwright-results"),
  timeout: 30000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4175",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 120000,
  },
});

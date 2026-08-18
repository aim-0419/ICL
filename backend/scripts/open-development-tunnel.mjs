import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

import dotenv from "dotenv";

import {
  buildDevelopmentSshArgs,
  developmentTunnelLocalPort,
  resolveDevelopmentTunnelConfig,
} from "./development-tunnel-config.mjs";

const mode = String(process.argv[2] || "").trim().toLowerCase();
const configPath = path.resolve(process.env.ICL_DEV_TUNNEL_ENV_FILE || ".env.development.tunnel");

if (!fs.existsSync(configPath)) {
  console.error("[dev-tunnel] .env.development.tunnel is required");
  process.exit(1);
}

const fileEnvironment = dotenv.parse(fs.readFileSync(configPath));
const environment = { ...fileEnvironment };
for (const key of Object.keys(fileEnvironment)) {
  if (process.env[key]) environment[key] = process.env[key];
}

let config;
try {
  config = resolveDevelopmentTunnelConfig(environment, mode);
} catch (error) {
  console.error(error?.message || "[dev-tunnel] invalid development tunnel configuration");
  process.exit(1);
}

if (!fs.existsSync(config.sshKeyPath)) {
  console.error("[dev-tunnel] configured SSH private key file does not exist");
  process.exit(1);
}

function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => reject(new Error(`[dev-tunnel] local port ${port} is already in use`)));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(resolve);
    });
  });
}

const localPort = developmentTunnelLocalPort(config);
try {
  await assertPortAvailable(localPort);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(
  `[dev-tunnel] opening ${config.mode} tunnel on 127.0.0.1:${localPort} for the approved development environment`,
);
console.log("[dev-tunnel] keep this terminal open; press Ctrl+C to close the tunnel");

const child = spawn("ssh", buildDevelopmentSshArgs(config), {
  shell: false,
  stdio: "inherit",
  windowsHide: true,
});

child.once("error", () => {
  console.error("[dev-tunnel] failed to start the system ssh client");
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    child.kill(signal);
  });
}

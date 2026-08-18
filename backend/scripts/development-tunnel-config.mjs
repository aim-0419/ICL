import os from "node:os";
import path from "node:path";

const HOST_PATTERN = /^[a-z0-9.-]+$/i;
const ALLOWED_MODES = new Set(["api", "db"]);

function normalizePort(value, fallback) {
  const port = Number(value || fallback);
  return Number.isInteger(port) ? port : 0;
}

export function expandHomePath(value, homeDirectory = os.homedir()) {
  const normalized = String(value || "").trim();
  if (normalized === "~") return homeDirectory;
  if (normalized.startsWith("~/") || normalized.startsWith("~\\")) {
    return path.join(homeDirectory, normalized.slice(2));
  }
  return path.resolve(normalized);
}

export function resolveDevelopmentTunnelConfig(environment, mode) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (!ALLOWED_MODES.has(normalizedMode)) {
    throw new Error("[dev-tunnel] mode must be api or db");
  }

  const config = {
    mode: normalizedMode,
    environment: String(environment.ICL_DEV_ENVIRONMENT || "").trim().toLowerCase(),
    databaseName: String(environment.ICL_DEV_DATABASE_NAME || "").trim(),
    sshHost: String(environment.ICL_DEV_SSH_HOST || "").trim(),
    sshUser: String(environment.ICL_DEV_SSH_USER || "").trim(),
    sshKeyPath: expandHomePath(environment.ICL_DEV_SSH_KEY_PATH),
    apiLocalPort: normalizePort(environment.ICL_DEV_API_LOCAL_PORT, 4001),
    apiRemoteHost: String(environment.ICL_DEV_API_REMOTE_HOST || "127.0.0.1").trim(),
    apiRemotePort: normalizePort(environment.ICL_DEV_API_REMOTE_PORT, 4001),
    dbLocalPort: normalizePort(environment.ICL_DEV_DB_LOCAL_PORT, 13306),
    dbRemoteHost: String(environment.ICL_DEV_DB_REMOTE_HOST || "").trim(),
    dbRemotePort: normalizePort(environment.ICL_DEV_DB_REMOTE_PORT, 3306),
  };

  const errors = [];
  if (config.environment !== "development") errors.push("environment must be development");
  if (config.databaseName !== "homepage_dev") errors.push("database must be homepage_dev");
  if (!HOST_PATTERN.test(config.sshHost)) errors.push("development SSH host is invalid");
  if (!/^[a-z0-9._-]+$/i.test(config.sshUser)) errors.push("development SSH user is invalid");
  if (!config.sshKeyPath) errors.push("development SSH key path is required");
  if (config.apiLocalPort !== 4001 || config.apiRemotePort !== 4001) {
    errors.push("development API tunnel must use port 4001");
  }
  if (config.apiRemoteHost !== "127.0.0.1") {
    errors.push("development API tunnel must target EC2 loopback");
  }
  if (config.dbLocalPort !== 13306 || config.dbRemotePort !== 3306) {
    errors.push("development DB tunnel must map local 13306 to remote 3306");
  }
  if (
    !HOST_PATTERN.test(config.dbRemoteHost) ||
    !/dev/i.test(config.dbRemoteHost) ||
    !/\.rds\.amazonaws\.com$/i.test(config.dbRemoteHost)
  ) {
    errors.push("development DB host must be an AWS RDS development endpoint");
  }

  if (errors.length > 0) {
    throw new Error(`[dev-tunnel] ${errors.join("; ")}`);
  }

  return config;
}

export function buildDevelopmentSshArgs(config) {
  const forward = config.mode === "api"
    ? `127.0.0.1:${config.apiLocalPort}:${config.apiRemoteHost}:${config.apiRemotePort}`
    : `127.0.0.1:${config.dbLocalPort}:${config.dbRemoteHost}:${config.dbRemotePort}`;

  return [
    "-N",
    "-T",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ServerAliveInterval=60",
    "-o",
    "ServerAliveCountMax=3",
    "-i",
    config.sshKeyPath,
    "-L",
    forward,
    `${config.sshUser}@${config.sshHost}`,
  ];
}

export function developmentTunnelLocalPort(config) {
  return config.mode === "api" ? config.apiLocalPort : config.dbLocalPort;
}

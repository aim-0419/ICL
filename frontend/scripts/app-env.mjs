import fs from "node:fs";
import path from "node:path";

const APP_TARGETS = new Set(["development", "production"]);

function parseSimpleEnv(source) {
  return Object.fromEntries(
    String(source || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
        return [key, value];
      }),
  );
}

function readOptionalEnvironment(filePath) {
  return fs.existsSync(filePath) ? parseSimpleEnv(fs.readFileSync(filePath, "utf8")) : {};
}

export function normalizeAppTarget(value) {
  const target = String(value || "").trim().toLowerCase();
  if (!APP_TARGETS.has(target)) {
    throw new Error("app target must be development or production");
  }
  return target;
}

export function loadAppEnvironment(targetValue, root = process.cwd()) {
  const target = normalizeAppTarget(targetValue);
  const resolvedRoot = path.resolve(root);
  const example = readOptionalEnvironment(
    path.join(resolvedRoot, `.env.app.${target}.example`),
  );
  const targetFile = readOptionalEnvironment(path.join(resolvedRoot, `.env.app.${target}`));
  const localFile = readOptionalEnvironment(path.join(resolvedRoot, `.env.app.${target}.local`));

  return { ...example, ...targetFile, ...localFile, ...process.env };
}

function isLocalDevelopmentHost(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (["localhost", "127.0.0.1", "10.0.2.2", "::1"].includes(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^10\./.test(normalized)) return true;
  const match = normalized.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function splitHosts(value) {
  return String(value || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function validateAppEnvironment(env, targetValue) {
  const target = normalizeAppTarget(targetValue);
  const errors = [];
  const appShell = String(env.VITE_APP_SHELL || "").trim().toLowerCase();
  const appEnvironment = String(env.VITE_APP_ENV || "").trim().toLowerCase();
  const apiBaseUrl = String(env.VITE_API_BASE_URL || "").trim();
  const allowLocal = String(env.APP_BUILD_ALLOW_LOCAL || "").trim().toLowerCase() === "true";
  const productionHosts = splitHosts(env.VITE_PRODUCTION_API_HOSTS);
  const appLinkHosts = splitHosts(env.VITE_APP_LINK_HOSTS);

  if (appShell !== "native") errors.push("VITE_APP_SHELL must be native");
  if (appEnvironment !== target) errors.push("VITE_APP_ENV does not match the requested build target");

  try {
    const parsed = new URL(apiBaseUrl);
    const localHost = isLocalDevelopmentHost(parsed.hostname);
    const apiHost = parsed.hostname.toLowerCase();

    if (!parsed.pathname.replace(/\/$/, "").endsWith("/api")) {
      errors.push("VITE_API_BASE_URL path must end with /api");
    }

    if (target === "development") {
      if (productionHosts.includes(apiHost)) {
        errors.push("development app builds cannot use a production API host");
      }
      if (parsed.protocol !== "https:" && !(allowLocal && localHost)) {
        errors.push("development HTTP APIs are allowed only for explicit local/private hosts");
      }
    }

    if (target === "production") {
      if (parsed.protocol !== "https:") {
        errors.push("production app builds require an HTTPS API URL");
      }
      if (localHost || allowLocal) {
        errors.push("production app builds cannot allow local API hosts");
      }
      if (appLinkHosts.length === 0 || !appLinkHosts.includes(apiHost)) {
        errors.push("production API host must be listed in VITE_APP_LINK_HOSTS");
      }
    }
  } catch {
    errors.push("VITE_API_BASE_URL must be a valid absolute URL");
  }

  return errors;
}

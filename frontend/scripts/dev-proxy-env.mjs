function splitHosts(value) {
  return String(value || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveDevelopmentProxyTarget(environment = {}) {
  const target = String(
    environment.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:4001",
  ).replace(/\/$/, "");
  const allowedHosts = splitHosts(
    environment.VITE_DEV_API_ALLOWED_HOSTS || "127.0.0.1,localhost",
  );

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error("VITE_DEV_API_PROXY_TARGET must be a valid absolute URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("VITE_DEV_API_PROXY_TARGET must use HTTP or HTTPS");
  }
  if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new Error("VITE_DEV_API_PROXY_TARGET host is not in VITE_DEV_API_ALLOWED_HOSTS");
  }

  return target;
}

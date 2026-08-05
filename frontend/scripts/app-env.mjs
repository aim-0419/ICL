import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";

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

export function loadAppEnvironment(root = process.cwd()) {
  const resolvedRoot = path.resolve(root);
  const examplePath = path.join(resolvedRoot, ".env.app.example");
  const example = fs.existsSync(examplePath)
    ? parseSimpleEnv(fs.readFileSync(examplePath, "utf8"))
    : {};
  const modeEnvironment = loadEnv("app", resolvedRoot, "");
  const hasExplicitAppEnvironment = [".env.app", ".env.app.local"]
    .some((file) => fs.existsSync(path.join(resolvedRoot, file)));
  const fileEnvironment = hasExplicitAppEnvironment
    ? { ...example, ...modeEnvironment }
    : { ...modeEnvironment, ...example };

  // 실제 쉘 환경변수가 가장 높은 우선순위를 갖습니다.
  return { ...fileEnvironment, ...process.env };
}

export function validateAppEnvironment(env) {
  const errors = [];
  const appShell = String(env.VITE_APP_SHELL || "").trim().toLowerCase();
  const apiBaseUrl = String(env.VITE_API_BASE_URL || "").trim();
  const allowLocal = String(env.APP_BUILD_ALLOW_LOCAL || "").toLowerCase() === "true";

  if (appShell !== "native") errors.push("VITE_APP_SHELL은 native여야 합니다.");

  try {
    const parsed = new URL(apiBaseUrl);
    const localHost = ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(allowLocal && localHost)) {
      errors.push("VITE_API_BASE_URL은 HTTPS 주소여야 합니다.");
    }
    if (!parsed.pathname.replace(/\/$/, "").endsWith("/api")) {
      errors.push("VITE_API_BASE_URL 경로는 /api로 끝나야 합니다.");
    }
    if (localHost && !allowLocal) {
      errors.push("배포용 앱 빌드에서는 localhost API를 사용할 수 없습니다.");
    }
  } catch {
    errors.push("VITE_API_BASE_URL에 올바른 URL을 설정해 주세요.");
  }

  return errors;
}

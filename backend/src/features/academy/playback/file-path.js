import path from "node:path";
import { fileURLToPath } from "node:url";
import { toSafeText } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "../../../..");
const ACADEMY_VIDEO_UPLOAD_ROOT = path.resolve(BACKEND_ROOT, "uploads", "academy", "videos");

function normalizePathCase(value) {
  return path.normalize(String(value || "")).toLowerCase();
}

function isPathInsideRoot(targetPath, rootPath) {
  const target = normalizePathCase(targetPath);
  const root = normalizePathCase(rootPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

// 업로드 영상 파일 경로 해석 로직
export function resolveAcademyVideoFilePath(assetPath) {
  let normalizedPath = toSafeText(assetPath);

  if (/^https?:\/\//i.test(normalizedPath)) {
    try {
      normalizedPath = new URL(normalizedPath).pathname;
    } catch {
      return "";
    }
  }

  if (!normalizedPath.startsWith("/uploads/academy/videos/")) {
    return "";
  }

  const relative = normalizedPath.replace(/^\/+/, "");
  const absolute = path.resolve(BACKEND_ROOT, relative);

  if (!isPathInsideRoot(absolute, ACADEMY_VIDEO_UPLOAD_ROOT)) {
    return "";
  }

  return absolute;
}

// 영상 MIME 타입 판별 로직
export function resolveVideoMimeType(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  return "application/octet-stream";
}


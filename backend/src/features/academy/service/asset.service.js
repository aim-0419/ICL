import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const FILE_EXTENSIONS = {
  image: new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]),
  video: new Set([".mp4", ".mov", ".webm", ".m4v"]),
};

const MIME_TO_EXTENSION = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-m4v": ".m4v",
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "../../../..");
const UPLOAD_ROOT = path.resolve(BACKEND_ROOT, "uploads", "academy");

// 파일명 정규화 로직
function sanitizeFileName(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
}

// 파일 확장자 판별 로직
function resolveExtension({ kind, filename, mimeType }) {
  const safeName = sanitizeFileName(filename);
  const fromName = path.extname(safeName).toLowerCase();

  if (FILE_EXTENSIONS[kind]?.has(fromName)) {
    return fromName;
  }

  const fromMime = MIME_TO_EXTENSION[String(mimeType || "").toLowerCase()];
  if (fromMime && FILE_EXTENSIONS[kind]?.has(fromMime)) {
    return fromMime;
  }

  if (kind === "video") return ".mp4";
  return ".jpg";
}

// 아카데미 자산 저장 로직
export async function saveAcademyAsset({ kind, fileName, mimeType, buffer }) {
  if (kind !== "image" && kind !== "video") {
    const error = new Error("업로드 타입이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error("업로드할 파일이 비어 있습니다.");
    error.status = 400;
    throw error;
  }

  const extension = resolveExtension({ kind, filename: fileName, mimeType });
  const targetDir = path.resolve(UPLOAD_ROOT, kind === "video" ? "videos" : "images");
  await mkdir(targetDir, { recursive: true });

  const savedName = `${Date.now()}-${randomUUID()}${extension}`;
  const targetPath = path.resolve(targetDir, savedName);
  await writeFile(targetPath, buffer);

  return `/uploads/academy/${kind === "video" ? "videos" : "images"}/${savedName}`;
}


import { mkdir, rm, writeFile } from "node:fs/promises";
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
const BACKEND_ROOT = path.resolve(__dirname, "../../..");
const UPLOAD_ROOT = path.resolve(BACKEND_ROOT, "uploads", "community");
const COMMUNITY_UPLOAD_PREFIX = "/uploads/community/";

function sanitizeFileName(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
}

function resolveExtension({ kind, fileName, mimeType }) {
  const safeName = sanitizeFileName(fileName);
  const extFromName = path.extname(safeName).toLowerCase();
  if (FILE_EXTENSIONS[kind]?.has(extFromName)) return extFromName;

  const extFromMime = MIME_TO_EXTENSION[String(mimeType || "").toLowerCase()];
  if (extFromMime && FILE_EXTENSIONS[kind]?.has(extFromMime)) return extFromMime;

  return kind === "video" ? ".mp4" : ".jpg";
}

export async function saveCommunityAsset({ kind, fileName, mimeType, buffer }) {
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

  const extension = resolveExtension({ kind, fileName, mimeType });
  const subDir = kind === "video" ? "videos" : "images";
  const targetDir = path.resolve(UPLOAD_ROOT, subDir);
  await mkdir(targetDir, { recursive: true });

  const savedName = `${Date.now()}-${randomUUID()}${extension}`;
  const targetPath = path.resolve(targetDir, savedName);
  await writeFile(targetPath, buffer);

  return `/uploads/community/${subDir}/${savedName}`;
}

function resolveCommunityAssetPath(assetPath) {
  const normalized = String(assetPath || "").trim();
  if (!normalized.startsWith(COMMUNITY_UPLOAD_PREFIX)) return "";

  const relativePath = normalized.replace(/^\/+/, "");
  const targetPath = path.resolve(BACKEND_ROOT, relativePath);
  const relativeFromRoot = path.relative(UPLOAD_ROOT, targetPath);
  if (!relativeFromRoot || relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) {
    return "";
  }

  return targetPath;
}

export async function deleteCommunityAsset(assetPath) {
  const targetPath = resolveCommunityAssetPath(assetPath);
  if (!targetPath) return false;

  try {
    await rm(targetPath, { force: true });
    return true;
  } catch {
    return false;
  }
}

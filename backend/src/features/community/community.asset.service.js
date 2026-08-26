/**
 * [커뮤니티 첨부 파일 저장 담당]
 *
 * 이벤트·후기·문의 글에 첨부하는 사진과 영상을 서버에 저장하고 삭제합니다.
 *
 * 파일 내용을 직접 열어 실제 형식이 맞는지 확인한 뒤에만 저장하며,
 * 이미지는 화면에 맞는 크기로 줄이고 용량이 작은 형식으로 바꿔 저장합니다.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";
import { optimizeImageBuffer } from "../../shared/media/image-optimizer.js";

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

const UPLOAD_ROOT = path.resolve(env.uploadRootPath, "community");
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

// 파일 시그니처(매직 바이트)로 실제 파일 형식을 검증합니다.
function validateMagicBytes(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case ".png":
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    case ".gif":
      return (
        buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38
      );
    case ".webp":
      // RIFF....WEBP
      return (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      );
    case ".mp4":
    case ".m4v":
    case ".mov":
      // ftyp box at byte offset 4
      return (
        buffer[4] === 0x66 &&
        buffer[5] === 0x74 &&
        buffer[6] === 0x79 &&
        buffer[7] === 0x70
      );
    case ".webm":
      return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    default:
      return false;
  }
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

  if (!validateMagicBytes(buffer, extension)) {
    const error = new Error("파일 형식이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const subDir = kind === "video" ? "videos" : "images";
  const targetDir = path.resolve(UPLOAD_ROOT, subDir);
  await mkdir(targetDir, { recursive: true });

  // 형식 검증을 원본에 마친 뒤에 최적화합니다.
  // 검증 전에 변환하면 매직 바이트 검사가 무의미해집니다.
  const stored =
    kind === "image"
      ? await optimizeImageBuffer(buffer, extension)
      : { buffer, extension, optimized: false };

  const savedName = `${Date.now()}-${randomUUID()}${stored.extension}`;
  const targetPath = path.resolve(targetDir, savedName);
  await writeFile(targetPath, stored.buffer);

  return `/uploads/community/${subDir}/${savedName}`;
}

function resolveCommunityAssetPath(assetPath) {
  const normalized = String(assetPath || "").trim();
  if (!normalized.startsWith(COMMUNITY_UPLOAD_PREFIX)) return "";

  const relativePath = normalized.slice(COMMUNITY_UPLOAD_PREFIX.length);
  const targetPath = path.resolve(UPLOAD_ROOT, relativePath);
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

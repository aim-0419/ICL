import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../../config/env.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MIME_TO_EXTENSION = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const MAX_NOTICE_IMAGE_BYTES = 10 * 1024 * 1024;

const NOTICE_UPLOAD_ROOT = path.resolve(env.uploadRootPath, "notices");

function createUploadError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sanitizeFileName(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
}

function resolveImageExtension(fileName, mimeType) {
  const mimeExtension = MIME_TO_EXTENSION[String(mimeType || "").toLowerCase()];
  if (mimeExtension) return mimeExtension;

  const extension = path.extname(sanitizeFileName(fileName)).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension) ? extension : "";
}

function validateImageSignature(buffer, extension) {
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
    case ".webp":
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
    default:
      return false;
  }
}

export async function uploadNoticeImage(buffer, fileName, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createUploadError("업로드할 이미지가 비어 있습니다.");
  }
  if (buffer.length > MAX_NOTICE_IMAGE_BYTES) {
    throw createUploadError("공지 이미지는 10MB 이하만 업로드할 수 있습니다.", 413);
  }

  const extension = resolveImageExtension(fileName, mimeType);
  if (!IMAGE_EXTENSIONS.has(extension) || !validateImageSignature(buffer, extension)) {
    throw createUploadError("JPG, PNG, WEBP 이미지 파일만 업로드할 수 있습니다.");
  }

  await mkdir(NOTICE_UPLOAD_ROOT, { recursive: true });
  const savedName = `${Date.now()}-${randomUUID()}${extension}`;
  const targetPath = path.resolve(NOTICE_UPLOAD_ROOT, savedName);

  const relativeFromRoot = path.relative(NOTICE_UPLOAD_ROOT, targetPath);
  if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) {
    throw createUploadError("업로드 경로가 올바르지 않습니다.", 400);
  }

  await writeFile(targetPath, buffer);
  return `/uploads/notices/${savedName}`;
}

/**
 * [교육영상 파일 저장 담당]
 *
 * 교육영상과 썸네일 이미지를 서버에 저장하는 일을 맡습니다.
 *
 * 안전을 위해 저장 전에 확인하는 것들이 있습니다.
 * - 허용한 형식(JPG, PNG, MP4 등)이 맞는지 파일 내용을 직접 열어 확인합니다.
 *   확장자만 바꿔치기한 파일을 걸러 내기 위해서입니다.
 * - 정해진 최대 용량을 넘지 않는지 확인합니다.
 * - 이미지는 화면에 맞는 크기로 줄이고 용량이 작은 형식으로 바꿔 저장합니다.
 *
 * 큰 영상 파일은 통째로 메모리에 올리지 않고 조금씩 나눠 받아 저장합니다.
 */
import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { env } from "../../../config/env.js";
import { optimizeImageBuffer } from "../../../shared/media/image-optimizer.js";

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

// [현재 미사용] 교육영상 이미지 업로드 최대 용량입니다. 이 파일 안에서만 쓰입니다.
export const ACADEMY_IMAGE_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const ACADEMY_VIDEO_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 * 1024;

const HEADER_BYTES_TO_VALIDATE = 32;
const UPLOAD_ROOT = path.resolve(env.uploadRootPath, "academy");

function createHttpError(message, status = 400) {
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

  return kind === "video" ? ".mp4" : ".jpg";
}

function resolveMaxBytes(kind) {
  return kind === "video" ? ACADEMY_VIDEO_UPLOAD_MAX_BYTES : ACADEMY_IMAGE_UPLOAD_MAX_BYTES;
}

function formatMaxBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.floor(bytes / 1024 / 1024 / 1024)}GB`;
  return `${Math.floor(bytes / 1024 / 1024)}MB`;
}

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
      return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
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
    case ".mp4":
    case ".m4v":
    case ".mov":
      return buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
    case ".webm":
      return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    default:
      return false;
  }
}

async function removeFileQuietly(filePath) {
  try {
    await unlink(filePath);
  } catch {
    // 이미 없는 임시 파일은 무시합니다.
  }
}

async function writeBufferToFile({ buffer, targetPath, maxBytes }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createHttpError("업로드할 파일이 비어 있습니다.");
  }
  if (buffer.length > maxBytes) {
    throw createHttpError(`업로드 가능한 최대 용량은 ${formatMaxBytes(maxBytes)}입니다.`, 413);
  }

  const handle = await open(targetPath, "w");
  try {
    await handle.writeFile(buffer);
  } finally {
    await handle.close();
  }

  return {
    bytesWritten: buffer.length,
    header: buffer.subarray(0, HEADER_BYTES_TO_VALIDATE),
  };
}

async function writeStreamToFile({ stream, targetPath, maxBytes, contentLength }) {
  const declaredSize = Number(contentLength || 0);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw createHttpError(`업로드 가능한 최대 용량은 ${formatMaxBytes(maxBytes)}입니다.`, 413);
  }

  const handle = await open(targetPath, "w");
  let bytesWritten = 0;
  let header = Buffer.alloc(0);
  let failed = null;

  try {
    for await (const chunk of stream) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesWritten += bufferChunk.length;

      if (bytesWritten > maxBytes) {
        throw createHttpError(`업로드 가능한 최대 용량은 ${formatMaxBytes(maxBytes)}입니다.`, 413);
      }

      if (header.length < HEADER_BYTES_TO_VALIDATE) {
        header = Buffer.concat([header, bufferChunk]).subarray(0, HEADER_BYTES_TO_VALIDATE);
      }

      await handle.write(bufferChunk);
    }
  } catch (error) {
    failed = error;
    throw error;
  } finally {
    await handle.close();
    if (failed) {
      await removeFileQuietly(targetPath);
    }
  }

  return { bytesWritten, header };
}

// 교육영상과 썸네일 파일을 저장하고 브라우저에서 접근할 상대 경로를 반환합니다.
export async function saveAcademyAsset({
  kind,
  fileName,
  mimeType,
  buffer,
  stream,
  contentLength,
  videoId = "",
  chapterOrder = "",
}) {
  if (kind !== "image" && kind !== "video") {
    throw createHttpError("업로드 타입이 올바르지 않습니다.");
  }

  const extension = resolveExtension({ kind, filename: fileName, mimeType });
  const maxBytes = resolveMaxBytes(kind);
  const subDir = kind === "video" ? "videos" : "images";
  const targetDir = path.resolve(UPLOAD_ROOT, subDir);
  await mkdir(targetDir, { recursive: true });

  const safeVideoId = String(videoId || "").replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 80);
  const safeOrder = String(chapterOrder || "").replace(/\D/g, "").slice(0, 4);
  // 이 파일은 기록 후에 형식을 검증하지만, 변환은 검증된 원본에만 적용해야 합니다.
  // 그래서 이미지 buffer 경로에서는 용량과 매직 바이트를 먼저 원본 기준으로 확인합니다.
  let storedExtension = extension;
  let storedBuffer = buffer;
  if (kind === "image" && Buffer.isBuffer(buffer) && buffer.length > 0) {
    if (buffer.length > maxBytes) {
      throw createHttpError(`업로드 가능한 최대 용량은 ${formatMaxBytes(maxBytes)}입니다.`, 413);
    }
    if (!validateMagicBytes(buffer.subarray(0, HEADER_BYTES_TO_VALIDATE), extension)) {
      throw createHttpError("파일 형식이 올바르지 않습니다.");
    }
    const optimized = await optimizeImageBuffer(buffer, extension);
    storedBuffer = optimized.buffer;
    storedExtension = optimized.extension;
  }

  const savedName =
    kind === "video" && safeVideoId && safeOrder
      ? `${safeVideoId}-ch${safeOrder}${storedExtension}`
      : `${Date.now()}-${randomUUID()}${storedExtension}`;

  const targetPath = path.resolve(targetDir, savedName);
  const tempPath = path.resolve(targetDir, `.upload-${Date.now()}-${randomUUID()}${storedExtension}`);
  const result = stream
    ? await writeStreamToFile({ stream, targetPath: tempPath, maxBytes, contentLength })
    : await writeBufferToFile({ buffer: storedBuffer, targetPath: tempPath, maxBytes });

  if (!result.bytesWritten) {
    await removeFileQuietly(tempPath);
    throw createHttpError("업로드할 파일이 비어 있습니다.");
  }

  if (!validateMagicBytes(result.header, storedExtension)) {
    await removeFileQuietly(tempPath);
    throw createHttpError("파일 형식이 올바르지 않습니다.");
  }

  await removeFileQuietly(targetPath);
  await rename(tempPath, targetPath);

  return `/uploads/academy/${subDir}/${savedName}`;
}

// 차시 순서가 바뀌면 영상 파일명도 새 순서와 맞게 정리합니다.
export async function syncChapterVideoNames(videoId, chapters) {
  const safeVideoId = String(videoId || "").replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 80);
  if (!safeVideoId || !Array.isArray(chapters) || !chapters.length) return chapters;

  const structuredPattern = new RegExp(`^${safeVideoId}-ch(\\d+)(\\.[a-z0-9]+)$`, "i");
  const plan = [];

  for (const chapter of chapters) {
    const currentRelPath = String(chapter?.videoPath || "").trim();
    if (!currentRelPath.startsWith("/uploads/academy/videos/")) continue;

    const currentFileName = path.basename(currentRelPath);
    const match = structuredPattern.exec(currentFileName);
    if (!match) continue;

    const ext = match[2];
    const desiredFileName = `${safeVideoId}-ch${chapter.chapterOrder}${ext}`;
    if (currentFileName === desiredFileName) continue;

    plan.push({
      from: path.resolve(UPLOAD_ROOT, "videos", currentFileName),
      to: path.resolve(UPLOAD_ROOT, "videos", desiredFileName),
      newRelPath: `/uploads/academy/videos/${desiredFileName}`,
      chapter,
    });
  }

  if (!plan.length) return chapters;

  const temps = [];
  for (const item of plan) {
    const tempName = `tmp-${randomUUID()}${path.extname(item.from)}`;
    const tempPath = path.resolve(UPLOAD_ROOT, "videos", tempName);
    try {
      await rename(item.from, tempPath);
      temps.push({ ...item, from: tempPath });
    } catch {
      // 실제 파일이 없으면 DB 경로만 유지하고 다음 항목을 처리합니다.
    }
  }

  for (const item of temps) {
    try {
      await removeFileQuietly(item.to);
      await rename(item.from, item.to);
      item.chapter.videoPath = item.newRelPath;
    } catch {
      // 파일명 정리에 실패해도 기존 강의 데이터 저장 흐름은 막지 않습니다.
    }
  }

  return chapters;
}

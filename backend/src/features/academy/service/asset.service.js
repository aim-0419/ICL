// 파일 역할: 아카데미 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { mkdir, rename, writeFile } from "node:fs/promises";
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
// 함수 역할: sanitizeFileName 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function sanitizeFileName(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
}

// 파일 확장자 판별 로직
// 함수 역할: extension 상황에 맞는 값을 계산하거나 선택합니다.
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
// 함수 역할: 업로드된 강의 이미지나 영상을 안전한 파일명으로 저장하고 접근 경로를 반환합니다.
export async function saveAcademyAsset({ kind, fileName, mimeType, buffer, videoId = "", chapterOrder = "" }) {
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
  const subDir = kind === "video" ? "videos" : "images";
  const targetDir = path.resolve(UPLOAD_ROOT, subDir);
  await mkdir(targetDir, { recursive: true });

  const safeVideoId = String(videoId || "").replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 80);
  const safeOrder = String(chapterOrder || "").replace(/\D/g, "").slice(0, 4);

  const savedName =
    kind === "video" && safeVideoId && safeOrder
      ? `${safeVideoId}-ch${safeOrder}${extension}`
      : `${Date.now()}-${randomUUID()}${extension}`;

  const targetPath = path.resolve(targetDir, savedName);
  await writeFile(targetPath, buffer);

  return `/uploads/academy/${subDir}/${savedName}`;
}

// 차시 순서 변경 시 영상 파일명을 새 순서에 맞게 일괄 rename
// chapters 배열의 videoPath와 chapterOrder를 기준으로 파일명을 동기화한다.
// 두 번의 rename으로 swap 충돌을 방지한다: 1단계(→ temp), 2단계(temp → 최종).
// 함수 역할: 차시 순서가 바뀌었을 때 영상 파일명을 새 순서와 제목에 맞게 동기화합니다.
export async function syncChapterVideoNames(videoId, chapters) {
  const safeVideoId = String(videoId || "").replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 80);
  if (!safeVideoId || !Array.isArray(chapters) || !chapters.length) return chapters;

  // 구조화 파일명 패턴: {videoId}-ch{N}.{ext}
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

  // 1단계: 각 파일을 임시 이름으로 이동 (swap 충돌 방지)
  const temps = [];
  for (const item of plan) {
    const tempName = `tmp-${randomUUID()}${path.extname(item.from)}`;
    const tempPath = path.resolve(UPLOAD_ROOT, "videos", tempName);
    try {
      await rename(item.from, tempPath);
      temps.push({ ...item, from: tempPath });
    } catch {
      // 파일이 아직 없으면 건너뜀
    }
  }

  // 2단계: 임시 이름에서 최종 이름으로 이동, 성공 시 chapter.videoPath 갱신
  for (const item of temps) {
    try {
      await rename(item.from, item.to);
      item.chapter.videoPath = item.newRelPath;
    } catch {
      // 최종 rename 실패 시 임시 파일 유지
    }
  }

  return chapters;
}

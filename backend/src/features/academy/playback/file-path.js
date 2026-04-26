// 파일 역할: 아카데미 영상 보안 재생을 위한 세션, 토큰, 파일 경로 처리 로직을 담당합니다.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toSafeText } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "../../../..");
const ACADEMY_VIDEO_UPLOAD_ROOT = path.resolve(BACKEND_ROOT, "uploads", "academy", "videos");

// 함수 역할: 경로 case 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizePathCase(value) {
  return path.normalize(String(value || "")).toLowerCase();
}

// 함수 역할: 경로 inside root 조건에 해당하는지 참/거짓으로 판별합니다.
function isPathInsideRoot(targetPath, rootPath) {
  const target = normalizePathCase(targetPath);
  const root = normalizePathCase(rootPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

// 업로드 영상 파일 경로 해석 로직
// 함수 역할: 업로드 경로를 실제 서버 파일 경로로 바꾸고 허용된 폴더 안인지 검증합니다.
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
// 함수 역할: 영상 파일 확장자에 맞는 MIME 타입을 선택합니다.
export function resolveVideoMimeType(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  return "application/octet-stream";
}


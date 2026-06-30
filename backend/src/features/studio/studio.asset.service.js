// 파일 역할: 스튜디오 게시판 공지에 첨부하는 이미지 파일을 검증하고 업로드 폴더에 저장합니다.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "../../..");
const UPLOAD_ROOT = path.resolve(BACKEND_ROOT, "uploads", "notices");
const PREFIX = "/uploads/notices/";

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".gif"]);
const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
};

function resolveExt(fileName, mimeType) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (ALLOWED_EXT.has(ext)) return ext;
  return MIME_TO_EXT[String(mimeType || "").toLowerCase()] ?? null;
}

function validMagic(buf, ext) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
  if (ext === ".jpg" || ext === ".jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === ".png") return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (ext === ".gif") return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
  return true;
}

export async function uploadNoticeImage(buffer, fileName, mimeType) {
  if (!buffer || buffer.length === 0) {
    const e = new Error("빈 파일입니다."); e.status = 400; throw e;
  }
  if (buffer.length > 10 * 1024 * 1024) {
    const e = new Error("파일 크기는 10MB 이하여야 합니다."); e.status = 400; throw e;
  }
  const ext = resolveExt(fileName, mimeType);
  if (!ext || !ALLOWED_EXT.has(ext)) {
    const e = new Error("jpg, jpeg, png, gif 형식만 허용됩니다."); e.status = 400; throw e;
  }
  if (!validMagic(buffer, ext)) {
    const e = new Error("파일 형식이 올바르지 않습니다."); e.status = 400; throw e;
  }
  await mkdir(UPLOAD_ROOT, { recursive: true });
  const name = `${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
  await writeFile(path.join(UPLOAD_ROOT, name), buffer);
  return `${PREFIX}${name}`;
}

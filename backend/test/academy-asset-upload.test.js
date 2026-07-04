import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACADEMY_VIDEO_UPLOAD_MAX_BYTES,
  saveAcademyAsset,
} from "../src/features/academy/service/asset.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");

function toStoredFilePath(assetPath) {
  return path.resolve(BACKEND_ROOT, assetPath.replace(/^\/+/, ""));
}

function createMp4Header() {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x02, 0x00,
  ]);
}

test("교육영상 업로드는 파일 전체를 메모리에 올리지 않고 스트림으로 저장한다", async () => {
  const videoId = `stream-test-${Date.now()}`;
  const body = Buffer.concat([createMp4Header(), Buffer.alloc(64)]);

  const assetPath = await saveAcademyAsset({
    kind: "video",
    fileName: "lecture.mp4",
    mimeType: "application/octet-stream",
    stream: Readable.from([body.subarray(0, 8), body.subarray(8)]),
    contentLength: body.length,
    videoId,
    chapterOrder: "1",
  });

  assert.equal(assetPath, `/uploads/academy/videos/${videoId}-ch1.mp4`);
  await unlink(toStoredFilePath(assetPath));
});

test("교육영상 업로드는 5GB를 초과하는 요청을 저장 전에 거부한다", async () => {
  await assert.rejects(
    () =>
      saveAcademyAsset({
        kind: "video",
        fileName: "too-large.mp4",
        mimeType: "video/mp4",
        stream: Readable.from([]),
        contentLength: ACADEMY_VIDEO_UPLOAD_MAX_BYTES + 1,
      }),
    /최대 용량/
  );
});

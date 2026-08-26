// 업로드 이미지 최적화 동작 검증.
// 최적화가 실패해도 업로드가 깨지지 않아야 하므로 fail-open 경로를 함께 확인합니다.
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  DEFAULT_MAX_EDGE,
  isOptimizableImageExtension,
  optimizeImageBuffer,
} from "../src/shared/media/image-optimizer.js";

// 압축이 잘 되는 단색 대신, 실제 사진처럼 압축이 덜 되는 잡음 이미지를 만듭니다.
async function createNoiseJpeg(width, height) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

test("카메라 원본 크기의 사진을 긴 변 기준으로 줄이고 webp 로 바꾼다", async () => {
  const original = await createNoiseJpeg(4000, 6000);
  const result = await optimizeImageBuffer(original, ".jpg");

  assert.equal(result.optimized, true);
  assert.equal(result.extension, ".webp");
  assert.ok(result.bytes < result.originalBytes, "변환 결과가 원본보다 작아야 합니다");

  const meta = await sharp(result.buffer).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(Math.max(meta.width, meta.height), DEFAULT_MAX_EDGE);
  // 가로세로 비율이 유지되어야 합니다.
  assert.equal(meta.width, 1280);
  assert.equal(meta.height, 1920);
});

test("상한보다 작은 이미지는 치수를 그대로 둔다", async () => {
  const original = await createNoiseJpeg(800, 600);
  const result = await optimizeImageBuffer(original, ".jpg");

  const meta = await sharp(result.optimized ? result.buffer : original).metadata();
  assert.equal(meta.width, 800);
  assert.equal(meta.height, 600);
});

test("변환해도 이득이 없으면 원본을 유지한다", async () => {
  // 이미 webp 로 잘 압축된 작은 이미지는 다시 변환할 이유가 없습니다.
  const small = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#ffffff" } })
    .webp({ quality: 82 })
    .toBuffer();

  const result = await optimizeImageBuffer(small, ".webp");
  assert.equal(result.optimized, false);
  assert.equal(result.extension, ".webp");
  assert.equal(result.buffer, small);
});

test("GIF 는 애니메이션 보존을 위해 건드리지 않는다", async () => {
  const fakeGif = Buffer.from("GIF89a" + "x".repeat(64), "latin1");
  const result = await optimizeImageBuffer(fakeGif, ".gif");

  assert.equal(result.optimized, false);
  assert.equal(result.extension, ".gif");
  assert.equal(result.buffer, fakeGif);
  assert.equal(isOptimizableImageExtension(".gif"), false);
});

test("이미지로 해석할 수 없는 버퍼는 원본을 그대로 돌려준다", async () => {
  const broken = Buffer.from("이건 이미지가 아닙니다".repeat(20), "utf8");
  const result = await optimizeImageBuffer(broken, ".jpg");

  assert.equal(result.optimized, false);
  assert.equal(result.buffer, broken);
  assert.equal(result.extension, ".jpg");
});

test("빈 버퍼에도 예외를 던지지 않는다", async () => {
  const result = await optimizeImageBuffer(Buffer.alloc(0), ".jpg");
  assert.equal(result.optimized, false);
  assert.equal(result.bytes, 0);
});

test("EXIF 회전 정보를 반영해 사진이 눕지 않는다", async () => {
  // orientation 6 = 시계방향 90도 회전 필요. 반영하지 않으면 가로세로가 뒤바뀝니다.
  const rotated = await sharp({
    create: { width: 400, height: 200, channels: 3, background: "#336699" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

  const result = await optimizeImageBuffer(rotated, ".jpg");
  const meta = await sharp(result.optimized ? result.buffer : rotated).metadata();

  // 회전을 반영하면 세로가 더 길어집니다.
  assert.ok(meta.height > meta.width, `회전 반영 실패: ${meta.width}x${meta.height}`);
});

/**
 * [업로드 이미지 최적화]
 *
 * 관리자가 카메라 원본(수천만 화소, 수십 MB)을 그대로 올려도 서비스에는 화면에 맞는
 * 크기의 webp 만 저장되도록 합니다. 이 단계가 없으면 공개 페이지가 한 장에 수 MB 를
 * 내려보내게 됩니다.
 *
 * 원칙:
 * - 최적화가 실패해도 업로드는 성공해야 합니다. 어떤 이유로든 변환에 실패하면 원본을 그대로 씁니다.
 * - 결과가 원본보다 크면 원본을 유지합니다. 이미 최적화된 파일을 키우지 않습니다.
 * - EXIF 회전 정보를 반영합니다. 반영하지 않고 리사이즈하면 세로 사진이 눕습니다.
 * - GIF 는 건드리지 않습니다. 애니메이션이 사라집니다.
 */
import sharp from "sharp";

// 변환 대상 확장자. gif 는 애니메이션 보존을 위해 제외합니다.
const OPTIMIZABLE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export const DEFAULT_MAX_EDGE = 1920;
// [현재 미사용] 이미지 변환 기본 품질값입니다. 이 파일 안에서만 쓰입니다.
export const DEFAULT_QUALITY = 82;

export function isOptimizableImageExtension(extension) {
  return OPTIMIZABLE_EXTENSIONS.has(String(extension || "").toLowerCase());
}

/**
 * @returns {Promise<{buffer: Buffer, extension: string, optimized: boolean, originalBytes: number, bytes: number}>}
 */
export async function optimizeImageBuffer(buffer, extension, options = {}) {
  const originalBytes = Buffer.isBuffer(buffer) ? buffer.length : 0;
  const unchanged = { buffer, extension, optimized: false, originalBytes, bytes: originalBytes };

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return unchanged;
  if (!isOptimizableImageExtension(extension)) return unchanged;

  const maxEdge = Number(options.maxEdge) > 0 ? Number(options.maxEdge) : DEFAULT_MAX_EDGE;
  const quality = Number(options.quality) > 0 ? Number(options.quality) : DEFAULT_QUALITY;

  try {
    const pipeline = sharp(buffer, { failOn: "none" }).rotate();
    const metadata = await pipeline.metadata();
    if (!metadata?.width || !metadata?.height) return unchanged;

    // 애니메이션 webp 는 프레임이 사라지므로 건드리지 않습니다.
    if (Number(metadata.pages) > 1) return unchanged;

    const longestEdge = Math.max(metadata.width, metadata.height);
    if (longestEdge > maxEdge) {
      pipeline.resize({
        width: metadata.width >= metadata.height ? maxEdge : null,
        height: metadata.height > metadata.width ? maxEdge : null,
        withoutEnlargement: true,
      });
    }

    const converted = await pipeline.webp({ quality, effort: 4 }).toBuffer();

    // 변환해도 이득이 없으면 원본을 유지합니다.
    if (converted.length >= originalBytes) return unchanged;

    return {
      buffer: converted,
      extension: ".webp",
      optimized: true,
      originalBytes,
      bytes: converted.length,
    };
  } catch (error) {
    // 최적화 실패로 업로드를 막지 않습니다. 원본을 그대로 저장합니다.
    console.warn(`[image-optimizer] 최적화를 건너뜁니다: ${error?.message || "unknown error"}`);
    return unchanged;
  }
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { query, queryOne } from "../../shared/db/mysql.js";

const CATEGORY_SET = new Set(["입문", "초급", "중급", "고급"]);
const BADGE_SET = new Set(["", "New", "Hot"]);

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
const UPLOAD_ROOT = path.resolve(BACKEND_ROOT, "uploads", "academy");

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSafeText(value) {
  return String(value || "").trim();
}

function toSqlDateTimeString(value) {
  const source = toSafeText(value);
  if (!source) return "";

  const normalized = source
    .replace("T", " ")
    .replace(/\.\d+$/, "")
    .replace(/Z$/, "")
    .trim();

  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
    return "";
  }

  if (normalized.length === 16) return `${normalized}:00`;
  return normalized;
}

function normalizeCategory(value) {
  const category = toSafeText(value);
  if (CATEGORY_SET.has(category)) return category;
  return "입문";
}

function normalizeBadge(value) {
  const badge = toSafeText(value);
  if (BADGE_SET.has(badge)) return badge;
  return "";
}

function normalizeAssetPath(value) {
  const source = toSafeText(value);
  if (!source) return "";

  if (source.startsWith("http://") || source.startsWith("https://")) {
    return source;
  }

  if (source.startsWith("/uploads/academy/")) {
    return source;
  }

  return "";
}

function normalizeChapterRow(row) {
  return {
    id: String(row.id || ""),
    videoId: String(row.videoId || ""),
    chapterOrder: Math.max(1, Math.round(toNumber(row.chapterOrder, 1))),
    title: String(row.title || ""),
    description: String(row.description || ""),
    videoUrl: String(row.videoUrl || ""),
    durationSec: Math.max(0, Math.round(toNumber(row.durationSec))),
    isPreview: Boolean(row.isPreview === 1 || row.isPreview === true || row.isPreview === "1"),
    createdAt: row.createdAt ? String(row.createdAt) : "",
  };
}

function normalizeVideoRow(row, chapters = []) {
  const normalizedChapters = chapters
    .map(normalizeChapterRow)
    .sort((a, b) => a.chapterOrder - b.chapterOrder || a.id.localeCompare(b.id));
  const firstChapter = normalizedChapters[0];

  return {
    id: String(row.id || ""),
    productId: String(row.productId || ""),
    title: String(row.title || ""),
    instructor: String(row.instructor || "ICL Academy"),
    category: String(row.category || "입문"),
    originalPrice: toNumber(row.originalPrice),
    salePrice: toNumber(row.salePrice),
    rating: toNumber(row.rating),
    reviews: Math.max(0, Math.round(toNumber(row.reviews))),
    badge: String(row.badge || ""),
    image: String(row.image || ""),
    videoUrl: String(row.videoUrl || firstChapter?.videoUrl || ""),
    publishAt: String(row.publishAt || ""),
    description: String(row.description || ""),
    period: String(row.period || ""),
    chapterCount: normalizedChapters.length,
    chapters: normalizedChapters,
  };
}

function normalizeProgressRow(row) {
  const currentTime = Math.max(0, Math.round(toNumber(row.currentTime)));
  const duration = Math.max(0, Math.round(toNumber(row.duration)));
  const calculatedPercent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round(toNumber(row.progressPercent, calculatedPercent)))
  );
  const completed = Boolean(
    row.completed === true || row.completed === 1 || row.completed === "1" || progressPercent >= 100
  );

  return {
    videoId: String(row.videoId || ""),
    currentTime: completed && duration > 0 ? duration : currentTime,
    duration,
    progressPercent: completed ? 100 : progressPercent,
    completed,
    lastWatchedAt: row.lastWatchedAt ? String(row.lastWatchedAt) : "",
    createdAt: row.createdAt ? String(row.createdAt) : "",
  };
}

function normalizeChapterProgressRow(row) {
  const currentTime = Math.max(0, Math.round(toNumber(row.currentTime)));
  const duration = Math.max(0, Math.round(toNumber(row.duration)));
  const calculatedPercent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round(toNumber(row.progressPercent, calculatedPercent)))
  );
  const completed = Boolean(
    row.completed === true || row.completed === 1 || row.completed === "1" || progressPercent >= 100
  );

  return {
    videoId: String(row.videoId || ""),
    chapterId: String(row.chapterId || ""),
    chapterOrder: Math.max(1, Math.round(toNumber(row.chapterOrder, 1))),
    chapterTitle: String(row.chapterTitle || ""),
    currentTime: completed && duration > 0 ? duration : currentTime,
    duration,
    progressPercent: completed ? 100 : progressPercent,
    completed,
    lastWatchedAt: row.lastWatchedAt ? String(row.lastWatchedAt) : "",
    createdAt: row.createdAt ? String(row.createdAt) : "",
  };
}

function parseOrderPayload(payload) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;

  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function collectSelectedProductIds(payload) {
  const parsed = parseOrderPayload(payload);
  const ids = new Set();

  if (Array.isArray(parsed.selectedProductIds)) {
    parsed.selectedProductIds.forEach((value) => {
      const productId = toSafeText(value);
      if (productId) ids.add(productId);
    });
  }

  if (Array.isArray(parsed.items)) {
    parsed.items.forEach((item) => {
      const productId = toSafeText(item?.productId);
      if (productId) ids.add(productId);
    });
  }

  const singleProductId = toSafeText(parsed.productId);
  if (singleProductId) {
    ids.add(singleProductId);
  }

  return ids;
}

function parseStudyPeriodDays(periodText) {
  const text = toSafeText(periodText);
  if (!text) return null;

  const lower = text.toLowerCase();
  if (
    lower.includes("무제한") ||
    lower.includes("평생") ||
    lower.includes("unlimited") ||
    lower.includes("lifetime")
  ) {
    return null;
  }

  const match = text.match(/(\d{1,4})/);
  if (!match?.[1]) return null;

  const days = Math.round(toNumber(match[1], 0));
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

function isExpiredByPeriod(startedAt, periodDays) {
  if (!startedAt || !Number.isFinite(periodDays) || periodDays <= 0) return false;
  const startedAtTime = new Date(startedAt).getTime();
  if (!Number.isFinite(startedAtTime)) return false;
  const expiresAtTime = startedAtTime + periodDays * 24 * 60 * 60 * 1000;
  return Date.now() >= expiresAtTime;
}

async function findFirstLearningStartedAt(userId, videoId) {
  const normalizedUserId = toSafeText(userId);
  const normalizedVideoId = toSafeText(videoId);
  if (!normalizedUserId || !normalizedVideoId) return "";

  const [lectureProgress, chapterProgress] = await Promise.all([
    queryOne(
      `SELECT created_at AS createdAt
       FROM academy_progress
       WHERE user_id = ?
         AND video_id = ?
       LIMIT 1`,
      [normalizedUserId, normalizedVideoId]
    ),
    queryOne(
      `SELECT MIN(created_at) AS createdAt
       FROM academy_chapter_progress
       WHERE user_id = ?
         AND video_id = ?`,
      [normalizedUserId, normalizedVideoId]
    ),
  ]);

  const candidates = [lectureProgress?.createdAt, chapterProgress?.createdAt]
    .map((value) => (value ? new Date(value) : null))
    .filter((value) => value && !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return candidates.length ? candidates[0].toISOString() : "";
}

function normalizeCreateChapterPayload(chaptersInput, fallbackVideoPath) {
  const rows = Array.isArray(chaptersInput) ? chaptersInput : [];
  const normalized = [];

  for (const [index, row] of rows.entries()) {
    const videoPath = normalizeAssetPath(row?.videoPath || row?.videoUrl || "");
    if (!videoPath) continue;

    normalized.push({
      chapterOrder: index + 1,
      title: toSafeText(row?.title) || `${index + 1}차시`,
      description: toSafeText(row?.description),
      videoPath,
      durationSec: Math.max(0, Math.round(toNumber(row?.durationSec))),
      isPreview: Boolean(row?.isPreview),
    });
  }

  const normalizedFallbackPath = normalizeAssetPath(fallbackVideoPath);
  if (!normalized.length && normalizedFallbackPath) {
    normalized.push({
      chapterOrder: 1,
      title: "1차시",
      description: "",
      videoPath: normalizedFallbackPath,
      durationSec: 0,
      isPreview: false,
    });
  }

  return normalized.map((chapter, index) => ({
    ...chapter,
    chapterOrder: index + 1,
  }));
}

function createChapterId(videoId, chapterOrder) {
  return `${videoId}-ch-${chapterOrder}`;
}

async function listChapterRowsByVideoIds(videoIds) {
  if (!Array.isArray(videoIds) || !videoIds.length) return [];
  const placeholders = videoIds.map(() => "?").join(", ");

  return query(
    `SELECT
      id,
      video_id AS videoId,
      chapter_order AS chapterOrder,
      title,
      description,
      video_path AS videoUrl,
      duration_sec AS durationSec,
      is_preview AS isPreview,
      created_at AS createdAt
     FROM academy_video_chapters
     WHERE video_id IN (${placeholders})
     ORDER BY video_id ASC, chapter_order ASC`,
    videoIds
  );
}

async function ensureDefaultChapterForVideo(videoId) {
  const normalizedVideoId = toSafeText(videoId);
  if (!normalizedVideoId) return null;

  const chapter = await queryOne(
    `SELECT
      id,
      video_id AS videoId,
      chapter_order AS chapterOrder,
      title,
      description,
      video_path AS videoUrl,
      duration_sec AS durationSec,
      is_preview AS isPreview,
      created_at AS createdAt
     FROM academy_video_chapters
     WHERE video_id = ?
     ORDER BY chapter_order ASC
     LIMIT 1`,
    [normalizedVideoId]
  );

  if (chapter?.id) return normalizeChapterRow(chapter);

  const videoRow = await queryOne(
    `SELECT id, video_path AS videoPath, created_at AS createdAt
     FROM academy_videos
     WHERE id = ?
     LIMIT 1`,
    [normalizedVideoId]
  );

  if (!videoRow?.id) return null;

  const chapterId = createChapterId(normalizedVideoId, 1);
  await query(
    `INSERT INTO academy_video_chapters (
      id,
      video_id,
      chapter_order,
      title,
      description,
      video_path,
      duration_sec,
      is_preview,
      created_at
    ) VALUES (?, ?, 1, '1차시', NULL, ?, 0, 0, COALESCE(?, NOW()))
    ON DUPLICATE KEY UPDATE
      video_path = COALESCE(VALUES(video_path), video_path)`,
    [chapterId, normalizedVideoId, videoRow.videoPath || null, videoRow.createdAt || null]
  );

  const created = await queryOne(
    `SELECT
      id,
      video_id AS videoId,
      chapter_order AS chapterOrder,
      title,
      description,
      video_path AS videoUrl,
      duration_sec AS durationSec,
      is_preview AS isPreview,
      created_at AS createdAt
     FROM academy_video_chapters
     WHERE id = ?
     LIMIT 1`,
    [chapterId]
  );

  return normalizeChapterRow(created || {});
}

async function upsertLectureProgressFromChapterRows(userId, videoId) {
  const normalizedUserId = toSafeText(userId);
  const normalizedVideoId = toSafeText(videoId);
  if (!normalizedUserId || !normalizedVideoId) return null;

  const aggregate = await queryOne(
    `SELECT
      COALESCE(SUM(cp.\`current_time\`), 0) AS totalCurrentTime,
      COALESCE(SUM(cp.duration), 0) AS totalDuration,
      COALESCE(SUM(CASE WHEN cp.completed = 1 THEN 1 ELSE 0 END), 0) AS completedChapterCount,
      MAX(cp.last_watched_at) AS lastWatchedAt
     FROM academy_chapter_progress cp
     WHERE cp.user_id = ?
       AND cp.video_id = ?`,
    [normalizedUserId, normalizedVideoId]
  );

  const chapterCountRow = await queryOne(
    `SELECT COUNT(*) AS chapterCount
     FROM academy_video_chapters
     WHERE video_id = ?`,
    [normalizedVideoId]
  );

  const totalCurrentTime = Math.max(0, Math.round(toNumber(aggregate?.totalCurrentTime)));
  const totalDuration = Math.max(0, Math.round(toNumber(aggregate?.totalDuration)));
  const chapterCount = Math.max(0, Math.round(toNumber(chapterCountRow?.chapterCount)));
  const completedChapterCount = Math.max(0, Math.round(toNumber(aggregate?.completedChapterCount)));

  const fallbackPercent =
    chapterCount > 0 ? Math.round((completedChapterCount / chapterCount) * 100) : 0;
  const progressPercent =
    totalDuration > 0
      ? Math.round((Math.min(totalCurrentTime, totalDuration) / totalDuration) * 100)
      : fallbackPercent;
  const completed = chapterCount > 0 && completedChapterCount >= chapterCount;

  await query(
    `INSERT INTO academy_progress (
      user_id,
      video_id,
      \`current_time\`,
      duration,
      progress_percent,
      completed,
      last_watched_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), NOW())
    ON DUPLICATE KEY UPDATE
      \`current_time\` = VALUES(\`current_time\`),
      duration = VALUES(duration),
      progress_percent = VALUES(progress_percent),
      completed = VALUES(completed),
      last_watched_at = COALESCE(VALUES(last_watched_at), last_watched_at)`,
    [
      normalizedUserId,
      normalizedVideoId,
      completed && totalDuration > 0 ? totalDuration : Math.min(totalCurrentTime, totalDuration || totalCurrentTime),
      totalDuration,
      completed ? 100 : Math.max(0, Math.min(100, progressPercent)),
      completed ? 1 : 0,
      aggregate?.lastWatchedAt || null,
    ]
  );

  const lectureRow = await queryOne(
    `SELECT
      video_id AS videoId,
      \`current_time\` AS currentTime,
      duration,
      progress_percent AS progressPercent,
      completed,
      last_watched_at AS lastWatchedAt,
      created_at AS createdAt
     FROM academy_progress
     WHERE user_id = ? AND video_id = ?
     LIMIT 1`,
    [normalizedUserId, normalizedVideoId]
  );

  return normalizeProgressRow(lectureRow || {});
}

export async function listAcademyVideos() {
  const videoRows = await query(
    `SELECT
      av.id,
      av.product_id AS productId,
      p.name AS title,
      av.instructor,
      av.category,
      av.original_price AS originalPrice,
      av.sale_price AS salePrice,
      av.rating,
      av.reviews,
      av.badge,
      av.image_path AS image,
      av.video_path AS videoUrl,
      av.publish_at AS publishAt,
      p.description,
      p.period
     FROM academy_videos av
     INNER JOIN products p ON p.id = av.product_id
     WHERE av.publish_at IS NULL OR av.publish_at <= NOW()
     ORDER BY av.created_at DESC, av.id DESC`
  );

  const videoIds = videoRows.map((row) => String(row.id || "")).filter(Boolean);
  const chapterRows = await listChapterRowsByVideoIds(videoIds);
  const chapterMap = new Map();

  for (const row of chapterRows) {
    const videoId = String(row.videoId || "");
    if (!videoId) continue;
    const list = chapterMap.get(videoId) || [];
    list.push(row);
    chapterMap.set(videoId, list);
  }

  return videoRows.map((row) => normalizeVideoRow(row, chapterMap.get(String(row.id || "")) || []));
}

export async function listAcademyChaptersByVideoId(videoId) {
  const normalizedVideoId = toSafeText(videoId);
  if (!normalizedVideoId) return [];

  await ensureDefaultChapterForVideo(normalizedVideoId);

  const rows = await query(
    `SELECT
      id,
      video_id AS videoId,
      chapter_order AS chapterOrder,
      title,
      description,
      video_path AS videoUrl,
      duration_sec AS durationSec,
      is_preview AS isPreview,
      created_at AS createdAt
     FROM academy_video_chapters
     WHERE video_id = ?
     ORDER BY chapter_order ASC`,
    [normalizedVideoId]
  );

  return rows.map(normalizeChapterRow);
}

export async function listAcademyInstructors(searchText = "") {
  const normalizedSearch = toSafeText(searchText);
  const likeKeyword = `%${normalizedSearch}%`;

  const rows = normalizedSearch
    ? await query(
        `SELECT DISTINCT instructor
         FROM academy_videos
         WHERE instructor IS NOT NULL
           AND TRIM(instructor) <> ''
           AND instructor LIKE ?
         ORDER BY instructor ASC
         LIMIT 20`,
        [likeKeyword]
      )
    : await query(
        `SELECT DISTINCT instructor
         FROM academy_videos
         WHERE instructor IS NOT NULL
           AND TRIM(instructor) <> ''
         ORDER BY instructor ASC
         LIMIT 30`
      );

  const items = rows
    .map((row) => toSafeText(row?.instructor))
    .filter(Boolean);

  const lowerQuery = normalizedSearch.toLowerCase();
  const exactMatch = Boolean(lowerQuery) && items.some((item) => item.toLowerCase() === lowerQuery);

  return { items, exactMatch };
}

export async function hasAcademyVideoAccess(user, videoId) {
  const normalizedVideoId = toSafeText(videoId);
  if (!user?.id || !normalizedVideoId) return false;

  const userGrade = toSafeText(user.userGrade).toLowerCase();
  const userRole = toSafeText(user.role).toLowerCase();
  const isAdmin = user.isAdmin === true || user.isAdmin === 1 || user.isAdmin === "1";
  if (userGrade === "admin0" || userGrade === "admin1" || userRole === "admin1" || userRole === "admin" || isAdmin) {
    return true;
  }

  const videoRow = await queryOne(
    `SELECT
      av.id,
      av.product_id AS productId,
      p.period
     FROM academy_videos av
     INNER JOIN products p ON p.id = av.product_id
     WHERE av.id = ?
       AND (av.publish_at IS NULL OR av.publish_at <= NOW())
     LIMIT 1`,
    [normalizedVideoId]
  );

  if (!videoRow?.productId) {
    return false;
  }

  const email = toSafeText(user.email).toLowerCase();
  if (!email) return false;

  const orderRows = await query(
    `SELECT payload
     FROM orders
     WHERE customer_email = ?`,
    [email]
  );

  const purchased = orderRows.some((row) => {
    const selectedProductIds = collectSelectedProductIds(row.payload);
    return (
      selectedProductIds.has(String(videoRow.productId)) ||
      selectedProductIds.has(String(videoRow.id))
    );
  });

  if (!purchased) return false;

  const periodDays = parseStudyPeriodDays(videoRow.period);
  if (!periodDays) {
    return true;
  }

  const firstStartedAt = await findFirstLearningStartedAt(user.id, normalizedVideoId);
  if (!firstStartedAt) {
    // 구매만 하고 아직 첫 수강 전이면 기간 카운트 시작 전으로 본다.
    return true;
  }

  return !isExpiredByPeriod(firstStartedAt, periodDays);
}

export async function createAcademyVideo(payload) {
  const explicitId = toSafeText(payload?.id);
  const productId = explicitId || `video-${Date.now()}`;

  const title = toSafeText(payload?.title || payload?.name);
  const description = toSafeText(payload?.description);
  const period = toSafeText(payload?.period) || "무제한 수강";

  const salePrice = Math.max(0, Math.round(toNumber(payload?.salePrice ?? payload?.price)));
  const originalPriceRaw = Math.round(toNumber(payload?.originalPrice, salePrice));
  const originalPrice = Math.max(salePrice, originalPriceRaw);

  const instructor = toSafeText(payload?.instructor) || "ICL Academy";
  const category = normalizeCategory(payload?.category);
  const badge = normalizeBadge(payload?.badge);

  const rating = 0;
  const reviews = 0;

  const imagePath = normalizeAssetPath(payload?.imagePath || payload?.image || "");
  const legacyVideoPath = normalizeAssetPath(payload?.videoPath || payload?.videoUrl || "");
  const chapters = normalizeCreateChapterPayload(payload?.chapters, legacyVideoPath);
  const primaryVideoPath = chapters[0]?.videoPath || "";

  const rawPublishAt = toSafeText(payload?.publishAt);
  const publishAt = toSqlDateTimeString(rawPublishAt);

  if (!title) {
    const error = new Error("강의명을 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  if (!chapters.length || !primaryVideoPath) {
    const error = new Error("최소 1개 이상의 차시 영상이 필요합니다.");
    error.status = 400;
    throw error;
  }

  if (rawPublishAt && !publishAt) {
    const error = new Error("예약 등록일시 형식이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const duplicatedProduct = await queryOne(`SELECT id FROM products WHERE id = ? LIMIT 1`, [productId]);
  if (duplicatedProduct) {
    const error = new Error("이미 사용 중인 강의 ID입니다.");
    error.status = 409;
    throw error;
  }

  let insertedProduct = false;

  try {
    await query(
      `INSERT INTO products (id, name, price, description, period)
       VALUES (?, ?, ?, ?, ?)`,
      [productId, title, salePrice, description || null, period]
    );
    insertedProduct = true;

    await query(
      `INSERT INTO academy_videos (
        id,
        product_id,
        instructor,
        category,
        badge,
        original_price,
        sale_price,
        rating,
        reviews,
        image_path,
        video_path,
        publish_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), NOW())`,
      [
        productId,
        productId,
        instructor,
        category,
        badge,
        originalPrice,
        salePrice,
        rating,
        reviews,
        imagePath || null,
        primaryVideoPath,
        publishAt || null,
      ]
    );

    for (const chapter of chapters) {
      await query(
        `INSERT INTO academy_video_chapters (
          id,
          video_id,
          chapter_order,
          title,
          description,
          video_path,
          duration_sec,
          is_preview,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          createChapterId(productId, chapter.chapterOrder),
          productId,
          chapter.chapterOrder,
          chapter.title,
          chapter.description || null,
          chapter.videoPath,
          chapter.durationSec,
          chapter.isPreview ? 1 : 0,
        ]
      );
    }
  } catch (error) {
    if (insertedProduct) {
      await query(`DELETE FROM products WHERE id = ?`, [productId]).catch(() => null);
    }
    throw error;
  }

  const row = await queryOne(
    `SELECT
      av.id,
      av.product_id AS productId,
      p.name AS title,
      av.instructor,
      av.category,
      av.original_price AS originalPrice,
      av.sale_price AS salePrice,
      av.rating,
      av.reviews,
      av.badge,
      av.image_path AS image,
      av.video_path AS videoUrl,
      av.publish_at AS publishAt,
      p.description,
      p.period
     FROM academy_videos av
     INNER JOIN products p ON p.id = av.product_id
     WHERE av.id = ?
     LIMIT 1`,
    [productId]
  );

  const chapterRows = await query(
    `SELECT
      id,
      video_id AS videoId,
      chapter_order AS chapterOrder,
      title,
      description,
      video_path AS videoUrl,
      duration_sec AS durationSec,
      is_preview AS isPreview,
      created_at AS createdAt
     FROM academy_video_chapters
     WHERE video_id = ?
     ORDER BY chapter_order ASC`,
    [productId]
  );

  return normalizeVideoRow(row || {}, chapterRows);
}

export async function updateAcademyVideo(videoId, payload) {
  const normalizedVideoId = toSafeText(videoId);
  if (!normalizedVideoId) {
    const error = new Error("강의 ID가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const existing = await queryOne(
    `SELECT av.id, av.product_id AS productId FROM academy_videos av WHERE av.id = ? LIMIT 1`,
    [normalizedVideoId]
  );
  if (!existing) {
    const error = new Error("존재하지 않는 강의입니다.");
    error.status = 404;
    throw error;
  }

  const title = toSafeText(payload?.title || payload?.name);
  if (!title) {
    const error = new Error("강의명을 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const description = toSafeText(payload?.description);
  const period = toSafeText(payload?.period) || "무제한 수강";
  const salePrice = Math.max(0, Math.round(toNumber(payload?.salePrice ?? payload?.price)));
  const originalPriceRaw = Math.round(toNumber(payload?.originalPrice, salePrice));
  const originalPrice = Math.max(salePrice, originalPriceRaw);
  const instructor = toSafeText(payload?.instructor) || "ICL Academy";
  const category = normalizeCategory(payload?.category);
  const badge = normalizeBadge(payload?.badge);
  const imagePath = normalizeAssetPath(payload?.imagePath || payload?.image || "");
  const rawPublishAt = toSafeText(payload?.publishAt);
  const publishAt = rawPublishAt ? toSqlDateTimeString(rawPublishAt) : "";

  if (rawPublishAt && !publishAt) {
    const error = new Error("예약 등록일시 형식이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  await query(
    `UPDATE products SET name = ?, price = ?, description = ?, period = ? WHERE id = ?`,
    [title, salePrice, description || null, period, existing.productId]
  );

  const setClauses = [
    "instructor = ?",
    "category = ?",
    "badge = ?",
    "original_price = ?",
    "sale_price = ?",
    "publish_at = ?",
  ];
  const setValues = [instructor, category, badge, originalPrice, salePrice, publishAt || null];

  if (imagePath) {
    setClauses.push("image_path = ?");
    setValues.push(imagePath);
  }

  setValues.push(normalizedVideoId);
  await query(
    `UPDATE academy_videos SET ${setClauses.join(", ")} WHERE id = ?`,
    setValues
  );

  const row = await queryOne(
    `SELECT
      av.id,
      av.product_id AS productId,
      p.name AS title,
      av.instructor,
      av.category,
      av.original_price AS originalPrice,
      av.sale_price AS salePrice,
      av.rating,
      av.reviews,
      av.badge,
      av.image_path AS image,
      av.video_path AS videoUrl,
      av.publish_at AS publishAt,
      p.description,
      p.period
     FROM academy_videos av
     INNER JOIN products p ON p.id = av.product_id
     WHERE av.id = ?
     LIMIT 1`,
    [normalizedVideoId]
  );

  const chapterRows = await query(
    `SELECT
      id,
      video_id AS videoId,
      chapter_order AS chapterOrder,
      title,
      description,
      video_path AS videoUrl,
      duration_sec AS durationSec,
      is_preview AS isPreview,
      created_at AS createdAt
     FROM academy_video_chapters
     WHERE video_id = ?
     ORDER BY chapter_order ASC`,
    [normalizedVideoId]
  );

  return normalizeVideoRow(row || {}, chapterRows);
}

export async function deleteAcademyVideo(videoId) {
  const normalizedVideoId = toSafeText(videoId);
  if (!normalizedVideoId) {
    const error = new Error("강의 ID가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const existing = await queryOne(
    `SELECT id, product_id AS productId FROM academy_videos WHERE id = ? LIMIT 1`,
    [normalizedVideoId]
  );
  if (!existing) {
    const error = new Error("존재하지 않는 강의입니다.");
    error.status = 404;
    throw error;
  }

  // products 삭제 시 ON DELETE CASCADE로 academy_videos, academy_video_chapters 함께 삭제됨
  await query(`DELETE FROM products WHERE id = ?`, [existing.productId]);

  return { id: normalizedVideoId };
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

  if (kind === "video") return ".mp4";
  return ".jpg";
}

export async function saveAcademyAsset({ kind, fileName, mimeType, buffer }) {
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
  const targetDir = path.resolve(UPLOAD_ROOT, kind === "video" ? "videos" : "images");
  await mkdir(targetDir, { recursive: true });

  const savedName = `${Date.now()}-${randomUUID()}${extension}`;
  const targetPath = path.resolve(targetDir, savedName);
  await writeFile(targetPath, buffer);

  return `/uploads/academy/${kind === "video" ? "videos" : "images"}/${savedName}`;
}

export async function listAcademyProgressByUserId(userId) {
  const normalizedUserId = toSafeText(userId);
  if (!normalizedUserId) return [];

  const rows = await query(
    `SELECT
      video_id AS videoId,
      \`current_time\` AS currentTime,
      duration,
      progress_percent AS progressPercent,
      completed,
      last_watched_at AS lastWatchedAt,
      created_at AS createdAt
     FROM academy_progress
     WHERE user_id = ?
     ORDER BY last_watched_at DESC, video_id ASC`,
    [normalizedUserId]
  );

  return rows.map(normalizeProgressRow);
}

export async function listAcademyChapterProgressByUserId(userId, videoId = "") {
  const normalizedUserId = toSafeText(userId);
  const normalizedVideoId = toSafeText(videoId);
  if (!normalizedUserId) return [];

  const rows = await query(
    `SELECT
      cp.video_id AS videoId,
      cp.chapter_id AS chapterId,
      chapter.chapter_order AS chapterOrder,
      chapter.title AS chapterTitle,
      cp.\`current_time\` AS currentTime,
      cp.duration,
      cp.progress_percent AS progressPercent,
      cp.completed,
      cp.last_watched_at AS lastWatchedAt,
      cp.created_at AS createdAt
     FROM academy_chapter_progress cp
     INNER JOIN academy_video_chapters chapter ON chapter.id = cp.chapter_id
     WHERE cp.user_id = ?
       AND (? = '' OR cp.video_id = ?)
     ORDER BY cp.last_watched_at DESC, cp.video_id ASC, chapter.chapter_order ASC`,
    [normalizedUserId, normalizedVideoId, normalizedVideoId]
  );

  return rows.map(normalizeChapterProgressRow);
}

export async function saveAcademyChapterProgress({
  userId,
  videoId,
  chapterId,
  currentTime,
  duration,
  completed,
}) {
  const normalizedUserId = toSafeText(userId);
  const normalizedVideoId = toSafeText(videoId);
  const normalizedChapterId = toSafeText(chapterId);

  if (!normalizedUserId || !normalizedVideoId) {
    const error = new Error("학습 진도를 저장할 대상 정보가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const targetVideo = await queryOne(
    `SELECT id
     FROM academy_videos
     WHERE id = ?
     LIMIT 1`,
    [normalizedVideoId]
  );

  if (!targetVideo?.id) {
    const error = new Error("대상 강의를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  await ensureDefaultChapterForVideo(normalizedVideoId);

  const chapter = normalizedChapterId
    ? await queryOne(
        `SELECT
          id,
          video_id AS videoId,
          chapter_order AS chapterOrder,
          title,
          description,
          video_path AS videoUrl,
          duration_sec AS durationSec,
          is_preview AS isPreview,
          created_at AS createdAt
         FROM academy_video_chapters
         WHERE id = ?
           AND video_id = ?
         LIMIT 1`,
        [normalizedChapterId, normalizedVideoId]
      )
    : await queryOne(
        `SELECT
          id,
          video_id AS videoId,
          chapter_order AS chapterOrder,
          title,
          description,
          video_path AS videoUrl,
          duration_sec AS durationSec,
          is_preview AS isPreview,
          created_at AS createdAt
         FROM academy_video_chapters
         WHERE video_id = ?
         ORDER BY chapter_order ASC
         LIMIT 1`,
        [normalizedVideoId]
      );

  if (!chapter?.id) {
    const error = new Error("저장할 차시 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  const chapterDurationSec = Math.max(0, Math.round(toNumber(chapter.durationSec)));
  const safeDuration = Math.max(0, Math.round(toNumber(duration, chapterDurationSec)));

  let safeCurrentTime = Math.max(0, Math.round(toNumber(currentTime)));
  if (safeDuration > 0) {
    safeCurrentTime = Math.min(safeCurrentTime, safeDuration);
  }

  const isCompleted =
    completed === true ||
    completed === 1 ||
    completed === "1" ||
    (safeDuration > 0 && safeCurrentTime >= Math.floor(safeDuration * 0.97));

  const progressPercent = safeDuration > 0 ? Math.round((safeCurrentTime / safeDuration) * 100) : 0;

  await query(
    `INSERT INTO academy_chapter_progress (
      user_id,
      video_id,
      chapter_id,
      \`current_time\`,
      duration,
      progress_percent,
      completed,
      last_watched_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      video_id = VALUES(video_id),
      \`current_time\` = VALUES(\`current_time\`),
      duration = VALUES(duration),
      progress_percent = VALUES(progress_percent),
      completed = VALUES(completed),
      last_watched_at = NOW()`,
    [
      normalizedUserId,
      normalizedVideoId,
      chapter.id,
      isCompleted && safeDuration > 0 ? safeDuration : safeCurrentTime,
      safeDuration,
      isCompleted ? 100 : Math.max(0, Math.min(100, progressPercent)),
      isCompleted ? 1 : 0,
    ]
  );

  const chapterProgressRow = await queryOne(
    `SELECT
      cp.video_id AS videoId,
      cp.chapter_id AS chapterId,
      chapter.chapter_order AS chapterOrder,
      chapter.title AS chapterTitle,
      cp.\`current_time\` AS currentTime,
      cp.duration,
      cp.progress_percent AS progressPercent,
      cp.completed,
      cp.last_watched_at AS lastWatchedAt,
      cp.created_at AS createdAt
     FROM academy_chapter_progress cp
     INNER JOIN academy_video_chapters chapter ON chapter.id = cp.chapter_id
     WHERE cp.user_id = ?
       AND cp.chapter_id = ?
     LIMIT 1`,
    [normalizedUserId, chapter.id]
  );

  const lectureProgress = await upsertLectureProgressFromChapterRows(normalizedUserId, normalizedVideoId);

  return {
    ...normalizeChapterProgressRow(chapterProgressRow || {}),
    lectureProgress,
  };
}

export async function saveAcademyProgress({
  userId,
  videoId,
  chapterId,
  currentTime,
  duration,
  completed,
}) {
  const chapterProgress = await saveAcademyChapterProgress({
    userId,
    videoId,
    chapterId,
    currentTime,
    duration,
    completed,
  });

  return chapterProgress.lectureProgress || {
    videoId: toSafeText(videoId),
    currentTime: Math.max(0, Math.round(toNumber(currentTime))),
    duration: Math.max(0, Math.round(toNumber(duration))),
    progressPercent: 0,
    completed: false,
    lastWatchedAt: "",
    createdAt: "",
  };
}

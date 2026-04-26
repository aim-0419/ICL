// 파일 역할: 아카데미 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../../shared/db/mysql.js";
import { syncChapterVideoNames } from "./asset.service.js";


const CATEGORY_SET = new Set(["입문", "초급", "중급", "고급"]);
const BADGE_SET = new Set(["", "New", "Hot"]);

// 함수 역할: number 값으로 안전하게 변환합니다.
function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// 함수 역할: 안전한 텍스트 값으로 안전하게 변환합니다.
function toSafeText(value) {
  return String(value || "").trim();
}

// 함수 역할: SQL 날짜 시간 string 값으로 안전하게 변환합니다.
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

// 함수 역할: category 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeCategory(value) {
  const category = toSafeText(value);
  if (CATEGORY_SET.has(category)) return category;
  return "입문";
}

// 함수 역할: badge 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeBadge(value) {
  const badge = toSafeText(value);
  if (BADGE_SET.has(badge)) return badge;
  return "";
}

// 함수 역할: 업로드 파일 경로 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
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

// 함수 역할: 차시 row 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
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

// 함수 역할: 강의 영상 row 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
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
    category: normalizeCategory(row.category),
    originalPrice: toNumber(row.originalPrice),
    salePrice: toNumber(row.salePrice),
    rating: toNumber(row.rating),
    reviews: Math.max(0, Math.round(toNumber(row.reviews))),
    badge: String(row.badge || ""),
    image: String(row.image || ""),
    videoUrl: String(row.videoUrl || firstChapter?.videoUrl || ""),
    publishAt: String(row.publishAt || ""),
    isHidden: Boolean(row.isHidden === 1 || row.isHidden === true || row.isHidden === "1"),
    description: String(row.description || ""),
    period: String(row.period || ""),
    chapterCount: normalizedChapters.length,
    chapters: normalizedChapters,
  };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_AUTOCORRECT_FUTURE_MS = 12 * 60 * 60 * 1000;

// 함수 역할: 날짜 시간 for client 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeDateTimeForClient(value) {
  if (!value) return "";

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return toSafeText(value);
  }

  let timeMs = parsed.getTime();
  const futureGapMs = timeMs - Date.now();
  // 일부 환경에서 DATETIME이 UTC로 해석되어 KST 기준으로 미래 시각처럼 보이는 값을 보정
  if (futureGapMs > FUTURE_TOLERANCE_MS && futureGapMs <= MAX_AUTOCORRECT_FUTURE_MS) {
    timeMs -= KST_OFFSET_MS;
  }

  return new Date(timeMs).toISOString();
}

// 함수 역할: 학습 진도 row 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
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
    lastWatchedAt: normalizeDateTimeForClient(row.lastWatchedAt),
    createdAt: normalizeDateTimeForClient(row.createdAt),
  };
}

// 함수 역할: 차시 학습 진도 row 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
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
    lastWatchedAt: normalizeDateTimeForClient(row.lastWatchedAt),
    createdAt: normalizeDateTimeForClient(row.createdAt),
  };
}

// 함수 역할: 주문 요청 데이터 문자열이나 페이로드를 코드에서 쓰기 쉬운 구조로 파싱합니다.
function parseOrderPayload(payload) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;

  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

// 함수 역할: cancelled 상품 ids 문자열이나 페이로드를 코드에서 쓰기 쉬운 구조로 파싱합니다.
function parseCancelledProductIds(value) {
  if (!value) return new Set();
  try {
    const arr = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(toSafeText).filter(Boolean));
  } catch {
    return new Set();
  }
}

// 함수 역할: duplicated scheduled 강의 영상 대상을 탐색해 반환합니다.
async function findDuplicatedScheduledVideo({
  title,
  instructor,
  publishAt,
  excludeVideoId = "",
}) {
  const normalizedTitle = toSafeText(title);
  const normalizedInstructor = toSafeText(instructor);
  const normalizedPublishAt = toSafeText(publishAt);
  const normalizedExcludeVideoId = toSafeText(excludeVideoId);

  if (!normalizedTitle || !normalizedInstructor || !normalizedPublishAt) {
    return null;
  }

  return queryOne(
    `SELECT
      av.id,
      p.name AS title,
      av.instructor,
      av.publish_at AS publishAt
     FROM academy_videos av
     INNER JOIN products p ON p.id = av.product_id
     WHERE p.name = ?
       AND av.instructor = ?
       AND av.publish_at = ?
       AND (? = '' OR av.id <> ?)
     LIMIT 1`,
    [normalizedTitle, normalizedInstructor, normalizedPublishAt, normalizedExcludeVideoId, normalizedExcludeVideoId]
  );
}

// 함수 역할: 선택된 상품 ids 항목을 모아 반환합니다.
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

// 함수 역할: study 기간 days 문자열이나 페이로드를 코드에서 쓰기 쉬운 구조로 파싱합니다.
function parseStudyPeriodDays(periodText) {
  const text = toSafeText(periodText);
  if (!text) return null;

  if (/무제한|평생|unlimited|lifetime/i.test(text)) {
    return null;
  }

  const match = text.match(/(\d{1,4})/);
  if (!match?.[1]) return null;

  const days = Math.round(toNumber(match[1], 0));
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

// 함수 역할: 만료된 by 기간 조건에 해당하는지 참/거짓으로 판별합니다.
function isExpiredByPeriod(startedAt, periodDays) {
  if (!startedAt || !Number.isFinite(periodDays) || periodDays <= 0) return false;
  const startedAtTime = new Date(startedAt).getTime();
  if (!Number.isFinite(startedAtTime)) return false;
  const expiresAtTime = startedAtTime + periodDays * 24 * 60 * 60 * 1000;
  return Date.now() >= expiresAtTime;
}

// 함수 역할: first 학습 started at 대상을 탐색해 반환합니다.
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

// 함수 역할: create 차시 요청 데이터 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeCreateChapterPayload(chaptersInput, fallbackVideoPath) {
  const rows = Array.isArray(chaptersInput) ? chaptersInput : [];
  const normalized = [];

  for (const [index, row] of rows.entries()) {
    const videoPath = normalizeAssetPath(row?.videoPath || row?.videoUrl || "");
    if (!videoPath) continue;

    normalized.push({
      chapterOrder: index + 1,
      title: toSafeText(row?.title) || `${index + 1}李⑥떆`,
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
      title: "1李⑥떆",
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

// 함수 역할: update 차시 요청 데이터 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeUpdateChapterPayload(chaptersInput, existingChapters, fallbackVideoPath) {
  const rows = Array.isArray(chaptersInput) ? chaptersInput : [];
  const existingRows = Array.isArray(existingChapters) ? existingChapters : [];
  const existingById = new Map(
    existingRows
      .map((chapter) => [toSafeText(chapter?.id), chapter])
      .filter(([id]) => Boolean(id))
  );
  const normalized = [];

  for (const [index, row] of rows.entries()) {
    const requestedId = toSafeText(row?.id || row?.chapterId);
    const existing = requestedId ? existingById.get(requestedId) : null;
    const nextVideoPath =
      normalizeAssetPath(row?.videoPath || row?.videoUrl || "") ||
      normalizeAssetPath(existing?.videoUrl || "");
    if (!nextVideoPath) continue;

    const title = toSafeText(row?.title) || toSafeText(existing?.title) || `${index + 1}李⑥떆`;
    const description =
      row && Object.prototype.hasOwnProperty.call(row, "description")
        ? toSafeText(row?.description)
        : toSafeText(existing?.description);
    const durationSec =
      row && Object.prototype.hasOwnProperty.call(row, "durationSec")
        ? Math.max(0, Math.round(toNumber(row?.durationSec)))
        : Math.max(0, Math.round(toNumber(existing?.durationSec)));
    const isPreview =
      row && Object.prototype.hasOwnProperty.call(row, "isPreview")
        ? Boolean(row?.isPreview)
        : Boolean(existing?.isPreview);

    normalized.push({
      id: existing?.id || "",
      chapterOrder: index + 1,
      title,
      description,
      videoPath: nextVideoPath,
      durationSec,
      isPreview,
    });
  }

  const normalizedFallbackPath = normalizeAssetPath(fallbackVideoPath);
  if (!normalized.length && normalizedFallbackPath) {
    normalized.push({
      id: "",
      chapterOrder: 1,
      title: "1李⑥떆",
      description: "",
      videoPath: normalizedFallbackPath,
      durationSec: 0,
      isPreview: false,
    });
  }

  return normalized.map((chapter, index) => ({
    ...chapter,
    chapterOrder: index + 1,
    title: toSafeText(chapter.title) || `${index + 1}李⑥떆`,
  }));
}

// 함수 역할: 차시 ID 데이터를 새로 생성합니다.
function createChapterId(videoId, chapterOrder) {
  return `${videoId}-ch-${chapterOrder}`;
}

// 함수 역할: unique 차시 ID 데이터를 새로 생성합니다.
function createUniqueChapterId(videoId, chapterOrder, reservedIds) {
  const base = createChapterId(videoId, chapterOrder);
  if (!reservedIds.has(base)) return base;

  let suffix = 2;
  while (true) {
    const next = `${base}-${suffix}`.slice(0, 120);
    if (!reservedIds.has(next)) return next;
    suffix += 1;
  }
}

// 함수 역할: upsertAcademyVideoChapters 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
async function upsertAcademyVideoChapters(videoId, chapters, existingChapters = []) {
  const normalizedVideoId = toSafeText(videoId);
  const rows = Array.isArray(chapters) ? chapters : [];
  if (!normalizedVideoId || !rows.length) return;

  const existingRows = Array.isArray(existingChapters) ? existingChapters : [];
  const existingById = new Map(
    existingRows
      .map((chapter) => [toSafeText(chapter?.id), chapter])
      .filter(([id]) => Boolean(id))
  );
  const reservedIds = new Set(existingById.keys());
  const keptIds = new Set();

  // chapter_order unique 충돌을 피하기 위해 기존 순서를 안전 구간으로 먼저 이동
  await query(
    `UPDATE academy_video_chapters
     SET chapter_order = chapter_order + 1000
     WHERE video_id = ?`,
    [normalizedVideoId]
  );

  for (const chapter of rows) {
    const currentOrder = Math.max(1, Math.round(toNumber(chapter?.chapterOrder, 1)));
    const title = toSafeText(chapter?.title) || `${currentOrder}李⑥떆`;
    const description = toSafeText(chapter?.description);
    const videoPath = normalizeAssetPath(chapter?.videoPath || chapter?.videoUrl || "");
    if (!videoPath) continue;

    const durationSec = Math.max(0, Math.round(toNumber(chapter?.durationSec)));
    const isPreview = Boolean(chapter?.isPreview);

    let chapterId = toSafeText(chapter?.id || chapter?.chapterId);
    const hasExisting = chapterId && existingById.has(chapterId) && !keptIds.has(chapterId);
    if (!hasExisting) {
      chapterId = createUniqueChapterId(normalizedVideoId, currentOrder, reservedIds);
    }

    reservedIds.add(chapterId);
    keptIds.add(chapterId);

    if (existingById.has(chapterId)) {
      await query(
        `UPDATE academy_video_chapters
         SET chapter_order = ?,
             title = ?,
             description = ?,
             video_path = ?,
             duration_sec = ?,
             is_preview = ?
         WHERE id = ?
           AND video_id = ?`,
        [
          currentOrder,
          title,
          description || null,
          videoPath,
          durationSec,
          isPreview ? 1 : 0,
          chapterId,
          normalizedVideoId,
        ]
      );
    } else {
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
          chapterId,
          normalizedVideoId,
          currentOrder,
          title,
          description || null,
          videoPath,
          durationSec,
          isPreview ? 1 : 0,
        ]
      );
    }
  }

  const removableIds = [...existingById.keys()].filter((id) => !keptIds.has(id));
  if (removableIds.length) {
    const placeholders = removableIds.map(() => "?").join(", ");
    await query(
      `DELETE FROM academy_video_chapters
       WHERE video_id = ?
         AND id IN (${placeholders})`,
      [normalizedVideoId, ...removableIds]
    );
  }
}

// 함수 역할: 차시 rows by 강의 영상 ids 목록을 조회해 반환합니다.
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

// 함수 역할: 기본값 차시 for 강의 영상 상태가 없을 때 생성해 항상 존재하도록 보장합니다.
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
    ) VALUES (?, ?, 1, '1李⑥떆', NULL, ?, 0, 0, COALESCE(?, NOW()))
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

// 함수 역할: 차시별 진도를 합산해 강의 전체 진도 행을 생성하거나 갱신합니다.
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
    ) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, UTC_TIMESTAMP()), UTC_TIMESTAMP())
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

// 함수 역할: 노출 가능한 강의와 차시 목록을 조회해 화면 표시용 데이터로 반환합니다.
export async function listAcademyVideos({ includeHidden = false, includeUnpublished = false } = {}) {
  const whereClauses = [];
  if (!includeUnpublished) {
    whereClauses.push("(av.publish_at IS NULL OR av.publish_at <= NOW())");
  }
  if (!includeHidden) {
    whereClauses.push("COALESCE(av.is_hidden, 0) = 0");
  }
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

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
      av.is_hidden AS isHidden,
      p.description,
      p.period
     FROM academy_videos av
     INNER JOIN products p ON p.id = av.product_id
     ${whereSql}
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

// 함수 역할: publishDueAcademyVideosBySchedule 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function publishDueAcademyVideosBySchedule({ limit = 100 } = {}) {
  const normalizedLimit = Math.min(500, Math.max(1, Math.round(toNumber(limit, 100))));

  const dueRows = await query(
    `SELECT
      av.id,
      p.name AS title,
      av.publish_at AS publishAt
     FROM academy_videos av
     INNER JOIN products p ON p.id = av.product_id
     WHERE av.publish_at IS NOT NULL
       AND av.publish_at > av.created_at
       AND av.publish_at <= NOW()
     ORDER BY av.publish_at ASC, av.id ASC
     LIMIT ${normalizedLimit}`
  );

  if (!dueRows.length) {
    return { publishedCount: 0, videos: [] };
  }

  const ids = dueRows.map((row) => toSafeText(row.id)).filter(Boolean);
  if (!ids.length) {
    return { publishedCount: 0, videos: [] };
  }

  const placeholders = ids.map(() => "?").join(", ");
  await query(`UPDATE academy_videos SET publish_at = NULL WHERE id IN (${placeholders})`, ids);

  return {
    publishedCount: ids.length,
    videos: dueRows.map((row) => ({
      id: toSafeText(row.id),
      title: toSafeText(row.title),
      publishAt: row.publishAt ? String(row.publishAt) : "",
    })),
  };
}

// 함수 역할: 아카데미 강의 영상 visible for 공개 조건에 해당하는지 참/거짓으로 판별합니다.
export async function isAcademyVideoVisibleForPublic(videoId) {
  const normalizedVideoId = toSafeText(videoId);
  if (!normalizedVideoId) return false;

  const row = await queryOne(
    `SELECT id
     FROM academy_videos
     WHERE id = ?
       AND (publish_at IS NULL OR publish_at <= NOW())
       AND COALESCE(is_hidden, 0) = 0
     LIMIT 1`,
    [normalizedVideoId]
  );

  return Boolean(row?.id);
}

// 함수 역할: 아카데미 차시 by 강의 영상 ID 목록을 조회해 반환합니다.
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

// 함수 역할: 아카데미 영상 재생 차시 데이터를 조회해 호출자에게 반환합니다.
export async function getAcademyPlaybackChapter(videoId, chapterId = "") {
  const normalizedVideoId = toSafeText(videoId);
  const normalizedChapterId = toSafeText(chapterId);
  if (!normalizedVideoId) return null;

  await ensureDefaultChapterForVideo(normalizedVideoId);

  const row = normalizedChapterId
    ? await queryOne(
        `SELECT
          chapter.id AS chapterId,
          chapter.video_id AS videoId,
          chapter.chapter_order AS chapterOrder,
          chapter.title AS chapterTitle,
          chapter.description AS chapterDescription,
         chapter.video_path AS chapterVideoUrl,
         chapter.duration_sec AS durationSec,
         chapter.is_preview AS isPreview,
         chapter.created_at AS chapterCreatedAt,
          av.video_path AS lectureVideoUrl,
          p.name AS lectureTitle
         FROM academy_video_chapters chapter
         INNER JOIN academy_videos av ON av.id = chapter.video_id
         INNER JOIN products p ON p.id = av.product_id
         WHERE chapter.video_id = ?
           AND chapter.id = ?
         LIMIT 1`,
        [normalizedVideoId, normalizedChapterId]
      )
    : await queryOne(
        `SELECT
          chapter.id AS chapterId,
          chapter.video_id AS videoId,
          chapter.chapter_order AS chapterOrder,
          chapter.title AS chapterTitle,
          chapter.description AS chapterDescription,
          chapter.video_path AS chapterVideoUrl,
          chapter.duration_sec AS durationSec,
          chapter.is_preview AS isPreview,
          chapter.created_at AS chapterCreatedAt,
          av.video_path AS lectureVideoUrl,
          p.name AS lectureTitle
         FROM academy_video_chapters chapter
         INNER JOIN academy_videos av ON av.id = chapter.video_id
         INNER JOIN products p ON p.id = av.product_id
         WHERE chapter.video_id = ?
         ORDER BY chapter.chapter_order ASC
         LIMIT 1`,
        [normalizedVideoId]
      );

  if (!row?.chapterId) return null;

  const chapterVideoUrl = normalizeAssetPath(row.chapterVideoUrl);
  const lectureVideoUrl = normalizeAssetPath(row.lectureVideoUrl);

  return {
    id: String(row.chapterId || ""),
    videoId: String(row.videoId || normalizedVideoId),
    chapterOrder: Math.max(1, Math.round(toNumber(row.chapterOrder, 1))),
    title: String(row.chapterTitle || ""),
    lectureTitle: String(row.lectureTitle || ""),
    description: String(row.chapterDescription || ""),
    videoUrl: chapterVideoUrl || lectureVideoUrl,
    durationSec: Math.max(0, Math.round(toNumber(row.durationSec))),
    isPreview: Boolean(row.isPreview === 1 || row.isPreview === true || row.isPreview === "1"),
    createdAt: row.chapterCreatedAt ? String(row.chapterCreatedAt) : "",
  };
}

// 함수 역할: 아카데미 강사 목록을 조회해 반환합니다.
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

// 함수 역할: 아카데미 강의 영상 access 존재 여부를 참/거짓으로 판별합니다.
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
       AND COALESCE(av.is_hidden, 0) = 0
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
    `SELECT payload, cancelled_product_ids AS cancelledProductIds
     FROM orders
     WHERE customer_email = ?`,
    [email]
  );

  const purchased = orderRows.some((row) => {
    const selectedProductIds = collectSelectedProductIds(row.payload);
    const cancelledIds = parseCancelledProductIds(row.cancelledProductIds);
    const targetProductId = String(videoRow.productId);
    const targetVideoId = String(videoRow.id);
    return (
      (selectedProductIds.has(targetProductId) && !cancelledIds.has(targetProductId)) ||
      (selectedProductIds.has(targetVideoId) && !cancelledIds.has(targetVideoId))
    );
  });

  if (!purchased) {
    const grantRows = await query(
      `SELECT id FROM video_grants
       WHERE user_id = ? AND video_id = ?
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [String(user.id || ""), normalizedVideoId]
    );
    if (!Array.isArray(grantRows) || grantRows.length === 0) return false;
    return true;
  }

  const periodDays = parseStudyPeriodDays(videoRow.period);
  if (!periodDays) {
    return true;
  }

  const firstStartedAt = await findFirstLearningStartedAt(user.id, normalizedVideoId);
  if (!firstStartedAt) {
    // 구매만 하고 아직 첫 수강 전이면 수강기간 카운트 시작 전으로 본다.
    return true;
  }

  return !isExpiredByPeriod(firstStartedAt, periodDays);
}

// 함수 역할: 아카데미 미리보기 차시 access 존재 여부를 참/거짓으로 판별합니다.
export async function hasAcademyPreviewChapterAccess(videoId, chapterId = "") {
  const normalizedVideoId = toSafeText(videoId);
  const normalizedChapterId = toSafeText(chapterId);
  if (!normalizedVideoId) return false;

  const previewChapter = normalizedChapterId
    ? await queryOne(
        `SELECT chapter.id
         FROM academy_video_chapters chapter
         INNER JOIN academy_videos av ON av.id = chapter.video_id
          WHERE chapter.video_id = ?
            AND chapter.id = ?
            AND chapter.is_preview = 1
            AND COALESCE(av.is_hidden, 0) = 0
            AND (av.publish_at IS NULL OR av.publish_at <= NOW())
          LIMIT 1`,
        [normalizedVideoId, normalizedChapterId]
      )
    : await queryOne(
        `SELECT chapter.id
         FROM academy_video_chapters chapter
         INNER JOIN academy_videos av ON av.id = chapter.video_id
          WHERE chapter.video_id = ?
            AND chapter.is_preview = 1
            AND COALESCE(av.is_hidden, 0) = 0
            AND (av.publish_at IS NULL OR av.publish_at <= NOW())
          LIMIT 1`,
        [normalizedVideoId]
      );

  return Boolean(previewChapter?.id);
}

// 함수 역할: 관리자 입력값을 검증한 뒤 상품, 강의, 차시 데이터를 새로 등록합니다.
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
    const error = new Error("최소 1개 이상의 차시 영상을 등록해 주세요.");
    error.status = 400;
    throw error;
  }

  if (rawPublishAt && !publishAt) {
    const error = new Error("예약 등록일시 형식이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  if (publishAt) {
    const duplicatedScheduled = await findDuplicatedScheduledVideo({
      title,
      instructor,
      publishAt,
    });
    if (duplicatedScheduled?.id) {
      const error = new Error("같은 강사/커리큘럼/예약시간으로 이미 등록된 항목이 있습니다.");
      error.status = 409;
      throw error;
    }
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
        is_hidden,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), 0, NOW())`,
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
      av.is_hidden AS isHidden,
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

// 함수 역할: 기존 강의의 상품 정보, 노출 정보, 차시 목록을 수정합니다.
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

  const existingChapterRows = await query(
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
  const existingChapters = existingChapterRows.map(normalizeChapterRow);

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
  const explicitVideoPath = normalizeAssetPath(payload?.videoPath || payload?.videoUrl || "");

  const hasChapterField = Object.prototype.hasOwnProperty.call(payload || {}, "chapters");
  if (hasChapterField && !Array.isArray(payload?.chapters)) {
    const error = new Error("차시 목록 형식이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const nextChapters = hasChapterField
    ? normalizeUpdateChapterPayload(
        payload?.chapters,
        existingChapters,
        explicitVideoPath || existingChapters[0]?.videoUrl || ""
      )
    : [];

  if (hasChapterField && !nextChapters.length) {
    const error = new Error("최소 1개 이상의 차시 영상을 등록해 주세요.");
    error.status = 400;
    throw error;
  }

  const primaryVideoPath = hasChapterField
    ? normalizeAssetPath(nextChapters[0]?.videoPath || "")
    : explicitVideoPath;

  if (rawPublishAt && !publishAt) {
    const error = new Error("예약 등록일시 형식이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  if (publishAt) {
    const duplicatedScheduled = await findDuplicatedScheduledVideo({
      title,
      instructor,
      publishAt,
      excludeVideoId: normalizedVideoId,
    });
    if (duplicatedScheduled?.id) {
      const error = new Error("같은 강사/커리큘럼/예약시간으로 이미 등록된 항목이 있습니다.");
      error.status = 409;
      throw error;
    }
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
  if (primaryVideoPath) {
    setClauses.push("video_path = ?");
    setValues.push(primaryVideoPath);
  }

  setValues.push(normalizedVideoId);
  await query(
    `UPDATE academy_videos SET ${setClauses.join(", ")} WHERE id = ?`,
    setValues
  );

  if (hasChapterField) {
    await syncChapterVideoNames(normalizedVideoId, nextChapters);
    await upsertAcademyVideoChapters(normalizedVideoId, nextChapters, existingChapters);
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
      av.is_hidden AS isHidden,
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

// 함수 역할: 강의와 연결 상품을 삭제해 관련 차시도 함께 정리합니다.
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

  // products 삭제 시 ON DELETE CASCADE로 academy_videos, academy_video_chapters가 함께 삭제됨
  await query(`DELETE FROM products WHERE id = ?`, [existing.productId]);

  return { id: normalizedVideoId };
}

// 함수 역할: 강의의 숨김/노출 상태를 변경합니다.
export async function setAcademyVideoHidden(videoId, isHidden) {
  const normalizedVideoId = toSafeText(videoId);
  if (!normalizedVideoId) {
    const error = new Error("강의 ID가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const existing = await queryOne(
    `SELECT id FROM academy_videos WHERE id = ? LIMIT 1`,
    [normalizedVideoId]
  );
  if (!existing) {
    const error = new Error("존재하지 않는 강의입니다.");
    error.status = 404;
    throw error;
  }

  await query(
    `UPDATE academy_videos
     SET is_hidden = ?
     WHERE id = ?`,
    [isHidden ? 1 : 0, normalizedVideoId]
  );

  return { id: normalizedVideoId, isHidden: Boolean(isHidden) };
}

// 함수 역할: 회원별 강의 전체 진도 목록을 조회합니다.
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

// 함수 역할: 회원별 차시 진도 목록을 조회합니다.
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

// 함수 역할: 회원의 특정 차시 시청 위치와 완료 여부를 저장합니다.
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE
      video_id = VALUES(video_id),
      \`current_time\` = VALUES(\`current_time\`),
      duration = GREATEST(COALESCE(duration, 0), COALESCE(VALUES(duration), 0)),
      progress_percent = GREATEST(COALESCE(progress_percent, 0), COALESCE(VALUES(progress_percent), 0)),
      completed = GREATEST(COALESCE(completed, 0), COALESCE(VALUES(completed), 0)),
      last_watched_at = UTC_TIMESTAMP()`,
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

// 함수 역할: 이전 단일 강의 진도 API와 호환되도록 차시 진도 저장 후 강의 전체 진도를 반환합니다.
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

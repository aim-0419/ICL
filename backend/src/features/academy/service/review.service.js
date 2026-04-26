// 파일 역할: 아카데미 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../../shared/db/mysql.js";

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function extractProductIds(source) {
  const ids = new Set();
  if (!source || typeof source !== "object") return ids;
  if (Array.isArray(source.selectedProductIds)) {
    source.selectedProductIds.forEach((v) => { const s = String(v || "").trim(); if (s) ids.add(s); });
  }
  if (Array.isArray(source.items)) {
    source.items.forEach((item) => { const s = String(item?.productId || "").trim(); if (s) ids.add(s); });
  }
  const direct = String(source.productId || "").trim();
  if (direct) ids.add(direct);
  return ids;
}

async function hasUserPurchasedVideo(userId, videoId) {
  const video = await queryOne(
    `SELECT product_id AS productId FROM academy_videos WHERE id = ?`,
    [String(videoId)]
  );
  if (!video?.productId) return true;

  const user = await queryOne(`SELECT email FROM users WHERE id = ?`, [String(userId)]);
  if (!user?.email) return false;

  const orders = await query(
    `SELECT payload FROM orders WHERE LOWER(customer_email) = LOWER(?)`,
    [String(user.email)]
  );

  const targetId = String(video.productId).trim();
  for (const row of orders) {
    const payload = parsePayload(row.payload);
    if (extractProductIds(payload).has(targetId)) return true;
    if (extractProductIds(parsePayload(payload.payload)).has(targetId)) return true;
  }
  return false;
}

// 최신 리뷰 조회 로직
// 함수 역할: 최신 아카데미 후기 목록을 조회해 반환합니다.
export async function listLatestAcademyReviews(limit = 6) {
  const rows = await query(
    `SELECT r.id, r.video_id AS videoId, r.user_name AS userName,
            r.rating, r.content, r.created_at AS createdAt,
            v.title AS videoTitle
     FROM academy_reviews r
     LEFT JOIN academy_videos v ON v.id = r.video_id
     ORDER BY r.created_at DESC LIMIT ?`,
    [limit]
  );
  return Array.isArray(rows) ? rows : [];
}

// 강의별 리뷰 목록 조회 로직
// 함수 역할: 아카데미 후기 목록을 조회해 반환합니다.
export async function listAcademyReviews(videoId) {
  const rows = await query(
    `SELECT id, video_id AS videoId, user_id AS userId, user_name AS userName,
            rating, content, created_at AS createdAt
     FROM academy_reviews
     WHERE video_id = ?
     ORDER BY created_at DESC`,
    [String(videoId)]
  );
  return Array.isArray(rows) ? rows : [];
}

// 리뷰 작성 로직
// 함수 역할: 아카데미 후기 데이터를 새로 생성합니다.
export async function createAcademyReview(userId, userName, videoId, rating, content, isAdmin = false) {
  const id = randomUUID();
  const safeRating = Math.max(1, Math.min(5, Math.round(Number(rating) || 5)));
  const safeContent = String(content || "").trim().slice(0, 1000);
  if (!safeContent) throw new Error("리뷰 내용을 입력해 주세요.");

  if (!isAdmin) {
    const purchased = await hasUserPurchasedVideo(userId, videoId);
    if (!purchased) throw new Error("강의를 구매한 수강생만 후기를 작성할 수 있습니다.");
  }

  await query(
    `INSERT INTO academy_reviews (id, video_id, user_id, user_name, rating, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE rating = VALUES(rating), content = VALUES(content), created_at = NOW()`,
    [id, String(videoId), String(userId), String(userName), safeRating, safeContent]
  );
  return { id, videoId, userId, userName, rating: safeRating, content: safeContent };
}

// 리뷰 삭제 권한 검증 및 삭제 로직
// 함수 역할: 아카데미 후기 데이터를 삭제합니다.
export async function deleteAcademyReview(reviewId, requestUserId, isAdmin = false) {
  const row = await queryOne(
    `SELECT user_id AS userId FROM academy_reviews WHERE id = ?`,
    [String(reviewId)]
  );
  if (!row) throw new Error("리뷰를 찾을 수 없습니다.");
  if (!isAdmin && String(row.userId) !== String(requestUserId)) {
    throw new Error("본인이 작성한 리뷰만 삭제할 수 있습니다.");
  }
  await query(`DELETE FROM academy_reviews WHERE id = ?`, [String(reviewId)]);
}


import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../../shared/db/mysql.js";

// 최신 리뷰 조회 로직
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
export async function createAcademyReview(userId, userName, videoId, rating, content) {
  const id = randomUUID();
  const safeRating = Math.max(1, Math.min(5, Math.round(Number(rating) || 5)));
  const safeContent = String(content || "").trim().slice(0, 1000);
  if (!safeContent) throw new Error("리뷰 내용을 입력해 주세요.");

  await query(
    `INSERT INTO academy_reviews (id, video_id, user_id, user_name, rating, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE rating = VALUES(rating), content = VALUES(content), created_at = NOW()`,
    [id, String(videoId), String(userId), String(userName), safeRating, safeContent]
  );
  return { id, videoId, userId, userName, rating: safeRating, content: safeContent };
}

// 리뷰 삭제 권한 검증 및 삭제 로직
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


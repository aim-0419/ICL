import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../shared/db/mysql.js";

function toBoolean(value) {
  return Number(value) === 1;
}

export async function listReviews() {
  return query(
    `SELECT
      rp.id,
      rp.title,
      rp.author,
      rp.date,
      rp.views,
      COUNT(rc.id) AS comments
     FROM review_posts rp
     LEFT JOIN review_comments rc ON rc.review_id = rp.id
     GROUP BY rp.id, rp.title, rp.author, rp.date, rp.views
     ORDER BY rp.date DESC, rp.id DESC`
  );
}

export async function createReview(payload) {
  const reviewId = `review-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const date = new Date().toISOString().slice(0, 10);

  await query(
    `INSERT INTO review_posts (id, title, content, author, date, views, created_at)
     VALUES (?, ?, ?, ?, ?, 0, NOW())`,
    [reviewId, payload.title, payload.content, payload.author, date]
  );

  return getReview(reviewId);
}

export async function getReview(reviewId) {
  return queryOne(
    `SELECT id, title, content, author, date, views
     FROM review_posts
     WHERE id = ?`,
    [reviewId]
  );
}

export async function increaseReviewViews(reviewId) {
  await query(`UPDATE review_posts SET views = views + 1 WHERE id = ?`, [reviewId]);
}

export async function listReviewComments(reviewId) {
  return query(
    `SELECT id, author, content, created_at AS createdAt
     FROM review_comments
     WHERE review_id = ?
     ORDER BY created_at DESC, id DESC`,
    [reviewId]
  );
}

export async function createReviewComment(reviewId, payload) {
  const commentId = `comment-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const createdAt = new Date().toISOString().slice(0, 10);

  await query(
    `INSERT INTO review_comments (id, review_id, author, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [commentId, reviewId, payload.author, payload.content, createdAt]
  );

  return {
    id: commentId,
    reviewId,
    author: payload.author,
    content: payload.content,
    createdAt,
  };
}

export async function deleteReviewComment(reviewId, commentId) {
  await query(`DELETE FROM review_comments WHERE id = ? AND review_id = ?`, [commentId, reviewId]);
}

export async function listEvents() {
  const rows = await query(
    `SELECT id, title, status, start_date AS startDate, end_date AS endDate, likes, image, summary
     FROM events
     ORDER BY start_date DESC, id DESC`
  );
  return rows;
}

export async function createEvent(payload) {
  const eventId = `event-${Date.now()}-${randomUUID().slice(0, 8)}`;

  await query(
    `INSERT INTO events (id, title, status, start_date, end_date, likes, image, summary)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      eventId,
      payload.title,
      payload.status,
      payload.startDate,
      payload.endDate,
      payload.image,
      payload.summary,
    ]
  );

  return getEvent(eventId);
}

export async function getEvent(eventId) {
  return queryOne(
    `SELECT id, title, status, start_date AS startDate, end_date AS endDate, likes, image, summary
     FROM events
     WHERE id = ?`,
    [eventId]
  );
}

export async function listInquiries() {
  const rows = await query(
    `SELECT id, title, author, author_id AS authorId, date, views, is_secret AS isSecret
     FROM inquiry_posts
     ORDER BY date DESC, id DESC`
  );
  return rows.map((row) => ({ ...row, isSecret: toBoolean(row.isSecret) }));
}

export async function getInquiry(inquiryId) {
  const row = await queryOne(
    `SELECT id, title, content, author, author_id AS authorId, date, views, is_secret AS isSecret
     FROM inquiry_posts
     WHERE id = ?`,
    [inquiryId]
  );
  if (!row) return null;
  return { ...row, isSecret: toBoolean(row.isSecret) };
}

export async function increaseInquiryViews(inquiryId) {
  await query(`UPDATE inquiry_posts SET views = views + 1 WHERE id = ?`, [inquiryId]);
}

export async function createInquiry(payload) {
  const inquiryId = `inquiry-${Date.now()}`;
  const date = new Date().toISOString().slice(0, 10);

  await query(
    `INSERT INTO inquiry_posts (id, title, content, author, author_id, date, views, is_secret, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, NOW())`,
    [
      inquiryId,
      payload.title,
      payload.content,
      payload.author,
      payload.authorId || null,
      date,
      payload.isSecret ? 1 : 0,
    ]
  );

  return getInquiry(inquiryId);
}

// ─── 문의 답변 ────────────────────────────────────────────────────────────────

export async function listInquiryReplies(inquiryId) {
  const rows = await query(
    `SELECT id, inquiry_id AS inquiryId, author_id AS authorId,
            author_name AS authorName, content, created_at AS createdAt
     FROM inquiry_replies
     WHERE inquiry_id = ?
     ORDER BY created_at ASC`,
    [inquiryId]
  );
  return Array.isArray(rows) ? rows : [];
}

export async function createInquiryReply({ inquiryId, authorId, authorName, content }) {
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  await query(
    `INSERT INTO inquiry_replies (id, inquiry_id, author_id, author_name, content, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [id, inquiryId, authorId, authorName || "관리자", content]
  );
  return { id, inquiryId, authorId, authorName: authorName || "관리자", content };
}

export async function deleteInquiryReply(replyId, requestUserId, isAdmin) {
  const row = await queryOne(`SELECT author_id AS authorId FROM inquiry_replies WHERE id = ?`, [replyId]);
  if (!row) return;
  if (!isAdmin && String(row.authorId) !== String(requestUserId)) {
    const err = new Error("삭제 권한이 없습니다.");
    err.status = 403;
    throw err;
  }
  await query(`DELETE FROM inquiry_replies WHERE id = ?`, [replyId]);
}

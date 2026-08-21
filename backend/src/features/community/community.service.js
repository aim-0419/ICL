// 파일 역할: 커뮤니티 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../shared/db/mysql.js";
import {
  deleteCommunityAsset as deleteAssetFile,
  saveCommunityAsset as saveAssetFile,
} from "./community.asset.service.js";
import { sendInquiryReplyNotification } from "../../shared/email/email.service.js";
import { decryptUserRow } from "../../shared/security/pii.js";

// 함수 역할: boolean 값으로 안전하게 변환합니다.
function toBoolean(value) {
  return Number(value) === 1;
}

// 함수 역할: ID list 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeIdList(ids) {
  if (!Array.isArray(ids)) return [];
  const deduped = [];
  const seen = new Set();

  for (const id of ids) {
    const normalized = String(id || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function collectCommunityAssetPaths(rows = []) {
  const result = [];
  const seen = new Set();

  for (const row of rows) {
    const imagePath = String(row?.imageUrl || "").trim();
    const videoPath = String(row?.videoUrl || "").trim();

    if (imagePath.startsWith("/uploads/community/") && !seen.has(imagePath)) {
      seen.add(imagePath);
      result.push(imagePath);
    }
    if (videoPath.startsWith("/uploads/community/") && !seen.has(videoPath)) {
      seen.add(videoPath);
      result.push(videoPath);
    }
  }

  return result;
}

// 함수 역할: 삭제된 글이 쓰던 업로드 파일 중, 더 이상 아무도 참조하지 않는 것만 지웁니다.
//
// 업로드 파일에는 올린 사람 정보가 남지 않아서, 글에 적힌 경로만 보고 지우면
// 남의 이미지 경로를 자기 글에 적어 넣고 그 글을 지우는 것만으로 타인의 파일을
// 삭제할 수 있었습니다. 그래서 지우기 전에 후기·문의 글 전체를 훑어
// 같은 경로를 쓰는 다른 글이 남아 있으면 파일을 그대로 둡니다.
// deps 는 테스트에서 DB·파일시스템 대신 가짜 구현을 넣기 위한 자리입니다.
export async function cleanupCommunityAssets(paths = [], deps = {}) {
  const isReferenced = deps.isReferenced || isCommunityAssetReferenced;
  const deleteFile = deps.deleteFile || deleteAssetFile;

  if (!Array.isArray(paths) || paths.length === 0) return [];

  const unusedPaths = [];
  for (const assetPath of paths) {
    if (await isReferenced(assetPath)) continue;
    unusedPaths.push(assetPath);
  }

  if (unusedPaths.length === 0) return [];
  await Promise.all(unusedPaths.map((assetPath) => deleteFile(assetPath)));
  return unusedPaths;
}

// 함수 역할: 해당 업로드 경로를 아직 사용 중인 글이 남아 있는지 확인합니다.
// 확인 중 오류가 나면 "참조 중"으로 보고 파일을 남깁니다. 잘못 지우는 쪽이 더 위험합니다.
async function isCommunityAssetReferenced(assetPath) {
  const target = String(assetPath || "").trim();
  if (!target) return true;

  try {
    const row = await queryOne(
      `SELECT 1 AS used FROM (
         SELECT image_url, video_url FROM review_posts
         UNION ALL
         SELECT image_url, video_url FROM inquiry_posts
       ) AS refs
       WHERE refs.image_url = ? OR refs.video_url = ?
       LIMIT 1`,
      [target, target]
    );
    return Boolean(row?.used);
  } catch (error) {
    console.error("[community] 업로드 파일 참조 확인 실패:", error.message);
    return true;
  }
}

// 함수 역할: 후기 목록을 조회해 반환합니다.
export async function listReviews({ search = "" } = {}) {
  const params = [];
  let whereClause = "";

  if (search) {
    whereClause = "WHERE (rp.title LIKE ? OR rp.content LIKE ? OR rp.author LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  return query(
    `SELECT
      rp.id,
      rp.title,
      rp.author,
      rp.author_id AS authorId,
      rp.date,
      rp.views,
      rp.image_url AS imageUrl,
      rp.video_url AS videoUrl,
      COUNT(rc.id) AS comments
     FROM review_posts rp
     LEFT JOIN review_comments rc ON rc.review_id = rp.id
     ${whereClause}
     GROUP BY rp.id, rp.title, rp.author, rp.author_id, rp.date, rp.views, rp.image_url, rp.video_url
     ORDER BY rp.date DESC, rp.id DESC`,
    params
  );
}

// 함수 역할: 후기 데이터를 새로 생성합니다.
export async function createReview(payload) {
  const reviewId = `review-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const date = new Date().toISOString().slice(0, 10);

  await query(
    `INSERT INTO review_posts (
      id,
      title,
      content,
      image_url,
      video_url,
      author,
      author_id,
      date,
      views,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
    [
      reviewId,
      payload.title,
      payload.content,
      payload.imageUrl || null,
      payload.videoUrl || null,
      payload.author,
      payload.authorId || null,
      date,
    ]
  );

  return getReview(reviewId);
}

// 함수 역할: 후기 데이터를 조회해 호출자에게 반환합니다.
export async function getReview(reviewId) {
  return queryOne(
    `SELECT id, title, content, image_url AS imageUrl, video_url AS videoUrl, author, author_id AS authorId, date, views
     FROM review_posts
     WHERE id = ?`,
    [reviewId]
  );
}

// 함수 역할: 후기 데이터를 수정합니다.
export async function updateReview(reviewId, payload) {
  const before = await getReview(reviewId);

  await query(
    `UPDATE review_posts
     SET title = ?, content = ?, image_url = ?, video_url = ?
     WHERE id = ?`,
    [payload.title, payload.content, payload.imageUrl || null, payload.videoUrl || null, reviewId]
  );

  const stalePaths = collectCommunityAssetPaths([
    {
      imageUrl: before?.imageUrl !== payload.imageUrl ? before?.imageUrl : "",
      videoUrl: before?.videoUrl !== payload.videoUrl ? before?.videoUrl : "",
    },
  ]);
  await cleanupCommunityAssets(stalePaths);

  return getReview(reviewId);
}

// 함수 역할: 후기 데이터를 삭제합니다.
export async function deleteReview(reviewId) {
  const before = await getReview(reviewId);
  await query(`DELETE FROM review_posts WHERE id = ?`, [reviewId]);
  await cleanupCommunityAssets(collectCommunityAssetPaths([before]));
}

// 함수 역할: 후기 bulk 데이터를 삭제합니다.
export async function deleteReviewsBulk(ids = []) {
  const normalizedIds = normalizeIdList(ids);
  if (!normalizedIds.length) return 0;

  const placeholders = normalizedIds.map(() => "?").join(", ");
  const beforeRows = await query(
    `SELECT image_url AS imageUrl, video_url AS videoUrl
     FROM review_posts
     WHERE id IN (${placeholders})`,
    normalizedIds
  );
  const result = await query(`DELETE FROM review_posts WHERE id IN (${placeholders})`, normalizedIds);
  await cleanupCommunityAssets(collectCommunityAssetPaths(beforeRows));
  return Number(result?.affectedRows || 0);
}

// 함수 역할: all 후기 데이터를 삭제합니다.
export async function deleteAllReviews() {
  const beforeRows = await query(`SELECT image_url AS imageUrl, video_url AS videoUrl FROM review_posts`);
  const result = await query(`DELETE FROM review_posts`);
  await cleanupCommunityAssets(collectCommunityAssetPaths(beforeRows));
  return Number(result?.affectedRows || 0);
}

// 함수 역할: increaseReviewViews 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function increaseReviewViews(reviewId) {
  await query(`UPDATE review_posts SET views = views + 1 WHERE id = ?`, [reviewId]);
}

// 함수 역할: 후기 댓글 목록을 조회해 반환합니다.
export async function listReviewComments(reviewId) {
  return query(
    `SELECT id, author, content, created_at AS createdAt
     FROM review_comments
     WHERE review_id = ?
     ORDER BY created_at DESC, id DESC`,
    [reviewId]
  );
}

// 함수 역할: 후기 댓글 데이터를 새로 생성합니다.
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

// 함수 역할: 후기 댓글 데이터를 삭제합니다.
export async function deleteReviewComment(reviewId, commentId) {
  await query(`DELETE FROM review_comments WHERE id = ? AND review_id = ?`, [commentId, reviewId]);
}

// 함수 역할: 이벤트 목록을 조회해 반환합니다.
export async function listEvents() {
  const rows = await query(
    `SELECT id, title, status, start_date AS startDate, end_date AS endDate, likes, image, summary
     FROM events
     ORDER BY start_date DESC, id DESC`
  );
  return rows;
}

// 함수 역할: 이벤트 데이터를 새로 생성합니다.
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

// 함수 역할: 이벤트 데이터를 조회해 호출자에게 반환합니다.
export async function getEvent(eventId) {
  return queryOne(
    `SELECT id, title, status, start_date AS startDate, end_date AS endDate, likes, image, summary
     FROM events
     WHERE id = ?`,
    [eventId]
  );
}

// 함수 역할: 이벤트 데이터를 수정합니다.
export async function updateEvent(eventId, payload) {
  await query(
    `UPDATE events SET title = ?, status = ?, start_date = ?, end_date = ?, image = ?, summary = ? WHERE id = ?`,
    [
      payload.title,
      payload.status,
      payload.startDate || null,
      payload.endDate || null,
      payload.image || null,
      payload.summary,
      String(eventId),
    ]
  );
  return getEvent(eventId);
}

// 함수 역할: 이벤트 데이터를 삭제합니다.
export async function deleteEvent(eventId) {
  await query(`DELETE FROM events WHERE id = ?`, [String(eventId || "")]);
}

// 함수 역할: 문의 목록을 조회해 반환합니다.
export async function listInquiries({ search = "", viewerUserId = "", viewerIsAdmin = false } = {}) {
  const normalizedViewerUserId = String(viewerUserId || "").trim();
  const canReadAsAdmin = Boolean(viewerIsAdmin);
  const params = [];
  let whereClause = "";

  if (search) {
    whereClause = "WHERE (ip.is_secret = 0 OR ? = 1 OR ip.author_id = ?) AND (ip.title LIKE ? OR ip.author LIKE ?)";
    const s = `%${search}%`;
    params.push(canReadAsAdmin ? 1 : 0, normalizedViewerUserId, s, s);
  }

  const rows = await query(
    `SELECT
      ip.id,
      ip.title,
      ip.author,
      ip.author_id AS authorId,
      ip.date,
      ip.views,
      ip.image_url AS imageUrl,
      ip.video_url AS videoUrl,
      ip.is_secret AS isSecret,
      COUNT(ir.id) AS replyCount
     FROM inquiry_posts ip
     LEFT JOIN inquiry_replies ir ON ir.inquiry_id = ip.id
     ${whereClause}
     GROUP BY ip.id, ip.title, ip.author, ip.author_id, ip.date, ip.views, ip.image_url, ip.video_url, ip.is_secret
     ORDER BY ip.date DESC, ip.id DESC`,
    params
  );
  return rows.map((row) => {
    const isSecret = toBoolean(row.isSecret);
    const canRead = !isSecret || canReadAsAdmin || (
      normalizedViewerUserId && String(row.authorId || "") === normalizedViewerUserId
    );
    const normalized = {
      ...row,
      isSecret,
      replyCount: Number(row.replyCount || 0),
    };

    if (canRead) return normalized;

    return {
      ...normalized,
      title: "비밀글입니다.",
      author: "비공개",
      authorId: "",
      imageUrl: "",
      videoUrl: "",
      locked: true,
    };
  });
}

// 함수 역할: 문의 데이터를 조회해 호출자에게 반환합니다.
export async function getInquiry(inquiryId) {
  const row = await queryOne(
    `SELECT
      id,
      title,
      content,
      image_url AS imageUrl,
      video_url AS videoUrl,
      author,
      author_id AS authorId,
      date,
      views,
      is_secret AS isSecret
     FROM inquiry_posts
     WHERE id = ?`,
    [inquiryId]
  );
  if (!row) return null;
  return { ...row, isSecret: toBoolean(row.isSecret) };
}

// 함수 역할: increaseInquiryViews 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function increaseInquiryViews(inquiryId) {
  await query(`UPDATE inquiry_posts SET views = views + 1 WHERE id = ?`, [inquiryId]);
}

// 함수 역할: 문의 데이터를 새로 생성합니다.
export async function createInquiry(payload) {
  const inquiryId = `inquiry-${Date.now()}`;
  const date = new Date().toISOString().slice(0, 10);

  await query(
    `INSERT INTO inquiry_posts (
      id,
      title,
      content,
      image_url,
      video_url,
      author,
      author_id,
      date,
      views,
      is_secret,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW())`,
    [
      inquiryId,
      payload.title,
      payload.content,
      payload.imageUrl || null,
      payload.videoUrl || null,
      payload.author,
      payload.authorId || null,
      date,
      payload.isSecret ? 1 : 0,
    ]
  );

  return getInquiry(inquiryId);
}

// 함수 역할: 문의 데이터를 수정합니다.
export async function updateInquiry(inquiryId, payload) {
  const before = await getInquiry(inquiryId);

  await query(
    `UPDATE inquiry_posts
     SET title = ?, content = ?, image_url = ?, video_url = ?, is_secret = ?
     WHERE id = ?`,
    [
      payload.title,
      payload.content,
      payload.imageUrl || null,
      payload.videoUrl || null,
      payload.isSecret ? 1 : 0,
      inquiryId,
    ]
  );

  const stalePaths = collectCommunityAssetPaths([
    {
      imageUrl: before?.imageUrl !== payload.imageUrl ? before?.imageUrl : "",
      videoUrl: before?.videoUrl !== payload.videoUrl ? before?.videoUrl : "",
    },
  ]);
  await cleanupCommunityAssets(stalePaths);

  return getInquiry(inquiryId);
}

// 함수 역할: 문의 데이터를 삭제합니다.
export async function deleteInquiry(inquiryId) {
  const before = await getInquiry(inquiryId);
  await query(`DELETE FROM inquiry_replies WHERE inquiry_id = ?`, [inquiryId]);
  await query(`DELETE FROM inquiry_posts WHERE id = ?`, [inquiryId]);
  await cleanupCommunityAssets(collectCommunityAssetPaths([before]));
}

// 함수 역할: 문의 bulk 데이터를 삭제합니다.
export async function deleteInquiriesBulk(ids = []) {
  const normalizedIds = normalizeIdList(ids);
  if (!normalizedIds.length) return 0;

  const placeholders = normalizedIds.map(() => "?").join(", ");
  const beforeRows = await query(
    `SELECT image_url AS imageUrl, video_url AS videoUrl
     FROM inquiry_posts
     WHERE id IN (${placeholders})`,
    normalizedIds
  );
  await query(`DELETE FROM inquiry_replies WHERE inquiry_id IN (${placeholders})`, normalizedIds);
  const result = await query(`DELETE FROM inquiry_posts WHERE id IN (${placeholders})`, normalizedIds);
  await cleanupCommunityAssets(collectCommunityAssetPaths(beforeRows));
  return Number(result?.affectedRows || 0);
}

// 함수 역할: all 문의 데이터를 삭제합니다.
export async function deleteAllInquiries() {
  const beforeRows = await query(`SELECT image_url AS imageUrl, video_url AS videoUrl FROM inquiry_posts`);
  await query(`DELETE FROM inquiry_replies`);
  const result = await query(`DELETE FROM inquiry_posts`);
  await cleanupCommunityAssets(collectCommunityAssetPaths(beforeRows));
  return Number(result?.affectedRows || 0);
}

// ─── 문의 답변 ────────────────────────────────────────────────────────────────

// 함수 역할: 문의 답변 목록을 조회해 반환합니다.
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

// 함수 역할: 문의 답변 데이터를 새로 생성합니다.
export async function createInquiryReply({ inquiryId, authorId, authorName, content }) {
  const id = randomUUID();
  await query(
    `INSERT INTO inquiry_replies (id, inquiry_id, author_id, author_name, content, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [id, inquiryId, authorId, authorName || "관리자", content]
  );

  // 문의 작성자에게 답변 알림 이메일 발송 (비동기, 실패해도 응답에 영향 없음)
  void (async () => {
    try {
      const row = await queryOne(
        `SELECT ip.title, ip.content AS inquiryContent, ip.date AS inquiryDate,
                u.email, u.name
         FROM inquiry_posts ip
         LEFT JOIN users u ON u.id = ip.author_id
         WHERE ip.id = ?`,
        [inquiryId]
      );
      const author = decryptUserRow(row);
      if (author?.email) {
        await sendInquiryReplyNotification({
          toEmail: author.email,
          userName: author.name || "",
          inquiryTitle: row.title || "문의",
          inquiryContent: row.inquiryContent || "",
          inquiryDate: row.inquiryDate || "",
          replyContent: content,
        });
      }
    } catch (err) {
      console.error("[email] 문의 답변 알림 발송 실패:", err.message);
    }
  })();

  return { id, inquiryId, authorId, authorName: authorName || "관리자", content };
}

// 함수 역할: 문의 답변 내용을 수정합니다.
export async function updateInquiryReply(replyId, content, requestUserId, isAdmin) {
  const row = await queryOne(`SELECT author_id AS authorId FROM inquiry_replies WHERE id = ?`, [replyId]);
  if (!row) {
    const err = new Error("답변을 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }
  if (!isAdmin && String(row.authorId) !== String(requestUserId)) {
    const err = new Error("수정 권한이 없습니다.");
    err.status = 403;
    throw err;
  }
  await query(`UPDATE inquiry_replies SET content = ? WHERE id = ?`, [content, replyId]);
  const updated = await queryOne(
    `SELECT id, inquiry_id AS inquiryId, author_id AS authorId, author_name AS authorName, content, created_at AS createdAt FROM inquiry_replies WHERE id = ?`,
    [replyId]
  );
  return updated;
}

// 함수 역할: 문의 답변 데이터를 삭제합니다.
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

export async function saveCommunityAsset(payload) {
  return saveAssetFile(payload);
}

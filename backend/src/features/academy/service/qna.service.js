import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../../shared/db/mysql.js";

// Q&A 목록 및 비밀글 가림 처리 로직
export async function listAcademyQna(videoId, requestUserId = null, isAdmin = false) {
  const posts = await query(
    `SELECT id, video_id AS videoId, user_id AS userId, user_name AS userName,
            title, content, is_secret AS isSecret, created_at AS createdAt
     FROM academy_qna_posts
     WHERE video_id = ?
     ORDER BY created_at DESC`,
    [String(videoId)]
  );

  const postList = Array.isArray(posts) ? posts : [];

  return Promise.all(
    postList.map(async (post) => {
      const isOwner = requestUserId && String(post.userId) === String(requestUserId);
      const canSee = !post.isSecret || isOwner || isAdmin;

      const replies = await query(
        `SELECT id, post_id AS postId, user_id AS userId, user_name AS userName,
                content, is_admin AS isAdmin, created_at AS createdAt
         FROM academy_qna_replies WHERE post_id = ? ORDER BY created_at ASC`,
        [String(post.id)]
      );

      return {
        ...post,
        isSecret: Boolean(post.isSecret),
        title: canSee ? post.title : "비공개 질문입니다.",
        content: canSee ? post.content : "",
        hidden: !canSee,
        replies: Array.isArray(replies) ? replies.map((r) => ({ ...r, isAdmin: Boolean(r.isAdmin) })) : [],
      };
    })
  );
}

// Q&A 질문 작성 로직
export async function createAcademyQnaPost(userId, userName, videoId, title, content, isSecret = false) {
  const id = randomUUID();
  const safeTitle = String(title || "").trim().slice(0, 200);
  const safeContent = String(content || "").trim().slice(0, 3000);
  if (!safeTitle) throw new Error("질문 제목을 입력해 주세요.");
  if (!safeContent) throw new Error("질문 내용을 입력해 주세요.");

  await query(
    `INSERT INTO academy_qna_posts (id, video_id, user_id, user_name, title, content, is_secret, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [id, String(videoId), String(userId), String(userName), safeTitle, safeContent, isSecret ? 1 : 0]
  );
  return { id, videoId, userId, userName, title: safeTitle, content: safeContent, isSecret };
}

// Q&A 답변 작성 로직
export async function createAcademyQnaReply(userId, userName, postId, content, isAdmin = false) {
  const row = await queryOne(`SELECT id FROM academy_qna_posts WHERE id = ?`, [String(postId)]);
  if (!row) throw new Error("질문을 찾을 수 없습니다.");

  const id = randomUUID();
  const safeContent = String(content || "").trim().slice(0, 3000);
  if (!safeContent) throw new Error("답변 내용을 입력해 주세요.");

  await query(
    `INSERT INTO academy_qna_replies (id, post_id, user_id, user_name, content, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [id, String(postId), String(userId), String(userName), safeContent, isAdmin ? 1 : 0]
  );
  return { id, postId, userId, userName, content: safeContent, isAdmin };
}

// Q&A 질문 삭제 권한 검증 및 삭제 로직
export async function deleteAcademyQnaPost(postId, requestUserId, isAdmin = false) {
  const row = await queryOne(
    `SELECT user_id AS userId FROM academy_qna_posts WHERE id = ?`,
    [String(postId)]
  );
  if (!row) throw new Error("질문을 찾을 수 없습니다.");
  if (!isAdmin && String(row.userId) !== String(requestUserId)) {
    throw new Error("본인이 작성한 질문만 삭제할 수 있습니다.");
  }
  await query(`DELETE FROM academy_qna_posts WHERE id = ?`, [String(postId)]);
}

// Q&A 답변 삭제 권한 검증 및 삭제 로직
export async function deleteAcademyQnaReply(replyId, requestUserId, isAdmin = false) {
  const row = await queryOne(
    `SELECT user_id AS userId FROM academy_qna_replies WHERE id = ?`,
    [String(replyId)]
  );
  if (!row) throw new Error("답변을 찾을 수 없습니다.");
  if (!isAdmin && String(row.userId) !== String(requestUserId)) {
    throw new Error("본인이 작성한 답변만 삭제할 수 있습니다.");
  }
  await query(`DELETE FROM academy_qna_replies WHERE id = ?`, [String(replyId)]);
}


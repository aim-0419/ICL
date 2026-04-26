// 파일 역할: 아카데미 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../../shared/db/mysql.js";
import { sendQnaReplyNotification } from "../../../shared/email/email.service.js";

// Q&A 목록 및 비밀글 가림 처리 로직
// 함수 역할: 아카데미 Q&A 목록을 조회해 반환합니다.
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

// 함수 역할: 특정 회원이 작성한 아카데미 Q&A 목록과 답변 여부를 조회해 반환합니다.
export async function listMyAcademyQna(userId) {
  const rows = await query(
    `SELECT
       p.id,
       p.video_id AS videoId,
       COALESCE(prod.name, '삭제된 강의') AS videoTitle,
       p.title,
       p.is_secret AS isSecret,
       p.created_at AS createdAt,
       COUNT(r.id) AS replyCount,
       MAX(r.created_at) AS lastReplyAt
     FROM academy_qna_posts p
     LEFT JOIN academy_videos v ON v.id = p.video_id
     LEFT JOIN products prod ON prod.id = v.product_id
     LEFT JOIN academy_qna_replies r ON r.post_id = p.id
     WHERE p.user_id = ?
     GROUP BY p.id, p.video_id, prod.name, p.title, p.is_secret, p.created_at
     ORDER BY p.created_at DESC`,
    [String(userId)]
  );

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const replyCount = Number(row.replyCount || 0);
    return {
      id: row.id,
      videoId: row.videoId,
      videoTitle: row.videoTitle,
      title: row.title,
      isSecret: Boolean(row.isSecret),
      createdAt: row.createdAt,
      replyCount,
      answered: replyCount > 0,
      lastReplyAt: row.lastReplyAt || null,
    };
  });
}

// Q&A 질문 작성 로직
// 함수 역할: 아카데미 Q&A 게시글 데이터를 새로 생성합니다.
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
// 함수 역할: 아카데미 Q&A 답변 데이터를 새로 생성합니다.
export async function createAcademyQnaReply(userId, userName, postId, content, isAdmin = false) {
  const post = await queryOne(
    `SELECT id, video_id AS videoId, user_id AS authorId, title FROM academy_qna_posts WHERE id = ?`,
    [String(postId)]
  );
  if (!post) throw new Error("질문을 찾을 수 없습니다.");

  const id = randomUUID();
  const safeContent = String(content || "").trim().slice(0, 3000);
  if (!safeContent) throw new Error("답변 내용을 입력해 주세요.");

  await query(
    `INSERT INTO academy_qna_replies (id, post_id, user_id, user_name, content, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [id, String(postId), String(userId), String(userName), safeContent, isAdmin ? 1 : 0]
  );

  if (isAdmin && post.authorId && String(post.authorId) !== String(userId)) {
    void (async () => {
      try {
        const author = await queryOne(`SELECT email FROM users WHERE id = ?`, [String(post.authorId)]);
        if (author?.email) {
          await sendQnaReplyNotification({
            toEmail: author.email,
            videoId: post.videoId,
            postTitle: post.title || "질문",
            replyContent: safeContent,
          });
        }
      } catch (err) {
        console.error("[email] Q&A 답변 알림 발송 실패:", err.message);
      }
    })();
  }

  return { id, postId, userId, userName, content: safeContent, isAdmin };
}

// Q&A 질문 삭제 권한 검증 및 삭제 로직
// 함수 역할: 아카데미 Q&A 게시글 데이터를 삭제합니다.
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
// 함수 역할: 아카데미 Q&A 답변 데이터를 삭제합니다.
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

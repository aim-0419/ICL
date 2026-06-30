// 파일 역할: 커뮤니티 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as communityService from "./community.service.js";
import * as communitySocialService from "./community.social.service.js";
import { resolveSessionUser, isAdminUser, requireAuth as requireCommunityUploadAuth } from "../../shared/middlewares/auth.js";
const EVENT_STATUSES = new Set(["진행중", "종료"]);

export { requireCommunityUploadAuth };

const getAuthUser = resolveSessionUser;

// 함수 역할: same 회원 조건에 해당하는지 참/거짓으로 판별합니다.
function isSameUser(leftId, rightId) {
  return Boolean(leftId && rightId && String(leftId) === String(rightId));
}

function canReadInquiry(user, inquiry) {
  return Boolean(
    inquiry &&
    (!inquiry.isSecret || isAdminUser(user) || isSameUser(user?.id, inquiry.authorId))
  );
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, "").trim();
}

// 함수 역할: 미디어 URL 입력값을 저장하기 전에 허용된 형식으로 정리합니다.
function normalizeMediaUrl(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("/uploads/")) return normalized;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return normalized;
  } catch {
    return "";
  }
}

// 함수 역할: 브라우저 헤더에 안전하게 실린 파일명을 원래 이름으로 복원합니다.
function decodeUploadFileName(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw || "").trim();
  if (!text) return "";

  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// 함수 역할: 커뮤니티 첨부 파일을 업로드하고 저장 경로를 반환합니다.
export async function uploadCommunityAsset(req, res, next) {
  try {
    const authUser = req.authUser || await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const kind = String(req.query.kind || "")
      .trim()
      .toLowerCase();

    const fileName = decodeUploadFileName(req.headers["x-file-name"]);

    const mimeTypeHeader = req.headers["content-type"];
    const mimeType = Array.isArray(mimeTypeHeader) ? mimeTypeHeader[0] : mimeTypeHeader;

    const assetPath = await communityService.saveCommunityAsset({
      kind,
      fileName,
      mimeType,
      buffer: req.body,
    });

    res.status(201).json({ assetPath });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 후기 데이터를 조회해 호출자에게 반환합니다.
export async function getReviews(req, res, next) {
  try {
    const search = String(req.query.search || "").trim();
    res.json(await communityService.listReviews({ search }));
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 소셜 최신 데이터를 조회해 호출자에게 반환합니다.
export async function getSocialLatest(req, res, next) {
  try {
    res.json(await communitySocialService.getBrandSocialLatest());
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 후기 데이터를 새로 생성합니다.
export async function createReview(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const title = stripHtml(req.body?.title);
    const content = stripHtml(req.body?.content);
    const imageUrl = normalizeMediaUrl(req.body?.imageUrl);
    const videoUrl = normalizeMediaUrl(req.body?.videoUrl);

    if (!title) {
      res.status(400).json({ message: "후기 제목을 입력해주세요." });
      return;
    }

    if (!content) {
      res.status(400).json({ message: "후기 내용을 입력해주세요." });
      return;
    }

    const review = await communityService.createReview({
      title,
      content,
      imageUrl,
      videoUrl,
      author: authUser.name || authUser.loginId || authUser.email || "익명",
      authorId: authUser.id,
    });

    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 후기 데이터를 조회해 호출자에게 반환합니다.
export async function getReview(req, res, next) {
  try {
    const review = await communityService.getReview(req.params.reviewId);
    if (!review) {
      res.status(404).json({ message: "후기 정보를 찾을 수 없습니다." });
      return;
    }
    res.json(review);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 후기 데이터를 수정합니다.
export async function updateReview(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const reviewId = String(req.params.reviewId || "").trim();
    if (!reviewId) {
      res.status(400).json({ message: "수정할 후기 ID가 필요합니다." });
      return;
    }

    const review = await communityService.getReview(reviewId);
    if (!review) {
      res.status(404).json({ message: "후기 정보를 찾을 수 없습니다." });
      return;
    }

    if (!isAdminUser(authUser) && !isSameUser(authUser.id, review.authorId)) {
      res.status(403).json({ message: "후기 수정 권한이 없습니다." });
      return;
    }

    const title = stripHtml(req.body?.title);
    const content = stripHtml(req.body?.content);
    const imageUrl = normalizeMediaUrl(req.body?.imageUrl);
    const videoUrl = normalizeMediaUrl(req.body?.videoUrl);

    if (!title) {
      res.status(400).json({ message: "후기 제목을 입력해주세요." });
      return;
    }

    if (!content) {
      res.status(400).json({ message: "후기 내용을 입력해주세요." });
      return;
    }

    const updated = await communityService.updateReview(reviewId, {
      title,
      content,
      imageUrl,
      videoUrl,
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 후기 데이터를 삭제합니다.
export async function deleteReview(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const reviewId = String(req.params.reviewId || "").trim();
    if (!reviewId) {
      res.status(400).json({ message: "삭제할 후기 ID가 필요합니다." });
      return;
    }

    const review = await communityService.getReview(reviewId);
    if (!review) {
      res.status(404).json({ message: "후기 정보를 찾을 수 없습니다." });
      return;
    }

    if (!isAdminUser(authUser) && !isSameUser(authUser.id, review.authorId)) {
      res.status(403).json({ message: "후기 삭제 권한이 없습니다." });
      return;
    }

    await communityService.deleteReview(reviewId);
    res.json({ ok: true, id: reviewId });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: bulkDeleteReviews 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function bulkDeleteReviews(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "후기 일괄 삭제는 관리자만 가능합니다." });
      return;
    }

    const deleteAll = Boolean(req.body?.deleteAll);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

    if (!deleteAll && ids.length === 0) {
      res.status(400).json({ message: "삭제할 후기를 선택해주세요." });
      return;
    }

    const deletedCount = deleteAll
      ? await communityService.deleteAllReviews()
      : await communityService.deleteReviewsBulk(ids);

    res.json({ ok: true, deletedCount });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: addReviewView 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function addReviewView(req, res, next) {
  try {
    await communityService.increaseReviewViews(req.params.reviewId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 후기 댓글 데이터를 조회해 호출자에게 반환합니다.
export async function getReviewComments(req, res, next) {
  try {
    res.json(await communityService.listReviewComments(req.params.reviewId));
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 후기 댓글 데이터를 새로 생성합니다.
export async function createReviewComment(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const content = String(req.body?.content || "").trim();
    const author = authUser.name || authUser.loginId || authUser.email || "익명";

    if (!content) {
      res.status(400).json({ message: "댓글 내용을 입력해주세요." });
      return;
    }

    const result = await communityService.createReviewComment(req.params.reviewId, { content, author });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 후기 댓글 데이터를 삭제합니다.
export async function deleteReviewComment(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!isAdminUser(authUser)) {
      const review = await communityService.getReview(req.params.reviewId);
      if (!review || !isSameUser(authUser.id, review.authorId)) {
        res.status(403).json({ message: "댓글 삭제 권한이 없습니다." });
        return;
      }
    }

    await communityService.deleteReviewComment(req.params.reviewId, req.params.commentId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 이벤트 데이터를 조회해 호출자에게 반환합니다.
export async function getEvents(req, res, next) {
  try {
    res.json(await communityService.listEvents());
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 이벤트 데이터를 새로 생성합니다.
export async function createEvent(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "이벤트 작성은 관리자만 가능합니다." });
      return;
    }

    const title = String(req.body?.title || "").trim();
    const summary = String(req.body?.summary || "").trim();
    const statusInput = String(req.body?.status || "").trim();
    const startDateInput = String(req.body?.startDate || "").trim();
    const endDateInput = String(req.body?.endDate || "").trim();
    const imageInput = String(req.body?.image || "").trim();

    if (!title) {
      res.status(400).json({ message: "이벤트 제목을 입력해주세요." });
      return;
    }

    if (!summary) {
      res.status(400).json({ message: "이벤트 설명을 입력해주세요." });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const status = EVENT_STATUSES.has(statusInput) ? statusInput : "진행중";
    const startDate = startDateInput || today;
    const endDate = endDateInput || startDate;

    const event = await communityService.createEvent({
      title,
      summary,
      status,
      startDate,
      endDate,
      image:
        imageInput ||
        "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80",
    });

    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 이벤트 데이터를 조회해 호출자에게 반환합니다.
export async function getEvent(req, res, next) {
  try {
    const event = await communityService.getEvent(req.params.eventId);
    if (!event) {
      res.status(404).json({ message: "이벤트 정보를 찾을 수 없습니다." });
      return;
    }
    res.json(event);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 이벤트 데이터를 수정합니다.
export async function updateEvent(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "이벤트 수정은 관리자만 가능합니다." });
      return;
    }

    const eventId = String(req.params.eventId || "").trim();
    if (!eventId) {
      res.status(400).json({ message: "수정할 이벤트 ID가 필요합니다." });
      return;
    }

    const existing = await communityService.getEvent(eventId);
    if (!existing) {
      res.status(404).json({ message: "이벤트 정보를 찾을 수 없습니다." });
      return;
    }

    const title = String(req.body?.title || "").trim();
    const summary = String(req.body?.summary || "").trim();
    const statusInput = String(req.body?.status || "").trim();
    const startDateInput = String(req.body?.startDate || "").trim();
    const endDateInput = String(req.body?.endDate || "").trim();
    const imageInput = String(req.body?.image ?? existing.image ?? "").trim();

    if (!title) {
      res.status(400).json({ message: "이벤트 제목을 입력해주세요." });
      return;
    }

    if (!summary) {
      res.status(400).json({ message: "이벤트 설명을 입력해주세요." });
      return;
    }

    const status = EVENT_STATUSES.has(statusInput) ? statusInput : existing.status;

    const updated = await communityService.updateEvent(eventId, {
      title,
      summary,
      status,
      startDate: startDateInput || existing.startDate,
      endDate: endDateInput || existing.endDate,
      image: imageInput || existing.image,
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 이벤트 데이터를 삭제합니다.
export async function deleteEvent(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "이벤트 삭제는 관리자만 가능합니다." });
      return;
    }

    const eventId = String(req.params.eventId || "").trim();
    if (!eventId) {
      res.status(400).json({ message: "삭제할 이벤트 ID가 필요합니다." });
      return;
    }

    const event = await communityService.getEvent(eventId);
    if (!event) {
      res.status(404).json({ message: "이벤트 정보를 찾을 수 없습니다." });
      return;
    }

    await communityService.deleteEvent(eventId);
    res.json({ ok: true, id: eventId });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 문의 데이터를 조회해 호출자에게 반환합니다.
export async function getInquiries(req, res, next) {
  try {
    const search = String(req.query.search || "").trim();
    const authUser = await getAuthUser(req);
    res.json(await communityService.listInquiries({
      search,
      viewerUserId: authUser?.id || "",
      viewerIsAdmin: isAdminUser(authUser),
    }));
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 문의 데이터를 조회해 호출자에게 반환합니다.
export async function getInquiry(req, res, next) {
  try {
    const inquiry = await communityService.getInquiry(req.params.inquiryId);
    if (!inquiry) {
      res.status(404).json({ message: "문의 정보를 찾을 수 없습니다." });
      return;
    }

    if (inquiry.isSecret) {
      const authUser = await getAuthUser(req);
      if (!authUser?.id) {
        res.status(401).json({ message: "비밀글은 로그인 후 조회할 수 있습니다." });
        return;
      }
      if (!canReadInquiry(authUser, inquiry)) {
        res.status(403).json({ message: "비밀글은 작성자 또는 관리자만 조회할 수 있습니다." });
        return;
      }
    }

    res.json(inquiry);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: addInquiryView 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function addInquiryView(req, res, next) {
  try {
    const inquiry = await communityService.getInquiry(req.params.inquiryId);
    if (!inquiry) {
      res.status(404).json({ message: "문의 정보를 찾을 수 없습니다." });
      return;
    }

    if (inquiry.isSecret) {
      const authUser = await getAuthUser(req);
      if (!authUser?.id) {
        res.status(401).json({ message: "비밀글은 로그인 후 조회할 수 있습니다." });
        return;
      }
      if (!canReadInquiry(authUser, inquiry)) {
        res.status(403).json({ message: "비밀글은 작성자 또는 관리자만 조회할 수 있습니다." });
        return;
      }
    }

    await communityService.increaseInquiryViews(req.params.inquiryId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 문의 데이터를 새로 생성합니다.
export async function createInquiry(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const title = stripHtml(req.body?.title);
    const content = stripHtml(req.body?.content);
    const imageUrl = normalizeMediaUrl(req.body?.imageUrl);
    const videoUrl = normalizeMediaUrl(req.body?.videoUrl);
    const author = authUser.name || authUser.loginId || authUser.email || "익명";

    if (!title) {
      res.status(400).json({ message: "문의 제목을 입력해주세요." });
      return;
    }
    if (!content) {
      res.status(400).json({ message: "문의 내용을 입력해주세요." });
      return;
    }

    const inquiry = await communityService.createInquiry({
      title,
      content,
      imageUrl,
      videoUrl,
      author,
      authorId: authUser.id,
      isSecret: Boolean(req.body?.isSecret),
    });

    res.status(201).json(inquiry);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 문의 데이터를 수정합니다.
export async function updateInquiry(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const inquiryId = String(req.params.inquiryId || "").trim();
    if (!inquiryId) {
      res.status(400).json({ message: "수정할 문의 ID가 필요합니다." });
      return;
    }

    const inquiry = await communityService.getInquiry(inquiryId);
    if (!inquiry) {
      res.status(404).json({ message: "문의 정보를 찾을 수 없습니다." });
      return;
    }

    if (!isAdminUser(authUser) && !isSameUser(authUser.id, inquiry.authorId)) {
      res.status(403).json({ message: "문의 수정 권한이 없습니다." });
      return;
    }

    const title = String(req.body?.title || "").trim();
    const content = String(req.body?.content || "").trim();
    const imageUrl = normalizeMediaUrl(req.body?.imageUrl);
    const videoUrl = normalizeMediaUrl(req.body?.videoUrl);
    const isSecret = Boolean(req.body?.isSecret);

    if (!title) {
      res.status(400).json({ message: "문의 제목을 입력해주세요." });
      return;
    }
    if (!content) {
      res.status(400).json({ message: "문의 내용을 입력해주세요." });
      return;
    }

    const updated = await communityService.updateInquiry(inquiryId, {
      title,
      content,
      imageUrl,
      videoUrl,
      isSecret,
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 문의 데이터를 삭제합니다.
export async function deleteInquiry(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const inquiryId = String(req.params.inquiryId || "").trim();
    if (!inquiryId) {
      res.status(400).json({ message: "삭제할 문의 ID가 필요합니다." });
      return;
    }

    const inquiry = await communityService.getInquiry(inquiryId);
    if (!inquiry) {
      res.status(404).json({ message: "문의 정보를 찾을 수 없습니다." });
      return;
    }

    if (!isAdminUser(authUser) && !isSameUser(authUser.id, inquiry.authorId)) {
      res.status(403).json({ message: "문의 삭제 권한이 없습니다." });
      return;
    }

    await communityService.deleteInquiry(inquiryId);
    res.json({ ok: true, id: inquiryId });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: bulkDeleteInquiries 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function bulkDeleteInquiries(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "문의 일괄 삭제는 관리자만 가능합니다." });
      return;
    }

    const deleteAll = Boolean(req.body?.deleteAll);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

    if (!deleteAll && ids.length === 0) {
      res.status(400).json({ message: "삭제할 문의를 선택해주세요." });
      return;
    }

    const deletedCount = deleteAll
      ? await communityService.deleteAllInquiries()
      : await communityService.deleteInquiriesBulk(ids);

    res.json({ ok: true, deletedCount });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 문의 답변 데이터를 조회해 호출자에게 반환합니다.
export async function getInquiryReplies(req, res, next) {
  try {
    const inquiry = await communityService.getInquiry(req.params.inquiryId);
    if (!inquiry) {
      res.status(404).json({ message: "문의 정보를 찾을 수 없습니다." });
      return;
    }

    if (inquiry.isSecret) {
      const authUser = await getAuthUser(req);
      if (!authUser?.id) {
        res.status(401).json({ message: "비밀글 답변은 로그인 후 조회할 수 있습니다." });
        return;
      }
      if (!canReadInquiry(authUser, inquiry)) {
        res.status(403).json({ message: "비밀글 답변은 작성자 또는 관리자만 조회할 수 있습니다." });
        return;
      }
    }

    const replies = await communityService.listInquiryReplies(req.params.inquiryId);
    res.json({ replies });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 문의 답변 데이터를 새로 생성합니다.
export async function createInquiryReply(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "관리자만 답변을 작성할 수 있습니다." });
      return;
    }
    const content = String(req.body?.content || "").trim();
    if (!content) {
      res.status(400).json({ message: "답변 내용을 입력해주세요." });
      return;
    }
    const reply = await communityService.createInquiryReply({
      inquiryId: req.params.inquiryId,
      authorId: authUser.id,
      authorName: authUser.name || "관리자",
      content,
    });
    res.status(201).json({ reply });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 문의 답변 내용을 수정합니다.
export async function updateInquiryReply(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    const content = String(req.body?.content || "").trim();
    if (!content) {
      res.status(400).json({ message: "답변 내용을 입력해주세요." });
      return;
    }
    const updated = await communityService.updateInquiryReply(
      req.params.replyId,
      content,
      authUser.id,
      isAdminUser(authUser)
    );
    res.json({ reply: updated });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 문의 답변 데이터를 삭제합니다.
export async function deleteInquiryReply(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    await communityService.deleteInquiryReply(
      req.params.replyId,
      authUser.id,
      isAdminUser(authUser)
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

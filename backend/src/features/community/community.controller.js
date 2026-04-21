import * as authService from "../auth/auth.service.js";
import * as communityService from "./community.service.js";
import * as communitySocialService from "./community.social.service.js";

const SESSION_COOKIE_NAME = "icl_session";
const EVENT_STATUSES = new Set(["진행중", "종료"]);

function getCookieValue(req, name) {
  const cookieHeader = String(req.headers.cookie || "");
  if (!cookieHeader) return "";

  const cookieItem = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!cookieItem) return "";
  return decodeURIComponent(cookieItem.slice(name.length + 1));
}

async function getAuthUser(req) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

function isAdminUser(user) {
  if (!user) return false;
  const normalizedGrade = String(user.userGrade || "").toLowerCase();
  if (normalizedGrade === "admin0" || normalizedGrade === "admin1") return true;
  const normalizedRole = String(user.role || "").toLowerCase();
  const adminFlag = user.isAdmin === true || user.isAdmin === 1 || user.isAdmin === "1";
  return (
    normalizedRole === "admin" ||
    normalizedRole === "admin1" ||
    adminFlag ||
    user.email === "admin@iclpilates.com"
  );
}

export async function getReviews(req, res, next) {
  try {
    res.json(await communityService.listReviews());
  } catch (error) {
    next(error);
  }
}

export async function getSocialLatest(req, res, next) {
  try {
    res.json(await communitySocialService.getBrandSocialLatest());
  } catch (error) {
    next(error);
  }
}

export async function createReview(req, res, next) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const title = String(req.body?.title || "").trim();
    const content = String(req.body?.content || "").trim();

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
      author: authUser.name || authUser.loginId || authUser.email || "익명",
    });

    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
}

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

export async function addReviewView(req, res, next) {
  try {
    await communityService.increaseReviewViews(req.params.reviewId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function getReviewComments(req, res, next) {
  try {
    res.json(await communityService.listReviewComments(req.params.reviewId));
  } catch (error) {
    next(error);
  }
}

export async function createReviewComment(req, res, next) {
  try {
    const content = String(req.body?.content || "").trim();
    const author = String(req.body?.author || "").trim() || "익명";

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

export async function deleteReviewComment(req, res, next) {
  try {
    await communityService.deleteReviewComment(req.params.reviewId, req.params.commentId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function getEvents(req, res, next) {
  try {
    res.json(await communityService.listEvents());
  } catch (error) {
    next(error);
  }
}

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

export async function getInquiries(req, res, next) {
  try {
    res.json(await communityService.listInquiries());
  } catch (error) {
    next(error);
  }
}

export async function getInquiry(req, res, next) {
  try {
    const inquiry = await communityService.getInquiry(req.params.inquiryId);
    if (!inquiry) {
      res.status(404).json({ message: "문의 정보를 찾을 수 없습니다." });
      return;
    }
    res.json(inquiry);
  } catch (error) {
    next(error);
  }
}

export async function addInquiryView(req, res, next) {
  try {
    await communityService.increaseInquiryViews(req.params.inquiryId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function createInquiry(req, res, next) {
  try {
    const title = String(req.body?.title || "").trim();
    const content = String(req.body?.content || "").trim();
    const author = String(req.body?.author || "").trim() || "익명";

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
      author,
      authorId: req.body?.authorId || "",
      isSecret: Boolean(req.body?.isSecret),
    });

    res.status(201).json(inquiry);
  } catch (error) {
    next(error);
  }
}

export async function getInquiryReplies(req, res, next) {
  try {
    const replies = await communityService.listInquiryReplies(req.params.inquiryId);
    res.json({ replies });
  } catch (error) {
    next(error);
  }
}

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

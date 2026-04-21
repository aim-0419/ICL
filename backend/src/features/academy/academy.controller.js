import * as authService from "../auth/auth.service.js";
import * as academyService from "./academy.service.js";

const SESSION_COOKIE_NAME = "icl_session";

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

function resolveUserGrade(user) {
  const grade = String(user?.userGrade || "")
    .trim()
    .toLowerCase();

  if (grade === "admin0" || grade === "admin1") return grade;

  const normalizedRole = String(user?.role || "")
    .trim()
    .toLowerCase();
  const adminFlag = user?.isAdmin === true || user?.isAdmin === 1 || user?.isAdmin === "1";

  if (adminFlag || normalizedRole === "admin") return "admin0";
  if (normalizedRole === "admin1") return "admin1";
  return "member";
}

function canManageAcademy(user) {
  const grade = resolveUserGrade(user);
  return grade === "admin0" || grade === "admin1";
}

async function getAuthenticatedUser(req) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

export async function getAcademyVideos(req, res, next) {
  try {
    const videos = await academyService.listAcademyVideos();
    res.json({ videos });
  } catch (error) {
    next(error);
  }
}

export async function getAcademyVideoChapters(req, res, next) {
  try {
    const videoId = String(req.params.videoId || "").trim();
    if (!videoId) {
      res.status(400).json({ message: "강의 정보가 올바르지 않습니다." });
      return;
    }

    const chapters = await academyService.listAcademyChaptersByVideoId(videoId);
    res.json({ chapters });
  } catch (error) {
    next(error);
  }
}

export async function getAcademyInstructors(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!canManageAcademy(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const q = String(req.query?.q || "").trim();
    res.json(await academyService.listAcademyInstructors(q));
  } catch (error) {
    next(error);
  }
}

export async function getAcademyProgress(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const items = await academyService.listAcademyProgressByUserId(authUser.id);
    const chapterItems = await academyService.listAcademyChapterProgressByUserId(authUser.id);
    res.json({ items, chapterItems });
  } catch (error) {
    next(error);
  }
}

export async function saveAcademyProgress(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const videoId = String(req.params.videoId || "").trim();
    if (!videoId) {
      res.status(400).json({ message: "강의 정보가 올바르지 않습니다." });
      return;
    }

    const chapterId = String(req.body?.chapterId || "").trim();
    const canAccess = await academyService.hasAcademyVideoAccess(authUser, videoId);
    if (!canAccess) {
      if (!chapterId) {
        res.status(403).json({ message: "수강 권한이 없는 강의입니다." });
        return;
      }

      const canPreview = await academyService.hasAcademyPreviewChapterAccess(videoId, chapterId);
      if (!canPreview) {
        res.status(403).json({ message: "미리보기 허용 차시만 재생할 수 있습니다." });
        return;
      }
    }

    const item = await academyService.saveAcademyProgress({
      userId: authUser.id,
      videoId,
      chapterId,
      currentTime: req.body?.currentTime,
      duration: req.body?.duration,
      completed: req.body?.completed,
    });

    res.json(item);
  } catch (error) {
    next(error);
  }
}

export async function saveAcademyChapterProgress(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const videoId = String(req.params.videoId || "").trim();
    const chapterId = String(req.params.chapterId || "").trim();
    if (!videoId || !chapterId) {
      res.status(400).json({ message: "차시 정보가 올바르지 않습니다." });
      return;
    }

    const canAccess = await academyService.hasAcademyVideoAccess(authUser, videoId);
    if (!canAccess) {
      const canPreview = await academyService.hasAcademyPreviewChapterAccess(videoId, chapterId);
      if (!canPreview) {
        res.status(403).json({ message: "미리보기 허용 차시만 재생할 수 있습니다." });
        return;
      }
    }

    const saved = await academyService.saveAcademyChapterProgress({
      userId: authUser.id,
      videoId,
      chapterId,
      currentTime: req.body?.currentTime,
      duration: req.body?.duration,
      completed: req.body?.completed,
    });

    res.json(saved);
  } catch (error) {
    next(error);
  }
}

export async function createAcademyVideo(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!canManageAcademy(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const created = await academyService.createAcademyVideo(req.body || {});
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function updateAcademyVideoHandler(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!canManageAcademy(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const videoId = String(req.params.videoId || "").trim();
    if (!videoId) {
      res.status(400).json({ message: "강의 ID가 올바르지 않습니다." });
      return;
    }

    const updated = await academyService.updateAcademyVideo(videoId, req.body || {});
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function deleteAcademyVideoHandler(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!canManageAcademy(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const videoId = String(req.params.videoId || "").trim();
    if (!videoId) {
      res.status(400).json({ message: "강의 ID가 올바르지 않습니다." });
      return;
    }

    const result = await academyService.deleteAcademyVideo(videoId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function uploadAcademyAsset(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!canManageAcademy(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const kind = String(req.query.kind || "")
      .trim()
      .toLowerCase();

    const fileNameHeader = req.headers["x-file-name"];
    const fileName = Array.isArray(fileNameHeader) ? fileNameHeader[0] : fileNameHeader;

    const mimeTypeHeader = req.headers["content-type"];
    const mimeType = Array.isArray(mimeTypeHeader) ? mimeTypeHeader[0] : mimeTypeHeader;

    const assetPath = await academyService.saveAcademyAsset({
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

// ─── 리뷰 ──────────────────────────────────────────────────────────────────────

export async function getLatestAcademyReviews(req, res, next) {
  try {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 6));
    const rows = await academyService.listLatestAcademyReviews(limit);
    res.json({ reviews: rows });
  } catch (error) { next(error); }
}

export async function getAcademyReviews(req, res, next) {
  try {
    const { videoId } = req.params;
    const reviews = await academyService.listAcademyReviews(videoId);
    res.json({ reviews });
  } catch (error) {
    next(error);
  }
}

export async function createAcademyReview(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ message: "로그인이 필요합니다." });

    const { videoId } = req.params;
    const { rating, content } = req.body || {};
    const review = await academyService.createAcademyReview(
      authUser.id,
      authUser.name || authUser.loginId || "회원",
      videoId,
      rating,
      content
    );
    res.status(201).json({ review });
  } catch (error) {
    next(error);
  }
}

export async function deleteAcademyReview(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ message: "로그인이 필요합니다." });

    const { reviewId } = req.params;
    await academyService.deleteAcademyReview(reviewId, authUser.id, canManageAcademy(authUser));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

// ─── Q&A ───────────────────────────────────────────────────────────────────────

export async function getAcademyQna(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const { videoId } = req.params;
    const posts = await academyService.listAcademyQna(
      videoId,
      authUser?.id || null,
      canManageAcademy(authUser)
    );
    res.json({ posts });
  } catch (error) {
    next(error);
  }
}

export async function createAcademyQnaPost(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ message: "로그인이 필요합니다." });

    const { videoId } = req.params;
    const { title, content, isSecret } = req.body || {};
    const post = await academyService.createAcademyQnaPost(
      authUser.id,
      authUser.name || authUser.loginId || "회원",
      videoId,
      title,
      content,
      Boolean(isSecret)
    );
    res.status(201).json({ post });
  } catch (error) {
    next(error);
  }
}

export async function createAcademyQnaReply(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ message: "로그인이 필요합니다." });

    const { postId } = req.params;
    const { content } = req.body || {};
    const reply = await academyService.createAcademyQnaReply(
      authUser.id,
      authUser.name || authUser.loginId || "회원",
      postId,
      content,
      canManageAcademy(authUser)
    );
    res.status(201).json({ reply });
  } catch (error) {
    next(error);
  }
}

export async function deleteAcademyQnaPost(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ message: "로그인이 필요합니다." });

    const { postId } = req.params;
    await academyService.deleteAcademyQnaPost(postId, authUser.id, canManageAcademy(authUser));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function deleteAcademyQnaReply(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ message: "로그인이 필요합니다." });

    const { replyId } = req.params;
    await academyService.deleteAcademyQnaReply(replyId, authUser.id, canManageAcademy(authUser));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

// 파일 역할: 아카데미 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as authService from "../auth/auth.service.js";
import * as academyService from "./academy.service.js";
import * as academyPlaybackService from "./academy.playback.service.js";

const SESSION_COOKIE_NAME = "icl_session";

// 함수 역할: 쿠키 값 데이터를 조회해 호출자에게 반환합니다.
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

// 함수 역할: 회원 등급 상황에 맞는 값을 계산하거나 선택합니다.
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

// 함수 역할: manage 아카데미 권한이 있는지 참/거짓으로 판별합니다.
function canManageAcademy(user) {
  const grade = resolveUserGrade(user);
  return grade === "admin0" || grade === "admin1";
}

// 함수 역할: 인증된 회원 데이터를 조회해 호출자에게 반환합니다.
async function getAuthenticatedUser(req) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

// 함수 역할: request IP 상황에 맞는 값을 계산하거나 선택합니다.
function resolveRequestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0];

  if (forwarded) return forwarded;
  return String(req.ip || req.socket?.remoteAddress || "").trim();
}

// 함수 역할: 아카데미 강의 영상 데이터를 조회해 호출자에게 반환합니다.
export async function getAcademyVideos(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const canManage = canManageAcademy(authUser);
    const videos = await academyService.listAcademyVideos({
      includeHidden: canManage,
      includeUnpublished: canManage,
    });
    res.json({ videos });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 아카데미 강의 영상 차시 데이터를 조회해 호출자에게 반환합니다.
export async function getAcademyVideoChapters(req, res, next) {
  try {
    const videoId = String(req.params.videoId || "").trim();
    if (!videoId) {
      res.status(400).json({ message: "강의 정보가 올바르지 않습니다." });
      return;
    }

    const authUser = await getAuthenticatedUser(req);
    const canManage = canManageAcademy(authUser);
    if (!canManage) {
      const canSee = await academyService.isAcademyVideoVisibleForPublic(videoId);
      if (!canSee) {
        res.status(404).json({ message: "강의 정보를 찾을 수 없습니다." });
        return;
      }
    }

    const chapters = await academyService.listAcademyChaptersByVideoId(videoId);
    res.json({ chapters });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 아카데미 영상 재생 세션 데이터를 새로 생성합니다.
export async function createAcademyPlaybackSession(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const videoId = String(req.body?.videoId || "").trim();
    const chapterId = String(req.body?.chapterId || "").trim();

    if (!videoId) {
      res.status(400).json({ message: "강의 정보가 올바르지 않습니다." });
      return;
    }

    const session = await academyPlaybackService.issueAcademyPlaybackSession({
      user: authUser,
      videoId,
      chapterId,
      ipAddress: resolveRequestIp(req),
      userAgent: String(req.headers["user-agent"] || ""),
    });

    const host = String(req.get("host") || "").trim();
    const protocol = String(req.protocol || "http").trim() || "http";
    const playbackUrl = String(session?.playbackUrl || "").trim();
    const absolutePlaybackUrl =
      playbackUrl && /^https?:\/\//i.test(playbackUrl)
        ? playbackUrl
        : host && playbackUrl
          ? `${protocol}://${host}${playbackUrl}`
          : playbackUrl;

    res.json({
      ...session,
      playbackUrl: absolutePlaybackUrl,
    });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 재생 중인 세션의 활동 시간을 갱신하고 토큰 유효성을 확인합니다.
export async function heartbeatAcademyPlaybackSession(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const token = String(req.body?.token || "").trim();
    if (!token) {
      res.status(400).json({ message: "재생 토큰이 필요합니다." });
      return;
    }

    const result = await academyPlaybackService.heartbeatAcademyPlaybackSession({
      token,
      user: authUser,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: streamAcademyPlayback 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function streamAcademyPlayback(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const chapterId = String(req.params.chapterId || "").trim();
    const token = String(req.query?.token || "").trim();
    if (!chapterId || !token) {
      res.status(400).json({ message: "재생 정보가 올바르지 않습니다." });
      return;
    }

    const streamMeta = await academyPlaybackService.resolveAcademyPlaybackStream({
      chapterId,
      token,
      user: authUser,
    });

    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Accept-Ranges", "bytes");
    if (streamMeta.mimeType) {
      res.type(streamMeta.mimeType);
    }

    res.sendFile(streamMeta.filePath);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 아카데미 강사 데이터를 조회해 호출자에게 반환합니다.
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

// 함수 역할: 아카데미 학습 진도 데이터를 조회해 호출자에게 반환합니다.
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

// 함수 역할: 이전 단일 강의 진도 API와 호환되도록 차시 진도 저장 후 강의 전체 진도를 반환합니다.
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

// 함수 역할: 회원의 특정 차시 시청 위치와 완료 여부를 저장합니다.
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

// 함수 역할: 관리자 입력값을 검증한 뒤 상품, 강의, 차시 데이터를 새로 등록합니다.
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

// 함수 역할: 아카데미 강의 영상 handler 데이터를 수정합니다.
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

// 함수 역할: 아카데미 강의 영상 handler 데이터를 삭제합니다.
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

// 함수 역할: setAcademyVideoVisibilityHandler 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function setAcademyVideoVisibilityHandler(req, res, next) {
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

    const isHidden = Boolean(req.body?.isHidden);
    const result = await academyService.setAcademyVideoHidden(videoId, isHidden);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 아카데미 업로드 파일 파일을 서버로 업로드합니다.
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

    const videoId = String(req.query.videoId || "").trim();
    const chapterOrder = String(req.query.chapterOrder || "").trim();

    const fileNameHeader = req.headers["x-file-name"];
    const fileName = Array.isArray(fileNameHeader) ? fileNameHeader[0] : fileNameHeader;

    const mimeTypeHeader = req.headers["content-type"];
    const mimeType = Array.isArray(mimeTypeHeader) ? mimeTypeHeader[0] : mimeTypeHeader;

    const assetPath = await academyService.saveAcademyAsset({
      kind,
      fileName,
      mimeType,
      buffer: req.body,
      videoId,
      chapterOrder,
    });

    res.status(201).json({ assetPath });
  } catch (error) {
    next(error);
  }
}

// ─── 리뷰 ──────────────────────────────────────────────────────────────────────

// 함수 역할: 최신 아카데미 후기 데이터를 조회해 호출자에게 반환합니다.
export async function getLatestAcademyReviews(req, res, next) {
  try {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 6));
    const rows = await academyService.listLatestAcademyReviews(limit);
    res.json({ reviews: rows });
  } catch (error) { next(error); }
}

// 함수 역할: 아카데미 후기 데이터를 조회해 호출자에게 반환합니다.
export async function getAcademyReviews(req, res, next) {
  try {
    const { videoId } = req.params;
    const reviews = await academyService.listAcademyReviews(videoId);
    res.json({ reviews });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 아카데미 후기 데이터를 새로 생성합니다.
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
      content,
      canManageAcademy(authUser)
    );
    res.status(201).json({ review });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 아카데미 후기 데이터를 삭제합니다.
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

// 함수 역할: 아카데미 Q&A 데이터를 조회해 호출자에게 반환합니다.
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

// 함수 역할: 로그인 회원이 작성한 아카데미 Q&A 목록과 답변 상태를 조회합니다.
export async function getMyAcademyQna(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const items = await academyService.listMyAcademyQna(authUser.id);
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 아카데미 Q&A 게시글 데이터를 새로 생성합니다.
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

// 함수 역할: 아카데미 Q&A 답변 데이터를 새로 생성합니다.
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

// 함수 역할: 아카데미 Q&A 게시글 데이터를 삭제합니다.
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

// 함수 역할: 아카데미 Q&A 답변 데이터를 삭제합니다.
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


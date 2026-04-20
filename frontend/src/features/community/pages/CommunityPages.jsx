import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { apiRequest } from "../../../shared/api/client.js";
import { isAdminStaff } from "../../../shared/auth/userRoles.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

// 커뮤니티 페이지 파일은 후기 / 문의 / 이벤트 목록과 상세 화면을 함께 담고 있다.
const POSTS_PER_PAGE = 8;
const REVIEW_IMAGES = [
  "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1549576490-b0b4831ef60a?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=1600&q=80",
];
const EVENT_CATEGORIES = ["전체", "진행중", "종료"];
const FALLBACK_EVENT_IMAGE =
  "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80";

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatPeriod(startDate, endDate) {
  const start = String(startDate || "").trim();
  const end = String(endDate || "").trim();
  if (!start && !end) return "일정 미정";
  if (!end) return start;
  if (!start) return end;
  return `${start} ~ ${end}`;
}

function usePaging(items, page) {
  const totalPages = Math.max(1, Math.ceil(items.length / POSTS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * POSTS_PER_PAGE;
  return { totalPages, safePage, start, currentItems: items.slice(start, start + POSTS_PER_PAGE) };
}

// 게시판 유형이 달라도 같은 페이지네이션 UI를 재사용한다.
function Pagination({ page, totalPages, setPage, ariaLabel }) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <section className="community-board-pagination" aria-label={ariaLabel}>
      {pages.map((n) => (
        <button
          key={n}
          type="button"
          className={`community-page-button${n === page ? " active" : ""}`}
          onClick={() => setPage(n)}
        >
          {n}
        </button>
      ))}
    </section>
  );
}

// 후기 게시판은 회원이 직접 글을 작성할 수 있는 공개 게시판이다.
export function CommunityReviewsPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("latest");
  const [page, setPage] = useState(1);
  const [isWriteOpen, setIsWriteOpen] = useState(false);
  const [writeTitle, setWriteTitle] = useState("");
  const [writeContent, setWriteContent] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    apiRequest("/community/reviews")
      .then((rows) => {
        setPosts(
          Array.isArray(rows)
            ? rows.map((p) => ({ ...p, views: toNumber(p.views), comments: toNumber(p.comments) }))
            : []
        );
      })
      .catch((error) => setErrorMessage(error.message));
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((p) => (!q ? true : `${p.title} ${p.author}`.toLowerCase().includes(q)));
  }, [posts, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "views") return toNumber(b.views) - toNumber(a.views);
      if (sortBy === "comments") return toNumber(b.comments) - toNumber(a.comments);
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
  }, [filtered, sortBy]);

  const { totalPages, safePage, start, currentItems } = usePaging(sorted, page);

  // 등록 성공 시 목록 앞에 즉시 반영하고 상세 페이지로 이동한다.
  async function handleCreateReview(event) {
    event.preventDefault();

    if (!store.currentUser) {
      alert("후기 작성은 로그인 후 이용 가능합니다.");
      navigate("/login");
      return;
    }

    const title = writeTitle.trim();
    const content = writeContent.trim();

    if (!title) {
      alert("후기 제목을 입력해주세요.");
      return;
    }

    if (!content) {
      alert("후기 내용을 입력해주세요.");
      return;
    }

    try {
      const created = await apiRequest("/community/reviews", {
        method: "POST",
        body: { title, content },
      });

      setPosts((cur) => [{ ...created, views: toNumber(created.views), comments: 0 }, ...cur]);
      setWriteTitle("");
      setWriteContent("");
      setIsWriteOpen(false);
      setPage(1);
      navigate(`/community/reviews/${created.id}`);
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page reviews-board-page">
        <section className="content-hero">
          <p className="section-kicker">커뮤니티 · 후기</p>
          <h1>회원 후기 게시판</h1>
        </section>

        <section className="community-board-toolbar">
          <p>전체 게시글 {sorted.length}건</p>
          <div className="community-board-toolbar-right">
            <label className="community-board-sort">
              <span className="visually-hidden">정렬</span>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
              >
                <option value="latest">최신 작성순</option>
                <option value="views">조회 높은순</option>
                <option value="comments">댓글 많은순</option>
              </select>
            </label>

            <label className="community-board-search">
              <span className="visually-hidden">검색</span>
              <input
                type="search"
                placeholder="제목/작성자 검색"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>

            <button
              type="button"
              className="ghost-button small-ghost community-write-button"
              onClick={() => setIsWriteOpen((v) => !v)}
            >
              {isWriteOpen ? "작성 닫기" : "글쓰기"}
            </button>
          </div>
        </section>

        {isWriteOpen ? (
          <section className="inquiry-write-panel">
            <h2>후기글 작성</h2>
            <form className="inquiry-write-form" onSubmit={handleCreateReview}>
              <label>
                제목
                <input type="text" value={writeTitle} onChange={(e) => setWriteTitle(e.target.value)} />
              </label>

              <label>
                내용
                <textarea rows={8} value={writeContent} onChange={(e) => setWriteContent(e.target.value)} />
              </label>

              <div className="inquiry-write-actions">
                <button
                  type="button"
                  className="ghost-button small-ghost"
                  onClick={() => setIsWriteOpen(false)}
                >
                  취소
                </button>
                <button type="submit" className="pill-button small">
                  등록하기
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="community-board">
          <div className="community-board-scroll">
            <div className="community-board-head">
              <span>번호</span>
              <span>제목</span>
              <span>작성자</span>
              <span>작성일</span>
              <span>조회</span>
            </div>

            {errorMessage ? (
              <article className="community-board-empty">
                <p>{errorMessage}</p>
              </article>
            ) : null}

            {!errorMessage && currentItems.length === 0 ? (
              <article className="community-board-empty">
                <p>게시글이 없습니다.</p>
              </article>
            ) : null}

            {!errorMessage &&
              currentItems.map((post, index) => (
                <article
                  key={post.id}
                  className="community-board-row interactive"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/community/reviews/${post.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/community/reviews/${post.id}`);
                    }
                  }}
                >
                  <span>{sorted.length - start - index}</span>
                  <span className="community-board-title">{post.title}</span>
                  <span>{post.author}</span>
                  <time>{post.date}</time>
                  <span>{post.views}</span>
                </article>
              ))}
          </div>
        </section>

        <Pagination page={safePage} totalPages={totalPages} setPage={setPage} ariaLabel="후기 페이지네이션" />
      </main>
    </div>
  );
}

// 후기 상세는 본문과 댓글을 함께 다루며, 진입 시 조회수를 증가시킨다.
export function CommunityReviewDetailPage() {
  const store = useAppStore();
  const { reviewId } = useParams();
  const [review, setReview] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentText, setCommentText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (store.currentUser?.name) {
      setCommentAuthor(store.currentUser.name);
    }
  }, [store.currentUser]);

  useEffect(() => {
    (async () => {
      try {
        await apiRequest(`/community/reviews/${reviewId}/views`, { method: "POST" });
        const [post, cmts] = await Promise.all([
          apiRequest(`/community/reviews/${reviewId}`),
          apiRequest(`/community/reviews/${reviewId}/comments`),
        ]);
        setReview(post);
        setComments(Array.isArray(cmts) ? cmts : []);
      } catch (error) {
        setErrorMessage(error.message);
      }
    })();
  }, [reviewId]);

  if (errorMessage || !review) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main className="content-page reviews-board-page">
          <section className="community-board-empty">
            <p>{errorMessage || "후기 정보를 찾을 수 없습니다."}</p>
            <Link className="pill-button" to="/community/reviews">
              후기 목록으로
            </Link>
          </section>
        </main>
      </div>
    );
  }

  const image = REVIEW_IMAGES[(Number(String(review.id).replace(/\D/g, "")) || 0) % REVIEW_IMAGES.length];
  const contentParagraphs = String(review.content || "").split("\n");

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page review-detail-page">
        <section className="review-detail-card">
          <header className="review-detail-head">
            <Link className="review-detail-back-link" to="/community/reviews">
              후기 게시판
            </Link>
            <h1>{review.title}</h1>
            <div className="review-detail-meta">
              <span>작성자 {review.author}</span>
              <time>{review.date}</time>
              <span>조회 {review.views}</span>
            </div>
          </header>

          <div className="review-detail-media">
            <img src={image} alt={review.title} />
          </div>

          <article className="review-detail-body">
            {contentParagraphs.some((line) => line.trim()) ? (
              contentParagraphs.map((paragraph, index) => (
                <p key={`${review.id}-${index}`}>{paragraph || "\u00A0"}</p>
              ))
            ) : (
              <p>등록된 후기 본문이 없습니다.</p>
            )}
          </article>

          <section className="review-comment-section">
            <h2>댓글 {comments.length}</h2>

            <form
              className="review-comment-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const content = commentText.trim();
                if (!content) {
                  alert("댓글 내용을 입력해주세요.");
                  return;
                }
                try {
                  const created = await apiRequest(`/community/reviews/${reviewId}/comments`, {
                    method: "POST",
                    body: {
                      author: (commentAuthor || store.currentUser?.name || "익명").trim(),
                      content,
                    },
                  });
                  setComments((cur) => [created, ...cur]);
                  setCommentText("");
                } catch (error) {
                  alert(error.message);
                }
              }}
            >
              <input
                type="text"
                placeholder="작성자"
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
              />
              <textarea
                rows={3}
                placeholder="댓글을 입력해주세요."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button type="submit" className="pill-button small">
                댓글 등록
              </button>
            </form>

            <div className="review-comment-list">
              {comments.map((comment) => (
                <article className="review-comment-item" key={comment.id}>
                  <div className="review-comment-meta">
                    <strong>{comment.author}</strong>
                    <time>{comment.createdAt}</time>
                  </div>
                  <p>{comment.content}</p>
                  <button
                    type="button"
                    className="review-comment-delete"
                    onClick={async () => {
                      try {
                        await apiRequest(`/community/reviews/${reviewId}/comments/${comment.id}`, {
                          method: "DELETE",
                        });
                        setComments((cur) => cur.filter((x) => x.id !== comment.id));
                      } catch (error) {
                        alert(error.message);
                      }
                    }}
                  >
                    삭제
                  </button>
                </article>
              ))}
            </div>
          </section>

          <footer className="review-detail-actions">
            <Link className="ghost-button" to="/community/reviews">
              목록으로
            </Link>
          </footer>
        </section>
      </main>
    </div>
  );
}

// 문의 게시판은 로그인 사용자가 비밀글 여부를 선택해 글을 남길 수 있다.
export function CommunityInquiryPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("latest");
  const [page, setPage] = useState(1);
  const [isWriteOpen, setIsWriteOpen] = useState(false);
  const [writeTitle, setWriteTitle] = useState("");
  const [writeContent, setWriteContent] = useState("");
  const [writeSecret, setWriteSecret] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    apiRequest("/community/inquiries")
      .then((rows) =>
        setPosts(
          Array.isArray(rows)
            ? rows.map((p) => ({ ...p, views: toNumber(p.views), isSecret: Boolean(p.isSecret) }))
            : []
        )
      )
      .catch((e) => setErrorMessage(e.message));
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((p) => (!q ? true : `${p.title} ${p.author}`.toLowerCase().includes(q)));
  }, [posts, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "views") return toNumber(b.views) - toNumber(a.views);
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
  }, [filtered, sortBy]);

  const { totalPages, safePage, start, currentItems } = usePaging(sorted, page);

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page reviews-board-page">
        <section className="content-hero">
          <p className="section-kicker">커뮤니티 · 문의하기</p>
          <h1>문의 게시판</h1>
        </section>

        <section className="community-board-toolbar">
          <p>전체 게시글 {sorted.length}건</p>
          <div className="community-board-toolbar-right">
            <label className="community-board-sort">
              <span className="visually-hidden">정렬</span>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
              >
                <option value="latest">최신 작성순</option>
                <option value="views">조회 높은순</option>
              </select>
            </label>

            <label className="community-board-search">
              <span className="visually-hidden">검색</span>
              <input
                type="search"
                placeholder="제목/작성자 검색"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>

            <button
              type="button"
              className="ghost-button small-ghost community-write-button"
              onClick={() => setIsWriteOpen((v) => !v)}
            >
              {isWriteOpen ? "작성 닫기" : "글쓰기"}
            </button>
          </div>
        </section>

        {isWriteOpen ? (
          <section className="inquiry-write-panel">
            <h2>문의글 작성</h2>
            <form
              className="inquiry-write-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!store.currentUser) {
                  alert("문의글 등록은 로그인 후 이용 가능합니다.");
                  navigate("/login");
                  return;
                }
                const title = writeTitle.trim();
                const content = writeContent.trim();
                if (!title) {
                  alert("문의 제목을 입력해주세요.");
                  return;
                }
                if (!content) {
                  alert("문의 내용을 입력해주세요.");
                  return;
                }
                try {
                  const created = await apiRequest("/community/inquiries", {
                    method: "POST",
                    body: {
                      title,
                      content,
                      author: store.currentUser?.name || store.currentUser?.email || "익명",
                      authorId: store.currentUser?.id || "",
                      isSecret: writeSecret,
                    },
                  });
                  setPosts((cur) => [created, ...cur]);
                  setWriteTitle("");
                  setWriteContent("");
                  setWriteSecret(false);
                  setIsWriteOpen(false);
                  setPage(1);
                  navigate(`/community/inquiry/${created.id}`);
                } catch (error) {
                  alert(error.message);
                }
              }}
            >
              <label>
                제목
                <input type="text" value={writeTitle} onChange={(e) => setWriteTitle(e.target.value)} />
              </label>

              <label>
                내용
                <textarea rows={6} value={writeContent} onChange={(e) => setWriteContent(e.target.value)} />
              </label>

              <label className="inquiry-secret-field">
                <input
                  type="checkbox"
                  checked={writeSecret}
                  onChange={(e) => setWriteSecret(e.target.checked)}
                />
                <span>비밀글 설정 (작성자와 관리자만 열람)</span>
              </label>

              <div className="inquiry-write-actions">
                <button
                  type="button"
                  className="ghost-button small-ghost"
                  onClick={() => setIsWriteOpen(false)}
                >
                  취소
                </button>
                <button type="submit" className="pill-button small">
                  등록하기
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="community-board">
          <div className="community-board-scroll">
            <div className="community-board-head">
              <span>번호</span>
              <span>제목</span>
              <span>작성자</span>
              <span>작성일</span>
              <span>조회</span>
            </div>

            {errorMessage ? (
              <article className="community-board-empty">
                <p>{errorMessage}</p>
              </article>
            ) : null}

            {!errorMessage &&
              currentItems.map((post, index) => (
                <article
                  key={post.id}
                  className="community-board-row interactive"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/community/inquiry/${post.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/community/inquiry/${post.id}`);
                    }
                  }}
                >
                  <span>{sorted.length - start - index}</span>
                  <span className={`community-board-title${post.isSecret ? " has-secret" : ""}`}>
                    {post.isSecret ? <span className="secret-lock-icon">🔒</span> : null}
                    {post.title}
                  </span>
                  <span>{post.author}</span>
                  <time>{post.date}</time>
                  <span>{post.views}</span>
                </article>
              ))}
          </div>
        </section>

        <Pagination page={safePage} totalPages={totalPages} setPage={setPage} ariaLabel="문의 페이지네이션" />
      </main>
    </div>
  );
}

// 비밀 문의는 작성자 또는 관리자만 본문을 열람할 수 있다.
export function CommunityInquiryDetailPage() {
  const store = useAppStore();
  const { inquiryId } = useParams();
  const viewedRef = useRef("");
  const [post, setPost] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const inquiry = await apiRequest(`/community/inquiries/${inquiryId}`);
        const isAuthor = Boolean(store.currentUser && store.currentUser.id === inquiry.authorId);
        const canRead = Boolean(!inquiry.isSecret || isAuthor || isAdminStaff(store.currentUser));

        if (canRead && viewedRef.current !== inquiryId) {
          viewedRef.current = inquiryId;
          await apiRequest(`/community/inquiries/${inquiryId}/views`, { method: "POST" });
          setPost(await apiRequest(`/community/inquiries/${inquiryId}`));
        } else {
          setPost(inquiry);
        }
      } catch (error) {
        setErrorMessage(error.message);
      }
    })();
  }, [inquiryId, store.currentUser?.id, store.currentUser?.role, store.currentUser?.isAdmin]);

  if (errorMessage || !post) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main className="content-page reviews-board-page">
          <section className="community-board-empty">
            <p>{errorMessage || "문의 정보를 찾을 수 없습니다."}</p>
            <Link className="pill-button" to="/community/inquiry">
              문의 목록으로
            </Link>
          </section>
        </main>
      </div>
    );
  }

  const isAuthor = Boolean(store.currentUser && store.currentUser.id === post.authorId);
  const canRead = Boolean(!post.isSecret || isAuthor || isAdminStaff(store.currentUser));

  if (!canRead) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main className="content-page review-detail-page inquiry-private-page">
          <section className="review-detail-card inquiry-private-card">
            <section className="inquiry-private-content">
              <span className="inquiry-private-lock">🔒</span>
              <h1>비밀글입니다.</h1>
              <p className="inquiry-access-note">
                해당 문의 내용은 작성자와 관리자만 확인할 수 있습니다.
              </p>
              <div className="inquiry-private-actions">
                <Link className="pill-button white" to="/community/inquiry">
                  목록으로
                </Link>
              </div>
            </section>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page review-detail-page">
        <section className="review-detail-card">
          <header className="review-detail-head">
            <Link className="review-detail-back-link" to="/community/inquiry">
              문의 게시판
            </Link>
            <div className="inquiry-detail-title-row">
              <h1>
                {post.isSecret ? <span className="secret-lock-icon">🔒</span> : null}
                {post.title}
              </h1>
            </div>
            <div className="review-detail-meta">
              <span>작성자 {post.author}</span>
              <time>{post.date}</time>
              <span>조회 {post.views}</span>
            </div>
          </header>

          <section className="review-detail-summary-box">
            <strong>답변 안내</strong>
            <p>문의글은 접수 순서대로 확인하며 영업일 기준으로 회신 드립니다.</p>
          </section>

          <article className="review-detail-body inquiry-detail-body">
            {String(post.content || "")
              .split("\n")
              .map((p, i) => (
                <p key={`${post.id}-${i}`}>{p || "\u00A0"}</p>
              ))}
          </article>

          <footer className="review-detail-actions">
            <Link className="ghost-button" to="/community/inquiry">
              목록으로
            </Link>
          </footer>
        </section>
      </main>
    </div>
  );
}

// 이벤트 게시판은 관리자만 작성할 수 있고, 일반 사용자는 조회만 가능하다.
export function CommunityEventsPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const canWriteEvent = isAdminStaff(store.currentUser);
  const [events, setEvents] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [isWriteOpen, setIsWriteOpen] = useState(false);
  const [writeTitle, setWriteTitle] = useState("");
  const [writeSummary, setWriteSummary] = useState("");
  const [writeStatus, setWriteStatus] = useState("진행중");
  const [writeStartDate, setWriteStartDate] = useState("");
  const [writeEndDate, setWriteEndDate] = useState("");
  const [writeImage, setWriteImage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    apiRequest("/community/events")
      .then((rows) => setEvents(Array.isArray(rows) ? rows : []))
      .catch((e) => setErrorMessage(e.message));
  }, []);

  const filtered = useMemo(() => {
    return events.filter((eventItem) => {
      const q = searchQuery.trim().toLowerCase();
      if (selectedCategory !== "전체" && eventItem.status !== selectedCategory) return false;
      return !q ? true : `${eventItem.title} ${eventItem.status}`.toLowerCase().includes(q);
    });
  }, [events, searchQuery, selectedCategory]);

  async function handleCreateEvent(event) {
    event.preventDefault();

    if (!store.currentUser) {
      alert("이벤트 작성은 로그인 후 이용 가능합니다.");
      navigate("/login");
      return;
    }

    if (!canWriteEvent) {
      alert("이벤트 작성은 관리자만 가능합니다.");
      return;
    }

    const title = writeTitle.trim();
    const summary = writeSummary.trim();

    if (!title) {
      alert("이벤트 제목을 입력해주세요.");
      return;
    }

    if (!summary) {
      alert("이벤트 설명을 입력해주세요.");
      return;
    }

    try {
      const created = await apiRequest("/community/events", {
        method: "POST",
        body: {
          title,
          summary,
          status: writeStatus,
          startDate: writeStartDate,
          endDate: writeEndDate,
          image: writeImage.trim(),
        },
      });

      setEvents((cur) => [created, ...cur]);
      setSelectedCategory("전체");
      setSearchQuery("");
      setIsWriteOpen(false);
      setWriteTitle("");
      setWriteSummary("");
      setWriteStatus("진행중");
      setWriteStartDate("");
      setWriteEndDate("");
      setWriteImage("");
      navigate(`/community/events/${created.id}`);
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page events-page">
        <section className="content-hero">
          <p className="section-kicker">커뮤니티 · 이벤트</p>
          <h1>이벤트</h1>
        </section>

        <section className="events-toolbar">
          <div className="events-filter-chips" role="tablist" aria-label="이벤트 상태">
            {EVENT_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category}
                className={`event-filter-chip${selectedCategory === category ? " active" : ""}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="events-toolbar-right">
            <label className="events-search-box">
              <span className="visually-hidden">이벤트 검색</span>
              <input
                type="search"
                placeholder="이벤트 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>

            {canWriteEvent ? (
              <button
                type="button"
                className="ghost-button small-ghost community-write-button"
                onClick={() => setIsWriteOpen((v) => !v)}
              >
                {isWriteOpen ? "작성 닫기" : "이벤트 작성"}
              </button>
            ) : null}
          </div>
        </section>

        {isWriteOpen && canWriteEvent ? (
          <section className="inquiry-write-panel event-write-panel">
            <h2>이벤트 작성</h2>
            <form className="inquiry-write-form" onSubmit={handleCreateEvent}>
              <label>
                제목
                <input type="text" value={writeTitle} onChange={(e) => setWriteTitle(e.target.value)} />
              </label>

              <div className="event-write-grid">
                <label>
                  상태
                  <select value={writeStatus} onChange={(e) => setWriteStatus(e.target.value)}>
                    <option value="진행중">진행중</option>
                    <option value="종료">종료</option>
                  </select>
                </label>

                <label>
                  시작일
                  <input
                    type="date"
                    value={writeStartDate}
                    onChange={(e) => setWriteStartDate(e.target.value)}
                  />
                </label>

                <label>
                  종료일
                  <input type="date" value={writeEndDate} onChange={(e) => setWriteEndDate(e.target.value)} />
                </label>
              </div>

              <label>
                이미지 URL (선택)
                <input type="text" value={writeImage} onChange={(e) => setWriteImage(e.target.value)} />
              </label>

              <label>
                설명
                <textarea rows={7} value={writeSummary} onChange={(e) => setWriteSummary(e.target.value)} />
              </label>

              <div className="inquiry-write-actions">
                <button
                  type="button"
                  className="ghost-button small-ghost"
                  onClick={() => setIsWriteOpen(false)}
                >
                  취소
                </button>
                <button type="submit" className="pill-button small">
                  등록하기
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="event-grid" aria-live="polite">
          {errorMessage ? (
            <article className="event-empty-state">
              <h3>{errorMessage}</h3>
            </article>
          ) : null}

          {!errorMessage && filtered.length === 0 ? (
            <article className="event-empty-state">
              <h3>검색 결과가 없습니다.</h3>
            </article>
          ) : null}

          {!errorMessage &&
            filtered.map((eventItem) => (
              <article
                key={eventItem.id}
                className="event-card interactive"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/community/events/${eventItem.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/community/events/${eventItem.id}`);
                  }
                }}
              >
                <div className="event-card-media">
                  <img src={eventItem.image || FALLBACK_EVENT_IMAGE} alt={eventItem.title} />
                </div>
                <div className="event-card-copy">
                  <h3>{eventItem.title}</h3>
                  <div className="event-card-meta">
                    <time>{formatPeriod(eventItem.startDate, eventItem.endDate)}</time>
                    <span className={`event-progress ${eventItem.status === "진행중" ? "active" : "ended"}`}>
                      {eventItem.status}
                    </span>
                  </div>
                </div>
              </article>
            ))}
        </section>
      </main>
    </div>
  );
}

// 이벤트 상세 화면은 단일 이벤트의 기간/상태/소개 이미지를 보여준다.
export function CommunityEventDetailPage() {
  const { eventId } = useParams();
  const [eventItem, setEventItem] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    apiRequest(`/community/events/${eventId}`).then(setEventItem).catch((e) => setErrorMessage(e.message));
  }, [eventId]);

  if (errorMessage || !eventItem) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main className="content-page events-page">
          <section className="event-empty-state">
            <h3>{errorMessage || "이벤트 정보를 찾을 수 없습니다."}</h3>
            <Link className="pill-button" to="/community/events">
              이벤트 목록으로
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page event-detail-page">
        <section className="content-hero">
          <p className="section-kicker">커뮤니티 · 이벤트 상세</p>
          <h1>{eventItem.title}</h1>
        </section>

        <section className="event-detail-layout">
          <div className="event-detail-media">
            <img src={eventItem.image || FALLBACK_EVENT_IMAGE} alt={eventItem.title} />
            <strong className={`event-status ${eventItem.status === "진행중" ? "active" : "ended"}`}>
              {eventItem.status}
            </strong>
          </div>

          <article className="event-detail-info">
            <dl>
              <div>
                <dt>이벤트 기간</dt>
                <dd>{formatPeriod(eventItem.startDate, eventItem.endDate)}</dd>
              </div>
              <div>
                <dt>진행 상태</dt>
                <dd>{eventItem.status}</dd>
              </div>
            </dl>
            <Link className="pill-button" to="/community/events">
              이벤트 목록으로
            </Link>
          </article>

          <article className="event-detail-description">
            <h2>이벤트 설명</h2>
            {String(eventItem.summary || "")
              .split("\n")
              .map((paragraph, index) => (
                <p key={`${eventItem.id}-${index}`}>{paragraph || "\u00A0"}</p>
              ))}
          </article>
        </section>
      </main>
    </div>
  );
}

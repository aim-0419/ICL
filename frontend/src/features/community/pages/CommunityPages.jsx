import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

const REVIEW_POSTS = [
  {
    id: "review-101",
    title: "체형 분석 이후 수업 몰입도가 확실히 달라졌어요",
    author: "김OO",
    date: "2026-04-05",
    views: 128,
    comments: 14,
  },
  {
    id: "review-100",
    title: "초급 가이드 영상으로 수업 준비 시간이 줄었습니다",
    author: "박OO",
    date: "2026-04-03",
    views: 94,
    comments: 9,
  },
  {
    id: "review-099",
    title: "강사 코칭 피드백이 상세해서 재등록 결정했어요",
    author: "이OO",
    date: "2026-04-01",
    views: 156,
    comments: 22,
  },
  {
    id: "review-098",
    title: "리포머 수업 동작 설명이 이해하기 쉬웠습니다",
    author: "정OO",
    date: "2026-03-29",
    views: 77,
    comments: 6,
  },
  {
    id: "review-097",
    title: "중급 프로그램 루틴이 체계적이라 만족합니다",
    author: "최OO",
    date: "2026-03-27",
    views: 83,
    comments: 10,
  },
  {
    id: "review-096",
    title: "수업 후 루틴 가이드 덕분에 집에서도 꾸준히 했어요",
    author: "유OO",
    date: "2026-03-25",
    views: 102,
    comments: 11,
  },
  {
    id: "review-095",
    title: "상담부터 수업까지 흐름이 자연스러워서 좋았습니다",
    author: "한OO",
    date: "2026-03-23",
    views: 69,
    comments: 5,
  },
  {
    id: "review-094",
    title: "교육 영상 구매 후 실제 수업 적용에 도움이 됐어요",
    author: "임OO",
    date: "2026-03-20",
    views: 117,
    comments: 16,
  },
  {
    id: "review-093",
    title: "장비 설명이 자세해서 처음인데도 불안하지 않았습니다",
    author: "송OO",
    date: "2026-03-18",
    views: 58,
    comments: 4,
  },
  {
    id: "review-092",
    title: "클래스 분위기가 차분해서 집중하기 좋았어요",
    author: "오OO",
    date: "2026-03-15",
    views: 141,
    comments: 18,
  },
  {
    id: "review-091",
    title: "고급 과정에서 큐잉 포인트를 많이 배웠습니다",
    author: "서OO",
    date: "2026-03-12",
    views: 88,
    comments: 8,
  },
];

const COMMUNITY_EVENTS = [
  {
    id: "event-1",
    title: "신규 회원 웰컴 패키지 증정 이벤트",
    status: "진행중",
    startDate: "2026-04-05",
    endDate: "2026-04-30",
    likes: 48,
    image:
      "https://images.unsplash.com/photo-1554244933-d876deb6b2ff?auto=format&fit=crop&w=1200&q=80",
    summary:
      "첫 등록 회원에게 체형 분석 1회 + 개인 루틴 카드 + 필라테스 밴드를 함께 제공하는 봄 시즌 한정 프로모션입니다.",
  },
  {
    id: "event-2",
    title: "강사용 큐잉 가이드 봄 시즌 할인",
    status: "진행중",
    startDate: "2026-03-28",
    endDate: "2026-04-18",
    likes: 31,
    image:
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80",
    summary:
      "큐잉 실전 가이드 영상 패키지를 기간 한정가로 제공하며, 구매자 대상 라이브 Q&A 세션 참여 혜택이 포함됩니다.",
  },
  {
    id: "event-3",
    title: "리뉴얼 오픈 기념 상담 혜택",
    status: "종료",
    startDate: "2026-03-01",
    endDate: "2026-03-15",
    likes: 64,
    image:
      "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1200&q=80",
    summary:
      "리뉴얼 기간 동안 진행된 상담 이벤트로, 신규 상담 고객에게 수업 체험권과 등록 할인 혜택을 제공했습니다.",
  },
  {
    id: "event-4",
    title: "회원 추천 리워드 프로그램",
    status: "진행중",
    startDate: "2026-04-01",
    endDate: "2026-05-01",
    likes: 19,
    image:
      "https://images.unsplash.com/photo-1495555961986-6d4c1ecb7be3?auto=format&fit=crop&w=1200&q=80",
    summary:
      "기존 회원이 친구를 추천하면 추천인/피추천인 모두에게 수강 할인 쿠폰과 굿즈 포인트를 지급하는 이벤트입니다.",
  },
  {
    id: "event-5",
    title: "주말 집중 리포머 클래스 특가",
    status: "종료",
    startDate: "2026-02-10",
    endDate: "2026-02-28",
    likes: 27,
    image:
      "https://images.unsplash.com/photo-1549576490-b0b4831ef60a?auto=format&fit=crop&w=1200&q=80",
    summary:
      "주말 시간대 집중 프로그램을 한정 오픈했던 이벤트로, 단기 집중 수업을 원하는 회원 중심으로 운영되었습니다.",
  },
  {
    id: "event-6",
    title: "강사 역량 업 세미나 모집 이벤트",
    status: "종료",
    startDate: "2026-01-20",
    endDate: "2026-02-05",
    likes: 15,
    image:
      "https://images.unsplash.com/photo-1524863479829-916d8e77f114?auto=format&fit=crop&w=1200&q=80",
    summary:
      "강사 대상 시퀀스 설계 세미나 참가자 모집 이벤트로, 우수 후기 작성자에게 추가 교육 콘텐츠를 제공했습니다.",
  },
];

const INQUIRY_POST_STORAGE_KEY = "pilates-inquiry-posts";

const INQUIRY_POSTS_SEED = [
  {
    id: "inquiry-301",
    title: "강사 교육 영상 단체 구매 문의드립니다",
    content:
      "안녕하세요.\n지점 강사 4명이 함께 수강할 예정인데 단체 결제 가능한지 문의드립니다.\n결제 방식과 할인 조건이 있다면 안내 부탁드립니다.",
    author: "김OO",
    authorId: "seed-user-1",
    date: "2026-04-07",
    views: 41,
    isSecret: false,
  },
  {
    id: "inquiry-300",
    title: "수강권 결제 오류 관련 문의",
    content:
      "결제 승인 이후 페이지가 멈춰서 수강권 등록 여부를 확인하고 싶습니다.\n주문번호는 PILATES-20260406-112 입니다.\n확인 후 답변 부탁드립니다.",
    author: "박OO",
    authorId: "seed-user-2",
    date: "2026-04-06",
    views: 26,
    isSecret: true,
  },
  {
    id: "inquiry-299",
    title: "사업자용 영수증 발행 가능 여부",
    content:
      "교육영상 결제 건에 대해 사업자등록번호로 영수증 발행 가능한지 궁금합니다.\n가능하다면 발행 절차도 함께 안내 부탁드립니다.",
    author: "이OO",
    authorId: "seed-user-3",
    date: "2026-04-04",
    views: 33,
    isSecret: false,
  },
];

const REVIEW_COMMENT_STORAGE_KEY = "pilates-review-comments";

function readReviewComments() {
  try {
    if (typeof window === "undefined") return {};
    const raw = localStorage.getItem(REVIEW_COMMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveReviewComments(commentsByPost) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(REVIEW_COMMENT_STORAGE_KEY, JSON.stringify(commentsByPost));
  } catch {
    // ignore storage failures
  }
}

function toCommentCountMap(commentsByPost) {
  return Object.fromEntries(
    Object.entries(commentsByPost).map(([postId, comments]) => [postId, Array.isArray(comments) ? comments.length : 0])
  );
}

function readInquiryPosts() {
  try {
    if (typeof window === "undefined") return INQUIRY_POSTS_SEED;
    const raw = localStorage.getItem(INQUIRY_POST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : INQUIRY_POSTS_SEED;
  } catch {
    return INQUIRY_POSTS_SEED;
  }
}

function saveInquiryPosts(posts) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(INQUIRY_POST_STORAGE_KEY, JSON.stringify(posts));
  } catch {
    // ignore storage failures
  }
}

function formatTodayYmd() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isAdminUser(user) {
  if (!user) return false;
  return user.role === "admin" || user.isAdmin === true || user.email === "admin@iclpilates.com";
}

function formatPeriod(startDate, endDate) {
  return `${startDate} ~ ${endDate}`;
}

function getReviewById(reviewId) {
  return REVIEW_POSTS.find((post) => post.id === reviewId);
}

function getReviewCoverImage(reviewId) {
  const images = [
    "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1549576490-b0b4831ef60a?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=1600&q=80",
  ];
  const numeric = Number(reviewId.replace(/\D/g, "")) || 0;
  return images[numeric % images.length];
}

function getReviewBody(post) {
  return [
    `${post.title} 경험을 기준으로 실제 변화 포인트를 정리해봅니다. 처음에는 익숙하지 않았던 동작들이 수업 중 체크 포인트를 반복하면서 훨씬 안정적으로 잡히기 시작했습니다.`,
    "특히 강사 피드백이 디테일해서 어디를 고치면 되는지 빠르게 이해할 수 있었고, 수업 직후 제공된 가이드로 복습하니 다음 수업 연결도 자연스러웠습니다.",
    "전체적으로 상담부터 수업, 복습까지 흐름이 끊기지 않아 만족도가 높았습니다. 비슷한 고민을 가진 분들에게도 추천할 수 있는 경험이었습니다.",
  ];
}

function getReviewHighlights() {
  return ["개인 체형 기반 피드백", "수업 후 바로 가능한 복습 가이드", "재등록으로 이어지는 만족도"];
}

function getEventById(eventId) {
  return COMMUNITY_EVENTS.find((eventItem) => eventItem.id === eventId);
}

export function CommunityReviewsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("latest");
  const [page, setPage] = useState(1);
  const [storedCommentCounts, setStoredCommentCounts] = useState(() =>
    toCommentCountMap(readReviewComments())
  );
  const postsPerPage = 8;

  useEffect(() => {
    setStoredCommentCounts(toCommentCountMap(readReviewComments()));
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredPosts = REVIEW_POSTS.filter((post) => {
    if (!normalizedQuery) return true;
    return `${post.title} ${post.author}`.toLowerCase().includes(normalizedQuery);
  });

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (sortBy === "views") return b.views - a.views;
    if (sortBy === "comments") {
      const aComments = storedCommentCounts[a.id] ?? a.comments;
      const bComments = storedCommentCounts[b.id] ?? b.comments;
      return bComments - aComments;
    }
    return b.date.localeCompare(a.date);
  });

  const totalPages = Math.max(1, Math.ceil(sortedPosts.length / postsPerPage));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * postsPerPage;
  const currentPosts = sortedPosts.slice(start, start + postsPerPage);

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page reviews-board-page">
        <section className="content-hero">
          <p className="section-kicker">커뮤니티 · 후기</p>
          <h1>회원 후기 게시판</h1>
          <p className="section-text">
            수업 경험과 교육 콘텐츠 후기를 게시글 형태로 확인할 수 있습니다.
          </p>
        </section>

        <section className="community-board-toolbar">
          <p>전체 게시글 {sortedPosts.length}건</p>
          <div className="community-board-toolbar-right">
            <label className="community-board-sort">
              <span className="visually-hidden">정렬 기준 선택</span>
              <select
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value);
                  setPage(1);
                }}
              >
                <option value="latest">최신 작성순</option>
                <option value="views">조회 높은순</option>
                <option value="comments">댓글 많은순</option>
              </select>
            </label>
            <label className="community-board-search">
              <span className="visually-hidden">후기 검색</span>
              <input
                type="search"
                placeholder="제목/작성자 검색"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <button type="button" className="ghost-button small-ghost community-write-button">
              글쓰기
            </button>
          </div>
        </section>

        <section className="community-board">
          <div className="community-board-scroll">
            <div className="community-board-head">
              <span>번호</span>
              <span>제목</span>
              <span>작성자</span>
              <span>작성일</span>
              <span>조회</span>
            </div>

            {currentPosts.length ? (
              currentPosts.map((post, index) => (
                <article
                  className="community-board-row interactive"
                  key={post.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/community/reviews/${post.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/community/reviews/${post.id}`);
                    }
                  }}
                >
                  <span>{sortedPosts.length - start - index}</span>
                  <span className="community-board-title">{post.title}</span>
                  <span>{post.author}</span>
                  <time>{post.date}</time>
                  <span>{post.views}</span>
                </article>
              ))
            ) : (
              <article className="community-board-empty">
                <p>검색 결과가 없습니다.</p>
              </article>
            )}
          </div>
        </section>

        <section className="community-board-pagination" aria-label="후기 페이지네이션">
          {pageNumbers.map((number) => (
            <button
              key={number}
              type="button"
              className={`community-page-button${safePage === number ? " active" : ""}`}
              onClick={() => setPage(number)}
            >
              {number}
            </button>
          ))}
        </section>
      </main>
    </div>
  );
}

export function CommunityReviewDetailPage() {
  const store = useAppStore();
  const { reviewId } = useParams();
  const review = getReviewById(reviewId);
  const [commentsByPost, setCommentsByPost] = useState(() => readReviewComments());
  const [commentAuthor, setCommentAuthor] = useState(() => store.currentUser?.name || "");
  const [commentText, setCommentText] = useState("");

  const activeReviewId = review?.id || "";
  const comments = activeReviewId ? commentsByPost[activeReviewId] || [] : [];

  useEffect(() => {
    saveReviewComments(commentsByPost);
  }, [commentsByPost]);

  useEffect(() => {
    if (store.currentUser?.name) {
      setCommentAuthor(store.currentUser.name);
    }
  }, [store.currentUser]);

  if (!review) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main className="content-page reviews-board-page">
          <section className="community-board-empty">
            <p>후기 정보를 찾을 수 없습니다.</p>
            <Link className="pill-button" to="/community/reviews">
              후기 목록으로
            </Link>
          </section>
        </main>
      </div>
    );
  }

  const body = getReviewBody(review);
  const previewImage = getReviewCoverImage(review.id);
  const highlights = getReviewHighlights();

  function handleCommentSubmit(event) {
    event.preventDefault();
    const author = (commentAuthor || store.currentUser?.name || "익명").trim();
    const content = commentText.trim();

    if (!content) {
      alert("댓글 내용을 입력해주세요.");
      return;
    }

    const newComment = {
      id: `comment-${Date.now()}`,
      author: author || "익명",
      content,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setCommentsByPost((current) => ({
      ...current,
      [activeReviewId]: [newComment, ...(current[activeReviewId] || [])],
    }));
    setCommentText("");
  }

  function handleCommentDelete(commentId) {
    setCommentsByPost((current) => ({
      ...current,
      [activeReviewId]: (current[activeReviewId] || []).filter((item) => item.id !== commentId),
    }));
  }

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
            <img src={previewImage} alt={review.title} />
          </div>

          <section className="review-detail-summary-box">
            <strong>후기 한줄 요약</strong>
            <p>실제 수업 적용이 쉽고, 피드백-복습 흐름이 자연스럽다는 점이 가장 만족스러웠습니다.</p>
          </section>

          <section className="review-highlight-list">
            {highlights.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </section>

          <article className="review-detail-body">
            {body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </article>

          <section className="review-comment-section">
            <h2>댓글 {comments.length}</h2>
            <form className="review-comment-form" onSubmit={handleCommentSubmit}>
              <input
                type="text"
                placeholder="작성자"
                value={commentAuthor}
                onChange={(event) => setCommentAuthor(event.target.value)}
              />
              <textarea
                rows={3}
                placeholder="댓글을 남겨주세요."
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
              />
              <button type="submit" className="pill-button small">
                댓글 등록
              </button>
            </form>
            <div className="review-comment-list">
              {comments.length ? (
                comments.map((comment) => (
                  <article className="review-comment-item" key={comment.id}>
                    <div className="review-comment-meta">
                      <strong>{comment.author}</strong>
                      <time>{comment.createdAt}</time>
                    </div>
                    <p>{comment.content}</p>
                    <button
                      type="button"
                      className="review-comment-delete"
                      onClick={() => handleCommentDelete(comment.id)}
                    >
                      삭제
                    </button>
                  </article>
                ))
              ) : (
                <p className="review-comment-empty">아직 등록된 댓글이 없습니다.</p>
              )}
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

export function CommunityInquiryPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const [posts, setPosts] = useState(() => readInquiryPosts());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("latest");
  const [page, setPage] = useState(1);
  const [isWriteOpen, setIsWriteOpen] = useState(false);
  const [writeTitle, setWriteTitle] = useState("");
  const [writeContent, setWriteContent] = useState("");
  const [writeSecret, setWriteSecret] = useState(false);
  const postsPerPage = 8;

  useEffect(() => {
    saveInquiryPosts(posts);
  }, [posts]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredPosts = posts.filter((post) => {
    if (!normalizedQuery) return true;
    return `${post.title} ${post.author}`.toLowerCase().includes(normalizedQuery);
  });

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (sortBy === "views") return b.views - a.views;
    return b.date.localeCompare(a.date);
  });

  const totalPages = Math.max(1, Math.ceil(sortedPosts.length / postsPerPage));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * postsPerPage;
  const currentPosts = sortedPosts.slice(start, start + postsPerPage);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  function handleToggleWrite() {
    setIsWriteOpen((current) => !current);
  }

  function handleSubmitWrite(event) {
    event.preventDefault();
    const title = writeTitle.trim();
    const content = writeContent.trim();

    if (!store.currentUser) {
      alert("문의글 등록은 로그인 후 이용 가능합니다.");
      navigate("/login");
      return;
    }

    if (!title) {
      alert("문의 제목을 입력해주세요.");
      return;
    }
    if (!content) {
      alert("문의 내용을 입력해주세요.");
      return;
    }

    const newPost = {
      id: `inquiry-${Date.now()}`,
      title,
      content,
      author: store.currentUser?.name || store.currentUser?.email || "익명",
      authorId: store.currentUser?.id || "",
      date: formatTodayYmd(),
      views: 0,
      isSecret: writeSecret,
    };

    setPosts((current) => [newPost, ...current]);
    setWriteTitle("");
    setWriteContent("");
    setWriteSecret(false);
    setIsWriteOpen(false);
    setPage(1);
    navigate(`/community/inquiry/${newPost.id}`);
  }

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page reviews-board-page">
        <section className="content-hero">
          <p className="section-kicker">커뮤니티 · 문의하기</p>
          <h1>문의 게시판</h1>
          <p className="section-text">
            수업, 결제, 교육영상 관련 문의를 게시글 형태로 남기고 답변을 확인할 수 있습니다.
          </p>
        </section>

        <section className="community-board-toolbar">
          <p>전체 게시글 {sortedPosts.length}건</p>
          <div className="community-board-toolbar-right">
            <label className="community-board-sort">
              <span className="visually-hidden">정렬 기준 선택</span>
              <select
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value);
                  setPage(1);
                }}
              >
                <option value="latest">최신 작성순</option>
                <option value="views">조회 높은순</option>
              </select>
            </label>
            <label className="community-board-search">
              <span className="visually-hidden">문의 검색</span>
              <input
                type="search"
                placeholder="제목/작성자 검색"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <button
              type="button"
              className="ghost-button small-ghost community-write-button"
              onClick={handleToggleWrite}
            >
              {isWriteOpen ? "작성 닫기" : "글쓰기"}
            </button>
          </div>
        </section>

        {isWriteOpen ? (
          <section className="inquiry-write-panel">
            <h2>문의글 작성</h2>
            <form className="inquiry-write-form" onSubmit={handleSubmitWrite}>
              <label>
                제목
                <input
                  type="text"
                  placeholder="문의 제목을 입력해주세요."
                  value={writeTitle}
                  onChange={(event) => setWriteTitle(event.target.value)}
                />
              </label>
              <label>
                내용
                <textarea
                  rows={6}
                  placeholder="문의 내용을 입력해주세요."
                  value={writeContent}
                  onChange={(event) => setWriteContent(event.target.value)}
                />
              </label>
              <label className="inquiry-secret-field">
                <input
                  type="checkbox"
                  checked={writeSecret}
                  onChange={(event) => setWriteSecret(event.target.checked)}
                />
                <span>비밀글 설정 (작성자/관리자만 내용 확인)</span>
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

            {currentPosts.length ? (
              currentPosts.map((post, index) => (
                <article
                  className="community-board-row interactive"
                  key={post.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/community/inquiry/${post.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/community/inquiry/${post.id}`);
                    }
                  }}
                >
                  <span>{sortedPosts.length - start - index}</span>
                  <span className={`community-board-title${post.isSecret ? " has-secret" : ""}`}>
                    {post.isSecret ? <span className="secret-lock-icon" aria-hidden="true">🔒</span> : null}
                    {post.isSecret ? <span className="visually-hidden">비밀글 </span> : null}
                    {post.title}
                  </span>
                  <span>{post.author}</span>
                  <time>{post.date}</time>
                  <span>{post.views}</span>
                </article>
              ))
            ) : (
              <article className="community-board-empty">
                <p>검색 결과가 없습니다.</p>
              </article>
            )}
          </div>
        </section>

        <section className="community-board-pagination" aria-label="문의 페이지네이션">
          {pageNumbers.map((number) => (
            <button
              key={number}
              type="button"
              className={`community-page-button${safePage === number ? " active" : ""}`}
              onClick={() => setPage(number)}
            >
              {number}
            </button>
          ))}
        </section>
      </main>
    </div>
  );
}

export function CommunityInquiryDetailPage() {
  const store = useAppStore();
  const { inquiryId } = useParams();
  const [posts, setPosts] = useState(() => readInquiryPosts());
  const viewedPostIdRef = useRef("");

  useEffect(() => {
    saveInquiryPosts(posts);
  }, [posts]);

  const post = posts.find((item) => item.id === inquiryId);
  const isAuthor = Boolean(store.currentUser && post && store.currentUser.id === post.authorId);
  const canRead = Boolean(post && (!post.isSecret || isAuthor || isAdminUser(store.currentUser)));

  useEffect(() => {
    if (!post || !canRead || viewedPostIdRef.current === post.id) return;
    viewedPostIdRef.current = post.id;
    setPosts((current) =>
      current.map((item) => (item.id === post.id ? { ...item, views: item.views + 1 } : item))
    );
  }, [canRead, post]);

  const visiblePost = posts.find((item) => item.id === inquiryId);

  if (!visiblePost) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main className="content-page reviews-board-page">
          <section className="community-board-empty">
            <p>문의 정보를 찾을 수 없습니다.</p>
            <Link className="pill-button" to="/community/inquiry">
              문의 목록으로
            </Link>
          </section>
        </main>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main className="content-page review-detail-page inquiry-private-page">
          <section className="review-detail-card inquiry-private-card">
            <section className="inquiry-private-content">
              <span className="inquiry-private-lock" aria-hidden="true">
                🔒
              </span>
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
                {visiblePost.isSecret ? <span className="secret-lock-icon" aria-hidden="true">🔒</span> : null}
                {visiblePost.isSecret ? <span className="visually-hidden">비밀글 </span> : null}
                {visiblePost.title}
              </h1>
            </div>
            <div className="review-detail-meta">
              <span>작성자 {visiblePost.author}</span>
              <time>{visiblePost.date}</time>
              <span>조회 {visiblePost.views}</span>
            </div>
          </header>

          <section className="review-detail-summary-box">
            <strong>답변 안내</strong>
            <p>문의글은 접수 순서대로 확인하며, 영업일 기준 24시간 이내 답변을 드리고 있습니다.</p>
          </section>

          <article className="review-detail-body inquiry-detail-body">
            {visiblePost.content.split("\n").map((paragraph, index) => (
              <p key={`${visiblePost.id}-${index}`}>{paragraph || "\u00A0"}</p>
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

export function CommunityEventsPage() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");

  const categories = ["전체", "진행중", "종료"];
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredEvents = COMMUNITY_EVENTS.filter((eventItem) => {
    if (selectedCategory !== "전체" && eventItem.status !== selectedCategory) return false;
    if (!normalizedQuery) return true;
    return `${eventItem.title} ${eventItem.status}`.toLowerCase().includes(normalizedQuery);
  });

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="content-page events-page">
        <section className="content-hero">
          <p className="section-kicker">커뮤니티 · 이벤트</p>
          <h1>이벤트</h1>
          <p className="section-text">
            진행중/종료 이벤트를 한 눈에 확인하고 원하는 이벤트를 클릭해 상세 내용을 볼 수 있습니다.
          </p>
        </section>

        <section className="events-toolbar">
          <div className="events-filter-chips" role="tablist" aria-label="이벤트 상태">
            {categories.map((category) => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`event-filter-chip${active ? " active" : ""}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              );
            })}
          </div>
          <label className="events-search-box">
            <span className="visually-hidden">이벤트 검색</span>
            <input
              type="search"
              placeholder="이벤트 검색"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
        </section>

        <section className="event-grid" aria-live="polite">
          {filteredEvents.length ? (
            filteredEvents.map((eventItem) => (
              <article
                className="event-card interactive"
                key={eventItem.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/community/events/${eventItem.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/community/events/${eventItem.id}`);
                  }
                }}
              >
                <div className="event-card-media">
                  <img src={eventItem.image} alt={eventItem.title} />
                </div>
                <div className="event-card-copy">
                  <h3>{eventItem.title}</h3>
                  <div className="event-card-meta">
                    <time>{formatPeriod(eventItem.startDate, eventItem.endDate)}</time>
                    <span
                      className={`event-progress ${eventItem.status === "진행중" ? "active" : "ended"}`}
                    >
                      {eventItem.status}
                    </span>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <article className="event-empty-state">
              <h3>검색 결과가 없습니다.</h3>
              <p>다른 상태를 선택하거나 검색어를 다시 입력해 주세요.</p>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}

export function CommunityEventDetailPage() {
  const { eventId } = useParams();
  const eventItem = getEventById(eventId);

  if (!eventItem) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main className="content-page events-page">
          <section className="event-empty-state">
            <h3>이벤트 정보를 찾을 수 없습니다.</h3>
            <p>이벤트 목록으로 돌아가 다른 이벤트를 확인해 주세요.</p>
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
          <p className="section-text">이벤트 기간과 상세 안내를 확인해 보세요.</p>
        </section>

        <section className="event-detail-layout">
          <div className="event-detail-media">
            <img src={eventItem.image} alt={eventItem.title} />
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
            <p>{eventItem.summary}</p>
          </article>
        </section>
      </main>
    </div>
  );
}

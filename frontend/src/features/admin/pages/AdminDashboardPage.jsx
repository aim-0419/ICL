import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { apiRequest } from "../../../shared/api/client.js";
import {
  canManageUserGrades,
  formatUserGradeLabel,
  USER_GRADE_OPTIONS,
} from "../../../shared/auth/userRoles.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

const LEARNING_RANGE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "today", label: "오늘" },
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
];

function formatDateTime(value) {
  if (value === null || value === undefined) return "-";
  const source = String(value).trim();
  if (!source || source === "0") return "-";

  const normalized = source.includes("T") ? source : source.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "-";
  if (date.getTime() <= 0) return "-";
  return date.toLocaleString("ko-KR");
}

function toAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AdminDashboardPage() {
  const store = useAppStore();
  const currentUser = store.currentUser;
  const canManageGrades = canManageUserGrades(currentUser);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [savingGradeUserId, setSavingGradeUserId] = useState("");
  const [gradeMessage, setGradeMessage] = useState({ type: "", text: "" });

  const [learningRange, setLearningRange] = useState("all");
  const [openLearningUserId, setOpenLearningUserId] = useState("");
  const [openPurchaseUserId, setOpenPurchaseUserId] = useState("");
  const [learningByUserId, setLearningByUserId] = useState({});
  const [learningLoadingUserId, setLearningLoadingUserId] = useState("");
  const [learningErrorByUserId, setLearningErrorByUserId] = useState({});

  const [lectureReports, setLectureReports] = useState([]);
  const [lectureReportsLoading, setLectureReportsLoading] = useState(true);
  const [lectureReportsError, setLectureReportsError] = useState("");

  function buildLearningCacheKey(userId, range = learningRange) {
    return `${String(userId || "")}::${String(range || "all")}`;
  }

  async function loadDashboard() {
    try {
      setLoading(true);
      setErrorMessage("");
      const result = await apiRequest("/admin/dashboard/users");
      setUsers(Array.isArray(result?.users) ? result.users : []);
    } catch (error) {
      setErrorMessage(error.message || "회원 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function loadLectureReports(range = learningRange) {
    try {
      setLectureReportsLoading(true);
      setLectureReportsError("");
      const result = await apiRequest(
        `/admin/dashboard/lectures/progress?range=${encodeURIComponent(range)}`
      );
      setLectureReports(Array.isArray(result?.lectures) ? result.lectures : []);
    } catch (error) {
      setLectureReportsError(error.message || "강의별 수강 리포트를 불러오지 못했습니다.");
    } finally {
      setLectureReportsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    loadLectureReports(learningRange);
  }, [learningRange]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return users;

    return users.filter((user) =>
      `${user.name} ${user.loginId} ${user.email} ${formatUserGradeLabel(user.userGrade)}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [searchQuery, users]);

  const summary = useMemo(() => {
    return users.reduce(
      (acc, user) => {
        const grade = String(user.userGrade || "member").toLowerCase();
        acc.totalMembers += 1;
        acc.totalRevenue += toAmount(user.totalSpent);
        if (grade === "admin0" || grade === "admin1") acc.totalAdmins += 1;
        if (grade === "vip") acc.totalVip += 1;
        if (grade === "vvip") acc.totalVvip += 1;
        return acc;
      },
      { totalMembers: 0, totalAdmins: 0, totalVip: 0, totalVvip: 0, totalRevenue: 0 }
    );
  }, [users]);

  async function handleGradeChange(userId, nextGrade) {
    if (!canManageGrades) return;

    const previous = users;
    setSavingGradeUserId(userId);
    setGradeMessage({ type: "", text: "" });

    setUsers((current) =>
      current.map((user) => (user.id === userId ? { ...user, userGrade: nextGrade } : user))
    );

    try {
      const result = await apiRequest(`/admin/users/${encodeURIComponent(userId)}/grade`, {
        method: "PATCH",
        body: { userGrade: nextGrade },
      });

      const updated = result?.user;
      if (updated?.id) {
        setUsers((current) =>
          current.map((user) => (user.id === updated.id ? { ...user, ...updated } : user))
        );
      }

      setGradeMessage({ type: "success", text: "회원 등급이 변경되었습니다." });
    } catch (error) {
      setUsers(previous);
      setGradeMessage({ type: "error", text: error.message || "등급 변경에 실패했습니다." });
    } finally {
      setSavingGradeUserId("");
    }
  }

  async function handleToggleLearning(userId) {
    if (openLearningUserId === userId) {
      setOpenLearningUserId("");
      return;
    }

    setOpenLearningUserId(userId);
    const cacheKey = buildLearningCacheKey(userId, learningRange);
    if (learningByUserId[cacheKey]) return;

    try {
      setLearningLoadingUserId(userId);
      setLearningErrorByUserId((prev) => ({ ...prev, [cacheKey]: "" }));
      const result = await apiRequest(
        `/admin/dashboard/users/${encodeURIComponent(userId)}/progress?range=${encodeURIComponent(
          learningRange
        )}`
      );
      setLearningByUserId((prev) => ({
        ...prev,
        [cacheKey]: Array.isArray(result?.learning) ? result.learning : [],
      }));
    } catch (error) {
      setLearningErrorByUserId((prev) => ({
        ...prev,
        [cacheKey]: error.message || "회원 수강 진도 조회에 실패했습니다.",
      }));
    } finally {
      setLearningLoadingUserId("");
    }
  }

  function handleTogglePurchase(userId) {
    setOpenPurchaseUserId((current) => (current === userId ? "" : userId));
  }

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="dashboard-page admin-dashboard-page">
        <section className="admin-dashboard-switch">
          <Link className="admin-dashboard-switch-link" to="/admin">
            매출 대시보드
          </Link>
          <Link className="admin-dashboard-switch-link active" to="/admin/members">
            회원 관리
          </Link>
        </section>

        <section className="dashboard-hero mypage-hero-card">
          <p className="section-kicker">관리자 대시보드</p>
          <h1>회원 관리</h1>
          <div className="mypage-identity-row">
            <span className="mypage-identity-chip">회원 {summary.totalMembers}명</span>
            <span className="mypage-identity-chip">관리자 {summary.totalAdmins}명</span>
            <span className="mypage-identity-chip">VIP {summary.totalVip}명</span>
            <span className="mypage-identity-chip">VVIP {summary.totalVvip}명</span>
            <span className="mypage-identity-chip">누적 매출 {store.formatCurrency(summary.totalRevenue)}</span>
          </div>
        </section>

        <section className="admin-dashboard-grid">
          <section className="dashboard-card admin-members-panel">
            <div className="admin-members-toolbar">
              <h2>회원 조회</h2>
              <div className="admin-toolbar-right">
                <select
                  className="admin-range-select"
                  value={learningRange}
                  onChange={(event) => {
                    setLearningRange(event.target.value);
                    setOpenLearningUserId("");
                  }}
                >
                  {LEARNING_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  type="search"
                  value={searchQuery}
                  placeholder="이름 / 아이디 / 이메일 / 등급 검색"
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>

            {gradeMessage.text ? (
              <p className={`admin-form-message ${gradeMessage.type}`}>{gradeMessage.text}</p>
            ) : null}

            {loading ? <p className="admin-empty-copy">회원 정보를 불러오는 중입니다...</p> : null}
            {!loading && errorMessage ? <p className="admin-empty-copy error">{errorMessage}</p> : null}

            {!loading && !errorMessage ? (
              <div className="admin-member-list">
                {filteredUsers.length ? (
                  filteredUsers.map((user) => {
                    const purchases = Array.isArray(user.purchases) ? user.purchases : [];
                    const learningCacheKey = buildLearningCacheKey(user.id, learningRange);
                    const learningRows = Array.isArray(learningByUserId[learningCacheKey])
                      ? learningByUserId[learningCacheKey]
                      : [];
                    const isLearningOpen = openLearningUserId === user.id;
                    const isPurchaseOpen = openPurchaseUserId === user.id;

                    return (
                      <article key={user.id} className="admin-member-card">
                        <header className="admin-member-head">
                          <div>
                            <strong>{user.name}</strong>
                            <p>
                              {user.loginId} · {user.email}
                            </p>
                          </div>
                          <div className="admin-member-grade">
                            <span>{formatUserGradeLabel(user.userGrade)}</span>
                            {canManageGrades ? (
                              <select
                                value={String(user.userGrade || "member").toLowerCase()}
                                disabled={savingGradeUserId === user.id}
                                onChange={(event) => handleGradeChange(user.id, event.target.value)}
                              >
                                {USER_GRADE_OPTIONS.map((grade) => (
                                  <option key={grade} value={grade}>
                                    {formatUserGradeLabel(grade)}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        </header>

                        <div className="admin-member-metrics">
                          <span>가입일 {formatDateTime(user.createdAt)}</span>
                          <span>주문 {Number(user.orderCount || 0)}건</span>
                          <span>강의 구매 {Number(user.purchasedLectureCount || 0)}건</span>
                          <span>수강 시작 {Number(user.engagedLectureCount || 0)}건</span>
                          <span>수강 완료 {Number(user.completedLectureCount || 0)}건</span>
                          <span>수강 중 {Number(user.inProgressLectureCount || 0)}건</span>
                          <span>최근 학습 {formatDateTime(user.latestLearningAt)}</span>
                          <span>누적 {store.formatCurrency(toAmount(user.totalSpent))}</span>
                        </div>

                        <div className="admin-member-actions-row">
                          <button
                            type="button"
                            className="ghost-button small-ghost"
                            onClick={() => handleToggleLearning(user.id)}
                          >
                            {isLearningOpen ? "수강 진도 닫기" : "수강 진도 보기"}
                          </button>
                          <button
                            type="button"
                            className="ghost-button small-ghost"
                            onClick={() => handleTogglePurchase(user.id)}
                          >
                            {isPurchaseOpen ? "구매 이력 닫기" : "구매 이력 보기"}
                          </button>
                        </div>

                        {isLearningOpen ? (
                          <div className="admin-learning-panel">
                            {learningLoadingUserId === user.id ? (
                              <p className="admin-empty-copy">회원 수강 진도를 불러오는 중입니다...</p>
                            ) : null}
                            {learningErrorByUserId[learningCacheKey] ? (
                              <p className="admin-empty-copy error">{learningErrorByUserId[learningCacheKey]}</p>
                            ) : null}

                            {learningLoadingUserId !== user.id && !learningErrorByUserId[learningCacheKey] ? (
                              learningRows.length ? (
                                <div className="admin-learning-list">
                                  {learningRows.map((learning) => (
                                    <article
                                      key={`${user.id}-${learning.videoId}`}
                                      className="admin-learning-card"
                                    >
                                      <div className="admin-learning-head">
                                        <strong>{learning.title}</strong>
                                        <span>
                                          {learning.completed ? "완강" : "수강중"} · 진도 {learning.progressPercent}%
                                        </span>
                                      </div>
                                      <div className="admin-learning-meta">
                                        <span>강사 {learning.instructor}</span>
                                        <span>카테고리 {learning.category}</span>
                                        <span>
                                          차시 {learning.completedChapterCount}/{learning.chapterCount}
                                        </span>
                                        <span>마지막 수강 {formatDateTime(learning.lastWatchedAt)}</span>
                                        <span>{learning.purchased ? "구매 완료" : "미구매"}</span>
                                      </div>
                                      {Array.isArray(learning.chapters) && learning.chapters.length ? (
                                        <div className="admin-learning-chapter-list">
                                          {learning.chapters.map((chapter) => (
                                            <div
                                              key={`${learning.videoId}-${chapter.chapterId}`}
                                              className="admin-learning-chapter-row"
                                            >
                                              <span>
                                                {chapter.chapterOrder}차시 · {chapter.chapterTitle}
                                              </span>
                                              <span>
                                                {chapter.completed ? "완료" : "진행중"} ({chapter.progressPercent}%)
                                              </span>
                                              <span>{formatDateTime(chapter.lastWatchedAt)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : null}
                                    </article>
                                  ))}
                                </div>
                              ) : (
                                <p className="admin-empty-copy">선택한 기간에 수강 진도 데이터가 없습니다.</p>
                              )
                            ) : null}
                          </div>
                        ) : null}

                        {isPurchaseOpen ? (
                          <div className="admin-purchase-details">
                            {purchases.length ? (
                              <div className="admin-purchase-table">
                                {purchases.map((purchase) => (
                                  <article key={`${user.id}-${purchase.orderId}`} className="admin-purchase-row">
                                    <div className="admin-purchase-meta">
                                      <strong>{purchase.orderName || purchase.orderId}</strong>
                                      <span>{formatDateTime(purchase.purchasedAt)}</span>
                                      <span>{store.formatCurrency(toAmount(purchase.amount))}</span>
                                    </div>
                                    <p>
                                      {(purchase.lectures || [])
                                        .map((lecture) => lecture.productName || lecture.productId)
                                        .filter(Boolean)
                                        .join(", ") || "구매 강의 정보 없음"}
                                    </p>
                                  </article>
                                ))}
                              </div>
                            ) : (
                              <p className="admin-empty-copy">구매 이력이 없습니다.</p>
                            )}
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="admin-empty-copy">검색 결과가 없습니다.</p>
                )}
              </div>
            ) : null}
          </section>

          <section className="dashboard-card admin-lecture-report-panel">
            <div className="admin-members-toolbar">
              <h2>강의별 수강 리포트</h2>
              <span className="admin-range-caption">
                기준: {LEARNING_RANGE_OPTIONS.find((item) => item.value === learningRange)?.label || "전체"}
              </span>
            </div>

            {lectureReportsLoading ? <p className="admin-empty-copy">강의 리포트를 불러오는 중입니다...</p> : null}
            {!lectureReportsLoading && lectureReportsError ? (
              <p className="admin-empty-copy error">{lectureReportsError}</p>
            ) : null}

            {!lectureReportsLoading && !lectureReportsError ? (
              lectureReports.length ? (
                <div className="admin-lecture-report-list">
                  {lectureReports.map((lecture) => (
                    <details key={lecture.videoId} className="admin-lecture-report-card">
                      <summary>
                        <strong>{lecture.title}</strong>
                        <span>
                          완강률 {lecture.completionRate}% · 수강자 {lecture.learnerCount}명 · 마지막 수강 {formatDateTime(
                            lecture.lastLearningAt
                          )}
                        </span>
                      </summary>

                      <div className="admin-lecture-report-meta">
                        <span>강사 {lecture.instructor}</span>
                        <span>카테고리 {lecture.category}</span>
                        <span>
                          완강 {lecture.completedLearnerCount}/{lecture.learnerCount}
                        </span>
                        <span>차시 수 {lecture.chapterCount}</span>
                      </div>

                      {Array.isArray(lecture.learners) && lecture.learners.length ? (
                        <div className="admin-lecture-learner-list">
                          {lecture.learners.map((learner) => (
                            <article
                              key={`${lecture.videoId}-${learner.userId}`}
                              className="admin-lecture-learner-row"
                            >
                              <div>
                                <strong>
                                  {learner.name} ({learner.loginId})
                                </strong>
                                <p>
                                  {formatUserGradeLabel(learner.userGrade)} · {learner.email}
                                </p>
                              </div>
                              <div className="admin-lecture-learner-metrics">
                                <span>{learner.completed ? "완강" : "수강중"}</span>
                                <span>진도 {learner.progressPercent}%</span>
                                <span>
                                  차시 {learner.completedChapterCount}/{learner.chapterCount}
                                </span>
                                <span>마지막 수강 {formatDateTime(learner.lastWatchedAt)}</span>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="admin-empty-copy">선택한 기간에 수강 이력이 없습니다.</p>
                      )}
                    </details>
                  ))}
                </div>
              ) : (
                <p className="admin-empty-copy">선택한 기간에 수강 리포트 데이터가 없습니다.</p>
              )
            ) : null}
          </section>
        </section>
      </main>
    </div>
  );
}

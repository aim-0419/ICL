import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { deleteAcademyVideo, resolveAcademyMediaUrl, updateAcademyVideo, uploadAcademyAsset } from "../../academy/api/academyApi.js";
import { countPurchasedVideoItems, getPurchasedVideos } from "../../academy/lib/purchases.js";
import { isAdminStaff } from "../../../shared/auth/userRoles.js";

function parseStudyPeriodDays(periodText) {
  if (!periodText) return null;
  const text = String(periodText).trim();
  if (/무제한|평생|unlimited|lifetime/i.test(text)) return null;
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function calcEnrollmentExpiryForMyPage(orders, videoProductId, periodText) {
  const periodDays = parseStudyPeriodDays(periodText);
  if (periodDays === null) return null;

  const normalizedId = String(videoProductId || "").trim();
  const matchingOrders = (Array.isArray(orders) ? orders : []).filter((order) => {
    const ids = new Set();
    const addId = (v) => { const s = String(v || "").trim(); if (s) ids.add(s); };
    if (Array.isArray(order.selectedProductIds)) order.selectedProductIds.forEach(addId);
    if (Array.isArray(order.items)) order.items.forEach((i) => addId(i?.productId));
    addId(order.productId);
    try {
      const payload = typeof order.payload === "string" ? JSON.parse(order.payload) : (order.payload || {});
      if (Array.isArray(payload.selectedProductIds)) payload.selectedProductIds.forEach(addId);
      if (Array.isArray(payload.items)) payload.items.forEach((i) => addId(i?.productId));
      addId(payload.productId);
    } catch {}
    return ids.has(normalizedId);
  });

  if (!matchingOrders.length) return null;

  const orderDates = matchingOrders
    .map((o) => new Date(o.createdAt || ""))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);

  if (!orderDates.length) return null;

  const expiryDate = new Date(orderDates[0].getTime() + periodDays * 86400000);
  const daysLeft = Math.ceil((expiryDate - Date.now()) / 86400000);
  return { daysLeft, expiryLabel: expiryDate.toLocaleDateString("ko-KR") };
}

function calcChaptersTotalDuration(chapters) {
  if (!Array.isArray(chapters)) return 0;
  return chapters.reduce((s, ch) => s + Math.max(0, Number(ch.durationSec || 0)), 0);
}

function formatDuration(sec) {
  if (!sec || sec < 60) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR");
}

function toProgressPercent(progress) {
  const rawPercent = Number(progress?.progressPercent);
  if (Number.isFinite(rawPercent)) {
    return Math.max(0, Math.min(100, Math.round(rawPercent)));
  }

  const duration = Number(progress?.duration || 0);
  const currentTime = Number(progress?.currentTime || 0);
  if (!duration) return 0;
  return Math.max(0, Math.min(100, Math.round((currentTime / duration) * 100)));
}

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 3l18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.6 6.3A10.6 10.6 0 0 1 12 6c5.5 0 9 6 9 6a16.7 16.7 0 0 1-3.1 3.9M6.1 9.1A16.2 16.2 0 0 0 3 12s3.5 6 9 6c1.1 0 2.1-.2 3-.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function MyPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const currentUser = store.currentUser || {};
  const isAdmin = isAdminStaff(currentUser);
  const normalizedCurrentUserEmail = String(currentUser.email || "").trim().toLowerCase();

  const userOrders = useMemo(
    () =>
      store.orders.filter((order) => {
        const orderEmail = String(order?.customerEmail || "").trim().toLowerCase();
        return Boolean(orderEmail) && orderEmail === normalizedCurrentUserEmail;
      }),
    [store.orders, normalizedCurrentUserEmail]
  );
  const purchasedVideos = useMemo(
    () => getPurchasedVideos(store.orders, currentUser.email, store.academyVideos),
    [store.orders, currentUser.email, store.academyVideos]
  );
  const purchasedVideoItemCount = useMemo(
    () => countPurchasedVideoItems(store.orders, currentUser.email, store.academyVideos),
    [store.orders, currentUser.email, store.academyVideos]
  );
  const academyProgressMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(store.academyProgress) ? store.academyProgress : []).forEach((item) => {
      const key = String(item?.videoId || "");
      if (key) map.set(key, item);
    });
    return map;
  }, [store.academyProgress]);
  const academyChapterProgressMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(store.academyChapterProgress) ? store.academyChapterProgress : []).forEach((item) => {
      const key = String(item?.videoId || "");
      if (!key) return;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    });

    for (const [key, list] of map.entries()) {
      map.set(
        key,
        [...list].sort((a, b) => {
          const aOrder = Number(a?.chapterOrder || 0);
          const bOrder = Number(b?.chapterOrder || 0);
          if (aOrder !== bOrder) return aOrder - bOrder;
          return String(a?.chapterId || "").localeCompare(String(b?.chapterId || ""));
        })
      );
    }

    return map;
  }, [store.academyChapterProgress]);
  const learningHistory = useMemo(() => {
    return purchasedVideos
      .map((video) => {
        const progress = academyProgressMap.get(String(video.id)) || null;
        const chapterProgress = academyChapterProgressMap.get(String(video.id)) || [];
        const progressPercent = toProgressPercent(progress);
        const completed = Boolean(progress?.completed) || progressPercent >= 100;
        const chapterCountFromVideo = Array.isArray(video?.chapters) ? video.chapters.length : 0;
        const chapterCount = chapterCountFromVideo || chapterProgress.length;
        const completedChapterCount = chapterProgress.filter((item) => Boolean(item?.completed)).length;
        const latestChapter = [...chapterProgress]
          .filter((item) => item?.lastWatchedAt)
          .sort((a, b) => new Date(b.lastWatchedAt || 0).getTime() - new Date(a.lastWatchedAt || 0).getTime())[0];

        return {
          ...video,
          progressPercent,
          completed,
          lastWatchedAt: progress?.lastWatchedAt || "",
          chapterCount,
          completedChapterCount,
          latestChapterTitle: latestChapter?.chapterTitle || "",
        };
      })
      .sort((a, b) => new Date(b.lastWatchedAt || 0).getTime() - new Date(a.lastWatchedAt || 0).getTime());
  }, [academyProgressMap, academyChapterProgressMap, purchasedVideos]);
  const completedVideoCount = useMemo(
    () => learningHistory.filter((video) => video.completed).length,
    [learningHistory]
  );
  const totalSpent = useMemo(
    () => userOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
    [userOrders]
  );

  const [form, setForm] = useState({
    loginId: currentUser.loginId || "",
    name: currentUser.name || "",
    email: currentUser.email || "",
    phone: currentUser.phone || "",
    birthYear: currentUser.birthYear ? String(currentUser.birthYear) : "",
    newPassword: "",
    currentPassword: "",
  });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [emailVerificationState, setEmailVerificationState] = useState({
    status: "",
    text: "",
    verifiedEmail: "",
    debugCode: "",
  });
  const [isSendingEmailCode, setIsSendingEmailCode] = useState(false);
  const [isVerifyingEmailCode, setIsVerifyingEmailCode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: "", text: "" });

  const normalizedCurrentEmail = String(currentUser.email || "").trim().toLowerCase();
  const normalizedFormEmail = String(form.email || "").trim().toLowerCase();
  const isEmailChanged = normalizedFormEmail !== normalizedCurrentEmail;
  const isEmailVerified =
    !isEmailChanged ||
    (emailVerificationState.status === "success" &&
      emailVerificationState.verifiedEmail === normalizedFormEmail);

  useEffect(() => {
    setForm({
      loginId: currentUser.loginId || "",
      name: currentUser.name || "",
      email: currentUser.email || "",
      phone: currentUser.phone || "",
      birthYear: currentUser.birthYear ? String(currentUser.birthYear) : "",
      newPassword: "",
      currentPassword: "",
    });
    setEmailVerificationCode("");
    setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });
  }, [currentUser.loginId, currentUser.name, currentUser.email, currentUser.phone, currentUser.birthYear]);

  useEffect(() => {
    if (!isEmailChanged) {
      setEmailVerificationCode("");
      setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });
    }
  }, [isEmailChanged]);

  useEffect(() => {
    if (!currentUser?.id) return;
    store.refreshAcademyProgress?.().catch((error) => {
      console.error("[academy-progress] refresh failed", error);
    });
  }, [currentUser?.id]);

  async function handleRequestEmailVerification() {
    setSaveMessage({ type: "", text: "" });
    setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });

    if (!normalizedFormEmail) {
      setEmailVerificationState({
        status: "error",
        text: "??좎럥李??좎럩???믪눦?? ??좎럥???雅뚯눘苑??",
        verifiedEmail: "",
        debugCode: "",
      });
      return;
    }

    try {
      setIsSendingEmailCode(true);
      const result = await store.requestEmailVerification(normalizedFormEmail);
      setEmailVerificationState({
        status: "pending",
        text: result?.message || "??좎럩弛녻린?딆깈??獄쏆뮇???좎럩???좎럥??",
        verifiedEmail: "",
        debugCode: result?.debugCode || "",
      });
    } catch (error) {
      setEmailVerificationState({
        status: "error",
        text: error?.message || "??좎럩弛녻린?딆깈 獄쏆뮇??????좎럥履잌첎? 獄쏆뮇源??좎럩???좎럥??",
        verifiedEmail: "",
        debugCode: "",
      });
    } finally {
      setIsSendingEmailCode(false);
    }
  }

  async function handleConfirmEmailVerification() {
    setSaveMessage({ type: "", text: "" });

    if (!normalizedFormEmail) {
      setEmailVerificationState({
        status: "error",
        text: "??좎럥李??좎럩???믪눦?? ??좎럥???雅뚯눘苑??",
        verifiedEmail: "",
        debugCode: "",
      });
      return;
    }

    if (!String(emailVerificationCode || "").trim()) {
      setEmailVerificationState({
        status: "error",
        text: "??좎럩弛녻린?딆깈????좎럥???雅뚯눘苑??",
        verifiedEmail: "",
        debugCode: "",
      });
      return;
    }

    try {
      setIsVerifyingEmailCode(true);
      const result = await store.confirmEmailVerification(normalizedFormEmail, emailVerificationCode);
      setEmailVerificationState({
        status: "success",
        text: result?.message || "??좎럥李????좎럩弛????좎럥利??좎럩肉??좎럥???",
        verifiedEmail: normalizedFormEmail,
        debugCode: "",
      });
    } catch (error) {
      setEmailVerificationState({
        status: "error",
        text: error?.message || "??좎럩弛녻린?딆깈 ??좎럩??????좎럥履잌첎? 獄쏆뮇源??좎럩???좎럥??",
        verifiedEmail: "",
        debugCode: "",
      });
    } finally {
      setIsVerifyingEmailCode(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveMessage({ type: "", text: "" });

    if (!form.currentPassword.trim()) {
      setSaveMessage({ type: "error", text: "??좎럥??癰궰野껋럩????좎?鍮???좎럩????쒀??甕곕뜇?뉐뜝???좎럥???雅뚯눘苑??" });
      return;
    }

    if (isEmailChanged && !isEmailVerified) {
      setSaveMessage({ type: "error", text: "??좎럥李??癰궰??????좎럩弛녻린?딆깈 ??좎럩?????좎럥利??雅뚯눘苑??" });
      return;
    }

    try {
      setIsSaving(true);
      const updatedUser = await store.updateMyProfile({
        loginId: form.loginId.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        birthYear: form.birthYear.trim() ? form.birthYear.trim() : null,
        newPassword: form.newPassword.trim(),
        currentPassword: form.currentPassword.trim(),
      });

      setForm((prev) => ({
        ...prev,
        loginId: updatedUser.loginId || "",
        name: updatedUser.name || prev.name,
        email: updatedUser.email || "",
        phone: updatedUser.phone || "",
        birthYear: updatedUser.birthYear ? String(updatedUser.birthYear) : "",
        newPassword: "",
        currentPassword: "",
      }));
      setEmailVerificationCode("");
      setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });
      setSaveMessage({ type: "success", text: "揶쏆뮇???좎럥?ュ첎? ??좎럩湲??좎럩?앭뜝?????좎럥由??좎럩???좎럥??" });
    } catch (error) {
      setSaveMessage({
        type: "error",
        text: error?.message || "揶쏆뮇???좎럥??????????좎럥履잌첎? 獄쏆뮇源??좎럩???좎럥??",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader subpage />
      <main className="dashboard-page">
        <section className="dashboard-hero mypage-hero-card">
          <p className="section-kicker">마이페이지</p>
          <h1>{currentUser.name} 님의 마이페이지</h1>
          <div className="mypage-identity-row">
            <span className="mypage-identity-chip">구매 영상 {purchasedVideoItemCount}건</span>
            <span className="mypage-identity-chip">수강 완료 {completedVideoCount}개</span>
            <span className="mypage-identity-chip">주문 {userOrders.length}건</span>
            <span className="mypage-identity-chip">누적 결제 {store.formatCurrency(totalSpent)}</span>
            <span className="mypage-identity-chip">포인트 {store.formatCurrency(store.userPoints ?? 0)}</span>
          </div>
        </section>

        <section className="dashboard-grid">
          <div>
            <div className="dashboard-section-header">
              <h2>구매 영상 수강</h2>
              <p className="section-text">
                중복 제외 {purchasedVideos.length}개 강의 / 총 구매 {purchasedVideoItemCount}건
              </p>
            </div>
            <div className="dashboard-card-grid">
              {learningHistory.length ? (
                learningHistory.map((video) => {
                  const expiry = calcEnrollmentExpiryForMyPage(
                    store.orders,
                    video.productId || video.id,
                    video.period
                  );
                  const durSec = calcChaptersTotalDuration(video.chapters);
                  const durLabel = formatDuration(durSec);
                  const isExpired = expiry && expiry.daysLeft <= 0;

                  return (
                  <article key={video.id} className={`dashboard-card mypage-course-card mypage-video-card ${isExpired ? "is-expired" : ""}`}>
                    <img
                      src={resolveAcademyMediaUrl(video.image)}
                      alt={video.title}
                      className="mypage-video-thumb"
                    />
                    <div className="mypage-video-copy">
                      <p className="mini-kicker">
                        {isExpired ? "수강 기한 만료" : video.completed ? "수강 완료" : video.progressPercent > 0 ? "이어 학습" : "새 강의"}
                      </p>
                      <h3>{video.title}</h3>
                      <p className="mypage-course-date">
                        {video.instructor} · {video.category}
                        {durLabel ? ` · ${durLabel}` : ""}
                      </p>
                      <p className="mypage-course-date">
                        진도 {video.progressPercent}%{video.lastWatchedAt ? ` · 최근 수강 ${formatDate(video.lastWatchedAt)}` : " · 아직 시청 전"}
                      </p>
                      {video.chapterCount > 0 ? (
                        <p className="mypage-course-date">
                          차시 {video.completedChapterCount}/{video.chapterCount}
                          {video.latestChapterTitle ? ` · 최근 차시 ${video.latestChapterTitle}` : ""}
                        </p>
                      ) : null}
                      {expiry ? (
                        <p className={`mypage-expiry-label ${expiry.daysLeft <= 0 ? "is-expired" : expiry.daysLeft <= 7 ? "is-urgent" : expiry.daysLeft <= 30 ? "is-warning" : ""}`}>
                          {expiry.daysLeft <= 0
                            ? `수강 기한 만료 (${expiry.expiryLabel})`
                            : `수강 만료 ${expiry.expiryLabel} · D-${expiry.daysLeft}`}
                        </p>
                      ) : null}
                    </div>
                    <div className="mypage-course-actions">
                      {video.completed ? (
                        <Link
                          to={`/academy/certificate/${video.id}`}
                          className="pill-button small"
                        >
                          수료증 보기
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="ghost-button small-ghost"
                        disabled={isExpired}
                        onClick={() => navigate(`/academy/player/${video.id}`)}
                      >
                        {isExpired ? "만료됨" : video.completed ? "다시보기" : video.progressPercent > 0 ? "이어보기" : "지금 수강"}
                      </button>
                    </div>
                  </article>
                  );
                })
              ) : (
                <article className="dashboard-card empty-state">
                  <h3>아직 구매한 교육 영상이 없습니다</h3>
                  <p>교육 영상 페이지에서 원하는 강의를 구매해보세요.</p>
                  <button className="pill-button small" type="button" onClick={() => navigate("/academy")}>
                    교육 영상 보러가기                  </button>
                </article>
              )}
            </div>
          </div>

          <aside className="mypage-aside-stack">
            <div className="dashboard-section-header">
              <h2>개인정보 수정</h2>
            </div>
            <form className="dashboard-card mypage-profile-form" onSubmit={handleSubmit}>
              <p className="mypage-form-caption">
                이름은 고정되고, 나머지 정보는 현재 비밀번호 인증 후 변경할 수 있습니다.
              </p>

              <div className="mypage-form-grid">
                <label className="mypage-field">
                  이름 (수정 불가)
                  <input type="text" value={form.name} disabled />
                </label>
                <label className="mypage-field">
                  아이디
                  <input
                    type="text"
                    value={form.loginId}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, loginId: event.target.value }))
                    }
                  />
                </label>

                <div className="mypage-field">
                  <span>이메일</span>
                  <div className="mypage-inline-field">
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="checkout-text-button mypage-inline-button"
                      onClick={handleRequestEmailVerification}
                      disabled={isSendingEmailCode || !isEmailChanged}
                    >
                      {isSendingEmailCode ? "발송 중..." : "인증번호 발송"}
                    </button>
                  </div>
                </div>
                <label className="mypage-field">
                  연락처
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, phone: event.target.value.replace(/\D/g, "") }))
                    }
                  />
                </label>
                <label className="mypage-field">
                  출생연도 (선택)
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="예: 1994"
                    value={form.birthYear}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        birthYear: event.target.value.replace(/\D/g, "").slice(0, 4),
                      }))
                    }
                  />
                </label>

                {isEmailChanged ? (
                  <div className="mypage-field mypage-field-full">
                    <span>이메일 인증번호</span>
                    <div className="mypage-inline-field">
                      <input
                        type="text"
                        value={emailVerificationCode}
                        onChange={(event) =>
                          setEmailVerificationCode(event.target.value.replace(/\D/g, ""))
                        }
                        placeholder="6자리 인증번호 입력"
                      />
                      <button
                        type="button"
                        className="checkout-text-button mypage-inline-button"
                        onClick={handleConfirmEmailVerification}
                        disabled={isVerifyingEmailCode}
                      >
                        {isVerifyingEmailCode ? "확인 중..." : "인증확인"}
                      </button>
                    </div>
                    {emailVerificationState.text ? (
                      <p className={`mypage-inline-message ${emailVerificationState.status}`}>
                        {emailVerificationState.text}
                        {emailVerificationState.debugCode
                          ? ` (개발용 인증번호: ${emailVerificationState.debugCode})`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <label className="mypage-field mypage-field-full">
                  새 비밀번호 (선택)
                  <span className="mypage-password-wrap">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={form.newPassword}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, newPassword: event.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="mypage-password-toggle"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      aria-label={showNewPassword ? "새 비밀번호 숨기기" : "새 비밀번호 보기"}
                    >
                      <EyeIcon open={showNewPassword} />
                    </button>
                  </span>
                </label>

                <label className="mypage-field mypage-field-full">
                  현재 비밀번호 (인증)
                  <span className="mypage-password-wrap">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      required
                      value={form.currentPassword}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="mypage-password-toggle"
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                      aria-label={showCurrentPassword ? "현재 비밀번호 숨기기" : "현재 비밀번호 보기"}
                    >
                      <EyeIcon open={showCurrentPassword} />
                    </button>
                  </span>
                </label>
              </div>

              {saveMessage.text ? (
                <p className={`mypage-save-message ${saveMessage.type}`}>{saveMessage.text}</p>
              ) : null}

              <button className="pill-button full mypage-save-button" type="submit" disabled={isSaving}>
                {isSaving ? "저장 중..." : "변경사항 저장"}
              </button>
            </form>

            <div className="dashboard-section-header">
                <h2>최근 주문 내역</h2>
            </div>
            <div className="dashboard-card order-list">
              {userOrders.length ? (
                userOrders.map((order, index) => (
                  <article key={order.orderId || order.id || `${order.createdAt || "order"}-${index}`} className="order-row">
                    <div>
                      <strong>{order.orderName}</strong>
                      <p>{formatDate(order.createdAt)}</p>
                    </div>
                    <strong>{store.formatCurrency(order.amount)}</strong>
                  </article>
                ))
              ) : (
                  <p className="empty-copy">주문 내역이 없습니다.</p>
              )}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}



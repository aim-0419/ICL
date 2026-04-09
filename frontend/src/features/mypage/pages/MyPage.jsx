import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { getPurchasedVideos } from "../../academy/lib/purchases.js";

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR");
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

export function MyPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const currentUser = store.currentUser || {};

  const userOrders = useMemo(
    () => store.orders.filter((order) => order.customerEmail === currentUser.email),
    [store.orders, currentUser.email]
  );
  const purchasedVideos = useMemo(
    () => getPurchasedVideos(store.orders, currentUser.email),
    [store.orders, currentUser.email]
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
      newPassword: "",
      currentPassword: "",
    });
    setEmailVerificationCode("");
    setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });
  }, [currentUser.loginId, currentUser.name, currentUser.email, currentUser.phone]);

  useEffect(() => {
    if (!isEmailChanged) {
      setEmailVerificationCode("");
      setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });
    }
  }, [isEmailChanged]);

  async function handleRequestEmailVerification() {
    setSaveMessage({ type: "", text: "" });
    setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });

    if (!normalizedFormEmail) {
      setEmailVerificationState({
        status: "error",
        text: "이메일을 먼저 입력해 주세요.",
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
        text: result?.message || "인증번호를 발송했습니다.",
        verifiedEmail: "",
        debugCode: result?.debugCode || "",
      });
    } catch (error) {
      setEmailVerificationState({
        status: "error",
        text: error?.message || "인증번호 발송 중 오류가 발생했습니다.",
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
        text: "이메일을 먼저 입력해 주세요.",
        verifiedEmail: "",
        debugCode: "",
      });
      return;
    }

    if (!String(emailVerificationCode || "").trim()) {
      setEmailVerificationState({
        status: "error",
        text: "인증번호를 입력해 주세요.",
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
        text: result?.message || "이메일 인증이 완료되었습니다.",
        verifiedEmail: normalizedFormEmail,
        debugCode: "",
      });
    } catch (error) {
      setEmailVerificationState({
        status: "error",
        text: error?.message || "인증번호 확인 중 오류가 발생했습니다.",
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
      setSaveMessage({ type: "error", text: "정보 변경을 위해 현재 비밀번호를 입력해 주세요." });
      return;
    }

    if (isEmailChanged && !isEmailVerified) {
      setSaveMessage({ type: "error", text: "이메일 변경 전 인증번호 확인을 완료해 주세요." });
      return;
    }

    try {
      setIsSaving(true);
      const updatedUser = await store.updateMyProfile({
        loginId: form.loginId.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        newPassword: form.newPassword.trim(),
        currentPassword: form.currentPassword.trim(),
      });

      setForm((prev) => ({
        ...prev,
        loginId: updatedUser.loginId || "",
        name: updatedUser.name || prev.name,
        email: updatedUser.email || "",
        phone: updatedUser.phone || "",
        newPassword: "",
        currentPassword: "",
      }));
      setEmailVerificationCode("");
      setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });
      setSaveMessage({ type: "success", text: "개인정보가 정상적으로 저장되었습니다." });
    } catch (error) {
      setSaveMessage({
        type: "error",
        text: error?.message || "개인정보 저장 중 오류가 발생했습니다.",
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
          <p className="section-kicker">My Page</p>
          <h1>{currentUser.name} 님의 마이페이지</h1>
          <div className="mypage-identity-row">
            <span className="mypage-identity-chip">구매 영상 {purchasedVideos.length}개</span>
            <span className="mypage-identity-chip">주문 {userOrders.length}건</span>
            <span className="mypage-identity-chip">누적 결제 {store.formatCurrency(totalSpent)}</span>
          </div>
        </section>

        <section className="dashboard-grid">
          <div>
            <div className="dashboard-section-header">
              <h2>구매 영상 재생</h2>
            </div>
            <div className="dashboard-card-grid">
              {purchasedVideos.length ? (
                purchasedVideos.map((video) => (
                  <article key={video.id} className="dashboard-card mypage-course-card mypage-video-card">
                    <img src={video.image} alt={video.title} className="mypage-video-thumb" />
                    <div className="mypage-video-copy">
                      <p className="mini-kicker">Purchased Video</p>
                      <h3>{video.title}</h3>
                      <p className="mypage-course-date">
                        {video.instructor} · {video.category}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ghost-button small-ghost"
                      onClick={() => navigate(`/academy/player/${video.id}`)}
                    >
                      영상 재생
                    </button>
                  </article>
                ))
              ) : (
                <article className="dashboard-card empty-state">
                  <h3>아직 구매한 교육 영상이 없습니다</h3>
                  <p>교육 영상 페이지에서 원하는 강의를 구매해 보세요.</p>
                  <button className="pill-button small" type="button" onClick={() => navigate("/academy")}>
                    교육 영상 보러가기
                  </button>
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
                이름은 고정되며, 다른 정보는 현재 비밀번호 인증 후 변경할 수 있습니다.
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
                userOrders.map((order) => (
                  <article key={order.orderId} className="order-row">
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

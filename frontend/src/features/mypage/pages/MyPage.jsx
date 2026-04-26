// 파일 역할: 회원의 주문, 강의 수강권, 진도, 포인트, 프로필, 탈퇴 흐름을 보여주는 마이페이지 컴포넌트입니다.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import {
  deleteAcademyVideo,
  listMyAcademyQna,
  resolveAcademyMediaUrl,
  updateAcademyVideo,
  uploadAcademyAsset,
} from "../../academy/api/academyApi.js";
import { countPurchasedVideoItems, getPurchasedVideos } from "../../academy/lib/purchases.js";
import { apiRequest } from "../../../shared/api/client.js";
import { isAdminStaff } from "../../../shared/auth/userRoles.js";

// 함수 역할: study 기간 days 문자열이나 페이로드를 코드에서 쓰기 쉬운 구조로 파싱합니다.
function parseStudyPeriodDays(periodText) {
  if (!periodText) return null;
  const text = String(periodText).trim();
  if (/무제한|평생|unlimited|lifetime/i.test(text)) return null;
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

// 컴포넌트 역할: calcEnrollmentExpiryForMyPage 화면을 렌더링하고 필요한 API 호출과 사용자 입력 상태를 관리합니다.
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

// 함수 역할: 차시 전체 재생 시간 값을 계산합니다.
function calcChaptersTotalDuration(chapters) {
  if (!Array.isArray(chapters)) return 0;
  return chapters.reduce((s, ch) => s + Math.max(0, Number(ch.durationSec || 0)), 0);
}

// 함수 역할: 재생 시간 값을 화면에 보여주기 좋은 문구로 변환합니다.
function formatDuration(sec) {
  if (!sec || sec < 60) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

// 함수 역할: 날짜 값을 화면에 보여주기 좋은 문구로 변환합니다.
function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR");
}

// 함수 역할: 날짜+시간 값을 분 단위까지 화면용 텍스트로 변환합니다.
function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 함수 역할: 학습 진도 비율 값으로 안전하게 변환합니다.
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

// 컴포넌트 역할: 비밀번호 표시/숨김 상태에 맞는 아이콘을 렌더링합니다.
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

// 함수 역할: 안전한 number 값으로 안전하게 변환합니다.
function toSafeNumber(value, fallback = 0) {
  const parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

// 컴포넌트 역할: 회원의 주문, 강의 수강권, 진도, 포인트, 프로필, 탈퇴 흐름을 보여주는 마이페이지 컴포넌트입니다.
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

  const [myGrants, setMyGrants] = useState([]);
  const [activeVideoTab, setActiveVideoTab] = useState("purchased");
  const [myQnaItems, setMyQnaItems] = useState([]);
  const [myQnaLoading, setMyQnaLoading] = useState(false);
  const [myQnaError, setMyQnaError] = useState("");

  const [myRefundRequests, setMyRefundRequests] = useState([]);
  const [refundModal, setRefundModal] = useState(null);
  const [refundSelectedProductIds, setRefundSelectedProductIds] = useState([]);
  const [refundReason, setRefundReason] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundMessage, setRefundMessage] = useState({ type: "", text: "" });

  const allVideos = useMemo(
    () => (Array.isArray(store.academyVideos) ? store.academyVideos : []),
    [store.academyVideos]
  );

  const grantedVideos = useMemo(() => {
    const purchasedIds = new Set(purchasedVideos.map((v) => String(v.id)));
    const grantedVideoIds = new Set(myGrants.map((g) => String(g.videoId)));
    return allVideos
      .filter((v) => grantedVideoIds.has(String(v.id)) && !purchasedIds.has(String(v.id)))
      .map((video) => {
        const grant = myGrants.find((g) => String(g.videoId) === String(video.id));
        return { ...video, grant };
      });
  }, [myGrants, purchasedVideos, allVideos]);

  const grantedLearningHistory = useMemo(() => {
    return grantedVideos
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
  }, [grantedVideos, academyProgressMap, academyChapterProgressMap]);

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
  const [withdrawPhone, setWithdrawPhone] = useState(currentUser.phone || "");
  const [withdrawVerificationCode, setWithdrawVerificationCode] = useState("");
  const [withdrawVerificationState, setWithdrawVerificationState] = useState({
    status: "",
    text: "",
    verifiedPhone: "",
    debugCode: "",
  });
  const [isWithdrawConfirmOpened, setIsWithdrawConfirmOpened] = useState(false);
  const [isSendingWithdrawCode, setIsSendingWithdrawCode] = useState(false);
  const [isVerifyingWithdrawCode, setIsVerifyingWithdrawCode] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState({ type: "", text: "" });

  const normalizedCurrentEmail = String(currentUser.email || "").trim().toLowerCase();
  const normalizedFormEmail = String(form.email || "").trim().toLowerCase();
  const isEmailChanged = normalizedFormEmail !== normalizedCurrentEmail;
  const isEmailVerified =
    !isEmailChanged ||
    (emailVerificationState.status === "success" &&
      emailVerificationState.verifiedEmail === normalizedFormEmail);
  const normalizedWithdrawPhone = String(withdrawPhone || "").replace(/\D/g, "");
  const isWithdrawPhoneVerified =
    withdrawVerificationState.status === "success" &&
    withdrawVerificationState.verifiedPhone === normalizedWithdrawPhone;

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
    setWithdrawPhone(currentUser.phone || "");
    setWithdrawVerificationCode("");
    setWithdrawVerificationState({ status: "", text: "", verifiedPhone: "", debugCode: "" });
    setIsWithdrawConfirmOpened(false);
    setWithdrawMessage({ type: "", text: "" });
  }, [currentUser.loginId, currentUser.name, currentUser.email, currentUser.phone, currentUser.birthYear]);

  useEffect(() => {
    if (!isEmailChanged) {
      setEmailVerificationCode("");
      setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });
    }
  }, [isEmailChanged]);

  useEffect(() => {
    setWithdrawVerificationCode("");
    setWithdrawVerificationState({ status: "", text: "", verifiedPhone: "", debugCode: "" });
    setWithdrawMessage({ type: "", text: "" });
  }, [normalizedWithdrawPhone]);

  useEffect(() => {
    if (!currentUser?.id) return;
    store.refreshAcademyProgress?.().catch((error) => {
      console.error("[academy-progress] refresh failed", error);
    });
    setMyQnaLoading(true);
    setMyQnaError("");
    listMyAcademyQna()
      .then((items) => setMyQnaItems(Array.isArray(items) ? items : []))
      .catch((error) => {
        setMyQnaItems([]);
        setMyQnaError(error.message || "내 Q&A 목록을 불러오지 못했습니다.");
      })
      .finally(() => setMyQnaLoading(false));
    apiRequest("/users/me/video-grants")
      .then((result) => setMyGrants(Array.isArray(result?.grants) ? result.grants : []))
      .catch(() => setMyGrants([]));
    apiRequest("/refunds/me")
      .then((result) => setMyRefundRequests(Array.isArray(result?.requests) ? result.requests : []))
      .catch(() => setMyRefundRequests([]));
  }, [currentUser?.id]);

  function openRefundModal(order) {
    const activeIds = Array.isArray(order.activeProductIds) && order.activeProductIds.length
      ? order.activeProductIds
      : [];
    const fallbackIds = Array.isArray(order.selectedProductIds) && order.selectedProductIds.length
      ? order.selectedProductIds
      : [];
    const allIds = activeIds.length ? activeIds : fallbackIds;
    setRefundModal(order);
    setRefundSelectedProductIds(allIds);
    setRefundReason("");
    setRefundMessage({ type: "", text: "" });
  }

  function closeRefundModal() {
    setRefundModal(null);
    setRefundSelectedProductIds([]);
    setRefundReason("");
    setRefundMessage({ type: "", text: "" });
  }

  function toggleRefundProduct(productId) {
    setRefundSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }

  async function handleSubmitRefund() {
    if (!refundModal) return;
    if (!refundSelectedProductIds.length) {
      setRefundMessage({ type: "error", text: "환불할 상품을 하나 이상 선택해 주세요." });
      return;
    }
    if (!refundReason.trim()) {
      setRefundMessage({ type: "error", text: "환불 사유를 입력해 주세요." });
      return;
    }
    setRefundSubmitting(true);
    setRefundMessage({ type: "", text: "" });
    try {
      await apiRequest("/refunds", {
        method: "POST",
        body: {
          orderId: refundModal.orderId || refundModal.id,
          selectedProductIds: refundSelectedProductIds,
          reason: refundReason.trim(),
        },
      });
      const result = await apiRequest("/refunds/me");
      setMyRefundRequests(Array.isArray(result?.requests) ? result.requests : []);
      setRefundMessage({ type: "success", text: "환불 신청이 접수되었습니다. 관리자 검토 후 처리됩니다." });
      setTimeout(closeRefundModal, 2000);
    } catch (error) {
      setRefundMessage({ type: "error", text: error.message || "환불 신청에 실패했습니다." });
    } finally {
      setRefundSubmitting(false);
    }
  }

  function getRefundStatusLabel(status) {
    if (status === "pending") return "검토 중";
    if (status === "approved") return "환불 완료";
    if (status === "rejected") return "거절됨";
    return status;
  }

  function getRefundStatusClass(status) {
    if (status === "approved") return "refund-status approved";
    if (status === "rejected") return "refund-status rejected";
    return "refund-status pending";
  }

  async function handleRequestEmailVerification() {
    setSaveMessage({ type: "", text: "" });
    setEmailVerificationState({ status: "", text: "", verifiedEmail: "", debugCode: "" });

    if (!normalizedFormEmail) {
      setEmailVerificationState({
        status: "error",
        text: "이메일 주소를 입력해 주세요.",
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
        text: result?.message || "이메일 인증번호를 발송했습니다.",
        verifiedEmail: "",
        debugCode: result?.debugCode || "",
      });
    } catch (error) {
      setEmailVerificationState({
        status: "error",
        text: error?.message || "이메일 인증번호 발송에 실패했습니다.",
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
        text: "이메일 주소를 입력해 주세요.",
        verifiedEmail: "",
        debugCode: "",
      });
      return;
    }

    if (!String(emailVerificationCode || "").trim()) {
      setEmailVerificationState({
        status: "error",
        text: "이메일 인증번호를 입력해 주세요.",
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
        text: error?.message || "이메일 인증 확인에 실패했습니다.",
        verifiedEmail: "",
        debugCode: "",
      });
    } finally {
      setIsVerifyingEmailCode(false);
    }
  }

  function handleOpenWithdrawFlow() {
    setWithdrawMessage({ type: "", text: "" });
    const confirmed = window.confirm("회원 탈퇴 하시겠습니까?");
    if (!confirmed) return;
    setIsWithdrawConfirmOpened(true);
  }

  async function handleRequestWithdrawVerification() {
    setWithdrawMessage({ type: "", text: "" });
    setWithdrawVerificationState({ status: "", text: "", verifiedPhone: "", debugCode: "" });

    if (!normalizedWithdrawPhone) {
      setWithdrawVerificationState({
        status: "error",
        text: "전화번호를 입력해주세요.",
        verifiedPhone: "",
        debugCode: "",
      });
      return;
    }

    try {
      setIsSendingWithdrawCode(true);
      const result = await store.requestWithdrawPhoneVerification(normalizedWithdrawPhone);
      setWithdrawVerificationState({
        status: "pending",
        text: result?.message || "전화번호 인증번호를 발송했습니다.",
        verifiedPhone: "",
        debugCode: result?.debugCode || "",
      });
    } catch (error) {
      setWithdrawVerificationState({
        status: "error",
        text: error?.message || "전화번호 인증번호 발송에 실패했습니다.",
        verifiedPhone: "",
        debugCode: "",
      });
    } finally {
      setIsSendingWithdrawCode(false);
    }
  }

  async function handleConfirmWithdrawVerification() {
    setWithdrawMessage({ type: "", text: "" });

    if (!normalizedWithdrawPhone) {
      setWithdrawVerificationState({
        status: "error",
        text: "전화번호를 입력해주세요.",
        verifiedPhone: "",
        debugCode: "",
      });
      return;
    }

    if (!String(withdrawVerificationCode || "").trim()) {
      setWithdrawVerificationState({
        status: "error",
        text: "인증번호를 입력해주세요.",
        verifiedPhone: "",
        debugCode: "",
      });
      return;
    }

    try {
      setIsVerifyingWithdrawCode(true);
      const result = await store.confirmWithdrawPhoneVerification(
        normalizedWithdrawPhone,
        withdrawVerificationCode
      );
      setWithdrawVerificationState({
        status: "success",
        text: result?.message || "전화번호 인증이 완료됐습니다.",
        verifiedPhone: normalizedWithdrawPhone,
        debugCode: "",
      });
    } catch (error) {
      setWithdrawVerificationState({
        status: "error",
        text: error?.message || "전화번호 인증 확인에 실패했습니다.",
        verifiedPhone: "",
        debugCode: "",
      });
    } finally {
      setIsVerifyingWithdrawCode(false);
    }
  }

  async function handleWithdrawAccount() {
    setWithdrawMessage({ type: "", text: "" });

    if (!isWithdrawPhoneVerified) {
      setWithdrawMessage({ type: "error", text: "탈퇴 전 전화번호 인증을 완료해주세요." });
      return;
    }

    try {
      setIsWithdrawing(true);
      const result = await store.withdrawMe(normalizedWithdrawPhone);
      setWithdrawMessage({
        type: "success",
        text:
          result?.message ||
          "탈퇴가 완료됐습니다. 탈퇴 데이터는 90일간 보존되며, 기간 내 재가입으로 복구하실 수 있습니다.",
      });
      window.alert(
        "탈퇴가 완료됐습니다.\n탈퇴 데이터는 90일간 보존되며, 기간 내 재가입으로 복구하실 수 있습니다."
      );
      navigate("/");
    } catch (error) {
      setWithdrawMessage({
        type: "error",
        text: error?.message || "회원 탈퇴 처리에 실패했습니다.",
      });
    } finally {
      setIsWithdrawing(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveMessage({ type: "", text: "" });

    if (!form.currentPassword.trim()) {
      setSaveMessage({ type: "error", text: "회원정보 수정을 위해 현재 비밀번호를 입력해 주세요." });
      return;
    }

    if (isEmailChanged && !isEmailVerified) {
      setSaveMessage({ type: "error", text: "이메일을 변경하려면 이메일 인증을 먼저 완료해 주세요." });
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
      setSaveMessage({ type: "success", text: "회원정보가 성공적으로 수정되었습니다." });
    } catch (error) {
      setSaveMessage({
        type: "error",
        text: error?.message || "회원정보 수정 처리에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="dashboard-page">
        <section className="dashboard-hero mypage-hero-card">
          <p className="section-kicker">마이페이지</p>
          <h1>{currentUser.name} 님의 마이페이지</h1>
          <div className="mypage-identity-row">
            <span className="mypage-identity-chip">구매 영상 {purchasedVideoItemCount}건</span>
            <span className="mypage-identity-chip">수강 영상 {grantedVideos.length}개</span>
            <span className="mypage-identity-chip">수강 완료 {completedVideoCount}개</span>
            <span className="mypage-identity-chip">주문 {userOrders.length}건</span>
            <span className="mypage-identity-chip">누적 결제 {store.formatCurrency(totalSpent)}</span>
            <span className="mypage-identity-chip">포인트 {store.formatCurrency(store.userPoints ?? 0)}</span>
          </div>
        </section>

        <section className="dashboard-grid">
          <div>
            <div className="mypage-video-tab-bar">
              <button
                type="button"
                className={`mypage-video-tab ${activeVideoTab === "purchased" ? "active" : ""}`}
                onClick={() => setActiveVideoTab("purchased")}
              >
                구매 영상
                <span className="mypage-video-tab-count">{purchasedVideos.length}</span>
              </button>
              <button
                type="button"
                className={`mypage-video-tab ${activeVideoTab === "granted" ? "active" : ""}`}
                onClick={() => setActiveVideoTab("granted")}
              >
                수강 영상
                <span className="mypage-video-tab-count">{grantedVideos.length}</span>
              </button>
            </div>

            {activeVideoTab === "purchased" && (
              <div className="dashboard-card-grid">
                {learningHistory.length ? (
                  learningHistory.map((video) => {
                    const expiry = calcEnrollmentExpiryForMyPage(store.orders, video.productId || video.id, video.period);
                    const durSec = calcChaptersTotalDuration(video.chapters);
                    const durLabel = formatDuration(durSec);
                    const isExpired = expiry && expiry.daysLeft <= 0;
                    return (
                      <article key={video.id} className={`dashboard-card mypage-course-card mypage-video-card ${isExpired ? "is-expired" : ""}`}>
                        <img src={resolveAcademyMediaUrl(video.image)} alt={video.title} className="mypage-video-thumb" />
                        <div className="mypage-video-copy">
                          <p className="mini-kicker">
                            {isExpired ? "수강 기한 만료" : video.completed ? "수강 완료" : video.progressPercent > 0 ? "이어 학습" : "새 강의"}
                          </p>
                          <h3>{video.title}</h3>
                          <p className="mypage-course-date">
                            {video.instructor} · {video.category}{durLabel ? ` · ${durLabel}` : ""}
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
                              {expiry.daysLeft <= 0 ? `수강 기한 만료 (${expiry.expiryLabel})` : `수강 만료 ${expiry.expiryLabel} · D-${expiry.daysLeft}`}
                            </p>
                          ) : null}
                        </div>
                        <div className="mypage-course-actions">
                          {video.completed ? (
                            <Link to={`/academy/certificate/${video.id}`} className="pill-button small">수료증 보기</Link>
                          ) : null}
                          <button type="button" className="ghost-button small-ghost" disabled={isExpired} onClick={() => navigate(`/academy/player/${video.id}`)}>
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
                      교육 영상 보러가기
                    </button>
                  </article>
                )}
              </div>
            )}

            {activeVideoTab === "granted" && (
              <div className="dashboard-card-grid">
                {grantedLearningHistory.length ? (
                  grantedLearningHistory.map((video) => {
                    const durSec = calcChaptersTotalDuration(video.chapters);
                    const durLabel = formatDuration(durSec);
                    const expiresAt = video.grant?.expiresAt ? new Date(video.grant.expiresAt) : null;
                    const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / 86400000) : null;
                    const isExpired = daysLeft !== null && daysLeft <= 0;
                    return (
                      <article key={video.id} className={`dashboard-card mypage-course-card mypage-video-card mypage-granted-card ${isExpired ? "is-expired" : ""}`}>
                        <img src={resolveAcademyMediaUrl(video.image)} alt={video.title} className="mypage-video-thumb" />
                        <div className="mypage-video-copy">
                          <p className="mini-kicker mypage-granted-badge">센터 제공</p>
                          <h3>{video.title}</h3>
                          <p className="mypage-course-date">
                            {video.instructor}{video.category ? ` · ${video.category}` : ""}{durLabel ? ` · ${durLabel}` : ""}
                          </p>
                          <p className="mypage-course-date">
                            진도 {video.progressPercent}%{video.lastWatchedAt ? ` · 최근 수강 ${formatDate(video.lastWatchedAt)}` : " · 아직 시청 전"}
                          </p>
                          {video.chapterCount > 0 && (
                            <p className="mypage-course-date">
                              차시 {video.completedChapterCount}/{video.chapterCount}
                              {video.latestChapterTitle ? ` · 최근 차시 ${video.latestChapterTitle}` : ""}
                            </p>
                          )}
                          {daysLeft !== null ? (
                            <p className={`mypage-expiry-label ${isExpired ? "is-expired" : daysLeft <= 1 ? "is-urgent" : daysLeft <= 7 ? "is-warning" : ""}`}>
                              {isExpired ? "수강 기한 만료" : `수강 만료 D-${daysLeft} · ${expiresAt.toLocaleDateString("ko-KR")}`}
                            </p>
                          ) : (
                            <p className="mypage-expiry-label">무제한 이용</p>
                          )}
                        </div>
                        <div className="mypage-course-actions">
                          {video.completed && (
                            <Link to={`/academy/certificate/${video.id}`} className="pill-button small">수료증 보기</Link>
                          )}
                          <button type="button" className="ghost-button small-ghost" disabled={isExpired} onClick={() => navigate(`/academy/player/${video.id}`)}>
                            {isExpired ? "만료됨" : video.completed ? "다시보기" : video.progressPercent > 0 ? "이어보기" : "지금 수강"}
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <article className="dashboard-card empty-state">
                    <h3>센터에서 제공한 수강 영상이 없습니다</h3>
                    <p>오프라인 수강생은 센터를 통해 영상을 이용하실 수 있습니다.</p>
                  </article>
                )}
              </div>
            )}
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
              <h2>회원 탈퇴</h2>
            </div>
            <div className="dashboard-card mypage-withdraw-card">
              <p className="mypage-withdraw-note">
                탈퇴 후 계정 데이터는 90일간 보존되며, 기간 내 재가입으로 복구하실 수 있습니다.
              </p>
              <button type="button" className="ghost-button small-ghost" onClick={handleOpenWithdrawFlow}>
                회원 탈퇴 진행
              </button>

              {isWithdrawConfirmOpened ? (
                <div className="mypage-withdraw-panel">
                  <label className="mypage-field">
                    본인인증 전화번호
                    <div className="mypage-inline-field">
                      <input
                        type="tel"
                        value={withdrawPhone}
                        onChange={(event) =>
                          setWithdrawPhone(event.target.value.replace(/\D/g, ""))
                        }
                        placeholder="숫자만 입력"
                      />
                      <button
                        type="button"
                        className="checkout-text-button mypage-inline-button"
                        onClick={handleRequestWithdrawVerification}
                        disabled={isSendingWithdrawCode}
                      >
                        {isSendingWithdrawCode ? "발송 중..." : "인증번호 발송"}
                      </button>
                    </div>
                  </label>

                  <label className="mypage-field">
                    인증번호
                    <div className="mypage-inline-field">
                      <input
                        type="text"
                        value={withdrawVerificationCode}
                        onChange={(event) =>
                          setWithdrawVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="6자리 인증번호 입력"
                      />
                      <button
                        type="button"
                        className="checkout-text-button mypage-inline-button"
                        onClick={handleConfirmWithdrawVerification}
                        disabled={isVerifyingWithdrawCode}
                      >
                        {isVerifyingWithdrawCode ? "확인 중..." : "인증확인"}
                      </button>
                    </div>
                  </label>

                  {withdrawVerificationState.text ? (
                    <p className={`mypage-inline-message ${withdrawVerificationState.status}`}>
                      {withdrawVerificationState.text}
                      {withdrawVerificationState.debugCode
                        ? ` (개발용 인증번호: ${withdrawVerificationState.debugCode})`
                        : ""}
                    </p>
                  ) : null}

                  {withdrawMessage.text ? (
                    <p className={`mypage-save-message ${withdrawMessage.type}`}>{withdrawMessage.text}</p>
                  ) : null}

                  <button
                    type="button"
                    className="pill-button full mypage-withdraw-submit"
                    onClick={handleWithdrawAccount}
                    disabled={!isWithdrawPhoneVerified || isWithdrawing}
                  >
                    {isWithdrawing ? "탈퇴 처리 중..." : "전화번호 인증 후 탈퇴 완료"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="dashboard-section-header">
                <h2>최근 주문 내역</h2>
            </div>
            <div className="dashboard-card order-list">
              {userOrders.length ? (
                userOrders.map((order, index) => {
                  const orderId = order.orderId || order.id || "";
                  const orderRequests = myRefundRequests.filter((r) => r.orderId === orderId);
                  const latestRequest = orderRequests[0] || null;
                  const pendingRequest = orderRequests.find((r) => r.status === "pending");
                  const payload = typeof order.payload === "object" ? order.payload : {};
                  const cancelledIds = new Set(
                    Array.isArray(order.cancelledProductIds)
                      ? order.cancelledProductIds
                      : Array.isArray(payload.cancelledProductIds)
                        ? payload.cancelledProductIds
                        : []
                  );
                  const isFullyRefunded = order.paymentStatus === "refunded" ||
                    (order.refundAmount != null && order.refundAmount >= order.amount);
                  const allProductIds = Array.isArray(order.selectedProductIds) ? order.selectedProductIds : [];
                  const activeProductIds = allProductIds.filter((id) => !cancelledIds.has(id));
                  const canRequestRefund = !isFullyRefunded && activeProductIds.length > 0 && !pendingRequest;

                  return (
                    <article key={orderId || `${order.createdAt || "order"}-${index}`} className="order-row">
                      <div className="order-row-info">
                        <strong>{order.orderName}</strong>
                        <p>{formatDate(order.createdAt)}</p>
                        {latestRequest ? (
                          <span className={getRefundStatusClass(latestRequest.status)}>
                            환불 {getRefundStatusLabel(latestRequest.status)}
                            {latestRequest.adminNote ? ` · ${latestRequest.adminNote}` : ""}
                          </span>
                        ) : null}
                      </div>
                      <div className="order-row-actions">
                        <strong>{store.formatCurrency(order.amount)}</strong>
                        {canRequestRefund ? (
                          <button
                            type="button"
                            className="ghost-button small-ghost"
                            onClick={() => openRefundModal({ ...order, orderId, activeProductIds })}
                          >
                            환불 신청
                          </button>
                        ) : null}
                        {isFullyRefunded ? (
                          <span className="refund-status approved">환불 완료</span>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              ) : (
                  <p className="empty-copy">주문 내역이 없습니다.</p>
              )}
            </div>

            <div className="dashboard-section-header">
              <h2>내 Q&A</h2>
            </div>
            <div className="dashboard-card order-list">
              {myQnaLoading ? (
                <p className="empty-copy">불러오는 중...</p>
              ) : myQnaError ? (
                <p className="empty-copy">{myQnaError}</p>
              ) : myQnaItems.length ? (
                myQnaItems.map((item) => (
                  <article key={item.id} className="order-row mypage-qna-row">
                    <div className="order-row-info">
                      <strong>{item.title}</strong>
                      <p>{item.videoTitle}</p>
                      <p>작성 {formatDateTime(item.createdAt)}</p>
                      {item.answered ? (
                        <p>답변 {item.replyCount}건 · 최근 답변 {formatDateTime(item.lastReplyAt)}</p>
                      ) : (
                        <p>답변 대기 중</p>
                      )}
                    </div>
                    <div className="order-row-actions">
                      <span className={`refund-status ${item.answered ? "approved" : "pending"}`}>
                        {item.answered ? "답변 완료" : "답변 대기"}
                      </span>
                      <button
                        type="button"
                        className="ghost-button small-ghost"
                        onClick={() => navigate(`/academy/player/${item.videoId}`)}
                      >
                        보기
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="empty-copy">작성한 Q&A가 없습니다.</p>
              )}
            </div>
          </aside>
        </section>
      </main>

      {refundModal ? (
        <div className="refund-modal-backdrop" onClick={closeRefundModal}>
          <div className="refund-modal" onClick={(e) => e.stopPropagation()}>
            <div className="refund-modal-header">
              <h2>환불 신청</h2>
              <button type="button" className="refund-modal-close" onClick={closeRefundModal}>×</button>
            </div>
            <div className="refund-modal-body">
              <p className="refund-modal-order-name">{refundModal.orderName}</p>

              {refundModal.activeProductIds?.length > 1 ? (
                <div className="refund-product-select">
                  <p className="refund-section-label">환불할 상품 선택</p>
                  {refundModal.activeProductIds.map((productId) => {
                    const video = store.academyVideos?.find(
                      (v) => v.productId === productId || v.id === productId
                    );
                    return (
                      <label key={productId} className="refund-product-item">
                        <input
                          type="checkbox"
                          checked={refundSelectedProductIds.includes(productId)}
                          onChange={() => toggleRefundProduct(productId)}
                        />
                        <span>{video?.title || productId}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              <div className="refund-reason-group">
                <label className="refund-section-label" htmlFor="refund-reason">환불 사유</label>
                <textarea
                  id="refund-reason"
                  className="refund-reason-input"
                  rows={4}
                  placeholder="환불 사유를 입력해 주세요."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
              </div>

              {refundMessage.text ? (
                <p className={`refund-modal-message ${refundMessage.type}`}>{refundMessage.text}</p>
              ) : null}
            </div>
            <div className="refund-modal-footer">
              <button type="button" className="ghost-button" onClick={closeRefundModal}>취소</button>
              <button
                type="button"
                className="pill-button"
                disabled={refundSubmitting}
                onClick={handleSubmitRefund}
              >
                {refundSubmitting ? "신청 중..." : "환불 신청하기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

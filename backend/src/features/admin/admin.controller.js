// 파일 역할: 관리자 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as authService from "../auth/auth.service.js";
import * as adminService from "./admin.service.js";
import * as usersService from "../users/users.service.js";
import { query } from "../../shared/db/mysql.js";
import { randomUUID } from "node:crypto";

const SESSION_COOKIE_NAME = "icl_session";
const DASHBOARD_RANGE_DAYS = {
  all: 0,
  today: 1,
  "7d": 7,
  "30d": 30,
};
const SALES_PERIODS = new Set(["day", "week", "month", "year"]);

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
  if (grade === "admin0" || grade === "admin1" || grade === "member" || grade === "vip" || grade === "vvip") {
    return grade;
  }

  const normalizedRole = String(user?.role || "")
    .trim()
    .toLowerCase();
  const adminFlag = user?.isAdmin === true || user?.isAdmin === 1 || user?.isAdmin === "1";
  if (adminFlag || normalizedRole === "admin") return "admin0";
  if (normalizedRole === "admin1") return "admin1";
  if (normalizedRole === "vip") return "vip";
  if (normalizedRole === "vvip") return "vvip";
  return "member";
}

// 함수 역할: access 관리자 대시보드 권한이 있는지 참/거짓으로 판별합니다.
function canAccessAdminDashboard(user) {
  const grade = resolveUserGrade(user);
  return grade === "admin0" || grade === "admin1";
}

// 함수 역할: manage 회원 등급 권한이 있는지 참/거짓으로 판별합니다.
function canManageUserGrades(user) {
  return resolveUserGrade(user) === "admin0";
}

// 함수 역할: create 강의 권한이 있는지 참/거짓으로 판별합니다.
function canCreateLecture(user) {
  const grade = resolveUserGrade(user);
  return grade === "admin0" || grade === "admin1";
}

// 함수 역할: manage 아카데미 권한이 있는지 참/거짓으로 판별합니다.
function canManageAcademy(user) {
  return canCreateLecture(user);
}

// 함수 역할: 인증된 회원 데이터를 조회해 호출자에게 반환합니다.
async function getAuthenticatedUser(req) {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return authService.findUserBySessionToken(token);
}

// 함수 역할: requireAdminDashboardAccess 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
async function requireAdminDashboardAccess(req, res) {
  const authUser = await getAuthenticatedUser(req);

  if (!authUser?.id) {
    res.status(401).json({ message: "로그인이 필요합니다." });
    return null;
  }

  if (!canAccessAdminDashboard(authUser)) {
    res.status(403).json({ message: "관리자만 접근할 수 있습니다." });
    return null;
  }

  return authUser;
}

// 함수 역할: 대시보드 범위 상황에 맞는 값을 계산하거나 선택합니다.
function resolveDashboardRange(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (Object.prototype.hasOwnProperty.call(DASHBOARD_RANGE_DAYS, normalized)) {
    return normalized;
  }
  return "all";
}

// 함수 역할: 매출 기간 상황에 맞는 값을 계산하거나 선택합니다.
function resolveSalesPeriod(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return SALES_PERIODS.has(normalized) ? normalized : "month";
}

// 함수 역할: iso 날짜 query 상황에 맞는 값을 계산하거나 선택합니다.
function resolveIsoDateQuery(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  return normalized;
}

// 함수 역할: 요청 데이터 문자열이나 페이로드를 코드에서 쓰기 쉬운 구조로 파싱합니다.
function parsePayload(payload) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

// 함수 역할: 금액 값으로 안전하게 변환합니다.
function toAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// 함수 역할: 환불 금액 상황에 맞는 값을 계산하거나 선택합니다.
function resolveRefundAmount(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const candidates = [
    source.refundAmount,
    source.cancelAmount,
    source.canceledAmount,
    source.refundedAmount,
    source?.cancel?.amount,
    source?.refund?.amount,
  ];

  return Math.max(
    0,
    ...candidates.map((value) => {
      const amount = toAmount(value);
      return Number.isFinite(amount) ? amount : 0;
    })
  );
}

// 함수 역할: 날짜 from ymd 문자열이나 페이로드를 코드에서 쓰기 쉬운 구조로 파싱합니다.
function parseDateFromYmd(value) {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const [yearText, monthText, dayText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

// 함수 역할: addDays 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// 함수 역할: monday start 데이터를 조회해 호출자에게 반환합니다.
function getMondayStart(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// 함수 역할: 환불 분석 조회 구간 상황에 맞는 값을 계산하거나 선택합니다.
function resolveRefundInsightWindow(periodValue, startDateValue, endDateValue) {
  const period = resolveSalesPeriod(periodValue);
  const startDate = parseDateFromYmd(startDateValue);
  const endDate = parseDateFromYmd(endDateValue);

  if (startDate && endDate && startDate.getTime() <= endDate.getTime()) {
    return {
      period,
      isCustomRange: true,
      fromDate: startDate,
      toDateExclusive: addDays(endDate, 1),
      startDate: resolveIsoDateQuery(startDateValue),
      endDate: resolveIsoDateQuery(endDateValue),
    };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "day") {
    return {
      period,
      isCustomRange: false,
      fromDate: addDays(todayStart, -6),
      toDateExclusive: addDays(todayStart, 1),
      startDate: "",
      endDate: "",
    };
  }

  if (period === "week") {
    const weekStart = getMondayStart(todayStart);
    return {
      period,
      isCustomRange: false,
      fromDate: addDays(weekStart, -28),
      toDateExclusive: addDays(weekStart, 7),
      startDate: "",
      endDate: "",
    };
  }

  if (period === "month") {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const nextYearStart = new Date(now.getFullYear() + 1, 0, 1);
    return {
      period,
      isCustomRange: false,
      fromDate: yearStart,
      toDateExclusive: nextYearStart,
      startDate: "",
      endDate: "",
    };
  }

  const startYear = now.getFullYear() - 9;
  return {
    period,
    isCustomRange: false,
    fromDate: new Date(startYear, 0, 1),
    toDateExclusive: new Date(now.getFullYear() + 1, 0, 1),
    startDate: "",
    endDate: "",
  };
}

// 함수 역할: 상품 ID 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeProductId(value) {
  return String(value || "").trim();
}

// 함수 역할: 주문 항목에서 필요한 항목만 골라냅니다.
function pickOrderItems(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const quantityByProductId = new Map();

  function addItem(productId, quantity = 1) {
    const normalized = normalizeProductId(productId);
    if (!normalized) return;
    const safeQuantity = Math.max(1, Math.round(toAmount(quantity) || 1));
    quantityByProductId.set(normalized, (quantityByProductId.get(normalized) || 0) + safeQuantity);
  }

  if (Array.isArray(source.items)) {
    source.items.forEach((item) => addItem(item?.productId, item?.quantity));
  }
  if (Array.isArray(source.selectedProductIds)) {
    source.selectedProductIds.forEach((productId) => addItem(productId, 1));
  }

  if (quantityByProductId.size === 0) {
    addItem(source.productId, 1);
  }

  return [...quantityByProductId.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

// 함수 역할: 환불 사유 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeRefundReason(value) {
  const text = String(value || "").trim();
  return text || "사유 미입력";
}

// 함수 역할: 환불 사유 entries에서 필요한 항목만 골라냅니다.
function pickRefundReasonEntries(payload, totalRefundAmount) {
  const source = payload && typeof payload === "object" ? payload : {};
  const historyEntries = Array.isArray(source.refundHistory) ? source.refundHistory : [];
  const normalizedHistory = historyEntries
    .map((entry) => ({
      reason: normalizeRefundReason(entry?.reason),
      amount: Math.max(0, toAmount(entry?.amount)),
    }))
    .filter((entry) => entry.amount > 0);

  if (normalizedHistory.length > 0) return normalizedHistory;

  const fallbackReason = normalizeRefundReason(
    source?.refund?.reason || source?.cancelReason || source?.refundReason || source?.cancel?.reason
  );
  if (totalRefundAmount > 0) {
    return [{ reason: fallbackReason, amount: totalRefundAmount }];
  }

  return [];
}

// 함수 역할: 대시보드 회원 데이터를 조회해 호출자에게 반환합니다.
export async function getDashboardUsers(req, res, next) {
  try {
    const authUser = await requireAdminDashboardAccess(req, res);
    if (!authUser) return;

    const [users, orderRows] = await Promise.all([
      adminService.listDashboardUsers(),
      query(`SELECT id, amount, payload FROM orders`),
    ]);

    const orderRefundMap = new Map();
    for (const row of Array.isArray(orderRows) ? orderRows : []) {
      const payload = parsePayload(row?.payload);
      const grossAmount = Math.max(0, toAmount(row?.amount));
      const refundAmount = Math.min(grossAmount, Math.max(0, resolveRefundAmount(payload)));
      orderRefundMap.set(String(row?.id || ""), {
        grossAmount,
        refundAmount,
        netAmount: Math.max(0, grossAmount - refundAmount),
        refundStatus:
          refundAmount <= 0
            ? "paid"
            : refundAmount >= grossAmount
              ? "refunded"
              : "partial_refunded",
        refundReason:
          String(payload?.refund?.reason || payload?.cancelReason || payload?.refundReason || "").trim() || "",
      });
    }

    const normalizedUsers = (Array.isArray(users) ? users : []).map((user) => {
      const purchases = (Array.isArray(user?.purchases) ? user.purchases : []).map((purchase) => {
        const orderId = String(purchase?.orderId || "");
        const refundInfo = orderRefundMap.get(orderId);
        const grossAmount = Math.max(0, toAmount(refundInfo?.grossAmount ?? purchase?.amount));
        const refundAmount = Math.max(0, toAmount(refundInfo?.refundAmount ?? purchase?.refundAmount));
        const netAmount = Math.max(0, grossAmount - refundAmount);

        return {
          ...purchase,
          amount: netAmount,
          grossAmount,
          refundAmount,
          netAmount,
          refundableAmount: Math.max(0, grossAmount - refundAmount),
          refundStatus: String(refundInfo?.refundStatus || purchase?.refundStatus || "").trim().toLowerCase(),
          refundReason: String(refundInfo?.refundReason || purchase?.refundReason || "").trim(),
        };
      });

      return {
        ...user,
        purchases,
        totalSpent: purchases.reduce((sum, item) => sum + Math.max(0, toAmount(item?.netAmount)), 0),
      };
    });

    res.json({
      userGrades: adminService.listUserGrades(),
      users: normalizedUsers,
    });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 대시보드 회원 학습 데이터를 조회해 호출자에게 반환합니다.
export async function getDashboardUserLearning(req, res, next) {
  try {
    const authUser = await requireAdminDashboardAccess(req, res);
    if (!authUser) return;

    const userId = String(req.params.userId || "").trim();
    if (!userId) {
      res.status(400).json({ message: "회원 정보가 올바르지 않습니다." });
      return;
    }

    const range = resolveDashboardRange(req.query.range);
    const result = await adminService.getUserLearningProgress(userId, range);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 대시보드 강의 학습 진도 데이터를 조회해 호출자에게 반환합니다.
export async function getDashboardLectureProgress(req, res, next) {
  try {
    const authUser = await requireAdminDashboardAccess(req, res);
    if (!authUser) return;

    const range = resolveDashboardRange(req.query.range);
    const lectures = await adminService.listLectureLearningReports(range);
    res.json({ lectures, range });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 대시보드 매출 데이터를 조회해 호출자에게 반환합니다.
export async function getDashboardSales(req, res, next) {
  try {
    const authUser = await requireAdminDashboardAccess(req, res);
    if (!authUser) return;

    const period = resolveSalesPeriod(req.query.period);
    const startDate = resolveIsoDateQuery(req.query.startDate);
    const endDate = resolveIsoDateQuery(req.query.endDate);
    const result = await adminService.getSalesDashboard({
      period,
      startDate,
      endDate,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 매출 환불 분석 데이터를 조회해 호출자에게 반환합니다.
export async function getSalesRefundInsights(req, res, next) {
  try {
    const authUser = await requireAdminDashboardAccess(req, res);
    if (!authUser) return;

    const window = resolveRefundInsightWindow(
      req.query.period,
      req.query.startDate,
      req.query.endDate
    );

    const [orderRows, productRows, videoRows] = await Promise.all([
      query(
        `SELECT
          id,
          amount,
          payload,
          created_at AS createdAt
         FROM orders
         WHERE created_at >= ?
           AND created_at < ?
         ORDER BY created_at ASC`,
        [window.fromDate, window.toDateExclusive]
      ),
      query(`SELECT id, name, price FROM products`),
      query(
        `SELECT
          id AS videoId,
          product_id AS productId,
          instructor
         FROM academy_videos`
      ),
    ]);

    const productMap = new Map(
      productRows.map((product) => [
        normalizeProductId(product?.id),
        {
          productId: normalizeProductId(product?.id),
          name: String(product?.name || ""),
          price: Math.max(0, toAmount(product?.price)),
        },
      ])
    );
    const videoByProductId = new Map(
      videoRows.map((video) => [
        normalizeProductId(video?.productId),
        {
          videoId: String(video?.videoId || ""),
          productId: normalizeProductId(video?.productId),
          title: productMap.get(normalizeProductId(video?.productId))?.name || normalizeProductId(video?.productId),
          instructor: String(video?.instructor || ""),
        },
      ])
    );

    const refundInsightMap = new Map();

    for (const order of Array.isArray(orderRows) ? orderRows : []) {
      const payload = parsePayload(order?.payload);
      const grossAmount = Math.max(0, toAmount(order?.amount));
      if (grossAmount <= 0) continue;

      const refundAmount = Math.min(grossAmount, Math.max(0, resolveRefundAmount(payload)));
      const orderItems = pickOrderItems(payload);
      const pricedVideoItems = orderItems
        .map((item) => {
          const product = productMap.get(normalizeProductId(item.productId));
          const video = videoByProductId.get(normalizeProductId(item.productId));
          return {
            ...item,
            product,
            video,
            weight:
              Math.max(0, toAmount(product?.price)) *
              Math.max(1, Math.round(toAmount(item?.quantity) || 1)),
          };
        })
        .filter((item) => item.video);

      if (!pricedVideoItems.length) continue;

      const totalWeight = pricedVideoItems.reduce((sum, item) => sum + item.weight, 0);
      const weightedItems =
        totalWeight > 0
          ? pricedVideoItems.map((item) => ({
              ...item,
              ratio: item.weight / totalWeight,
            }))
          : pricedVideoItems.map((item) => ({
              ...item,
              ratio: 1 / pricedVideoItems.length,
            }));

      const refundReasonEntries = pickRefundReasonEntries(payload, refundAmount);
      const visitedOrderProducts = new Set();
      const visitedRefundProducts = new Set();

      for (const item of weightedItems) {
        const productId = normalizeProductId(item?.video?.productId);
        const grossShare = grossAmount * item.ratio;
        const refundShare = refundAmount * item.ratio;
        const existing =
          refundInsightMap.get(productId) ||
          {
            videoId: String(item?.video?.videoId || ""),
            productId,
            title: String(item?.video?.title || productId),
            instructor: String(item?.video?.instructor || ""),
            grossRevenue: 0,
            refundRevenue: 0,
            orderCount: 0,
            refundOrderCount: 0,
            reasonsMap: new Map(),
          };

        existing.grossRevenue += grossShare;
        existing.refundRevenue += refundShare;

        if (!visitedOrderProducts.has(productId)) {
          existing.orderCount += 1;
          visitedOrderProducts.add(productId);
        }

        if (refundShare > 0 && !visitedRefundProducts.has(productId)) {
          existing.refundOrderCount += 1;
          visitedRefundProducts.add(productId);
        }

        for (const reasonEntry of refundReasonEntries) {
          const reason = normalizeRefundReason(reasonEntry.reason);
          const reasonAmount = Math.max(0, toAmount(reasonEntry.amount) * item.ratio);
          const reasonRecord =
            existing.reasonsMap.get(reason) || { reason, count: 0, refundAmount: 0 };
          reasonRecord.count += 1;
          reasonRecord.refundAmount += reasonAmount;
          existing.reasonsMap.set(reason, reasonRecord);
        }

        refundInsightMap.set(productId, existing);
      }
    }

    const videos = [...refundInsightMap.values()]
      .map((item) => {
        const grossRevenue = Math.max(0, Math.round(item.grossRevenue));
        const refundRevenue = Math.max(0, Math.round(item.refundRevenue));
        const refundRate = grossRevenue > 0 ? (refundRevenue / grossRevenue) * 100 : 0;
        const reasons = [...item.reasonsMap.values()]
          .map((reasonItem) => ({
            reason: reasonItem.reason,
            count: Math.max(0, Math.round(toAmount(reasonItem.count))),
            refundAmount: Math.max(0, Math.round(toAmount(reasonItem.refundAmount))),
          }))
          .sort((a, b) => {
            if (b.refundAmount !== a.refundAmount) return b.refundAmount - a.refundAmount;
            return b.count - a.count;
          });

        return {
          videoId: item.videoId,
          productId: item.productId,
          title: item.title,
          instructor: item.instructor,
          grossRevenue,
          refundRevenue,
          refundRate,
          orderCount: item.orderCount,
          refundOrderCount: item.refundOrderCount,
          reasons,
        };
      })
      .filter((item) => item.grossRevenue > 0)
      .sort((a, b) => {
        if (b.refundRate !== a.refundRate) return b.refundRate - a.refundRate;
        if (b.refundRevenue !== a.refundRevenue) return b.refundRevenue - a.refundRevenue;
        return b.refundOrderCount - a.refundOrderCount;
      });

    res.json({
      period: window.period,
      range: {
        isCustomRange: window.isCustomRange,
        startDate: window.startDate,
        endDate: window.endDate,
      },
      videos,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 회원 등급 데이터를 수정합니다.
export async function updateUserGrade(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!canManageUserGrades(authUser)) {
      res.status(403).json({ message: "관리자0 권한이 필요합니다." });
      return;
    }

    const targetUserId = String(req.params.userId || "").trim();
    const nextGrade = String(req.body?.userGrade || "")
      .trim()
      .toLowerCase();

    if (!targetUserId) {
      res.status(400).json({ message: "변경할 회원 ID가 필요합니다." });
      return;
    }

    if (!adminService.isValidUserGrade(nextGrade)) {
      res.status(400).json({ message: "변경할 회원 등급 값이 올바르지 않습니다." });
      return;
    }

    if (authUser.id === targetUserId && nextGrade !== "admin0") {
      res.status(400).json({ message: "현재 로그인한 관리자0 계정은 관리자0 등급을 유지해야 합니다." });
      return;
    }

    const updatedUser = await adminService.updateUserGrade(targetUserId, nextGrade);
    res.json({ user: updatedUser });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 탈퇴 회원 값을 원래 상태로 되돌립니다.
export async function restoreWithdrawnUser(req, res, next) {
  // 관리자 권한 기반 탈퇴 계정 복구 처리
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!canAccessAdminDashboard(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const targetUserId = String(req.params.userId || "").trim();
    if (!targetUserId) {
      res.status(400).json({ message: "복구할 회원 ID가 필요합니다." });
      return;
    }

    const restoredUser = await usersService.restoreWithdrawnUser(targetUserId);
    res.json({ user: restoredUser });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: refundOrder 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function refundOrder(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!canAccessAdminDashboard(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      res.status(400).json({ message: "환불할 주문 ID가 필요합니다." });
      return;
    }

    const row = await query(
      `SELECT
        id,
        order_name AS orderName,
        amount,
        customer_email AS customerEmail,
        payload
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [orderId]
    );
    const order = Array.isArray(row) ? row[0] : null;
    if (!order?.id) {
      res.status(404).json({ message: "환불 대상 주문을 찾을 수 없습니다." });
      return;
    }

    const payload = parsePayload(order.payload);
    const grossAmount = Math.max(0, toAmount(order.amount));
    const alreadyRefundedAmount = Math.min(grossAmount, Math.max(0, resolveRefundAmount(payload)));
    const refundableAmount = Math.max(0, grossAmount - alreadyRefundedAmount);
    if (refundableAmount <= 0) {
      res.status(400).json({ message: "이미 전액 환불된 주문입니다." });
      return;
    }

    const requestedAmount = Math.max(0, Math.round(toAmount(req.body?.amount)));
    const refundAmount = requestedAmount > 0 ? requestedAmount : refundableAmount;
    if (refundAmount > refundableAmount) {
      res.status(400).json({ message: "환불 가능 금액을 초과했습니다." });
      return;
    }

    const totalRefundAmount = alreadyRefundedAmount + refundAmount;
    const refundReason = String(req.body?.reason || "").trim();
    const processedBy = String(authUser?.loginId || authUser?.name || authUser?.id || "").trim();
    const approvedAt = new Date().toISOString();

    const history = Array.isArray(payload?.refundHistory) ? [...payload.refundHistory] : [];
    history.push({
      amount: refundAmount,
      reason: refundReason,
      processedBy,
      processedAt: approvedAt,
    });

    const nextPayload = {
      ...payload,
      refundAmount: totalRefundAmount,
      refundedAmount: totalRefundAmount,
      refund: {
        ...(payload?.refund && typeof payload.refund === "object" ? payload.refund : {}),
        amount: totalRefundAmount,
        reason: refundReason,
        processedBy,
        lastRefundAmount: refundAmount,
        approvedAt,
      },
      refundHistory: history,
      paymentStatus: totalRefundAmount >= grossAmount ? "refunded" : "partially_refunded",
    };

    await query(`UPDATE orders SET payload = ? WHERE id = ?`, [JSON.stringify(nextPayload), orderId]);

    res.json({
      message:
        totalRefundAmount >= grossAmount
          ? "주문이 전액 환불 처리되었습니다."
          : "주문이 부분 환불 처리되었습니다.",
      order: {
        orderId: order.id,
        orderName: order.orderName || "",
        customerEmail: order.customerEmail || "",
        grossAmount,
        refundAmount: totalRefundAmount,
        netAmount: Math.max(0, grossAmount - totalRefundAmount),
        refundableAmount: Math.max(0, grossAmount - totalRefundAmount),
        refundStatus: totalRefundAmount >= grossAmount ? "refunded" : "partial_refunded",
        refundReason,
      },
    });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 강의 데이터를 새로 생성합니다.
export async function createLecture(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    if (!canCreateLecture(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const created = await adminService.createLecture(req.body || {});
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

// ─── 페이지 오버라이드 (관리자 편집 DB 저장) ──────────────────────────────────

// 함수 역할: 페이지 수정값 데이터를 조회해 호출자에게 반환합니다.
export async function getPageOverrides(req, res, next) {
  try {
    const rows = await query(
      `SELECT override_type AS type, override_key AS \`key\`, override_value AS value, updated_at AS updatedAt
       FROM admin_page_overrides ORDER BY updated_at DESC`
    );
    const result = {};
    for (const row of (Array.isArray(rows) ? rows : [])) {
      if (!result[row.type]) result[row.type] = {};
      try { result[row.type][row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value; }
      catch { result[row.type][row.key] = row.value; }
    }
    res.json({ overrides: result });
  } catch (error) { next(error); }
}

// 함수 역할: 페이지 override 데이터를 저장하거나 기존 값을 갱신합니다.
export async function savePageOverride(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!canManageAcademy(authUser)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const { type, key, value } = req.body || {};
    if (!type || !key) return res.status(400).json({ message: "type과 key는 필수입니다." });
    await query(
      `INSERT INTO admin_page_overrides (id, override_type, override_key, override_value, updated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE override_value = VALUES(override_value), updated_at = NOW()`,
      [randomUUID(), String(type), String(key).slice(0, 599), JSON.stringify(value ?? null)]
    );
    res.json({ ok: true });
  } catch (error) { next(error); }
}

// 함수 역할: 페이지 override 데이터를 삭제합니다.
export async function deletePageOverride(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!canManageAcademy(authUser)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const { type, key } = req.body || {};
    await query(
      `DELETE FROM admin_page_overrides WHERE override_type = ? AND override_key = ?`,
      [String(type || ""), String(key || "")]
    );
    res.json({ ok: true });
  } catch (error) { next(error); }
}

// 함수 역할: all 페이지 수정값 by type 데이터를 삭제합니다.
export async function deleteAllPageOverridesByType(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!canManageAcademy(authUser)) return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    const { type } = req.params;
    await query(`DELETE FROM admin_page_overrides WHERE override_type = ?`, [String(type || "")]);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

// ─── 영상 선물 ────────────────────────────────────────────────────────────────

const GRANT_DURATION_DAYS = { "1d": 1, "7d": 7, "30d": 30, unlimited: null };

// 함수 역할: 수강권 expires at 상황에 맞는 값을 계산하거나 선택합니다.
function resolveGrantExpiresAt(durationType) {
  const days = GRANT_DURATION_DAYS[durationType] ?? null;
  if (days === null) return null;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

// 함수 역할: giftVideos 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function giftVideos(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!canAccessAdminDashboard(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const targetUserId = String(req.params.userId || "").trim();
    if (!targetUserId) {
      res.status(400).json({ message: "회원 ID가 필요합니다." });
      return;
    }

    const videoIds = Array.isArray(req.body?.videoIds)
      ? req.body.videoIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    if (!videoIds.length) {
      res.status(400).json({ message: "선물할 영상을 하나 이상 선택해 주세요." });
      return;
    }

    const durationType = String(req.body?.durationType || "unlimited").trim();
    if (!Object.prototype.hasOwnProperty.call(GRANT_DURATION_DAYS, durationType)) {
      res.status(400).json({ message: "이용 기간 값이 올바르지 않습니다." });
      return;
    }

    const expiresAt = resolveGrantExpiresAt(durationType);
    const now = new Date();
    const grantedBy = String(authUser.id || "").trim();

    for (const videoId of videoIds) {
      const id = randomUUID();
      await query(
        `INSERT INTO video_grants (id, user_id, video_id, granted_by, duration_type, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           granted_by = VALUES(granted_by),
           duration_type = VALUES(duration_type),
           expires_at = VALUES(expires_at)`,
        [id, targetUserId, videoId, grantedBy, durationType, expiresAt, now]
      );
    }

    res.json({ message: `${videoIds.length}개 영상이 선물되었습니다.`, count: videoIds.length });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 강의 영상 수강권 목록을 조회해 반환합니다.
export async function listVideoGrants(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!canAccessAdminDashboard(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const targetUserId = String(req.params.userId || "").trim();
    if (!targetUserId) {
      res.status(400).json({ message: "회원 ID가 필요합니다." });
      return;
    }

    const rows = await query(
      `SELECT
         vg.id,
         vg.video_id AS videoId,
         vg.duration_type AS durationType,
         vg.expires_at AS expiresAt,
         vg.created_at AS createdAt,
         av.title,
         av.instructor,
         av.category
       FROM video_grants vg
       LEFT JOIN academy_videos av ON av.id = vg.video_id
       WHERE vg.user_id = ?
       ORDER BY vg.created_at DESC`,
      [targetUserId]
    );

    res.json({ grants: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: 강의 영상 수강권 권한이나 세션을 회수합니다.
export async function revokeVideoGrant(req, res, next) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!canAccessAdminDashboard(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const targetUserId = String(req.params.userId || "").trim();
    const videoId = String(req.params.videoId || "").trim();
    if (!targetUserId || !videoId) {
      res.status(400).json({ message: "회원 ID와 영상 ID가 필요합니다." });
      return;
    }

    await query(
      `DELETE FROM video_grants WHERE user_id = ? AND video_id = ?`,
      [targetUserId, videoId]
    );

    res.json({ message: "선물이 취소되었습니다." });
  } catch (error) {
    next(error);
  }
}

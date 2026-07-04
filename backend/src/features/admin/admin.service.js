// 파일 역할: 관리자 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { query, queryOne } from "../../shared/db/mysql.js";
import { randomUUID } from "node:crypto";
import {
  decryptOrderRow,
  decryptUserRow,
  emailHash,
  encryptPii,
  nameHash,
  normalizeName,
  normalizeEmail,
  normalizePhone,
  phoneHash,
} from "../../shared/security/pii.js";
import { parsePayload } from "../../shared/utils/payload.js";
import { hashPassword } from "../../shared/security/password.js";
import { addDays, getMondayStart, parseDateFromYmd } from "../../shared/utils/date.js";
import {
  normalizeBirthYear,
  normalizeAgeGroup,
  resolveAgeGroupByBirthYear,
  toSafeAmount as toAmount,
} from "../../shared/utils/normalize.js";

const USER_GRADES = ["admin0", "admin1", "member", "vip", "vvip"];
const USER_GRADE_SET = new Set(USER_GRADES);
const STUDIO_MEMBER_STATUSES = new Set(["active", "inactive", "expired", "archived"]);
const DASHBOARD_RANGE_DAYS = {
  all: 0,
  today: 1,
  "7d": 7,
  "30d": 30,
};
const SALES_PERIODS = ["day", "week", "month", "year"];

// 함수 역할: 회원 등급 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeUserGrade(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

// 함수 역할: 안전한 날짜 값으로 안전하게 변환합니다.
function toSafeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// 함수 역할: pad2 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function pad2(value) {
  return String(value).padStart(2, "0");
}

// 함수 역할: day 키 값으로 안전하게 변환합니다.
function toDayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// 함수 역할: week 키 값으로 안전하게 변환합니다.
function toWeekKey(date) {
  const monday = getMondayStart(date);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const isoYear = thursday.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const firstMonday = getMondayStart(firstThursday);
  const diffMs = monday.getTime() - firstMonday.getTime();
  const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${isoYear}-W${pad2(week)}`;
}

// 함수 역할: month 키 값으로 안전하게 변환합니다.
function toMonthKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

// 함수 역할: 연도 키 값으로 안전하게 변환합니다.
function toYearKey(date) {
  return String(date.getFullYear());
}

// 함수 역할: 집계 구간 키 by 기간 데이터를 조회해 호출자에게 반환합니다.
function getBucketKeyByPeriod(date, period) {
  if (period === "day") return toDayKey(date);
  if (period === "week") return toWeekKey(date);
  if (period === "month") return toMonthKey(date);
  return toYearKey(date);
}

// 함수 역할: addMonths 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

// 함수 역할: addYears 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function addYears(date, years) {
  return new Date(date.getFullYear() + years, 0, 1);
}

// 함수 역할: 매출 기간 상황에 맞는 값을 계산하거나 선택합니다.
function resolveSalesPeriod(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return SALES_PERIODS.includes(normalized) ? normalized : "month";
}

// 함수 역할: floorDateToPeriod 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function floorDateToPeriod(date, period) {
  if (period === "day") {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  if (period === "week") {
    return getMondayStart(date);
  }

  if (period === "month") {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  return new Date(date.getFullYear(), 0, 1);
}

// 함수 역할: addPeriod 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function addPeriod(date, period, step = 1) {
  if (period === "day") return addDays(date, step);
  if (period === "week") return addDays(date, step * 7);
  if (period === "month") return addMonths(date, step);
  return addYears(date, step);
}

// 함수 역할: 매출 집계 구간 label 표시값이나 데이터 구조를 생성합니다.
function makeSalesBucketLabel(start, period) {
  if (period === "day") {
    return `${start.getMonth() + 1}/${start.getDate()}`;
  }
  if (period === "week") {
    return toWeekKey(start);
  }
  if (period === "month") {
    return `${start.getFullYear()}.${pad2(start.getMonth() + 1)}`;
  }
  return `${start.getFullYear()}`;
}

// 함수 역할: 매출 집계 구간 구조나 문구를 조립해 반환합니다.
export function buildSalesBuckets(period, startDateValue = "", endDateValue = "") {
  const now = new Date();
  const startDate = parseDateFromYmd(startDateValue);
  const endDate = parseDateFromYmd(endDateValue);
  const hasCustomRange = Boolean(startDate && endDate && startDate.getTime() <= endDate.getTime());

  if (hasCustomRange) {
    const periodStart = new Date(startDate);
    const periodEnd = addDays(endDate, 1);
    const cursorStart = floorDateToPeriod(periodStart, period);

    const buckets = [];
    let cursor = cursorStart;
    let guard = 0;
    while (cursor < periodEnd && guard < 500) {
      const next = addPeriod(cursor, period, 1);
      buckets.push({
        key: getBucketKeyByPeriod(cursor, period),
        label: makeSalesBucketLabel(cursor, period),
        start: new Date(cursor),
        end: new Date(next),
      });
      cursor = next;
      guard += 1;
    }

    return {
      buckets,
      periodStart,
      periodEnd,
      startDate: toDayKey(periodStart),
      endDate: toDayKey(endDate),
      isCustomRange: true,
    };
  }

  if (period === "day") {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const buckets = [];
    for (let index = 6; index >= 0; index -= 1) {
      const start = addDays(todayStart, -index);
      const end = addDays(start, 1);
      buckets.push({
        key: toDayKey(start),
        label: makeSalesBucketLabel(start, "day"),
        start,
        end,
      });
    }
    return {
      buckets,
      periodStart: buckets[0]?.start || new Date(0),
      periodEnd: buckets[buckets.length - 1]?.end || new Date(),
      startDate: "",
      endDate: "",
      isCustomRange: false,
    };
  }

  if (period === "week") {
    const weekStart = getMondayStart(now);
    const buckets = [];
    for (let index = 4; index >= 0; index -= 1) {
      const start = addDays(weekStart, -index * 7);
      const end = addDays(start, 7);
      buckets.push({
        key: toWeekKey(start),
        label: makeSalesBucketLabel(start, "week"),
        start,
        end,
      });
    }
    return {
      buckets,
      periodStart: buckets[0]?.start || new Date(0),
      periodEnd: buckets[buckets.length - 1]?.end || new Date(),
      startDate: "",
      endDate: "",
      isCustomRange: false,
    };
  }

  if (period === "month") {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const buckets = [];
    for (let index = 0; index < 12; index += 1) {
      const start = addMonths(yearStart, index);
      const end = addMonths(start, 1);
      buckets.push({
        key: toMonthKey(start),
        label: makeSalesBucketLabel(start, "month"),
        start,
        end,
      });
    }
    return {
      buckets,
      periodStart: buckets[0]?.start || new Date(0),
      periodEnd: buckets[buckets.length - 1]?.end || new Date(),
      startDate: "",
      endDate: "",
      isCustomRange: false,
    };
  }

  const yearStart = new Date(now.getFullYear(), 0, 1);
  const buckets = [];
  for (let index = 9; index >= 0; index -= 1) {
    const start = addYears(yearStart, -index);
    const end = addYears(start, 1);
    buckets.push({
      key: toYearKey(start),
      label: makeSalesBucketLabel(start, "year"),
      start,
      end,
    });
  }
  return {
    buckets,
    periodStart: buckets[0]?.start || new Date(0),
    periodEnd: buckets[buckets.length - 1]?.end || new Date(),
    startDate: "",
    endDate: "",
    isCustomRange: false,
  };
}

export function summarizeSalesSeries(series = []) {
  const rows = Array.isArray(series) ? series : [];
  const periodGrossRevenue = rows.reduce((sum, item) => sum + toAmount(item?.grossRevenue), 0);
  const periodNetRevenue = rows.reduce((sum, item) => sum + toAmount(item?.netRevenue), 0);
  const periodRefundRevenue = rows.reduce((sum, item) => sum + toAmount(item?.refundRevenue), 0);
  const periodOrderCount = rows.reduce((sum, item) => sum + toAmount(item?.orderCount), 0);
  return {
    periodGrossRevenue: Math.round(periodGrossRevenue),
    periodNetRevenue: Math.round(periodNetRevenue),
    periodRefundRevenue: Math.round(periodRefundRevenue),
    periodOrderCount: Math.round(periodOrderCount),
    averageOrderAmount: periodOrderCount > 0 ? Math.round(periodGrossRevenue / periodOrderCount) : 0,
  };
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
// 함수 역할: 주문 연령 그룹 상황에 맞는 값을 계산하거나 선택합니다.
function resolveOrderAgeGroup(orderRow, payload, userBirthYearByEmail = new Map()) {
  const source = payload && typeof payload === "object" ? payload : {};

  const payloadAgeGroup =
    normalizeAgeGroup(source.customerAgeGroup) ||
    normalizeAgeGroup(source.ageGroup) ||
    normalizeAgeGroup(source?.customer?.ageGroup);
  if (payloadAgeGroup) return payloadAgeGroup;

  const payloadBirthYear =
    normalizeBirthYear(source.customerBirthYear) ||
    normalizeBirthYear(source.birthYear) ||
    normalizeBirthYear(source?.customer?.birthYear);
  const fromPayloadBirthYear = resolveAgeGroupByBirthYear(payloadBirthYear);
  if (fromPayloadBirthYear) return fromPayloadBirthYear;

  const emailKey = normalizeEmail(orderRow?.customerEmail || source.customerEmail || source?.customer?.email);
  const userBirthYear = userBirthYearByEmail.get(emailKey);
  const fromUserBirthYear = resolveAgeGroupByBirthYear(userBirthYear);
  if (fromUserBirthYear) return fromUserBirthYear;

  return "미분류";
}
// 함수 역할: 상품 ID 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeProductId(value) {
  return String(value || "").trim();
}

function getOrderPayloadSources(orderRow) {
  const direct = orderRow && typeof orderRow === "object" ? orderRow : {};
  const payload = parsePayload(direct.payload);
  const nestedPayload = parsePayload(payload?.payload);
  return [direct, payload, nestedPayload].filter(
    (source) => source && typeof source === "object" && Object.keys(source).length > 0
  );
}

function aggregateOrderItems(items) {
  const quantityByProductId = new Map();

  function addItem(productId, quantity = 1, price = 0) {
    const normalized = normalizeProductId(productId);
    if (!normalized) return;
    const safeQuantity = Math.max(1, Math.round(toAmount(quantity) || 1));
    const current =
      quantityByProductId.get(normalized) || {
        productId: normalized,
        quantity: 0,
        price: 0,
      };
    current.quantity += safeQuantity;
    current.price = Math.max(current.price, Math.max(0, toAmount(price)));
    quantityByProductId.set(normalized, current);
  }

  (Array.isArray(items) ? items : []).forEach((item) => {
    addItem(
      item?.productId || item?.id,
      item?.quantity,
      item?.price || item?.salePrice || item?.amount
    );
  });

  return [...quantityByProductId.values()];
}

// 함수 역할: 상품 ids에서 필요한 항목만 골라냅니다.
function pickProductIds(orderRow) {
  const ids = new Set();

  for (const source of getOrderPayloadSources(orderRow)) {
    if (Array.isArray(source.selectedProductIds)) {
      source.selectedProductIds.forEach((value) => {
        const productId = normalizeProductId(value);
        if (productId) ids.add(productId);
      });
    }

    if (Array.isArray(source.items)) {
      source.items.forEach((item) => {
        const productId = normalizeProductId(item?.productId || item?.id);
        if (productId) ids.add(productId);
      });
    }

    const singleProductId = normalizeProductId(source.productId);
    if (singleProductId) {
      ids.add(singleProductId);
    }
  }

  return [...ids];
}

// 함수 역할: 주문 항목에서 필요한 항목만 골라냅니다.
function pickOrderItems(orderRow) {
  const sources = getOrderPayloadSources(orderRow);

  for (const source of sources) {
    if (Array.isArray(source.items) && source.items.length > 0) {
      const items = aggregateOrderItems(source.items);
      if (items.length) return items;
    }
  }

  for (const source of sources) {
    if (Array.isArray(source.selectedProductIds) && source.selectedProductIds.length > 0) {
      const items = aggregateOrderItems(
        source.selectedProductIds.map((productId) => ({
          productId,
          quantity: 1,
        }))
      );
      if (items.length) return items;
    }
  }

  for (const source of sources) {
    const productId = normalizeProductId(source.productId);
    if (productId) {
      return aggregateOrderItems([
        {
          productId,
          quantity: source.quantity,
          price: source.price || source.salePrice || source.amount,
        },
      ]);
    }
  }

  return [];
}

// 함수 역할: 등급 to 권한 값을 다른 표현 형식으로 매핑합니다.
function mapGradeToRole(grade) {
  if (grade === "admin0") {
    return { role: "admin", isAdmin: 1 };
  }

  if (grade === "admin1") {
    return { role: "admin1", isAdmin: 0 };
  }

  return { role: "user", isAdmin: 0 };
}

// 함수 역할: boolean 값으로 안전하게 변환합니다.
function toBoolean(value) {
  return value === true || value === 1 || value === "1";
}

// 함수 역할: 범위 days 상황에 맞는 값을 계산하거나 선택합니다.
function resolveRangeDays(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (Object.prototype.hasOwnProperty.call(DASHBOARD_RANGE_DAYS, normalized)) {
    return DASHBOARD_RANGE_DAYS[normalized];
  }

  const numeric = Math.max(0, Math.round(toAmount(value)));
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return 0;
}

// 함수 역할: valid 회원 등급 조건에 해당하는지 참/거짓으로 판별합니다.
export function isValidUserGrade(value) {
  return USER_GRADE_SET.has(normalizeUserGrade(value));
}

// 함수 역할: 회원 등급 목록을 조회해 반환합니다.
export function listUserGrades() {
  return [...USER_GRADES];
}

// 함수 역할: 대시보드 회원 목록을 조회해 반환합니다.
export async function listDashboardUsers() {
  const [users, orders, products, learningRows] = await Promise.all([
    query(
      `SELECT
        id,
        login_id AS loginId,
        name,
        email,
        phone,
        role,
        is_admin AS isAdmin,
        user_grade AS userGrade,
        account_status AS accountStatus,
        DATE_FORMAT(withdrawn_at, '%Y-%m-%d %H:%i:%s') AS withdrawnAt,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
       FROM users
       WHERE platform = 'education'
       ORDER BY created_at DESC`
    ),
    query(
      `SELECT
        id,
        order_name AS orderName,
        amount,
        customer_email AS customerEmail,
        payload,
        created_at AS createdAt
       FROM orders
       ORDER BY created_at DESC`
    ),
    query(`SELECT id, name, price, period FROM products`),
    query(
      `SELECT
        user_id AS userId,
        COUNT(*) AS engagedLectureCount,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completedLectureCount,
        SUM(CASE WHEN completed = 0 AND progress_percent > 0 THEN 1 ELSE 0 END) AS inProgressLectureCount,
        DATE_FORMAT(MAX(last_watched_at), '%Y-%m-%d %H:%i:%s') AS latestLearningAt
       FROM academy_progress
       GROUP BY user_id`
    ),
  ]);

  const productMap = new Map(
    products.map((product) => [String(product.id), { ...product, price: toAmount(product.price) }])
  );
  const decryptedUsers = users.map(decryptUserRow);
  const decryptedOrders = orders.map(decryptOrderRow);
  const learningMap = new Map(
    learningRows.map((row) => [
      String(row.userId || ""),
      {
        engagedLectureCount: Number(row.engagedLectureCount || 0),
        completedLectureCount: Number(row.completedLectureCount || 0),
        inProgressLectureCount: Number(row.inProgressLectureCount || 0),
        latestLearningAt: row.latestLearningAt || null,
      },
    ])
  );

  const ordersByEmail = new Map();
  for (const order of decryptedOrders) {
    const emailKey = String(order.customerEmail || "")
      .trim()
      .toLowerCase();
    if (!emailKey) continue;
    const current = ordersByEmail.get(emailKey) || [];
    current.push(order);
    ordersByEmail.set(emailKey, current);
  }

  return decryptedUsers.map((user) => {
    const emailKey = String(user.email || "")
      .trim()
      .toLowerCase();
    const userOrders = ordersByEmail.get(emailKey) || [];
    const learning = learningMap.get(String(user.id || "")) || {
      engagedLectureCount: 0,
      completedLectureCount: 0,
      inProgressLectureCount: 0,
      latestLearningAt: null,
    };

    const purchases = userOrders.map((order) => {
      const productIds = pickProductIds(order);
      const lectures = productIds.map((productId) => {
        const matched = productMap.get(productId);
        return {
          productId,
          productName: matched?.name || order.orderName || productId,
          productPrice: matched?.price ?? 0,
          period: matched?.period || "",
        };
      });

      if (lectures.length === 0 && order.orderName) {
        lectures.push({
          productId: "",
          productName: order.orderName,
          productPrice: 0,
          period: "",
        });
      }

      return {
        orderId: order.id,
        orderName: order.orderName || "",
        purchasedAt: order.createdAt,
        amount: toAmount(order.amount),
        lectures,
      };
    });

    const totalSpent = purchases.reduce((sum, purchase) => sum + toAmount(purchase.amount), 0);
    const purchasedLectureCount = purchases.reduce(
      (sum, purchase) => sum + Number(purchase.lectures.length || 0),
      0
    );

    return {
      ...user,
      userGrade: normalizeUserGrade(user.userGrade) || "member",
      isAdmin: Number(user.isAdmin) === 1 ? 1 : 0,
      totalSpent,
      orderCount: purchases.length,
      purchasedLectureCount,
      latestPurchasedAt: purchases[0]?.purchasedAt || null,
      engagedLectureCount: learning.engagedLectureCount,
      completedLectureCount: learning.completedLectureCount,
      inProgressLectureCount: learning.inProgressLectureCount,
      latestLearningAt: learning.latestLearningAt,
      purchases,
    };
  });
}

// 함수 역할: 회원 학습 학습 진도 데이터를 조회해 호출자에게 반환합니다.
export async function getUserLearningProgress(userId, rangeValue = "all") {
  const normalizedUserId = String(userId || "").trim();
  const rangeDays = resolveRangeDays(rangeValue);
  if (!normalizedUserId) {
    const error = new Error("조회할 회원 정보가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const user = decryptUserRow(await queryOne(
    `SELECT
      id,
      login_id AS loginId,
      name,
      email,
      user_grade AS userGrade,
      role,
      is_admin AS isAdmin,
      created_at AS createdAt
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [normalizedUserId]
  ));

  if (!user?.id) {
    const error = new Error("대상 회원을 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  const lectureProgressDateFilterSql =
    rangeDays > 0 ? "AND ap.last_watched_at >= DATE_SUB(NOW(), INTERVAL ? DAY)" : "";
  const chapterProgressDateFilterSql =
    rangeDays > 0 ? "AND cp.last_watched_at >= DATE_SUB(NOW(), INTERVAL ? DAY)" : "";

  const lectureParams = rangeDays > 0 ? [normalizedUserId, rangeDays] : [normalizedUserId];
  const chapterParams = rangeDays > 0 ? [normalizedUserId, rangeDays] : [normalizedUserId];

  const [lectureRows, chapterRows, orderRows] = await Promise.all([
    query(
      `SELECT
        av.id AS videoId,
        av.product_id AS productId,
        p.name AS title,
        av.instructor,
        av.category,
        ap.\`current_time\` AS currentTime,
        ap.duration,
        ap.progress_percent AS progressPercent,
        ap.completed,
        ap.last_watched_at AS lastWatchedAt
       FROM academy_videos av
       INNER JOIN products p ON p.id = av.product_id
       LEFT JOIN academy_progress ap
         ON ap.video_id = av.id
         AND ap.user_id = ?
         ${lectureProgressDateFilterSql}
       ORDER BY av.created_at DESC, av.id DESC`,
      lectureParams
    ),
    query(
      `SELECT
        chapter.video_id AS videoId,
        chapter.id AS chapterId,
        chapter.chapter_order AS chapterOrder,
        chapter.title AS chapterTitle,
        cp.\`current_time\` AS currentTime,
        cp.duration,
        cp.progress_percent AS progressPercent,
        cp.completed,
        cp.last_watched_at AS lastWatchedAt
       FROM academy_video_chapters chapter
       LEFT JOIN academy_chapter_progress cp
         ON cp.chapter_id = chapter.id
         AND cp.user_id = ?
         ${chapterProgressDateFilterSql}
       ORDER BY chapter.video_id ASC, chapter.chapter_order ASC`,
      chapterParams
    ),
    query(
      `SELECT payload, created_at AS createdAt
       FROM orders
       WHERE customer_email_hash = ?
       ORDER BY created_at DESC`,
      [emailHash(user.email)]
    ),
  ]);

  const purchasedProductIds = new Set();
  const purchasedAtMap = new Map();

  for (const order of orderRows) {
    const productIds = pickProductIds(order);
    for (const productId of productIds) {
      if (!productId) continue;
      purchasedProductIds.add(productId);
      if (!purchasedAtMap.has(productId)) {
        purchasedAtMap.set(productId, order.createdAt || null);
      }
    }
  }

  const chaptersByVideo = new Map();
  for (const row of chapterRows) {
    const videoId = String(row.videoId || "");
    if (!videoId) continue;

    const chapterDuration = Math.max(0, Math.round(toAmount(row.duration)));
    const chapterCurrentTime = Math.max(0, Math.round(toAmount(row.currentTime)));
    const chapterProgress = Math.max(0, Math.min(100, Math.round(toAmount(row.progressPercent))));
    const chapterCompleted = toBoolean(row.completed) || chapterProgress >= 100;

    const chapter = {
      chapterId: String(row.chapterId || ""),
      chapterOrder: Math.max(1, Math.round(toAmount(row.chapterOrder || 1))),
      chapterTitle: String(row.chapterTitle || ""),
      currentTime: chapterCurrentTime,
      duration: chapterDuration,
      progressPercent: chapterCompleted ? 100 : chapterProgress,
      completed: chapterCompleted,
      lastWatchedAt: row.lastWatchedAt || null,
    };

    const list = chaptersByVideo.get(videoId) || [];
    list.push(chapter);
    chaptersByVideo.set(videoId, list);
  }

  const learning = lectureRows.map((row) => {
    const videoId = String(row.videoId || "");
    const chapters = (chaptersByVideo.get(videoId) || []).sort(
      (a, b) => a.chapterOrder - b.chapterOrder
    );

    const chapterCount = chapters.length;
    const completedChapterCount = chapters.filter((chapter) => chapter.completed).length;

    const lectureProgress = Math.max(0, Math.min(100, Math.round(toAmount(row.progressPercent))));
    const lectureCompleted = toBoolean(row.completed) || lectureProgress >= 100;

    const fallbackProgress =
      chapterCount > 0 ? Math.round((completedChapterCount / chapterCount) * 100) : 0;
    const resolvedProgressPercent = lectureProgress > 0 ? lectureProgress : fallbackProgress;
    const resolvedCompleted = lectureCompleted || (chapterCount > 0 && completedChapterCount >= chapterCount);

    const latestChapterWatched = chapters
      .map((chapter) => chapter.lastWatchedAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

    return {
      videoId,
      productId: String(row.productId || ""),
      title: String(row.title || ""),
      instructor: String(row.instructor || ""),
      category: String(row.category || ""),
      purchased:
        purchasedProductIds.has(String(row.productId || "")) ||
        purchasedProductIds.has(videoId),
      purchasedAt:
        purchasedAtMap.get(String(row.productId || "")) ||
        purchasedAtMap.get(videoId) ||
        null,
      currentTime: Math.max(0, Math.round(toAmount(row.currentTime))),
      duration: Math.max(0, Math.round(toAmount(row.duration))),
      progressPercent: Math.max(0, Math.min(100, resolvedProgressPercent)),
      completed: resolvedCompleted,
      lastWatchedAt: row.lastWatchedAt || latestChapterWatched || null,
      chapterCount,
      completedChapterCount,
      chapters,
    };
  });

  const purchasedLearning = learning.filter((item) => item.purchased);
  const filteredLearning =
    rangeDays > 0
      ? purchasedLearning.filter((item) => Boolean(item.lastWatchedAt))
      : purchasedLearning;

  return {
    user: {
      ...user,
      userGrade: normalizeUserGrade(user.userGrade) || "member",
    },
    learning: filteredLearning,
    rangeDays,
  };
}

// 함수 역할: 강의 학습 reports 목록을 조회해 반환합니다.
export async function listLectureLearningReports(rangeValue = "all") {
  const rangeDays = resolveRangeDays(rangeValue);
  const chapterDateFilterSql =
    rangeDays > 0 ? "WHERE last_watched_at >= DATE_SUB(NOW(), INTERVAL ? DAY)" : "";
  const learnerDateFilterSql =
    rangeDays > 0 ? "WHERE ap.last_watched_at >= DATE_SUB(NOW(), INTERVAL ? DAY)" : "";
  const learnerParams = rangeDays > 0 ? [rangeDays, rangeDays] : [];

  const [lectureRows, learnerRows, chapterCountRows] = await Promise.all([
    query(
      `SELECT
        av.id AS videoId,
        av.product_id AS productId,
        p.name AS title,
        av.instructor,
        av.category,
        av.is_hidden AS isHidden
       FROM academy_videos av
       INNER JOIN products p ON p.id = av.product_id
       ORDER BY av.created_at DESC, av.id DESC`
    ),
    query(
      `SELECT
        ap.video_id AS videoId,
        ap.user_id AS userId,
        u.login_id AS loginId,
        u.name,
        u.email,
        u.user_grade AS userGrade,
        ap.progress_percent AS progressPercent,
        ap.completed,
        ap.last_watched_at AS lastWatchedAt,
        COALESCE(chapters.completedChapterCount, 0) AS completedChapterCount,
        chapters.latestChapterWatchedAt
       FROM academy_progress ap
       INNER JOIN users u ON u.id = ap.user_id
       LEFT JOIN (
         SELECT
           user_id,
           video_id,
           SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completedChapterCount,
           MAX(last_watched_at) AS latestChapterWatchedAt
         FROM academy_chapter_progress
         ${chapterDateFilterSql}
         GROUP BY user_id, video_id
       ) chapters
         ON chapters.user_id = ap.user_id
         AND chapters.video_id = ap.video_id
       ${learnerDateFilterSql}
       ORDER BY ap.last_watched_at DESC`
      ,
      learnerParams
    ),
    query(
      `SELECT
        video_id AS videoId,
        COUNT(*) AS chapterCount
       FROM academy_video_chapters
       GROUP BY video_id`
    ),
  ]);

  const chapterCountMap = new Map(
    chapterCountRows.map((row) => [
      String(row.videoId || ""),
      Math.max(0, Math.round(toAmount(row.chapterCount))),
    ])
  );

  const learnersByLecture = new Map();
  for (const rawRow of learnerRows) {
    const row = decryptUserRow(rawRow);
    const videoId = String(row.videoId || "");
    if (!videoId) continue;

    const learner = {
      userId: String(row.userId || ""),
      loginId: String(row.loginId || ""),
      name: String(row.name || ""),
      email: String(row.email || ""),
      userGrade: normalizeUserGrade(row.userGrade) || "member",
      progressPercent: Math.max(0, Math.min(100, Math.round(toAmount(row.progressPercent)))),
      completed: toBoolean(row.completed),
      lastWatchedAt: row.lastWatchedAt || row.latestChapterWatchedAt || null,
      completedChapterCount: Math.max(0, Math.round(toAmount(row.completedChapterCount))),
    };

    const list = learnersByLecture.get(videoId) || [];
    list.push(learner);
    learnersByLecture.set(videoId, list);
  }

  return lectureRows.map((lecture) => {
    const videoId = String(lecture.videoId || "");
    const chapterCount = chapterCountMap.get(videoId) || 0;
    const learners = (learnersByLecture.get(videoId) || []).map((learner) => ({
      ...learner,
      chapterCount,
    }));

    const learnerCount = learners.length;
    const completedLearnerCount = learners.filter((learner) => learner.completed).length;

    const sortedWatched = learners
      .map((learner) => learner.lastWatchedAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return {
      videoId,
      productId: String(lecture.productId || ""),
      title: String(lecture.title || ""),
      instructor: String(lecture.instructor || ""),
      category: String(lecture.category || ""),
      isHidden: toBoolean(lecture.isHidden),
      chapterCount,
      learnerCount,
      completedLearnerCount,
      completionRate: learnerCount > 0 ? Math.round((completedLearnerCount / learnerCount) * 100) : 0,
      lastLearningAt: sortedWatched[0] || null,
      learners,
    };
  });
}

// 함수 역할: 매출 대시보드 데이터를 조회해 호출자에게 반환합니다.
export async function getSalesDashboard(options = {}) {
  const periodInput = typeof options === "string" ? options : options?.period;
  const period = resolveSalesPeriod(periodInput);
  const startDateInput = typeof options === "string" ? "" : String(options?.startDate || "").trim();
  const endDateInput = typeof options === "string" ? "" : String(options?.endDate || "").trim();

  const range = buildSalesBuckets(period, startDateInput, endDateInput);
  const { buckets, periodStart, periodEnd, isCustomRange, startDate, endDate } = range;

  const [orderRows, productRows, videoRows, userRows, refundSummary] = await Promise.all([
    query(
      `SELECT
        id,
        amount,
        payload,
        customer_email AS customerEmail,
        created_at AS createdAt
       FROM orders
       ORDER BY created_at ASC`
    ),
    query(`SELECT id, name, price FROM products`),
    query(
      `SELECT
        id AS videoId,
        product_id AS productId,
        instructor
       FROM academy_videos`
    ),
    query(
      `SELECT
        email,
        birth_year_encrypted AS birthYearEncrypted
       FROM users
       WHERE email IS NOT NULL
         AND email <> ''`
    ),
    queryOne(
      `SELECT
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pendingCount,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN requested_amount ELSE 0 END), 0) AS pendingAmount,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approvedCount
       FROM refund_requests`
    ),
  ]);

  const seriesMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      {
        key: bucket.key,
        label: bucket.label,
        grossRevenue: 0,
        netRevenue: 0,
        refundRevenue: 0,
        orderCount: 0,
      },
    ])
  );

  const productMap = new Map(
    productRows.map((product) => [
      String(product.id || ""),
      {
        productId: String(product.id || ""),
        name: String(product.name || ""),
        price: Math.max(0, toAmount(product.price)),
      },
    ])
  );

  const videoByProductId = new Map(
    videoRows.map((video) => [
      String(video.productId || ""),
      {
        videoId: String(video.videoId || ""),
        productId: String(video.productId || ""),
        title: productMap.get(String(video.productId || ""))?.name || String(video.productId || ""),
        instructor: String(video.instructor || ""),
      },
    ])
  );
  const videoByLookupId = new Map();
  for (const video of videoByProductId.values()) {
    if (video.productId) videoByLookupId.set(video.productId, video);
    if (video.videoId) videoByLookupId.set(video.videoId, video);
  }

  const userBirthYearByEmail = new Map(
    userRows
      .map(decryptUserRow)
      .map((user) => [normalizeEmail(user.email), normalizeBirthYear(user.birthYear)])
  );

  const lifetimeOrderCount = orderRows.length;
  let lifetimeGrossRevenue = 0;
  let lifetimeRefundRevenue = 0;
  let lifetimeNetRevenue = 0;

  const videoSalesMap = new Map();
  const ageGroupSalesMap = new Map();

  for (const rawOrder of orderRows) {
    const order = decryptOrderRow(rawOrder);
    const payload = parsePayload(order.payload);
    const createdAtDate = toSafeDate(order.createdAt);
    const grossAmount = Math.max(0, toAmount(order.amount));
    const refundAmount = Math.min(grossAmount, Math.max(0, resolveRefundAmount(payload)));
    const netAmount = Math.max(0, grossAmount - refundAmount);

    lifetimeGrossRevenue += grossAmount;
    lifetimeRefundRevenue += refundAmount;
    lifetimeNetRevenue += netAmount;

    if (!createdAtDate) continue;

    const bucketKey = getBucketKeyByPeriod(createdAtDate, period);
    const bucket = seriesMap.get(bucketKey);
    if (bucket) {
      bucket.grossRevenue += grossAmount;
      bucket.netRevenue += netAmount;
      bucket.refundRevenue += refundAmount;
      bucket.orderCount += 1;
    }

    if (createdAtDate < periodStart || createdAtDate >= periodEnd) {
      continue;
    }

    const ageGroupKey = resolveOrderAgeGroup(order, payload, userBirthYearByEmail) || "미분류";
    const ageGroupCurrent = ageGroupSalesMap.get(ageGroupKey) || {
      ageGroup: ageGroupKey,
      orderCount: 0,
      grossRevenue: 0,
      netRevenue: 0,
      refundRevenue: 0,
    };
    ageGroupCurrent.orderCount += 1;
    ageGroupCurrent.grossRevenue += grossAmount;
    ageGroupCurrent.netRevenue += netAmount;
    ageGroupCurrent.refundRevenue += refundAmount;
    ageGroupSalesMap.set(ageGroupKey, ageGroupCurrent);

    const orderItems = pickOrderItems(order);
    if (!orderItems.length) continue;

    const pricedItems = orderItems
      .map((item) => {
        const product = productMap.get(item.productId);
        const video = videoByLookupId.get(item.productId);
        const price = Math.max(0, toAmount(product?.price), toAmount(item.price));
        const quantity = Math.max(1, Math.round(toAmount(item.quantity) || 1));
        return {
          ...item,
          productId: video?.productId || item.productId,
          videoId: video?.videoId || "",
          title: video?.title || product?.name || String(payload?.orderName || item.productId || ""),
          instructor: video?.instructor || "",
          price,
          quantity,
          weight: price * quantity,
        };
      })
      .filter((item) => item.productId);

    if (!pricedItems.length) continue;

    const totalWeight = pricedItems.reduce((sum, item) => sum + item.weight, 0);
    const revenuePerItem =
      totalWeight > 0
        ? pricedItems.map((item) => ({
            productId: item.productId,
            videoId: item.videoId,
            title: item.title,
            instructor: item.instructor,
            quantity: item.quantity,
            grossRevenue: grossAmount * (item.weight / totalWeight),
            netRevenue: netAmount * (item.weight / totalWeight),
          }))
        : pricedItems.map((item) => ({
            productId: item.productId,
            videoId: item.videoId,
            title: item.title,
            instructor: item.instructor,
            quantity: item.quantity,
            grossRevenue: grossAmount / pricedItems.length,
            netRevenue: netAmount / pricedItems.length,
          }));

    const visitedInOrder = new Set();
    for (const item of revenuePerItem) {
      const current = videoSalesMap.get(item.productId) || {
        videoId: item.videoId || "",
        productId: item.productId,
        title: item.title || item.productId,
        instructor: item.instructor || "",
        saleCount: 0,
        orderCount: 0,
        grossRevenue: 0,
        netRevenue: 0,
        refundRevenue: 0,
      };

      current.saleCount += Math.max(1, Math.round(toAmount(item.quantity) || 1));
      current.grossRevenue += Math.max(0, toAmount(item.grossRevenue));
      current.netRevenue += Math.max(0, toAmount(item.netRevenue));
      current.refundRevenue = Math.max(0, current.grossRevenue - current.netRevenue);

      if (!visitedInOrder.has(item.productId)) {
        current.orderCount += 1;
        visitedInOrder.add(item.productId);
      }

      videoSalesMap.set(item.productId, current);
    }
  }

  const series = buckets.map((bucket) => {
    const matched = seriesMap.get(bucket.key);
    const grossRevenue = Math.round(toAmount(matched?.grossRevenue));
    const netRevenue = Math.round(toAmount(matched?.netRevenue));
    const refundRevenue = Math.round(toAmount(matched?.refundRevenue));

    return {
      key: bucket.key,
      label: bucket.label,
      totalRevenue: grossRevenue,
      grossRevenue,
      netRevenue,
      refundRevenue,
      orderCount: Math.round(toAmount(matched?.orderCount)),
    };
  });

  const {
    periodGrossRevenue,
    periodNetRevenue,
    periodRefundRevenue,
    periodOrderCount,
    averageOrderAmount,
  } = summarizeSalesSeries(series);

  const videoSales = [...videoSalesMap.values()]
    .map((item) => {
      const grossRevenue = Math.round(toAmount(item.grossRevenue));
      const netRevenue = Math.round(toAmount(item.netRevenue));
      const refundRevenue = Math.max(0, grossRevenue - netRevenue);

      return {
        ...item,
        saleCount: Math.round(toAmount(item.saleCount)),
        orderCount: Math.round(toAmount(item.orderCount)),
        revenue: netRevenue,
        grossRevenue,
        netRevenue,
        refundRevenue,
      };
    })
    .sort((a, b) => b.netRevenue - a.netRevenue);

  const ageGroupSales = [...ageGroupSalesMap.values()]
    .map((item) => {
      const grossRevenue = Math.round(toAmount(item.grossRevenue));
      const netRevenue = Math.round(toAmount(item.netRevenue));
      const refundRevenue = Math.max(0, grossRevenue - netRevenue);

      return {
        ageGroup: item.ageGroup || "미분류",
        orderCount: Math.round(toAmount(item.orderCount)),
        revenue: netRevenue,
        grossRevenue,
        netRevenue,
        refundRevenue,
      };
    })
    .sort((a, b) => {
      if (b.netRevenue !== a.netRevenue) return b.netRevenue - a.netRevenue;
      return b.orderCount - a.orderCount;
    });

  return {
    period,
    summary: {
      lifetimeRevenue: Math.round(lifetimeGrossRevenue),
      lifetimeGrossRevenue: Math.round(lifetimeGrossRevenue),
      lifetimeNetRevenue: Math.round(lifetimeNetRevenue),
      lifetimeRefundRevenue: Math.round(lifetimeRefundRevenue),
      lifetimeOrderCount: Math.round(lifetimeOrderCount),
      periodRevenue: Math.round(periodGrossRevenue),
      periodGrossRevenue: Math.round(periodGrossRevenue),
      periodNetRevenue: Math.round(periodNetRevenue),
      periodRefundRevenue: Math.round(periodRefundRevenue),
      periodOrderCount: Math.round(periodOrderCount),
      averageOrderAmount,
      pendingRefundCount: Math.round(toAmount(refundSummary?.pendingCount)),
      pendingRefundAmount: Math.round(toAmount(refundSummary?.pendingAmount)),
      approvedRefundCount: Math.round(toAmount(refundSummary?.approvedCount)),
    },
    range: {
      startDate,
      endDate,
      isCustomRange,
    },
    series,
    videoSales,
    ageGroupSales,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 회원 목록 전용 조회 — 수강권·최근출석일·미수금을 함께 반환합니다.
 * AdminMemberListPage 에서 사용합니다.
 */
export async function listMembersForAdmin() {
  const [users, profiles, passes, passPayments, checkins, arrears, orders, memos] = await Promise.all([
    // 회원 기본 정보
    query(
      `SELECT id, login_id AS loginId, name, email, phone,
              user_grade AS userGrade, account_status AS accountStatus,
              points,
              DATE_FORMAT(created_at, '%Y-%m-%d') AS createdAt
       FROM users
       WHERE account_status = 'active'
       ORDER BY created_at DESC`
    ),
    query(
      `SELECT user_id AS userId,
              app_connection_status AS appConnectionStatus,
              member_status AS studioMemberStatus,
              gender,
              DATE_FORMAT(birth_date, '%Y-%m-%d') AS birthDate,
              address,
              address_detail AS addressDetail,
              primary_instructor AS primaryInstructor,
              DATE_FORMAT(registered_at, '%Y-%m-%d') AS studioRegisteredAt
       FROM studio_member_profiles`
    ),
    // 활성 수강권 (회원별 최신 1개씩)
    query(
      `SELECT sp.id, sp.user_id AS userId, sp.pass_name AS passName,
              sp.pass_type AS passType, sp.remaining_count AS remainingCount,
              sp.branch_id AS branchId,
              sp.reservable_count AS reservableCount,
              sp.cancellable_count AS cancellableCount,
              sp.total_count AS totalCount,
              sp.is_family_pass AS isFamilyPass,
              DATE_FORMAT(sp.created_at, '%Y-%m-%d') AS startDate,
              DATE_FORMAT(sp.expires_at, '%Y-%m-%d') AS expiresAt,
              DATEDIFF(sp.expires_at, NOW()) AS daysLeft,
              sp.status,
              DATE_FORMAT(sp.created_at, '%Y-%m-%d') AS issuedAt,
              DATE_FORMAT(sp.updated_at, '%Y-%m-%d') AS updatedAt
       FROM studio_passes sp
       ORDER BY sp.created_at DESC`
    ),
    query(
      `SELECT spp.pass_id AS passId,
              spp.payment_type AS paymentType,
              spp.amount,
              DATE_FORMAT(spp.paid_at, '%Y-%m-%d') AS paidAt,
              spp.payment_method AS paymentMethod,
              spp.installment_months AS installmentMonths
       FROM studio_pass_payments spp
       INNER JOIN (
         SELECT pass_id, MAX(COALESCE(paid_at, created_at)) AS latestPaidAt
         FROM studio_pass_payments
         GROUP BY pass_id
       ) latest
         ON latest.pass_id = spp.pass_id
        AND latest.latestPaidAt = COALESCE(spp.paid_at, spp.created_at)`
    ),
    // 최근 출석일 (마지막 체크인)
    query(
      `SELECT user_id AS userId, MAX(DATE_FORMAT(checked_in_at, '%Y-%m-%d')) AS lastVisitAt
       FROM studio_checkins
       GROUP BY user_id`
    ),
    // 미수금 합계
    query(
      `SELECT user_id AS userId, SUM(amount) AS totalArrears
       FROM studio_arrears
       WHERE status = 'open'
       GROUP BY user_id`
    ),
    query(
      `SELECT user_id AS userId, COUNT(*) AS orderCount
       FROM payment_confirmations
       WHERE status <> 'refunded'
       GROUP BY user_id`
    ),
    query(
      `SELECT smm.user_id AS userId, smm.memo, smm.created_at AS createdAt
       FROM studio_member_memos smm
       INNER JOIN (
         SELECT user_id, MAX(created_at) AS latestCreatedAt
         FROM studio_member_memos
         GROUP BY user_id
       ) latest
         ON latest.user_id = smm.user_id
        AND latest.latestCreatedAt = smm.created_at
       ORDER BY smm.created_at DESC`
    ),
  ]);

  // 회원ID별 맵으로 변환
  const passMap = new Map(); // userId → [passes]
  const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
  const paymentMap = new Map(passPayments.map((payment) => [payment.passId, payment]));
  for (const p of passes) {
    const list = passMap.get(p.userId) || [];
    list.push({
      ...p,
      isFamilyPass: Boolean(Number(p.isFamilyPass || 0)),
      reservableCount: p.reservableCount == null ? null : Number(p.reservableCount),
      cancellableCount: p.cancellableCount == null ? null : Number(p.cancellableCount),
      payment: paymentMap.get(p.id) || null,
    });
    passMap.set(p.userId, list);
  }
  const checkinMap = new Map(checkins.map((c) => [c.userId, c.lastVisitAt]));
  const arrearsMap = new Map(arrears.map((a) => [a.userId, Number(a.totalArrears || 0)]));
  const orderMap = new Map(orders.map((o) => [o.userId, Number(o.orderCount || 0)]));
  const memoMap = new Map(memos.map((m) => [m.userId, { memo: m.memo || "", createdAt: m.createdAt || null }]));

  return users.map(decryptUserRow).map((user) => {
    const profile = profileMap.get(user.id) || {};
    return {
    id: user.id,
    name: user.name,
    loginId: user.loginId,
    phone: user.phone,
    email: user.email,
    userGrade: user.userGrade,
    accountStatus: user.accountStatus,
    points: Number(user.points || 0),
    createdAt: user.createdAt,
    appConnectionStatus: profile.appConnectionStatus || "not_connected",
    studioMemberStatus: profile.studioMemberStatus || null,
    gender: profile.gender || null,
    birthDate: profile.birthDate || null,
    address: profile.address || null,
    addressDetail: profile.addressDetail || null,
    primaryInstructor: profile.primaryInstructor || null,
    studioRegisteredAt: profile.studioRegisteredAt || null,
    lastVisitAt: checkinMap.get(user.id) || null,
    passes: passMap.get(user.id) || [],
    totalArrears: arrearsMap.get(user.id) || 0,
    orderCount: orderMap.get(user.id) || 0,
    latestMemo: memoMap.get(user.id) || null,
    };
  });
}

export async function updateStudioMemberStatus(userId, nextStatus) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedStatus = String(nextStatus || "").trim().toLowerCase();

  if (!normalizedUserId) {
    const error = new Error("회원 정보가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  if (!STUDIO_MEMBER_STATUSES.has(normalizedStatus)) {
    const error = new Error("스튜디오 회원 상태 값이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const user = await queryOne(
    `SELECT id FROM users WHERE id = ? AND account_status = 'active' LIMIT 1`,
    [normalizedUserId]
  );
  if (!user) {
    const error = new Error("대상 회원을 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  await query(
    `INSERT INTO studio_member_profiles
       (user_id, app_connection_status, member_status, registered_at, created_at, updated_at)
     VALUES (?, 'not_connected', ?, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       member_status = VALUES(member_status),
       registered_at = COALESCE(registered_at, VALUES(registered_at)),
       updated_at = NOW()`,
    [normalizedUserId, normalizedStatus]
  );

  return queryOne(
    `SELECT user_id AS userId,
            app_connection_status AS appConnectionStatus,
            member_status AS studioMemberStatus,
            DATE_FORMAT(registered_at, '%Y-%m-%d') AS studioRegisteredAt
     FROM studio_member_profiles
     WHERE user_id = ?
     LIMIT 1`,
    [normalizedUserId]
  );
}

export async function updateStudioMemberProfile(userId, payload = {}) {
  const normalizedUserId = String(userId || "").trim();
  const name = normalizeName(payload.name);
  const phone = normalizePhone(payload.phone);
  const memberStatus = String(payload.memberStatus || payload.studioMemberStatus || "active").trim().toLowerCase();
  const appConnectionStatus = String(payload.appConnectionStatus || "not_connected").trim().toLowerCase();
  const gender = String(payload.gender || "").trim() || null;
  const birthDate = String(payload.birthDate || "").trim() || null;
  const address = String(payload.address || "").trim() || null;
  const addressDetail = String(payload.addressDetail || "").trim() || null;
  const primaryInstructor = String(payload.primaryInstructor || "").trim() || null;

  if (!normalizedUserId) {
    const error = new Error("회원 정보가 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }
  if (!name) {
    const error = new Error("회원 이름을 입력해 주세요.");
    error.status = 400;
    throw error;
  }
  if (!STUDIO_MEMBER_STATUSES.has(memberStatus)) {
    const error = new Error("스튜디오 회원 상태 값이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }
  if (!["connected", "not_connected"].includes(appConnectionStatus)) {
    const error = new Error("앱 연결 상태 값이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const target = await queryOne(
    `SELECT id FROM users WHERE id = ? AND account_status = 'active' LIMIT 1`,
    [normalizedUserId]
  );
  if (!target) {
    const error = new Error("대상 회원을 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  await query(
    `UPDATE users
     SET name = ?, name_hash = ?, phone = ?, phone_hash = ?
     WHERE id = ?`,
    [
      encryptPii(name),
      nameHash(name),
      phone ? encryptPii(phone) : null,
      phoneHash(phone),
      normalizedUserId,
    ]
  );

  await query(
    `INSERT INTO studio_member_profiles
       (user_id, app_connection_status, member_status, gender, birth_date, address, address_detail, primary_instructor, registered_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       app_connection_status = VALUES(app_connection_status),
       member_status = VALUES(member_status),
       gender = VALUES(gender),
       birth_date = VALUES(birth_date),
       address = VALUES(address),
       address_detail = VALUES(address_detail),
       primary_instructor = VALUES(primary_instructor),
       registered_at = COALESCE(registered_at, VALUES(registered_at)),
       updated_at = NOW()`,
    [
      normalizedUserId,
      appConnectionStatus,
      memberStatus,
      gender,
      birthDate,
      address,
      addressDetail,
      primaryInstructor,
    ]
  );

  return {
    userId: normalizedUserId,
    name,
    phone,
    appConnectionStatus,
    studioMemberStatus: memberStatus,
    gender,
    birthDate,
    address,
    addressDetail,
    primaryInstructor,
  };
}

export async function createStudioMember(payload = {}) {
  const name = normalizeName(payload.name);
  if (!name) {
    const err = new Error("이름을 입력해 주세요.");
    err.status = 400;
    throw err;
  }
  const phone = normalizePhone(payload.phone) || "";
  const userGrade = ["member", "vip", "vvip"].includes(String(payload.userGrade || "member")) ? String(payload.userGrade) : "member";
  const gender = String(payload.gender || "").trim() || null;
  const birthDate = String(payload.birthDate || "").trim() || null;
  const primaryInstructor = String(payload.primaryInstructor || "").trim() || null;
  const registeredAt = String(payload.registeredAt || "").trim() || null;

  const id = `user-${randomUUID()}`;
  const loginId = `studio-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const fakeEmail = `studio-${id}@studio.local`;
  const passwordHash = await hashPassword(randomUUID());
  const now = new Date();
  const nowStr = now.toISOString().slice(0, 19).replace("T", " ");

  await query(
    `INSERT INTO users (id, login_id, name, email, email_hash, phone, name_hash, phone_hash, password, user_grade, account_status, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      id,
      loginId,
      encryptPii(name),
      fakeEmail,
      phone ? encryptPii(phone) : null,
      nameHash(name),
      phone ? phoneHash(phone) : null,
      passwordHash,
      userGrade,
      nowStr,
    ]
  );

  await query(
    `INSERT INTO studio_member_profiles
       (user_id, app_connection_status, member_status, gender, birth_date, primary_instructor, registered_at, created_at, updated_at)
     VALUES (?, 'not_connected', 'active', ?, ?, ?, ?, ?, ?)`,
    [id, gender, birthDate, primaryInstructor, registeredAt ? `${registeredAt} 00:00:00` : nowStr, nowStr, nowStr]
  );

  return { id, name, phone, userGrade, gender, birthDate, primaryInstructor, registeredAt: registeredAt || nowStr.slice(0, 10) };
}

const STAFF_ROLES = new Set(["owner", "manager", "instructor"]);
const STAFF_EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "freelance"]);
const STAFF_APP_STATUSES = new Set(["connected", "not_connected"]);
const STAFF_STATUSES = new Set(["active", "inactive", "archived"]);
const STAFF_SALARY_TYPES = new Set(["fixed", "hourly", "commission"]);

function normalizeStaffPayload(payload = {}) {
  const name = String(payload.name || "").trim();
  if (!name) {
    const error = new Error("강사 이름을 입력해 주세요.");
    error.status = 400;
    throw error;
  }
  const roleCode = STAFF_ROLES.has(String(payload.roleCode || "").toLowerCase())
    ? String(payload.roleCode).toLowerCase()
    : "instructor";
  const employmentType = STAFF_EMPLOYMENT_TYPES.has(String(payload.employmentType || "").toLowerCase())
    ? String(payload.employmentType).toLowerCase()
    : "full_time";
  const appConnectionStatus = STAFF_APP_STATUSES.has(String(payload.appConnectionStatus || "").toLowerCase())
    ? String(payload.appConnectionStatus).toLowerCase()
    : "not_connected";
  const status = STAFF_STATUSES.has(String(payload.status || "").toLowerCase())
    ? String(payload.status).toLowerCase()
    : "active";
  const salaryType = STAFF_SALARY_TYPES.has(String(payload.salaryType || "").toLowerCase())
    ? String(payload.salaryType).toLowerCase()
    : "fixed";
  const VALID_GENDERS = new Set(["male", "female"]);
  const VALID_UNITS = new Set(["30min", "hour"]);
  return {
    userId: String(payload.userId || "").trim() || null,
    name,
    roleCode,
    employmentType,
    phone: String(payload.phone || "").trim(),
    appConnectionStatus: String(payload.userId || "").trim() ? "connected" : appConnectionStatus,
    color: String(payload.color || "#4aa3ff").trim() || "#4aa3ff",
    status,
    canManageSchedule: payload.canManageSchedule ? 1 : 0,
    canViewMembers: payload.canViewMembers ? 1 : 0,
    canManagePasses: payload.canManagePasses ? 1 : 0,
    canViewSales: payload.canViewSales ? 1 : 0,
    salaryType,
    basePay: Math.max(0, Math.round(toAmount(payload.basePay))),
    hourlyWage: Math.max(0, Math.round(toAmount(payload.hourlyWage))),
    commissionRate: Math.max(0, Number(payload.commissionRate || 0)),
    memo: String(payload.memo || "").trim(),
    birthDate: payload.birthDate ? String(payload.birthDate).trim() || null : null,
    gender: VALID_GENDERS.has(String(payload.gender || "").toLowerCase()) ? String(payload.gender).toLowerCase() : null,
    bio: String(payload.bio || "").trim() || null,
    career: String(payload.career || "").trim() || null,
    receiveAllNotifications: payload.receiveAllNotifications ? 1 : 0,
    privateAmUnit: VALID_UNITS.has(String(payload.privateAmUnit || "")) ? String(payload.privateAmUnit) : "30min",
    privatePmUnit: VALID_UNITS.has(String(payload.privatePmUnit || "")) ? String(payload.privatePmUnit) : "30min",
  };
}

function mapStaffRow(row = {}) {
  return {
    id: String(row.id || ""),
    userId: String(row.userId || row.user_id || ""),
    name: String(row.name || ""),
    roleCode: String(row.roleCode || row.role_code || "instructor"),
    employmentType: String(row.employmentType || row.employment_type || "full_time"),
    phone: String(row.phone || ""),
    appConnectionStatus: String(row.appConnectionStatus || row.app_connection_status || "not_connected"),
    color: String(row.color || "#4aa3ff"),
    status: String(row.status || "active"),
    canManageSchedule: Boolean(row.canManageSchedule ?? row.can_manage_schedule),
    canViewMembers: Boolean(row.canViewMembers ?? row.can_view_members),
    canManagePasses: Boolean(row.canManagePasses ?? row.can_manage_passes),
    canViewSales: Boolean(row.canViewSales ?? row.can_view_sales),
    salaryType: String(row.salaryType || row.salary_type || "fixed"),
    basePay: toAmount(row.basePay ?? row.base_pay),
    hourlyWage: toAmount(row.hourlyWage ?? row.hourly_wage),
    commissionRate: Number(row.commissionRate ?? row.commission_rate ?? 0),
    memo: String(row.memo || ""),
    birthDate: row.birthDate || row.birth_date || null,
    gender: row.gender || null,
    bio: row.bio || null,
    career: row.career || null,
    receiveAllNotifications: Boolean(row.receiveAllNotifications ?? row.receive_all_notifications),
    privateAmUnit: String(row.privateAmUnit || row.private_am_unit || "30min"),
    privatePmUnit: String(row.privatePmUnit || row.private_pm_unit || "30min"),
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
    source: row.source || "profile",
  };
}

export async function listStudioStaffProfiles() {
  const rows = await query(
    `SELECT
       id, user_id AS userId, name, role_code AS roleCode, employment_type AS employmentType, phone,
       app_connection_status AS appConnectionStatus, color, status,
       can_manage_schedule AS canManageSchedule, can_view_members AS canViewMembers,
       can_manage_passes AS canManagePasses, can_view_sales AS canViewSales,
       salary_type AS salaryType, base_pay AS basePay, hourly_wage AS hourlyWage,
       commission_rate AS commissionRate, memo,
       birth_date AS birthDate, gender, bio, career,
       receive_all_notifications AS receiveAllNotifications,
       private_am_unit AS privateAmUnit, private_pm_unit AS privatePmUnit,
       created_at AS createdAt, updated_at AS updatedAt
     FROM studio_staff_profiles
     WHERE status <> 'archived'
     ORDER BY FIELD(role_code, 'owner','manager','instructor'), name ASC`
  );
  const staff = (Array.isArray(rows) ? rows : []).map(mapStaffRow);
  const knownNames = new Set(staff.map((item) => item.name.trim()).filter(Boolean));
  const classRows = await query(
    `SELECT DISTINCT instructor_name AS name
     FROM studio_classes
     WHERE instructor_name IS NOT NULL AND TRIM(instructor_name) <> ''
     ORDER BY instructor_name ASC`
  );
  for (const row of Array.isArray(classRows) ? classRows : []) {
    const name = String(row.name || "").trim();
    if (!name || knownNames.has(name)) continue;
    staff.push(mapStaffRow({
      id: `class-${name}`,
      name,
      roleCode: "instructor",
      employmentType: "full_time",
      color: "#9aa7ff",
      canManageSchedule: 1,
      canViewMembers: 1,
      source: "class",
    }));
  }
  return staff;
}

export async function saveStudioStaffProfile(staffId, payload = {}) {
  const staff = normalizeStaffPayload(payload);
  const id = staffId ? String(staffId) : `staff-${randomUUID()}`;
  if (staff.userId) {
    const user = await queryOne(
      `SELECT id FROM users WHERE id = ? AND account_status = 'active' LIMIT 1`,
      [staff.userId],
    );
    if (!user?.id) {
      const error = new Error("연결할 활성 로그인 계정을 찾을 수 없습니다.");
      error.status = 404;
      throw error;
    }
    const linkedProfile = await queryOne(
      `SELECT id FROM studio_staff_profiles WHERE user_id = ? AND id <> ? LIMIT 1`,
      [staff.userId, id],
    );
    if (linkedProfile?.id) {
      const error = new Error("이미 다른 강사 또는 매니저에게 연결된 로그인 계정입니다.");
      error.status = 409;
      throw error;
    }
  }
  await query(
    `INSERT INTO studio_staff_profiles
       (id, user_id, name, role_code, employment_type, phone, app_connection_status, color, status,
        can_manage_schedule, can_view_members, can_manage_passes, can_view_sales,
        salary_type, base_pay, hourly_wage, commission_rate, memo,
        birth_date, gender, bio, career, receive_all_notifications,
        private_am_unit, private_pm_unit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       name = VALUES(name),
       role_code = VALUES(role_code),
       employment_type = VALUES(employment_type),
       phone = VALUES(phone),
       app_connection_status = VALUES(app_connection_status),
       color = VALUES(color),
       status = VALUES(status),
       can_manage_schedule = VALUES(can_manage_schedule),
       can_view_members = VALUES(can_view_members),
       can_manage_passes = VALUES(can_manage_passes),
       can_view_sales = VALUES(can_view_sales),
       salary_type = VALUES(salary_type),
       base_pay = VALUES(base_pay),
       hourly_wage = VALUES(hourly_wage),
       commission_rate = VALUES(commission_rate),
       memo = VALUES(memo),
       birth_date = VALUES(birth_date),
       gender = VALUES(gender),
       bio = VALUES(bio),
       career = VALUES(career),
       receive_all_notifications = VALUES(receive_all_notifications),
       private_am_unit = VALUES(private_am_unit),
       private_pm_unit = VALUES(private_pm_unit),
       updated_at = NOW()`,
    [
      id,
      staff.userId,
      staff.name,
      staff.roleCode,
      staff.employmentType,
      staff.phone || null,
      staff.appConnectionStatus,
      staff.color,
      staff.status,
      staff.canManageSchedule,
      staff.canViewMembers,
      staff.canManagePasses,
      staff.canViewSales,
      staff.salaryType,
      staff.basePay,
      staff.hourlyWage,
      staff.commissionRate,
      staff.memo || null,
      staff.birthDate || null,
      staff.gender || null,
      staff.bio || null,
      staff.career || null,
      staff.receiveAllNotifications,
      staff.privateAmUnit,
      staff.privatePmUnit,
    ]
  );
  const row = await queryOne(
    `SELECT
       id, user_id AS userId, name, role_code AS roleCode, employment_type AS employmentType, phone,
       app_connection_status AS appConnectionStatus, color, status,
       can_manage_schedule AS canManageSchedule, can_view_members AS canViewMembers,
       can_manage_passes AS canManagePasses, can_view_sales AS canViewSales,
       salary_type AS salaryType, base_pay AS basePay, hourly_wage AS hourlyWage,
       commission_rate AS commissionRate, memo,
       birth_date AS birthDate, gender, bio, career,
       receive_all_notifications AS receiveAllNotifications,
       private_am_unit AS privateAmUnit, private_pm_unit AS privatePmUnit,
       created_at AS createdAt, updated_at AS updatedAt
     FROM studio_staff_profiles
     WHERE id = ? OR name = ?
     LIMIT 1`,
    [id, staff.name]
  );
  return mapStaffRow(row);
}

export async function archiveStudioStaffProfile(staffId) {
  await query(
    `UPDATE studio_staff_profiles
     SET status = 'archived', updated_at = NOW()
     WHERE id = ?`,
    [staffId]
  );
  return { id: staffId, status: "archived" };
}

export async function getStaffWorkHours(staffId) {
  const rows = await query(
    `SELECT weekday, start_time AS startTime, end_time AS endTime,
            is_day_off AS isDayOff, break_start_time AS breakStartTime, break_end_time AS breakEndTime
     FROM studio_staff_work_hours
     WHERE staff_id = ?
     ORDER BY weekday ASC`,
    [staffId]
  );
  return Array.isArray(rows) ? rows.map((row) => ({
    weekday: Number(row.weekday),
    startTime: row.startTime || "",
    endTime: row.endTime || "",
    isDayOff: Boolean(row.isDayOff),
    breakStartTime: row.breakStartTime || "",
    breakEndTime: row.breakEndTime || "",
  })) : [];
}

export async function saveStaffWorkHours(staffId, hoursArray) {
  if (!Array.isArray(hoursArray) || !hoursArray.length) return [];
  const validWeekdays = new Set([0, 1, 2, 3, 4, 5, 6]);
  for (const entry of hoursArray) {
    const weekday = Number(entry.weekday);
    if (!validWeekdays.has(weekday)) continue;
    const entryId = `wh-${staffId}-${weekday}`;
    await query(
      `INSERT INTO studio_staff_work_hours
         (id, staff_id, weekday, start_time, end_time, is_day_off, break_start_time, break_end_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         start_time = VALUES(start_time),
         end_time = VALUES(end_time),
         is_day_off = VALUES(is_day_off),
         break_start_time = VALUES(break_start_time),
         break_end_time = VALUES(break_end_time),
         updated_at = NOW()`,
      [
        entryId,
        staffId,
        weekday,
        entry.startTime || null,
        entry.endTime || null,
        entry.isDayOff ? 1 : 0,
        entry.breakStartTime || null,
        entry.breakEndTime || null,
      ]
    );
  }
  return getStaffWorkHours(staffId);
}

// ── 수강권 상품 ──────────────────────────────────────────────────────────────

const VALID_PASS_TYPES = new Set(["count", "period"]);
const VALID_CLASS_TYPES_PASS = new Set(["private", "group"]);
const VALID_STUDIO_BRANCH_IDS = new Set(["branch-1", "branch-2"]);

function normalizeStudioBranchId(value) {
  const branchId = String(value || "").trim();
  return VALID_STUDIO_BRANCH_IDS.has(branchId) ? branchId : "branch-1";
}

function normalizePassProduct(payload = {}) {
  const name = String(payload.name || "").trim();
  if (!name) { const e = new Error("수강권 이름을 입력해 주세요."); e.status = 400; throw e; }
  return {
    branchId: normalizeStudioBranchId(payload.branchId),
    name,
    passType: VALID_PASS_TYPES.has(String(payload.passType || "")) ? String(payload.passType) : "count",
    classType: VALID_CLASS_TYPES_PASS.has(String(payload.classType || "")) ? String(payload.classType) : "group",
    capacity: Math.max(1, Math.round(Number(payload.capacity || 1))),
    totalCount: Math.max(0, Math.round(Number(payload.totalCount || 0))),
    validDays: Math.max(1, Math.round(Number(payload.validDays || 30))),
    price: Math.max(0, Math.round(Number(payload.price || 0))),
    color: String(payload.color || "#4aa3ff").trim() || "#4aa3ff",
    isFeatured: payload.isFeatured ? 1 : 0,
    status: String(payload.status || "") === "inactive" ? "inactive" : "active",
    description: String(payload.description || "").trim() || null,
    isTrial: payload.isTrial ? 1 : 0,
    cancelCount: Math.max(0, Math.round(Number(payload.cancelCount || 0))),
    points: Math.max(0, Math.round(Number(payload.points || 0))),
    usageLimitType: String(payload.usageLimitType || "") === "month" ? "month" : "week",
    usageLimit: Math.max(0, Math.round(Number(payload.usageLimit || 0))),
    autoDeduct: payload.autoDeduct ? 1 : 0,
    classCategory: String(payload.classCategory || "").trim(),
    sameDayChange: payload.sameDay ? 1 : 0,
    sameDayChangeCount: Math.max(0, Math.round(Number(payload.sameDayCount || 0))),
    bookingStartTime: String(payload.bookingStartTime || "").trim() || null,
    bookingEndTime: String(payload.bookingEndTime || "").trim() || null,
  };
}

function mapPassProductRow(row = {}) {
  const price = Number(row.price || 0);
  const totalCount = Number(row.totalCount ?? row.total_count ?? 0);
  return {
    id: String(row.id || ""),
    branchId: String(row.branchId || row.branch_id || "branch-1"),
    branchName: String(row.branchName || row.branch_name || (String(row.branchId || row.branch_id) === "branch-2" ? "효천점" : "장덕점")),
    name: String(row.name || ""),
    passType: String(row.passType || row.pass_type || "count"),
    classType: String(row.classType || row.class_type || "group"),
    capacity: Number(row.capacity || 1),
    totalCount,
    validDays: Number(row.validDays ?? row.valid_days ?? 30),
    price,
    pricePerSession: totalCount > 0 ? Math.round(price / totalCount) : 0,
    color: String(row.color || "#4aa3ff"),
    isFeatured: Boolean(row.isFeatured ?? row.is_featured),
    status: String(row.status || "active"),
    description: row.description || null,
    isTrial: Boolean(row.isTrial ?? row.is_trial),
    cancelCount: Number(row.cancelCount ?? row.cancel_count ?? 0),
    points: Number(row.points ?? 0),
    usageLimitType: String(row.usageLimitType || row.usage_limit_type || "week"),
    usageLimit: Number(row.usageLimit ?? row.usage_limit ?? 0),
    autoDeduct: Boolean(row.autoDeduct ?? row.auto_deduct),
    classCategory: String(row.classCategory || row.class_category || ""),
    sameDay: Boolean(row.sameDayChange ?? row.same_day_change),
    sameDayCount: Number(row.sameDayChangeCount ?? row.same_day_change_count ?? 0),
    bookingStartTime: row.bookingStartTime || row.booking_start_time || null,
    bookingEndTime: row.bookingEndTime || row.booking_end_time || null,
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

export async function listStudioPassProducts({ branchId = "" } = {}) {
  const params = [];
  let where = "";
  if (branchId) {
    where = "WHERE spp.branch_id = ?";
    params.push(normalizeStudioBranchId(branchId));
  }
  const rows = await query(
    `SELECT spp.id, spp.branch_id AS branchId,
            COALESCE(b.name, CASE spp.branch_id WHEN 'branch-2' THEN '효천점' ELSE '장덕점' END) AS branchName,
            spp.name, spp.pass_type AS passType, spp.class_type AS classType, spp.capacity,
            spp.total_count AS totalCount, spp.valid_days AS validDays, spp.price,
            spp.color, spp.is_featured AS isFeatured, spp.status, spp.description,
            spp.is_trial AS isTrial, spp.cancel_count AS cancelCount, spp.points,
            spp.usage_limit_type AS usageLimitType, spp.usage_limit AS usageLimit,
            spp.auto_deduct AS autoDeduct, spp.class_category AS classCategory,
            spp.same_day_change AS sameDayChange, spp.same_day_change_count AS sameDayChangeCount,
            spp.booking_start_time AS bookingStartTime, spp.booking_end_time AS bookingEndTime,
            spp.created_at AS createdAt, spp.updated_at AS updatedAt
     FROM studio_pass_products spp
     LEFT JOIN branches b ON b.id = spp.branch_id
     ${where}
     ORDER BY spp.is_featured DESC, spp.created_at DESC`,
    params
  );
  return (Array.isArray(rows) ? rows : []).map(mapPassProductRow);
}

export async function saveStudioPassProduct(productId, payload = {}) {
  const product = normalizePassProduct(payload);
  const id = productId ? String(productId) : `pp-${randomUUID()}`;
  await query(
    `INSERT INTO studio_pass_products
       (id, branch_id, name, pass_type, class_type, capacity, total_count, valid_days,
        price, color, is_featured, status, description,
        is_trial, cancel_count, points, usage_limit_type, usage_limit,
        auto_deduct, class_category, same_day_change, same_day_change_count,
        booking_start_time, booking_end_time,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       branch_id = VALUES(branch_id), name = VALUES(name), pass_type = VALUES(pass_type), class_type = VALUES(class_type),
       capacity = VALUES(capacity), total_count = VALUES(total_count), valid_days = VALUES(valid_days),
       price = VALUES(price), color = VALUES(color), is_featured = VALUES(is_featured),
       status = VALUES(status), description = VALUES(description),
       is_trial = VALUES(is_trial), cancel_count = VALUES(cancel_count), points = VALUES(points),
       usage_limit_type = VALUES(usage_limit_type), usage_limit = VALUES(usage_limit),
       auto_deduct = VALUES(auto_deduct), class_category = VALUES(class_category),
       same_day_change = VALUES(same_day_change), same_day_change_count = VALUES(same_day_change_count),
       booking_start_time = VALUES(booking_start_time), booking_end_time = VALUES(booking_end_time),
       updated_at = NOW()`,
    [id, product.branchId, product.name, product.passType, product.classType, product.capacity,
     product.totalCount, product.validDays, product.price, product.color,
     product.isFeatured, product.status, product.description,
     product.isTrial, product.cancelCount, product.points,
     product.usageLimitType, product.usageLimit,
     product.autoDeduct, product.classCategory,
     product.sameDayChange, product.sameDayChangeCount,
     product.bookingStartTime, product.bookingEndTime]
  );
  const row = await queryOne(
    `SELECT spp.id, spp.branch_id AS branchId,
            COALESCE(b.name, CASE spp.branch_id WHEN 'branch-2' THEN '효천점' ELSE '장덕점' END) AS branchName,
            spp.name, spp.pass_type AS passType, spp.class_type AS classType, spp.capacity,
            spp.total_count AS totalCount, spp.valid_days AS validDays, spp.price,
            spp.color, spp.is_featured AS isFeatured, spp.status, spp.description,
            spp.is_trial AS isTrial, spp.cancel_count AS cancelCount, spp.points,
            spp.usage_limit_type AS usageLimitType, spp.usage_limit AS usageLimit,
            spp.auto_deduct AS autoDeduct, spp.class_category AS classCategory,
            spp.same_day_change AS sameDayChange, spp.same_day_change_count AS sameDayChangeCount,
            spp.booking_start_time AS bookingStartTime, spp.booking_end_time AS bookingEndTime,
            spp.created_at AS createdAt, spp.updated_at AS updatedAt
     FROM studio_pass_products spp
     LEFT JOIN branches b ON b.id = spp.branch_id
     WHERE spp.id = ? LIMIT 1`, [id]
  );
  return mapPassProductRow(row);
}

export async function deleteStudioPassProduct(productId) {
  await query(`DELETE FROM studio_pass_products WHERE id = ?`, [productId]);
  return { id: productId };
}

export async function listIssuedPassesByProduct(productId) {
  const rows = await query(
    `SELECT sp.id, sp.user_id AS userId, sp.branch_id AS branchId,
            COALESCE(b.name, CASE sp.branch_id WHEN 'branch-2' THEN '효천점' ELSE '장덕점' END) AS branchName,
            u.name AS userName, u.phone AS userPhone,
            sp.pass_name AS passName, sp.pass_type AS passType,
            sp.total_count AS totalCount, sp.remaining_count AS remainingCount,
            DATE_FORMAT(sp.created_at, '%Y-%m-%d') AS issuedAt,
            DATE_FORMAT(sp.expires_at, '%Y-%m-%d') AS expiresAt,
            sp.status,
            spp.amount, spp.payment_method AS paymentMethod,
            DATE_FORMAT(spp.paid_at, '%Y-%m-%d') AS paidAt
     FROM studio_passes sp
     LEFT JOIN users u ON u.id = sp.user_id
     LEFT JOIN branches b ON b.id = sp.branch_id
     LEFT JOIN studio_pass_payments spp ON spp.pass_id = sp.id
     WHERE sp.pass_product_id = ?
     ORDER BY sp.created_at DESC`,
    [productId]
  );
  return Array.isArray(rows) ? rows : [];
}

export async function extendIssuedPassesByProduct(productId, extendDays) {
  const days = Math.max(1, Math.round(Number(extendDays) || 1));
  const result = await query(
    `UPDATE studio_passes
     SET expires_at = DATE_ADD(COALESCE(expires_at, NOW()), INTERVAL ${days} DAY),
         updated_at = NOW()
     WHERE pass_product_id = ? AND status IN ('active', 'paused')`,
    [productId]
  );
  return { extendedCount: result?.affectedRows ?? 0 };
}

// ── 스튜디오 상품 (판매/대여) ──────────────────────────────────

function normalizeGoods(payload = {}) {
  const name = String(payload.name || "").trim();
  if (!name) { const e = new Error("상품명을 입력해 주세요."); e.status = 400; throw e; }
  return {
    name,
    goodsType: String(payload.goodsType || "") === "rental" ? "rental" : "sale",
    color: String(payload.color || "#4aa3ff").trim() || "#4aa3ff",
    price: Math.max(0, Math.round(Number(payload.price || 0))),
    points: Math.max(0, Math.round(Number(payload.points || 0))),
    status: String(payload.status || "") === "inactive" ? "inactive" : "active",
    description: String(payload.description || "").trim() || null,
  };
}

function mapGoodsRow(row = {}) {
  return {
    id: String(row.id || ""),
    name: String(row.name || ""),
    goodsType: String(row.goodsType || row.goods_type || "sale"),
    color: String(row.color || "#4aa3ff"),
    price: Number(row.price || 0),
    points: Number(row.points || 0),
    status: String(row.status || "active"),
    description: row.description || null,
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

export async function listStudioGoods() {
  const rows = await query(
    `SELECT id, name, goods_type AS goodsType, color, price, points, status, description,
            created_at AS createdAt, updated_at AS updatedAt
     FROM studio_goods ORDER BY created_at DESC`
  );
  return (Array.isArray(rows) ? rows : []).map(mapGoodsRow);
}

export async function saveStudioGoods(goodsId, payload = {}) {
  const goods = normalizeGoods(payload);
  const id = goodsId ? String(goodsId) : `gd-${randomUUID()}`;
  await query(
    `INSERT INTO studio_goods (id, name, goods_type, color, price, points, status, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       name=VALUES(name), goods_type=VALUES(goods_type), color=VALUES(color),
       price=VALUES(price), points=VALUES(points), status=VALUES(status),
       description=VALUES(description), updated_at=NOW()`,
    [id, goods.name, goods.goodsType, goods.color, goods.price, goods.points, goods.status, goods.description]
  );
  const row = await queryOne(
    `SELECT id, name, goods_type AS goodsType, color, price, points, status, description,
            created_at AS createdAt, updated_at AS updatedAt
     FROM studio_goods WHERE id = ? LIMIT 1`, [id]
  );
  return mapGoodsRow(row);
}

export async function deleteStudioGoods(goodsId) {
  await query(`DELETE FROM studio_goods WHERE id = ?`, [goodsId]);
  return { id: goodsId };
}

// 함수 역할: 회원 등급 데이터를 수정합니다.
export async function updateUserGrade(userId, nextGrade) {
  const normalizedGrade = normalizeUserGrade(nextGrade);
  if (!USER_GRADE_SET.has(normalizedGrade)) {
    const error = new Error("변경할 회원 등급 값이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const target = decryptUserRow(await queryOne(
    `SELECT id, login_id AS loginId, name, email, phone, user_grade AS userGrade
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  ));

  if (!target) {
    const error = new Error("대상 회원을 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  const mapped = mapGradeToRole(normalizedGrade);

  await query(
    `UPDATE users
     SET user_grade = ?, role = ?, is_admin = ?
     WHERE id = ?`,
    [normalizedGrade, mapped.role, mapped.isAdmin, userId]
  );

  const updated = await queryOne(
    `SELECT
      id,
      login_id AS loginId,
      name,
      email,
      phone,
      role,
      is_admin AS isAdmin,
      user_grade AS userGrade,
      created_at AS createdAt
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
  return decryptUserRow(updated);
}

// 함수 역할: 강의 데이터를 새로 생성합니다.
export async function createLecture(payload) {
  const explicitId = String(payload?.id || "").trim();
  const productId = explicitId || `lecture-${Date.now()}`;
  const name = String(payload?.name || payload?.title || "").trim();
  const description = String(payload?.description || "").trim();
  const period = String(payload?.period || "").trim() || "무제한 수강";
  const price = Math.max(0, Math.round(toAmount(payload?.price)));

  if (!name) {
    const error = new Error("강의명을 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const duplicated = await queryOne(`SELECT id FROM products WHERE id = ? LIMIT 1`, [productId]);
  if (duplicated) {
    const error = new Error("이미 같은 강의 ID가 존재합니다.");
    error.status = 409;
    throw error;
  }

  await query(
    `INSERT INTO products (id, name, price, description, period)
     VALUES (?, ?, ?, ?, ?)`,
    [productId, name, price, description || null, period]
  );

  return queryOne(
    `SELECT id, name, price, description, period
     FROM products
     WHERE id = ?
     LIMIT 1`,
    [productId]
  );
}

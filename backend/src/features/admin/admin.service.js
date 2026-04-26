// 파일 역할: 관리자 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { query, queryOne } from "../../shared/db/mysql.js";

const USER_GRADES = ["admin0", "admin1", "member", "vip", "vvip"];
const USER_GRADE_SET = new Set(USER_GRADES);
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

// 함수 역할: monday start 데이터를 조회해 호출자에게 반환합니다.
function getMondayStart(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
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

// 함수 역할: addDays 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
function buildSalesBuckets(period, startDateValue = "", endDateValue = "") {
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
// 함수 역할: 이메일 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

// 함수 역할: 출생 연도 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeBirthYear(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const year = Number.parseInt(text, 10);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) {
    return null;
  }

  return year;
}

// 함수 역할: 연령 그룹 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeAgeGroup(value) {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  if (!text) return "";

  if (text.includes("10")) return "10대 이하";
  if (text.includes("20")) return "20대";
  if (text.includes("30")) return "30대";
  if (text.includes("40")) return "40대";
  if (text.includes("50")) return "50대";
  if (text.includes("60") || text.includes("70") || text.includes("80") || text.includes("90")) {
    return "60대 이상";
  }

  return "";
}

// 함수 역할: 연령 그룹 by 출생 연도 상황에 맞는 값을 계산하거나 선택합니다.
function resolveAgeGroupByBirthYear(birthYear) {
  const year = normalizeBirthYear(birthYear);
  if (!year) return "";

  const age = Math.max(0, new Date().getFullYear() - year);
  if (age <= 19) return "10대 이하";
  if (age <= 29) return "20대";
  if (age <= 39) return "30대";
  if (age <= 49) return "40대";
  if (age <= 59) return "50대";
  return "60대 이상";
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

// 함수 역할: 상품 ids에서 필요한 항목만 골라냅니다.
function pickProductIds(orderRow) {
  const payload = parsePayload(orderRow.payload);
  const ids = new Set();

  if (Array.isArray(payload.selectedProductIds)) {
    payload.selectedProductIds.forEach((value) => {
      const productId = normalizeProductId(value);
      if (productId) ids.add(productId);
    });
  }

  if (Array.isArray(payload.items)) {
    payload.items.forEach((item) => {
      const productId = normalizeProductId(item?.productId);
      if (productId) ids.add(productId);
    });
  }

  const singleProductId = normalizeProductId(payload.productId);
  if (singleProductId) {
    ids.add(singleProductId);
  }

  return [...ids];
}

// 함수 역할: 주문 항목에서 필요한 항목만 골라냅니다.
function pickOrderItems(orderRow) {
  const payload = parsePayload(orderRow.payload);
  const quantityByProductId = new Map();

  function addItem(productId, quantity = 1) {
    const normalized = normalizeProductId(productId);
    if (!normalized) return;
    const safeQuantity = Math.max(1, Math.round(toAmount(quantity) || 1));
    quantityByProductId.set(normalized, (quantityByProductId.get(normalized) || 0) + safeQuantity);
  }

  if (Array.isArray(payload.items)) {
    payload.items.forEach((item) => addItem(item?.productId, item?.quantity));
  }

  if (Array.isArray(payload.selectedProductIds)) {
    payload.selectedProductIds.forEach((productId) => addItem(productId, 1));
  }

  if (quantityByProductId.size === 0) {
    addItem(payload.productId, 1);
  }

  return [...quantityByProductId.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
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
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
       FROM users
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
  for (const order of orders) {
    const emailKey = String(order.customerEmail || "")
      .trim()
      .toLowerCase();
    if (!emailKey) continue;
    const current = ordersByEmail.get(emailKey) || [];
    current.push(order);
    ordersByEmail.set(emailKey, current);
  }

  return users.map((user) => {
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

  const user = await queryOne(
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
  );

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
       WHERE customer_email = ?
       ORDER BY created_at DESC`,
      [String(user.email || "").trim().toLowerCase()]
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
        av.category
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
  for (const row of learnerRows) {
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

  const [orderRows, productRows, videoRows, userRows] = await Promise.all([
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
        LOWER(email) AS emailKey,
        birth_year AS birthYear
       FROM users
       WHERE email IS NOT NULL
         AND email <> ''`
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

  const userBirthYearByEmail = new Map(
    userRows.map((user) => [normalizeEmail(user.emailKey), normalizeBirthYear(user.birthYear)])
  );

  const lifetimeOrderCount = orderRows.length;
  let lifetimeGrossRevenue = 0;
  let lifetimeRefundRevenue = 0;
  let lifetimeNetRevenue = 0;

  const videoSalesMap = new Map();
  const ageGroupSalesMap = new Map();

  for (const order of orderRows) {
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
        return {
          ...item,
          price: Math.max(0, toAmount(product?.price)),
          weight: Math.max(0, toAmount(product?.price)) * Math.max(1, Math.round(toAmount(item.quantity))),
        };
      })
      .filter((item) => videoByProductId.has(item.productId));

    if (!pricedItems.length) continue;

    const totalWeight = pricedItems.reduce((sum, item) => sum + item.weight, 0);
    const revenuePerItem =
      totalWeight > 0
        ? pricedItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            grossRevenue: grossAmount * (item.weight / totalWeight),
            netRevenue: netAmount * (item.weight / totalWeight),
          }))
        : pricedItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            grossRevenue: grossAmount / pricedItems.length,
            netRevenue: netAmount / pricedItems.length,
          }));

    const visitedInOrder = new Set();
    for (const item of revenuePerItem) {
      const video = videoByProductId.get(item.productId);
      if (!video) continue;

      const current = videoSalesMap.get(item.productId) || {
        videoId: video.videoId,
        productId: video.productId,
        title: video.title,
        instructor: video.instructor,
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

  const periodGrossRevenue = series.reduce((sum, item) => sum + item.grossRevenue, 0);
  const periodNetRevenue = series.reduce((sum, item) => sum + item.netRevenue, 0);
  const periodRefundRevenue = series.reduce((sum, item) => sum + item.refundRevenue, 0);
  const periodOrderCount = series.reduce((sum, item) => sum + item.orderCount, 0);

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
      averageOrderAmount: periodOrderCount > 0 ? Math.round(periodGrossRevenue / periodOrderCount) : 0,
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

// 함수 역할: 회원 등급 데이터를 수정합니다.
export async function updateUserGrade(userId, nextGrade) {
  const normalizedGrade = normalizeUserGrade(nextGrade);
  if (!USER_GRADE_SET.has(normalizedGrade)) {
    const error = new Error("변경할 회원 등급 값이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }

  const target = await queryOne(
    `SELECT id, login_id AS loginId, name, email, phone, user_grade AS userGrade
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

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

  return queryOne(
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






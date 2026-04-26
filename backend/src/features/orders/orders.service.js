// 파일 역할: 주문 도메인의 DB 조회와 비즈니스 로직을 처리합니다.
import { query, queryOne } from "../../shared/db/mysql.js";

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

// 함수 역할: 주문 목록을 조회해 반환합니다.
export async function listOrders() {
  const rows = await query(
    `SELECT id, order_name AS orderName, amount, customer_email AS customerEmail, payload, created_at AS createdAt
     FROM orders
     ORDER BY created_at DESC`
  );

  return rows.map((row) => ({
    ...row,
    ...parsePayload(row.payload),
  }));
}

// 함수 역할: 주문 by customer 이메일 목록을 조회해 반환합니다.
export async function listOrdersByCustomerEmail(customerEmail) {
  const rows = await query(
    `SELECT id, order_name AS orderName, amount, customer_email AS customerEmail, payload, created_at AS createdAt
     FROM orders
     WHERE customer_email = ?
     ORDER BY created_at DESC`,
    [customerEmail]
  );

  return rows.map((row) => ({
    ...row,
    ...parsePayload(row.payload),
  }));
}

// 함수 역할: 주문 데이터를 새로 생성합니다.
export async function createOrder(payload, authUser = null) {
  const normalizedOrderId = String(payload?.orderId || "").trim();
  const customerEmail = normalizeEmail(payload?.customerEmail || authUser?.email || "");

  const customerFromDb = customerEmail
    ? await queryOne(
        `SELECT id, email, birth_year AS birthYear
         FROM users
         WHERE LOWER(email) = ?
         LIMIT 1`,
        [customerEmail]
      )
    : null;

  const payloadAgeGroup =
    normalizeAgeGroup(payload?.customerAgeGroup) ||
    normalizeAgeGroup(payload?.ageGroup) ||
    normalizeAgeGroup(payload?.customer?.ageGroup);
  const payloadBirthYear =
    normalizeBirthYear(payload?.customerBirthYear) ||
    normalizeBirthYear(payload?.birthYear) ||
    normalizeBirthYear(payload?.customer?.birthYear);
  const userBirthYear = normalizeBirthYear(customerFromDb?.birthYear);

  const resolvedBirthYear = payloadBirthYear || userBirthYear || null;
  const resolvedAgeGroup =
    payloadAgeGroup || resolveAgeGroupByBirthYear(resolvedBirthYear) || "미분류";

  const order = {
    id: normalizedOrderId || `order-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...payload,
    customerEmail: customerEmail || null,
    customerAgeGroup: resolvedAgeGroup,
    customerBirthYear: resolvedBirthYear,
    customerUserId: String(authUser?.id || customerFromDb?.id || "").trim() || null,
    customer: {
      ...(payload?.customer && typeof payload.customer === "object" ? payload.customer : {}),
      userId: String(authUser?.id || customerFromDb?.id || "").trim() || null,
      email: customerEmail || null,
      ageGroup: resolvedAgeGroup,
      birthYear: resolvedBirthYear,
    },
  };

  await query(
    `INSERT INTO orders (id, order_name, amount, customer_email, payload, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       order_name = VALUES(order_name),
       amount = VALUES(amount),
       customer_email = VALUES(customer_email),
       payload = VALUES(payload),
       created_at = NOW()`,
    [
      order.id,
      order.orderName ?? null,
      Number(order.amount ?? 0),
      order.customerEmail ?? null,
      JSON.stringify(order),
    ]
  );

  return order;
}

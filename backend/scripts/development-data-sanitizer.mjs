import { createHmac, randomBytes } from "node:crypto";

export const DEVELOPMENT_DATASET_VERSION = 1;

export const EXCLUDED_SOURCE_TABLES = new Set([
  "schema_migrations",
  "studio_class_memos",
]);

export const EMPTY_IN_DEVELOPMENT_TABLES = new Set([
  "academy_playback_sessions",
  "email_verifications",
  "login_rate_limits",
  "payment_confirmations",
  "payment_webhook_events",
  "sessions",
  "signup_rate_limits",
  "studio_member_memos",
  "studio_notification_deliveries",
  "studio_notification_logs",
  "studio_notifications",
  "studio_push_devices",
]);

export function serializeSanitizedDatabaseValue(value) {
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

const USER_REFERENCE_COLUMNS = new Set([
  "author_id",
  "created_by",
  "from_user_id",
  "granted_by",
  "recipient_user_id",
  "to_user_id",
  "user_id",
]);

const USER_REFERENCE_JSON_KEYS = new Set([
  "authorid",
  "createdby",
  "customeruserid",
  "fromuserid",
  "grantedby",
  "recipientuserid",
  "touserid",
  "userid",
]);

const SECRET_JSON_KEY_PATTERN = /(password|secret|token|session|verification|private.?key|api.?key|sales.?pin)/i;
const CONTACT_JSON_KEY_PATTERN = /(email|phone|mobile|address|birth|customer($|.?name)|recipient.?name|login.?id|user.?name)/i;
const PAYMENT_JSON_KEY_PATTERN = /(payment.?id|webhook.?id|provider.?message.?id)/i;

function shortToken(secret, namespace, value, length = 20) {
  return createHmac("sha256", secret)
    .update(`${namespace}:${String(value ?? "")}`)
    .digest("hex")
    .slice(0, length);
}

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/enc:v1:[A-Za-z0-9_:-]+/g, "[REDACTED_PII]")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "redacted@example.invalid")
    .replace(/\b(?:\+?82[- ]?)?0?1[016789][-. ]?\d{3,4}[-. ]?\d{4}\b/g, "000-0000-0000")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_TOKEN]");
}

function parseStructured(value) {
  if (value === null || typeof value === "undefined" || value === "") return value;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return sanitizeText(value);
  }
}

function stringifyStructured(value) {
  if (value === null || typeof value === "undefined") return value;
  return JSON.stringify(value);
}

export function createSanitizationContext({ secret = randomBytes(32) } = {}) {
  const userId = (value) => {
    if (value === null || typeof value === "undefined" || String(value).trim() === "") return value;
    return `dev-user-${shortToken(secret, "user", value, 24)}`;
  };
  const orderId = (value) => {
    if (value === null || typeof value === "undefined" || String(value).trim() === "") return value;
    return `dev-order-${shortToken(secret, "order", value, 24)}`;
  };
  const personName = (value, namespace = "person") => {
    if (value === null || typeof value === "undefined" || String(value).trim() === "") return value;
    return `Development ${namespace} ${shortToken(secret, namespace, value, 8)}`;
  };
  const email = (value) => `dev-${shortToken(secret, "email", value, 24)}@example.invalid`;
  const genericId = (namespace, value, prefix = "dev") => {
    if (value === null || typeof value === "undefined" || String(value).trim() === "") return value;
    return `${prefix}-${shortToken(secret, namespace, value, 24)}`;
  };

  return {
    secret,
    disabledPasswordHash: "",
    email,
    genericId,
    staffId: (value) => genericId("staff", value, "dev-staff"),
    orderId,
    personName,
    userId,
  };
}

function sanitizeStructured(value, context, keyName = "") {
  if (value === null || typeof value === "undefined") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeStructured(item, context, keyName));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      sanitizeStructured(item, context, key),
    ]));
  }

  const normalizedKey = String(keyName).replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  if (USER_REFERENCE_JSON_KEYS.has(normalizedKey)) return context.userId(value);
  if (/^(id|orderid)$/.test(normalizedKey)) return context.orderId(value);
  if (SECRET_JSON_KEY_PATTERN.test(keyName)) return "[REDACTED]";
  if (PAYMENT_JSON_KEY_PATTERN.test(keyName)) return "[REDACTED]";
  if (CONTACT_JSON_KEY_PATTERN.test(keyName)) {
    if (/email/i.test(keyName)) return context.email(value);
    if (/name/i.test(keyName)) return context.personName(value, "Customer");
    if (/phone|mobile/i.test(keyName)) return "000-0000-0000";
    return "[REDACTED]";
  }
  return typeof value === "string" ? sanitizeText(value) : value;
}

function sanitizeUser(row, context) {
  const id = context.userId(row.id);
  const token = id.slice(-16);
  return {
    ...row,
    id,
    login_id: `dev_${token}`,
    name: `Development User ${token.slice(0, 8)}`,
    name_hash: null,
    email: context.email(row.id),
    email_hash: null,
    password: context.disabledPasswordHash,
    phone: null,
    phone_hash: null,
    birth_year_encrypted: null,
    marketing_agree: 0,
    marketing_agreed_at: null,
  };
}

function sanitizeRowByTable(table, row, context) {
  const next = { ...row };

  for (const column of USER_REFERENCE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(next, column)) next[column] = context.userId(next[column]);
  }
  if (Object.prototype.hasOwnProperty.call(next, "staff_id")) next.staff_id = context.staffId(next.staff_id);

  if (table === "users") return sanitizeUser(next, context);

  if (table === "academy_certificates") {
    next.certificate_no = context.genericId("certificate", next.certificate_no, "DEV-CERT");
  }
  if (table === "academy_qna_posts") {
    next.user_name = context.personName(next.user_id, "User");
    next.title = "Development question";
    next.content = "Sanitized development question content.";
  }
  if (table === "academy_qna_replies") {
    next.user_name = context.personName(next.user_id, "User");
    next.content = "Sanitized development reply content.";
  }
  if (table === "academy_reviews") {
    next.user_name = context.personName(next.user_id, "User");
    next.content = "Sanitized development review content.";
  }
  if (table === "academy_videos") {
    next.instructor = context.personName(next.instructor, "Instructor");
  }
  if (table === "branches") {
    next.address = "Development address";
    next.phone = "000-0000-0000";
    next.parking = "Development parking information";
    next.lat = null;
    next.lng = null;
    next.map_link = null;
  }
  if (table === "inquiry_posts") {
    next.title = "Development inquiry";
    next.content = "Sanitized development inquiry content.";
    next.author = context.personName(next.author_id || next.id, "Author");
    next.image_url = null;
    next.video_url = null;
  }
  if (table === "inquiry_replies") {
    next.author_name = context.personName(next.author_id, "Author");
    next.content = "Sanitized development inquiry reply.";
  }
  if (table === "instructors") {
    next.id = context.genericId("instructor", next.id, "dev-instructor");
    next.name = context.personName(next.name || next.id, "Instructor");
    next.intro = "Sanitized development instructor profile.";
    next.careers = JSON.stringify([]);
  }
  if (table === "orders") {
    next.id = context.orderId(next.id);
    next.order_name = "Development order";
    next.customer_email = context.email(row.id);
    next.customer_email_hash = null;
    next.payload = stringifyStructured(sanitizeStructured(parseStructured(next.payload), context));
  }
  if (table === "point_history") {
    next.order_id = context.orderId(next.order_id);
    next.reason = "Sanitized development point history";
  }
  if (table === "refund_requests") {
    next.order_id = context.orderId(next.order_id);
    next.customer_email = context.email(row.id);
    next.customer_email_hash = null;
    next.reason = "Sanitized development refund reason";
    next.admin_note = null;
  }
  if (table === "review_posts") {
    next.title = "Development review post";
    next.content = "Sanitized development review post.";
    next.author = context.personName(next.author_id || next.id, "Author");
    next.image_url = null;
    next.video_url = null;
  }
  if (table === "review_comments") {
    next.author = context.personName(next.author || next.id, "Author");
    next.content = "Sanitized development review comment.";
  }
  if (table === "studio_arrears") next.reason = "Sanitized development arrears reason";
  if (table === "studio_classes") {
    next.instructor_name = context.personName(next.instructor_name, "Instructor");
    next.external_import_key = null;
  }
  if (table === "studio_consultations") {
    next.staff_name = context.personName(next.staff_name, "Staff");
    next.customer_name = context.personName(next.id, "Customer");
    next.customer_phone = "000-0000-0000";
    next.memo = null;
  }
  if (table === "studio_expenses") {
    next.title = "Development expense";
    next.instructor_name = context.personName(next.instructor_name, "Instructor");
    next.attachment_url = null;
    next.memo = null;
  }
  if (table === "studio_holidays") next.note = next.note ? "Development holiday note" : null;
  if (table === "studio_info") {
    next.studio_name = "Development Studio";
    next.address = "Development address";
    next.address_detail = "";
    next.phones = JSON.stringify([]);
    next.sms_sender = "";
    next.sales_pin = "";
  }
  if (table === "studio_instructor_hours") {
    next.instructor_name = context.personName(next.instructor_name, "Instructor");
  }
  if (table === "studio_member_profiles") {
    next.gender = null;
    next.birth_date = null;
    next.address = null;
    next.address_detail = null;
    next.primary_instructor = context.personName(next.primary_instructor, "Instructor");
  }
  if (table === "studio_message_templates") {
    next.template_code = null;
    next.message = sanitizeText(next.message);
  }
  if (table === "studio_notices") {
    next.title = "Development notice";
    next.content = "Sanitized development notice content.";
    next.images = JSON.stringify([]);
  }
  if (table === "studio_notification_templates") {
    next.push_enabled = 0;
    next.sms_enabled = 0;
    next.kakao_enabled = 0;
    next.kakao_template_code = null;
    next.message = sanitizeText(next.message);
  }
  if (table === "studio_pass_pauses") next.reason = next.reason ? "Development pause reason" : null;
  if (table === "studio_pass_payments") next.note = null;
  if (table === "studio_pass_refunds") next.reason = next.reason ? "Development refund reason" : null;
  if (table === "studio_pass_transactions") next.reason = "Development pass transaction";
  if (table === "studio_pass_transfers") next.reason = next.reason ? "Development transfer reason" : null;
  if (table === "studio_passes") next.external_import_key = null;
  if (table === "studio_staff_profiles") {
    next.id = context.staffId(next.id);
    next.name = context.personName(next.name || next.id, "Staff");
    next.phone = null;
    next.memo = null;
    next.birth_date = null;
    next.gender = null;
    next.bio = null;
    next.career = null;
    next.base_pay = 0;
    next.hourly_wage = 0;
    next.commission_rate = 0;
  }

  if (Object.prototype.hasOwnProperty.call(next, "override_value")) {
    next.override_value = stringifyStructured(sanitizeStructured(parseStructured(next.override_value), context));
  }

  for (const [column, value] of Object.entries(next)) {
    if (typeof value === "string") next[column] = sanitizeText(value);
  }
  return next;
}

export function sanitizeTableRows(table, rows, context) {
  if (EXCLUDED_SOURCE_TABLES.has(table) || EMPTY_IN_DEVELOPMENT_TABLES.has(table)) return [];
  return rows.map((row) => sanitizeRowByTable(table, row, context));
}

export function assertSanitizedDataset(dataset) {
  if (dataset?.version !== DEVELOPMENT_DATASET_VERSION) throw new Error("unsupported sanitized dataset version");
  if (dataset?.kind !== "icl-development-sanitized-data") throw new Error("invalid sanitized dataset kind");
  if (!Array.isArray(dataset?.tables) || dataset.tables.length === 0) throw new Error("sanitized dataset has no tables");

  const serialized = JSON.stringify(dataset);
  const forbidden = [
    ["encrypted PII", /enc:v1:/i],
    ["private key", /-----BEGIN [^-]*PRIVATE KEY-----/i],
    ["JWT", /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/],
  ];
  for (const [label, pattern] of forbidden) {
    if (pattern.test(serialized)) throw new Error(`sanitized dataset still contains ${label}`);
  }

  const emailCandidates = serialized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  if (emailCandidates.some((email) => !email.toLowerCase().endsWith("@example.invalid"))) {
    throw new Error("sanitized dataset still contains a non-development email");
  }
  return true;
}

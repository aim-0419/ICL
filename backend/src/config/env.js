import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "../..");
const defaultEnvPath = path.resolve(backendRoot, ".env");
const nodeEnvFromProcess = process.env.NODE_ENV ?? "development";
const isProductionProcess = String(nodeEnvFromProcess).trim().toLowerCase() === "production";

function resolveBackendFilePath(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  const candidates = path.isAbsolute(rawValue)
    ? [rawValue]
    : [path.resolve(process.cwd(), rawValue), path.resolve(backendRoot, rawValue)];

  for (const absolutePath of candidates) {
    const relativePath = path.relative(backendRoot, absolutePath);
    if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
      return absolutePath;
    }
  }

  return "";
}

function loadEnvironmentFiles() {
  const candidates = [];
  const explicitEnvFile = resolveBackendFilePath(process.env.ENV_FILE);

  if (explicitEnvFile && !isProductionProcess) {
    candidates.push(explicitEnvFile);
  }

  if (String(nodeEnvFromProcess).trim().toLowerCase() === "test") {
    candidates.push(path.resolve(backendRoot, ".env.test"));
  }

  candidates.push(defaultEnvPath);

  for (const envPath of candidates) {
    dotenv.config({ path: envPath, override: false });
  }
}

loadEnvironmentFiles();

function readBooleanEnv(key, defaultValue = false) {
  const value = process.env[key];
  if (value == null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function resolveUploadRootPath(value) {
  const rawValue = String(value || "uploads").trim() || "uploads";
  const absolutePath = path.isAbsolute(rawValue) ? rawValue : path.resolve(backendRoot, rawValue);
  const relativePath = path.relative(backendRoot, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return path.resolve(backendRoot, "uploads");
  }

  return absolutePath;
}

// 서버 전체에서 사용하는 환경변수를 한곳에서 읽고 기본값을 적용합니다.
function looksLikeTestDatabaseName(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;

  const parts = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return parts.includes("test") || parts.includes("e2e") || parts.includes("qa");
}

const testSafeMode = readBooleanEnv("TEST_SAFE_MODE", false);
const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = String(nodeEnv).trim().toLowerCase() === "production";
const dbName = process.env.DB_NAME ?? "icl_pilates";
const isTestDatabase = looksLikeTestDatabaseName(dbName);
const requestedE2eDataMutation = readBooleanEnv("ALLOW_E2E_DATA_MUTATION", false);

// TEST_SAFE_MODE blocks external side effects. DB write E2E is separately
// allowed only when an explicit flag is used with a clearly named test DB.
const allowE2eDataMutation = requestedE2eDataMutation && !isProduction && isTestDatabase;

export const env = {
  nodeEnv,
  testSafeMode,
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  uploadRootPath: resolveUploadRootPath(process.env.UPLOAD_ROOT),
  dbHost: process.env.DB_HOST ?? "127.0.0.1",
  dbPort: Number(process.env.DB_PORT ?? 3306),
  dbUser: process.env.DB_USER ?? "root",
  dbPassword: process.env.DB_PASSWORD ?? "",
  dbName,
  isTestDatabase,
  dbInitMode: String(process.env.DB_INIT_MODE ?? "safe").trim().toLowerCase() || "safe",
  allowStartupSchemaBootstrap: readBooleanEnv("ALLOW_STARTUP_SCHEMA_BOOTSTRAP", false),
  allowStartupSchemaAlter: readBooleanEnv("ALLOW_STARTUP_SCHEMA_ALTER", false),
  allowStartupDataRepair: readBooleanEnv("ALLOW_STARTUP_DATA_REPAIR", false),
  allowDestructiveMigrations: readBooleanEnv("ALLOW_DESTRUCTIVE_MIGRATIONS", false),
  allowStartupDataPurge: readBooleanEnv("ALLOW_STARTUP_DATA_PURGE", false),
  allowStartupSchemaDrop: readBooleanEnv("ALLOW_STARTUP_SCHEMA_DROP", false),
  allowStartupUserPurge: readBooleanEnv("ALLOW_STARTUP_USER_PURGE", false),
  allowExternalEmailSend: !testSafeMode && readBooleanEnv("ALLOW_EXTERNAL_EMAIL_SEND", false),
  allowExternalSmsSend: !testSafeMode && readBooleanEnv("ALLOW_EXTERNAL_SMS_SEND", false),
  allowExternalKakaoSend: !testSafeMode && readBooleanEnv("ALLOW_EXTERNAL_KAKAO_SEND", false),
  allowExternalPushSend: !testSafeMode && readBooleanEnv("ALLOW_EXTERNAL_PUSH_SEND", false),
  allowExternalPaymentCalls: !testSafeMode && readBooleanEnv("ALLOW_EXTERNAL_PAYMENT_CALLS", false),
  requestedE2eDataMutation,
  allowE2eDataMutation,
  portoneApiBaseUrl: process.env.PORTONE_API_BASE_URL ?? "https://api.portone.io",
  portoneApiSecret: process.env.PORTONE_API_SECRET ?? "",
  portoneWebhookSecret: process.env.PORTONE_WEBHOOK_SECRET ?? "",
  portoneWebhookSecrets: process.env.PORTONE_WEBHOOK_SECRETS ?? "",
  socialYoutubeVideosUrl: process.env.SOCIAL_YOUTUBE_VIDEOS_URL ?? "https://www.youtube.com/@ICL-PILATES/videos",
  socialYoutubeChannelId: process.env.SOCIAL_YOUTUBE_CHANNEL_ID ?? "UC5WwEtRClHmSVB0tmUypryA",
  socialBlogUrl: process.env.SOCIAL_BLOG_URL ?? "https://blog.naver.com/icl_pilates",
  socialBlogRssUrl: process.env.SOCIAL_BLOG_RSS_URL ?? "https://rss.blog.naver.com/icl_pilates.xml",
  socialInstagramUrl: process.env.SOCIAL_INSTAGRAM_URL ?? "https://www.instagram.com/icl.pilates/",
  socialFeedCacheSeconds: Number(process.env.SOCIAL_FEED_CACHE_SECONDS ?? 300),
  socialFetchTimeoutMs: Number(process.env.SOCIAL_FETCH_TIMEOUT_MS ?? 8000),
  academyPlaybackTokenSecret: process.env.ACADEMY_PLAYBACK_TOKEN_SECRET ?? "",
  academyPlaybackTokenTtlSec: Number(process.env.ACADEMY_PLAYBACK_TOKEN_TTL_SEC ?? 21600),
  academyPublishSchedulerEnabled: !testSafeMode && readBooleanEnv("ACADEMY_PUBLISH_SCHEDULER_ENABLED", false),
  academyPublishSchedulerIntervalSec: Number(process.env.ACADEMY_PUBLISH_SCHEDULER_INTERVAL_SEC ?? 60),
  piiEncryptionKey: process.env.PII_ENCRYPTION_KEY ?? "",
  piiEncryptionLegacyKeys: process.env.PII_ENCRYPTION_LEGACY_KEYS ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "이끌림 필라테스 <noreply@icl-pilates.com>",
  debugVerificationCodes:
    process.env.NODE_ENV !== "production" &&
    String(process.env.DEBUG_VERIFICATION_CODES ?? "false").trim().toLowerCase() === "true",
  siteUrl: process.env.SITE_URL ?? "http://localhost:5173",
  demoAdminEnabled: String(process.env.DEMO_ADMIN_ENABLED ?? "false").trim().toLowerCase() === "true",
  demoAdminLoginId: process.env.DEMO_ADMIN_LOGIN_ID ?? "demo-admin",
  demoAdminPassword: process.env.DEMO_ADMIN_PASSWORD ?? "",
  demoAdminEmail: process.env.DEMO_ADMIN_EMAIL ?? "demo-admin@icl.local",
  demoAdminName: process.env.DEMO_ADMIN_NAME ?? "Demo Admin",
  aligoApiKey: process.env.ALIGO_API_KEY ?? "",
  aligoUserId: process.env.ALIGO_USER_ID ?? "",
  aligoSender: process.env.ALIGO_SENDER ?? "",
  kakaoSenderKey: process.env.KAKAO_SENDER_KEY ?? "",
  kakaoDefaultTemplate: process.env.KAKAO_DEFAULT_TEMPLATE ?? "",
  notificationSchedulerEnabled: !testSafeMode && readBooleanEnv("NOTIFICATION_SCHEDULER_ENABLED", false),
  notificationSchedulerIntervalSec: Number(process.env.NOTIFICATION_SCHEDULER_INTERVAL_SEC ?? 30),
  notificationMaxAttempts: Number(process.env.NOTIFICATION_MAX_ATTEMPTS ?? 10),
  fcmProjectId: process.env.FCM_PROJECT_ID ?? "",
  fcmClientEmail: process.env.FCM_CLIENT_EMAIL ?? "",
  fcmPrivateKey: String(process.env.FCM_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
};

if (isProduction) {
  const required = [
    ["PORTONE_API_SECRET", env.portoneApiSecret],
    ["ACADEMY_PLAYBACK_TOKEN_SECRET", env.academyPlaybackTokenSecret],
    ["PII_ENCRYPTION_KEY", env.piiEncryptionKey],
    ["DB_PASSWORD", env.dbPassword],
  ];
  const missing = required.filter(([, value]) => !value).map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`[startup] 필수 환경변수가 설정되지 않았습니다: ${missing.join(", ")}`);
  }
}

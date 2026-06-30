import dotenv from "dotenv";

dotenv.config();

/** 서버 전체에서 사용하는 환경변수를 한곳에서 읽고 기본값을 적용합니다. */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  dbHost: process.env.DB_HOST ?? "127.0.0.1",
  dbPort: Number(process.env.DB_PORT ?? 3306),
  dbUser: process.env.DB_USER ?? "root",
  dbPassword: process.env.DB_PASSWORD ?? "",
  dbName: process.env.DB_NAME ?? "icl_pilates",
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
  academyPublishSchedulerEnabled: String(process.env.ACADEMY_PUBLISH_SCHEDULER_ENABLED ?? "true")
    .trim()
    .toLowerCase() !== "false",
  academyPublishSchedulerIntervalSec: Number(process.env.ACADEMY_PUBLISH_SCHEDULER_INTERVAL_SEC ?? 60),
  piiEncryptionKey: process.env.PII_ENCRYPTION_KEY ?? "",
  piiEncryptionLegacyKeys: process.env.PII_ENCRYPTION_LEGACY_KEYS ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "이끌림 필라테스 <noreply@icl-pilates.com>",
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
  notificationSchedulerEnabled: String(process.env.NOTIFICATION_SCHEDULER_ENABLED ?? "true")
    .trim()
    .toLowerCase() !== "false",
  notificationSchedulerIntervalSec: Number(process.env.NOTIFICATION_SCHEDULER_INTERVAL_SEC ?? 30),
  notificationMaxAttempts: Number(process.env.NOTIFICATION_MAX_ATTEMPTS ?? 10),
  fcmProjectId: process.env.FCM_PROJECT_ID ?? "",
  fcmClientEmail: process.env.FCM_CLIENT_EMAIL ?? "",
  fcmPrivateKey: String(process.env.FCM_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
};

if (env.nodeEnv === "production") {
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

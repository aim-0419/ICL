import dotenv from "dotenv";

dotenv.config();

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
  socialYoutubeVideosUrl: process.env.SOCIAL_YOUTUBE_VIDEOS_URL ?? "https://www.youtube.com/@ICL-PILATES/videos",
  socialYoutubeChannelId: process.env.SOCIAL_YOUTUBE_CHANNEL_ID ?? "UC5WwEtRClHmSVB0tmUypryA",
  socialBlogUrl: process.env.SOCIAL_BLOG_URL ?? "https://blog.naver.com/icl_pilates",
  socialBlogRssUrl: process.env.SOCIAL_BLOG_RSS_URL ?? "https://rss.blog.naver.com/icl_pilates.xml",
  socialInstagramUrl: process.env.SOCIAL_INSTAGRAM_URL ?? "https://www.instagram.com/icl.pilates/",
  socialFeedCacheSeconds: Number(process.env.SOCIAL_FEED_CACHE_SECONDS ?? 300),
  socialFetchTimeoutMs: Number(process.env.SOCIAL_FETCH_TIMEOUT_MS ?? 8000),
};

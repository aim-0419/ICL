import { env } from "../../config/env.js";
import { query } from "../../shared/db/mysql.js";

const DEFAULT_YOUTUBE_VIDEOS_URL = "https://www.youtube.com/@ICL-PILATES/videos";
const DEFAULT_YOUTUBE_CHANNEL_ID = "UC5WwEtRClHmSVB0tmUypryA";
const DEFAULT_BLOG_URL = "https://blog.naver.com/icl_pilates";
const DEFAULT_BLOG_RSS_URL = "https://rss.blog.naver.com/icl_pilates.xml";
const DEFAULT_INSTAGRAM_URL = "https://www.instagram.com/icl.pilates/";
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = "Mozilla/5.0";
const SOURCE_ORDER = ["youtube", "blog", "instagram"];

const socialConfig = {
  youtubeVideosUrl: normalizeUrl(env.socialYoutubeVideosUrl) || DEFAULT_YOUTUBE_VIDEOS_URL,
  youtubeChannelId: String(env.socialYoutubeChannelId || DEFAULT_YOUTUBE_CHANNEL_ID).trim(),
  blogUrl: normalizeUrl(env.socialBlogUrl) || DEFAULT_BLOG_URL,
  blogRssUrl: normalizeUrl(env.socialBlogRssUrl) || DEFAULT_BLOG_RSS_URL,
  instagramUrl: normalizeUrl(env.socialInstagramUrl) || DEFAULT_INSTAGRAM_URL,
  cacheSeconds: Number(env.socialFeedCacheSeconds) > 0 ? Number(env.socialFeedCacheSeconds) : 300,
  fetchTimeoutMs: Number(env.socialFetchTimeoutMs) > 0 ? Number(env.socialFetchTimeoutMs) : DEFAULT_FETCH_TIMEOUT_MS,
};

const SOURCE_DEFAULTS = {
  youtube: {
    label: "유튜브 최신 영상",
    title: "유튜브 채널 바로가기",
    url: socialConfig.youtubeVideosUrl,
  },
  blog: {
    label: "네이버 블로그 최신 글",
    title: "블로그 최신 게시글 확인하기",
    url: socialConfig.blogUrl,
  },
  instagram: {
    label: "인스타 최신 게시글",
    title: "인스타그램 프로필 바로가기",
    url: socialConfig.instagramUrl,
  },
};

let socialCache = {
  expiresAt: 0,
  payload: null,
  loadedPersistedOnce: false,
};
let refreshPromise = null;

function normalizeUrl(value) {
  const text = decodeHtmlEntities(String(value || "").trim());
  if (!text) return "";
  if (text.startsWith("http://") || text.startsWith("https://")) return text;
  return `https://${text}`;
}

function decodeHtmlEntities(text) {
  if (!text) return "";
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16) || 0))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code) || 0));
}

function cleanupText(text) {
  if (!text) return "";
  const noTags = String(text).replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(noTags).replace(/\s+/g, " ").trim();
}

function stripCdata(text) {
  return String(text || "").replace(/^<!\[CDATA\[(.*)\]\]>$/is, "$1");
}

function parseTag(content, tagName) {
  const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const match = String(content || "").match(regex);
  if (!match) return "";
  return cleanupText(stripCdata(match[1]));
}

function safeDate(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text || text === "0" || text.startsWith("0000-00-00")) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function toMysqlDateTime(value) {
  const iso = safeDate(value) || new Date().toISOString();
  return iso.slice(0, 19).replace("T", " ");
}

function getYoutubeVideoIdFromUrl(url) {
  const text = String(url || "");
  if (!text) return "";
  const match = text.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || text.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  return match?.[1] || "";
}

function getYoutubeThumbnailByVideoId(videoId) {
  if (!videoId) return "";
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function buildFallbackItem(source) {
  const fallback = SOURCE_DEFAULTS[source];
  return {
    source,
    label: fallback.label,
    title: fallback.title,
    url: fallback.url,
    publishedAt: "",
    excerpt: "",
    thumbnail: "",
    isLive: false,
  };
}

function buildFallbackPayload() {
  return {
    updatedAt: new Date().toISOString(),
    items: SOURCE_ORDER.map((source) => buildFallbackItem(source)),
  };
}

function normalizePersistedItem(row) {
  const source = String(row?.source || "").toLowerCase();
  if (!SOURCE_DEFAULTS[source]) return null;
  return {
    source,
    label: SOURCE_DEFAULTS[source].label,
    title: cleanupText(row?.title || SOURCE_DEFAULTS[source].title),
    url: normalizeUrl(row?.url) || SOURCE_DEFAULTS[source].url,
    publishedAt: safeDate(row?.publishedAt),
    excerpt: cleanupText(row?.excerpt || ""),
    thumbnail: normalizeUrl(row?.thumbnail),
    isLive: Boolean(Number(row?.isLive ?? 0)),
  };
}

function isPayloadStale(payload, now = Date.now()) {
  const updatedAt = Date.parse(String(payload?.updatedAt || ""));
  if (Number.isNaN(updatedAt)) return true;
  return now - updatedAt > socialConfig.cacheSeconds * 1000;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), socialConfig.fetchTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseRssFirstEntry(xmlText) {
  const xml = String(xmlText || "");
  if (!xml) return null;

  const atomEntryMatch = xml.match(/<entry\b[^>]*>([\s\S]*?)<\/entry>/i);
  if (atomEntryMatch) {
    const entry = atomEntryMatch[1];
    const title = parseTag(entry, "title");
    const publishedAt = safeDate(parseTag(entry, "published") || parseTag(entry, "updated"));
    const linkMatch = entry.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
    const fallbackLink = parseTag(entry, "id");
    const url = normalizeUrl(linkMatch?.[1] || fallbackLink);
    const thumbnailMatch =
      entry.match(/<media:thumbnail\b[^>]*url=["']([^"']+)["'][^>]*>/i) ||
      entry.match(/<media:content\b[^>]*url=["']([^"']+)["'][^>]*>/i);
    const thumbnail =
      normalizeUrl(thumbnailMatch?.[1]) || getYoutubeThumbnailByVideoId(getYoutubeVideoIdFromUrl(url));

    return { title, url, publishedAt, thumbnail, isLive: true };
  }

  const rssItemMatch = xml.match(/<item\b[^>]*>([\s\S]*?)<\/item>/i);
  if (!rssItemMatch) return null;

  const item = rssItemMatch[1];
  const title = parseTag(item, "title");
  const publishedAt = safeDate(parseTag(item, "pubDate") || parseTag(item, "dc:date"));
  const url = normalizeUrl(parseTag(item, "link"));
  const excerpt = parseTag(item, "description");
  const mediaThumbnailMatch = item.match(/<media:thumbnail\b[^>]*url=["']([^"']+)["'][^>]*>/i);
  const thumbnail = normalizeUrl(mediaThumbnailMatch?.[1]);

  return { title, url, publishedAt, excerpt, thumbnail, isLive: true };
}

function parseYoutubeChannelId(html) {
  const text = String(html || "");
  if (!text) return "";
  const patterns = [
    /"channelId":"(UC[a-zA-Z0-9_-]{20,})"/,
    /"externalId":"(UC[a-zA-Z0-9_-]{20,})"/,
    /"browseId":"(UC[a-zA-Z0-9_-]{20,})"/,
    /youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function parseYoutubeFallbackFromHtml(html, channelUrl) {
  const text = String(html || "");
  const idMatch = text.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
  if (!idMatch?.[1]) return null;

  const videoId = idMatch[1];
  const titleMatch = text.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);
  const title = cleanupText(titleMatch?.[1] || SOURCE_DEFAULTS.youtube.title);

  return {
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt: "",
    excerpt: "",
    thumbnail: getYoutubeThumbnailByVideoId(videoId),
    fallbackUrl: channelUrl,
    isLive: true,
  };
}

function parseInstagramLatest(html, profileUrl) {
  const text = String(html || "");
  if (!text) return null;

  const shortcodeMatch = text.match(/"shortcode":"([a-zA-Z0-9_-]{5,})"/);
  const captionMatch = text.match(/"accessibility_caption":"([^"]+)"/);
  const ogDescMatch = text.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  const ogTitleMatch = text.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  const ogImageMatch = text.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);

  const titleBase = cleanupText(captionMatch?.[1] || ogDescMatch?.[1] || SOURCE_DEFAULTS.instagram.title);
  const profileTitle = cleanupText(ogTitleMatch?.[1] || "")
    .replace(/\s*(?:\u00B7)\s*Instagram photos and videos$/i, "")
    .trim();
  const title = titleBase.length > 92 ? `${titleBase.slice(0, 92)}...` : titleBase;
  const thumbnail = normalizeUrl(ogImageMatch?.[1]);

  if (shortcodeMatch?.[1]) {
    return {
      title,
      url: `https://www.instagram.com/p/${shortcodeMatch[1]}/`,
      publishedAt: "",
      excerpt: "",
      thumbnail,
      fallbackUrl: profileUrl,
      isLive: true,
    };
  }

  const fallbackTitle = profileTitle || title || SOURCE_DEFAULTS.instagram.title;
  return {
    title: fallbackTitle,
    url: profileUrl,
    publishedAt: "",
    excerpt: "",
    thumbnail,
    fallbackUrl: profileUrl,
    isLive: true,
  };
}

function toSourceItem(source, label, baseUrl, entry, fallbackTitle) {
  return {
    source,
    label,
    title: cleanupText(entry?.title || fallbackTitle),
    url: normalizeUrl(entry?.url) || baseUrl,
    publishedAt: safeDate(entry?.publishedAt),
    excerpt: cleanupText(entry?.excerpt || ""),
    thumbnail: normalizeUrl(entry?.thumbnail),
    isLive: Boolean(entry?.isLive),
  };
}

async function fetchYouTubeLatest() {
  const tryFeedByChannelId = async (channelId) => {
    if (!channelId) return null;
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    const feedXml = await fetchText(feedUrl);
    const entry = parseRssFirstEntry(feedXml);
    return entry?.url ? entry : null;
  };

  try {
    const primary = await tryFeedByChannelId(socialConfig.youtubeChannelId);
    if (primary) return primary;
  } catch {
    // Continue with fallback parsing.
  }

  const channelPageHtml = await fetchText(socialConfig.youtubeVideosUrl);
  const parsedChannelId = parseYoutubeChannelId(channelPageHtml);

  if (parsedChannelId && parsedChannelId !== socialConfig.youtubeChannelId) {
    try {
      const secondary = await tryFeedByChannelId(parsedChannelId);
      if (secondary) return secondary;
    } catch {
      // Continue with HTML fallback.
    }
  }

  return parseYoutubeFallbackFromHtml(channelPageHtml, socialConfig.youtubeVideosUrl);
}

async function fetchBlogLatest() {
  const feedXml = await fetchText(socialConfig.blogRssUrl);
  const entry = parseRssFirstEntry(feedXml);
  if (!entry) {
    return {
      title: SOURCE_DEFAULTS.blog.title,
      url: socialConfig.blogUrl,
      publishedAt: "",
      excerpt: "",
      thumbnail: "",
      isLive: false,
    };
  }
  return entry;
}

async function fetchInstagramLatest() {
  const html = await fetchText(socialConfig.instagramUrl);
  const parsed = parseInstagramLatest(html, socialConfig.instagramUrl);
  if (parsed?.url) return parsed;
  return {
    title: SOURCE_DEFAULTS.instagram.title,
    url: socialConfig.instagramUrl,
    publishedAt: "",
    excerpt: "",
    thumbnail: "",
    isLive: false,
  };
}

async function fetchSourceSafely(fetcher, fallback) {
  try {
    const result = await fetcher();
    if (result?.url) return result;
    return fallback;
  } catch (error) {
    return { ...fallback, error: error?.message || "fetch failed" };
  }
}

async function collectFreshPayload() {
  const [youtubeRaw, blogRaw, instagramRaw] = await Promise.all([
    fetchSourceSafely(fetchYouTubeLatest, {
      title: SOURCE_DEFAULTS.youtube.title,
      url: socialConfig.youtubeVideosUrl,
      publishedAt: "",
      excerpt: "",
      thumbnail: "",
      isLive: false,
    }),
    fetchSourceSafely(fetchBlogLatest, {
      title: SOURCE_DEFAULTS.blog.title,
      url: socialConfig.blogUrl,
      publishedAt: "",
      excerpt: "",
      thumbnail: "",
      isLive: false,
    }),
    fetchSourceSafely(fetchInstagramLatest, {
      title: SOURCE_DEFAULTS.instagram.title,
      url: socialConfig.instagramUrl,
      publishedAt: "",
      excerpt: "",
      thumbnail: "",
      isLive: false,
    }),
  ]);

  return {
    updatedAt: new Date().toISOString(),
    items: [
      toSourceItem(
        "youtube",
        SOURCE_DEFAULTS.youtube.label,
        socialConfig.youtubeVideosUrl,
        youtubeRaw,
        SOURCE_DEFAULTS.youtube.title
      ),
      toSourceItem("blog", SOURCE_DEFAULTS.blog.label, socialConfig.blogUrl, blogRaw, SOURCE_DEFAULTS.blog.title),
      toSourceItem(
        "instagram",
        SOURCE_DEFAULTS.instagram.label,
        socialConfig.instagramUrl,
        instagramRaw,
        SOURCE_DEFAULTS.instagram.title
      ),
    ],
  };
}

async function loadPayloadFromDatabase() {
  const rows = await query(
    `SELECT
      source,
      label,
      title,
      url,
      published_at AS publishedAt,
      excerpt,
      thumbnail,
      is_live AS isLive,
      updated_at AS updatedAt
    FROM social_feed_cache`
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const bySource = new Map();
  let latestUpdatedAt = "";
  for (const row of rows) {
    const item = normalizePersistedItem(row);
    if (!item) continue;
    bySource.set(item.source, item);
    const updatedAt = safeDate(row?.updatedAt);
    if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) {
      latestUpdatedAt = updatedAt;
    }
  }

  if (bySource.size === 0) return null;

  return {
    updatedAt: latestUpdatedAt || new Date().toISOString(),
    items: SOURCE_ORDER.map((source) => bySource.get(source) || buildFallbackItem(source)),
  };
}

async function savePayloadToDatabase(payload) {
  const updatedAt = toMysqlDateTime(payload?.updatedAt);
  for (const source of SOURCE_ORDER) {
    const item = payload?.items?.find((entry) => entry?.source === source) || buildFallbackItem(source);
    await query(
      `INSERT INTO social_feed_cache (
        source,
        label,
        title,
        url,
        published_at,
        excerpt,
        thumbnail,
        is_live,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        label = VALUES(label),
        title = VALUES(title),
        url = VALUES(url),
        published_at = VALUES(published_at),
        excerpt = VALUES(excerpt),
        thumbnail = VALUES(thumbnail),
        is_live = VALUES(is_live),
        updated_at = VALUES(updated_at)`,
      [
        source,
        cleanupText(item.label || SOURCE_DEFAULTS[source].label),
        cleanupText(item.title || SOURCE_DEFAULTS[source].title),
        normalizeUrl(item.url) || SOURCE_DEFAULTS[source].url,
        item.publishedAt ? toMysqlDateTime(item.publishedAt) : null,
        cleanupText(item.excerpt || ""),
        normalizeUrl(item.thumbnail),
        item.isLive ? 1 : 0,
        updatedAt,
      ]
    );
  }
}

function refreshInBackground() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const freshPayload = await collectFreshPayload();
    await savePayloadToDatabase(freshPayload);

    socialCache = {
      expiresAt: Date.now() + socialConfig.cacheSeconds * 1000,
      payload: freshPayload,
      loadedPersistedOnce: true,
    };
    return freshPayload;
  })()
    .catch(() => {
      return socialCache.payload || buildFallbackPayload();
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function getBrandSocialLatest() {
  const now = Date.now();
  if (socialCache.payload) {
    if (socialCache.expiresAt <= now) {
      void refreshInBackground();
    }
    return socialCache.payload;
  }

  if (!socialCache.loadedPersistedOnce) {
    const persistedPayload = await loadPayloadFromDatabase();
    socialCache.loadedPersistedOnce = true;
    if (persistedPayload) {
      socialCache = {
        expiresAt: now + socialConfig.cacheSeconds * 1000,
        payload: persistedPayload,
        loadedPersistedOnce: true,
      };
      if (isPayloadStale(persistedPayload, now)) {
        void refreshInBackground();
      }
      return persistedPayload;
    }
  }

  const fallbackPayload = buildFallbackPayload();
  socialCache = {
    expiresAt: now + socialConfig.cacheSeconds * 1000,
    payload: fallbackPayload,
    loadedPersistedOnce: true,
  };
  void refreshInBackground();
  return fallbackPayload;
}

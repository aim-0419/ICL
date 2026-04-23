import { env } from "../../../config/env.js";

export const PLAYBACK_SESSION_STATUS = {
  active: "active",
  revoked: "revoked",
  expired: "expired",
};

export const HEARTBEAT_INTERVAL_SEC = 15;

export const PLAYBACK_TOKEN_TTL_SEC = Math.max(
  300,
  Math.round(Number(env.academyPlaybackTokenTtlSec) || 3600)
);

export const PLAYBACK_TOKEN_SECRET = String(
  env.academyPlaybackTokenSecret || `${env.dbName}-academy-playback-secret`
).trim();


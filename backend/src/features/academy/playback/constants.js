// 파일 역할: 아카데미 영상 보안 재생을 위한 세션, 토큰, 파일 경로 처리 로직을 담당합니다.
import { env } from "../../../config/env.js";

// 상수 역할: 재생 세션이 가질 수 있는 상태값을 모아 둡니다.
export const PLAYBACK_SESSION_STATUS = {
  active: "active",
  revoked: "revoked",
  expired: "expired",
};

// 상수 역할: 영상 재생 중 세션 갱신을 요청할 기본 간격입니다.
export const HEARTBEAT_INTERVAL_SEC = 15;

// 상수 역할: 재생 토큰이 유효한 시간을 초 단위로 계산합니다.
export const PLAYBACK_TOKEN_TTL_SEC = Math.max(
  300,
  Math.round(Number(env.academyPlaybackTokenTtlSec) || 3600)
);

// 상수 역할: 재생 토큰 서명에 사용할 비밀키를 환경 변수에서 읽습니다.
export const PLAYBACK_TOKEN_SECRET = String(
  env.academyPlaybackTokenSecret || `${env.dbName}-academy-playback-secret`
).trim();


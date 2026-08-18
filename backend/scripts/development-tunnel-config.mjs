// 파일 역할: 개발 SSH 터널 설정을 읽어 검증하고 ssh 실행 인자를 만듭니다.
// 회사 Windows와 집의 macOS가 같은 AWS 개발 환경에 접속하기 위한 공용 설정입니다.
// 이 파일의 검증은 터널이 운영 환경으로 향하는 것을 막는 마지막 방어선입니다.
// 개발이 아닌 DB 이름, 개발이 아닌 RDS endpoint, 약속된 포트가 아닌 값은 모두 거부합니다.
import os from "node:os";
import path from "node:path";

const HOST_PATTERN = /^[a-z0-9.-]+$/i;
const ALLOWED_MODES = new Set(["api", "db"]);

// 함수 역할: 포트 문자열을 정수로 바꾸고, 정수가 아니면 0을 돌려 검증에서 걸리게 합니다.
function normalizePort(value, fallback) {
  const port = Number(value || fallback);
  return Number.isInteger(port) ? port : 0;
}

// 함수 역할: `~/키파일.pem` 같은 홈 디렉터리 경로를 절대 경로로 바꿉니다.
// Windows의 `~\`와 macOS의 `~/`를 모두 처리하므로, 두 컴퓨터가 같은 설정값을 쓸 수 있습니다.
export function expandHomePath(value, homeDirectory = os.homedir()) {
  const normalized = String(value || "").trim();
  if (normalized === "~") return homeDirectory;
  if (normalized.startsWith("~/") || normalized.startsWith("~\\")) {
    return path.join(homeDirectory, normalized.slice(2));
  }
  return path.resolve(normalized);
}

// 함수 역할: 터널 설정값을 정규화하고 개발 환경 조건을 모두 만족하는지 검사합니다.
// api 모드는 프론트엔드 작업용으로 개발 EC2의 백엔드 4001을 로컬 4001로 당겨옵니다.
// db 모드는 백엔드를 로컬에서 실행할 때 개발 RDS 3306을 로컬 13306으로 당겨옵니다.
// 하나라도 어긋나면 ssh를 실행하지 않고 이유를 모아서 예외로 던집니다.
export function resolveDevelopmentTunnelConfig(environment, mode) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (!ALLOWED_MODES.has(normalizedMode)) {
    throw new Error("[dev-tunnel] mode must be api or db");
  }

  const config = {
    mode: normalizedMode,
    environment: String(environment.ICL_DEV_ENVIRONMENT || "").trim().toLowerCase(),
    databaseName: String(environment.ICL_DEV_DATABASE_NAME || "").trim(),
    sshHost: String(environment.ICL_DEV_SSH_HOST || "").trim(),
    sshUser: String(environment.ICL_DEV_SSH_USER || "").trim(),
    sshKeyPath: expandHomePath(environment.ICL_DEV_SSH_KEY_PATH),
    apiLocalPort: normalizePort(environment.ICL_DEV_API_LOCAL_PORT, 4001),
    apiRemoteHost: String(environment.ICL_DEV_API_REMOTE_HOST || "127.0.0.1").trim(),
    apiRemotePort: normalizePort(environment.ICL_DEV_API_REMOTE_PORT, 4001),
    dbLocalPort: normalizePort(environment.ICL_DEV_DB_LOCAL_PORT, 13306),
    dbRemoteHost: String(environment.ICL_DEV_DB_REMOTE_HOST || "").trim(),
    dbRemotePort: normalizePort(environment.ICL_DEV_DB_REMOTE_PORT, 3306),
  };

  const errors = [];
  if (config.environment !== "development") errors.push("environment must be development");
  if (config.databaseName !== "homepage_dev") errors.push("database must be homepage_dev");
  if (!HOST_PATTERN.test(config.sshHost)) errors.push("development SSH host is invalid");
  if (!/^[a-z0-9._-]+$/i.test(config.sshUser)) errors.push("development SSH user is invalid");
  if (!config.sshKeyPath) errors.push("development SSH key path is required");
  if (config.apiLocalPort !== 4001 || config.apiRemotePort !== 4001) {
    errors.push("development API tunnel must use port 4001");
  }
  if (config.apiRemoteHost !== "127.0.0.1") {
    errors.push("development API tunnel must target EC2 loopback");
  }
  if (config.dbLocalPort !== 13306 || config.dbRemotePort !== 3306) {
    errors.push("development DB tunnel must map local 13306 to remote 3306");
  }
  if (
    !HOST_PATTERN.test(config.dbRemoteHost) ||
    !/dev/i.test(config.dbRemoteHost) ||
    !/\.rds\.amazonaws\.com$/i.test(config.dbRemoteHost)
  ) {
    errors.push("development DB host must be an AWS RDS development endpoint");
  }

  if (errors.length > 0) {
    throw new Error(`[dev-tunnel] ${errors.join("; ")}`);
  }

  return config;
}

// 함수 역할: 검증을 통과한 설정으로 ssh 포트포워딩 인자 배열을 만듭니다.
// -N -T는 원격 셸을 열지 않고 포워딩만 하겠다는 뜻이고,
// ExitOnForwardFailure=yes는 포워딩이 실패하면 조용히 붙어 있지 않고 즉시 끊기게 합니다.
// 포워딩 주소를 127.0.0.1로 묶어 같은 네트워크의 다른 기기가 터널에 붙지 못하게 합니다.
export function buildDevelopmentSshArgs(config) {
  const forward = config.mode === "api"
    ? `127.0.0.1:${config.apiLocalPort}:${config.apiRemoteHost}:${config.apiRemotePort}`
    : `127.0.0.1:${config.dbLocalPort}:${config.dbRemoteHost}:${config.dbRemotePort}`;

  return [
    "-N",
    "-T",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ServerAliveInterval=60",
    "-o",
    "ServerAliveCountMax=3",
    "-i",
    config.sshKeyPath,
    "-L",
    forward,
    `${config.sshUser}@${config.sshHost}`,
  ];
}

// 함수 역할: 현재 모드에서 로컬에 열리는 포트를 돌려줍니다. 포트 선점 검사에 사용합니다.
export function developmentTunnelLocalPort(config) {
  return config.mode === "api" ? config.apiLocalPort : config.dbLocalPort;
}

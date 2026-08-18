// 파일 역할: 개발 환경 포트포워딩 설정을 읽어 검증하고 AWS SSM 실행 인자를 만듭니다.
// 회사 Windows와 집의 macOS가 같은 AWS 개발 환경에 접속하기 위한 공용 설정입니다.
//
// SSH가 아니라 SSM Session Manager를 쓰는 이유:
// 개발 EC2의 22번 포트를 열 필요가 없고, 노트북마다 개인키를 두지 않아도 되며,
// 접속 위치가 바뀌어도 보안 그룹에 IP를 다시 등록할 필요가 없습니다.
//
// 이 파일의 검증은 터널이 운영 환경으로 향하는 것을 막는 마지막 방어선입니다.
// 개발이 아닌 DB 이름, 개발이 아닌 RDS endpoint, 약속된 포트가 아닌 값은 모두 거부합니다.

// api 모드는 개발 EC2 자신의 포트를 당겨오므로 인스턴스 대상 문서를 씁니다.
const API_DOCUMENT_NAME = "AWS-StartPortForwardingSession";
// db 모드는 EC2를 경유해 RDS로 나가므로 원격 호스트 대상 문서를 씁니다.
const DB_DOCUMENT_NAME = "AWS-StartPortForwardingSessionToRemoteHost";

const HOST_PATTERN = /^[a-z0-9.-]+$/i;
const REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d$/;
const INSTANCE_ID_PATTERN = /^i-[0-9a-f]{8,17}$/;
const ALLOWED_MODES = new Set(["api", "db"]);

// 함수 역할: 포트 문자열을 정수로 바꾸고, 정수가 아니면 0을 돌려 검증에서 걸리게 합니다.
function normalizePort(value, fallback) {
  const port = Number(value || fallback);
  return Number.isInteger(port) ? port : 0;
}

// 함수 역할: 터널 설정값을 정규화하고 개발 환경 조건을 모두 만족하는지 검사합니다.
// api 모드는 프론트엔드 작업용으로 개발 EC2의 백엔드 4001을 로컬 4001로 당겨옵니다.
// db 모드는 백엔드를 로컬에서 실행할 때 개발 RDS 3306을 로컬 13306으로 당겨옵니다.
// 하나라도 어긋나면 세션을 열지 않고 이유를 모아서 예외로 던집니다.
export function resolveDevelopmentTunnelConfig(environment, mode) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (!ALLOWED_MODES.has(normalizedMode)) {
    throw new Error("[dev-tunnel] mode must be api or db");
  }

  const config = {
    mode: normalizedMode,
    environment: String(environment.ICL_DEV_ENVIRONMENT || "").trim().toLowerCase(),
    databaseName: String(environment.ICL_DEV_DATABASE_NAME || "").trim(),
    awsRegion: String(environment.ICL_DEV_AWS_REGION || "").trim().toLowerCase(),
    instanceId: String(environment.ICL_DEV_INSTANCE_ID || "").trim().toLowerCase(),
    apiLocalPort: normalizePort(environment.ICL_DEV_API_LOCAL_PORT, 4001),
    apiRemotePort: normalizePort(environment.ICL_DEV_API_REMOTE_PORT, 4001),
    dbLocalPort: normalizePort(environment.ICL_DEV_DB_LOCAL_PORT, 13306),
    dbRemoteHost: String(environment.ICL_DEV_DB_REMOTE_HOST || "").trim(),
    dbRemotePort: normalizePort(environment.ICL_DEV_DB_REMOTE_PORT, 3306),
  };

  const errors = [];
  if (config.environment !== "development") errors.push("environment must be development");
  if (config.databaseName !== "homepage_dev") errors.push("database must be homepage_dev");
  if (!REGION_PATTERN.test(config.awsRegion)) errors.push("development AWS region is invalid");
  if (!INSTANCE_ID_PATTERN.test(config.instanceId)) errors.push("development instance id is invalid");
  if (config.apiLocalPort !== 4001 || config.apiRemotePort !== 4001) {
    errors.push("development API tunnel must use port 4001");
  }
  if (config.dbLocalPort !== 13306 || config.dbRemotePort !== 3306) {
    errors.push("development DB tunnel must map local 13306 to remote 3306");
  }
  // db 모드에서만 RDS로 나가므로, RDS endpoint 검사도 db 모드에서만 의미가 있습니다.
  // 다만 설정 파일 자체가 잘못된 것을 일찍 알리기 위해 모드와 무관하게 검사합니다.
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

// 함수 역할: SSM 문서에 넘길 파라미터 객체를 만듭니다.
// SSM 파라미터는 값이 항상 문자열 배열이어야 하므로 숫자도 문자열로 넣습니다.
export function buildDevelopmentSessionParameters(config) {
  if (config.mode === "api") {
    return {
      portNumber: [String(config.apiRemotePort)],
      localPortNumber: [String(config.apiLocalPort)],
    };
  }

  return {
    host: [config.dbRemoteHost],
    portNumber: [String(config.dbRemotePort)],
    localPortNumber: [String(config.dbLocalPort)],
  };
}

// 함수 역할: 검증을 통과한 설정으로 `aws ssm start-session` 인자 배열을 만듭니다.
// shell 없이 그대로 spawn에 넘기므로 JSON 파라미터를 따옴표로 감쌀 필요가 없습니다.
export function buildDevelopmentSessionArgs(config) {
  return [
    "ssm",
    "start-session",
    "--region",
    config.awsRegion,
    "--target",
    config.instanceId,
    "--document-name",
    config.mode === "api" ? API_DOCUMENT_NAME : DB_DOCUMENT_NAME,
    "--parameters",
    JSON.stringify(buildDevelopmentSessionParameters(config)),
  ];
}

// 함수 역할: 현재 모드에서 로컬에 열리는 포트를 돌려줍니다. 포트 선점 검사에 사용합니다.
export function developmentTunnelLocalPort(config) {
  return config.mode === "api" ? config.apiLocalPort : config.dbLocalPort;
}

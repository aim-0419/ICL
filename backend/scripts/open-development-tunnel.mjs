// 파일 역할: 검증된 설정으로 AWS SSM 세션을 띄워 개발 환경 포트포워딩을 열고 유지합니다.
// `npm run tunnel:dev:api`는 프론트엔드 작업용, `npm run tunnel:dev:db`는 백엔드 작업용입니다.
//
// 사전 준비물은 AWS CLI, Session Manager plugin, 그리고 ssm:StartSession 권한이 있는
// AWS 자격증명입니다. 개발 EC2의 22번 포트나 개인키 파일은 필요하지 않습니다.
// 접속 위치가 바뀌어도 보안 그룹을 수정할 필요가 없습니다.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

import dotenv from "dotenv";

import {
  buildDevelopmentSessionArgs,
  developmentTunnelLocalPort,
  resolveDevelopmentTunnelConfig,
} from "./development-tunnel-config.mjs";

const mode = String(process.argv[2] || "").trim().toLowerCase();
const configPath = path.resolve(process.env.ICL_DEV_TUNNEL_ENV_FILE || ".env.development.tunnel");

if (!fs.existsSync(configPath)) {
  console.error("[dev-tunnel] .env.development.tunnel is required");
  process.exit(1);
}

// 설정 파일을 먼저 읽고, 같은 이름의 환경 변수가 있으면 그 값으로 덮어씁니다.
// 한 번만 다른 값으로 열어보고 싶을 때 파일을 고치지 않고 시험할 수 있습니다.
const fileEnvironment = dotenv.parse(fs.readFileSync(configPath));
const environment = { ...fileEnvironment };
for (const key of Object.keys(fileEnvironment)) {
  if (process.env[key]) environment[key] = process.env[key];
}

let config;
try {
  config = resolveDevelopmentTunnelConfig(environment, mode);
} catch (error) {
  console.error(error?.message || "[dev-tunnel] invalid development tunnel configuration");
  process.exit(1);
}

// 함수 역할: 로컬 포트가 비어 있는지 확인합니다.
// 이미 다른 터널이 열려 있으면 세션이 조용히 실패해 원인을 찾기 어려우므로 미리 막습니다.
function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => reject(new Error(`[dev-tunnel] local port ${port} is already in use`)));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(resolve);
    });
  });
}

const localPort = developmentTunnelLocalPort(config);
try {
  await assertPortAvailable(localPort);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(
  `[dev-tunnel] opening ${config.mode} tunnel on 127.0.0.1:${localPort} for the approved development environment`,
);
console.log("[dev-tunnel] keep this terminal open; press Ctrl+C to close the tunnel");

// shell: false로 두어 설정값이 셸 명령으로 해석되지 않게 합니다.
// 덕분에 --parameters JSON을 따옴표 없이 인자 하나로 그대로 넘길 수 있습니다.
const child = spawn("aws", buildDevelopmentSessionArgs(config), {
  shell: false,
  stdio: "inherit",
  windowsHide: true,
});

child.once("error", (error) => {
  if (error?.code === "ENOENT") {
    console.error("[dev-tunnel] AWS CLI를 찾지 못했습니다. AWS CLI와 Session Manager plugin을 설치하세요.");
  } else {
    console.error("[dev-tunnel] failed to start the AWS CLI session");
  }
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});

// Ctrl+C로 이 프로세스를 끝낼 때 세션이 남지 않도록 자식 프로세스도 같이 정리합니다.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    child.kill(signal);
  });
}

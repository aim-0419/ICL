// 네이티브 폴더를 Git에 보관하지 않아도 새 개발 환경에서 동일하게 재생성합니다.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const platforms = ["android", "ios"];
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

for (const platform of platforms) {
  const platformPath = path.resolve(platform);
  if (fs.existsSync(platformPath)) {
    console.log(`[capacitor] ${platform} 프로젝트 확인 완료`);
    continue;
  }

  console.log(`[capacitor] ${platform} 프로젝트를 생성합니다.`);
  const result = spawnSync(npxCommand, ["cap", "add", platform], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`[capacitor] ${platform} 프로젝트 생성에 실패했습니다.`);
    process.exit(result.status || 1);
  }
}

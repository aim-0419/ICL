/**
 * [iOS Universal Link 검증 파일 생성]
 *
 * 이 파일이 서비스 도메인에 있어야 https 링크를 눌렀을 때 사파리 대신 앱이 열립니다.
 * Android 의 assetlinks.json 에 해당하는 iOS 쪽 파일입니다.
 *
 * Apple 개발자 계정의 Team ID 가 필요합니다.
 * Apple Developer 사이트 Membership 페이지에서 확인할 수 있는 10자리 값입니다.
 *
 *   npm run aasa -- --team-id ABCDE12345
 *
 * ⚠ 이 파일은 확장자가 없어서 웹 서버가 기본적으로 application/json 으로
 *   내려보내지 않습니다. iOS 는 application/json 을 요구하므로 배포 서버에
 *   별도 설정이 필요합니다. 자세한 내용은 docs/development/mobile-app-setup.md 참고.
 */
import fs from "node:fs";
import path from "node:path";

import { loadAppEnvironment } from "./app-env.mjs";

const BUNDLE_ID = "com.iclpilates.app";
const OUTPUT = path.resolve("public/.well-known/apple-app-site-association");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--team-id") args.teamId = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const teamId = String(args.teamId || "").trim().toUpperCase();

if (!teamId) {
  console.error(
    "[aasa] Apple Team ID 가 필요합니다.\n" +
      "  Apple Developer 사이트의 Membership 페이지에서 10자리 Team ID 를 확인해 주세요.\n" +
      "  npm run aasa -- --team-id ABCDE12345",
  );
  process.exit(1);
}

if (!/^[A-Z0-9]{10}$/.test(teamId)) {
  console.error("[aasa] Team ID 형식이 올바르지 않습니다. 영문 대문자와 숫자로 된 10자리여야 합니다.");
  process.exit(1);
}

const association = {
  applinks: {
    details: [
      {
        appIDs: [`${teamId}.${BUNDLE_ID}`],
        // 모든 경로를 앱으로 보냅니다. 앱은 허용된 경로만 내부 화면으로 바꿉니다.
        components: [{ "/": "*" }],
      },
    ],
  },
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(association, null, 2)}\n`, "utf8");

const hosts = String(loadAppEnvironment("production").VITE_APP_LINK_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

console.log(`[aasa] ${OUTPUT} 생성 완료`);
console.log(`[aasa] appID: ${teamId}.${BUNDLE_ID}`);
console.log("[aasa] 아래 호스트에서 https://<host>/.well-known/apple-app-site-association 이");
console.log("[aasa] application/json 으로 응답해야 합니다.");
for (const host of hosts) console.log(`  - ${host}`);

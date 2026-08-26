// Android App Link 검증 파일(/.well-known/assetlinks.json)을 생성합니다.
//
// 이 파일이 서비스 도메인에 있어야 https 링크를 눌렀을 때 브라우저 대신 앱이 열립니다.
// 지문은 keystore.properties 의 릴리스 키에서 뽑습니다.
//
// 주의: Play 앱 서명(Play App Signing)을 쓰면 최종 배포본은 Google 이 다시 서명하므로
// 여기서 뽑은 업로드 키 지문이 아니라 Play Console 의 "앱 서명 키 인증서" SHA-256 을 넣어야 합니다.
// 그 경우 --fingerprint 옵션으로 직접 지정하세요.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { loadAppEnvironment } from "./app-env.mjs";

const PACKAGE_NAME = "com.iclpilates.app";
const OUTPUT = path.resolve("public/.well-known/assetlinks.json");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--fingerprint") args.fingerprint = argv[i + 1];
  }
  return args;
}

function readKeystoreProperties() {
  const file = path.resolve("keystore.properties");
  if (!fs.existsSync(file)) return null;
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );
}

function readFingerprintFromKeystore(props) {
  // keytool 출력에서 SHA-256 줄만 뽑습니다. 비밀번호는 인자로만 넘기고 출력하지 않습니다.
  const output = execFileSync(
    "keytool",
    [
      "-list",
      "-v",
      "-keystore", props.storeFile,
      "-alias", props.keyAlias,
      "-storepass", props.storePassword,
    ],
    { encoding: "utf8" },
  );
  const match = output.match(/SHA256:\s*([0-9A-F:]{95})/i);
  if (!match) throw new Error("keystore 에서 SHA-256 지문을 찾지 못했습니다.");
  return match[1].toUpperCase();
}

const args = parseArgs(process.argv.slice(2));
let fingerprint = args.fingerprint;

if (!fingerprint) {
  const props = readKeystoreProperties();
  if (!props) {
    console.error(
      "[assetlinks] keystore.properties 가 없습니다.\n" +
        "  릴리스 keystore 를 먼저 만들거나, Play 앱 서명 키 지문을 직접 넘기세요:\n" +
        "  npm run assetlinks -- --fingerprint AA:BB:...:ZZ",
    );
    process.exit(1);
  }
  fingerprint = readFingerprintFromKeystore(props);
}

if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/i.test(fingerprint)) {
  console.error("[assetlinks] SHA-256 지문 형식이 올바르지 않습니다. 콜론으로 구분된 32바이트여야 합니다.");
  process.exit(1);
}

const statements = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: PACKAGE_NAME,
      sha256_cert_fingerprints: [fingerprint.toUpperCase()],
    },
  },
];

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(statements, null, 2)}\n`, "utf8");

const hosts = String(loadAppEnvironment("production").VITE_APP_LINK_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

console.log(`[assetlinks] ${OUTPUT} 생성 완료`);
console.log(`[assetlinks] package: ${PACKAGE_NAME}`);
console.log(`[assetlinks] 아래 호스트 각각에서 https://<host>/.well-known/assetlinks.json 으로 접근되어야 합니다.`);
for (const host of hosts) console.log(`  - ${host}`);

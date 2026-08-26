// 스토어 릴리스 전 프리플라이트.
// Firebase 설정, 앱 버전, 릴리스 서명, 빌드된 AAB 의 서명 여부까지 확인합니다.
// 미서명 AAB 는 gradle 빌드가 조용히 성공하므로 여기서 반드시 걸러야 합니다.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const problems = [];
const warnings = [];
const notes = [];

function exists(relativePath) {
  return fs.existsSync(path.resolve(relativePath));
}

// 1) Firebase 네이티브 설정
for (const file of ["android/app/google-services.json", "ios/App/App/GoogleService-Info.plist"]) {
  if (!exists(file)) problems.push(`Firebase 설정 파일이 없습니다: ${file} (푸시가 동작하지 않습니다)`);
}

// 2) 앱 버전 단일 소스
let version = null;
try {
  version = JSON.parse(fs.readFileSync(path.resolve("app-version.json"), "utf8"));
  if (!Number.isInteger(version.versionCode) || version.versionCode < 1) {
    problems.push("app-version.json 의 versionCode 는 1 이상의 정수여야 합니다.");
  }
  if (!/^\d+\.\d+(\.\d+)?$/.test(String(version.versionName || ""))) {
    problems.push("app-version.json 의 versionName 형식을 확인해 주세요. 예: 1.0.0");
  } else {
    notes.push(`앱 버전: ${version.versionName} (versionCode ${version.versionCode})`);
    notes.push("Play 에 이미 올린 versionCode 와 같으면 업로드가 거부됩니다. 올릴 때마다 1 이상 올리세요.");
  }
} catch {
  problems.push("app-version.json 을 읽을 수 없습니다. 네이티브 앱 버전의 단일 소스입니다.");
}

// 3) 릴리스 서명 설정
if (!exists("keystore.properties")) {
  problems.push(
    "frontend/keystore.properties 가 없어 릴리스가 미서명으로 빌드됩니다. " +
      "keystore.properties.example 을 복사해 설정하세요.",
  );
} else {
  const raw = fs.readFileSync(path.resolve("keystore.properties"), "utf8");
  const props = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );
  for (const key of ["storeFile", "storePassword", "keyAlias", "keyPassword"]) {
    if (!props[key]) problems.push(`keystore.properties 의 ${key} 값이 비어 있습니다.`);
  }
  if (props.storeFile && !fs.existsSync(props.storeFile)) {
    problems.push(`keystore 파일을 찾을 수 없습니다: ${props.storeFile}`);
  }
}

// 4) 생성된 릴리스 gradle 이 실제로 적용되는지
if (!exists("android/app/icl-release.gradle")) {
  problems.push("android/app/icl-release.gradle 이 없습니다. npm run cap:sync:prod 를 먼저 실행하세요.");
} else if (!fs.readFileSync(path.resolve("android/app/build.gradle"), "utf8").includes("icl-release.gradle")) {
  problems.push("android/app/build.gradle 이 icl-release.gradle 을 적용하지 않습니다.");
}

// 4-1) App Link 검증 파일
// 매니페스트에 autoVerify 를 넣어도 도메인에 assetlinks.json 이 없으면 링크가 앱으로 열리지 않습니다.
const assetlinksPath = path.resolve("public/.well-known/assetlinks.json");
if (!fs.existsSync(assetlinksPath)) {
  warnings.push(
    "public/.well-known/assetlinks.json 이 없어 https 링크가 앱으로 열리지 않습니다. " +
      "npm run assetlinks 로 생성하세요(Play 앱 서명 사용 시 Play Console 의 앱 서명 키 지문을 넣어야 합니다).",
  );
} else {
  try {
    const statements = JSON.parse(fs.readFileSync(assetlinksPath, "utf8"));
    const prints = statements?.[0]?.target?.sha256_cert_fingerprints || [];
    const valid = prints.filter((value) => /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/i.test(String(value)));
    if (valid.length === 0) problems.push("assetlinks.json 의 SHA-256 지문 형식이 올바르지 않습니다.");
    else notes.push(`App Link 지문 ${valid.length}개 확인 (${statements[0].target.package_name})`);
  } catch {
    problems.push("assetlinks.json 을 JSON 으로 읽을 수 없습니다.");
  }
}

// 4-2) iOS Universal Link 검증 파일
const aasaPath = path.resolve("public/.well-known/apple-app-site-association");
if (!fs.existsSync(aasaPath)) {
  warnings.push(
    "public/.well-known/apple-app-site-association 이 없어 iOS 에서 https 링크가 앱으로 열리지 않습니다. " +
      "npm run aasa -- --team-id <TeamID> 로 생성하세요.",
  );
} else {
  try {
    const association = JSON.parse(fs.readFileSync(aasaPath, "utf8"));
    const appIds = association?.applinks?.details?.[0]?.appIDs || [];
    if (appIds.length === 0) problems.push("apple-app-site-association 에 appIDs 가 없습니다.");
    else notes.push(`iOS Universal Link appID 확인 (${appIds.join(", ")})`);
  } catch {
    problems.push("apple-app-site-association 을 JSON 으로 읽을 수 없습니다.");
  }
  warnings.push(
    "apple-app-site-association 은 확장자가 없어 웹 서버가 application/json 으로 내려보내지 않습니다. " +
      "배포 서버에 별도 설정이 필요합니다(docs/development/mobile-app-setup.md 참고).",
  );
}

// 5) 이미 빌드된 AAB 가 있으면 실제로 서명됐는지 확인
const aabPath = path.resolve("android/app/build/outputs/bundle/release/app-release.aab");
if (fs.existsSync(aabPath)) {
  const builtAt = fs.statSync(aabPath).mtime.toISOString();
  let signed = false;
  try {
    // jarsigner 는 미서명 jar 에도 종료코드 0 을 반환하므로 출력 문구로 판정해야 합니다.
    const output = String(execFileSync("jarsigner", ["-verify", aabPath], { encoding: "utf8" }));
    signed = /jar verified/i.test(output);
    if (!signed && !/jar is unsigned/i.test(output)) {
      notes.push(output.trim().slice(0, 200));
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      warnings.push("jarsigner 를 찾을 수 없어 AAB 서명 검사를 건너뛰었습니다.");
      signed = null;
    } else {
      signed = false;
    }
  }
  if (signed === false) {
    problems.push(`빌드된 AAB 가 미서명입니다: ${aabPath} (빌드 시각 ${builtAt})`);
  } else if (signed === true) {
    notes.push(`AAB 서명 확인됨 (빌드 시각 ${builtAt})`);
  }
} else {
  warnings.push("빌드된 release AAB 가 없어 서명 검사를 건너뛰었습니다. gradlew bundleRelease 후 다시 실행하세요.");
}

for (const note of notes.filter(Boolean)) console.log(`[native-check] ${note}`);
for (const warning of warnings) console.warn(`[native-check] 주의: ${warning}`);

if (problems.length > 0) {
  console.error(`\n[native-check] 릴리스 준비가 끝나지 않았습니다.\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

console.log("[native-check] 릴리스 프리플라이트 통과");

// 파일 역할: Play Console 업로드용 서명 AAB 를 만드는 단일 진입점입니다.
//
// 흐름: keystore 확인 → cap sync production → gradlew bundleRelease
//
// keystore 확인을 맨 앞에 두는 이유: 서명 키가 없으면 몇 분짜리 sync·빌드를
// 다 돌린 뒤에야 미서명 AAB 가 나와 시간을 버립니다. 없으면 즉시 멈춥니다.
// 미서명 AAB 는 Play 에 올릴 수 없으므로 "일단 만들어 두는" 가치도 없습니다.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const frontendRoot = process.cwd();
const androidRoot = path.join(frontendRoot, "android");
const keystoreProperties = path.join(androidRoot, "keystore.properties");
const aabPath = path.join(androidRoot, "app", "build", "outputs", "bundle", "release", "app-release.aab");

// 1) 서명 키 확인 — 가장 먼저, 가장 시끄럽게.
if (!fs.existsSync(keystoreProperties)) {
  console.error("[release] 서명 키가 설정되지 않았습니다.");
  console.error("[release] frontend/android/keystore.properties 가 필요합니다.");
  console.error("[release] 생성 절차는 docs/AI_PROMPTS_ANDROID.md 부록 1(keystore 생성)을 따르세요.");
  console.error("[release] keystore 파일과 keystore.properties 는 절대 Git 에 커밋하지 마세요.");
  process.exit(1);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  if (result.error) {
    console.error(`[release] ${command} 실행 실패: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[release] ${command} ${args.join(" ")} 가 실패했습니다 (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

// 2) 운영 설정으로 웹 빌드 + 네이티브 sync.
//    dev sync 잔재(cleartext 허용 등)가 릴리즈에 섞이지 않도록 항상 production 으로 다시 sync 합니다.
run(process.execPath, ["scripts/run-capacitor-sync.mjs", "production"], frontendRoot);

// 3) 서명된 릴리즈 번들 생성. gradlew 는 OS 별 파일이 다릅니다.
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
run(path.join(androidRoot, gradlew), ["bundleRelease"], androidRoot);

// 4) 결과 보고.
if (!fs.existsSync(aabPath)) {
  console.error("[release] bundleRelease 는 끝났지만 AAB 산출물을 찾지 못했습니다.");
  process.exit(1);
}
const sizeMb = (fs.statSync(aabPath).size / (1024 * 1024)).toFixed(1);
console.log(`[release] 완료: ${path.relative(frontendRoot, aabPath)} (${sizeMb} MB)`);
console.log("[release] Play Console 내부 테스트 트랙에 업로드해 검증하세요.");

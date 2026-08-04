import fs from "node:fs";
import path from "node:path";

const requiredFiles = [
  "android/app/google-services.json",
  "ios/App/App/GoogleService-Info.plist",
];
const missing = requiredFiles.filter((file) => !fs.existsSync(path.resolve(file)));

if (missing.length > 0) {
  console.error(`[native-check] Firebase 설정 파일이 필요합니다.\n- ${missing.join("\n- ")}`);
  process.exit(1);
}

console.log("[native-check] Android/iOS Firebase 설정 파일 확인 완료");

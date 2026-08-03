import { loadAppEnvironment, validateAppEnvironment } from "./app-env.mjs";

const errors = validateAppEnvironment(loadAppEnvironment());

if (errors.length > 0) {
  console.error(`[app-build] 설정 오류\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log("[app-build] 앱 공개 환경 설정 확인 완료");

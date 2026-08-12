// 파일 역할: 데이터베이스를 초기화한 뒤 Express 서버를 지정 포트에서 실행합니다.
import { assertRuntimeEnvironment, env } from "./config/env.js";

assertRuntimeEnvironment();

// Import DB-backed modules only after the environment/DB pairing is verified.
const [
  { createApp },
  { startAcademyPublishScheduler },
  { ensureInitialized },
] = await Promise.all([
  import("./app.js"),
  import("./features/academy/academy.publish.scheduler.js"),
  import("./shared/db/mysql.js"),
]);

const app = createApp();

ensureInitialized()
  .then(() => {
    if (env.academyPublishSchedulerEnabled && !env.testSafeMode) {
      startAcademyPublishScheduler();
    } else {
      console.log("[academy-scheduler] disabled by safety settings");
    }

    app.listen(env.port, () => {
      console.log(`[backend] API server running at http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error("[backend] DB initialization failed, aborting startup:", error?.message || error);
    process.exit(1);
  });

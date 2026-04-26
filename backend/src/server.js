// 파일 역할: 데이터베이스를 초기화한 뒤 Express 서버를 지정 포트에서 실행합니다.
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startAcademyPublishScheduler } from "./features/academy/academy.publish.scheduler.js";
import { ensureInitialized } from "./shared/db/mysql.js";

const app = createApp();

ensureInitialized()
  .then(() => {
    startAcademyPublishScheduler();
    app.listen(env.port, () => {
      console.log(`[backend] API server running at http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error("[backend] DB initialization failed, aborting startup", error);
    process.exit(1);
  });

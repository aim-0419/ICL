import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startAcademyPublishScheduler } from "./features/academy/academy.publish.scheduler.js";
import { startNotificationScheduler } from "./features/sms/notification.scheduler.js";
import { ensureInitialized } from "./shared/db/mysql.js";

const app = createApp();

ensureInitialized()
  .then(() => {
    startAcademyPublishScheduler();
    startNotificationScheduler();
    app.listen(env.port, () => {
      console.log(`[backend] API server running at http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error("[backend] 데이터베이스 초기화에 실패해 서버를 시작하지 못했습니다.", error);
    process.exit(1);
  });

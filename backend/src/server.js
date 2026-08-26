/**
 * [서버 시작 지점]
 *
 * 백엔드를 켤 때 가장 먼저 실행되는 파일입니다. 순서대로 이렇게 동작합니다.
 *  1. 지금 환경(개발/테스트/운영)과 연결될 데이터베이스가 서로 맞는지 확인합니다.
 *     짝이 맞지 않으면 여기서 멈춰서, 개발 작업이 실수로 운영 데이터를 건드리는 일을 막습니다.
 *  2. 데이터베이스를 준비합니다.
 *  3. 정해진 시간마다 자동으로 도는 작업(예약 발행, 자동 알림)을 켭니다.
 *     둘 다 설정으로 꺼둘 수 있고, 기본값은 꺼짐입니다.
 *  4. 웹/앱이 호출할 API 서버를 지정한 포트에서 대기시킵니다.
 */
import { assertRuntimeEnvironment, env } from "./config/env.js";

assertRuntimeEnvironment();

// Import DB-backed modules only after the environment/DB pairing is verified.
const [
  { createApp },
  { startAcademyPublishScheduler },
  { startNotificationScheduler },
  { ensureInitialized },
] = await Promise.all([
  import("./app.js"),
  import("./features/academy/academy.publish.scheduler.js"),
  import("./features/sms/notification.scheduler.js"),
  import("./shared/db/mysql.js"),
]);

const app = createApp();

ensureInitialized()
  .then(() => {
    // 예약해 둔 교육영상을 정해진 시간에 공개하는 작업입니다.
    if (env.academyPublishSchedulerEnabled && !env.testSafeMode) {
      startAcademyPublishScheduler();
    } else {
      console.log("[academy-scheduler] disabled by safety settings");
    }

    // 수업 리마인더, 수강권 만료 안내 같은 자동 알림을 만들어 보내는 작업입니다.
    // 이 호출이 없으면 알림이 만들어지지도 발송되지도 않습니다.
    // 실제로 도는지 여부는 NOTIFICATION_SCHEDULER_ENABLED 설정이 결정하며 기본값은 꺼짐입니다.
    // 안전 모드(TEST_SAFE_MODE)에서는 설정과 무관하게 꺼집니다.
    if (env.notificationSchedulerEnabled && !env.testSafeMode) {
      startNotificationScheduler();
    } else {
      console.log("[notification-scheduler] disabled by safety settings");
    }

    app.listen(env.port, () => {
      console.log(`[backend] API server running at http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error("[backend] DB initialization failed, aborting startup:", error?.message || error);
    process.exit(1);
  });

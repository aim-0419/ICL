/**
 * [자동 알림 정기 실행기]
 *
 * 정해진 시간 간격마다 깨어나서 자동 알림 관련 일을 한 번씩 처리합니다.
 *
 * - 정지 기간이 끝난 수강권을 다시 사용 가능하게 되돌립니다.
 * - 수업 리마인더, 수강권 만료 안내 같은 알림을 조건에 맞게 만들어 냅니다.
 * - 보낼 때가 된 알림을 발송합니다.
 *
 * 설정(NOTIFICATION_SCHEDULER_ENABLED)이 꺼져 있으면 아무 일도 하지 않으며,
 * 기본값은 꺼짐입니다. 안전 모드에서도 동작하지 않습니다.
 */
import { env } from "../../config/env.js";
import {
  generateAutomaticNotifications,
  materializePendingNotifications,
  processDueNotificationDeliveries,
  restoreExpiredPassPauses,
} from "./notification-dispatch.service.js";

let schedulerTimer = null;
let running = false;

function intervalMs() {
  const seconds = Number(env.notificationSchedulerIntervalSec || 30);
  return Math.min(3600, Math.max(10, Math.round(seconds))) * 1000;
}

// [현재 미사용] 자동 알림 작업을 한 번 실행합니다. 정기 실행은 아래 start 함수가 맡고, 이 함수를 직접 부르는 곳은 없습니다.
export async function runNotificationSchedulerTick() {
  if (running) return { skipped: true };
  running = true;
  try {
    const restored = await restoreExpiredPassPauses({ limit: 300 });
    const generated = await generateAutomaticNotifications();
    const materialized = await materializePendingNotifications({ limit: 300 });
    const delivered = await processDueNotificationDeliveries({ limit: 300 });
    return { ...restored, ...generated, ...materialized, ...delivered };
  } finally {
    running = false;
  }
}

export function startNotificationScheduler() {
  if (!env.notificationSchedulerEnabled) {
    console.log("[notification-scheduler] disabled by config");
    return;
  }
  if (schedulerTimer) return;
  const delay = intervalMs();
  schedulerTimer = setInterval(() => {
    runNotificationSchedulerTick().catch((error) => {
      console.error("[notification-scheduler] tick failed", error);
    });
  }, delay);
  if (typeof schedulerTimer.unref === "function") schedulerTimer.unref();
  runNotificationSchedulerTick().catch((error) => {
    console.error("[notification-scheduler] initial tick failed", error);
  });
  console.log(`[notification-scheduler] started (interval: ${Math.round(delay / 1000)}s)`);
}

// [현재 미사용] 자동 알림 작업을 멈춥니다. 서버를 끌 때 쓰려고 만들었으나 현재 호출하는 곳이 없습니다.
export function stopNotificationScheduler() {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
}

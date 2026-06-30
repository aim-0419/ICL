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

export function stopNotificationScheduler() {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
}

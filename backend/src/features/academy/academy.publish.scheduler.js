// 파일 역할: 홈페이지 애플리케이션의 한 기능을 구성하는 소스 코드입니다.
import { env } from "../../config/env.js";
import { publishDueAcademyVideosBySchedule } from "./academy.service.js";

let schedulerTimer = null;
let isRunning = false;

// 함수 역할: interval ms 입력값을 저장/비교하기 쉬운 표준 형태로 정규화합니다.
function normalizeIntervalMs() {
  const sec = Number(env.academyPublishSchedulerIntervalSec);
  if (!Number.isFinite(sec)) return 60_000;
  const clampedSec = Math.min(3600, Math.max(10, Math.round(sec)));
  return clampedSec * 1000;
}

// 함수 역할: runSchedulerTick 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
async function runSchedulerTick() {
  if (isRunning) return;
  isRunning = true;

  try {
    const result = await publishDueAcademyVideosBySchedule({ limit: 200 });
    const publishedCount = Number(result?.publishedCount || 0);
    if (publishedCount > 0) {
      console.log(`[academy-scheduler] published reserved curriculum: ${publishedCount} item(s)`);
    }
  } catch (error) {
    console.error("[academy-scheduler] publish tick failed:", error?.message || error);
  } finally {
    isRunning = false;
  }
}

// 함수 역할: 아카데미 publish scheduler 동작을 시작합니다.
export function startAcademyPublishScheduler() {
  if (env.testSafeMode || !env.academyPublishSchedulerEnabled) {
    console.log("[academy-scheduler] disabled by safety settings");
    return;
  }

  if (schedulerTimer) return;

  const intervalMs = normalizeIntervalMs();
  schedulerTimer = setInterval(() => {
    runSchedulerTick().catch(() => null);
  }, intervalMs);

  if (typeof schedulerTimer.unref === "function") {
    schedulerTimer.unref();
  }

  runSchedulerTick().catch(() => null);
  console.log(`[academy-scheduler] started (interval: ${Math.round(intervalMs / 1000)}s)`);
}

// 함수 역할: 아카데미 publish scheduler 동작을 중지합니다.
// [현재 미사용] 예약 발행 작업을 멈춥니다. 서버를 끌 때 쓰려고 만들었으나 현재 호출하는 곳이 없습니다.
export function stopAcademyPublishScheduler() {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
  console.log("[academy-scheduler] stopped");
}

import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const artifactDir = path.join(os.tmpdir(), "icl-playwright-artifacts");

const adminUser = {
  id: "admin-user",
  loginId: "owner",
  name: "운영 관리자",
  userGrade: "admin0",
  role: "admin",
  accountStatus: "active",
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockAppApi(page) {
  let checkedIn = false;
  let arrears = [{ id: "arrears-1", userId: "member-1", name: "홍길동", phone: "010-1234-5678", amount: 50000, reason: "6월 수강료", status: "open", dueDate: "2026-06-20" }];
  let lockers = [
    { id: "locker-1", lockerNo: "A-01", location: "입구", status: "available" },
    { id: "locker-2", lockerNo: "A-02", location: "탈의실", status: "maintenance" },
  ];
  let assignments = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (!path.startsWith("/api/")) {
      await route.continue();
      return;
    }
    const method = request.method();
    const body = request.postDataJSON?.() || {};

    if (path === "/api/auth/me") return json(route, { user: adminUser });
    if (path === "/api/products" || path === "/api/academy/videos") return json(route, []);
    if (path === "/api/sms/config") return json(route, { aligoConfigured: true, kakaoConfigured: true, fcmConfigured: true, sender: "010-1234-5678", schedulerEnabled: true });
    if (path === "/api/sms/history" || path === "/api/sms/auto-history") return json(route, { items: [] });
    if (path === "/api/sms/send" && method === "POST") return json(route, { ok: true, successCnt: body.receivers?.length || 0, errorCnt: 0 });
    if (path === "/api/sms/schedule" && method === "POST") return json(route, { ok: true, queuedCount: body.receivers?.length || 0 }, 201);
    if (path === "/api/studio/admin/classes") return json(route, { classes: [{ id: "class-1", title: "리포머 기초", instructorName: "김강사", startAt: "2026-06-15 10:00:00", capacity: 6, reservedCount: 1, waitlistCount: 0, status: "active" }] });
    if (path === "/api/studio/admin/classes/class-1/bookings") return json(route, { bookings: [{ id: "booking-1", classId: "class-1", userId: "member-1", userName: "홍길동", name: "홍길동", userPhone: "010-1234-5678", phone: "010-1234-5678", status: "reserved" }] });
    if (path === "/api/studio/admin/classes/class-1/checkins") return json(route, { checkins: checkedIn ? [{ id: "checkin-1", classId: "class-1", userId: "member-1", bookingId: "booking-1", status: "checked_in" }] : [] });
    if (path === "/api/studio/admin/checkins" && method === "POST") { checkedIn = true; return json(route, { id: "checkin-1", ...body }, 201); }
    if (path === "/api/studio/admin/checkins/checkin-1/cancel" && method === "PATCH") { checkedIn = false; return json(route, { id: "checkin-1", status: "cancelled" }); }

    if (path === "/api/studio/admin/arrears" && method === "GET") {
      const status = url.searchParams.get("status");
      return json(route, { arrears: status ? arrears.filter((item) => item.status === status) : arrears });
    }
    if (path === "/api/studio/admin/arrears" && method === "POST") {
      arrears = [{ id: "arrears-2", name: "김회원", phone: "010-9999-0000", status: "open", ...body }, ...arrears];
      return json(route, arrears[0], 201);
    }
    if (path.endsWith("/resolve") && path.includes("/api/studio/admin/arrears/") && method === "PATCH") {
      const id = path.split("/").at(-2);
      arrears = arrears.map((item) => item.id === id ? { ...item, status: "resolved" } : item);
      return json(route, { ok: true });
    }

    if (path === "/api/studio/admin/lockers" && method === "GET") return json(route, { lockers });
    if (path === "/api/studio/admin/lockers" && method === "POST") {
      lockers = [...lockers, { id: "locker-3", status: "available", ...body }];
      return json(route, lockers.at(-1), 201);
    }
    if (path.includes("/api/studio/admin/lockers/") && path.endsWith("/status") && method === "PATCH") {
      const id = path.split("/").at(-2);
      lockers = lockers.map((item) => item.id === id ? { ...item, status: body.status } : item);
      return json(route, lockers.find((item) => item.id === id));
    }
    if (path === "/api/studio/admin/locker-assignments" && method === "GET") return json(route, { assignments });
    if (path === "/api/studio/admin/locker-assignments" && method === "POST") {
      assignments = [{ id: "assignment-1", lockerId: body.lockerId, userId: body.userId, userName: "김회원", userPhone: "010-9999-0000", status: "active" }];
      lockers = lockers.map((item) => item.id === body.lockerId ? { ...item, status: "occupied" } : item);
      return json(route, assignments[0], 201);
    }
    if (path.includes("/api/studio/admin/locker-assignments/") && path.endsWith("/end") && method === "PATCH") {
      const assignment = assignments[0];
      assignments = [];
      lockers = lockers.map((item) => item.id === assignment?.lockerId ? { ...item, status: "available" } : item);
      return json(route, { ok: true });
    }
    if (path === "/api/admin/members") return json(route, { members: [{ id: "member-2", name: "김회원", phone: "010-9999-0000", userGrade: "member", accountStatus: "active", studioMemberStatus: "active", totalArrears: 0, passes: [] }] });
    return json(route, { items: [], members: [], classes: [], notifications: [], orders: [], progress: [], points: 0 });
  });
}

test.beforeEach(async ({ page }) => {
  await fs.mkdir(artifactDir, { recursive: true });
  page.on("pageerror", (error) => process.stderr.write(`[pageerror] ${error.message}\n`));
  page.on("console", (message) => {
    if (message.type() === "error") process.stderr.write(`[console] ${message.text()}\n`);
  });
  await mockAppApi(page);
});

test("예약자 체크인과 취소가 실제 상태로 전환된다", async ({ page }) => {
  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { name: "운영 관리" })).toBeVisible();
  const checkinButton = page.getByRole("button", { name: "체크인", exact: true });
  await checkinButton.click();
  await expect(page.getByRole("button", { name: "체크인 취소" })).toBeVisible();
  await page.getByRole("button", { name: "체크인 취소" }).click();
  await expect(page.getByRole("button", { name: "체크인", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(artifactDir, "operations-checkin-desktop.png"), fullPage: true });
});

test("미수금 등록·완납과 락커 생성·배정·종료가 동작한다", async ({ page }) => {
  await page.goto("/admin/operations");
  await page.getByRole("button", { name: "미수금", exact: true }).click();
  await page.getByRole("button", { name: "미수금 등록" }).click();
  await expect(page.getByText("미수금을 등록할 회원을 선택해 주세요.")).toBeVisible();
  await page.getByPlaceholder("이름 또는 전화번호 검색").fill("김회");
  await page.getByRole("button", { name: /김회원/ }).click();
  await page.getByPlaceholder("미수금 금액").fill("30000");
  await page.getByPlaceholder("미수금 사유").fill("락커 이용료");
  await page.getByRole("button", { name: "미수금 등록" }).click();
  await expect(page.getByText("미수금을 등록했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "완납 처리" }).first().click();

  await page.getByRole("button", { name: "락커", exact: true }).click();
  await page.getByPlaceholder("락커 번호").fill("B-01");
  await page.getByRole("textbox", { name: "위치", exact: true }).fill("복도");
  await page.getByRole("button", { name: "락커 생성" }).click();
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  await page.locator("select").filter({ hasText: "배정할 락커" }).selectOption("locker-1");
  await page.getByPlaceholder("이름 또는 전화번호 검색").fill("김회");
  await page.getByRole("button", { name: /김회원/ }).click();
  await page.getByRole("button", { name: "락커 배정" }).click();
  await expect(page.getByText(/김회원 · 010-9999-0000/)).toBeVisible();
  await page.getByRole("button", { name: "배정 종료" }).click();
  await expect(page.getByText("비어 있음").first()).toBeVisible();
});

test("회원 목록은 실제 xlsx 파일을 다운로드한다", async ({ page }) => {
  await page.goto("/admin/member-list");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "엑셀다운로드" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const path = await download.path();
  const bytes = await fs.readFile(path);
  expect(bytes[0]).toBe(0x50);
  expect(bytes[1]).toBe(0x4b);
});

test("375px 화면과 큰 버튼 옵션에서 운영 화면이 사용할 수 있다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "가+" }).click();
  await expect(page.locator("html")).toHaveClass(/large-controls/);
  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { name: "운영 관리" })).toBeVisible();
  await page.screenshot({ path: path.join(artifactDir, "operations-mobile-375.png"), fullPage: true });
});

test("앱 푸시 수신자를 선택해 서버 예약 발송으로 저장한다", async ({ page }) => {
  await page.goto("/admin/messages");
  await page.getByRole("button", { name: "앱 푸시", exact: true }).click();
  await page.locator(".icl-message-form-card").getByRole("button", { name: "회원", exact: true }).click();
  await page.getByPlaceholder("이름 또는 전화번호 검색").fill("김회원");
  await page.waitForTimeout(350);
  await page.locator(".icl-message-picker-item").filter({ hasText: "김회원" }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "1명 추가" }).click();
  await page.locator(".icl-message-title-input").fill("수업 안내");
  await page.locator(".icl-message-msg-textarea").fill("내일 오전 10시 수업이 예약되었습니다.");
  await page.getByRole("button", { name: "보내기 예약" }).click();
  const future = new Date(Date.now() + 3_600_000);
  const pad = (value) => String(value).padStart(2, "0");
  const localFuture = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
  await page.locator('input[type="datetime-local"]').fill(localFuture);
  const requestPromise = page.waitForRequest((request) => request.url().endsWith("/api/sms/schedule") && request.method() === "POST");
  await page.getByRole("button", { name: "예약 저장" }).click();
  const request = await requestPromise;
  const payload = request.postDataJSON();
  expect(payload.channel).toBe("push");
  expect(payload.receivers[0].userId).toBe("member-2");
  await expect(page.getByText("예약 발송이 서버에 저장되었습니다.")).toBeVisible();
  await page.screenshot({ path: path.join(artifactDir, "messages-push-scheduled.png"), fullPage: true });
});

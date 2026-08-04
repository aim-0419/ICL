import { expect, test } from "@playwright/test";

const ADMIN_LOGIN_ID = "e2e_admin";
const ADMIN_PASSWORD = process.env.E2E_TEST_PASSWORD || "";

const VIEWPORTS = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "desktop-1024", width: 1024, height: 768 },
];

const ADMIN_PAGES = [
  { name: "schedule", path: "/admin/studio" },
  { name: "classes", path: "/admin/classes" },
  { name: "members", path: "/admin/member-list" },
  { name: "instructors", path: "/admin/instructors" },
  { name: "passes", path: "/admin/passes" },
  { name: "operations", path: "/admin/operations" },
  { name: "messages", path: "/admin/messages" },
  { name: "board", path: "/admin/board" },
  { name: "sales", path: "/admin/studio/sales" },
  { name: "settings", path: "/admin/settings" },
];

test.describe("Pilates admin redesign", () => {
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_PASSWORD가 설정된 테스트 환경에서만 실행합니다.");

  test("all admin pages keep the shared shell without viewport overflow", async ({ page }, testInfo) => {
    test.setTimeout(360_000);

    const consoleErrors = [];
    const networkErrors = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });
    page.on("requestfailed", (request) => {
      const errorText = request.failure()?.errorText || "request failed";
      // 다음 관리자 화면으로 이동하며 브라우저가 정상 취소한 이전 요청은 제품 오류가 아닙니다.
      if (errorText === "net::ERR_ABORTED") {
        return;
      }
      networkErrors.push(`${errorText} ${request.url()}`);
    });
    page.on("response", (response) => {
      if (response.status() === 404 || response.status() >= 500) {
        networkErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/login");
    await page.getByLabel("아이디").fill(ADMIN_LOGIN_ID);
    await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/login"));

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const adminPage of ADMIN_PAGES) {
        await page.goto(adminPage.path, { waitUntil: "domcontentloaded" });
        await expect(page.locator(".icl-admin-shell")).toBeVisible();
        await expect(page.locator(".icl-admin-sidebar")).toBeVisible();
        await expect(page.locator(".admin-schedule-topbar")).toBeVisible();
        await page.waitForTimeout(350);
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

        const horizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(horizontalOverflow, `${viewport.name} ${adminPage.path} 가로 넘침`).toBeLessThanOrEqual(2);

        await page.screenshot({
          path: testInfo.outputPath(`${viewport.name}-${adminPage.name}.png`),
          fullPage: false,
        });
      }
    }

    expect(
      {
        consoleErrors: [...new Set(consoleErrors)],
        networkErrors: [...new Set(networkErrors)],
      },
      "관리자 페이지 Console/Network 오류",
    ).toEqual({
      consoleErrors: [],
      networkErrors: [],
    });
  });
});

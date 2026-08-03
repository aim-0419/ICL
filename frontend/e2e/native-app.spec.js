import { expect, test } from "@playwright/test";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.VITE_E2E_BASE_URL || "";

function mockApiBody(pathname) {
  if (pathname.endsWith("/api/auth/me")) {
    return {
      user: {
        id: "e2e-native-member",
        loginId: "e2e_native_member",
        name: "E2E Member",
        email: "e2e-native-member@example.invalid",
        role: "member",
      },
    };
  }
  if (pathname.includes("/api/community/social/latest")) return { items: [], updatedAt: null };
  if (pathname.includes("/api/brand/page-overrides")) return { overrides: [] };
  if (pathname.includes("/api/studio/branches")) return { branches: [] };
  if (pathname.includes("/api/studio/classes")) return { classes: [] };
  if (pathname.includes("/api/studio/me/passes")) return { passes: [] };
  if (pathname.includes("/api/studio/me/reservations")) return { reservations: [] };
  return [];
}

test.describe("native app shell", () => {
  test.skip(!configuredBaseUrl, "PLAYWRIGHT_BASE_URL is required for the app-shell E2E test.");

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(mockApiBody(url.pathname)),
      });
    });
  });

  test("renders the member app shell and reader-safe purchase flow", async ({ page }, testInfo) => {
    const consoleErrors = [];
    const networkErrors = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const errorText = request.failure()?.errorText || "request failed";
      // SPA route changes legitimately cancel modules/fonts that are no longer needed.
      if (errorText === "net::ERR_ABORTED") return;
      networkErrors.push(`${errorText} ${request.url()}`);
    });
    page.on("response", (response) => {
      if (response.status() === 404 || response.status() >= 500) {
        networkErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/");
    await expect(page.locator("body")).toHaveClass(/native-app/);
    await expect(page.locator(".native-bottom-nav-item")).toHaveCount(4);
    await expect(page.locator('a[href="/cart"]')).toHaveCount(0);

    const documentWidth = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(documentWidth.scroll).toBeLessThanOrEqual(documentWidth.client + 1);

    await page.locator(".native-bottom-nav-item").nth(1).click();
    await expect(page).toHaveURL(/\/pilates\/reservation$/);
    await page.waitForLoadState("networkidle");

    await page.goto("/cart");
    await expect(page.locator(".native-purchase-notice")).toBeVisible();
    await expect(page.locator(".native-purchase-notice")).toContainText(/웹|구매/);

    await page.screenshot({
      path: testInfo.outputPath(`native-app-${testInfo.project.name}.png`),
      fullPage: true,
    });

    expect(consoleErrors).toEqual([]);
    expect(networkErrors).toEqual([]);
  });
});

import { expect, test } from "@playwright/test";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.VITE_E2E_BASE_URL || "";
const socialFeedMock = {
  updatedAt: new Date(0).toISOString(),
  items: [],
};

test.describe("safe smoke preflight", () => {
  test.skip(!configuredBaseUrl, "PLAYWRIGHT_BASE_URL 또는 VITE_E2E_BASE_URL이 설정된 경우에만 실행합니다.");

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/community/social/latest", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(socialFeedMock),
      });
    });
  });

  test("home page renders without destructive actions", async ({ page }) => {
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
      networkErrors.push(`${request.failure()?.errorText || "request failed"} ${request.url()}`);
    });
    page.on("response", (response) => {
      const status = response.status();
      if (status === 404 || status >= 500) {
        networkErrors.push(`${status} ${response.url()}`);
      }
    });

    await page.goto("/");
    await expect(page).toHaveTitle(/이끌림|ICL|필라테스|Pilates/i);
    await page.waitForTimeout(500);

    expect(consoleErrors).toEqual([]);
    expect(networkErrors).toEqual([]);
  });

  test("event placeholder asset is served", async ({ page }) => {
    const response = await page.goto("/uploads/e2e/event-placeholder.png");

    expect(response?.ok()).toBeTruthy();
    expect(response?.headers()["content-type"] || "").toMatch(/image|octet-stream/i);
  });
});

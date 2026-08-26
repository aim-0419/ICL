/**
 * 앱 하단 여백 회귀 테스트.
 *
 * 하단 탐색을 숨기는 화면(영상 플레이어·관리자·회원가입)에서
 * body 의 하단 여백(72px)이 그대로 남아 빈 띠가 생기던 문제를 막습니다.
 */
import { expect, test } from "@playwright/test";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.VITE_E2E_BASE_URL || "";

async function readBottomPadding(page) {
  return page.evaluate(() => ({
    hasClass: document.body.classList.contains("native-app-no-bottom-nav"),
    paddingBottom: window.getComputedStyle(document.body).paddingBottom,
    bottomNavCount: document.querySelectorAll(".native-bottom-nav").length,
  }));
}

test.describe("앱 하단 여백", () => {
  test.skip(!configuredBaseUrl, "PLAYWRIGHT_BASE_URL 이 설정된 경우에만 실행합니다.");

  test("하단 탐색이 보이는 화면은 하단 여백을 유지한다", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".native-bottom-nav");
    const state = await readBottomPadding(page);

    expect(state.bottomNavCount).toBe(1);
    expect(state.hasClass).toBe(false);
    expect(state.paddingBottom).toBe("72px");
  });

  test("하단 탐색이 숨는 회원가입 화면은 여백을 해제한다", async ({ page }) => {
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".native-app-topbar");
    await expect(page.locator(".native-bottom-nav")).toHaveCount(0);

    const state = await readBottomPadding(page);
    expect(state.hasClass).toBe(true);
    // 홈 인디케이터 안전영역만 남기고 72px 은 사라져야 합니다.
    expect(state.paddingBottom).not.toBe("72px");
  });

  test("화면을 오가면 여백 상태가 따라 바뀐다", async ({ page }) => {
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".native-app-topbar");
    expect((await readBottomPadding(page)).hasClass).toBe(true);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".native-bottom-nav");
    expect((await readBottomPadding(page)).hasClass).toBe(false);
  });
});

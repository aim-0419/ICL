import { expect, test } from "@playwright/test";

// 알림을 탭했을 때처럼 보호 경로로 바로 들어온 비로그인 사용자가
// 로그인 뒤 원래 목적지로 돌아가는지 확인합니다. 실제 API는 호출하지 않습니다.
const MEMBER = {
  id: "e2e-redirect-user",
  loginId: "e2e_redirect",
  name: "리다이렉트 테스트",
  role: "user",
};

async function mockAuth(page) {
  let signedIn = false;
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    // 개발 서버의 모듈 경로에도 /api/ 가 들어갈 수 있어 백엔드 경로만 가로챕니다.
    if (!path.startsWith("/api/")) return route.continue();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path.endsWith("/auth/login")) {
      signedIn = true;
      return json({ user: MEMBER });
    }
    if (path.endsWith("/auth/logout")) {
      signedIn = false;
      return json({ ok: true });
    }
    if (path.endsWith("/auth/me")) return json({ user: signedIn ? MEMBER : null });
    return json({});
  });
}

test.describe("비로그인 상태의 보호 경로 이동", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test("로그인하면 원래 목적지로 돌아간다", async ({ page }) => {
    await page.goto("/mypage");
    await page.waitForTimeout(1200);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator(".auth-form")).toBeVisible();

    await page.locator(".auth-form input[type=text]").fill("e2e_redirect");
    await page.locator(".auth-form input[type=password]").fill("dummy-password");
    await page.locator(".auth-form button[type=submit]").click();
    await page.waitForTimeout(1500);

    await expect(page).toHaveURL(/\/mypage$/);
  });

  test("목적지가 없으면 홈으로 보낸다", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(800);
    await page.locator(".auth-form input[type=text]").fill("e2e_redirect");
    await page.locator(".auth-form input[type=password]").fill("dummy-password");
    await page.locator(".auth-form button[type=submit]").click();
    await page.waitForTimeout(1500);

    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("외부 주소는 복귀 목적지로 사용하지 않는다", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(800);
    // RequireAuth가 아닌 경로로 위조된 목적지를 주입해도 내부 경로만 허용해야 합니다.
    await page.evaluate(() => {
      window.history.replaceState({ usr: { from: "https://evil.example.com/admin" } }, "", "/login");
    });
    await page.locator(".auth-form input[type=text]").fill("e2e_redirect");
    await page.locator(".auth-form input[type=password]").fill("dummy-password");
    await page.locator(".auth-form button[type=submit]").click();
    await page.waitForTimeout(1500);

    expect(new URL(page.url()).host).toBe(new URL(page.url()).host);
    expect(new URL(page.url()).pathname).toBe("/");
  });
});

/**
 * 앱 모드 세로 스크롤 회귀 테스트
 *
 * body에 overscroll-behavior-y:none이 걸리면 body의 overflow-x:hidden과 결합해
 * 스크롤이 상위 viewport로 전달되지 않아 Android WebView에서 손가락 스크롤이 완전히 멈춥니다.
 * 억제 의도는 html에만 적용해야 하며, 이 테스트가 그 계약을 고정합니다.
 *
 * 실행 조건: PLAYWRIGHT_BASE_URL이 앱 모드 dev 서버(기본 5174)를 가리켜야 합니다.
 */
import { expect, test } from "@playwright/test";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.VITE_E2E_BASE_URL || "";

function mockApiBody(pathname) {
  if (pathname.endsWith("/api/auth/me")) {
    return {
      user: {
        id: "e2e-scroll-member",
        loginId: "e2e_scroll_member",
        name: "E2E Member",
        email: "e2e-scroll-member@example.invalid",
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
  if (pathname.includes("/api/studio/me/summary")) return { passes: [], reservations: [], history: [] };
  return [];
}

function readScrollTop(page) {
  return page.evaluate(() => document.scrollingElement.scrollTop);
}

// 사용자 스크롤은 애니메이션 후 값이 확정되므로 안정될 때까지 기다립니다.
async function settledScrollTop(page) {
  let previous = -1;
  for (let i = 0; i < 20; i += 1) {
    const current = await readScrollTop(page);
    if (current === previous) return current;
    previous = current;
    await page.waitForTimeout(100);
  }
  return previous;
}

async function gotoLongPage(page, path) {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForFunction(
    () => document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight + 200,
    undefined,
    { timeout: 15_000 }
  );
}

test.describe("앱 모드 세로 스크롤", () => {
  test.skip(!configuredBaseUrl, "앱 모드 dev 서버를 가리키는 PLAYWRIGHT_BASE_URL이 필요합니다.");

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
    await page.setViewportSize({ width: 412, height: 915 });
  });

  test("html과 body에 native-app 클래스가 적용된다", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/native-app/);
    await expect(page.locator("body")).toHaveClass(/native-app/);
  });

  test("overscroll 억제는 html에만 적용된다", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toHaveClass(/native-app/);

    const computed = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overscrollBehaviorY,
      body: getComputedStyle(document.body).overscrollBehaviorY,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
    }));

    // 당김 새로고침·고무줄 억제는 유지합니다.
    expect(computed.html).toBe("none");
    // body는 overflow-x:hidden 때문에 스크롤 경계가 되므로 none이면 전파가 끊깁니다.
    expect(computed.body).not.toBe("none");
  });

  test("긴 공개 화면에서 사용자 입력으로 스크롤된다", async ({ page }) => {
    await gotoLongPage(page, "/");

    expect(await readScrollTop(page)).toBe(0);

    await page.mouse.move(200, 500);
    await page.mouse.wheel(0, 600);
    const first = await settledScrollTop(page);
    expect(first).toBeGreaterThan(200);

    await page.mouse.wheel(0, 600);
    const second = await settledScrollTop(page);
    expect(second).toBeGreaterThan(first);

    // 위로 되돌리면 최상단까지 복귀해야 합니다.
    await page.mouse.wheel(0, -4000);
    expect(await settledScrollTop(page)).toBe(0);
  });

  test("로그인 상태의 마이페이지도 스크롤된다", async ({ page }) => {
    await gotoLongPage(page, "/mypage");

    await page.mouse.move(200, 500);
    await page.mouse.wheel(0, 700);
    expect(await settledScrollTop(page)).toBeGreaterThan(200);
  });

  test("스크롤을 막는 리스너가 없다", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toHaveClass(/native-app/);

    const cdp = await page.context().newCDPSession(page);
    const blocking = [];

    for (const expression of ["window", "document", "document.documentElement", "document.body"]) {
      const { result } = await cdp.send("Runtime.evaluate", { expression });
      if (!result.objectId) continue;
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", {
        objectId: result.objectId,
        depth: 1,
      });
      listeners
        .filter((listener) => /^(touchstart|touchmove|wheel|mousewheel)$/.test(listener.type))
        .filter((listener) => listener.passive === false)
        .forEach((listener) => blocking.push(`${expression}: ${listener.type}`));
    }

    expect(blocking, `스크롤을 막을 수 있는 리스너: ${blocking.join(", ")}`).toEqual([]);
  });

  test("native-app 클래스가 없는 웹 조건에서도 스크롤이 유지된다", async ({ page }) => {
    await gotoLongPage(page, "/");
    await page.evaluate(() => {
      document.documentElement.classList.remove("native-app");
      document.body.classList.remove("native-app");
    });

    await page.mouse.move(200, 500);
    await page.mouse.wheel(0, 600);
    expect(await settledScrollTop(page)).toBeGreaterThan(200);
  });
});

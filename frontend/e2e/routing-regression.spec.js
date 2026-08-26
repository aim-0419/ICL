/**
 * 라우팅 회귀 테스트.
 *
 * react-router v7 전환 후 선언형 라우팅(Routes/Route/Link/useNavigate/Navigate)이
 * 그대로 동작하는지 확인합니다. 백엔드 없이 정적 빌드만으로 실행됩니다.
 */
import { expect, test } from "@playwright/test";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.VITE_E2E_BASE_URL || "";

test.describe("라우팅", () => {
  test.skip(!configuredBaseUrl, "PLAYWRIGHT_BASE_URL 이 설정된 경우에만 실행합니다.");

  test("직접 진입한 경로가 각각 다른 화면을 렌더링한다", async ({ page }) => {
    const seen = new Set();
    for (const path of ["/", "/login", "/signup", "/academy", "/ikleulrim/instructors", "/terms", "/privacy"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("main, .site-shell", { timeout: 10000 });
      expect(new URL(page.url()).pathname, `${path} 진입 후 경로`).toBe(path);
      const heading = (await page.locator("h1, h2").first().textContent().catch(() => "")) || "";
      seen.add(heading.trim());
    }
    // 모든 경로가 같은 화면으로 떨어지면 라우팅이 죽은 것입니다.
    expect(seen.size).toBeGreaterThan(3);
  });

  test("등록되지 않은 경로는 홈으로 리다이렉트된다", async ({ page }) => {
    await page.goto("/이런경로는없다-12345", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("Link 클릭으로 클라이언트 라우팅이 동작한다", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("a[href='/terms']");

    // window 에 심은 값이 살아남으면 문서를 다시 받지 않은 것,
    // 즉 클라이언트 라우팅으로 이동했다는 뜻입니다.
    await page.evaluate(() => { window.__iclSpaMarker = "kept"; });

    await page.locator("a[href='/terms']").first().click();
    await page.waitForURL("**/terms");
    await expect(page.locator("h1")).toContainText("이용약관");

    const marker = await page.evaluate(() => window.__iclSpaMarker);
    expect(marker, "전체 페이지 리로드가 발생하면 클라이언트 라우팅이 아닙니다").toBe("kept");
  });

  test("약관과 개인정보 전문이 각각 다른 내용을 보여준다", async ({ page }) => {
    await page.goto("/terms", { waitUntil: "domcontentloaded" });
    const terms = await page.locator(".legal-page-body").innerText();

    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    const privacy = await page.locator(".legal-page-body").innerText();

    expect(terms.length).toBeGreaterThan(500);
    expect(privacy.length).toBeGreaterThan(500);
    expect(terms).not.toBe(privacy);
  });
});

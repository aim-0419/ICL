import { chromium } from "playwright";

const ADMIN_USER = {
  id: "admin-1", loginId: "owner", name: "운영 관리자",
  userGrade: "admin0", role: "admin", accountStatus: "active",
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (!p.startsWith("/api/")) return route.continue();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/api/auth/me") return json({ user: ADMIN_USER });
    if (p.includes("/studio/admin/classes")) return json({ classes: [] });
    return json({});
  });

  await page.goto("http://localhost:5173/admin/studio");
  await page.waitForTimeout(2500);

  // 탑바만 크롭
  const topbar = await page.$(".admin-schedule-topbar");
  if (topbar) {
    await topbar.screenshot({ path: "e2e/topbar.png" });
    console.log("Topbar screenshot saved.");
  }
  await page.screenshot({ path: "e2e/calendar-current.png" });
  await browser.close();
})();

import { chromium } from "playwright";

const ADMIN_USER = {
  id: "admin-1", loginId: "owner", name: "밀리 오너",
  userGrade: "admin0", role: "admin0", accountStatus: "active",
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
    if (p.includes("/studio/admin/notices")) return json({ notices: [], total: 0 });
    return json({});
  });

  // 목록 뷰
  await page.goto("http://localhost:5173/admin/board");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "e2e/notice-list.png" });
  console.log("List screenshot saved.");

  // 폼 뷰 (FAB 클릭)
  const fab = await page.$(".admin-notice-fab");
  if (fab) {
    await fab.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: "e2e/notice-form.png" });
    console.log("Form screenshot saved.");
  }

  await browser.close();
})();

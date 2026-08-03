import { expect, test } from "@playwright/test";

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

const ADMIN_USER = {
  id: "visual-admin",
  loginId: "visual_admin",
  name: "디자인 관리자",
  userGrade: "admin0",
  role: "admin",
  accountStatus: "active",
};

const FIXTURES = {
  member: {
    id: "visual-member",
    name: "김이끌림",
    phone: "010-0000-0000",
    email: "visual-member@example.test",
    loginId: "visual_member",
    userGrade: "regular",
    accountStatus: "active",
    studioStatus: "active",
    passes: [],
    createdAt: "2026-07-01T00:00:00Z",
  },
  classItem: {
    id: "visual-class",
    title: "리포머 기초",
    instructorName: "김강사",
    startAt: "2026-07-27 10:00:00",
    capacity: 6,
    reservedCount: 2,
    waitlistCount: 0,
    status: "active",
  },
  pass: {
    id: "visual-pass",
    userId: "visual-member",
    productId: "visual-product",
    productName: "리포머 10회",
    totalSessions: 10,
    usedSessions: 3,
    remainingSessions: 7,
    startDate: "2026-07-01",
    expiryDate: "2026-10-01",
    status: "active",
  },
  product: {
    id: "visual-product",
    name: "리포머 10회",
    price: 150000,
    description: "리포머 기초 10회 수강권",
    sessions: 10,
    validityDays: 90,
    isActive: true,
  },
};

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * 관리자 리디자인의 시각 검증만 담당하는 테스트 전용 API fixture입니다.
 * 제품 코드, 실제 API 계약, 실제 DB에는 영향을 주지 않습니다.
 */
async function installAdminVisualApiFixtures(page, options = {}) {
  const mutationRequests = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (!path.startsWith("/api/")) {
      return route.continue();
    }

    if (method !== "GET") {
      mutationRequests.push(`${method} ${path}`);
      return json(route, { ok: true });
    }

    if (
      options.integration404
      && (path === "/api/studio/admin/arrears" || path === "/api/studio/admin/message-templates")
    ) {
      return json(route, { code: "NOT_IMPLEMENTED", message: "Backend feature pending" }, 404);
    }

    if (path === "/api/auth/me") return json(route, { user: ADMIN_USER });
    if (path === "/api/users/me" || path === "/api/mypage") return json(route, { user: ADMIN_USER });
    if (path === "/api/users/me/points") return json(route, { points: 0 });
    if (path === "/api/users/me/video-grants") return json(route, { grants: [] });
    if (path === "/api/cart" || path === "/api/cart/items") return json(route, { items: [] });
    if (path === "/api/orders") return json(route, { orders: [] });
    if (path === "/api/products") return json(route, { products: [FIXTURES.product] });
    if (path === "/api/academy/videos") return json(route, { videos: [] });
    if (path === "/api/academy/progress") return json(route, { progress: [] });
    if (path === "/api/academy/certificates") return json(route, { certificates: [] });
    if (path === "/api/academy/qna/my") return json(route, { posts: [] });
    if (path === "/api/community/events") return json(route, { events: [], total: 0 });
    if (path === "/api/community/reviews") return json(route, { reviews: [], total: 0 });
    if (path === "/api/community/inquiries") return json(route, { inquiries: [], total: 0 });
    if (path === "/api/brand/instructors") return json(route, { instructors: [] });
    if (path === "/api/brand/branches") return json(route, { branches: [] });

    if (path === "/api/admin/dashboard/users") {
      return json(route, {
        users: [FIXTURES.member],
        totalVip: 0,
        totalVvip: 0,
        totalRevenue: 0,
        recentOrders: [],
      });
    }
    if (path === "/api/admin/members") {
      return json(route, { members: [FIXTURES.member], total: 1 });
    }
    if (path.startsWith("/api/admin/dashboard/sales")) {
      return json(route, {
        totalRevenue: 0,
        totalOrders: 0,
        totalRefunds: 0,
        dailySales: [],
        topProducts: [],
        refundRate: 0,
      });
    }
    if (path === "/api/admin/video-grants") return json(route, { grants: [] });
    if (path === "/api/admin/page-overrides") return json(route, { overrides: {} });
    if (path === "/api/admin/pass-products" || path === "/api/admin/goods") {
      return json(route, { products: [FIXTURES.product] });
    }

    if (path === "/api/sms/config") {
      return json(route, {
        aligoConfigured: false,
        kakaoConfigured: false,
        fcmConfigured: false,
        sender: "",
        schedulerEnabled: false,
      });
    }
    if (path === "/api/sms/history" || path === "/api/sms/auto-history") {
      return json(route, { items: [] });
    }

    if (path === "/api/studio/admin/classes") {
      return json(route, { classes: [FIXTURES.classItem] });
    }
    if (path.endsWith("/bookings")) return json(route, { bookings: [] });
    if (path.endsWith("/checkins")) return json(route, { checkins: [] });
    if (path.endsWith("/waitlist")) return json(route, { waitlist: [] });
    if (path === "/api/studio/admin/passes") {
      return json(route, { passes: [FIXTURES.pass] });
    }
    if (path === "/api/studio/admin/members" || path === "/api/studio/admin/member-summaries") {
      return json(route, { members: [FIXTURES.member], total: 1 });
    }
    if (path === "/api/studio/admin/notifications") return json(route, { notifications: [] });
    if (path === "/api/studio/admin/notification-templates") return json(route, { templates: [] });
    if (path === "/api/studio/admin/roles") return json(route, { roles: [] });
    if (path === "/api/studio/admin/role-permissions") return json(route, { permissions: [] });
    if (path === "/api/studio/admin/rooms") return json(route, { rooms: [] });
    if (path === "/api/studio/admin/settings") {
      return json(route, {
        businessName: "이끌림 필라테스",
        address: "광주광역시",
        phone: "062-000-0000",
        businessHours: {},
      });
    }
    if (path === "/api/studio/admin/class-categories") return json(route, { categories: [] });
    if (path === "/api/studio/admin/member-grades" || path === "/api/studio/admin/member-grades/enabled") {
      return json(route, { grades: [] });
    }
    if (path === "/api/studio/admin/message-templates") return json(route, { templates: [] });
    if (path === "/api/studio/admin/notices") return json(route, { notices: [] });
    if (path === "/api/studio/admin/studio-staff" || path === "/api/admin/studio-staff") {
      return json(route, { staff: [] });
    }
    if (path === "/api/studio/admin/instructor-hours") return json(route, { hours: [] });
    if (path === "/api/studio/admin/lockers") return json(route, { lockers: [] });
    if (path === "/api/studio/admin/locker-assignments") return json(route, { assignments: [] });
    if (path === "/api/studio/admin/arrears") return json(route, { arrears: [] });
    if (path === "/api/studio/admin/checkins") return json(route, { checkins: [] });
    if (path.startsWith("/api/studio/admin/sales")) {
      return json(route, {
        summary: {},
        items: [],
        rows: [],
        sales: [],
        total: 0,
      });
    }

    if (path === "/api/refunds/admin") return json(route, { refunds: [] });

    return json(route, {
      ok: true,
      data: {},
      items: [],
      rows: [],
      list: [],
      results: [],
    });
  });

  return mutationRequests;
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const duplicateIds = [];
    const idCounts = new Map();

    document.querySelectorAll("[id]").forEach((element) => {
      const id = element.id;
      if (!id) return;
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    });
    idCounts.forEach((count, id) => {
      if (count > 1) duplicateIds.push({ id, count });
    });

    const clippedInteractive = [];
    document.querySelectorAll("a, button, input, select, textarea").forEach((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 0
        && rect.height > 0;

      if (!visible) return;
      if (rect.left < -2 || rect.right > window.innerWidth + 2) {
        clippedInteractive.push({
          tag: element.tagName.toLowerCase(),
          label: (element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 50),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        });
      }
    });

    return {
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      duplicateIds,
      clippedInteractive,
    };
  });
}

test.describe("Pilates admin redesign visual smoke", () => {
  test("10 admin screens render safely at four desktop viewports", async ({ page }, testInfo) => {
    test.setTimeout(360_000);

    const consoleErrors = [];
    const pageErrors = [];
    const networkErrors = [];
    const layoutDefects = [];
    const mutationRequests = await installAdminVisualApiFixtures(page);

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const errorText = request.failure()?.errorText || "request failed";
      if (errorText !== "net::ERR_ABORTED") networkErrors.push(`${errorText} ${request.url()}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) networkErrors.push(`${response.status()} ${response.url()}`);
    });

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const adminPage of ADMIN_PAGES) {
        await page.goto(adminPage.path, { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(new RegExp(`${adminPage.path.replaceAll("/", "\\/")}(?:[/?#]|$)`));
        await expect(page.locator(".icl-admin-shell")).toBeVisible();
        await expect(page.locator(".icl-admin-sidebar")).toBeVisible();
        await expect(page.locator(".admin-schedule-topbar")).toBeVisible();
        await expect(page.locator(".icl-admin-topbar-title h1")).not.toHaveText("");
        await expect(page.locator('.icl-admin-sidebar a[aria-current="page"]')).toHaveCount(1);
        await page.waitForTimeout(200);

        const layout = await inspectLayout(page);
        if (layout.horizontalOverflow > 2 || layout.duplicateIds.length || layout.clippedInteractive.length) {
          layoutDefects.push({
            viewport: viewport.name,
            path: adminPage.path,
            ...layout,
          });
        }

        await page.screenshot({
          path: testInfo.outputPath(`${viewport.name}-${adminPage.name}.png`),
          fullPage: false,
        });
      }
    }

    expect(mutationRequests, "디자인 Smoke 중 쓰기 요청").toEqual([]);
    expect(layoutDefects, "디자인 Smoke 레이아웃 결함").toEqual([]);
    expect([...new Set(consoleErrors)], "디자인 Smoke Console Error").toEqual([]);
    expect([...new Set(pageErrors)], "디자인 Smoke Page Error").toEqual([]);
    expect([...new Set(networkErrors)], "디자인 Smoke Network Error").toEqual([]);
  });

  test("known backend 404 responses keep operations and messages usable", async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    const serverErrors = [];
    const notFoundPaths = [];
    const mutationRequests = await installAdminVisualApiFixtures(page, { integration404: true });

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() === 404) notFoundPaths.push(new URL(response.url()).pathname);
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "미수금", exact: true }).click();
    await expect(page.getByText("조건에 맞는 미수금 내역이 없습니다.")).toBeVisible();
    await expect(page.locator(".icl-admin-shell")).toBeVisible();
    await expect(page.locator(".admin-operations-table")).toBeVisible();

    await page.goto("/admin/messages", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "문자보관함 저장", exact: true }).click();
    await expect(page.getByText("저장된 문구가 없습니다.")).toBeVisible();
    await expect(page.getByText("문자보관함을 불러오는 중입니다.")).toHaveCount(0);
    await expect(page.locator(".icl-admin-shell")).toBeVisible();

    const unexpectedConsoleErrors = consoleErrors.filter(
      (message) => !/Failed to load resource.*404/i.test(message),
    );
    expect([...new Set(notFoundPaths)].sort()).toEqual([
      "/api/studio/admin/arrears",
      "/api/studio/admin/message-templates",
    ]);
    expect(mutationRequests, "404 안전성 확인 중 쓰기 요청").toEqual([]);
    expect(unexpectedConsoleErrors, "404 외 Console Error").toEqual([]);
    expect(pageErrors, "404 상태의 Unhandled Exception").toEqual([]);
    expect(serverErrors, "404 상태의 5xx 응답").toEqual([]);
  });
});

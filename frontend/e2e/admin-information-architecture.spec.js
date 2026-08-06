/**
 * 관리자 화면의 제목 정보 구조와 푸터 노출 범위를 검증합니다.
 *
 * - 관리자 페이지의 H1은 상단바 제목 하나뿐이어야 합니다.
 * - 본문의 세부 영역 제목은 H2 이하로만 존재해야 합니다.
 * - 공개 사이트 푸터는 /admin 경로에서 렌더링되지 않고, 공개 경로에서는 유지돼야 합니다.
 *
 * 실제 API·DB에는 접근하지 않고 라우트 mock만 사용합니다.
 */
import { expect, test } from "@playwright/test";

const ADMIN_USER = {
  id: "ia-admin",
  loginId: "ia_admin",
  name: "정보구조 관리자",
  userGrade: "admin0",
  role: "admin",
  accountStatus: "active",
};

const FOOTER = "footer.site-footer";

// AdminLayout(사이드바 + 상단바)을 사용하는 화면과 상단바가 표시하는 페이지 제목입니다.
const ADMIN_SHELL_PAGES = [
  { path: "/admin/studio", title: "일정" },
  { path: "/admin/classes", title: "수업 관리" },
  { path: "/admin/member-list", title: "회원 관리" },
  { path: "/admin/instructors", title: "강사 관리" },
  { path: "/admin/passes", title: "수강권 관리" },
  { path: "/admin/operations", title: "운영 관리" },
  { path: "/admin/studio/sales", title: "매출 관리" },
  { path: "/admin/messages", title: "메시지" },
  { path: "/admin/board", title: "게시판 관리" },
  { path: "/admin/settings", title: "설정" },
  { path: "/admin/settings/basic", title: "설정" },
  { path: "/admin/settings/operation", title: "설정" },
  { path: "/admin/settings/roles", title: "설정" },
  { path: "/admin/settings/class-categories", title: "설정" },
  { path: "/admin/settings/member-grades", title: "설정" },
  { path: "/admin/settings/notifications", title: "설정" },
  { path: "/admin/settings/rooms", title: "설정" },
];

// 자체 레이아웃을 쓰는 관리자 화면입니다. 상단바가 없으므로 본문 제목이 유일한 H1입니다.
const ADMIN_STANDALONE_PAGES = [
  "/admin",
  "/admin/sales",
  "/admin/products",
  "/admin/refunds",
  "/admin/video-gifts",
];

const PUBLIC_PAGES = ["/", "/ikleulrim/intro", "/ikleulrim/instructors", "/academy", "/community/events"];

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

// Vite 모듈 경로까지 가로채지 않도록 /api/ 접두사만 처리합니다.
async function mockApi(page, user) {
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();

    if (path === "/api/auth/me") {
      return user ? json(route, { user }) : json(route, { user: null }, 401);
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
    return json(route, {
      ok: true,
      data: {},
      user,
      items: [],
      rows: [],
      list: [],
      results: [],
      templates: [],
      members: [],
      classes: [],
      passes: [],
      total: 0,
    });
  });
}

async function gotoAdmin(page, path) {
  await page.goto(path);
  await page.waitForSelector(".icl-admin-shell, .admin-sales-report-shell, main", { timeout: 15_000 });
  await page.waitForTimeout(400);
}

test.describe("관리자 제목 정보 구조", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, ADMIN_USER);
  });

  test("AdminLayout 화면은 상단바 제목 하나만 H1으로 가진다", async ({ page }) => {
    test.setTimeout(180_000);
    const defects = [];

    for (const item of ADMIN_SHELL_PAGES) {
      await gotoAdmin(page, item.path);
      const headings = await page.locator("h1").allTextContents();
      if (headings.length !== 1) {
        defects.push(`${item.path} H1 ${headings.length}개: ${JSON.stringify(headings)}`);
        continue;
      }
      if (headings[0].trim() !== item.title) {
        defects.push(`${item.path} H1 문구 불일치: "${headings[0].trim()}" != "${item.title}"`);
      }
    }

    expect(defects, defects.join("\n")).toEqual([]);
  });

  test("자체 레이아웃 관리자 화면도 H1은 1개다", async ({ page }) => {
    test.setTimeout(120_000);
    const defects = [];

    for (const path of ADMIN_STANDALONE_PAGES) {
      await gotoAdmin(page, path);
      const count = await page.locator("h1").count();
      if (count !== 1) defects.push(`${path} H1 ${count}개`);
    }

    expect(defects, defects.join("\n")).toEqual([]);
  });

  test("설정 화면은 상단바 H1과 본문 H2를 각각 유지한다", async ({ page }) => {
    await gotoAdmin(page, "/admin/settings");

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText("설정");
    await expect(page.locator("h2.admin-settings-title")).toHaveText("시설 정보 수정");
  });

  test("운영 관리 본문은 상단바와 같은 제목을 반복하지 않는다", async ({ page }) => {
    await gotoAdmin(page, "/admin/operations");

    await expect(page.locator("h1")).toHaveText("운영 관리");
    await expect(page.locator(".admin-operations-heading h1, .admin-operations-heading h2")).toHaveCount(0);
  });

  test("알림 설정은 본문 제목 H2 아래에 섹션 제목을 H3로 둔다", async ({ page }) => {
    await gotoAdmin(page, "/admin/settings/notifications");

    await expect(page.locator("h2.admin-sroom-title")).toHaveText("자동 알림 설정");
    await expect(page.locator("h3.admin-snoti-section-title")).toHaveCount(4);
  });

  test("사이드바 ICL 로고는 홈으로 이동한다", async ({ page }) => {
    await gotoAdmin(page, "/admin/studio");

    const brand = page.locator("a.icl-admin-sidebar-brand");
    await expect(brand).toHaveCount(1);
    expect(new URL(await brand.getAttribute("href"), "http://localhost").pathname).toBe("/");
  });
});

test.describe("공개 사이트 푸터 노출 범위", () => {
  test("관리자 경로에는 공개 푸터가 없다", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, ADMIN_USER);

    const leaked = [];
    for (const path of [...ADMIN_SHELL_PAGES.map((item) => item.path), ...ADMIN_STANDALONE_PAGES]) {
      await gotoAdmin(page, path);
      if (await page.locator(FOOTER).count() > 0) leaked.push(path);
    }

    expect(leaked, `공개 푸터가 남은 관리자 경로: ${leaked.join(", ")}`).toEqual([]);
  });

  test("공개 경로에는 공개 푸터가 유지된다", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, null);

    const missing = [];
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await page.waitForTimeout(400);
      if (await page.locator(FOOTER).count() === 0) missing.push(path);
    }

    expect(missing, `공개 푸터가 사라진 공개 경로: ${missing.join(", ")}`).toEqual([]);
  });

  test("로그인 회원 경로에는 공개 푸터가 유지된다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, {
      id: "ia-member",
      loginId: "ia_member",
      name: "회원",
      userGrade: "regular",
      role: "user",
      accountStatus: "active",
    });

    await page.goto("/mypage");
    await page.waitForTimeout(600);
    await expect(page.locator(FOOTER)).toHaveCount(1);
  });
});

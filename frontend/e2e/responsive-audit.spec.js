/**
 * 전체 페이지 반응형 감사 테스트
 * - 32개 페이지 × 4개 해상도 (375 / 768 / 1024 / 1440px)
 * - 각 페이지마다 가로 오버플로 감지 + 스크린샷 저장
 * - 주요 인터랙션(탭, 버튼, 메뉴) 클릭 테스트
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

const BASE_URL = "http://localhost:5173";
const SCREENSHOT_DIR = path.join(os.homedir(), "Desktop", "screenshots");

const VIEWPORTS = [
  { width: 375,  height: 812,  label: "375-mobile" },
  { width: 768,  height: 1024, label: "768-tablet" },
  { width: 1024, height: 768,  label: "1024-laptop" },
  { width: 1440, height: 900,  label: "1440-desktop" },
];

// ── 더미 데이터 ──────────────────────────────────────────────────────────────
const ADMIN_USER = {
  id: "admin-1",
  loginId: "owner",
  name: "관리자",
  userGrade: "admin0",
  role: "admin",
  accountStatus: "active",
};

const NORMAL_USER = {
  id: "user-1",
  loginId: "testuser",
  name: "홍길동",
  userGrade: "vip",
  role: "user",
  accountStatus: "active",
};

const DUMMY_PASS = {
  id: "pass-1",
  userId: "user-1",
  productId: "prod-1",
  productName: "리포머 10회",
  totalSessions: 10,
  usedSessions: 3,
  remainingSessions: 7,
  startDate: "2026-01-01",
  expiryDate: "2026-12-31",
  status: "active",
};

const DUMMY_VIDEO = {
  id: "vid-1",
  title: "리포머 기초 영상",
  description: "기초 동작을 배웁니다",
  instructor: "김강사",
  duration: 1800,
  thumbnail: null,
  isPublic: true,
  price: 10000,
  createdAt: "2026-01-01T00:00:00Z",
};

const DUMMY_MEMBER = {
  id: "member-1",
  name: "홍길동",
  phone: "010-1234-5678",
  email: "hong@test.com",
  loginId: "hong",
  userGrade: "regular",
  accountStatus: "active",
  studioStatus: "active",
  passes: [],
  createdAt: "2026-01-01T00:00:00Z",
};

const DUMMY_CLASS = {
  id: "class-1",
  title: "리포머 기초",
  instructorName: "김강사",
  startAt: "2026-06-15 10:00:00",
  capacity: 6,
  reservedCount: 2,
  waitlistCount: 0,
  status: "active",
};

const DUMMY_PRODUCT = {
  id: "prod-1",
  name: "리포머 10회",
  price: 150000,
  description: "리포머 기초 10회 수강권",
  sessions: 10,
  validityDays: 90,
  isActive: true,
};

const DUMMY_EVENT = {
  id: "event-1",
  title: "여름 특별 이벤트",
  content: "여름 할인 이벤트 내용",
  startDate: "2026-07-01",
  endDate: "2026-08-31",
  isActive: true,
  createdAt: "2026-06-01T00:00:00Z",
};

const DUMMY_REVIEW = {
  id: "review-1",
  userId: "user-1",
  userName: "홍길동",
  title: "좋은 수업이었어요",
  content: "강사님이 친절하고 수업이 체계적입니다.",
  rating: 5,
  isPublic: true,
  createdAt: "2026-06-01T00:00:00Z",
  comments: [],
};

const DUMMY_INQUIRY = {
  id: "inquiry-1",
  userId: "user-1",
  userName: "홍길동",
  title: "수강권 문의",
  content: "수강권 환불이 가능한가요?",
  isPublic: false,
  status: "open",
  createdAt: "2026-06-01T00:00:00Z",
  replies: [],
};

// ── 결과 수집 ────────────────────────────────────────────────────────────────
const auditResults = [];

// ── 헬퍼: JSON 응답 반환 ─────────────────────────────────────────────────────
function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

// ── 헬퍼: 전체 API 목킹 (어드민 유저) ───────────────────────────────────────
async function mockAllApis(page, userOverride = ADMIN_USER) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;

    if (!p.startsWith("/api/")) {
      return route.continue();
    }

    const method = route.request().method();

    // ── 인증 ──
    if (p === "/api/auth/me")           return json(route, { user: userOverride });
    if (p === "/api/auth/login")        return json(route, { user: userOverride });
    if (p === "/api/auth/logout")       return json(route, { ok: true });

    // ── 유저 ──
    if (p === "/api/users/me")                return json(route, { user: userOverride });
    if (p.startsWith("/api/users/me"))        return json(route, { ok: true });
    if (p === "/api/mypage")                  return json(route, { user: userOverride });
    if (p === "/api/users/me/points")         return json(route, { points: 0 });
    if (p === "/api/users/me/video-grants")   return json(route, { grants: [] });

    // ── 장바구니 & 주문 ──
    if (p === "/api/cart" || p === "/api/cart/items") return json(route, { items: [] });
    if (p.startsWith("/api/cart"))            return json(route, { ok: true });
    if (p === "/api/orders")                  return json(route, { orders: [] });
    if (p.startsWith("/api/orders"))          return json(route, { ok: true });
    if (p === "/api/refunds" || p === "/api/refunds/me") return json(route, { refunds: [] });
    if (p.startsWith("/api/refunds"))         return json(route, { ok: true });

    // ── 상품 ──
    if (p === "/api/products")                return json(route, { products: [DUMMY_PRODUCT] });
    if (p.startsWith("/api/products"))        return json(route, { product: DUMMY_PRODUCT, ok: true });

    // ── 아카데미 ──
    if (p === "/api/academy/videos")          return json(route, { videos: [DUMMY_VIDEO] });
    if (p.startsWith("/api/academy/videos/") && p.endsWith("/reviews")) return json(route, { reviews: [] });
    if (p.startsWith("/api/academy/videos/") && p.endsWith("/qna"))     return json(route, { posts: [] });
    if (p.startsWith("/api/academy/videos")) return json(route, { video: DUMMY_VIDEO });
    if (p === "/api/academy/progress")        return json(route, { progress: [] });
    if (p === "/api/academy/certificates")    return json(route, { certificates: [] });
    if (p === "/api/academy/qna/my")          return json(route, { posts: [] });
    if (p.startsWith("/api/academy/instructors")) return json(route, { instructors: [] });
    if (p.startsWith("/api/academy"))         return json(route, { ok: true });

    // ── 커뮤니티 ──
    if (p === "/api/community/events")        return json(route, { events: [DUMMY_EVENT], total: 1 });
    if (p.startsWith("/api/community/events")) return json(route, { event: DUMMY_EVENT, ok: true });
    if (p === "/api/community/reviews")       return json(route, { reviews: [DUMMY_REVIEW], total: 1 });
    if (p.startsWith("/api/community/reviews")) return json(route, { review: DUMMY_REVIEW, comments: [], ok: true });
    if (p === "/api/community/inquiries")     return json(route, { inquiries: [DUMMY_INQUIRY], total: 1 });
    if (p.startsWith("/api/community/inquiries")) return json(route, { inquiry: DUMMY_INQUIRY, replies: [], ok: true });
    if (p.startsWith("/api/community"))       return json(route, { ok: true });

    // ── 브랜드 ──
    if (p === "/api/brand/instructors")       return json(route, { instructors: [] });
    if (p.startsWith("/api/brand/instructors")) return json(route, { instructor: null, ok: true });
    if (p === "/api/brand/branches")          return json(route, { branches: [] });

    // ── 어드민 대시보드 ──
    if (p === "/api/admin/dashboard/users")   return json(route, {
      users: [DUMMY_MEMBER],
      totalVip: 2,
      totalVvip: 1,
      totalRevenue: 1500000,
      recentOrders: [],
    });
    if (p.startsWith("/api/admin/dashboard/users/") && p.endsWith("/progress")) return json(route, { progress: [] });
    if (p.startsWith("/api/admin/dashboard")) return json(route, { ok: true, data: {} });

    // ── 어드민 회원 ──
    if (p === "/api/admin/members")           return json(route, { members: [DUMMY_MEMBER], total: 1 });
    if (p.startsWith("/api/admin/members"))   return json(route, { member: DUMMY_MEMBER, ok: true });
    if (p.startsWith("/api/admin/users"))     return json(route, { user: DUMMY_MEMBER, ok: true });

    // ── 어드민 매출 ──
    if (p.startsWith("/api/admin/dashboard/sales")) return json(route, {
      totalRevenue: 1500000,
      totalOrders: 12,
      totalRefunds: 1,
      dailySales: [],
      topProducts: [],
      refundRate: 0.05,
    });

    // ── 어드민 영상 선물 ──
    if (p === "/api/admin/video-grants")      return json(route, { grants: [] });
    if (p.startsWith("/api/admin/video-grants")) return json(route, { ok: true });

    // ── 어드민 페이지 편집 ──
    if (p === "/api/admin/page-overrides")    return json(route, { overrides: {} });
    if (p.startsWith("/api/admin/page-overrides")) return json(route, { ok: true });

    // ── SMS ──
    if (p === "/api/sms/config")              return json(route, { aligoConfigured: true, kakaoConfigured: true, fcmConfigured: true, sender: "010-1234-5678", schedulerEnabled: true });
    if (p === "/api/sms/history" || p === "/api/sms/auto-history") return json(route, { items: [] });
    if (p.startsWith("/api/sms"))             return json(route, { ok: true, successCnt: 1, errorCnt: 0 });

    // ── 스튜디오 어드민 ──
    if (p === "/api/studio/admin/classes")    return json(route, { classes: [DUMMY_CLASS] });
    if (p.startsWith("/api/studio/admin/classes/") && p.endsWith("/bookings")) return json(route, { bookings: [] });
    if (p.startsWith("/api/studio/admin/classes/") && p.endsWith("/checkins")) return json(route, { checkins: [] });
    if (p.startsWith("/api/studio/admin/classes/") && p.endsWith("/waitlist")) return json(route, { waitlist: [] });
    if (p.startsWith("/api/studio/admin/classes")) return json(route, { class: DUMMY_CLASS, ok: true });
    if (p === "/api/studio/admin/passes")     return json(route, { passes: [DUMMY_PASS] });
    if (p.startsWith("/api/studio/admin/passes")) return json(route, { pass: DUMMY_PASS, ok: true });
    if (p === "/api/studio/admin/members" || p === "/api/studio/admin/member-summaries") return json(route, { members: [DUMMY_MEMBER], total: 1 });
    if (p.startsWith("/api/studio/admin/memos")) return json(route, { memos: [], ok: true });
    if (p === "/api/studio/admin/notifications") return json(route, { notifications: [] });
    if (p === "/api/studio/admin/notification-templates") return json(route, { templates: [] });
    if (p.startsWith("/api/studio/admin/notifications")) return json(route, { ok: true });
    if (p === "/api/studio/admin/roles")      return json(route, { roles: [] });
    if (p === "/api/studio/admin/role-permissions") return json(route, { permissions: [] });
    if (p.startsWith("/api/studio/admin/roles")) return json(route, { ok: true });
    if (p === "/api/studio/admin/rooms")      return json(route, { rooms: [] });
    if (p.startsWith("/api/studio/admin/rooms")) return json(route, { ok: true });
    if (p === "/api/studio/admin/settings")   return json(route, {
      businessName: "이끌림 필라테스",
      address: "광주",
      phone: "062-123-4567",
      businessHours: {},
    });
    if (p.startsWith("/api/studio/admin/settings")) return json(route, { ok: true });
    if (p === "/api/studio/admin/class-categories") return json(route, { categories: [] });
    if (p.startsWith("/api/studio/admin/class-categories")) return json(route, { ok: true });
    if (p === "/api/studio/admin/member-grades") return json(route, { grades: [] });
    if (p === "/api/studio/admin/member-grades/enabled") return json(route, { grades: [] });
    if (p.startsWith("/api/studio/admin/member-grades")) return json(route, { ok: true });
    if (p === "/api/studio/admin/message-templates") return json(route, { templates: [] });
    if (p.startsWith("/api/studio/admin/message-templates")) return json(route, { ok: true });
    if (p === "/api/studio/admin/notices")    return json(route, { notices: [] });
    if (p.startsWith("/api/studio/admin/notices")) return json(route, { ok: true });
    if (p === "/api/studio/admin/studio-staff" || p === "/api/admin/studio-staff") return json(route, { staff: [] });
    if (p === "/api/studio/admin/instructor-hours") return json(route, { hours: [] });
    if (p === "/api/studio/admin/lockers")    return json(route, { lockers: [] });
    if (p.startsWith("/api/studio/admin/lockers")) return json(route, { ok: true });
    if (p === "/api/studio/admin/locker-assignments") return json(route, { assignments: [] });
    if (p === "/api/studio/admin/arrears")    return json(route, { arrears: [] });
    if (p.startsWith("/api/studio/admin/arrears")) return json(route, { ok: true });
    if (p === "/api/studio/admin/checkins")   return json(route, { checkins: [] });
    if (p.startsWith("/api/studio/admin"))    return json(route, { ok: true, data: {} });

    // ── 스튜디오 일반 유저 ──
    if (p === "/api/studio/me/summary")       return json(route, { passes: [DUMMY_PASS], upcomingClasses: [] });
    if (p.startsWith("/api/studio/me"))       return json(route, { ok: true });

    // ── 어드민 패스 상품 ──
    if (p === "/api/admin/pass-products" || p === "/api/admin/goods") return json(route, { products: [DUMMY_PRODUCT] });
    if (p.startsWith("/api/admin/pass-products") || p.startsWith("/api/admin/goods")) return json(route, { product: DUMMY_PRODUCT, ok: true });

    // ── 결제 ──
    if (p.startsWith("/api/payments"))        return json(route, { ok: true });

    // ── 환불 ──
    if (p === "/api/refunds/admin")           return json(route, { refunds: [] });
    if (p.startsWith("/api/refunds/admin"))   return json(route, { ok: true });

    // ── 그 외 모든 API ──
    return json(route, { ok: true, data: {}, items: [], list: [], results: [] });
  });
}

// ── 헬퍼: 오버플로 감지 ─────────────────────────────────────────────────────
async function checkOverflow(page) {
  return page.evaluate(() => {
    const scrollW = document.documentElement.scrollWidth;
    const clientW = document.documentElement.clientWidth;
    const overflowElems = [];

    document.querySelectorAll("*").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth + 2) {
        const tag = el.tagName.toLowerCase();
        const cls = el.className && typeof el.className === "string"
          ? el.className.slice(0, 60)
          : "";
        overflowElems.push(`${tag}.${cls} (right:${Math.round(rect.right)})`);
      }
    });

    return {
      hasOverflow: scrollW > clientW + 2,
      scrollWidth: scrollW,
      clientWidth: clientW,
      diff: scrollW - clientW,
      overflowElems: [...new Set(overflowElems)].slice(0, 5),
    };
  });
}

// ── 헬퍼: 스크린샷 저장 ─────────────────────────────────────────────────────
async function saveScreenshot(page, label, pageName) {
  const dir = path.join(SCREENSHOT_DIR, label);
  await fs.mkdir(dir, { recursive: true });
  const safe = pageName.replace(/[^a-z0-9가-힣]/gi, "_");
  const filePath = path.join(dir, `${safe}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

// ── 헬퍼: 페이지 테스트 실행 ─────────────────────────────────────────────────
async function testPage(page, route, pageName, vp, options = {}) {
  const { clickSelectors = [], waitForSelector = null } = options;
  const result = { page: pageName, viewport: vp.label, route, overflow: false, overflowElems: [], errors: [], clicks: [] };

  // 콘솔 에러 수집
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 120));
  });

  try {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 15000 });

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 5000 }).catch(() => {});
    } else {
      await page.waitForTimeout(600);
    }

    // 스크린샷
    await saveScreenshot(page, vp.label, pageName);

    // 오버플로 체크
    const overflow = await checkOverflow(page);
    result.overflow = overflow.hasOverflow;
    result.overflowElems = overflow.overflowElems;
    result.overflowDiff = overflow.diff;

    // 인터랙션 테스트
    for (const sel of clickSelectors) {
      try {
        const el = page.locator(sel).first();
        const visible = await el.isVisible({ timeout: 1500 }).catch(() => false);
        if (visible) {
          await el.click({ timeout: 2000 });
          await page.waitForTimeout(400);
          result.clicks.push({ sel, ok: true });
        } else {
          result.clicks.push({ sel, ok: false, reason: "not visible" });
        }
      } catch (e) {
        result.clicks.push({ sel, ok: false, reason: e.message.slice(0, 60) });
      }
    }

    result.errors = consoleErrors;
  } catch (e) {
    result.loadError = e.message.slice(0, 120);
  }

  auditResults.push(result);
  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// 테스트 시작
// ══════════════════════════════════════════════════════════════════════════════

test.describe("반응형 UI 전체 감사", () => {

  // ── 공개 페이지 ─────────────────────────────────────────────────────────────
  test.describe("공개 페이지 (로그인 불필요)", () => {

    for (const vp of VIEWPORTS) {
      test(`홈 페이지 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/", "홈", vp, {
          clickSelectors: [
            "button.mobile-nav-toggle",
            ".sunlit-nav a:first-child",
          ],
        });
        if (r.overflow) console.log(`  ⚠ 오버플로 감지 [${vp.label}] diff:${r.overflowDiff}px`, r.overflowElems);
      });

      test(`로그인 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/login", "로그인", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`회원가입 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/signup", "회원가입", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`아이디 찾기 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/find-id", "아이디찾기", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`비밀번호 재설정 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/reset-password", "비밀번호재설정", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`장바구니 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/cart", "장바구니", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`아카데미 목록 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/academy", "아카데미목록", vp, {
          clickSelectors: [".academy-tab", ".academy-catalog-toolbar button"],
        });
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`수업 소개 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/ikleulrim/intro", "수업소개", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`강사진 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/ikleulrim/instructors", "강사진", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`장비 소개 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/ikleulrim/equipment", "장비소개", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`오시는 길 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/ikleulrim/directions", "오시는길", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`이벤트 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/community/events", "이벤트", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`후기 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/community/reviews", "후기", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`문의 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, null);
        await page.route("**/api/auth/me", (r) => json(r, { user: null }, 401));
        const r = await testPage(page, "/community/inquiry", "문의", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });
    }
  });

  // ── 로그인 필요 페이지 (일반 유저) ─────────────────────────────────────────
  test.describe("로그인 필요 페이지 (일반 유저)", () => {

    for (const vp of VIEWPORTS) {
      test(`마이페이지 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, NORMAL_USER);
        const r = await testPage(page, "/mypage", "마이페이지", vp, {
          clickSelectors: [".mypage-redesign-tab", ".mypage-redesign-panel button:first-child"],
        });
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`수업 예약 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, NORMAL_USER);
        const r = await testPage(page, "/pilates/reservation", "수업예약", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });
    }
  });

  // ── 어드민 페이지 ───────────────────────────────────────────────────────────
  test.describe("어드민 페이지", () => {

    for (const vp of VIEWPORTS) {
      test(`어드민 대시보드 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin", "어드민_대시보드", vp, {
          clickSelectors: [
            ".admin-dashboard-switch-link:nth-child(2)",
            ".admin-member-tab",
          ],
        });
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 스케줄 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/studio", "어드민_스케줄", vp, {
          clickSelectors: [".admin-schedule-nav a:nth-child(2)"],
        });
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 매출 대시보드 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/sales", "어드민_매출", vp, {
          clickSelectors: [".admin-sales-period-tab"],
        });
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 수업 목록 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/classes", "어드민_수업목록", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 강사 관리 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/instructors", "어드민_강사관리", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 상품 관리 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/products", "어드민_상품관리", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 수강권 관리 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/passes", "어드민_수강권관리", vp, {
          clickSelectors: [".admin-schedule-nav a:nth-child(2)"],
        });
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 현장 운영 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/operations", "어드민_현장운영", vp, {
          clickSelectors: [".admin-operations-tabs button:nth-child(2)"],
        });
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 설정 목록 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/settings", "어드민_설정목록", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 기본 설정 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/settings/basic", "어드민_기본설정", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 운영 설정 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/settings/operation", "어드민_운영설정", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 권한 설정 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/settings/roles", "어드민_권한설정", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 알림 설정 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/settings/notifications", "어드민_알림설정", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 룸 설정 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/settings/rooms", "어드민_룸설정", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 메시지 발송 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/messages", "어드민_메시지", vp, {
          clickSelectors: [".icl-message-page-tab:nth-child(2)"],
        });
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 게시판 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/board", "어드민_게시판", vp, {
          clickSelectors: [".admin-board-tabs button:nth-child(2)"],
        });
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 환불 관리 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/refunds", "어드민_환불관리", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });

      test(`어드민 영상 선물 [${vp.label}]`, async ({ page }) => {
        await mockAllApis(page, ADMIN_USER);
        const r = await testPage(page, "/admin/video-gifts", "어드민_영상선물", vp);
        if (r.overflow) console.log(`  ⚠ 오버플로 [${vp.label}]`, r.overflowElems);
      });
    }
  });

  // ── 최종 결과 리포트 ────────────────────────────────────────────────────────
  test("📊 감사 결과 리포트 출력", async () => {
    await new Promise((r) => setTimeout(r, 500));

    const overflowPages = auditResults.filter((r) => r.overflow);
    const errorPages   = auditResults.filter((r) => r.errors && r.errors.length > 0);
    const loadFailed   = auditResults.filter((r) => r.loadError);

    console.log("\n═══════════════════════════════════════════");
    console.log("  반응형 UI 감사 결과");
    console.log("═══════════════════════════════════════════");
    console.log(`  총 테스트: ${auditResults.length}건`);
    console.log(`  ✅ 정상: ${auditResults.length - overflowPages.length - loadFailed.length}건`);
    console.log(`  ⚠ 오버플로 발생: ${overflowPages.length}건`);
    console.log(`  ❌ 로드 실패: ${loadFailed.length}건`);

    if (overflowPages.length > 0) {
      console.log("\n── 오버플로 발생 페이지 ──");
      overflowPages.forEach((r) => {
        console.log(`  [${r.viewport}] ${r.page} (+${r.overflowDiff}px)`);
        r.overflowElems.forEach((e) => console.log(`    └ ${e}`));
      });
    }

    if (loadFailed.length > 0) {
      console.log("\n── 로드 실패 페이지 ──");
      loadFailed.forEach((r) => console.log(`  [${r.viewport}] ${r.page}: ${r.loadError}`));
    }

    console.log(`\n  📁 스크린샷: ${SCREENSHOT_DIR}`);
    console.log("═══════════════════════════════════════════\n");

    // 결과를 파일로도 저장
    const reportPath = path.join(SCREENSHOT_DIR, "audit-report.json");
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({ summary: { total: auditResults.length, overflow: overflowPages.length, failed: loadFailed.length }, overflowPages, loadFailed, all: auditResults }, null, 2), "utf-8");
    console.log(`  📄 리포트 저장: ${reportPath}`);
  });
});

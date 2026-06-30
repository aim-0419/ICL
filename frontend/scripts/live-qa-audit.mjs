import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.QA_BASE_URL || "http://localhost:5173";
const API_BASE_URL = process.env.QA_API_BASE_URL || "http://localhost:4000";
const OUTPUT_DIR = path.resolve("../tmp/live-qa");
const SESSION_PATH = path.resolve("../tmp/qa-sessions.json");

const requestedViewports = [
  { label: "320", width: 320, height: 900 },
  { label: "375", width: 375, height: 1000 },
  { label: "390", width: 390, height: 1000 },
  { label: "414", width: 414, height: 1000 },
  { label: "768", width: 768, height: 1100 },
  { label: "820", width: 820, height: 1180 },
  { label: "1024", width: 1024, height: 900 },
  { label: "1280", width: 1280, height: 900 },
  { label: "1440", width: 1440, height: 1000 },
  { label: "1920", width: 1920, height: 1080 },
];

const routes = [
  { name: "home", path: "/", auth: "none" },
  { name: "login", path: "/login", auth: "none" },
  { name: "signup", path: "/signup", auth: "none" },
  { name: "find-id", path: "/find-id", auth: "none" },
  { name: "reset-password", path: "/reset-password", auth: "none" },
  { name: "cart", path: "/cart", auth: "user" },
  { name: "academy", path: "/academy", auth: "none" },
  { name: "brand-intro", path: "/ikleulrim/intro", auth: "none" },
  { name: "instructors", path: "/ikleulrim/instructors", auth: "none" },
  { name: "equipment", path: "/ikleulrim/equipment", auth: "none" },
  { name: "directions", path: "/ikleulrim/directions", auth: "none" },
  { name: "events", path: "/community/events", auth: "none" },
  { name: "reviews", path: "/community/reviews", auth: "none" },
  { name: "inquiry", path: "/community/inquiry", auth: "user" },
  { name: "mypage", path: "/mypage", auth: "user" },
  { name: "pilates-reservation", path: "/pilates/reservation", auth: "user" },
  { name: "admin-dashboard", path: "/admin", auth: "admin" },
  { name: "admin-studio", path: "/admin/studio", auth: "admin" },
  { name: "admin-sales", path: "/admin/sales", auth: "admin" },
  { name: "admin-classes", path: "/admin/classes", auth: "admin" },
  { name: "admin-instructors", path: "/admin/instructors", auth: "admin" },
  { name: "admin-products", path: "/admin/products", auth: "admin" },
  { name: "admin-passes", path: "/admin/passes", auth: "admin" },
  { name: "admin-operations", path: "/admin/operations", auth: "admin" },
  { name: "admin-settings", path: "/admin/settings", auth: "admin" },
  { name: "admin-settings-basic", path: "/admin/settings/basic", auth: "admin" },
  { name: "admin-settings-operation", path: "/admin/settings/operation", auth: "admin" },
  { name: "admin-settings-roles", path: "/admin/settings/roles", auth: "admin" },
  { name: "admin-settings-notifications", path: "/admin/settings/notifications", auth: "admin" },
  { name: "admin-settings-rooms", path: "/admin/settings/rooms", auth: "admin" },
  { name: "admin-board", path: "/admin/board", auth: "admin" },
  { name: "admin-refunds", path: "/admin/refunds", auth: "admin" },
  { name: "admin-video-gifts", path: "/admin/video-gifts", auth: "admin" },
];

const apiChecks = [
  { name: "auth-me-public", path: "/api/auth/me", auth: "none", expected: [200] },
  { name: "auth-me-user", path: "/api/auth/me", auth: "user", expected: [200] },
  { name: "auth-me-admin", path: "/api/auth/me", auth: "admin", expected: [200] },
  { name: "products", path: "/api/products", auth: "none", expected: [200] },
  { name: "academy-videos", path: "/api/academy/videos", auth: "none", expected: [200] },
  { name: "academy-progress", path: "/api/academy/progress", auth: "user", expected: [200] },
  { name: "points", path: "/api/users/me/points", auth: "user", expected: [200] },
  { name: "cart", path: "/api/cart", auth: "user", expected: [200] },
  { name: "orders", path: "/api/orders", auth: "user", expected: [200] },
  { name: "events", path: "/api/community/events", auth: "none", expected: [200] },
  { name: "reviews", path: "/api/community/reviews", auth: "none", expected: [200] },
  { name: "inquiries", path: "/api/community/inquiries", auth: "user", expected: [200] },
  { name: "social-latest", path: "/api/community/social/latest", auth: "none", expected: [200] },
  { name: "brand-instructors", path: "/api/brand/instructors", auth: "none", expected: [200] },
  { name: "studio-classes", path: "/api/studio/classes", auth: "none", expected: [200] },
  { name: "studio-me-summary", path: "/api/studio/me/summary", auth: "user", expected: [200] },
  { name: "admin-members", path: "/api/admin/members", auth: "admin", expected: [200] },
  { name: "admin-dashboard-users", path: "/api/admin/dashboard/users", auth: "admin", expected: [200] },
  { name: "admin-sales", path: "/api/admin/dashboard/sales", auth: "admin", expected: [200] },
  { name: "admin-refund-insights", path: "/api/admin/dashboard/sales/refund-insights", auth: "admin", expected: [200] },
  { name: "admin-video-grants", path: "/api/admin/video-grants", auth: "admin", expected: [200] },
  { name: "admin-page-overrides", path: "/api/admin/page-overrides", auth: "admin", expected: [200] },
  { name: "studio-admin-classes", path: "/api/studio/admin/classes", auth: "admin", expected: [200] },
  { name: "studio-admin-bookings", path: "/api/studio/admin/bookings", auth: "admin", expected: [200] },
  { name: "studio-admin-pass-transactions", path: "/api/studio/admin/pass-transactions", auth: "admin", expected: [200] },
  { name: "studio-admin-members", path: "/api/studio/admin/member-summaries", auth: "admin", expected: [200] },
  { name: "studio-admin-settings", path: "/api/studio/admin/settings", auth: "admin", expected: [200] },
  { name: "studio-admin-arrears", path: "/api/studio/admin/arrears", auth: "admin", expected: [200] },
  { name: "studio-admin-lockers", path: "/api/studio/admin/lockers", auth: "admin", expected: [200] },
  { name: "sms-config", path: "/api/sms/config", auth: "admin", expected: [200] },
  { name: "sms-history", path: "/api/sms/history", auth: "admin", expected: [200] },
];

const dangerousButtonPattern =
  /(delete|withdraw|refund|pay|purchase|logout|save|submit|confirm|apply|upload|download|gift|\uC0AD\uC81C|\uD0C8\uD1F4|\uD658\uBD88|\uACB0\uC81C|\uAD6C\uB9E4|\uB85C\uADF8\uC544\uC6C3|\uC120\uBB3C|\uC800\uC7A5|\uB4F1\uB85D|\uC0DD\uC131|\uBC1C\uAE09|\uC2B9\uC778|\uAC70\uC808|\uCDE8\uC18C|\uD655\uC778|\uC801\uC6A9|\uC5C5\uB85C\uB4DC|\uB2E4\uC6B4\uB85C\uB4DC)/i;

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

async function readSessions() {
  const raw = await fs.readFile(SESSION_PATH, "utf8");
  return JSON.parse(raw);
}

function cookieFor(auth, sessions) {
  if (auth === "admin") return sessions.admin?.token || "";
  if (auth === "user") return sessions.user?.token || "";
  return "";
}

async function addAuthCookie(context, auth, sessions) {
  const token = cookieFor(auth, sessions);
  if (!token) return;
  await context.addCookies([
    {
      name: "icl_session",
      value: token,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function requestJson(pathname, { method = "GET", body, auth = "none", sessions } = {}) {
  const headers = { Accept: "application/json" };
  const token = cookieFor(auth, sessions);
  if (token) headers.Cookie = `icl_session=${encodeURIComponent(token)}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const startedAt = Date.now();
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, durationMs: Date.now() - startedAt, data };
}

async function waitForSettled(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 1200 }).catch(() => {});
  await page.waitForTimeout(100);
}

async function analyzeUi(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };

    const buttons = Array.from(document.querySelectorAll("button, a, [role='button']"))
      .filter(visible)
      .map((el) => ({
        text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim(),
        tag: el.tagName.toLowerCase(),
        href: el.getAttribute("href") || "",
      }));

    const inputs = Array.from(document.querySelectorAll("input, textarea, select"))
      .filter(visible)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || "",
        name: el.getAttribute("name") || "",
        placeholder: el.getAttribute("placeholder") || "",
        aria: el.getAttribute("aria-label") || "",
        ariaLabelledby: el.getAttribute("aria-labelledby") || "",
        id: el.id || "",
        hasLabel: Boolean(
          el.closest("label") ||
            (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
            el.getAttribute("aria-labelledby")
        ),
      }));

    const missingLabels = inputs.filter((input) => !input.placeholder && !input.aria && !input.hasLabel);
    const focusable = Array.from(document.querySelectorAll("a[href], button, input, textarea, select, [tabindex]"))
      .filter(visible)
      .filter((el) => !el.disabled && el.getAttribute("tabindex") !== "-1").length;

    return { buttonCount: buttons.length, inputCount: inputs.length, missingLabels, focusable };
  });
}

async function analyzeOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const clientWidth = doc.clientWidth;
    const scrollWidth = doc.scrollWidth;
    const offenders = Array.from(document.body.querySelectorAll("*"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const style = window.getComputedStyle(el);
        if (style.position === "fixed" && rect.left < 0) return null;
        if (rect.right > clientWidth + 1 || rect.left < -1) {
          const label =
            el.className && typeof el.className === "string"
              ? `.${el.className.trim().replace(/\s+/g, ".")}`
              : el.tagName.toLowerCase();
          return {
            label,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 10);

    return {
      hasOverflow: scrollWidth > clientWidth + 1 || offenders.length > 0,
      clientWidth,
      scrollWidth,
      diff: scrollWidth - clientWidth,
      offenders,
    };
  });
}

async function exerciseSafeControls(page, route) {
  const result = { clicked: 0, skipped: 0, failed: [] };
  const descriptors = await page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    return Array.from(document.querySelectorAll("button, [role='button']"))
      .filter(visible)
      .map((el, index) => ({
        index,
        text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim(),
      }));
  });

  if (route.auth === "admin") {
    result.skipped = descriptors.length;
    result.note = "admin clicks are verified with API/CRUD checks to avoid destructive random mutations";
    return result;
  }

  for (const descriptor of descriptors) {
    const label = descriptor.text || `button-${descriptor.index}`;
    if (!descriptor.text || dangerousButtonPattern.test(label)) {
      result.skipped += 1;
      continue;
    }
    try {
      const locator = page.locator("button, [role='button']").nth(descriptor.index);
      if (!(await locator.isVisible({ timeout: 500 }).catch(() => false))) {
        result.skipped += 1;
        continue;
      }
      await locator.click({ timeout: 1500 });
      result.clicked += 1;
      await page.keyboard.press("Escape").catch(() => {});
      if (!page.url().startsWith(`${BASE_URL}${route.path}`)) {
        await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded", timeout: 10000 });
        await waitForSettled(page);
      }
    } catch (error) {
      result.failed.push({ label, message: error.message.slice(0, 160) });
    }
  }
  return result;
}

async function exerciseInputs(page) {
  const result = { filled: 0, skipped: 0, failed: [] };
  const handles = await page.$$("input, textarea, select");
  for (let index = 0; index < handles.length; index += 1) {
    const handle = handles[index];
    try {
      const meta = await handle.evaluate((el) => ({
        tag: el.tagName.toLowerCase(),
        type: (el.getAttribute("type") || "").toLowerCase(),
        disabled: el.disabled,
        readonly: el.readOnly,
        visible: (() => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        })(),
      }));
      if (!meta.visible || meta.disabled || meta.readonly || ["file", "hidden", "checkbox", "radio", "submit", "button"].includes(meta.type)) {
        result.skipped += 1;
        continue;
      }
      const locator = page.locator("input, textarea, select").nth(index);
      if (meta.tag === "select") {
        const options = await locator.locator("option").evaluateAll((items) => items.map((item) => item.value).filter(Boolean));
        if (options[0]) {
          await locator.selectOption(options[0]).catch(() => {});
          result.filled += 1;
        } else {
          result.skipped += 1;
        }
      } else if (meta.type === "date") {
        await locator.fill("2026-06-29");
        result.filled += 1;
      } else if (meta.type === "datetime-local") {
        await locator.fill("2026-06-29T10:00");
        result.filled += 1;
      } else if (meta.type === "number") {
        await locator.fill("123");
        result.filled += 1;
      } else {
        await locator.fill("QA \uD14C\uC2A4\uD2B8 123 !@#");
        result.filled += 1;
      }
    } catch (error) {
      result.failed.push({ index, message: error.message.slice(0, 160) });
    }
  }
  return result;
}

async function auditPages(sessions) {
  await fs.mkdir(path.join(OUTPUT_DIR, "screenshots"), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const viewport of requestedViewports) {
    for (const route of routes) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        ignoreHTTPSErrors: true,
      });
      await addAuthCookie(context, route.auth, sessions);
      const page = await context.newPage();
      const errors = [];
      const warnings = [];
      const failedRequests = [];
      const badResponses = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(compactText(msg.text()));
        if (msg.type() === "warning") warnings.push(compactText(msg.text()));
      });
      page.on("pageerror", (error) => errors.push(compactText(error.message)));
      page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), reason: request.failure()?.errorText || "" }));
      page.on("response", (response) => {
        const status = response.status();
        const url = response.url();
        if (url.includes("/api/") && status >= 400) {
          badResponses.push({ status, url });
        }
      });

      const pageResult = {
        route: route.path,
        name: route.name,
        auth: route.auth,
        viewport: viewport.label,
        status: "ok",
        loadMs: 0,
        finalUrl: "",
        ui: null,
        overflow: null,
        consoleErrors: errors,
        warnings,
        failedRequests,
        badResponses,
        safeClicks: null,
        inputs: null,
        screenshot: "",
      };

      try {
        const startedAt = Date.now();
        await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
        await waitForSettled(page);
        pageResult.loadMs = Date.now() - startedAt;
        pageResult.finalUrl = page.url();
        pageResult.ui = await analyzeUi(page);
        pageResult.overflow = await analyzeOverflow(page);

        if (viewport.width === 1440) {
          pageResult.safeClicks = await exerciseSafeControls(page, route);
          pageResult.inputs = await exerciseInputs(page);
        }

        if (viewport.width === 375 || viewport.width === 1440) {
          const safeName = `${viewport.label}-${route.name}`.replace(/[^a-z0-9_-]+/gi, "-");
          const screenshotPath = path.join(OUTPUT_DIR, "screenshots", `${safeName}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          pageResult.screenshot = screenshotPath;
        }
      } catch (error) {
        pageResult.status = "failed";
        pageResult.error = error.message;
      } finally {
        results.push(pageResult);
        await context.close();
      }
    }
  }

  await browser.close();
  return results;
}

async function auditApis(sessions) {
  const results = [];
  for (const check of apiChecks) {
    try {
      const result = await requestJson(check.path, { auth: check.auth, sessions });
      results.push({
        ...check,
        status: result.status,
        durationMs: result.durationMs,
        ok: check.expected.includes(result.status),
        sample: typeof result.data === "object" ? Object.keys(result.data || {}).slice(0, 8) : String(result.data).slice(0, 80),
      });
    } catch (error) {
      results.push({ ...check, status: 0, durationMs: 0, ok: false, error: error.message });
    }
  }
  return results;
}

async function auditCrud(sessions) {
  const results = [];
  const productName = `QA Audit Product ${Date.now()}`;
  let productId = "";
  try {
    const created = await requestJson("/api/products", {
      method: "POST",
      auth: "admin",
      sessions,
      body: {
        name: productName,
        title: productName,
        description: "QA audit temporary product",
        price: 1000,
        durationDays: 30,
        isVisible: false,
      },
    });
    productId = created.data?.id || created.data?.product?.id || "";
    results.push({ name: "product-create", status: created.status, ok: [200, 201].includes(created.status), id: productId });

    if (productId) {
      const read = await requestJson("/api/products", { sessions });
      const exists = Array.isArray(read.data) && read.data.some((item) => String(item.id) === String(productId));
      results.push({ name: "product-read-after-create", status: read.status, ok: read.status === 200 && exists });

      const deleted = await requestJson(`/api/products/${encodeURIComponent(productId)}`, { method: "DELETE", auth: "admin", sessions });
      results.push({ name: "product-delete", status: deleted.status, ok: [200, 204].includes(deleted.status) });
    }
  } catch (error) {
    results.push({ name: "product-crud", status: 0, ok: false, error: error.message });
  }

  const overrideType = "qa-audit";
  const overrideKey = `qa-audit-${Date.now()}`;
  try {
    const created = await requestJson("/api/admin/page-overrides", {
      method: "POST",
      auth: "admin",
      sessions,
      body: { type: overrideType, key: overrideKey, value: { note: "qa" } },
    });
    results.push({ name: "page-override-create", status: created.status, ok: [200, 201].includes(created.status) });
    const read = await requestJson("/api/admin/page-overrides", { auth: "admin", sessions });
    const exists = Boolean(read.data?.overrides?.[overrideType]?.[overrideKey]);
    results.push({ name: "page-override-read", status: read.status, ok: read.status === 200 && exists });
    const deleted = await requestJson("/api/admin/page-overrides", {
      method: "DELETE",
      auth: "admin",
      sessions,
      body: { type: overrideType, key: overrideKey },
    });
    results.push({ name: "page-override-delete", status: deleted.status, ok: [200, 204].includes(deleted.status) });
  } catch (error) {
    results.push({ name: "page-override-crud", status: 0, ok: false, error: error.message });
  }

  return results;
}

function summarize(pageResults, apiResults, crudResults) {
  const overflows = pageResults.filter((item) => item.overflow?.hasOverflow);
  const consoleErrors = pageResults.flatMap((item) => item.consoleErrors.map((message) => ({ route: item.route, viewport: item.viewport, message })));
  const networkErrors = pageResults.flatMap((item) => [
    ...item.failedRequests.map((entry) => ({ route: item.route, viewport: item.viewport, ...entry })),
    ...item.badResponses.map((entry) => ({ route: item.route, viewport: item.viewport, ...entry })),
  ]);
  const missingLabels = pageResults.flatMap((item) =>
    (item.ui?.missingLabels || []).map((input) => ({ route: item.route, viewport: item.viewport, input }))
  );
  const clickedCount = pageResults.reduce((sum, item) => sum + (item.safeClicks?.clicked || 0), 0);
  const buttonCount = pageResults.reduce((sum, item) => sum + (item.ui?.buttonCount || 0), 0);
  const inputCount = pageResults.reduce((sum, item) => sum + (item.ui?.inputCount || 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    counts: {
      pagesVisited: pageResults.length,
      routes: routes.length,
      viewportCount: requestedViewports.length,
      buttonsSeen: buttonCount,
      safeButtonsClicked: clickedCount,
      inputsSeen: inputCount,
      apiChecked: apiResults.length,
      crudChecked: crudResults.length,
      pageFailures: pageResults.filter((item) => item.status !== "ok").length,
      overflows: overflows.length,
      consoleErrors: consoleErrors.length,
      networkErrors: networkErrors.length,
      missingLabels: missingLabels.length,
      apiFailures: apiResults.filter((item) => !item.ok).length,
      crudFailures: crudResults.filter((item) => !item.ok).length,
    },
    overflows,
    consoleErrors,
    networkErrors,
    missingLabels: missingLabels.slice(0, 200),
    apiResults,
    crudResults,
    pageResults,
  };
}

async function main() {
  const sessions = await readSessions();
  const pageResults = await auditPages(sessions);
  const apiResults = await auditApis(sessions);
  const crudResults = await auditCrud(sessions);
  const report = summarize(pageResults, apiResults, crudResults);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report.counts, null, 2));
  if (report.counts.pageFailures || report.counts.apiFailures || report.counts.crudFailures) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

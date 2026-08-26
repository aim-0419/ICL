/**
 * [화면 스타일 지문 촬영]
 *
 * 화면에 실제로 그려진 모든 요소의 최종 스타일 값을 통째로 기록합니다.
 * CSS 를 손보기 전에 한 번 찍어 두고, 손본 뒤 다시 찍어 비교하면
 * 의도하지 않게 틀어진 곳을 사람 눈 대신 정확히 찾아낼 수 있습니다.
 *
 * 왜 필요한가
 *   이 프로젝트의 CSS 는 같은 선택자가 여러 번 정의되어 있어(139개가 중복)
 *   나중에 나온 규칙이 앞의 것을 덮어써서 최종 모양이 정해집니다.
 *   파일을 쪼개거나 순서를 바꾸면 "누가 이기는지"가 뒤바뀌는데,
 *   이런 고장은 빌드도 통과하고 오류도 안 나서 눈으로만 알 수 있습니다.
 *   이 도구가 그 눈 역할을 대신합니다.
 *
 * 사용법
 *   1) 미리보기 서버를 띄운다:  npm run preview
 *   2) 바꾸기 전에 찍는다:      npm run style:snapshot -- before.json
 *   3) CSS 를 수정한 뒤 빌드하고 다시 찍는다: npm run style:snapshot -- after.json
 *   4) 비교한다:                npm run style:diff -- before.json after.json
 *
 * 한계
 *   로그인 없이 열리는 화면만 촬영합니다. 관리자 화면과 모달·드롭다운처럼
 *   조작해야 나타나는 상태는 아직 포함되지 않습니다.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import crypto from "node:crypto";

const require_ = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require_("@playwright/test");

const BASE = process.env.STYLE_SNAPSHOT_BASE_URL || "http://127.0.0.1:4173";
const output = process.argv[2];

if (!output) {
  console.error("[style-snapshot] 저장할 파일 경로가 필요합니다.\n  npm run style:snapshot -- before.json");
  process.exit(1);
}

// 레이아웃과 겉모습을 결정하는 값만 기록합니다. 전부 담으면 의미 없는 차이가 섞입니다.
const PROPERTIES = [
  "display", "position", "top", "right", "bottom", "left", "z-index", "float", "clear",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-radius", "box-sizing", "overflow-x", "overflow-y",
  "flex-direction", "flex-wrap", "justify-content", "align-items", "align-self",
  "gap", "order", "flex-grow", "flex-shrink", "flex-basis",
  "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
  "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
  "text-align", "text-transform", "white-space",
  "color", "background-color", "background-image", "opacity", "visibility",
  "box-shadow", "transform",
];

const ROUTES = [
  ["홈", "/"],
  ["로그인", "/login"],
  ["회원가입", "/signup"],
  ["아카데미", "/academy"],
  ["장바구니", "/cart"],
  ["브랜드소개", "/ikleulrim/intro"],
  ["강사소개", "/ikleulrim/instructors"],
  ["기구소개", "/ikleulrim/equipment"],
  ["이용약관", "/terms"],
  ["개인정보", "/privacy"],
  ["이벤트", "/community/events"],
  ["문의", "/community/inquiry"],
  ["수업예약", "/pilates/reservation"],
];

const VIEWPORTS = [
  ["데스크톱", 1280, 900],
  ["모바일", 375, 812],
  ["태블릿", 768, 1024],
];

const browser = await chromium.launch();
const snapshot = {};
let failures = 0;

for (const [viewName, width, height] of VIEWPORTS) {
  for (const [routeName, route] of ROUTES) {
    const page = await browser.newPage({ viewport: { width, height } });
    const label = `${viewName}/${routeName}`;
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(400);
      snapshot[label] = await page.evaluate((properties) => {
        const rows = [];
        let index = 0;
        for (const element of document.querySelectorAll("body *")) {
          const computed = getComputedStyle(element);
          const values = properties.map((name) => computed.getPropertyValue(name)).join("|");
          const className = String(element.className || "").trim().slice(0, 60);
          rows.push(`${index}:${element.tagName}.${className} => ${values}`);
          index += 1;
        }
        return rows;
      }, PROPERTIES);
    } catch (error) {
      snapshot[label] = [`ERROR: ${error.message}`];
      failures += 1;
    }
    await page.close();
  }
}
await browser.close();

fs.writeFileSync(output, JSON.stringify(snapshot), "utf8");

const elementCount = Object.values(snapshot).reduce((sum, rows) => sum + rows.length, 0);
const fingerprint = crypto.createHash("sha1").update(JSON.stringify(snapshot)).digest("hex").slice(0, 12);

console.log(`[style-snapshot] 화면 ${Object.keys(snapshot).length}개, 요소 ${elementCount}개 기록`);
console.log(`[style-snapshot] 지문: ${fingerprint}`);
console.log(`[style-snapshot] 저장: ${output}`);
if (failures > 0) console.warn(`[style-snapshot] 주의: ${failures}개 화면을 열지 못했습니다.`);

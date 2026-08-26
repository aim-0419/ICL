/**
 * 공개 페이지 이미지 무결성 테스트.
 *
 * 기본 이미지를 webp로 교체한 뒤 경로가 어긋나 깨진 이미지가 남지 않는지 확인합니다.
 * 백엔드 없이 정적 빌드만으로 실행되며, DB에 저장된 override 대신
 * DEFAULT_PAGE_IMAGE_OVERRIDES 기본값 경로를 검증합니다.
 */
import { expect, test } from "@playwright/test";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.VITE_E2E_BASE_URL || "";

const PAGES = [
  { path: "/", name: "홈" },
  { path: "/ikleulrim/intro", name: "브랜드 소개" },
  { path: "/ikleulrim/instructors", name: "강사 소개" },
  { path: "/ikleulrim/equipment", name: "기구 소개" },
];

test.describe("공개 페이지 이미지 무결성", () => {
  test.skip(!configuredBaseUrl, "PLAYWRIGHT_BASE_URL 이 설정된 경우에만 실행합니다.");

  for (const target of PAGES) {
    test(`${target.name} 페이지의 이미지가 모두 로드된다`, async ({ page }) => {
      const failedRequests = [];
      const consoleErrors = [];

      page.on("response", (response) => {
        // API 응답은 백엔드 없이 실행하므로 이미지/정적 자산만 확인합니다.
        const url = response.url();
        if (response.status() >= 400 && !url.includes("/api/")) {
          failedRequests.push(`${response.status()} ${url}`);
        }
      });
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        // 자산 로드 실패는 broken/failedRequests 로 이미 판정합니다.
        // 백엔드를 띄우지 않고 정적 빌드만 검증하므로 API 연결 실패는 제외합니다.
        if (text.includes("Failed to load resource")) return;
        consoleErrors.push(text);
      });

      await page.goto(target.path, { waitUntil: "networkidle" });

      // 화면에 실제로 그려진 img 중 디코딩에 실패한(naturalWidth 0) 것을 찾습니다.
      const broken = await page.evaluate(() =>
        Array.from(document.images)
          .filter((img) => img.currentSrc && img.naturalWidth === 0)
          .map((img) => img.currentSrc),
      );

      expect(broken, `깨진 이미지: ${broken.join(", ")}`).toEqual([]);
      expect(failedRequests, `실패한 자산 요청: ${failedRequests.join(", ")}`).toEqual([]);
      expect(consoleErrors, `Console 오류: ${consoleErrors.join(" | ")}`).toEqual([]);
    });
  }

  test("교체한 webp 자산이 실제로 200으로 응답한다", async ({ request }) => {
    const assets = [
      "/assets/admin-defaults/instructors/instructor-05.webp",
      "/assets/admin-defaults/instructors/instructor-01.webp",
      "/assets/admin-defaults/equipment/equipment-05.webp",
      "/assets/admin-defaults/intro/director-photo.webp",
      "/assets/images/intro/intro-main.webp",
      "/assets/images/home/certificate-template-a4.webp",
    ];
    for (const asset of assets) {
      const response = await request.get(asset);
      expect(response.status(), `${asset} 응답 상태`).toBe(200);
      expect(response.headers()["content-type"], `${asset} content-type`).toContain("image/webp");
    }
  });
});

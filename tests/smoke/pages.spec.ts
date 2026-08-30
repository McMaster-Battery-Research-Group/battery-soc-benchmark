import { test, expect, type Page } from "@playwright/test";

/**
 * Every listed page must render without: an uncaught client exception, a React hydration error,
 * Next's "Application error" screen, or a 5xx response. Console errors are collected too, minus
 * harmless resource 404s (e.g. missing avatars). Public pages only — nothing here signs in,
 * submits or mutates.
 */

const STATIC_ROUTES = [
  "/",
  "/leaderboard",
  "/compare",
  "/contest",
  "/getting-started",
  "/examples",
  "/dataset",
  "/docs",
  "/glossary",
  "/help",
  "/about",
  "/people/phil-kollmeyer", // redirects to the researcher profile
  "/people/mina-nassim", // static person page
  "/login",
  "/register",
];

function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Failed to load resource.*(404|403)/.test(text)) return; // missing avatar/logo images are not crashes
    // Local-run artefacts, impossible in production (same origin there): the production env points
    // NEXT_PUBLIC_SITE_URL at the deployed host, so prefetching absolute links from localhost trips CSP.
    if (/Content Security Policy/.test(text) || /Failed to fetch RSC payload/.test(text)) return;
    problems.push(`console.error: ${text.slice(0, 300)}`);
  });
  return problems;
}

async function assertHealthy(page: Page, problems: string[], route: string) {
  // short idle wait: pages with pollers never go network-idle, so cap it — hydration errors surface well within this
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  await expect(page.locator("body")).not.toContainText("Application error", { timeout: 1000 });
  expect(problems, `${route} raised client errors`).toEqual([]);
}

for (const route of STATIC_ROUTES) {
  test(`renders ${route}`, async ({ page }) => {
    const problems = watch(page);
    const res = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(res, `${route} returned no response`).not.toBeNull();
    expect(res!.status(), `${route} returned ${res!.status()}`).toBeLessThan(500);
    await assertHealthy(page, problems, route);
  });
}

test("renders a real results page (via the leaderboard)", async ({ page }) => {
  await page.goto("/leaderboard", { waitUntil: "domcontentloaded" });
  const link = page.locator('a[href^="/submissions/"]').first();
  if ((await link.count()) === 0) test.skip(true, "no public submissions in this database");
  const href = await link.getAttribute("href");
  const problems = watch(page);
  const res = await page.goto(href!, { waitUntil: "domcontentloaded" });
  expect(res!.status()).toBeLessThan(500);
  // the parts of the results page that have broken before
  await expect(page.getByRole("heading", { name: "Scorecard" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("body")).toContainText("Weighted error");
  await assertHealthy(page, problems, href!);
});

test("renders the compare page with models selected", async ({ page }) => {
  await page.goto("/leaderboard", { waitUntil: "domcontentloaded" });
  const links = page.locator('a[href^="/submissions/"]');
  if ((await links.count()) < 2) test.skip(true, "not enough public submissions");
  const ids = await Promise.all([links.nth(0).getAttribute("href"), links.nth(1).getAttribute("href")]);
  const problems = watch(page);
  await page.goto(`/compare?ids=${ids.map((h) => h!.split("/").pop()).join(",")}`, { waitUntil: "domcontentloaded" });
  await assertHealthy(page, problems, "/compare?ids=…");
});

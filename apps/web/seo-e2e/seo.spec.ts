import { expect, test } from "@playwright/test";

const ORIGIN = "https://www.mymacademiadebaile.com.ar";
const stylePaths = ["salsa", "fitdance", "stretching", "ritmos-latinos", "bachata-sensual"]
  .map((slug) => `/clases/${slug}-la-plata`);
const publicPaths = ["/", "/clases", "/horarios", "/contacto", ...stylePaths, "/profesores", "/profesores/docente-prueba"];

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => route.abort());
});

test("all sitemap entries resolve and match canonical, Open Graph and structured URLs", async ({ request, page }) => {
  const response = await request.get("/sitemap.xml", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const xml = await response.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  expect(urls.sort()).toEqual(publicPaths.map((path) => `${ORIGIN}${path}`).sort());
  expect(xml).not.toContain("<lastmod>");

  for (const path of publicPaths) {
    // HTML-limited bot gets server metadata before streaming, like SEO crawlers.
    const htmlResponse = await request.get(path, { headers: { "User-Agent": "Twitterbot" }, maxRedirects: 0 });
    expect(htmlResponse.status(), path).toBe(200);
    const html = await htmlResponse.text();
    await page.setContent(html);
    // Next serializes the origin-only canonical without "/". URL.href makes
    // the equivalent root spelling comparable without changing slash redirects.
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute("content");
    expect(new URL(canonical!).href, path).toBe(`${ORIGIN}${path}`);
    expect(new URL(ogUrl!).href, path).toBe(`${ORIGIN}${path}`);
    const robotsTag = page.locator('meta[name="robots"]');
    // No robots tag also means index/follow (real professor metadata omits it).
    const robots = await robotsTag.count() ? await robotsTag.getAttribute("content") : "";
    expect(robots, path).not.toMatch(/noindex|nofollow/);
    const graphs = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(graphs.length, path).toBeGreaterThan(0);
    for (const graph of graphs) {
      const data = JSON.parse(graph);
      const visit = (value: unknown, key = "") => {
        if (Array.isArray(value)) value.forEach((item) => visit(item));
        else if (value && typeof value === "object") Object.entries(value).forEach(([name, item]) => visit(item, name));
        else if (typeof value === "string" && ["url", "@id", "logo", "image", "item"].includes(key)) {
          expect(value, `${path}: ${key}`).toMatch(/^https:\/\//);
          if (!value.startsWith("https://res.cloudinary.com/")) expect(value.startsWith(`${ORIGIN}/`)).toBe(true);
        }
      };
      visit(data);
    }
  }
});

test("robots advertises the official sitemap and keeps the public site crawlable", async ({ request }) => {
  const response = await request.get("/robots.txt", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).toContain("Allow: /");
  expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  expect(text).not.toContain("vercel.app");
  expect(text).not.toMatch(/^Disallow: \/$/m);
});

test("unknown pages are 404 and private shells are noindex without public canonicals", async ({ request, page }) => {
  for (const path of ["/pagina-inexistente-seo", "/clases/disciplina-inexistente", "/profesores/docente-inexistente"]) {
    const response = await request.get(path, { headers: { "User-Agent": "Twitterbot" }, maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(await response.text()).toMatch(/name="robots" content="noindex/);
  }
  for (const path of ["/login", "/forgot-password", "/reset-password", "/admin", "/admin/payments", "/professor"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(200);
    await page.setContent(await response.text());
    expect(await page.locator('meta[name="robots"]').getAttribute("content"), path).toBe("noindex, nofollow");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
});

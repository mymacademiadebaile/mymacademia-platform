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
    const html = await response.text();
    expect(html).toMatch(/name="robots" content="noindex/);
    await page.setContent(html);
    // A 404 must not point search engines at the home page or claim to be indexable.
    await expect(page.locator('link[rel="canonical"]'), path).toHaveCount(0);
    await expect(page.locator('meta[property="og:url"]'), path).toHaveCount(0);
    for (const robots of await page.locator('meta[name="robots"]').evaluateAll((tags) => tags.map((tag) => tag.getAttribute("content"))))
      expect(robots, path).toMatch(/^noindex/);
    expect(await page.title(), path).toBe("Página no encontrada | M&M Academia de Baile");
  }
  for (const path of ["/login", "/forgot-password", "/reset-password", "/admin", "/admin/payments", "/professor"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(200);
    await page.setContent(await response.text());
    expect(await page.locator('meta[name="robots"]').getAttribute("content"), path).toBe("noindex, nofollow");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
});

const ALIAS = { Host: "mymacademia-platform.vercel.app" };
const technicalPaths = ["/login", "/forgot-password", "/reset-password?token=prueba", "/admin", "/admin/payments", "/professor", "/check-in"];

test("the Vercel alias moves public pages to www with method-preserving redirects", async ({ request }) => {
  for (const path of publicPaths) {
    for (const method of ["GET", "HEAD", "POST"] as const) {
      const response = await request.fetch(path, { method, headers: ALIAS, maxRedirects: 0 });
      // 308 keeps method and body; POST is not rewritten as GET.
      expect(response.status(), `${method} ${path}`).toBe(308);
      expect(response.headers().location, `${method} ${path}`).toBe(`${ORIGIN}${path}`);
    }
  }
  const tracked = await request.get("/clases/salsa-la-plata?utm_source=ig&fbclid=x", { headers: ALIAS, maxRedirects: 0 });
  expect(tracked.status()).toBe(308);
  expect(tracked.headers().location).toBe(`${ORIGIN}/clases/salsa-la-plata?utm_source=ig&fbclid=x`);
});

test("the Vercel alias keeps auth, backoffice, kiosk and crawl files in place, marked noindex", async ({ request }) => {
  for (const path of [...technicalPaths, "/robots.txt", "/sitemap.xml", "/mym-academia-logo.png"]) {
    const response = await request.get(path, { headers: ALIAS, maxRedirects: 0 });
    expect(response.status(), path).toBe(200);
    expect(response.headers().location, path).toBeUndefined();
    expect(response.headers()["x-robots-tag"], path).toBe("noindex");
  }
  // robots.txt must stay crawlable on the alias so Google can see the redirects.
  const robots = await request.get("/robots.txt", { headers: ALIAS });
  expect(await robots.text()).not.toMatch(/^Disallow: \/$/m);
  // Express owns /api on Vercel; the web service must never answer it with a redirect.
  for (const method of ["GET", "POST"] as const) {
    const api = await request.fetch("/api/auth/refresh", { method, headers: ALIAS, maxRedirects: 0 });
    expect(api.status(), method).not.toBe(308);
    expect(api.headers().location, method).toBeUndefined();
  }
});

test("the official host stays indexable and other hosts are noindex without redirects", async ({ request }) => {
  for (const path of publicPaths) {
    const response = await request.get(path, { headers: { Host: "www.mymacademiadebaile.com.ar" }, maxRedirects: 0 });
    expect(response.status(), path).toBe(200);
    expect(response.headers()["x-robots-tag"], path).toBeUndefined();
  }
  for (const host of ["mymacademia-platform-git-main-mym.vercel.app", "mymacademia-platform-abc123-mym.vercel.app"]) {
    for (const path of ["/", "/clases/salsa-la-plata", "/login"]) {
      const response = await request.get(path, { headers: { Host: host }, maxRedirects: 0 });
      expect(response.status(), `${host}${path}`).toBe(200);
      expect(response.headers()["x-robots-tag"], `${host}${path}`).toBe("noindex");
    }
  }
});

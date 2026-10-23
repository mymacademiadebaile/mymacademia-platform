import assert from "node:assert/strict";
import { describe, it } from "node:test";
import nextConfig from "../../../next.config.ts";
import { SITE } from "./site.ts";

// Next anchors host conditions this way (shared/lib/router/utils/prepare-destination).
const hostMatches = (pattern: string, host: string) => new RegExp(`^${pattern}$`).test(host);
const PUBLIC_PAGES = ["/", "/clases", "/clases/:slug", "/horarios", "/contacto", "/profesores", "/profesores/:slug"];

describe("duplicate host policy", () => {
  it("redirects only public pages of the Vercel production alias to the official origin", async () => {
    const redirects = await nextConfig.redirects!();
    assert.deepEqual(redirects.map((rule) => rule.source), PUBLIC_PAGES);
    for (const rule of redirects) {
      assert.equal(rule.permanent, true, rule.source);
      assert.equal(rule.destination, `${SITE.url}${rule.source}`);
      assert.equal(rule.missing, undefined);
      assert.equal(rule.has?.length, 1);
      const [host] = rule.has!;
      assert.equal(host.type, "host");
      assert.ok(hostMatches(host.value!, "mymacademia-platform.vercel.app"));
      for (const other of ["www.mymacademiadebaile.com.ar", "mymacademiadebaile.com.ar", "localhost",
        "mymacademia-platform-git-main-team.vercel.app", "mymacademia-platform-abc123-team.vercel.app",
        "evil-mymacademia-platform.vercel.app", "mymacademia-platform.vercel.app.evil.com"]) {
        assert.equal(hostMatches(host.value!, other), false, other);
      }
    }
  });

  it("never redirects technical, private or asset paths", async () => {
    const sources = (await nextConfig.redirects!()).map((rule) => rule.source);
    for (const prefix of ["/api", "/admin", "/professor", "/check-in", "/login", "/forgot-password", "/reset-password",
      "/_next", "/robots.txt", "/sitemap.xml", "/manifest", "/opengraph-image", "/:path"]) {
      assert.ok(sources.every((source) => source === "/" || !source.startsWith(prefix)), prefix);
    }
  });

  it("marks every response from a non-official host as noindex", async () => {
    const rules = (await nextConfig.headers!()).filter((rule) => rule.headers.some((header) => header.key === "X-Robots-Tag"));
    assert.equal(rules.length, 1);
    const [rule] = rules;
    assert.equal(rule.source, "/:path*");
    assert.deepEqual(rule.headers, [{ key: "X-Robots-Tag", value: "noindex" }]);
    assert.equal(rule.has, undefined);
    assert.equal(rule.missing?.length, 1);
    const [official] = rule.missing!;
    assert.equal(official.type, "host");
    assert.equal(`https://${official.value!.replaceAll("\\.", ".")}`, SITE.url);
    assert.ok(hostMatches(official.value!, "www.mymacademiadebaile.com.ar"));
    for (const other of ["mymacademia-platform.vercel.app", "mymacademia-platform-git-main-team.vercel.app",
      "mymacademiadebaile.com.ar", "localhost", "wwwxmymacademiadebaile.com.ar", "www.mymacademiadebaile.com.ar.evil.com"]) {
      assert.equal(hostMatches(official.value!, other), false, other);
    }
  });
});

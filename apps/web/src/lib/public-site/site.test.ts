import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";

it("keeps the official SEO origin independently of legacy environment values", () => {
  const moduleUrl = new URL("./site.ts", import.meta.url).href;
  for (const legacy of [undefined, "", "http://localhost:3000", "https://mymacademia-platform.vercel.app", "https://mymacademiadebaile.com.ar/"]) {
    const env = { ...process.env };
    if (legacy === undefined) delete env.NEXT_PUBLIC_SITE_URL;
    else env.NEXT_PUBLIC_SITE_URL = legacy;
    const result = execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { SITE, absoluteUrl, toAbsoluteUrl } from ${JSON.stringify(moduleUrl)};
      console.log(JSON.stringify([SITE.url, absoluteUrl(), absoluteUrl('clases/salsa-la-plata'),
        toAbsoluteUrl('/mym-academia-logo.png'), toAbsoluteUrl('https://res.cloudinary.com/demo/image.jpg')]));
    `], { env, encoding: "utf8" });
    assert.deepEqual(JSON.parse(result), [
      "https://www.mymacademiadebaile.com.ar",
      "https://www.mymacademiadebaile.com.ar/",
      "https://www.mymacademiadebaile.com.ar/clases/salsa-la-plata",
      "https://www.mymacademiadebaile.com.ar/mym-academia-logo.png",
      "https://res.cloudinary.com/demo/image.jpg"
    ]);
  }
});

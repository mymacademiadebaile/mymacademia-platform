import { describe, expect, it } from "vitest";
import { isTrustedAppOrigin } from "./app-origin";

const apex = "https://mymacademiadebaile.com.ar", www = "https://www.mymacademiadebaile.com.ar";
describe("trusted application origins", () => {
  it("accepts the canonical www and apex in either configured direction", () => {
    expect(isTrustedAppOrigin(www, apex)).toBe(true);
    expect(isTrustedAppOrigin(apex, www)).toBe(true);
    expect(isTrustedAppOrigin(www, `${apex}/`)).toBe(true);
  });
  it.each(["null", "https://example.invalid", "https://mymacademiadebaile.com.ar.example.invalid",
    "https://other.mymacademiadebaile.com.ar", "http://www.mymacademiadebaile.com.ar",
    "https://www.mymacademiadebaile.com.ar:444", `${www}/`, `${www}/check-in`, "https://user@www.mymacademiadebaile.com.ar"])("rejects the untrusted or malformed origin %s", (origin) => {
    expect(isTrustedAppOrigin(origin, apex)).toBe(false);
  });
  it("keeps development and unrelated configured hosts exact", () => {
    expect(isTrustedAppOrigin("http://127.0.0.1:3100", "http://127.0.0.1:3100")).toBe(true);
    expect(isTrustedAppOrigin("http://localhost:3100", "http://127.0.0.1:3100")).toBe(false);
    expect(isTrustedAppOrigin(www, "https://preview.example.test")).toBe(false);
    expect(isTrustedAppOrigin("https://www.example.test", "https://example.test")).toBe(false);
    expect(isTrustedAppOrigin(apex, "invalid")).toBe(false);
  });
});

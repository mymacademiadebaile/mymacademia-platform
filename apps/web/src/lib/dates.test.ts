import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { argentinaDateOf, formatDateOnly } from "./dates.ts";

describe("argentinaDateOf", () => {
  it("keeps a 21:00 class on its Argentine day (the instant is already the next day in UTC)", () => {
    // 2026-11-04 21:00 in Buenos Aires (UTC-3) is stored as 2026-11-05T00:00Z.
    assert.equal(argentinaDateOf("2026-11-05T00:00:00.000Z"), "2026-11-04");
  });

  it("returns the same day for daytime instants", () => {
    assert.equal(argentinaDateOf("2026-11-04T15:00:00.000Z"), "2026-11-04");
  });
});

describe("formatDateOnly", () => {
  it("formats plain dates (promotions, due dates) as dd/mm/aaaa", () => {
    assert.equal(formatDateOnly("2026-11-30"), "30/11/2026");
  });
});

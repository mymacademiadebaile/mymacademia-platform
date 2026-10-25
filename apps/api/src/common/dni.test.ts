import { describe, expect, it } from "vitest";
import { dniSchema, optionalDniSchema } from "./dni";

describe("DNI normalization", () => {
  it("matches the same document with dots, spaces or leading zeroes", () => {
    expect(dniSchema.parse(" 32.456.789 ")).toBe("32456789");
    expect(dniSchema.parse("00 1 234 567")).toBe("1234567");
  });
  it("allows clearing an optional profile field but not an attendance credential", () => {
    expect(optionalDniSchema.parse(" ")).toBeUndefined();
    expect(dniSchema.safeParse("").success).toBe(false);
  });
  it.each(["123", "1234567890", "32ABC456", "00000000", { $ne: null }])("rejects invalid or structured input %j", (value) => {
    expect(dniSchema.safeParse(value).success).toBe(false);
  });
});

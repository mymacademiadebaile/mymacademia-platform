import { describe, expect, it } from "vitest";
import { resolveChargeDates } from "./payment-charge";

describe("resolveChargeDates", () => {
  it("PER_CLASS stores the class day at 12:00Z and derives the period", () => {
    const result = resolveChargeDates({ paymentType: "PER_CLASS", classDate: "2026-09-29" });

    expect(result.classDate?.toISOString()).toBe("2026-09-29T12:00:00.000Z");
    expect(result.classDateKey).toBe("2026-09-29");
    expect(result.period).toBe("2026-09");
  });

  it("PER_CLASS tolerates a period that matches the class day", () => {
    expect(
      resolveChargeDates({ paymentType: "PER_CLASS", classDate: "2026-09-29", period: "2026-09" }).period
    ).toBe("2026-09");
  });

  it("PER_CLASS rejects a period that does not match the class day", () => {
    expect(() =>
      resolveChargeDates({ paymentType: "PER_CLASS", classDate: "2026-09-29", period: "2026-10" })
    ).toThrow(expect.objectContaining({ statusCode: 422, code: "INVALID_PERIOD" }));
  });

  it.each([undefined, "2026-02-31", "2026-13-01", "2026-00-10"])(
    "PER_CLASS rejects the invalid class date %s",
    (classDate) => {
      expect(() => resolveChargeDates({ paymentType: "PER_CLASS", classDate })).toThrow(
        expect.objectContaining({ statusCode: 422, code: "INVALID_CLASS_DATE" })
      );
    }
  );

  it("MONTHLY uses the period and has no class date", () => {
    expect(resolveChargeDates({ paymentType: "MONTHLY", period: "2026-09" })).toEqual({
      classDate: undefined,
      classDateKey: undefined,
      period: "2026-09"
    });
  });

  it("MONTHLY requires a period", () => {
    expect(() => resolveChargeDates({ paymentType: "MONTHLY" })).toThrow(
      expect.objectContaining({ statusCode: 422, code: "INVALID_PERIOD" })
    );
  });
});

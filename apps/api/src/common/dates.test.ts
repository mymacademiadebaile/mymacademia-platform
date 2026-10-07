import { describe, expect, it } from "vitest";
import {
  academyDayBounds,
  academyInstant,
  academyNow,
  addMonths,
  calendarDateToDate,
  classDateKey,
  daysBetween,
  isCalendarDate,
  isPastCalendarDay,
  overdueCutoff,
  periodBounds,
  toDateOnly,
  toReceivedAt
} from "./dates";
import { escapeRegex } from "./regex";

// 2026-10-31 22:30 in Argentina (UTC-3) is already November 1st in UTC.
const LATE_NIGHT = new Date("2026-11-01T01:30:00.000Z");

describe("Argentina calendar helpers", () => {
  it("reads the local day, not the UTC day", () => {
    expect(academyNow(LATE_NIGHT)).toEqual({ date: "2026-10-31", time: "22:30" });
  });

  it("builds local instants and day bounds", () => {
    expect(academyInstant("2026-10-07", "19:00").toISOString()).toBe("2026-10-07T22:00:00.000Z");
    const bounds = academyDayBounds("2026-10-31");
    expect(bounds.start.toISOString()).toBe("2026-10-31T03:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(LATE_NIGHT >= bounds.start && LATE_NIGHT < bounds.end).toBe(true);
  });

  it("validates calendar dates", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-2-1")).toBe(false);
  });

  it("computes periods and day differences", () => {
    expect(periodBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
  });

  it("does not mark a charge due today as overdue", () => {
    const now = new Date("2026-10-10T23:00:00.000Z"); // 20:00 local, Oct 10th
    expect(isPastCalendarDay(calendarDateToDate("2026-10-10"), now)).toBe(false);
    expect(isPastCalendarDay(calendarDateToDate("2026-10-09"), now)).toBe(true);
    // Legacy values stored at 00:00Z still mean their own calendar day.
    expect(isPastCalendarDay(new Date("2026-10-10T00:00:00.000Z"), now)).toBe(false);
    expect(overdueCutoff(now).toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });

  it("normalizes typed dates", () => {
    expect(classDateKey(toDateOnly("2026-10-10"))).toBe("2026-10-10");
    expect(classDateKey(toDateOnly(LATE_NIGHT))).toBe("2026-10-31");
    expect(toReceivedAt("2026-10-31", LATE_NIGHT)).toBe(LATE_NIGHT);
    expect(toReceivedAt("2026-10-20", LATE_NIGHT).toISOString()).toBe("2026-10-20T15:00:00.000Z");
  });
});

describe("escapeRegex", () => {
  it("matches user input literally", () => {
    const pattern = new RegExp(escapeRegex("(ana)+.*"), "i");
    expect(pattern.test("x (ANA)+.* y")).toBe(true);
    expect(pattern.test("anaana")).toBe(false);
  });
});

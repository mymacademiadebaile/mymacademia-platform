import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupByClass, groupByDay, resolveSchedule, upcomingFromSchedule, zonedNow } from "./schedule-utils.ts";
import type { DanceStyle, PublicClass, PublicProfessor, PublicScheduleSlot } from "./types.ts";

const TZ = "America/Argentina/Buenos_Aires";

const styles = [
  { slug: "bachata-sensual", seoSlug: "bachata-sensual-la-plata", name: "Bachata Sensual" }
] as DanceStyle[];
const professors = [{ slug: "ana", displayName: "Ana" }] as PublicProfessor[];
const classes: PublicClass[] = [
  { id: "c1", name: "Bachata Sensual", styleSlug: "bachata-sensual", professorSlugs: ["ana", "ghost"], levels: ["Inicial"], branchId: "b" },
  { id: "orphan", name: "Sin estilo", styleSlug: "missing", professorSlugs: [], levels: [], branchId: "b" }
];
const slots: PublicScheduleSlot[] = [
  { id: "s3", classId: "c1", day: "WEDNESDAY", startTime: "19:00", endTime: "20:00" },
  { id: "s1", classId: "c1", day: "MONDAY", startTime: "20:00", endTime: "21:00" },
  { id: "s2", classId: "c1", day: "MONDAY", startTime: "18:00", endTime: "19:00" },
  { id: "s4", classId: "orphan", day: "TUESDAY", startTime: "18:00", endTime: "19:00" }
];

describe("resolveSchedule", () => {
  it("sorts by weekday and time, drops unknown classes and professors", () => {
    const entries = resolveSchedule(slots, classes, styles, professors);
    assert.deepEqual(
      entries.map((entry) => entry.slotId),
      ["s2", "s1", "s3"]
    );
    assert.deepEqual(entries[0].professors, [{ slug: "ana", displayName: "Ana" }]);
  });

  it("groups entries per requested day, keeping empty days", () => {
    const grouped = groupByDay(resolveSchedule(slots, classes, styles, professors), ["MONDAY", "TUESDAY"]);
    assert.equal(grouped[0].entries.length, 2);
    assert.equal(grouped[1].entries.length, 0);
  });
});

describe("upcomingFromSchedule", () => {
  const entries = resolveSchedule(slots, classes, styles, professors);

  it("uses academy local time, not UTC", () => {
    // 2026-09-28 is a Monday. 23:30 UTC = 20:30 in Buenos Aires (UTC-3).
    const now = new Date("2026-09-28T23:30:00Z");
    assert.deepEqual(zonedNow(now, TZ), { day: "MONDAY", date: "2026-09-28", time: "20:30" });
  });

  it("keeps a class listed until it ends and continues on the next days", () => {
    const now = new Date("2026-09-28T23:30:00Z"); // Monday 20:30 local
    const upcoming = upcomingFromSchedule(entries, now, TZ, 3);
    assert.deepEqual(
      upcoming.map((item) => [item.entry.slotId, item.date, item.daysFromToday]),
      [
        ["s1", "2026-09-28", 0],
        ["s3", "2026-09-30", 2],
        ["s2", "2026-10-05", 7]
      ]
    );
  });

  it("returns nothing for an empty schedule", () => {
    assert.deepEqual(upcomingFromSchedule([], new Date(), TZ), []);
  });
});

describe("groupByClass", () => {
  it("collects the weekly slots of each class in week order", () => {
    const groups = groupByClass(resolveSchedule(slots, classes, styles, professors));

    assert.equal(groups.length, 1);
    assert.equal(groups[0].classId, "c1");
    assert.deepEqual(
      groups[0].slots.map((slot) => [slot.day, slot.startTime]),
      [
        ["MONDAY", "18:00"],
        ["MONDAY", "20:00"],
        ["WEDNESDAY", "19:00"]
      ]
    );
    assert.deepEqual(groups[0].professors, [{ slug: "ana", displayName: "Ana" }]);
  });

  it("returns nothing for an empty schedule", () => {
    assert.deepEqual(groupByClass([]), []);
  });
});

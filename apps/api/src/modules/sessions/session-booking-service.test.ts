import { describe, expect, it } from "vitest";
import { enrollmentMatchesSession, scheduleKey } from "./session-booking-service";

const tuesdayAt18 = { day: "TUESDAY", startTime: "18:00", endTime: "19:00" };
const tuesdayAt20 = { day: "TUESDAY", startTime: "20:00", endTime: "21:00" };
const sessionAt18 = { sessionDate: "2026-09-29", startTime: "18:00", endTime: "19:00" };

describe("session booking schedule selection", () => {
  it("matches only the selected recurring slot", () => {
    expect(enrollmentMatchesSession({ scheduleKeys: [scheduleKey(tuesdayAt18)] }, sessionAt18)).toBe(true);
    expect(enrollmentMatchesSession({ scheduleKeys: [scheduleKey(tuesdayAt20)] }, sessionAt18)).toBe(false);
  });

  it("keeps legacy enrollments in every slot until they are explicitly configured", () => {
    expect(enrollmentMatchesSession({ scheduleKeys: [] }, sessionAt18)).toBe(true);
    expect(enrollmentMatchesSession({}, sessionAt18)).toBe(true);
  });
});

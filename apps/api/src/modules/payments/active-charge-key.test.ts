import { describe, expect, it } from "vitest";
import { activeChargeKeyOf, buildActiveChargeKey, occupiesChargeIdentity } from "./active-charge-key";

const student = "64b000000000000000000001";
const danceClass = "64b000000000000000000002";

describe("buildActiveChargeKey", () => {
  it("PER_CLASS uses the class day", () => {
    expect(
      buildActiveChargeKey({ paymentType: "PER_CLASS", studentId: student, classId: danceClass, classDay: "2026-09-29" })
    ).toBe(`PER_CLASS:${student}:${danceClass}:2026-09-29`);
  });

  it("MONTHLY uses the period", () => {
    expect(
      buildActiveChargeKey({ paymentType: "MONTHLY", studentId: student, classId: danceClass, period: "2026-09" })
    ).toBe(`MONTHLY:${student}:${danceClass}:2026-09`);
  });

  it("different class days give different keys", () => {
    const key = (classDay: string) =>
      buildActiveChargeKey({ paymentType: "PER_CLASS", studentId: student, classId: danceClass, classDay });

    expect(key("2026-09-29")).not.toBe(key("2026-09-30"));
  });

  it("uses the concrete session when a per-class charge identifies one", () => {
    const firstSession = "64b000000000000000000003";
    const secondSession = "64b000000000000000000004";
    expect(buildActiveChargeKey({ paymentType: "PER_CLASS", studentId: student, classId: danceClass, sessionId: firstSession }))
      .not.toBe(buildActiveChargeKey({ paymentType: "PER_CLASS", studentId: student, classId: danceClass, sessionId: secondSession }));
  });

  it("different periods give different keys", () => {
    const key = (period: string) =>
      buildActiveChargeKey({ paymentType: "MONTHLY", studentId: student, classId: danceClass, period });

    expect(key("2026-09")).not.toBe(key("2026-10"));
  });

  it("the same period and class day never collide across payment types", () => {
    const perClass = buildActiveChargeKey({
      paymentType: "PER_CLASS",
      studentId: student,
      classId: danceClass,
      classDay: "2026-09-29",
      period: "2026-09"
    });
    const monthly = buildActiveChargeKey({
      paymentType: "MONTHLY",
      studentId: student,
      classId: danceClass,
      classDay: "2026-09-29",
      period: "2026-09"
    });

    expect(perClass).not.toBe(monthly);
  });

  it("does not depend on the free-text concept (it is not even an input)", () => {
    const base = { paymentType: "MONTHLY", studentId: student, classId: danceClass, period: "2026-09" } as const;

    expect(buildActiveChargeKey({ ...base })).toBe(buildActiveChargeKey({ ...base, concept: "otro" } as never));
  });

  it.each([
    [{ paymentType: "PER_CLASS", classDay: undefined }],
    [{ paymentType: "PER_CLASS", classDay: "29/09/2026" }],
    [{ paymentType: "MONTHLY", period: undefined }],
    [{ paymentType: "MONTHLY", period: "2026-13" }],
    [{ paymentType: "MONTHLY", period: "2026-9" }]
  ] as const)("returns undefined for an unusable identity %j", (input) => {
    expect(buildActiveChargeKey({ studentId: student, classId: danceClass, ...input })).toBeUndefined();
  });

  it("returns undefined without a class or student", () => {
    expect(buildActiveChargeKey({ paymentType: "MONTHLY", studentId: student, period: "2026-09" })).toBeUndefined();
    expect(buildActiveChargeKey({ paymentType: "MONTHLY", classId: danceClass, period: "2026-09" })).toBeUndefined();
  });
});

describe("activeChargeKeyOf", () => {
  const payment = { paymentType: "PER_CLASS", studentId: student, classId: danceClass, period: "2026-09" } as const;

  it("uses the logical UTC day, so legacy hours of the same day share a key", () => {
    const midnight = activeChargeKeyOf({ ...payment, classDate: new Date("2026-09-29T00:00:00.000Z") });
    const noon = activeChargeKeyOf({ ...payment, classDate: new Date("2026-09-29T12:00:00.000Z") });
    const late = activeChargeKeyOf({ ...payment, classDate: new Date("2026-09-29T23:59:59.000Z") });

    expect(midnight).toBe(noon);
    expect(noon).toBe(late);
    expect(noon).toBe(`PER_CLASS:${student}:${danceClass}:2026-09-29`);
  });

  it("CANCELLED releases the identity; PENDING, PAID and OVERDUE keep it", () => {
    const classDate = new Date("2026-09-29T12:00:00.000Z");

    expect(activeChargeKeyOf({ ...payment, classDate, status: "CANCELLED" })).toBeUndefined();
    for (const status of ["PENDING", "PAID", "OVERDUE"]) {
      expect(activeChargeKeyOf({ ...payment, classDate, status })).toBeDefined();
      expect(occupiesChargeIdentity(status)).toBe(true);
    }
    expect(occupiesChargeIdentity("CANCELLED")).toBe(false);
  });

  it("returns undefined for an invalid classDate", () => {
    expect(activeChargeKeyOf({ ...payment, classDate: new Date("nope") })).toBeUndefined();
    expect(activeChargeKeyOf({ ...payment })).toBeUndefined();
  });
});

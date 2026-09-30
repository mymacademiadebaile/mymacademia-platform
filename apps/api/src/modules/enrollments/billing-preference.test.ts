import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import {
  enrollmentActivationUpdate,
  enrollmentReconciliation,
  resolveBillingPreference
} from "./billing-preference";

describe("resolveBillingPreference", () => {
  describe("PER_CLASS", () => {
    it("returns PER_CLASS without a preference", () => {
      expect(resolveBillingPreference("PER_CLASS")).toBe("PER_CLASS");
    });

    it("ignores a previous MONTHLY preference", () => {
      expect(resolveBillingPreference("PER_CLASS", undefined, "MONTHLY")).toBe("PER_CLASS");
    });

    it("accepts an explicit PER_CLASS request", () => {
      expect(resolveBillingPreference("PER_CLASS", "PER_CLASS")).toBe("PER_CLASS");
    });

    it("rejects an explicit MONTHLY request", () => {
      expect(() => resolveBillingPreference("PER_CLASS", "MONTHLY")).toThrow(
        "La modalidad de cobro seleccionada no es válida para esta clase."
      );
    });
  });

  describe("MONTHLY", () => {
    it("returns MONTHLY without a preference", () => {
      expect(resolveBillingPreference("MONTHLY")).toBe("MONTHLY");
    });

    it("ignores a previous PER_CLASS preference", () => {
      expect(resolveBillingPreference("MONTHLY", undefined, "PER_CLASS")).toBe("MONTHLY");
    });

    it("rejects an explicit PER_CLASS request", () => {
      expect(() => resolveBillingPreference("MONTHLY", "PER_CLASS")).toThrow(
        expect.objectContaining({ statusCode: 422, code: "INVALID_BILLING_PREFERENCE" })
      );
    });
  });

  describe("FREE", () => {
    it.each(["PER_CLASS", "MONTHLY"] as const)("drops a previous %s preference", (previous) => {
      expect(resolveBillingPreference("FREE", undefined, previous)).toBeUndefined();
    });

    it("returns no preference even if one is requested", () => {
      expect(resolveBillingPreference("FREE", "MONTHLY")).toBeUndefined();
    });
  });

  describe("BOTH", () => {
    it.each(["PER_CLASS", "MONTHLY"] as const)("uses the requested %s", (requested) => {
      expect(resolveBillingPreference("BOTH", requested)).toBe(requested);
    });

    it("prefers the request over the previous preference", () => {
      expect(resolveBillingPreference("BOTH", "PER_CLASS", "MONTHLY")).toBe("PER_CLASS");
    });

    it.each(["PER_CLASS", "MONTHLY"] as const)("keeps a previous %s", (previous) => {
      expect(resolveBillingPreference("BOTH", undefined, previous)).toBe(previous);
    });

    it("defaults to PER_CLASS without request or previous", () => {
      expect(resolveBillingPreference("BOTH")).toBe("PER_CLASS");
      expect(resolveBillingPreference("BOTH", undefined, null)).toBe("PER_CLASS");
    });
  });
});

describe("enrollmentActivationUpdate", () => {
  const branchId = new Types.ObjectId();

  it("sets the preference and always unsets endedAt", () => {
    const update = enrollmentActivationUpdate({ branchId, billingPreference: "MONTHLY" });

    expect(update.$set).toMatchObject({ branchId, status: "ACTIVE", billingPreference: "MONTHLY" });
    expect(update.$unset).toEqual({ endedAt: 1 });
  });

  it("unsets the preference when there is none (FREE)", () => {
    const update = enrollmentActivationUpdate({ branchId });

    expect(update.$set).not.toHaveProperty("billingPreference");
    expect(update.$unset).toEqual({ endedAt: 1, billingPreference: 1 });
  });
});

describe("enrollmentReconciliation", () => {
  it.each(["PER_CLASS", "MONTHLY"] as const)("%s sets enrollments that differ to that mode", (mode) => {
    expect(enrollmentReconciliation(mode)).toEqual({
      filter: { billingPreference: { $ne: mode } },
      update: { $set: { billingPreference: mode } }
    });
  });

  it("FREE unsets the preference only where it exists", () => {
    expect(enrollmentReconciliation("FREE")).toEqual({
      filter: { billingPreference: { $exists: true } },
      update: { $unset: { billingPreference: 1 } }
    });
  });

  it("BOTH only touches missing or invalid preferences and defaults to PER_CLASS", () => {
    expect(enrollmentReconciliation("BOTH")).toEqual({
      filter: { billingPreference: { $nin: ["PER_CLASS", "MONTHLY"] } },
      update: { $set: { billingPreference: "PER_CLASS" } }
    });
  });
});

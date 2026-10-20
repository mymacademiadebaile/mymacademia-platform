import { describe, expect, it } from "vitest";
import { priceCents } from "../billing/charge-service";
import { availableMonthlyPlans, resolveMonthlyPlan } from "./monthly-plans";

describe("monthly plans", () => {
  it("offers only configured prices and selects the sole available plan", () => {
    const onlyEight = { monthlyPrice: 50000, monthlyPrice8: 50000 };
    expect(availableMonthlyPlans(onlyEight)).toEqual([8]);
    expect(resolveMonthlyPlan(onlyEight)).toBe(8);
    expect(() => resolveMonthlyPlan(onlyEight, 4)).toThrow("no ofrece el plan mensual de 4 clases");
    expect(priceCents(onlyEight, {}, "MONTHLY_FEE")).toBe(5_000_000);
    expect(() => priceCents(onlyEight, { monthlyPlan: 4 }, "MONTHLY_FEE")).toThrow("no ofrece el plan mensual de 4 clases");
  });

  it("uses the student's choice when both plans exist", () => {
    const prices = { monthlyPrice: 28000, monthlyPrice4: 28000, monthlyPrice8: 50000 };
    expect(availableMonthlyPlans(prices)).toEqual([4, 8]);
    expect(priceCents(prices, { monthlyPlan: 4 }, "MONTHLY_FEE")).toBe(2_800_000);
    expect(priceCents(prices, { monthlyPlan: 8 }, "MONTHLY_FEE")).toBe(5_000_000);
  });
});

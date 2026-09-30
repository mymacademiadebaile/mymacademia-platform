import { describe, expect, it } from "vitest";
import { resolveSessionPaymentCoverage, type CoveragePayment } from "./session-service";

const FUTURE = new Date("2099-01-01T12:00:00.000Z");
const PAST = new Date("2020-01-01T12:00:00.000Z");

let counter = 0;
function payment(
  paymentType: "PER_CLASS" | "MONTHLY",
  status: "PAID" | "PENDING" | "OVERDUE" | "CANCELLED",
  extra: Partial<CoveragePayment> = {}
): CoveragePayment {
  return { _id: `id-${++counter}`, paymentType, status, dueDate: FUTURE, ...extra };
}

describe("resolveSessionPaymentCoverage", () => {
  it("FREE never owes and exposes no payment, even with legacy payments", () => {
    const result = resolveSessionPaymentCoverage("FREE", [payment("PER_CLASS", "PAID")]);

    expect(result).toEqual({ status: "FREE", payment: null, paymentType: null });
  });

  it("returns NONE without payments", () => {
    expect(resolveSessionPaymentCoverage("MONTHLY", [])).toEqual({
      status: "NONE",
      payment: null,
      paymentType: null
    });
  });

  it("is covered by a payment of the other type", () => {
    const perClass = payment("PER_CLASS", "PAID");

    const result = resolveSessionPaymentCoverage("MONTHLY", [perClass]);

    expect(result).toMatchObject({ status: "PAID", payment: perClass, paymentType: "PER_CLASS" });
  });

  it("CANCELLED payments never cover", () => {
    expect(resolveSessionPaymentCoverage("PER_CLASS", [payment("PER_CLASS", "CANCELLED")]).status).toBe(
      "NONE"
    );
  });

  it("ignores a cancelled payment and uses the valid one", () => {
    const monthly = payment("MONTHLY", "PAID");

    const result = resolveSessionPaymentCoverage("PER_CLASS", [
      payment("PER_CLASS", "CANCELLED"),
      monthly
    ]);

    expect(result).toMatchObject({ status: "PAID", payment: monthly, paymentType: "MONTHLY" });
  });

  it("prioritizes PAID > OVERDUE > PENDING", () => {
    const paid = payment("MONTHLY", "PAID");
    const overdue = payment("PER_CLASS", "PENDING", { dueDate: PAST });
    const pending = payment("PER_CLASS", "PENDING");

    expect(resolveSessionPaymentCoverage("PER_CLASS", [pending, overdue, paid]).payment).toBe(paid);
    expect(resolveSessionPaymentCoverage("PER_CLASS", [pending, overdue]).payment).toBe(overdue);
    expect(resolveSessionPaymentCoverage("PER_CLASS", [pending, overdue]).status).toBe("OVERDUE");
    expect(resolveSessionPaymentCoverage("PER_CLASS", [pending]).status).toBe("PENDING");
  });

  it("treats a persisted OVERDUE like an overdue pending payment", () => {
    expect(resolveSessionPaymentCoverage("MONTHLY", [payment("MONTHLY", "OVERDUE")]).status).toBe(
      "OVERDUE"
    );
  });

  describe("ties", () => {
    it("prefers the payment of the current billing type", () => {
      const perClass = payment("PER_CLASS", "PAID", { createdAt: new Date("2026-09-06") });
      const monthly = payment("MONTHLY", "PAID", { createdAt: new Date("2026-09-01") });

      expect(resolveSessionPaymentCoverage("MONTHLY", [perClass, monthly]).payment).toBe(monthly);
      expect(resolveSessionPaymentCoverage("PER_CLASS", [monthly, perClass]).payment).toBe(perClass);
    });

    it("then the most recent one, regardless of input order", () => {
      const older = payment("MONTHLY", "PAID", { createdAt: new Date("2026-09-01") });
      const newer = payment("MONTHLY", "PAID", { createdAt: new Date("2026-09-09") });

      expect(resolveSessionPaymentCoverage("MONTHLY", [older, newer]).payment).toBe(newer);
      expect(resolveSessionPaymentCoverage("MONTHLY", [newer, older]).payment).toBe(newer);
    });

    it("finally the highest _id so the result is stable", () => {
      const a = payment("MONTHLY", "PAID", { _id: "aaa" });
      const b = payment("MONTHLY", "PAID", { _id: "bbb" });

      expect(resolveSessionPaymentCoverage("MONTHLY", [a, b]).payment).toBe(b);
      expect(resolveSessionPaymentCoverage("MONTHLY", [b, a]).payment).toBe(b);
    });
  });
});
